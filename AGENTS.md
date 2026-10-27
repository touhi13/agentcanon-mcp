<!-- Managed by AgentCanon MCP (.agentcanon/rules.yaml). Do not edit manually without syncing. -->
# agentcanon-mcp — Agent Instructions

Canonical AI coding rules managed by AgentCanon MCP


## Strict TypeScript & Zod Boundary Validation (`typescript-strict-architecture`)
**Category:** `coding-style` | **Severity:** `REQUIRED` | **Priority:** 90
> **Applies to:** `src/**/*.ts`
> **Excludes:** `tests/**/*.ts`

Use strict TypeScript with NodeNext module resolution.
Validate all external MCP inputs and YAML files using Zod schemas in `src/domain/schema.ts`.
Never use `any` or bypass path traversal checks.

## Non-Destructive Preview -> Approve -> Apply Sync (`safe-transactional-sync`)
**Category:** `security` | **Severity:** `REQUIRED` | **Priority:** 85
> **Applies to:** `src/sync/**/*.ts`, `src/adapters/**/*.ts`

All file mutations must go through `previewSync` and `applySync`.
Verify SHA-256 content hashes and reject symlink escapes (`assertNoSymlinkEscape`) before writing any file.
