# Security Policy

## Supported Versions

| Version | Supported |
|---------|-----------|
| 0.8.x (beta) | Active development |
| < 0.8.0 | Not supported |

## Reporting a Vulnerability

Please do NOT report security vulnerabilities as public GitHub issues.

To report a vulnerability privately use [GitHub Security Advisories](https://github.com/mcpambassador/client/security/advisories/new).

Or email: security@mcpambassador.dev

### What to Include

- Description of the vulnerability and potential impact
- Steps to reproduce
- Any proof-of-concept code (treated as confidential)
- Your preferred disclosure timeline

### Our Commitment

- We will acknowledge receipt within 48 hours
- We will provide an initial assessment within 7 days
- We will work with you on a coordinated disclosure timeline
- We will credit you in the security advisory unless you prefer anonymity

### Scope

In scope for the client repository:

- Preshared key exposure or mishandling
- TLS bypass or downgrade attacks
- Protocol injection via stdout manipulation
- Buffer overflow or memory corruption
- Credential leakage via logs or error messages

Out of scope:

- Denial of service against local stdio transport
- Rate limiting (handled by server, not client)
- Social engineering

## Security Best Practices for Users

See the project documentation for hardening recommendations.
