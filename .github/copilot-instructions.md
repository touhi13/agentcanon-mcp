# GitHub Copilot Instructions for agentcanon-mcp
## No Hardcoded Secrets
Never hardcode API keys, access tokens, or sensitive credentials in source code. Always use environment variables.

## Deterministic Sync & Path Safety
All adapter rule outputs must be deterministically sorted by priority descending and rule ID ascending. Target paths must be strictly validated against path traversal outside the project root.

## TypeScript Strict ESM Standard
Use NodeNext module resolution with explicit '.js' extensions in relative imports. Maintain strict type safety without 'any' where possible.
