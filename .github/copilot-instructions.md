# MCP Ambassador Client — Copilot Instructions

## Repo Context

This is the **mcpambassador_client** repository — a lightweight npm package (`@mcpambassador/client`) that acts as an stdio MCP proxy on developer workstations. It connects to the Ambassador Server and proxies MCP calls from AI tools (VS Code, Claude Desktop, etc.).

**Stack:** TypeScript strict, zero production dependencies, Node.js 20+, Vitest  
**Version:** 0.8.0-beta.1

## Critical Constraint: Zero Production Dependencies

This is the most important rule in this repo: **the `dependencies` field in `package.json` must always be empty** (`{}`). All functionality must be implemented using Node.js built-ins only.

Why: The client is installed by developers on their machines via `pnpm add` or `npm install`. Every production dependency is a supply-chain risk that must be vetted. If you need HTTP, use `node:https`. If you need crypto, use `node:crypto`. If you need file I/O, use `node:fs`.

If you find yourself wanting to add a production dependency, stop and find a way to implement it with Node.js built-ins, or raise the question with maintainers.

## Architecture

The client operates as a bidirectional stdio↔HTTP/2 proxy:

```
AI Tool (MCP Host)
    ↕ stdio (JSON-RPC MCP protocol)
Ambassador Client
    ↕ HTTPS + preshared key authentication
Ambassador Server (:8443)
```

The client authenticates to the server using a preshared key (`amb_pk_` prefix). It presents the key in the `Authorization: Bearer <preshared_key>` header on every request.

## Coding Standards

### TypeScript
- Strict mode. No `any` without justification.
- Explicit return types on all exported functions.
- Use `node:` prefix for Node.js built-in imports: `import { createHash } from 'node:crypto'`

### Error Handling
- The client must NEVER crash the AI tool. All errors should be caught and either:
  1. Returned as MCP error responses to the AI tool
  2. Logged to stderr (never stdout — stdout is reserved for MCP JSON-RPC)
- Never write non-MCP content to stdout

### Config File
- Config is loaded from `amb-client-config.json` in the user's home directory or current working directory
- Config file contains the server URL and preshared key
- On startup, validate the config with a clear error message if missing/malformed

### Security
- TLS certificate validation is ON by default — do not add `rejectUnauthorized: false` without an explicit user opt-in config flag
- The preshared key is NEVER logged, even on debug level
- Config file path should be checked for insecure permissions (warn if world-readable)

## Testing
- Tests in `tests/` using Vitest
- Mock the HTTP transport layer for unit tests — do not make real network calls in tests
- Test the stdio parsing layer independently from the HTTP layer
- `pnpm test` must pass and all tests must be deterministic

## Build Output
- `dist/index.js` — library entry point
- `dist/cli.js` — binary entry point (shebang: `#!/usr/bin/env node`)
- `dist/index.d.ts` — type declarations
- Build with `tsc` — no bundler (pure ESM output)

## Code Review Criteria

Flag as **BLOCKING**:
1. Any production dependency added to `dependencies`
2. Any write to stdout that is not valid JSON-RPC
3. `rejectUnauthorized: false` without config opt-in
4. The preshared key appearing in any log output
5. `Math.random()` used for anything security-related (use `node:crypto`)

Flag as **WARNING**:
1. Missing error handling on network calls
2. Swallowing errors silently
3. Hardcoded timeouts without config option
