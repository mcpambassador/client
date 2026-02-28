# Contributing to MCP Ambassador Client

Thank you for your interest in contributing to the MCP Ambassador Client. This repository contains a zero-dependency TypeScript client for connecting to MCP Ambassador servers. The zero-dependency constraint is a hard requirement and enforced by CI.

## Code of Conduct

Please read and follow our [CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md).

## Security Vulnerabilities

Do NOT open public issues for security vulnerabilities. See `.github/SECURITY.md` for how to report security issues privately.

## Quick Start

Prerequisites:
- Node.js 20 or later
- pnpm 10

Clone the repo, install, build and run tests:

```bash
git clone git@github.com:mcpambassador/client.git
cd client
pnpm install
pnpm build
pnpm test
pnpm typecheck
```

## The Zero-Dependency Rule

This package has zero production dependencies by design. This is a hard requirement enforced by CI. All runtime functionality must use Node.js builtin modules (for example: `node:net`, `node:tls`, `node:crypto`, `node:fs`, etc.).

PRs that add production dependencies will be rejected. Dev dependencies used for testing, linting, and building are acceptable.

Rationale: supply-chain security. Every dependency is a potential attack vector. The client handles preshared keys and TLS connections — minimizing the dependency surface is an intentional security decision.

## How to Contribute

### Reporting Bugs

Please use the bug report issue template. When filing a bug include:

- `@mcpambassador/client` version (from package.json)
- Node.js version
- Transport type (stdio, tcp, etc.)
- Steps to reproduce including minimal reproduction where possible

### Suggesting Features

Open an issue first to discuss the design. Feature requests must be implementable without adding production dependencies.

### Submitting Changes

1. Fork the repository and clone your fork
2. Create a branch with a descriptive prefix (feat/, fix/, docs/, chore/)
3. Make your changes following the coding standards below
4. Run the CI gate locally before opening a PR:

```bash
pnpm build
pnpm lint
pnpm format:check
pnpm typecheck
pnpm test
```

5. Push your branch and open a Pull Request

## What to Expect from Automation

When you open an issue:

- `needs-triage` label will be added
- An automated acknowledgment comment will be posted
- Keyword-based labels may be added automatically

When you open a Pull Request:

- Labels will be added based on files changed
- If `package.json` changes, a `package-json-changed` label will flag zero-dependency review
- CI will run: build, lint, typecheck, test (on Node 20 and Node 22)
- A bundle size report comment compares your build to the base branch
- Pull requests inactive for 14+ days are marked stale; 21+ days are auto-closed

## CI Requirements

All PRs must pass the local CI gate:

```bash
pnpm build
pnpm lint
pnpm format:check
pnpm typecheck
pnpm test
```

In addition, PRs must pass the zero-dependency validation check in CI.

## Coding Standards

### TypeScript

- Project uses strict TypeScript settings
- Use the `node:` prefix for all built-in imports (for example `import net from 'node:net'`)
- Public API functions should have explicit return types

### The stdout Rule

stdout is RESERVED for MCP JSON-RPC protocol messages. All logging, diagnostics, and debug output MUST go to stderr. Writing non-protocol data to stdout breaks MCP clients (for example: VS Code, Claude Desktop).

### Formatting & Linting

- Use Prettier (`pnpm format`) to format files
- ESLint is configured with a flat config; run `pnpm lint`

### Testing

- Tests use Vitest
- Use a mock transport for tests — never make real network calls
- Tests must be deterministic

### Commit Messages

Conventional commit format is recommended (feat:, fix:, docs:) but not enforced.

## Review Process

Review timelines are aligned with the server repo:
- Bug fixes: target 7 days review
- New features: target 14 days review

This repository is maintained by a small team with AI-assisted workflows. If your PR needs attention, a polite ping after two weeks is appropriate.

## AI-Assisted Contributions

If you use AI tools to draft code or text, follow our guidance in `.github/copilot-instructions.md` and ensure the final submission meets our coding and security standards.

## Getting Help

If you need assistance, open an issue and include relevant details.

## License

Apache License 2.0
