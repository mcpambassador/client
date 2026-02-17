# MCP Ambassador Client

Lightweight HTTP/MCP proxy for developer workstations.

## Overview

The Ambassador Client is a **thin proxy** that runs on developer machines and connects them to the Ambassador Server. It:

1. **Registers** with the Ambassador Server and receives credentials
2. **Fetches** the tool catalog from the server (cached locally)
3. **Implements** the MCP protocol for host apps (VS Code, Claude Desktop, etc.)
4. **Relays** tool calls from the host app to the Ambassador Server

## Installation

```bash
# Install globally from npm
npm install -g @mcpambassador/client

# Or run with npx (zero install)
npx @mcpambassador/client --server https://ambassador.internal:8443

# Or download binary from GitHub releases
curl -L https://github.com/mcpambassador/releases/latest/download/mcpambassador-client-linux -o mcpambassador-client
chmod +x mcpambassador-client
```

## Usage

### Command Line

```bash
# Start client with server URL
mcpambassador-client --server https://ambassador.internal:8443

# Start with configuration file
mcpambassador-client --config ./config.yaml
```

### Configuration File

```yaml
# config.yaml
server_url: https://ambassador.internal:8443
friendly_name: my-laptop
host_tool: vscode
cache_ttl_seconds: 300
```

### Host App Configuration

**VS Code (`settings.json`):**

```json
{
  "mcpServers": {
    "ambassador": {
      "command": "mcpambassador-client",
      "args": ["--server", "https://ambassador.internal:8443"]
    }
  }
}
```

**Claude Desktop (`claude_desktop_config.json`):**

```json
{
  "mcpServers": {
    "ambassador": {
      "command": "mcpambassador-client",
      "args": ["--server", "https://ambassador.internal:8443"]
    }
  }
}
```

## Development

```bash
# Install dependencies
npm install

# Build
npm run build

# Run tests
npm test

# Lint
npm run lint

# Format
npm run format

# Type check
npm run typecheck
```

## Architecture

```
┌─────────────────┐       ┌────────────────────┐       ┌──────────────┐
│  Host App       │       │  Ambassador Client │       │  Ambassador  │
│  (VS Code,      │◄─────►│  (this package)    │◄─────►│  Server      │
│   Claude, etc.) │  MCP  │  Thin HTTP/MCP     │ HTTPS │              │
└─────────────────┘       │  proxy             │       └──────────────┘
                          └────────────────────┘
```

**Key behaviors:**

- **Stateless:** No persistent state (except cached credentials)
- **Fail closed:** No offline mode — if server is unreachable, tools are unavailable
- **Per-session cache:** Tool catalog cached in memory for 5 minutes (default)
- **Automatic retry:** Exponential backoff on server connection failures

## Features

| Feature | Status | Phase |
|---|---|---|
| Client registration | Placeholder (M6) | 1 |
| Tool catalog fetch | Placeholder (M6) | 1 |
| Tool invocation | Placeholder (M6) | 1 |
| MCP server impl | Placeholder (M6) | 1 |
| SSE push (kill switch) | Not implemented | 2 |
| Binary packaging | Not implemented | 2 |

## Protocol

This client depends on `@mcpambassador/protocol` for type definitions:

```typescript
import type {
  RegistrationRequest,
  ToolCatalogResponse,
  ToolInvocationRequest,
} from '@mcpambassador/protocol';
```

The protocol package is versioned independently. Breaking changes require coordinated client + server releases.

## Security

- **TLS required:** Client rejects non-HTTPS connections (except `localhost` for dev)
- **TOFU:** Trust-on-first-use for self-signed certificates (user confirmation required)
- **Credentials storage:** API keys stored in OS keychain (Linux: keyring, macOS: Keychain, Windows: Credential Manager)

## License

MIT

## Documentation

See the `mcpambassador_docs` repository for:
- Architecture (`architecture.md`)
- Development plan (`../mcpambassador_docs/dev-plan.md`)
- Client resilience (`architecture.md` §17)