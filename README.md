# 🛠️ AgentCanon MCP

> **One canonical source of truth for AI coding instructions across OpenAI Codex (`AGENTS.md`), Cursor (`.cursor/rules/*.mdc`), Claude Code (`CLAUDE.md`), and GitHub Copilot (`copilot-instructions.md`).**

[![CI Drift Check](https://github.com/touhi13/agentcanon-mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/touhi13/agentcanon-mcp/actions)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D20.0.0-brightgreen.svg)](https://nodejs.org)

**AgentCanon MCP** solves instruction fragmentation in modern AI-assisted engineering teams. Instead of manually maintaining duplicate and drifting `AGENTS.md`, `.cursor/rules/*.mdc`, `CLAUDE.md`, and `.github/copilot-instructions.md`, AgentCanon establishes a single canonical configuration (`agentcanon.config.json`) and projects native, deterministic rule files for each agent.

---

## 🌟 Strategic Key Features

- **🎯 OpenAI Codex Hierarchical Support**: Native multi-directory support for monorepos, compiling targeted `AGENTS.md` files into sub-packages alongside root instructions.
- **🔄 Deterministic Safe Sync Engine**: `Preview -> Approve -> Apply` transactional workflow with normalized SHA-256 hash drift detection and path-traversal security guards.
- **⚡ Dual Mode (MCP Server + CI Drift Checker)**: Run locally inside your favorite AI agent via the Model Context Protocol (stdio), or run in CI as a drift gate (`agentcanon-mcp --check`).
- **📥 Zero-Friction Onboarding**: Automatically import existing `.cursorrules`, `CLAUDE.md`, `AGENTS.md`, or `copilot-instructions.md` with the `import_existing_rules` tool.
- **📊 Token Budget & Context Guard**: Calculate estimated context token consumption before saving rules to prevent wasting LLM context windows.

---

## 📂 Architecture & Supported Adapters

| Target Agent | Output File | Scope & Features |
| :--- | :--- | :--- |
| **OpenAI Codex** | `AGENTS.md`, `<subpkg>/AGENTS.md` | Hierarchical sub-directory scoping, priority sorting |
| **Cursor** | `.cursor/rules/<id>.mdc` | Frontmatter metadata, glob scoping, modular files |
| **Claude Code** | `CLAUDE.md` | Single aggregated Markdown instruction profile |
| **GitHub Copilot** | `.github/copilot-instructions.md` | Standardized repository guidelines |

---

## 🚀 Quick Start

### 1. Installation
```bash
# Clone the repository
git clone https://github.com/touhi13/agentcanon-mcp.git
cd agentcanon-mcp

# Install dependencies & build
npm install
npm run build
npm test
```

### 2. Initialize in Any Project
```bash
# Create starter agentcanon.config.json
npx agentcanon-mcp --init

# Synchronize all agent instructions
npx agentcanon-mcp --apply

# Verify CI sync status
npx agentcanon-mcp --check
```

### 3. Connect via MCP (Model Context Protocol)

Add AgentCanon to your MCP client configuration (e.g. Claude Desktop, Cursor, or Antigravity):

```json
{
  "mcpServers": {
    "agentcanon": {
      "command": "node",
      "args": ["C:/laragon/www/agentcanon-mcp/dist/index.js"]
    }
  }
}
```

---

## 🧩 MCP Tools Reference

- **`preview_rules_sync`**: Generates a unified diff of all agent rule files without modifying disk.
- **`apply_rules_sync`**: Safely writes all synchronized projections to disk.
- **`validate_token_budget`**: Analyzes character count and estimates total token consumption across all active rules.
- **`import_existing_rules`**: Scans existing repository instruction files and merges them into `agentcanon.config.json`.

---

## 🧪 Testing

```bash
npm test
```

---

## 📄 License

MIT © 2026 AgentCanon MCP Contributors
