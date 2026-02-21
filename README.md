# MCP Ambassador Client

Lightweight HTTP/MCP proxy for developer workstations.

## Overview

The Ambassador Client is a thin proxy that runs on developer machines and connects them to the Ambassador Server. Main responsibilities:

- Register with the Ambassador Server using a preshared key (ephemeral sessions)
- Fetch and cache the tool catalog
- Implement the MCP protocol for host apps (VS Code, Claude Desktop, etc.)
- Relay tool calls from the host app to the Ambassador Server

## New Configuration Format

The client now uses a JSON configuration format. Example:

```json
{
  "server_url": "https://ambassador.internal:8443",
  "preshared_key": "amb_pk_...",
  "friendly_name": "my-workstation",
  "host_tool": "vscode",
  "heartbeat_interval_seconds": 60,
  "allow_self_signed": true
}
```

Notes:
- `preshared_key` is required and replaces the old API key model.
- `friendly_name` defaults to the system hostname when omitted.
- `host_tool` identifies the host integration (e.g., `vscode`).

## Environment Variables

- `MCP_AMBASSADOR_PRESHARED_KEY` — preshared key (required if not using a config file)
- `MCP_AMBASSADOR_URL` — server URL (alternative to `--server`)
- `MCP_AMBASSADOR_ALLOW_SELF_SIGNED` — set to `true` to allow self-signed certs (dev only)
- `MCP_AMBASSADOR_HOST_TOOL` — host tool identifier (defaults to `vscode`)
- `MCP_AMBASSADOR_HEARTBEAT_INTERVAL` — heartbeat interval in seconds (default: 60)

## CLI Usage

```
mcpambassador-client --server <url>
mcpambassador-client --config <path-to-json>

Options:
  --server <url>               Ambassador Server URL (e.g., https:// https://ambassador.internal:8443)
  --config <path>              Path to JSON config file
  --allow-self-signed          Allow self-signed TLS certificates (dev/test only)
  --heartbeat-interval <sec>   Heartbeat interval in seconds (default: 60)
  --cache-ttl <sec>            Tool catalog cache TTL in seconds (default: 60)
  --help, -h                   Show help
```

Environment variable `MCP_AMBASSADOR_PRESHARED_KEY` is used when not running with a config file.

## Heartbeat Behavior

- The client sends an automatic heartbeat to the server to keep ephemeral sessions active.
- Default interval is 60 seconds and is configurable via `heartbeat_interval_seconds` in the config file or `--heartbeat-interval` / `MCP_AMBASSADOR_HEARTBEAT_INTERVAL`.
- Heartbeats are best-effort and rate-limited by the server.

## Session Lifecycle

- Sessions are ephemeral and stored in memory only.
- If the server returns a 401 with `session_expired`, the client will automatically re-register using the preshared key and retry the failed request.
  - User-facing message on expiry: `[client] Session expired, re-registering...` (emitted to stderr)
- If the server returns a 401 with `session_suspended`, the client will attempt to re-register and the host app will see a clear message while MCP instances are restarted.
  - User-facing message on suspension: `[client] Session suspended. Reconnecting... MCP instances restarting.` (emitted to stderr)
- If re-registration after suspension succeeds: `[client] Reconnected successfully.` (emitted to stderr)
- If re-registration fails: `[client] Failed to reconnect: <error>. Please check your preshared key.` (emitted to stderr)

## Graceful Shutdown

- On SIGINT/SIGTERM the client performs a best-effort disconnect by sending `DELETE /v1/sessions/connections/{connection_id}` to the server.
- The disconnect uses a short timeout (2 seconds) and never blocks shutdown if the server is unreachable.

## VS Code MCP Configuration Example

Add a server entry to your VS Code `settings.json` to launch the Ambassador Client as a local MCP provider:

```json
{
  "mcpServers": {
    "ambassador": {
      "command": "mcpambassador-client",
      "args": ["--config", "/path/to/amb-client-config.json"]
    }
  }
}
```

Or start directly with server URL and preshared key via environment variables.

### VS Code (stdio) launcher example

If you launch the client directly with a Node binary (local, unpublished build) you can keep the same `command`/`args`/`env` shape you already use in your VS Code `mcp.json` / `settings.json`. Example (your local setup):

```json
"mcpambassador-local": {
  "type": "stdio",
  "command": "/home/zervin/.nvm/versions/node/v24.13.1/bin/node",
  "args": [
    "/home/zervin/projects/abs/mcpambassador_client/dist/cli.js",
    "--config",
    "/home/zervin/.config/amb-client-config.json"
  ],
  "env": {
    "MCP_AMBASSADOR_URL": "https://localhost:8443",
    "MCP_AMBASSADOR_PRESHARED_KEY": "amb_pk_REDACTED_SEE_F001",
    "MCP_AMBASSADOR_ALLOW_SELF_SIGNED": "true"
  }
}
```

Notes:
- The client will read the JSON config file passed with `--config` and/or fall back to the environment variables shown above.
- Using the VS Code `env` block is convenient for local development, but consider using a config file (example below) to keep secrets out of editor settings.

### Example `amb-client-config.json`

Create a small JSON config file and point the client to it with `--config`:

```json
{
  "server_url": "https://localhost:8443",
  "preshared_key": "amb_pk_REDACTED_SEE_F001",
  "friendly_name": "zervin-workstation",
  "host_tool": "vscode",
  "heartbeat_interval_seconds": 60,
  "allow_self_signed": true
}
```

Then launch via your VS Code launcher or directly with Node/CLI as shown above.

## Development

```bash
# Install dependencies
pnpm install

# Type check
pnpm typecheck

# Run tests
pnpm test
```

## License

MIT