# AgentCanon MCP (`agentcanon-mcp`)

[![CI](https://github.com/touhi13/agentcanon-mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/touhi13/agentcanon-mcp/actions)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)

**One canonical source of truth for AI coding instructions across OpenAI Codex (`AGENTS.md`), Cursor (`.cursor/rules/*.mdc`), Claude Code (`CLAUDE.md`), and GitHub Copilot (`.github/copilot-instructions.md`) — with deterministic generation, SHA-256 drift detection, and approval-bound synchronization.**

---

## Why AgentCanon MCP?

Modern open-source and enterprise repositories are worked on by contributors using different AI coding agents: **OpenAI Codex**, **Cursor**, **Claude Code**, and **GitHub Copilot**. Maintaining separate instruction files (`AGENTS.md`, `CLAUDE.md`, `.cursor/rules/*.mdc`, `.github/copilot-instructions.md`) leads to:

1. **Instruction Drift:** Rules updated in `AGENTS.md` are forgotten in `.cursor/rules` or `CLAUDE.md`.
2. **Silent Overwrites:** Naive rule generators blindly overwrite manual tweaks made by developers.
3. **Monorepo Complexity:** OpenAI Codex supports hierarchical `AGENTS.md` files per directory, whereas Cursor uses glob-scoped `.mdc` frontmatter.

**AgentCanon MCP** solves this by storing typed, validated rules in `.agentcanon/rules.yaml` and projecting them into each agent's native format through a strict **Preview → Approve → Apply** transaction.

---

## Key Features

- **Canonical Rule Model (`.agentcanon/rules.yaml`):** Typed Zod schema with rule IDs, priorities, categories, glob scopes, directory scopes, and target lists.
- **First-Class OpenAI Codex Support (`AGENTS.md`):** Generates root `AGENTS.md` as well as nested directory `AGENTS.md` files (e.g., `packages/api/AGENTS.md`) when `scope.directory` is specified.
- **Native Multi-Agent Adapters:**
  - **OpenAI Codex:** `AGENTS.md` (root & nested directories)
  - **Cursor:** `.cursor/rules/<rule-id>.mdc` with YAML frontmatter (`description`, `globs`, `alwaysApply`)
  - **Claude Code:** `CLAUDE.md`
  - **GitHub Copilot:** `.github/copilot-instructions.md`
- **Transactional Safety (`Preview → Approve → Apply`):**
  - Cryptographically unpredictable `planId` bound to a SHA-256 fingerprint of both `.agentcanon/rules.yaml` and target files on disk.
  - Detects manual human edits (`conflict_modified_by_user`) and pre-existing unmanaged files (`conflict_unmanaged_exists`), refusing silent overwrites.
  - Protects against path traversal (`../`) and symlink escape attacks.
- **CI Drift Check CLI:** Run `npx agentcanon-mcp --check` in GitHub Actions to guarantee all agent instruction files stay synchronized with `.agentcanon/rules.yaml`.

---

## Quick Start

### 1. Initialize or Import Existing Instructions in Your Repo
```bash
npx agentcanon-mcp --init
```
If your repository already has an `AGENTS.md` or `CLAUDE.md`, AgentCanon imports it into `.agentcanon/rules.yaml`.

### 2. Sync Rules via CLI (or via MCP Tools)
```bash
# Generate and apply all configured agent files
npx agentcanon-mcp --sync-yes

# Verify zero drift in CI
npx agentcanon-mcp --check
```

### 3. Configure as an MCP Server

OpenAI Codex / Claude Code / Cursor MCP Configuration (`mcp.json`):

```json
{
  "mcpServers": {
    "agentcanon": {
      "command": "npx",
      "args": ["-y", "agentcanon-mcp"]
    }
  }
}
```

---

## Exposed MCP Tools

| Tool | Mode | Description |
| :--- | :--- | :--- |
| `inspect_project` | Read | Detects project root, existing AGENTS.md/CLAUDE.md/.cursor files, and canonical status |
| `import_existing_rules` | Write Canonical | Bootstraps `.agentcanon/rules.yaml` from existing instruction files |
| `list_rules` | Read | Lists all canonical rules and metadata |
| `upsert_rule` | Write Canonical | Creates or updates a rule in `.agentcanon/rules.yaml` with Zod validation |
| `validate_rules` | Read | Checks schema validity, duplicate IDs, contradictory directives, adapter warnings, and token budget |
| `preview_sync` | Read / Compute | Computes file diffs, checks SHA-256 manifest for manual edits, and issues a one-time `planId` |
| `apply_sync` | Write Projections | Re-verifies filesystem hashes and atomically writes approved changes |

---

## Security & Threat Model

- **Path Traversal & Symlink Defense:** Every target path is verified via `assertSafeRelativePath` and `assertNoSymlinkEscape` (`fs.lstatSync` + `fs.realpathSync`) to ensure writes never escape the repository root.
- **TOCTOU Prevention:** `apply_sync` recomputes the SHA-256 fingerprint of all target files and rejects the plan if any file was modified after `preview_sync`.
- **No Shell Execution:** Rule content is treated strictly as untrusted data; AgentCanon MCP never executes shell commands.

---

## Development & Self-Dogfooding

This repository dogfoods `agentcanon-mcp` to manage its own `AGENTS.md`, `CLAUDE.md`, `.cursor/rules/*.mdc`, and `.github/copilot-instructions.md` (verified on every push in `.github/workflows/ci.yml`).

```bash
npm install
npm test
npm run build
npm run dogfood
npm run check:drift
```

---

## License

MIT © [touhi13](https://github.com/touhi13)
