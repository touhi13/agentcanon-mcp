import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { AgentCanonEngine } from "../src/sync/engine.js";
import { assertSafeRelativePath } from "../src/domain/schema.js";

describe("AgentCanon MCP Core & Security Suite", () => {
  let tmpDir: string;
  let engine: AgentCanonEngine;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "agentcanon-test-"));
    engine = new AgentCanonEngine(tmpDir);
    engine.importExistingRules();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("generates deterministic output for Codex (AGENTS.md) and Cursor (.mdc)", () => {
    const first = engine.generateProjections(["codex", "cursor"]);
    const second = engine.generateProjections(["codex", "cursor"]);
    expect(first).toEqual(second);
    expect(first.some((p) => p.path === "AGENTS.md")).toBe(true);
    expect(
      first.some((p) => p.path === ".cursor/rules/typescript-strict-architecture.mdc")
    ).toBe(true);
  });

  it("supports hierarchical nested AGENTS.md projections for OpenAI Codex", () => {
    const { config } = engine.loadConfig();
    config.rules.push({
      id: "api-package-rules",
      title: "API Layer Rules",
      category: "architecture",
      scope: {
        include: ["packages/api/**/*.ts"],
        exclude: [],
        directory: "packages/api",
      },
      priority: 75,
      severity: "required",
      content: "Keep all route handlers stateless and validate payloads with Zod.",
      targets: ["codex"],
      enabled: true,
    });
    engine.saveConfig(config);

    const projections = engine.generateProjections(["codex"]);
    expect(projections.map((p) => p.path)).toEqual([
      "AGENTS.md",
      "packages/api/AGENTS.md",
    ]);
  });

  it("enforces Preview -> Approval -> Apply and blocks replay of the same planId", () => {
    const plan = engine.previewSync({ targets: ["codex"] });
    expect(plan.requiresApproval).toBe(true);
    expect(() => engine.applySync({ planId: plan.planId, approved: false })).toThrow(
      /explicit user approval/
    );

    const plan2 = engine.previewSync({ targets: ["codex"] });
    const res = engine.applySync({ planId: plan2.planId, approved: true });
    expect(res.writtenFiles).toContain("AGENTS.md");
    expect(fs.existsSync(path.join(tmpDir, "AGENTS.md"))).toBe(true);

    expect(() => engine.applySync({ planId: plan2.planId, approved: true })).toThrow(
      /Invalid or already-consumed planId/
    );
  });

  it("detects human edits to managed AGENTS.md and refuses silent overwrite", () => {
    const initialPlan = engine.previewSync({ targets: ["codex"] });
    engine.applySync({ planId: initialPlan.planId, approved: true });

    const agentsPath = path.join(tmpDir, "AGENTS.md");
    fs.appendFileSync(agentsPath, "\n# Manual Developer Note\n", "utf8");

    const { config } = engine.loadConfig();
    config.rules[0].content += "\nAlways write unit tests.";
    engine.saveConfig(config);

    const conflictPlan = engine.previewSync({ targets: ["codex"] });
    expect(conflictPlan.hasConflicts).toBe(true);
    expect(conflictPlan.changes[0].action).toBe("conflict_modified_by_user");

    expect(() =>
      engine.applySync({ planId: conflictPlan.planId, approved: true })
    ).toThrow(/unresolved file conflicts/);
  });

  it("rejects stale plan if target file changes between preview and apply", () => {
    const plan = engine.previewSync({ targets: ["codex"] });
    fs.writeFileSync(path.join(tmpDir, "AGENTS.md"), "rogue modification", "utf8");
    expect(() => engine.applySync({ planId: plan.planId, approved: true })).toThrow(
      /Stale sync plan rejected/
    );
  });

  it("blocks path traversal outside project root", () => {
    expect(() => assertSafeRelativePath(tmpDir, "../../etc/passwd")).toThrow(
      /Path traversal detected/
    );
    expect(() => assertSafeRelativePath(tmpDir, "/etc/passwd")).toThrow(
      /Unsafe or absolute path/
    );
  });
});
