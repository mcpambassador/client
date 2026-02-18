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
 * Ambassador Client configuration
 */
export interface ClientConfig {
  /** Ambassador Server URL (e.g., https://ambassador.internal:8443) */
  server_url: string;
  /** Friendly name for this client */
  friendly_name: string;
  /** Host tool identifier */
  host_tool: string;
  /** Client ID (assigned by server after registration) */
  client_id?: string;
  /** API key (assigned by server after registration) */
  api_key?: string;
  /** Tool catalog cache TTL in seconds (default: 300) */
  cache_ttl_seconds?: number;
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

  constructor(private config: ClientConfig) {
    // Set defaults
    this.config.cache_ttl_seconds = config.cache_ttl_seconds || 300;
    this.config.allow_self_signed = config.allow_self_signed ?? false;
  }

  /**
   * Register with Ambassador Server
   *
   * @returns Registration response with client_id and api_key
   */
  async register(): Promise<RegistrationResponse> {
    // If already registered, return cached credentials
    if (this.config.client_id && this.config.api_key) {
      console.info('[client] Using existing credentials');
      return {
        client_id: this.config.client_id,
        profile_id: 'unknown',
        profile_name: 'unknown',
        status: 'active',
      };
    }

    console.info('[client] Registering with Ambassador Server...');

    const request: RegistrationRequest = {
      friendly_name: this.config.friendly_name,
      host_tool: this.config.host_tool as any,
      machine_fingerprint: this.generateMachineFingerprint(),
    };

    try {
      const response = await this.httpRequest<RegistrationResponse>(
        'POST',
        '/v1/clients/register',
        request,
        false // No auth for registration
      );

      // Store credentials
      this.config.client_id = response.client_id;
      this.config.api_key = response.api_key;

      console.info(`[client] Registration successful: ${response.client_id}`);
      console.info(`[client] Profile: ${response.profile_name}`);

      // TODO: Store credentials persistently (OS keychain)
      // For M6.6, just keep in memory

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
    // Check cache
    if (this.toolCatalogCache) {
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

      // Update cache
      this.toolCatalogCache = {
        tools: response.tools,
        cached_at: Date.now(),
        ttl_seconds: this.config.cache_ttl_seconds!,
      };

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
   */
  async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    console.info('[client] Stopping MCP server...');
    this.isRunning = false;

    // No persistent connections to clean up in stdio mode
    console.info('[client] MCP server stopped');
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
    authenticated = true
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

      // Add authentication headers
      if (authenticated && this.config.api_key) {
        (options.headers as Record<string, string>)['X-API-Key'] = this.config.api_key;
      }
      if (authenticated && this.config.client_id) {
        (options.headers as Record<string, string>)['X-Client-Id'] = this.config.client_id;
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
          } else {
            reject(new Error(`HTTP ${res.statusCode}: ${data}`));
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
   * Generate machine fingerprint for registration
   */
  private generateMachineFingerprint(): string {
    // Simple implementation: hostname + platform + arch
    const platform = process.platform;
    const arch = process.arch;

    return `${hostname()}-${platform}-${arch}`;
  }
}
