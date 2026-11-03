# MCP Ambassador Client

A lightweight stdio MCP proxy that connects any MCP-compatible AI tool to an MCP Ambassador server. Install once -- tools appear automatically.

![CI](https://github.com/mcpambassador/client/actions/workflows/ci.yml/badge.svg) [![npm](https://img.shields.io/npm/v/@mcpambassador/client.svg)](https://www.npmjs.com/package/@mcpambassador/client) ![License](https://img.shields.io/badge/License-Apache_2.0-blue.svg) ![Node](https://img.shields.io/badge/node-%3E%3D20-brightgreen.svg) [![Website](https://img.shields.io/badge/docs-mcpambassador.ai-blue.svg)](https://mcpambassador.ai)

## What Is This

The Ambassador Client is the only MCP you install on your workstation. It connects to an MCP Ambassador Server and dynamically discovers all the tools your admin has published for you. Tools from dozens of downstream MCPs appear as native tools in your AI client. No per-tool installation, no credential management, no configuration drift.

## Install

```bash
npm install -g @mcpambassador/client
```

From source: see [Development](#development).

Or with npx (zero install):

```bash
npx @mcpambassador/client --config /path/to/config.json
```

## Quick Start

Create a config file (see [Configuration](#configuration)) holding at least `server_url` and `preshared_key`, and restrict it with `chmod 600`. With `--config`, the client reads everything from that file and ignores environment variables and other flags.

**VS Code** -- add to your VS Code settings or `.vscode/mcp.json`:

```json
{
  "mcp.servers": {
    "mcpambassador": {
      "command": "npx",
      "args": ["-y", "@mcpambassador/client", "--config", "/path/to/amb-client-config.json"]
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
      "args": ["-y", "@mcpambassador/client", "--config", "/path/to/amb-client-config.json"]
    }
  }
}
```

**Any MCP Host** -- the generic pattern:

```
command: npx -y @mcpambassador/client --config /path/to/amb-client-config.json
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

`allow_self_signed: true` disables TLS certificate verification. Use it for local development only; in production, leave it `false` and serve a certificate from a trusted CA.

Copy and configure:

```bash
cp amb-client-config.example.json amb-client-config.json
```

Note: `amb-client-config.json` is gitignored. Never commit configuration files containing credentials.

## Environment Variables

| Variable                            | Required                        | Default  | Description                                   |
| ----------------------------------- | ------------------------------- | -------- | --------------------------------------------- |
| `MCP_AMBASSADOR_URL`                | Yes (when not using `--config`) | --       | Server URL (e.g., `https://your-server:8443`) |
| `MCP_AMBASSADOR_PRESHARED_KEY`      | Yes (when not using `--config`) | --       | Client preshared key (`amb_pk_...`)           |
| `MCP_AMBASSADOR_ALLOW_SELF_SIGNED`  | No                              | `false`  | Allow self-signed TLS certificates (dev only) |
| `MCP_AMBASSADOR_HOST_TOOL`          | No                              | `vscode` | Host tool identifier                          |
| `MCP_AMBASSADOR_HEARTBEAT_INTERVAL` | No                              | `120`    | Heartbeat interval in seconds                 |

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
  --log-file <path>            Append logs to a file (mode 0600) instead of stderr
  --log-level <level>          debug, info, warn or error (default: debug = everything)
  --help, -h                   Show help
```

### Logging

By default the client logs to stderr, which MCP hosts capture (VS Code shows it in the output panel and may flag it as warnings). To keep that out of the host, set `--log-file <path>` (or `MCP_AMBASSADOR_LOG_FILE`): log lines are then appended to the file with an ISO timestamp, created with mode `0600` and never through a symlink. Fatal errors (`console.error`) are still written to stderr as well. If the file cannot be opened, the client warns on stderr and logs there instead. Use `--log-level warn` (or `MCP_AMBASSADOR_LOG_LEVEL`) to drop info and debug lines. The file is not rotated; point it at a location you manage.

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

| Project                                                                   | Description                                   |
| ------------------------------------------------------------------------- | --------------------------------------------- |
| [MCP Ambassador Server](https://github.com/mcpambassador/server)          | Centralized MCP governance server             |
| [Community Registry](https://github.com/mcpambassador/community-registry) | Curated registry of 38+ MCP configurations    |
| [Documentation](https://mcpambassador.ai)                                 | Full documentation, guides, and API reference |

## License

Apache License 2.0 -- see [LICENSE](./LICENSE).

## Contributing

We welcome contributions. See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines, including the zero-dependency requirement that applies to all changes.

## Performance Tuning

The client exposes several timing parameters that affect server load and responsiveness:

| Setting                      | Default | Range  | Description                                                                                           |
| ---------------------------- | ------- | ------ | ----------------------------------------------------------------------------------------------------- |
| `heartbeat_interval_seconds` | 120     | 15–300 | How often the client pings the server to keep the session alive. Higher values reduce server traffic. |
| `cache_ttl_seconds`          | 300     | 0+     | How long the tool catalog is cached locally. Set to 0 to disable caching.                             |

### Deployment profiles

| Profile                 | Heartbeat      | Cache TTL      | Notes                        |
| ----------------------- | -------------- | -------------- | ---------------------------- |
| Solo developer          | 120s (default) | 300s (default) | Works out of the box         |
| Small team (5–10 devs)  | 120s           | 300s           | Default settings are fine    |
| Large org (50–100 devs) | 180s           | 600s           | Reduces server load at scale |

All settings are configurable via CLI flags, environment variables, or the JSON config file.

## Support

MCP Ambassador is free and open source. If it's useful to you, consider supporting development.

Support via GitHub Sponsors: https://github.com/sponsors/mcpambassador

Crypto donations:

- Bitcoin: `3QH4WQoQqnhU3LhbZQU8ttXaNco5Ge3xVp`
- Ethereum: `0xa5462444c5AEf0B2e32822D9a9B7f91aC794FfF0`
