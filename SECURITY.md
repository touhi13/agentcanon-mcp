# Security Policy

## Security Guarantees
AgentCanon MCP is designed with strict filesystem safety boundaries:
1. No arbitrary shell execution.
2. Strict path traversal and symlink escape prevention inside project root.
3. Explicit approval required before mutating agent instruction files via MCP.

## Reporting a Vulnerability
Please report security issues via GitHub Security Advisories on https://github.com/touhi13/agentcanon-mcp/security/advisories.
