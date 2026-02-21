import type { Storage } from '../types.js';

export class MemoryStorage implements Storage {
  private readonly map = new Map<string, string>();

  async get(hash: string): Promise<string | null> {
    return this.map.get(hash) ?? null;
  }

  async set(hash: string, document: string): Promise<void> {
    this.map.set(hash, document);
  }

  async has(hash: string): Promise<boolean> {
    return this.map.has(hash);
  }
}
