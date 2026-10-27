import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { MasterConfig } from '../domain/schema.js';
import { ALL_ADAPTERS, GeneratedProjection } from '../adapters/index.js';

export interface SyncDiff {
  filePath: string;
  action: 'create' | 'update' | 'unchanged';
  oldContent?: string;
  newContent: string;
}

export interface SyncPreview {
  projections: GeneratedProjection[];
  diffs: SyncDiff[];
}

export function computeSha256(text: string): string {
  // Normalize line endings to avoid CRLF vs LF drift false positives on Windows/Linux
  const normalized = text.replace(/\r\n/g, '\n').trim();
  return crypto.createHash('sha256').update(normalized, 'utf8').digest('hex');
}

export async function previewSync(config: MasterConfig, projectRoot: string): Promise<SyncPreview> {
  const projections: GeneratedProjection[] = [];
  for (const adapter of ALL_ADAPTERS) {
    projections.push(...adapter.generate(config, projectRoot));
  }

  const diffs: SyncDiff[] = [];
  for (const proj of projections) {
    let oldContent: string | undefined;
    try {
      oldContent = await fs.readFile(proj.filePath, 'utf8');
    } catch {
      oldContent = undefined;
    }

    if (oldContent === undefined) {
      diffs.push({ filePath: proj.filePath, action: 'create', newContent: proj.content });
    } else if (computeSha256(oldContent) !== computeSha256(proj.content)) {
      diffs.push({ filePath: proj.filePath, action: 'update', oldContent, newContent: proj.content });
    } else {
      diffs.push({ filePath: proj.filePath, action: 'unchanged', oldContent, newContent: proj.content });
    }
  }

  return { projections, diffs };
}

export async function applySync(config: MasterConfig, projectRoot: string): Promise<string[]> {
  const preview = await previewSync(config, projectRoot);
  const updatedFiles: string[] = [];

  for (const diff of preview.diffs) {
    if (diff.action === 'create' || diff.action === 'update') {
      const dir = path.dirname(diff.filePath);
      await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(diff.filePath, diff.newContent, 'utf8');
      updatedFiles.push(diff.filePath);
    }
  }
  return updatedFiles;
}
