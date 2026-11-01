import type { HostTool } from './protocol-types.js';

/**
 * Runtime list of valid host_tool values. Must match the HostTool union in
 * protocol-types.ts (synced from the server); the type check below fails the
 * build if either side drifts.
 */
export const HOST_TOOLS = [
  'vscode',
  'claude-desktop',
  'claude-code',
  'opencode',
  'gemini-cli',
  'jetbrains',
  'cli',
  'chatgpt',
  'custom',
] as const satisfies readonly HostTool[];

// Fails to compile if HostTool gains a member that HOST_TOOLS lacks.
type MissingFromList = Exclude<HostTool, (typeof HOST_TOOLS)[number]>;
export const _hostToolsCoverUnion: [MissingFromList] extends [never] ? true : never = true;

export function isHostTool(value: unknown): value is HostTool {
  return typeof value === 'string' && (HOST_TOOLS as readonly string[]).includes(value);
}

export function assertHostTool(value: unknown): asserts value is HostTool {
  if (!isHostTool(value)) {
    throw new Error(`Invalid host_tool "${String(value)}". Valid values: ${HOST_TOOLS.join(', ')}`);
  }
}
