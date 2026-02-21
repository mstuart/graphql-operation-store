import { readFile } from 'node:fs/promises';
import { writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { glob } from 'node:fs/promises';
import type { OperationManifest, OperationRecord } from './types.js';

export interface ExtractOptions {
  patterns: string[];
  output: string;
}

export async function extractOperations(
  opts: ExtractOptions
): Promise<OperationManifest> {
  const seen = new Map<string, OperationRecord>();

  for (const pattern of opts.patterns) {
    for await (const filePath of glob(pattern)) {
      const content = await readFile(filePath, 'utf-8');
      const ext = filePath.split('.').pop();

      if (ext === 'graphql' || ext === 'gql') {
        addOperation(seen, content.trim());
      } else {
        // Look for gql`...` template literals
        extractGqlTags(seen, content);
      }
    }
  }

  const manifest: OperationManifest = {
    version: 1,
    operations: Array.from(seen.values()),
  };

  await writeFile(opts.output, JSON.stringify(manifest, null, 2), 'utf-8');
  return manifest;
}

function extractGqlTags(
  seen: Map<string, OperationRecord>,
  content: string
): void {
  // Match gql`...` template literals (no interpolation support)
  const regex = /gql\s*`([^`]+)`/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(content)) !== null) {
    const doc = match[1].trim();
    if (doc) {
      addOperation(seen, doc);
    }
  }
}

function addOperation(
  seen: Map<string, OperationRecord>,
  document: string
): void {
  const hash = createHash('sha256').update(document).digest('hex');
  if (seen.has(hash)) return;

  const nameMatch = document.match(
    /(?:query|mutation|subscription)\s+(\w+)/
  );

  seen.set(hash, {
    hash,
    name: nameMatch?.[1],
    document,
  });
}
