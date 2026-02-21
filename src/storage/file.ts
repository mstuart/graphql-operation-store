import { readFile } from 'node:fs/promises';
import type { Storage, OperationManifest } from '../types.js';

export class FileStorage implements Storage {
  private map: Map<string, string> | null = null;
  private loadPromise: Promise<void> | null = null;

  constructor(private readonly manifestPath: string) {}

  private async ensureLoaded(): Promise<void> {
    if (this.map) return;
    if (this.loadPromise) {
      await this.loadPromise;
      return;
    }
    this.loadPromise = this.load();
    await this.loadPromise;
  }

  private async load(): Promise<void> {
    const raw = await readFile(this.manifestPath, 'utf-8');
    const manifest: OperationManifest = JSON.parse(raw);
    this.map = new Map<string, string>();
    for (const op of manifest.operations) {
      this.map.set(op.hash, op.document);
    }
  }

  async get(hash: string): Promise<string | null> {
    await this.ensureLoaded();
    return this.map!.get(hash) ?? null;
  }

  async set(hash: string, document: string): Promise<void> {
    await this.ensureLoaded();
    this.map!.set(hash, document);
  }

  async has(hash: string): Promise<boolean> {
    await this.ensureLoaded();
    return this.map!.has(hash);
  }
}
