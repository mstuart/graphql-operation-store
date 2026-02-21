import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { extractOperations } from '../src/extractor.ts';

function sha256(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

describe('extractOperations', () => {
  it('extracts gql template literals from .ts files', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'extractor-'));
    try {
      const tsContent = `
import { gql } from 'some-lib';

const GET_USERS = gql\`query GetUsers { users { id name } }\`;
const CREATE_USER = gql\`mutation CreateUser { createUser { id } }\`;
`;
      await writeFile(join(dir, 'queries.ts'), tsContent, 'utf-8');

      const outputPath = join(dir, 'manifest.json');
      const manifest = await extractOperations({
        patterns: [join(dir, '**/*.ts')],
        output: outputPath,
      });

      assert.equal(manifest.version, 1);
      assert.equal(manifest.operations.length, 2);

      const names = manifest.operations.map((op) => op.name).sort();
      assert.deepEqual(names, ['CreateUser', 'GetUsers']);

      // Verify hashes
      for (const op of manifest.operations) {
        assert.equal(op.hash, sha256(op.document));
      }
    } finally {
      await rm(dir, { recursive: true });
    }
  });

  it('extracts operations from .graphql files', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'extractor-'));
    try {
      const gqlContent = `query GetProduct {
  product {
    id
    title
    price
  }
}`;
      await writeFile(join(dir, 'product.graphql'), gqlContent, 'utf-8');

      const outputPath = join(dir, 'manifest.json');
      const manifest = await extractOperations({
        patterns: [join(dir, '**/*.graphql')],
        output: outputPath,
      });

      assert.equal(manifest.operations.length, 1);
      assert.equal(manifest.operations[0].name, 'GetProduct');
      assert.equal(manifest.operations[0].hash, sha256(gqlContent));
    } finally {
      await rm(dir, { recursive: true });
    }
  });

  it('deduplicates identical operations', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'extractor-'));
    try {
      const content1 = `const A = gql\`query Dup { hello }\`;`;
      const content2 = `const B = gql\`query Dup { hello }\`;`;
      await writeFile(join(dir, 'a.ts'), content1, 'utf-8');
      await writeFile(join(dir, 'b.ts'), content2, 'utf-8');

      const outputPath = join(dir, 'manifest.json');
      const manifest = await extractOperations({
        patterns: [join(dir, '**/*.ts')],
        output: outputPath,
      });

      assert.equal(manifest.operations.length, 1);
    } finally {
      await rm(dir, { recursive: true });
    }
  });
});
