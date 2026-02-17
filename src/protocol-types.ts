/**
 * Local copy of protocol types from @mcpambassador/protocol
 *
 * This is a temporary solution for M6.6 development.
 * In production, the client should use the published @mcpambassador/protocol package.
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

export type ClientStatus = 'active' | 'suspended' | 'revoked';

export interface RegistrationRequest {
  friendly_name: string;
  host_tool: HostTool;
  machine_fingerprint?: string;
  auth_method?: string;
}

export interface RegistrationResponse {
  client_id: string;
  api_key?: string;
  jwt_token?: string;
  profile_id: string;
  profile_name: string;
  status: ClientStatus;
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
