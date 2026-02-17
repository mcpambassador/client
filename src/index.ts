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

import type {
  RegistrationRequest,
  RegistrationResponse,
  ToolCatalogResponse,
  ToolInvocationRequest,
  ToolInvocationResponse,
} from '@mcpambassador/protocol';

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
}

/**
 * Ambassador Client main class
 * 
 * Placeholder implementation - M6 will implement.
 */
export class AmbassadorClient {
  constructor(private config: ClientConfig) {}

  /**
   * Register with Ambassador Server
   * 
   * @returns Registration response with client_id and api_key
   */
  async register(): Promise<RegistrationResponse> {
    throw new Error('Client registration not implemented - M6 will implement');
  }

  /**
   * Fetch tool catalog from server
   * 
   * @returns Tool catalog (cached for cache_ttl_seconds)
   */
  async getToolCatalog(): Promise<ToolCatalogResponse> {
    throw new Error('Tool catalog fetch not implemented - M6 will implement');
  }

  /**
   * Invoke a tool via the Ambassador Server
   * 
   * @param request Tool invocation request
   * @returns Tool invocation response
   */
  async invokeTool(request: ToolInvocationRequest): Promise<ToolInvocationResponse> {
    throw new Error('Tool invocation not implemented - M6 will implement');
  }

  /**
   * Start MCP server (listens for host app connections)
   * 
   * Implements the MCP protocol and relays tool calls to Ambassador Server.
   */
  async start(): Promise<void> {
    throw new Error('MCP server start not implemented - M6 will implement');
  }

  /**
   * Stop MCP server gracefully
   */
  async stop(): Promise<void> {
    throw new Error('MCP server stop not implemented - M6 will implement');
  }
}
