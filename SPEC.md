# AgentCanon MCP — Architecture & Technical Specification

## 1. System Overview
AgentCanon MCP provides a deterministic, schema-validated canonical store (`.agentcanon/rules.yaml`) and projects agent-native instruction files with transactional safety.

## 2. Canonical Schema (`.agentcanon/rules.yaml`)
- **schemaVersion:** 1
- **project:** `{ name: string, description?: string }`
- **targets:** Array of `"codex" | "cursor" | "claude" | "copilot"`
- **rules:** Array of Rule objects:
  - **id:** kebab-case unique identifier (`^[a-z0-9]+(?:-[a-z0-9]+)*$`)
  - **title:** Human-readable rule summary (3..120 chars)
  - **category:** `"general" | "architecture" | "coding-style" | "testing" | "security"`
  - **scope:** `{ include: string[], exclude: string[], directory?: string }`
  - **priority:** Integer 1..100 (sorted descending for deterministic output)
  - **severity:** `"required" | "recommended" | "advisory"`
  - **content:** Markdown body
  - **targets:** Target adapters enabled for this rule
  - **enabled:** Boolean

## 3. Sync State Machine (Preview -> Approve -> Apply)
1. **Discover & Generate:** Load `.agentcanon/rules.yaml` and `.agentcanon/manifest.json`. Generate projections in memory.
2. **Diff & Conflict Detection:**
   - File missing on disk -> `create`
   - Disk SHA-256 equals generated SHA-256 -> `unchanged`
   - Disk file exists but not in manifest.json -> `conflict_unmanaged_exists`
   - Disk SHA-256 differs from manifest.json recorded SHA-256 -> `conflict_modified_by_user`
   - Disk SHA-256 matches manifest.json -> `update`
3. **Plan Binding:** Compute `stateFingerprint` over canonical config + all target file hashes. Issue single-use `planId`.
4. **Atomic Apply:** Require `approved: true`, verify `stateFingerprint` matches current disk state, write via temporary sibling file + `fs.renameSync`, and update `.agentcanon/manifest.json`.
