## Description

<!-- What does this PR change? -->

Fixes # (issue)

## Type of Change

- [ ] Bug fix
- [ ] New feature
- [ ] Dependency update (devDependencies only — prod deps are forbidden)
- [ ] Refactor
- [ ] Documentation update
- [ ] CI / release change

## Zero-Dependency Checklist

The `@mcpambassador/client` package must have **zero production dependencies**.

- [ ] I have NOT added any entries to the `dependencies` field in `package.json`
- [ ] Any new functionality uses Node.js built-in modules only (`node:crypto`, `node:https`, etc.)

## Security Checklist

- [ ] The preshared key / session tokens are never written to stdout or stderr
- [ ] TLS certificate validation is enabled by default (no `rejectUnauthorized: false` without config opt-in)
- [ ] All MCP error responses use valid JSON-RPC error format
- [ ] No output to stdout except valid JSON-RPC messages

## Testing

- [ ] Tests added/updated for this change
- [ ] `pnpm test` passes on Node 20
- [ ] `pnpm typecheck` passes with no errors
- [ ] `pnpm build` produces clean `dist/`
