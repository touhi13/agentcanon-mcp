import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import YAML from "yaml";
import {
  AgentTarget,
  CanonicalConfig,
  CanonicalConfigSchema,
  PlannedFileChange,
  SyncManifest,
  SyncPlan,
  assertSafeRelativePath,
} from "../domain/schema.js";
import { ADAPTER_REGISTRY, GeneratedProjection } from "../adapters/index.js";

export function sha256(content: string): string {
  // Normalize line endings to avoid CRLF vs LF drift false positives across Windows and Linux
  const normalized = content.replace(/\r\n/g, "\n");
  return crypto.createHash("sha256").update(normalized, "utf8").digest("hex");
}

export function createSimpleDiff(oldText: string | null, newText: string, filePath: string): string {
  if (oldText === null) {
    const addedLines = newText.split("\n").map((l) => `+ ${l}`).join("\n");
    return `--- /dev/null\n+++ b/${filePath}\n${addedLines}`;
  }
  if (oldText === newText) {
    return `No changes in ${filePath}`;
  }
  const oldLines = oldText.split("\n");
  const newLines = newText.split("\n");
  const preview: string[] = [`--- a/${filePath}`, `+++ b/${filePath}`];
  const maxLines = Math.max(oldLines.length, newLines.length);
  for (let i = 0; i < maxLines; i++) {
    const o = oldLines[i];
    const n = newLines[i];
    if (o !== n) {
      if (o !== undefined) preview.push(`- ${o}`);
      if (n !== undefined) preview.push(`+ ${n}`);
    }
  }
  return preview.slice(0, 60).join("\n");
}

export function assertNoSymlinkEscape(projectRoot: string, relPath: string): void {
  const safeRel = assertSafeRelativePath(projectRoot, relPath);
  const rootReal = fs.realpathSync(projectRoot);
  const parts = safeRel.split("/");
  let current = rootReal;
  for (const part of parts) {
    current = path.join(current, part);
    if (fs.existsSync(current)) {
      const stat = fs.lstatSync(current);
      if (stat.isSymbolicLink()) {
        throw new Error(`Security rejection: Symlink detected along path '${relPath}'`);
      }
      const realCurrent = fs.realpathSync(current);
      const relToRoot = path.relative(rootReal, realCurrent);
      if (relToRoot.startsWith("..") || path.isAbsolute(relToRoot)) {
        throw new Error(`Security rejection: Path escapes repository root '${relPath}'`);
      }
    }
  }
}

export class AgentCanonEngine {
  private activePlans = new Map<string, SyncPlan>();

  constructor(private readonly projectRoot: string) {
    if (!fs.existsSync(this.projectRoot)) {
      throw new Error(`Project root does not exist: ${this.projectRoot}`);
    }
  }

  public get rulesPath(): string {
    return path.join(this.projectRoot, ".agentcanon", "rules.yaml");
  }

  public get manifestPath(): string {
    return path.join(this.projectRoot, ".agentcanon", "manifest.json");
  }

  public hasCanonicalRules(): boolean {
    return fs.existsSync(this.rulesPath);
  }

  public loadConfig(): { config: CanonicalConfig; rawContent: string; configSha256: string } {
    if (!fs.existsSync(this.rulesPath)) {
      throw new Error(
        `Canonical rules file not found at ${this.rulesPath}. Run 'import_existing_rules' or '--init' first.`
      );
    }
    const rawContent = fs.readFileSync(this.rulesPath, "utf8");
    const parsedYaml = YAML.parse(rawContent);
    const config = CanonicalConfigSchema.parse(parsedYaml);
    return {
      config,
      rawContent,
      configSha256: sha256(rawContent),
    };
  }

  public saveConfig(config: CanonicalConfig): void {
    const validated = CanonicalConfigSchema.parse(config);
    assertNoSymlinkEscape(this.projectRoot, ".agentcanon/rules.yaml");
    const dir = path.dirname(this.rulesPath);
    fs.mkdirSync(dir, { recursive: true });
    const yamlText = YAML.stringify(validated);
    fs.writeFileSync(this.rulesPath, yamlText, "utf8");
  }

  public loadManifest(): SyncManifest {
    if (!fs.existsSync(this.manifestPath)) {
      return {
        schemaVersion: 1,
        configSha256: "",
        files: {},
      };
    }
    const raw = fs.readFileSync(this.manifestPath, "utf8");
    return JSON.parse(raw) as SyncManifest;
  }

  private saveManifest(manifest: SyncManifest): void {
    assertNoSymlinkEscape(this.projectRoot, ".agentcanon/manifest.json");
    fs.mkdirSync(path.dirname(this.manifestPath), { recursive: true });
    fs.writeFileSync(this.manifestPath, JSON.stringify(manifest, null, 2) + "\n", "utf8");
  }

  public validateRules(): {
    valid: boolean;
    errors: string[];
    warnings: string[];
    estimatedTokens: number;
  } {
    const errors: string[] = [];
    const warnings: string[] = [];
    let config: CanonicalConfig;
    try {
      config = this.loadConfig().config;
    } catch (err) {
      return {
        valid: false,
        errors: [err instanceof Error ? err.message : String(err)],
        warnings: [],
        estimatedTokens: 0,
      };
    }

    const seenIds = new Set<string>();
    for (const rule of config.rules) {
      if (seenIds.has(rule.id)) {
        errors.push(`Duplicate rule ID found: '${rule.id}'`);
      }
      seenIds.add(rule.id);
    }

    const activeRules = config.rules.filter((r) => r.enabled);
    for (let i = 0; i < activeRules.length; i++) {
      for (let j = i + 1; j < activeRules.length; j++) {
        const a = activeRules[i];
        const b = activeRules[j];
        const textA = a.content.toLowerCase();
        const textB = b.content.toLowerCase();
        if (
          (textA.includes("use tabs") && textB.includes("use spaces")) ||
          (textA.includes("use spaces") && textB.includes("use tabs"))
        ) {
          warnings.push(
            `Potential formatting conflict between '${a.id}' and '${b.id}' (tabs vs spaces).`
          );
        }
      }
    }

    const projections = this.generateProjections(config.targets);
    for (const p of projections) {
      warnings.push(...p.warnings);
    }

    const totalChars = activeRules.reduce((acc, r) => acc + r.content.length, 0);
    const estimatedTokens = Math.ceil(totalChars / 4);
    if (estimatedTokens > 4000) {
      warnings.push(
        `High instruction token volume (~${estimatedTokens} tokens). Consider scoping rules to specific directories.`
      );
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      estimatedTokens,
    };
  }

  public generateProjections(targets?: AgentTarget[]): GeneratedProjection[] {
    const { config } = this.loadConfig();
    const selectedTargets = targets && targets.length > 0 ? targets : config.targets;
    const results: GeneratedProjection[] = [];
    for (const target of selectedTargets) {
      const adapter = ADAPTER_REGISTRY[target];
      if (!adapter) continue;
      results.push(...adapter.generate(config, this.projectRoot));
    }
    return results.sort((a, b) => a.path.localeCompare(b.path));
  }

  private computeFilesystemFingerprint(paths: string[], configSha256: string): string {
    const parts: string[] = [`config:${configSha256}`];
    for (const relPath of [...paths].sort()) {
      const fullPath = path.join(this.projectRoot, relPath);
      if (!fs.existsSync(fullPath)) {
        parts.push(`${relPath}:MISSING`);
      } else {
        const content = fs.readFileSync(fullPath, "utf8");
        parts.push(`${relPath}:${sha256(content)}`);
      }
    }
    return sha256(parts.join("|"));
  }

  public previewSync(options?: {
    targets?: AgentTarget[];
    allowOverwriteConflicts?: boolean;
  }): SyncPlan {
    const { config, configSha256 } = this.loadConfig();
    const manifest = this.loadManifest();
    const projections = this.generateProjections(options?.targets ?? config.targets);
    const changes: PlannedFileChange[] = [];

    for (const proj of projections) {
      assertNoSymlinkEscape(this.projectRoot, proj.path);
      const fullPath = path.join(this.projectRoot, proj.path);
      const newSha = sha256(proj.content);
      const managedEntry = manifest.files[proj.path];

      if (!fs.existsSync(fullPath)) {
        changes.push({
          path: proj.path,
          adapter: proj.adapter,
          action: "create",
          conflict: false,
          newContent: proj.content,
          newSha256: newSha,
          diffPreview: createSimpleDiff(null, proj.content, proj.path),
          sourceRuleIds: proj.sourceRuleIds,
        });
        continue;
      }

      const currentDiskContent = fs.readFileSync(fullPath, "utf8");
      const currentDiskSha = sha256(currentDiskContent);

      if (currentDiskSha === newSha) {
        changes.push({
          path: proj.path,
          adapter: proj.adapter,
          action: "unchanged",
          conflict: false,
          newContent: proj.content,
          newSha256: newSha,
          previousSha256: currentDiskSha,
          diffPreview: `No changes in ${proj.path}`,
          sourceRuleIds: proj.sourceRuleIds,
        });
        continue;
      }

      if (!managedEntry) {
        const canForce = options?.allowOverwriteConflicts === true;
        changes.push({
          path: proj.path,
          adapter: proj.adapter,
          action: canForce ? "update" : "conflict_unmanaged_exists",
          conflict: !canForce,
          reason: canForce
            ? "Overwriting pre-existing unmanaged file (explicitly allowed)."
            : "Existing file is not managed by AgentCanon. Refusing silent overwrite.",
          newContent: proj.content,
          newSha256: newSha,
          previousSha256: currentDiskSha,
          diffPreview: createSimpleDiff(currentDiskContent, proj.content, proj.path),
          sourceRuleIds: proj.sourceRuleIds,
        });
        continue;
      }

      if (managedEntry.sha256 !== currentDiskSha) {
        const canForce = options?.allowOverwriteConflicts === true;
        changes.push({
          path: proj.path,
          adapter: proj.adapter,
          action: canForce ? "update" : "conflict_modified_by_user",
          conflict: !canForce,
          reason: canForce
            ? "Overwriting locally modified file (explicitly allowed)."
            : "File was manually edited outside AgentCanon since last sync.",
          newContent: proj.content,
          newSha256: newSha,
          previousSha256: currentDiskSha,
          diffPreview: createSimpleDiff(currentDiskContent, proj.content, proj.path),
          sourceRuleIds: proj.sourceRuleIds,
        });
        continue;
      }

      changes.push({
        path: proj.path,
        adapter: proj.adapter,
        action: "update",
        conflict: false,
        newContent: proj.content,
        newSha256: newSha,
        previousSha256: currentDiskSha,
        diffPreview: createSimpleDiff(currentDiskContent, proj.content, proj.path),
        sourceRuleIds: proj.sourceRuleIds,
      });
    }

    const trackedPaths = changes.map((c) => c.path);
    const stateFingerprint = this.computeFilesystemFingerprint(trackedPaths, configSha256);
    const planId = `acplan_${crypto.randomBytes(12).toString("hex")}`;
    const hasConflicts = changes.some((c) => c.conflict);

    const plan: SyncPlan = {
      planId,
      createdAt: new Date().toISOString(),
      projectRoot: this.projectRoot,
      configSha256,
      stateFingerprint,
      hasConflicts,
      requiresApproval: changes.some((c) => c.action === "create" || c.action === "update"),
      changes,
    };

    this.activePlans.set(planId, plan);
    return plan;
  }

  public applySync(params: { planId: string; approved: boolean }): {
    appliedPlanId: string;
    writtenFiles: string[];
    unchangedFiles: string[];
  } {
    if (!params.approved) {
      throw new Error("Sync rejected: explicit user approval (approved: true) is required.");
    }

    const plan = this.activePlans.get(params.planId);
    if (!plan) {
      throw new Error(
        `Invalid or already-consumed planId '${params.planId}'. Generate a fresh preview_sync plan first.`
      );
    }
    this.activePlans.delete(params.planId);

    if (plan.hasConflicts) {
      throw new Error(
        "Cannot apply sync plan with unresolved file conflicts. Resolve conflicts or run preview_sync with allowOverwriteConflicts: true."
      );
    }

    const { configSha256 } = this.loadConfig();
    const currentFingerprint = this.computeFilesystemFingerprint(
      plan.changes.map((c) => c.path),
      configSha256
    );

    if (currentFingerprint !== plan.stateFingerprint) {
      throw new Error(
        "Stale sync plan rejected: canonical rules or target files changed after preview_sync was generated."
      );
    }

    const manifest = this.loadManifest();
    const writtenFiles: string[] = [];
    const unchangedFiles: string[] = [];

    for (const change of plan.changes) {
      assertNoSymlinkEscape(this.projectRoot, change.path);
      if (change.action === "unchanged") {
        unchangedFiles.push(change.path);
        manifest.files[change.path] = {
          path: change.path,
          adapter: change.adapter,
          sha256: change.newSha256,
          sourceRuleIds: change.sourceRuleIds,
          updatedAt: new Date().toISOString(),
        };
        continue;
      }

      if (change.action === "create" || change.action === "update") {
        const fullPath = path.join(this.projectRoot, change.path);
        fs.mkdirSync(path.dirname(fullPath), { recursive: true });
        const tempPath = `${fullPath}.agentcanon-tmp-${process.pid}`;
        fs.writeFileSync(tempPath, change.newContent, "utf8");
        fs.renameSync(tempPath, fullPath);
        writtenFiles.push(change.path);
        manifest.files[change.path] = {
          path: change.path,
          adapter: change.adapter,
          sha256: change.newSha256,
          sourceRuleIds: change.sourceRuleIds,
          updatedAt: new Date().toISOString(),
        };
      }
    }

    manifest.configSha256 = configSha256;
    this.saveManifest(manifest);

    return {
      appliedPlanId: plan.planId,
      writtenFiles,
      unchangedFiles,
    };
  }

  public importExistingRules(): { importedRules: number; sourceFiles: string[] } {
    const candidates = ["AGENTS.md", "CLAUDE.md", ".github/copilot-instructions.md"];
    const foundFiles: string[] = [];
    const importedRules = [];

    for (const rel of candidates) {
      const full = path.join(this.projectRoot, rel);
      if (fs.existsSync(full)) {
        foundFiles.push(rel);
        const raw = fs.readFileSync(full, "utf8").trim();
        if (raw.length >= 10 && !raw.includes("Managed by AgentCanon MCP")) {
          const slug = rel
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-|-$/g, "");
          importedRules.push({
            id: `imported-${slug}`,
            title: `Imported instructions from ${rel}`,
            category: "general" as const,
            scope: { include: ["**/*"], exclude: [] },
            priority: 60,
            severity: "recommended" as const,
            content: raw,
            targets: ["codex", "cursor", "claude", "copilot"] as AgentTarget[],
            enabled: true,
          });
        }
      }
    }

    const projectName = path.basename(path.resolve(this.projectRoot)) || "agentcanon-mcp";
    const config: CanonicalConfig = {
      schemaVersion: 1,
      project: {
        name: projectName,
        description: "Canonical AI coding rules managed by AgentCanon MCP",
      },
      targets: ["codex", "cursor", "claude", "copilot"],
      rules:
        importedRules.length > 0
          ? importedRules
          : [
              {
                id: "typescript-strict-architecture",
                title: "Strict TypeScript & Zod Boundary Validation",
                category: "coding-style",
                scope: { include: ["src/**/*.ts"], exclude: ["tests/**/*.ts"] },
                priority: 90,
                severity: "required",
                content:
                  "Use strict TypeScript with NodeNext module resolution.\nValidate all external MCP inputs and YAML files using Zod schemas in `src/domain/schema.ts`.\nNever use `any` or bypass path traversal checks.",
                targets: ["codex", "cursor", "claude", "copilot"],
                enabled: true,
              },
              {
                id: "safe-transactional-sync",
                title: "Non-Destructive Preview -> Approve -> Apply Sync",
                category: "security",
                scope: { include: ["src/sync/**/*.ts", "src/adapters/**/*.ts"], exclude: [] },
                priority: 85,
                severity: "required",
                content:
                  "All file mutations must go through `previewSync` and `applySync`.\nVerify SHA-256 content hashes and reject symlink escapes (`assertNoSymlinkEscape`) before writing any file.",
                targets: ["codex", "cursor", "claude", "copilot"],
                enabled: true,
              },
            ],
    };

    this.saveConfig(config);
    return {
      importedRules: config.rules.length,
      sourceFiles: foundFiles,
    };
  }
}
