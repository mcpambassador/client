/**
 * Protocol types shared between client and server.
 *
 * TODO: Replace with import from `@mcpambassador/protocol` once published.
 */

export const API_VERSION = 'v1';

export type HostTool =
  | 'vscode'
  | 'claude-desktop'
  | 'claude-code'
  | 'opencode'
  | 'gemini-cli'
  | 'chatgpt'
  | 'custom';

export interface RegistrationRequest {
  preshared_key: string;
  friendly_name: string;
  host_tool: HostTool;
}

export interface RegistrationResponse {
  session_id: string;
  session_token: string;
  expires_at: string;
  profile_id: string;
  connection_id: string;
}

export interface ToolCatalogResponse {
  tools: ToolDescriptor[];
  api_version: string;
  timestamp: string;
}

export interface ToolDescriptor {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
  metadata?: {
    mcp_server?: string;
    tags?: string[];
  };
}

export interface ToolInvocationRequest {
  tool: string;
  arguments: Record<string, unknown>;
  trace_id?: string;
}

export interface ToolInvocationResponse {
  result: unknown;
  request_id: string;
  timestamp: string;
  metadata?: {
    duration_ms?: number;
    mcp_server?: string;
  };
}
