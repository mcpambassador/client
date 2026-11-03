# Changelog

## Unreleased

- CI, publish and `engines` move to Node 22+ (TD-075).
- Opt-in `--log-file <path>` / `MCP_AMBASSADOR_LOG_FILE` (append, mode 0600; refuses symlinks, FIFOs and foreign-owned files on POSIX) and `--log-level` / `MCP_AMBASSADOR_LOG_LEVEL` (debug, info, warn, error). Default is unchanged: stderr, everything (TD-007).

## 0.10.1

First npm release since 0.8.0-beta.2 (version aligned with server v0.10.1). Published from GitHub Actions via npm Trusted Publishing (OIDC, with provenance).

- Production-ready timing defaults for heartbeat and cache.
- Protocol types synced with the server, plus a protocol drift check (`npm run check:protocol`). The latest sync adds the approval gate's `not_supported_for_client` reason, which the client now handles.
- `tools/call` now sets `isError` from the server's `metadata.is_error` instead of always reporting success, and passes `structuredContent` through. Server approval results (`approval_required`, `approval_denied`, `approval_expired`, `approval_unavailable`) are validated and shown to the agent as a short instruction ("ask the user to approve at <url>, then retry the same call") plus `structuredContent`.
- `ClientConfig.host_tool` is narrowed from `string` to `HostTool` (type-level change for TypeScript consumers). An invalid value now fails at startup with the list of valid values instead of being sent to the server.
- `tools/call` now reports a server 403 (kill switch, access denied) to the host as an MCP tool error (`isError: true`) instead of a generic JSON-RPC error. Only known server messages are shown; any other 403 body becomes "Tool not permitted".
- Protocol types re-synced from server `e22e374` (`HostTool` adds `jetbrains` and `cli`).
