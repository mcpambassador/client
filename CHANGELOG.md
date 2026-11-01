# Changelog

## Unreleased

- `tools/call` now sets `isError` from the server's `metadata.is_error` instead of always reporting success, and passes `structuredContent` through. Server approval results (`approval_required`, `approval_denied`, `approval_expired`, `approval_unavailable`) are validated and shown to the agent as a short instruction ("ask the user to approve at <url>, then retry the same call") plus `structuredContent`.
- `ClientConfig.host_tool` is narrowed from `string` to `HostTool` (type-level change for TypeScript consumers). An invalid value now fails at startup with the list of valid values instead of being sent to the server.
- Protocol types re-synced from server `e22e374` (`HostTool` adds `jetbrains` and `cli`).
- `tools/call` now reports a server 403 (kill switch, access denied) to the host as an MCP tool error (`isError: true`) instead of a generic JSON-RPC error. Only known server messages are shown; any other 403 body becomes "Tool not permitted".
