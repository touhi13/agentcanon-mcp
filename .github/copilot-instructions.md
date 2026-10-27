<!-- Managed by AgentCanon MCP (.agentcanon/rules.yaml) -->
# GitHub Copilot Instructions for agentcanon-mcp

## Strict TypeScript & Zod Boundary Validation (`typescript-strict-architecture`)

Use strict TypeScript with NodeNext module resolution.
Validate all external MCP inputs and YAML files using Zod schemas in `src/domain/schema.ts`.
Never use `any` or bypass path traversal checks.

## Non-Destructive Preview -> Approve -> Apply Sync (`safe-transactional-sync`)

All file mutations must go through `previewSync` and `applySync`.
Verify SHA-256 content hashes and reject symlink escapes (`assertNoSymlinkEscape`) before writing any file.
