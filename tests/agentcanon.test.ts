import { describe, it, expect } from 'vitest';
import { MasterConfigSchema } from '../src/domain/schema.js';
import { codexAdapter, cursorAdapter, claudeAdapter, copilotAdapter } from '../src/adapters/index.js';
import { previewSync, computeSha256 } from '../src/sync/engine.js';
import path from 'path';

describe('AgentCanon Core, Schema & Adapters', () => {
  const sampleConfig = {
    version: '1.0.0',
    projectName: 'TestProject',
    rules: [
      {
        id: 'SEC-01',
        title: 'No Hardcoded Secrets',
        category: 'security' as const,
        severity: 'error' as const,
        priority: 100,
        scope: { directory: '', include: ['**/*.ts'], exclude: ['**/*.test.ts'] },
        targets: ['codex' as const, 'cursor' as const, 'claude' as const, 'copilot' as const],
        enabled: true,
        content: 'Never hardcode API keys or credentials.'
      },
      {
        id: 'API-01',
        title: 'REST Conventions',
        category: 'architecture' as const,
        severity: 'warning' as const,
        priority: 90,
        scope: { directory: 'packages/api', include: ['**/*.ts'], exclude: [] },
        targets: ['codex' as const],
        enabled: true,
        content: 'Always return standard JSON response envelope.'
      }
    ]
  };

  it('validates master config schema with Zod', () => {
    const parsed = MasterConfigSchema.parse(sampleConfig);
    expect(parsed.projectName).toBe('TestProject');
    expect(parsed.rules.length).toBe(2);
  });

  it('generates hierarchical Codex AGENTS.md projections', () => {
    const config = MasterConfigSchema.parse(sampleConfig);
    const projections = codexAdapter.generate(config, process.cwd());
    expect(projections.length).toBe(2);

    // Root AGENTS.md
    const rootProj = projections.find(p => !p.filePath.includes('packages'));
    expect(rootProj).toBeDefined();
    expect(rootProj!.content).toContain('# Codex Instructions for TestProject');
    expect(rootProj!.content).toContain('No Hardcoded Secrets');
    expect(rootProj!.content).toContain('**Applies to:** `**/*.ts`');
    expect(rootProj!.content).toContain('**Excludes:** `**/*.test.ts`');

    // Nested packages/api/AGENTS.md
    const nestedProj = projections.find(p => p.filePath.includes(path.join('packages', 'api')));
    expect(nestedProj).toBeDefined();
    expect(nestedProj!.content).toContain('REST Conventions');
  });

  it('generates Cursor .mdc rule projection', () => {
    const config = MasterConfigSchema.parse(sampleConfig);
    const projections = cursorAdapter.generate(config, process.cwd());
    expect(projections.length).toBe(1);
    expect(projections[0].filePath).toContain(path.join('.cursor', 'rules', 'SEC-01.mdc'));
    expect(projections[0].content).toContain('description: No Hardcoded Secrets');
    expect(projections[0].content).toContain('globs: **/*.ts');
  });

  it('generates Claude CLAUDE.md projection', () => {
    const config = MasterConfigSchema.parse(sampleConfig);
    const projections = claudeAdapter.generate(config, process.cwd());
    expect(projections.length).toBe(1);
    expect(projections[0].filePath).toContain('CLAUDE.md');
    expect(projections[0].content).toContain('# CLAUDE.md - TestProject');
    expect(projections[0].content).toContain('No Hardcoded Secrets');
  });

  it('generates Copilot copilot-instructions.md projection', () => {
    const config = MasterConfigSchema.parse(sampleConfig);
    const projections = copilotAdapter.generate(config, process.cwd());
    expect(projections.length).toBe(1);
    expect(projections[0].filePath).toContain(path.join('.github', 'copilot-instructions.md'));
    expect(projections[0].content).toContain('# GitHub Copilot Instructions for TestProject');
  });

  it('computes deterministic normalized SHA-256 hash', () => {
    const hash1 = computeSha256('Hello World\r\n');
    const hash2 = computeSha256('Hello World\n');
    expect(hash1).toBe(hash2);
  });
});
