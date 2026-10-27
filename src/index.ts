#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import fs from 'fs/promises';
import path from 'path';
import { MasterConfigSchema, MasterConfig, Rule } from './domain/schema.js';
import { previewSync, applySync } from './sync/engine.js';

const CONFIG_FILENAME = 'agentcanon.config.json';

export async function loadConfig(projectRoot: string): Promise<MasterConfig> {
  const configPath = path.join(projectRoot, CONFIG_FILENAME);
  const raw = await fs.readFile(configPath, 'utf8');
  const json = JSON.parse(raw);
  return MasterConfigSchema.parse(json);
}

export async function saveConfig(projectRoot: string, config: MasterConfig): Promise<void> {
  const configPath = path.join(projectRoot, CONFIG_FILENAME);
  await fs.writeFile(configPath, JSON.stringify(config, null, 2), 'utf8');
}

// -------------------------------------------------------------
// CLI Handler
// -------------------------------------------------------------
const args = process.argv.slice(2);

if (args.includes('--init')) {
  (async () => {
    const root = process.cwd();
    const configPath = path.join(root, CONFIG_FILENAME);
    try {
      await fs.access(configPath);
      console.log(`[AgentCanon] ${CONFIG_FILENAME} already exists at ${configPath}`);
      process.exit(0);
    } catch {
      const initialConfig: MasterConfig = {
        version: '1.0.0',
        projectName: path.basename(root) || 'my-project',
        rules: [
          {
            id: 'SEC-01',
            title: 'No Hardcoded Secrets',
            category: 'security',
            severity: 'error',
            priority: 100,
            scope: { directory: '', include: ['**/*'], exclude: [] },
            targets: ['codex', 'cursor', 'claude', 'copilot'],
            enabled: true,
            content: 'Never hardcode API keys or credentials. Use environment variables.',
          },
        ],
      };
      await fs.writeFile(configPath, JSON.stringify(initialConfig, null, 2), 'utf8');
      console.log(`[AgentCanon] Initialized ${CONFIG_FILENAME} successfully.`);
      process.exit(0);
    }
  })();
} else if (args.includes('--check')) {
  (async () => {
    const root = process.cwd();
    try {
      const config = await loadConfig(root);
      const preview = await previewSync(config, root);
      const modified = preview.diffs.filter(d => d.action !== 'unchanged');
      if (modified.length > 0) {
        console.error(`[AgentCanon CI] Drift detected! Following files are out of sync:`);
        modified.forEach(m => console.error(` - ${m.filePath} (${m.action})`));
        console.error(`\nRun 'npx agentcanon-mcp --apply' or use the MCP server to synchronize.`);
        process.exit(1);
      }
      console.log(`[AgentCanon CI] All instruction files are fully synchronized.`);
      process.exit(0);
    } catch (err: any) {
      console.error(`[AgentCanon CI Error]:`, err.message);
      process.exit(2);
    }
  })();
} else if (args.includes('--apply')) {
  (async () => {
    const root = process.cwd();
    try {
      const config = await loadConfig(root);
      const updated = await applySync(config, root);
      console.log(`[AgentCanon] Successfully synchronized ${updated.length} files:`);
      updated.forEach(f => console.log(` - ${f}`));
      process.exit(0);
    } catch (err: any) {
      console.error(`[AgentCanon Error]:`, err.message);
      process.exit(1);
    }
  })();
} else {
  // -----------------------------------------------------------
  // MCP Server Handler (stdio)
  // -----------------------------------------------------------
  const server = new Server(
    { name: 'agentcanon-mcp', version: '1.0.0' },
    { capabilities: { tools: {} } }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
      {
        name: 'preview_rules_sync',
        description: 'Preview changes required to synchronize rules across AGENTS.md (Codex), .cursor/rules (*.mdc), CLAUDE.md, and Copilot.',
        inputSchema: {
          type: 'object',
          properties: {
            projectRoot: {
              type: 'string',
              description: 'Root directory of the project (defaults to current working directory)',
            },
          },
        },
      },
      {
        name: 'apply_rules_sync',
        description: 'Approve and write synchronized rule projections to disk with transaction safety and drift resolution.',
        inputSchema: {
          type: 'object',
          properties: {
            projectRoot: {
              type: 'string',
              description: 'Root directory of the project (defaults to current working directory)',
            },
          },
        },
      },
      {
        name: 'validate_token_budget',
        description: 'Check total token size of active instruction rules against AI context limits.',
        inputSchema: {
          type: 'object',
          properties: {
            projectRoot: {
              type: 'string',
              description: 'Root directory of the project (defaults to current working directory)',
            },
          },
        },
      },
      {
        name: 'import_existing_rules',
        description: 'Scan and import legacy rules (.cursorrules, CLAUDE.md, AGENTS.md, copilot-instructions.md) into ruleforge.config.json.',
        inputSchema: {
          type: 'object',
          properties: {
            projectRoot: {
              type: 'string',
              description: 'Root directory of the project (defaults to current working directory)',
            },
          },
        },
      },
    ],
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: toolArgs } = request.params;
    const root = (toolArgs?.projectRoot as string) || process.cwd();

    try {
      if (name === 'import_existing_rules') {
        const importedRules: Rule[] = [];
        const candidates = [
          { file: 'CLAUDE.md', target: 'claude' as const, id: 'IMPORTED-CLAUDE' },
          { file: 'AGENTS.md', target: 'codex' as const, id: 'IMPORTED-CODEX' },
          { file: '.cursorrules', target: 'cursor' as const, id: 'IMPORTED-CURSOR' },
          { file: path.join('.github', 'copilot-instructions.md'), target: 'copilot' as const, id: 'IMPORTED-COPILOT' },
        ];

        for (const c of candidates) {
          const fullP = path.join(root, c.file);
          try {
            const content = await fs.readFile(fullP, 'utf8');
            if (content.trim()) {
              importedRules.push({
                id: c.id,
                title: `Imported from ${c.file}`,
                category: 'workflow',
                severity: 'info',
                priority: 50,
                scope: { directory: '', include: ['**/*'], exclude: [] },
                targets: [c.target],
                enabled: true,
                content: content.trim(),
              });
            }
          } catch {}
        }

        let config: MasterConfig;
        try {
          config = await loadConfig(root);
          config.rules.push(...importedRules);
        } catch {
          config = {
            version: '1.0.0',
            projectName: path.basename(root) || 'imported-project',
            rules: importedRules,
          };
        }

        await saveConfig(root, config);
        return {
          content: [
            {
              type: 'text',
              text: `Successfully scanned and imported ${importedRules.length} rule(s) into ruleforge.config.json`,
            },
          ],
        };
      }

      const config = await loadConfig(root);

      if (name === 'preview_rules_sync') {
        const preview = await previewSync(config, root);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                preview.diffs.map(d => ({
                  file: path.relative(root, d.filePath),
                  action: d.action,
                })),
                null,
                2
              ),
            },
          ],
        };
      }

      if (name === 'apply_rules_sync') {
        const updated = await applySync(config, root);
        return {
          content: [
            {
              type: 'text',
              text: `Successfully synchronized ${updated.length} file(s):\n${updated.map(f => path.relative(root, f)).join('\n')}`,
            },
          ],
        };
      }

      if (name === 'validate_token_budget') {
        const preview = await previewSync(config, root);
        let totalChars = 0;
        preview.projections.forEach(p => (totalChars += p.content.length));
        const estimatedTokens = Math.ceil(totalChars / 4);
        return {
          content: [
            {
              type: 'text',
              text: `Total instruction projections: ${preview.projections.length} files. Estimated total tokens: ~${estimatedTokens} tokens. Status: ${estimatedTokens < 15000 ? 'SAFE (< 15,000 budget)' : 'WARNING (exceeds budget)'}`,
            },
          ],
        };
      }

      throw new Error(`Unknown tool: ${name}`);
    } catch (err: any) {
      return {
        content: [{ type: 'text', text: `Error: ${err.message}` }],
        isError: true,
      };
    }
  });

  const transport = new StdioServerTransport();
  server.connect(transport).catch(console.error);
}
