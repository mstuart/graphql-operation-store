import { readFile } from "node:fs/promises";
import type { OperationManifest, Storage } from "../types.js";

export class FileStorage implements Storage {
  private readonly manifestPath: string;
  private map: Map<string, string> | null = null;
  private loadPromise: Promise<void> | null = null;

  constructor(manifestPath: string) {
    this.manifestPath = manifestPath;
  }

  private async ensureLoaded(): Promise<void> {
    if (this.map) {
      return;
    }
    if (this.loadPromise) {
      await this.loadPromise;
      return;
    }
    this.loadPromise = this.load();
    await this.loadPromise;
  }

  private async load(): Promise<void> {
    const raw = await readFile(this.manifestPath, "utf-8");
    const manifest: OperationManifest = JSON.parse(raw);
    this.map = new Map<string, string>();
    for (const op of manifest.operations) {
      this.map.set(op.hash, op.document);
    }
  }

  async get(hash: string): Promise<string | null> {
    await this.ensureLoaded();
    return this.requireMap().get(hash) ?? null;
  }

  async set(hash: string, document: string): Promise<void> {
    await this.ensureLoaded();
    this.requireMap().set(hash, document);
  }

  async has(hash: string): Promise<boolean> {
    await this.ensureLoaded();
    return this.requireMap().has(hash);
  }

  private requireMap(): Map<string, string> {
    if (!this.map) {
      throw new Error("Operation manifest failed to load");
    }
    return this.map;
  }
}
