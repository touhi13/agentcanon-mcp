<!-- Managed by AgentCanon MCP (.agentcanon/rules.yaml) -->
# CLAUDE.md — agentcanon-mcp

## Strict TypeScript & Zod Boundary Validation
- **Rule ID:** `typescript-strict-architecture` (required)
- **Scope:** `src/**/*.ts`

Use strict TypeScript with NodeNext module resolution.
Validate all external MCP inputs and YAML files using Zod schemas in `src/domain/schema.ts`.
Never use `any` or bypass path traversal checks.

## Non-Destructive Preview -> Approve -> Apply Sync
- **Rule ID:** `safe-transactional-sync` (required)
- **Scope:** `src/sync/**/*.ts`, `src/adapters/**/*.ts`

All file mutations must go through `previewSync` and `applySync`.
Verify SHA-256 content hashes and reject symlink escapes (`assertNoSymlinkEscape`) before writing any file.
