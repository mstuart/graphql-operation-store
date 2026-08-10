import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { describe, it } from "node:test";
import { MemoryStorage } from "../src/storage/memory.ts";
import { createOperationStore, OperationStore } from "../src/store.ts";
import type { OperationManifest } from "../src/types.ts";

function sha256(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

describe("MemoryStorage", () => {
  it("get returns null for unknown key", async () => {
    const storage = new MemoryStorage();
    assert.equal(await storage.get("unknown"), null);
  });

  it("set and get round-trips", async () => {
    const storage = new MemoryStorage();
    await storage.set("abc", "query { hello }");
    assert.equal(await storage.get("abc"), "query { hello }");
  });

  it("has returns false for unknown key", async () => {
    const storage = new MemoryStorage();
    assert.equal(await storage.has("missing"), false);
  });

  it("has returns true after set", async () => {
    const storage = new MemoryStorage();
    await storage.set("key1", "doc");
    assert.equal(await storage.has("key1"), true);
  });
});

describe("OperationStore", () => {
  it("resolves a known hash", async () => {
    const storage = new MemoryStorage();
    const doc = "query { users { id name } }";
    const hash = sha256(doc);
    await storage.set(hash, doc);

    const store = createOperationStore({ mode: "strict", storage });
    const result = await store.resolve(hash);
    assert.equal(result, doc);
  });

  it("returns null for unknown hash in strict mode", async () => {
    const storage = new MemoryStorage();
    const store = createOperationStore({ mode: "strict", storage });
    const result = await store.resolve("nonexistent-hash");
    assert.equal(result, null);
  });

  it("allows unknown query in allow-unknown mode", async () => {
    const storage = new MemoryStorage();
    const store = createOperationStore({ mode: "allow-unknown", storage });

    const query = "query { products { id title } }";
    const result = await store.resolve(query);
    assert.equal(result, query);

    // Should now be stored by its hash
    const hash = sha256(query);
    const stored = await storage.get(hash);
    assert.equal(stored, query);
  });

  it("loadManifest populates storage", async () => {
    const storage = new MemoryStorage();
    const store = createOperationStore({ mode: "strict", storage });

    const doc1 = "query GetUser { user { id } }";
    const doc2 = "mutation CreateUser { createUser { id } }";
    const manifest: OperationManifest = {
      operations: [
        { document: doc1, hash: sha256(doc1), name: "GetUser" },
        { document: doc2, hash: sha256(doc2), name: "CreateUser" },
      ],
      version: 1,
    };

    await store.loadManifest(manifest);

    assert.equal(await store.resolve(sha256(doc1)), doc1);
    assert.equal(await store.resolve(sha256(doc2)), doc2);
  });

  it("createOperationStore returns an OperationStore instance", () => {
    const storage = new MemoryStorage();
    const store = createOperationStore({ mode: "strict", storage });
    assert.ok(store instanceof OperationStore);
  });
});
