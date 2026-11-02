# MCP Ambassador Client

[![CI](https://github.com/mcpambassador/client/actions/workflows/ci.yml/badge.svg)](https://github.com/mcpambassador/client/actions/workflows/ci.yml) ![License](https://img.shields.io/badge/License-Apache_2.0-blue.svg) ![Node](https://img.shields.io/badge/node-%3E%3D20-brightgreen.svg) [![Website](https://img.shields.io/badge/docs-mcpambassador.ai-blue.svg)](https://mcpambassador.ai)

The one stdio MCP you install on a workstation. It registers with an [MCP Ambassador Server](https://github.com/mcpambassador/server) and exposes the tools your admin has published to you as native tools in your AI client.

## Install (from source)

The package is **not published to npm yet**: npm only has `0.8.0-beta.2`, which is out of date. Until publishing is set up, build from source (Node.js 20+):

```bash
git clone https://github.com/mcpambassador/client.git
cd client
npm install && npm run build
```

The executable is `dist/cli.js` (bin name `mcpambassador-client`). Use its absolute path in the examples below.

## Configure

You need the server URL (port 8443) and a preshared key (`amb_pk_...`) from your admin or the server's web portal.

Environment variables:

| Variable                            | Required | Default  | Description                                 |
| ----------------------------------- | -------- | -------- | ------------------------------------------- |
| `MCP_AMBASSADOR_URL`                | yes      |          | Server URL, e.g. `https://your-server:8443` |
| `MCP_AMBASSADOR_PRESHARED_KEY`      | yes      |          | Preshared key (`amb_pk_...`)                |
| `MCP_AMBASSADOR_HOST_TOOL`          | no       | `vscode` | Name of the host tool, shown on the server  |
| `MCP_AMBASSADOR_ALLOW_SELF_SIGNED`  | no       | `false`  | Accept self-signed TLS (dev only)           |
| `MCP_AMBASSADOR_HEARTBEAT_INTERVAL` | no       | `120`    | Heartbeat seconds (15-300)                  |
| `MCP_AMBASSADOR_CACHE_TTL`          | no       | `300`    | Tool catalog cache seconds (`0` disables)   |
| `MCP_AMBASSADOR_DISABLE_CACHE`      | no       | `false`  | `true` disables the catalog cache           |

Or a JSON file (`--config`), based on [`amb-client-config.example.json`](./amb-client-config.example.json):

```json
{
  "server_url": "https://your-server:8443",
  "preshared_key": "amb_pk_CHANGE_ME_AFTER_REGISTRATION",
  "friendly_name": "my-client",
  "host_tool": "vscode",
  "heartbeat_interval_seconds": 120,
  "cache_ttl_seconds": 300,
  "allow_self_signed": false
}
```

`cp amb-client-config.example.json amb-client-config.json` and edit it. That file is gitignored: never commit keys.

## Add to your AI tool

Claude Desktop (`claude_desktop_config.json`); other MCP hosts use the same command and env:

```json
{
  "mcpServers": {
    "mcpambassador": {
      "command": "node",
      "args": ["/absolute/path/to/client/dist/cli.js"],
      "env": {
        "MCP_AMBASSADOR_URL": "https://your-server:8443",
        "MCP_AMBASSADOR_PRESHARED_KEY": "amb_pk_YOUR_KEY",
        "MCP_AMBASSADOR_HOST_TOOL": "claude-desktop"
      }
    }
  }
}
```

VS Code (`.vscode/mcp.json`) takes the same `command`, `args` and `env`. Add `"--config", "/path/to/amb-client-config.json"` to `args` to use a file instead of env vars.

## CLI

```
mcpambassador-client --server <url> | --config <path>
  --allow-self-signed          Accept self-signed TLS (dev/test only)
  --heartbeat-interval <sec>   Default 120
  --cache-ttl <sec>            Default 300
  --version, -v   --help, -h
```

## How it works

1. Registers with the server using the preshared key and receives an ephemeral session and the tool catalog.
2. Serves that catalog over stdio; tool calls are forwarded to the server, which applies authorization, pinning, kill switches, approval gates and audit.
3. A heartbeat keeps the session alive. On `session_expired` the client re-registers; on `session_suspended` it tries to reconnect. SIGINT/SIGTERM do a best-effort disconnect.

Sessions live in memory only. Tools that the server hides, gates, or has switched off do not appear or are refused by the server; the client holds no policy of its own.

## Development

```bash
npm install && npm run build && npm run lint && npm run format:check && npm run typecheck && npm test
```

The client has no runtime dependencies and mirrors the wire types in the server's `protocol` package (`npm run check:protocol`). See [CONTRIBUTING.md](CONTRIBUTING.md).

## Related

[Server](https://github.com/mcpambassador/server) · [Community registry](https://github.com/mcpambassador/community-registry) · [Docs](https://mcpambassador.ai/docs) · [Client docs](https://mcpambassador.ai/docs/clients)

## Support

Free and open source. Sponsor: https://github.com/sponsors/mcpambassador

- Bitcoin: `3QH4WQoQqnhU3LhbZQU8ttXaNco5Ge3xVp`
- Ethereum: `0xa5462444c5AEf0B2e32822D9a9B7f91aC794FfF0`

## License

Apache License 2.0, see [LICENSE](./LICENSE).
