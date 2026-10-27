import { z } from 'zod';

export const RuleCategorySchema = z.enum([
  'architecture',
  'style',
  'security',
  'testing',
  'workflow',
]);

export const RuleSeveritySchema = z.enum(['error', 'warning', 'info']);

export const AgentTargetSchema = z.enum(['codex', 'cursor', 'claude', 'copilot']);

export const RuleSchema = z.object({
  id: z.string().min(1, 'Rule ID is required'),
  title: z.string().min(1, 'Rule Title is required'),
  category: RuleCategorySchema,
  severity: RuleSeveritySchema,
  priority: z.number().int().default(100),
  scope: z.object({
    directory: z.string().optional(),
    include: z.array(z.string()).default(['**/*']),
    exclude: z.array(z.string()).default([]),
  }).default({
    directory: '',
    include: ['**/*'],
    exclude: [],
  }),
  targets: z.array(AgentTargetSchema).default(['codex', 'cursor', 'claude', 'copilot']),
  enabled: z.boolean().default(true),
  content: z.string().min(1, 'Rule content cannot be empty'),
});

export const MasterConfigSchema = z.object({
  version: z.string().default('1.0.0'),
  projectName: z.string().min(1, 'Project name is required'),
  rules: z.array(RuleSchema),
});

export type Rule = z.infer<typeof RuleSchema>;
export type RuleCategory = z.infer<typeof RuleCategorySchema>;
export type RuleSeverity = z.infer<typeof RuleSeveritySchema>;
export type AgentTarget = z.infer<typeof AgentTargetSchema>;
export type MasterConfig = z.infer<typeof MasterConfigSchema>;
