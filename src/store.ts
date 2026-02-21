import { createHash } from 'node:crypto';
import type { Storage, OperationManifest } from './types.js';

export interface StoreOptions {
  storage: Storage;
  mode: 'strict' | 'allow-unknown';
}

export class OperationStore {
  private readonly storage: Storage;
  private readonly mode: StoreOptions['mode'];

  constructor(opts: StoreOptions) {
    this.storage = opts.storage;
    this.mode = opts.mode;
  }

  async loadManifest(manifest: OperationManifest): Promise<void> {
    for (const op of manifest.operations) {
      await this.storage.set(op.hash, op.document);
    }
  }

  async resolve(hashOrQuery: string): Promise<string | null> {
    // First, try to look up as a hash
    const doc = await this.storage.get(hashOrQuery);
    if (doc) return doc;

    // Not found as a hash — check if it looks like a full query
    if (this.mode === 'allow-unknown') {
      // In allow-unknown mode, accept the raw query and register it
      const hash = sha256(hashOrQuery);
      await this.storage.set(hash, hashOrQuery);
      return hashOrQuery;
    }

    // strict mode: unknown hash → null
    return null;
  }
}

export function createOperationStore(opts: StoreOptions): OperationStore {
  return new OperationStore(opts);
}

export function sha256(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}
