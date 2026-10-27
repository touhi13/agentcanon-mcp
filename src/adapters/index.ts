import { CanonicalConfig, Rule, AgentTarget, assertSafeRelativePath } from "../domain/schema.js";

export interface GeneratedProjection {
  path: string;
  adapter: AgentTarget;
  content: string;
  sourceRuleIds: string[];
  warnings: string[];
}

export interface AgentAdapter {
  id: AgentTarget;
  name: string;
  generate(config: CanonicalConfig, projectRoot: string): GeneratedProjection[];
}

function sortRulesDeterministically(rules: Rule[]): Rule[] {
  return [...rules].sort((a, b) => {
    if (b.priority !== a.priority) return b.priority - a.priority;
    return a.id.localeCompare(b.id);
  });
}

export const codexAdapter: AgentAdapter = {
  id: "codex",
  name: "OpenAI Codex (AGENTS.md)",
  generate(config, projectRoot) {
    const activeRules = sortRulesDeterministically(
      config.rules.filter((r) => r.enabled && r.targets.includes("codex"))
    );
    if (activeRules.length === 0) return [];

    const byDir = new Map<string, Rule[]>();
    for (const rule of activeRules) {
      const dir = rule.scope.directory?.trim().replace(/^\/+|\/+$/g, "") || "";
      const list = byDir.get(dir) ?? [];
      list.push(rule);
      byDir.set(dir, list);
    }

    const outputs: GeneratedProjection[] = [];
    for (const [dir, rules] of [...byDir.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
      const targetPath = dir ? `${dir}/AGENTS.md` : "AGENTS.md";
      const safePath = assertSafeRelativePath(projectRoot, targetPath);

      const sections = rules.map((r) => {
        const scopeNote =
          r.scope.include.length > 0 && !(r.scope.include.length === 1 && r.scope.include[0] === "**/*")
            ? `\n> **Applies to:** \`${r.scope.include.join("\`, \`")}\``
            : "";
        const excludeNote =
          r.scope.exclude.length > 0 ? `\n> **Excludes:** \`${r.scope.exclude.join("\`, \`")}\`` : "";

        return [
          `## ${r.title} (\`${r.id}\`)`,
          `**Category:** \`${r.category}\` | **Severity:** \`${r.severity.toUpperCase()}\` | **Priority:** ${r.priority}${scopeNote}${excludeNote}`,
          "",
          r.content.trim(),
        ].join("\n");
      });

      const content = [
        `<!-- Managed by AgentCanon MCP (.agentcanon/rules.yaml). Do not edit manually without syncing. -->`,
        `# ${config.project.name} — Agent Instructions${dir ? ` (${dir})` : ""}`,
        config.project.description ? `\n${config.project.description.trim()}\n` : "",
        ...sections.flatMap((s) => ["", s]),
        "",
      ]
        .filter((line, idx, arr) => !(line === "" && arr[idx - 1] === ""))
        .join("\n");

      outputs.push({
        path: safePath,
        adapter: "codex",
        content,
        sourceRuleIds: rules.map((r) => r.id),
        warnings: [],
      });
    }
    return outputs;
  },
};

export const cursorAdapter: AgentAdapter = {
  id: "cursor",
  name: "Cursor (.cursor/rules/*.mdc)",
  generate(config, projectRoot) {
    const activeRules = sortRulesDeterministically(
      config.rules.filter((r) => r.enabled && r.targets.includes("cursor"))
    );
    return activeRules.map((rule) => {
      const warnings: string[] = [];
      if (rule.scope.exclude.length > 0) {
        warnings.push(
          `Rule '${rule.id}': Cursor .mdc frontmatter does not natively enforce exclude globs (${rule.scope.exclude.join(", ")}); documented inline.`
        );
      }

      const isGlobal = rule.scope.include.length === 1 && rule.scope.include[0] === "**/*";
      const globsField = isGlobal ? "" : `globs: ${JSON.stringify(rule.scope.include)}\n`;
      const safePath = assertSafeRelativePath(
        projectRoot,
        `.cursor/rules/${rule.id}.mdc`
      );

      const excludeNotice =
        rule.scope.exclude.length > 0
          ? `\n> Note: Exclude files matching: \`${rule.scope.exclude.join("\`, \`")}\`\n`
          : "";

      const content = [
        "---",
        `description: ${JSON.stringify(`${rule.title} [${rule.severity}]`)}`,
        globsField.trimEnd(),
        `alwaysApply: ${isGlobal ? "true" : "false"}`,
        "---",
        `<!-- Managed by AgentCanon MCP (rule: ${rule.id}) -->`,
        `# ${rule.title}`,
        excludeNotice.trimEnd(),
        rule.content.trim(),
        "",
      ]
        .filter(Boolean)
        .join("\n");

      return {
        path: safePath,
        adapter: "cursor",
        content,
        sourceRuleIds: [rule.id],
        warnings,
      };
    });
  },
};

export const claudeAdapter: AgentAdapter = {
  id: "claude",
  name: "Claude Code (CLAUDE.md)",
  generate(config, projectRoot) {
    const activeRules = sortRulesDeterministically(
      config.rules.filter((r) => r.enabled && r.targets.includes("claude"))
    );
    if (activeRules.length === 0) return [];

    const safePath = assertSafeRelativePath(projectRoot, "CLAUDE.md");
    const sections = activeRules.map((r) =>
      [
        `## ${r.title}`,
        `- **Rule ID:** \`${r.id}\` (${r.severity})`,
        `- **Scope:** \`${r.scope.include.join("\`, \`")}\``,
        "",
        r.content.trim(),
      ].join("\n")
    );

    const content = [
      `<!-- Managed by AgentCanon MCP (.agentcanon/rules.yaml) -->`,
      `# CLAUDE.md — ${config.project.name}`,
      "",
      ...sections.flatMap((s) => [s, ""]),
    ].join("\n");

    return [
      {
        path: safePath,
        adapter: "claude",
        content,
        sourceRuleIds: activeRules.map((r) => r.id),
        warnings: [],
      },
    ];
  },
};

export const copilotAdapter: AgentAdapter = {
  id: "copilot",
  name: "GitHub Copilot (.github/copilot-instructions.md)",
  generate(config, projectRoot) {
    const activeRules = sortRulesDeterministically(
      config.rules.filter((r) => r.enabled && r.targets.includes("copilot"))
    );
    if (activeRules.length === 0) return [];

    const safePath = assertSafeRelativePath(
      projectRoot,
      ".github/copilot-instructions.md"
    );
    const sections = activeRules.map((r) =>
      [`## ${r.title} (\`${r.id}\`)`, r.content.trim()].join("\n\n")
    );

    const content = [
      `<!-- Managed by AgentCanon MCP (.agentcanon/rules.yaml) -->`,
      `# GitHub Copilot Instructions for ${config.project.name}`,
      "",
      ...sections.flatMap((s) => [s, ""]),
    ].join("\n");

    return [
      {
        path: safePath,
        adapter: "copilot",
        content,
        sourceRuleIds: activeRules.map((r) => r.id),
        warnings: [],
      },
    ];
  },
};

export const ADAPTER_REGISTRY: Record<AgentTarget, AgentAdapter> = {
  codex: codexAdapter,
  cursor: cursorAdapter,
  claude: claudeAdapter,
  copilot: copilotAdapter,
};
