# MCP Ambassador — Client

The **Ambassador Client** is a lightweight MCP (Model Context Protocol) proxy installed on developer workstations. It is the single MCP a developer ever needs to install — it connects to the Ambassador Server to dynamically discover and use any MCP tool the organization has made available.

---

## Architecture Role

```
┌──────────────────┐       ┌──────────────────┐       ┌─────────────────┐
│  AI Tool         │       │  Ambassador      │       │  Ambassador     │
│  (VS Code,       │◄─────►│  Client          │◄─────►│  Server         │
│   Claude Code,   │  MCP  │  (this repo)     │ gRPC/ │  (control plane)│
│   Gemini CLI…)   │       │                  │ REST  │                 │
└──────────────────┘       └──────────────────┘       └────────┬────────┘
                                                               │
                                                    ┌──────────┴──────────┐
                                                    │  Downstream MCPs    │
                                                    │  (GitHub, DB, AWS…) │
                                                    └─────────────────────┘
```

The client is responsible for:

- **Single install point** — replaces per-tool, per-MCP configuration
- **Tool aggregation** — exposes all server-side tools through a single MCP interface
- **Local caching** — optional tool metadata and schema caching for offline/low-latency use
- **Auth relay** — authenticates the developer to the Ambassador Server (OAuth2 / API key)
- **Connection management** — persistent connection with reconnect and heartbeat

---

## Technology

- **Language:** TypeScript / Node.js
- **Protocol:** MCP (stdio/SSE transport) on the client-facing side; gRPC or REST to the server
- **Packaging:** npm package + standalone binary (pkg/nexe)

---

## Status

> **Pre-development.** See [mcpambassador_docs/VISION.md](../mcpambassador_docs/VISION.md) for the full product vision.

---

## Related Repositories

| Repository | Purpose |
|---|---|
| `mcpambassador_server` | Ambassador Server — centralized control plane |
| `mcpambassador_docs` | Documentation, vision statement, research |
| `personas` | AI agent team definitions |