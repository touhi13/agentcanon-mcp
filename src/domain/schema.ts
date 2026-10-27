import { z } from "zod";
import path from "node:path";

export const AgentTargetSchema = z.enum([
  "codex",
  "cursor",
  "claude",
  "copilot",
]);
export type AgentTarget = z.infer<typeof AgentTargetSchema>;

export const RuleCategorySchema = z.enum([
  "general",
  "architecture",
  "coding-style",
  "testing",
  "security",
]);

export const RuleSeveritySchema = z.enum(["required", "recommended", "advisory"]);

export const RuleScopeSchema = z.object({
  include: z.array(z.string()).default(["**/*"]),
  exclude: z.array(z.string()).default([]),
  directory: z.string().optional(),
});

export const RuleSchema = z.object({
  id: z
    .string()
    .regex(
      /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
      "Rule ID must be lowercase kebab-case (e.g., 'coding-typescript')"
    ),
  title: z.string().min(3).max(120),
  category: RuleCategorySchema.default("general"),
  scope: RuleScopeSchema.default({ include: ["**/*"], exclude: [] }),
  priority: z.number().int().min(1).max(100).default(50),
  severity: RuleSeveritySchema.default("recommended"),
  content: z.string().min(10, "Rule content must be at least 10 characters"),
  targets: z.array(AgentTargetSchema).min(1),
  enabled: z.boolean().default(true),
});

export type Rule = z.infer<typeof RuleSchema>;

export const CanonicalConfigSchema = z.object({
  schemaVersion: z.literal(1),
  project: z.object({
    name: z.string().min(1),
    description: z.string().optional(),
  }),
  targets: z
    .array(AgentTargetSchema)
    .default(["codex", "cursor", "claude", "copilot"]),
  rules: z.array(RuleSchema),
});

export type CanonicalConfig = z.infer<typeof CanonicalConfigSchema>;

export interface ManagedFileEntry {
  path: string;
  adapter: AgentTarget;
  sha256: string;
  sourceRuleIds: string[];
  updatedAt: string;
}

export interface SyncManifest {
  schemaVersion: 1;
  configSha256: string;
  files: Record<string, ManagedFileEntry>;
}

export type FileChangeAction =
  | "create"
  | "update"
  | "unchanged"
  | "conflict_modified_by_user"
  | "conflict_unmanaged_exists";

export interface PlannedFileChange {
  path: string;
  adapter: AgentTarget;
  action: FileChangeAction;
  conflict: boolean;
  reason?: string;
  newContent: string;
  newSha256: string;
  previousSha256?: string;
  diffPreview: string;
  sourceRuleIds: string[];
}

export interface SyncPlan {
  planId: string;
  createdAt: string;
  projectRoot: string;
  configSha256: string;
  stateFingerprint: string;
  hasConflicts: boolean;
  requiresApproval: boolean;
  changes: PlannedFileChange[];
}

export function assertSafeRelativePath(projectRoot: string, relPath: string): string {
  if (!relPath || path.isAbsolute(relPath) || relPath.includes("\0")) {
    throw new Error(`Unsafe or absolute path rejected: ${relPath}`);
  }
  const normalizedRoot = path.resolve(projectRoot);
  const resolvedTarget = path.resolve(normalizedRoot, relPath);
  const relative = path.relative(normalizedRoot, resolvedTarget);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`Path traversal detected outside project root: ${relPath}`);
  }
  return relative.split(path.sep).join("/");
}
