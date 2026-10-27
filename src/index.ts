#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import fs from "node:fs";
import path from "node:path";
import { AgentCanonEngine } from "./sync/engine.js";
import { AgentTargetSchema, RuleSchema } from "./domain/schema.js";

function resolveProjectRoot(rootArg?: string): string {
  return path.resolve(rootArg || process.cwd());
}

const engineCache = new Map<string, AgentCanonEngine>();

function getSharedEngine(root: string): AgentCanonEngine {
  let engine = engineCache.get(root);
  if (!engine) {
    engine = new AgentCanonEngine(root);
    engineCache.set(root, engine);
  }
  return engine;
}

export function createAgentCanonMcpServer(defaultRoot?: string): McpServer {
  const server = new McpServer({
    name: "agentcanon-mcp",
    version: "0.1.0",
  });

  server.tool(
    "inspect_project",
    "Detects repository structure, existing agent instruction files (AGENTS.md, CLAUDE.md, .cursor/rules), and AgentCanon status.",
    {
      projectRoot: z.string().optional().describe("Absolute path to project root"),
    },
    async ({ projectRoot }) => {
      const root = resolveProjectRoot(projectRoot ?? defaultRoot);
      const engine = getSharedEngine(root);
      const detectedInstructionFiles = [
        "AGENTS.md",
        "CLAUDE.md",
        ".github/copilot-instructions.md",
        ".cursor/rules",
      ].filter((rel) => fs.existsSync(path.join(root, rel)));

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                projectRoot: root,
                hasCanonicalRules: engine.hasCanonicalRules(),
                canonicalRulesPath: ".agentcanon/rules.yaml",
                detectedInstructionFiles,
              },
              null,
              2
            ),
          },
        ],
      };
    }
  );

  server.tool(
    "import_existing_rules",
    "Bootstraps .agentcanon/rules.yaml from existing AGENTS.md, CLAUDE.md, or creates a starter configuration.",
    {
      projectRoot: z.string().optional(),
    },
    async ({ projectRoot }) => {
      const root = resolveProjectRoot(projectRoot ?? defaultRoot);
      const engine = getSharedEngine(root);
      const res = engine.importExistingRules();
      return {
        content: [{ type: "text", text: JSON.stringify(res, null, 2) }],
      };
    }
  );

  server.tool(
    "list_rules",
    "Lists all canonical rules and metadata from .agentcanon/rules.yaml.",
    {
      projectRoot: z.string().optional(),
    },
    async ({ projectRoot }) => {
      const root = resolveProjectRoot(projectRoot ?? defaultRoot);
      const engine = getSharedEngine(root);
      const { config } = engine.loadConfig();
      return {
        content: [{ type: "text", text: JSON.stringify(config, null, 2) }],
      };
    }
  );

  server.tool(
    "upsert_rule",
    "Creates or updates a canonical rule inside .agentcanon/rules.yaml with Zod schema validation.",
    {
      projectRoot: z.string().optional(),
      rule: RuleSchema,
    },
    async ({ projectRoot, rule }) => {
      const root = resolveProjectRoot(projectRoot ?? defaultRoot);
      const engine = getSharedEngine(root);
      const { config } = engine.loadConfig();
      const idx = config.rules.findIndex((r) => r.id === rule.id);
      const action = idx >= 0 ? "updated" : "created";
      if (idx >= 0) {
        config.rules[idx] = rule;
      } else {
        config.rules.push(rule);
      }
      engine.saveConfig(config);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ status: action, ruleId: rule.id }, null, 2),
          },
        ],
      };
    }
  );

  server.tool(
    "validate_rules",
    "Validates canonical rules for schema errors, duplicate IDs, formatting conflicts, adapter warnings, and token budget.",
    {
      projectRoot: z.string().optional(),
    },
    async ({ projectRoot }) => {
      const root = resolveProjectRoot(projectRoot ?? defaultRoot);
      const engine = getSharedEngine(root);
      const report = engine.validateRules();
      return {
        content: [{ type: "text", text: JSON.stringify(report, null, 2) }],
      };
    }
  );

  server.tool(
    "preview_sync",
    "Computes deterministic agent projections, checks for manual drift/conflicts, and returns an approval-bound planId with file diffs.",
    {
      projectRoot: z.string().optional(),
      targets: z.array(AgentTargetSchema).optional(),
      allowOverwriteConflicts: z.boolean().optional(),
    },
    async ({ projectRoot, targets, allowOverwriteConflicts }) => {
      const root = resolveProjectRoot(projectRoot ?? defaultRoot);
      const engine = getSharedEngine(root);
      const plan = engine.previewSync({ targets, allowOverwriteConflicts });
      return {
        content: [{ type: "text", text: JSON.stringify(plan, null, 2) }],
      };
    }
  );

  server.tool(
    "apply_sync",
    "Applies a previously previewed sync plan after explicit user approval, verifying no files changed since preview.",
    {
      projectRoot: z.string().optional(),
      planId: z.string(),
      approved: z.boolean(),
    },
    async ({ projectRoot, planId, approved }) => {
      const root = resolveProjectRoot(projectRoot ?? defaultRoot);
      const engine = getSharedEngine(root);
      const result = engine.applySync({ planId, approved });
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    }
  );

  return server;
}

async function main() {
  const args = process.argv.slice(2);

  if (args.includes("--init")) {
    const engine = new AgentCanonEngine(process.cwd());
    const res = engine.importExistingRules();
    console.log(`Initialized .agentcanon/rules.yaml (${res.importedRules} rule(s)).`);
    process.exit(0);
  }

  if (args.includes("--sync-yes")) {
    const engine = new AgentCanonEngine(process.cwd());
    const plan = engine.previewSync({ allowOverwriteConflicts: true });
    const res = engine.applySync({ planId: plan.planId, approved: true });
    console.log(`Synced ${res.writtenFiles.length} file(s):`, res.writtenFiles);
    process.exit(0);
  }

  if (args.includes("--check")) {
    const engine = new AgentCanonEngine(process.cwd());
    const validation = engine.validateRules();
    if (!validation.valid) {
      console.error("AgentCanon validation failed:", validation.errors);
      process.exit(1);
    }
    const plan = engine.previewSync();
    const drifted = plan.changes.filter((c) => c.action !== "unchanged");
    if (drifted.length > 0) {
      console.error(
        `AgentCanon drift detected in ${drifted.length} file(s):`,
        drifted.map((d) => `${d.path} (${d.action})`)
      );
      process.exit(1);
    }
    console.log("AgentCanon check passed: all agent instruction files are in sync.");
    process.exit(0);
  }

  const server = createAgentCanonMcpServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error("AgentCanon MCP fatal error:", err);
  process.exit(1);
});
