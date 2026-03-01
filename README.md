# MCP Ambassador Client

A lightweight stdio MCP proxy that connects any MCP-compatible AI tool to an MCP Ambassador server. Install once -- tools appear automatically.

![CI](https://github.com/mcpambassador/client/actions/workflows/ci.yml/badge.svg) [![npm](https://img.shields.io/npm/v/@mcpambassador/client.svg)](https://www.npmjs.com/package/@mcpambassador/client) ![License](https://img.shields.io/badge/License-Apache_2.0-blue.svg) ![Node](https://img.shields.io/badge/node-%3E%3D20-brightgreen.svg) [![Website](https://img.shields.io/badge/docs-mcpambassador.ai-blue.svg)](https://mcpambassador.ai)

## What Is This

The Ambassador Client is the only MCP you install on your workstation. It connects to an MCP Ambassador Server and dynamically discovers all the tools your admin has published for you. Tools from dozens of downstream MCPs appear as native tools in your AI client. No per-tool installation, no credential management, no configuration drift.

## Install

```bash
npm install -g @mcpambassador/client
```

Or with npx (zero install):

```bash
npx @mcpambassador/client --config /path/to/config.json
```

## Quick Start

**VS Code** -- add to your VS Code settings or `.vscode/mcp.json`:

```json
{
  "mcp.servers": {
    "mcpambassador": {
      "command": "npx",
      "args": ["-y", "@mcpambassador/client", "--config", "/path/to/amb-client-config.json"],
      "env": {
        "MCP_AMBASSADOR_URL": "https://your-server:8443",
        "MCP_AMBASSADOR_PRESHARED_KEY": "amb_pk_YOUR_KEY"
      }
    }
  }
}
```

**Claude Desktop** -- add to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "mcpambassador": {
      "command": "npx",
      "args": ["-y", "@mcpambassador/client", "--config", "/path/to/amb-client-config.json"],
      "env": {
        "MCP_AMBASSADOR_URL": "https://your-server:8443",
        "MCP_AMBASSADOR_PRESHARED_KEY": "amb_pk_YOUR_KEY"
      }
    }
  }
}
```

**Any MCP Host** -- the generic pattern:

```
command: npx -y @mcpambassador/client --config /path/to/amb-client-config.json
env: MCP_AMBASSADOR_URL=https://your-server:8443
env: MCP_AMBASSADOR_PRESHARED_KEY=amb_pk_YOUR_KEY
```

## Configuration

The client accepts a JSON configuration file. A template is provided at `amb-client-config.example.json`:

```json
{
  "server_url": "https://ambassador.internal:8443",
  "preshared_key": "amb_pk_...",
  "friendly_name": "my-workstation",
  "host_tool": "vscode",
  "heartbeat_interval_seconds": 120,
  "allow_self_signed": true
}
```

Copy and configure:

```bash
cp amb-client-config.example.json amb-client-config.json
```

Note: `amb-client-config.json` is gitignored. Never commit configuration files containing credentials.

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `MCP_AMBASSADOR_URL` | Yes | -- | Server URL (e.g., `https://your-server:8443`) |
| `MCP_AMBASSADOR_PRESHARED_KEY` | Yes | -- | Client preshared key (`amb_pk_...`) |
| `MCP_AMBASSADOR_ALLOW_SELF_SIGNED` | No | `false` | Allow self-signed TLS certificates (dev only) |
| `MCP_AMBASSADOR_HOST_TOOL` | No | `vscode` | Host tool identifier |
| `MCP_AMBASSADOR_HEARTBEAT_INTERVAL` | No | `120` | Heartbeat interval in seconds |

## CLI Usage

```
mcpambassador-client --server <url>
mcpambassador-client --config <path>

Options:
  --server <url>               Ambassador Server URL
  --config <path>              Path to JSON config file
  --allow-self-signed          Allow self-signed TLS certificates (dev/test only)
  --heartbeat-interval <sec>   Heartbeat interval in seconds (default: 120)
  --cache-ttl <sec>            Tool catalog cache TTL in seconds (default: 300)
  --help, -h                   Show help
```

## How It Works

- Client registers with the server using a preshared key
- Server returns an ephemeral session token and the tool catalog
- Client exposes discovered tools as native MCP tools via stdio
- The host AI tool (VS Code, Claude Desktop) sees tools as if they were local
- Heartbeat keeps the session alive; the tool catalog refreshes automatically

## Session Lifecycle

- Sessions are ephemeral and stored in memory only
- If the server returns 401 with `session_expired`, the client automatically re-registers
- If the server returns 401 with `session_suspended`, the client attempts to reconnect
- On SIGINT/SIGTERM, the client performs a best-effort disconnect (2-second timeout)

## Requirements

- Node.js 20 or later
- An MCP Ambassador server ([server repo](https://github.com/mcpambassador/server))
- A preshared key (obtained from the server admin or the self-service portal)

## Development

```bash
pnpm install
pnpm build
pnpm test
pnpm typecheck
pnpm lint
```

## Related Projects

| Project | Description |
|---------|-------------|
| [MCP Ambassador Server](https://github.com/mcpambassador/server) | Centralized MCP governance server |
| [Community Registry](https://github.com/mcpambassador/community-registry) | Curated registry of 38+ MCP configurations |
| [Documentation](https://mcpambassador.ai) | Full documentation, guides, and API reference |

## License

Apache License 2.0 -- see [LICENSE](./LICENSE).

## Contributing

We welcome contributions. See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines, including the zero-dependency requirement that applies to all changes.

## Performance Tuning

The client exposes several timing parameters that affect server load and responsiveness:

| Setting | Default | Range | Description |
|---------|---------|-------|-------------|
| `heartbeat_interval_seconds` | 120 | 15–300 | How often the client pings the server to keep the session alive. Higher values reduce server traffic. |
| `cache_ttl_seconds` | 300 | 0+ | How long the tool catalog is cached locally. Set to 0 to disable caching. |

### Deployment profiles

| Profile | Heartbeat | Cache TTL | Notes |
|---------|-----------|-----------|-------|
| Solo developer | 120s (default) | 300s (default) | Works out of the box |
| Small team (5–10 devs) | 120s | 300s | Default settings are fine |
| Large org (50–100 devs) | 180s | 600s | Reduces server load at scale |

All settings are configurable via CLI flags, environment variables, or the JSON config file.
