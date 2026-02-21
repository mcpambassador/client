/**
 * @mcpambassador/client
 *
 * Ambassador Client - Lightweight HTTP/MCP proxy for developer workstations.
 *
 * Connects to Ambassador Server and registers as an MCP server with the host app (VS Code, Claude Desktop, etc.).
 * Relays tool calls from the host app to the Ambassador Server.
 *
 * @see Architecture §3.1 Registration
 * @see Architecture §17 Client Resilience & Tool Catalog Caching
 */

import https from 'https';
import { IncomingMessage } from 'http';
import { hostname } from 'os';
import type {
  RegistrationRequest,
  RegistrationResponse,
  ToolCatalogResponse,
  ToolInvocationRequest,
  ToolInvocationResponse,
  ToolDescriptor,
} from './protocol-types.js';

/**
 * Custom HTTP error class with structured error information
 * Finding 1: Properly parse server error responses
 */
class HttpError extends Error {
  constructor(
    public statusCode: number,
    public errorCode: string,
    public errorMessage: string,
    public rawBody: string
  ) {
    super(`HTTP ${statusCode}: ${errorMessage}`);
    this.name = 'HttpError';
  }
}

/**
 * Mask sensitive secrets in logs
 * Finding 3: Never log session tokens or preshared keys
 * SEC-M16-F3: Reduced fallback exposure from 11 to 4 characters
 */
function maskSecret(value: string): string {
  if (value.startsWith('amb_pk_')) {
    // Preshared key: show prefix + first 4 chars
    return `amb_pk_${value.slice(7, 11)}****`;
  } else if (value.startsWith('amb_st_')) {
    // Session token: show prefix only
    return 'amb_st_****';
  }
  // SEC-M16-F3: Fallback for non-prefixed secrets - show at most 4 chars (first 2 + last 2)
  if (value.length <= 4) {
    return '****';
  }
  return `${value.slice(0, 2)}...${value.slice(-2)}`;
}

/**
 * Ambassador Client configuration
 */
export interface ClientConfig {
  /** Ambassador Server URL (e.g., https://ambassador.internal:8443) */
  server_url: string;
  /** Preshared key for authentication (REQUIRED) */
  preshared_key: string;
  /** Friendly name for this client (default: hostname) */
  friendly_name?: string;
  /** Host tool identifier (default: 'vscode') */
  host_tool?: string;
  /** Heartbeat interval in seconds (default: 60) */
  heartbeat_interval_seconds?: number;
  /** Tool catalog cache TTL in seconds (default: 300) */
  cache_ttl_seconds?: number;
  /** Disable in-memory tool catalog cache entirely */
  disable_cache?: boolean;
  /** Allow self-signed certificates (for dev/test only) */
  allow_self_signed?: boolean;
}

/**
 * Tool catalog cache entry
 */
interface CachedCatalog {
  tools: ToolDescriptor[];
  cached_at: number;
  ttl_seconds: number;
}

/**
 * Ambassador Client main class
 *
 * M6.6: stdio-based MCP server that proxies to Ambassador Server
 */
export class AmbassadorClient {
  // F-SEC-M6.6-002: Buffer size limits to prevent OOM
  private static readonly MAX_BUFFER_SIZE = 10 * 1024 * 1024; // 10MB
  private static readonly MAX_MESSAGE_SIZE = 1 * 1024 * 1024; // 1MB

  private toolCatalogCache: CachedCatalog | null = null;
  private isRunning = false;

  // Session state (ephemeral - never persisted to disk)
  private sessionId: string | null = null;
  private sessionToken: string | null = null;
  private connectionId: string | null = null;
  private expiresAt: string | null = null;
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private isReregistering = false;

  constructor(private config: ClientConfig) {
    // Validate required fields
    if (!config.preshared_key) {
      throw new Error('preshared_key is required');
    }

    // SEC-M16-F2: Validate server_url scheme (require HTTPS except for localhost)
    try {
      const url = new URL(config.server_url);
      const isLocalhost = url.hostname === 'localhost' || url.hostname === '127.0.0.1';
      
      if (url.protocol === 'http:' && !isLocalhost) {
        console.warn(
          `[client] WARNING: Using insecure HTTP for non-localhost URL (${config.server_url}). ` +
          `HTTPS is strongly recommended for production environments.`
        );
      } else if (url.protocol !== 'https:' && url.protocol !== 'http:') {
        throw new Error(`Invalid URL scheme: ${url.protocol}. Only 'https:' (or 'http:' for localhost) is allowed.`);
      }
    } catch (error) {
      if (error instanceof TypeError) {
        throw new Error(`Invalid server_url: ${config.server_url}`);
      }
      throw error;
    }

    // Set defaults
    this.config.friendly_name = config.friendly_name || hostname();
    this.config.host_tool = config.host_tool || 'vscode';
    
    // SEC-M16-F4: Bound heartbeat_interval_seconds (min: 5s, max: 300s)
    const MIN_HEARTBEAT = 5;
    const MAX_HEARTBEAT = 300;
    const DEFAULT_HEARTBEAT = 60;
    let heartbeat = config.heartbeat_interval_seconds ?? DEFAULT_HEARTBEAT;
    
    if (heartbeat < MIN_HEARTBEAT) {
      console.warn(
        `[client] heartbeat_interval_seconds (${heartbeat}s) is below minimum (${MIN_HEARTBEAT}s). ` +
        `Clamping to ${MIN_HEARTBEAT}s.`
      );
      heartbeat = MIN_HEARTBEAT;
    } else if (heartbeat > MAX_HEARTBEAT) {
      console.warn(
        `[client] heartbeat_interval_seconds (${heartbeat}s) exceeds maximum (${MAX_HEARTBEAT}s). ` +
        `Clamping to ${MAX_HEARTBEAT}s.`
      );
      heartbeat = MAX_HEARTBEAT;
    }
    this.config.heartbeat_interval_seconds = heartbeat;
    
    // Reduce cache TTL from 300s to 60s for faster subscription change propagation
    // Use nullish coalescing so 0 is respected (cache disable use-case)
    const cacheTtl = config.cache_ttl_seconds ?? 60;
    this.config.cache_ttl_seconds = Math.max(0, cacheTtl);
    this.config.disable_cache = config.disable_cache ?? false;
    this.config.allow_self_signed = config.allow_self_signed ?? false;
  }

  /**
   * Register with Ambassador Server to obtain ephemeral session
   *
   * @returns Registration response with session credentials
   */
  async register(): Promise<RegistrationResponse> {
    // Stop any existing heartbeat timer
    this.stopHeartbeat();

    // Security: Mask preshared key in logs
    const maskedKey = maskSecret(this.config.preshared_key);
    console.info(`[client] Registering with preshared key: ${maskedKey}`);

    const request: RegistrationRequest = {
      preshared_key: this.config.preshared_key,
      friendly_name: this.config.friendly_name!,
      host_tool: this.config.host_tool! as any,
    };

    try {
      const response = await this.httpRequest<RegistrationResponse>(
        'POST',
        '/v1/sessions/register',
        request,
        false // No auth for registration
      );

      // Store ephemeral session credentials (memory only)
      this.sessionId = response.session_id;
      this.sessionToken = response.session_token;
      this.connectionId = response.connection_id;
      this.expiresAt = response.expires_at;

      // Invalidate cached catalog on (re)registration to avoid stale tools
      // when server-side subscriptions/profile bindings changed.
      this.toolCatalogCache = null;

      console.info(`[client] Session registered: ${response.session_id}`);
      console.info(`[client] Connection ID: ${response.connection_id}`);
      console.info(`[client] Profile ID: ${response.profile_id}`);
      console.info(`[client] Expires at: ${response.expires_at}`);

      // Start heartbeat timer
      this.startHeartbeat();

      return response;
    } catch (error) {
      console.error('[client] Registration failed:', error);
      throw error;
    }
  }

  /**
   * Fetch tool catalog from server
   *
   * @returns Tool catalog (cached for cache_ttl_seconds)
   */
  async getToolCatalog(): Promise<ToolCatalogResponse> {
    const cachingDisabled = this.config.disable_cache || this.config.cache_ttl_seconds === 0;

    // Check cache
    if (!cachingDisabled && this.toolCatalogCache) {
      const age = Date.now() - this.toolCatalogCache.cached_at;
      if (age < this.toolCatalogCache.ttl_seconds * 1000) {
        console.debug(`[client] Using cached tool catalog (age: ${Math.floor(age / 1000)}s)`);
        return {
          tools: this.toolCatalogCache.tools,
          api_version: '1.0',
          timestamp: new Date().toISOString(),
        };
      }
    }

    console.info('[client] Fetching tool catalog from server...');

    try {
      const response = await this.httpRequest<ToolCatalogResponse>('GET', '/v1/tools');

      // Update cache (unless explicitly disabled)
      if (!cachingDisabled) {
        this.toolCatalogCache = {
          tools: response.tools,
          cached_at: Date.now(),
          ttl_seconds: this.config.cache_ttl_seconds!,
        };
      }

      console.info(`[client] Fetched ${response.tools.length} tools`);

      return response;
    } catch (error) {
      console.error('[client] Failed to fetch tool catalog:', error);

      // Graceful degradation: return stale cache if available
      if (this.toolCatalogCache) {
        console.warn('[client] Using stale cache due to fetch failure');
        return {
          tools: this.toolCatalogCache.tools,
          api_version: '1.0',
          timestamp: new Date().toISOString(),
        };
      }

      throw error;
    }
  }

  /**
   * Invoke a tool via the Ambassador Server
   *
   * @param request Tool invocation request
   * @returns Tool invocation response
   */
  async invokeTool(request: ToolInvocationRequest): Promise<ToolInvocationResponse> {
    console.debug(`[client] Invoking tool: ${request.tool}`);

    try {
      const response = await this.httpRequest<ToolInvocationResponse>(
        'POST',
        '/v1/tools/invoke',
        request
      );

      console.debug(`[client] Tool invocation successful: ${request.tool}`);

      return response;
    } catch (error) {
      console.error(`[client] Tool invocation failed: ${request.tool}`, error);
      throw error;
    }
  }

  /**
   * Start MCP server (listens for host app connections)
   *
   * Implements the MCP protocol and relays tool calls to Ambassador Server.
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      throw new Error('Client already running');
    }

    console.info('[client] Starting MCP server on stdio...');
    this.isRunning = true;

    // Fetch initial tool catalog
    try {
      await this.getToolCatalog();
    } catch (error) {
      console.warn('[client] Initial catalog fetch failed, will retry on demand:', error);
    }

    // Listen for JSON-RPC messages on stdin
    process.stdin.setEncoding('utf8');

    let buffer = '';

    process.stdin.on('data', (chunk: string) => {
      buffer += chunk;

      // F-SEC-M6.6-002: Check buffer size limit to prevent OOM
      if (buffer.length > AmbassadorClient.MAX_BUFFER_SIZE) {
        console.error(
          `[client] stdin buffer exceeded max size (${AmbassadorClient.MAX_BUFFER_SIZE} bytes), terminating`
        );
        process.exit(1);
      }

      // Process complete JSON-RPC messages (newline-delimited)
      const lines = buffer.split('\n');
      buffer = lines.pop() || ''; // Keep incomplete line in buffer

      for (const line of lines) {
        if (line.trim()) {
          // F-SEC-M6.6-002: Check individual message size
          if (line.length > AmbassadorClient.MAX_MESSAGE_SIZE) {
            console.error(
              `[client] Message exceeds max size (${AmbassadorClient.MAX_MESSAGE_SIZE} bytes), ignoring`
            );
            continue;
          }

          this.handleJsonRpcMessage(line).catch(err => {
            console.error('[client] Error handling message:', err);
          });
        }
      }
    });

    process.stdin.on('end', () => {
      console.info('[client] stdin closed, shutting down');
      void this.stop();
    });

    console.info('[client] MCP server started successfully');
  }

  /**
   * Stop MCP server gracefully
   * Finding 2: Use Promise.race to avoid blocking on disconnect
   */
  async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    console.info('[client] Stopping MCP server...');
    this.isRunning = false;

    // Stop heartbeat timer
    this.stopHeartbeat();

    // Best-effort disconnect: inform server this connection is closing.
    // Finding 2: Race with timeout to handle tight shutdown scenarios
    if (this.connectionId) {
      try {
        let timeoutHandle: NodeJS.Timeout | undefined;
        const timeoutPromise = new Promise<void>(resolve => {
          timeoutHandle = setTimeout(resolve, 2000);
        });

        await Promise.race([
          this.sendDisconnect(),
          timeoutPromise,
        ]);

        // Clear the timeout to prevent dangling timer
        if (timeoutHandle !== undefined) {
          clearTimeout(timeoutHandle);
        }

        console.info('[client] Sent disconnect to server (best-effort)');
      } catch (e) {
        console.warn('[client] Disconnect attempt failed (ignored)');
      }
    }

    // Clear session state after attempting disconnect
    this.sessionId = null;
    this.sessionToken = null;
    this.connectionId = null;
    this.expiresAt = null;

    // Reference fields to satisfy strict type-checkers for intentionally-kept fields
    void this.sessionId;
    void this.expiresAt;

    console.info('[client] MCP server stopped');
  }

  /**
   * Send disconnect request to server
   * Finding 2: Extracted for use with Promise.race in stop()
   */
  private sendDisconnect(): Promise<void> {
    return new Promise<void>((resolve) => {
      const url = new URL(this.config.server_url);
      const disconnectPath = `/v1/sessions/connections/${this.connectionId}`;

      const options: https.RequestOptions = {
        hostname: url.hostname,
        port: url.port || 8443,
        path: disconnectPath,
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          'X-Session-Token': this.sessionToken || '',
        },
        rejectUnauthorized: !this.config.allow_self_signed,
      };

      const req = https.request(options, (res: IncomingMessage) => {
        // Drain response and resolve when finished
        res.on('data', () => {});
        res.on('end', () => resolve());
      });

      req.on('error', () => resolve());
      req.setTimeout(2000, () => {
        try {
          req.destroy();
        } catch (e) {
          // ignore
        }
        resolve();
      });

      req.end();
    });
  }

  /**
   * Handle JSON-RPC message from host app
   */
  private async handleJsonRpcMessage(line: string): Promise<void> {
    try {
      const message = JSON.parse(line) as any;

      if (!message.jsonrpc || message.jsonrpc !== '2.0') {
        throw new Error('Invalid JSON-RPC version');
      }

      // Handle different MCP methods
      if (message.method === 'tools/list') {
        await this.handleToolsList(message);
      } else if (message.method === 'tools/call') {
        await this.handleToolsCall(message);
      } else if (message.method === 'initialize') {
        await this.handleInitialize(message);
      } else {
        // Unknown method
        this.sendJsonRpcError(message.id, -32601, 'Method not found');
      }
    } catch (error) {
      console.error('[client] Failed to parse JSON-RPC message:', error);
      this.sendJsonRpcError(null, -32700, 'Parse error');
    }
  }

  /**
   * Handle tools/list request
   */
  private async handleToolsList(message: any): Promise<void> {
    try {
      const catalog = await this.getToolCatalog();

      // Transform to MCP format
      const tools = catalog.tools.map(tool => ({
        name: tool.name,
        description: tool.description,
        inputSchema: tool.input_schema,
      }));

      this.sendJsonRpcResponse(message.id, { tools });
    } catch (error) {
      console.error('[client] tools/list failed:', error);
      this.sendJsonRpcError(message.id, -32603, 'Failed to fetch tool catalog');
    }
  }

  /**
   * Handle tools/call request
   */
  private async handleToolsCall(message: any): Promise<void> {
    try {
      const { name, arguments: args } = message.params;

      if (!name || typeof name !== 'string') {
        this.sendJsonRpcError(message.id, -32602, 'Invalid params: name required');
        return;
      }

      // Invoke via Ambassador Server
      const request: ToolInvocationRequest = {
        tool: name,
        arguments: args || {},
      };

      const response = await this.invokeTool(request);

      // Transform response to MCP format
      this.sendJsonRpcResponse(message.id, {
        content: response.result,
        isError: false,
      });
    } catch (error) {
      // F-SEC-M6.6-003: Log detailed error to stderr, send generic message to host app
      console.error('[client] tools/call failed:', error);
      this.sendJsonRpcError(message.id, -32603, 'Tool invocation failed');
    }
  }

  /**
   * Handle initialize request
   */
  private async handleInitialize(message: any): Promise<void> {
    this.sendJsonRpcResponse(message.id, {
      protocolVersion: '2024-11-05',
      capabilities: {
        tools: {},
      },
      serverInfo: {
        name: '@mcpambassador/client',
        version: '0.1.0',
      },
    });
  }

  /**
   * Send JSON-RPC response
   */
  private sendJsonRpcResponse(id: any, result: any): void {
    const response = {
      jsonrpc: '2.0',
      id,
      result,
    };

    process.stdout.write(JSON.stringify(response) + '\n');
  }

  /**
   * Send JSON-RPC error
   */
  private sendJsonRpcError(id: any, code: number, message: string): void {
    const response = {
      jsonrpc: '2.0',
      id,
      error: {
        code,
        message,
      },
    };

    process.stdout.write(JSON.stringify(response) + '\n');
  }

  /**
   * Maximum HTTP response size (10MB)
   * Prevents OOM from malicious/misconfigured server responses
   * Consistent with stdin/stdout buffer limits
   *
   * Security: F-SEC-M6.6-006 remediation
   */
  private static readonly MAX_RESPONSE_SIZE = 10 * 1024 * 1024; // 10MB

  /**
   * Make HTTPS request to Ambassador Server
   */
  private async httpRequest<T>(
    method: string,
    path: string,
    body?: any,
    authenticated = true,
    retryOn401 = true
  ): Promise<T> {
    return new Promise((resolve, reject) => {
      const url = new URL(this.config.server_url);

      const options: https.RequestOptions = {
        hostname: url.hostname,
        port: url.port || 8443,
        path,
        method,
        headers: {
          'Content-Type': 'application/json',
        },
        rejectUnauthorized: !this.config.allow_self_signed,
      };

      // Add session token for authenticated requests
      if (authenticated && this.sessionToken) {
        (options.headers as Record<string, string>)['X-Session-Token'] = this.sessionToken;
      }

      const req = https.request(options, (res: IncomingMessage) => {
        let data = '';

        res.on('data', (chunk: Buffer) => {
          data += chunk.toString();

          // Security: Enforce response size limit to prevent OOM
          if (data.length > AmbassadorClient.MAX_RESPONSE_SIZE) {
            req.destroy(
              new Error(
                `Response exceeds maximum size of ${AmbassadorClient.MAX_RESPONSE_SIZE} bytes`
              )
            );
            return;
          }
        });

        res.on('end', () => {
          if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
            try {
              resolve(JSON.parse(data));
            } catch (error) {
              reject(new Error(`Invalid JSON response: ${error}`));
            }
          } else if (res.statusCode === 401 && retryOn401 && !this.isReregistering) {
            // Finding 1: Parse structured error response
            let serverErrorCode = 'unknown';
            let serverErrorMessage = 'Authentication failed';
            try {
              const parsed = JSON.parse(data);
              serverErrorCode = parsed?.error || 'unknown';
              serverErrorMessage = parsed?.message || data;
            } catch (e) {
              // Parse failed, use raw data
              serverErrorMessage = data || 'Authentication failed';
            }

            const wasSuspended = serverErrorCode === 'session_suspended';
            const wasExpired = serverErrorCode === 'session_expired';

            if (wasSuspended) {
              console.error('[client] Session suspended. Reconnecting... MCP instances restarting.');
            } else if (wasExpired) {
              console.error('[client] Session expired, re-registering...');
            } else {
              console.error(`[client] Session authentication failure: ${serverErrorMessage}. Re-registering...`);
            }

            this.isReregistering = true;

            this.register()
              .then(() => {
                if (wasSuspended) {
                  console.error('[client] Reconnected successfully.');
                } else {
                  console.info('[client] Re-registration successful, retrying request');
                }

                // Retry original request with new session token
                return this.httpRequest<T>(method, path, body, authenticated, false);
              })
              .then(result => {
                this.isReregistering = false;
                resolve(result);
              })
              .catch(err => {
                this.isReregistering = false;
                console.error(`[client] Failed to reconnect: ${err.message}. Please check your preshared key.`);
                reject(new Error(`Re-registration failed: ${err.message}`));
              });
          } else {
            // Finding 1: Create HttpError with structured error information
            let errorCode = 'unknown';
            let errorMessage = data;
            try {
              const parsed = JSON.parse(data);
              errorCode = parsed?.error || 'unknown';
              errorMessage = parsed?.message || data;
            } catch (e) {
              // Use raw data if parse fails
            }
            reject(new HttpError(res.statusCode || 500, errorCode, errorMessage, data));
          }
        });
      });

      req.on('error', (error: Error) => {
        reject(error);
      });

      if (body) {
        req.write(JSON.stringify(body));
      }

      req.end();
    });
  }

  /**
   * Start heartbeat timer
   * Finding 4: Already correctly clears existing timer first
   */
  private startHeartbeat(): void {
    this.stopHeartbeat(); // Clear any existing timer first


    const intervalMs = this.config.heartbeat_interval_seconds! * 1000;

    this.heartbeatTimer = setInterval(() => {
      this.sendHeartbeat().catch(err => {
        console.error('[client] Heartbeat failed:', err);
      });
    }, intervalMs);

    console.info(`[client] Heartbeat started (interval: ${this.config.heartbeat_interval_seconds}s)`);
  }

  /**
   * Stop heartbeat timer
   * Finding 4: Extracted for reuse
   */
  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  /**
   * Send heartbeat to server
   * Finding 5: Use HttpError instead of string matching
   */
  private async sendHeartbeat(): Promise<void> {
    if (!this.sessionToken) {
      console.warn('[client] No session token, skipping heartbeat');
      return;
    }

    try {
      await this.httpRequest<{ status: string }>(
        'POST',
        '/v1/sessions/heartbeat',
        {},
        true,
        false // Don't retry on 401 for heartbeat - let it fail and re-register on next regular request
      );
      console.debug('[client] Heartbeat sent successfully');
    } catch (error: any) {
      // Finding 5: Check HTTP status codes directly using HttpError
      if (error instanceof HttpError) {
        // 429 = rate limited, normal - silently skip
        if (error.statusCode === 429) {
          console.debug('[client] Heartbeat rate limited, skipping');
          return;
        }

        // 401 = session expired, will re-register on next tool call
        if (error.statusCode === 401) {
          console.warn('[client] Heartbeat returned 401, session likely expired');
          return;
        }
      }

      throw error;
    }
  }
}
