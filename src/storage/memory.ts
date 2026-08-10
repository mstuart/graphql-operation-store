import type { Storage } from "../types.js";

export class MemoryStorage implements Storage {
  private readonly map = new Map<string, string>();

  get(hash: string): Promise<string | null> {
    return Promise.resolve(this.map.get(hash) ?? null);
  }

  set(hash: string, document: string): Promise<void> {
    this.map.set(hash, document);
    return Promise.resolve();
  }

  has(hash: string): Promise<boolean> {
    return Promise.resolve(this.map.has(hash));
  }
}
