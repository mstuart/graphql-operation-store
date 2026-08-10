import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { describe, it } from "node:test";
import { operationStoreMiddleware } from "../src/middleware/fetch.ts";
import { MemoryStorage } from "../src/storage/memory.ts";
import { createOperationStore } from "../src/store.ts";

function sha256(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

describe("fetch middleware", () => {
  it("passes through non-POST requests", async () => {
    const storage = new MemoryStorage();
    const store = createOperationStore({ mode: "strict", storage });
    const mw = operationStoreMiddleware(store);

    const req = new Request("http://localhost/graphql", { method: "GET" });
    const result = await mw(req);
    assert.ok(result instanceof Request);
  });

  it("resolves persisted query by hash", async () => {
    const storage = new MemoryStorage();
    const doc = "query { users { id } }";
    const hash = sha256(doc);
    await storage.set(hash, doc);

    const store = createOperationStore({ mode: "strict", storage });
    const mw = operationStoreMiddleware(store);

    const req = new Request("http://localhost/graphql", {
      body: JSON.stringify({
        extensions: {
          persistedQuery: { sha256Hash: hash, version: 1 },
        },
      }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });

    const result = await mw(req);
    assert.ok(result instanceof Request);
    const body = await result.json();
    assert.equal(body.query, doc);
  });

  it("returns 400 for unknown hash in strict mode", async () => {
    const storage = new MemoryStorage();
    const store = createOperationStore({ mode: "strict", storage });
    const mw = operationStoreMiddleware(store);

    const req = new Request("http://localhost/graphql", {
      body: JSON.stringify({
        extensions: {
          persistedQuery: { sha256Hash: "unknown-hash", version: 1 },
        },
      }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });

    const result = await mw(req);
    assert.ok(result instanceof Response);
    assert.equal(result.status, 400);
    const body = await result.json();
    assert.equal(body.errors[0].message, "PersistedQueryNotFound");
  });

  it("passes through request without persisted query extensions", async () => {
    const storage = new MemoryStorage();
    const store = createOperationStore({ mode: "strict", storage });
    const mw = operationStoreMiddleware(store);

    const req = new Request("http://localhost/graphql", {
      body: JSON.stringify({ query: "{ hello }" }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });

    const result = await mw(req);
    assert.ok(result instanceof Request);
  });

  it("resolves query alongside hash in allow-unknown mode", async () => {
    const storage = new MemoryStorage();
    const store = createOperationStore({ mode: "allow-unknown", storage });
    const mw = operationStoreMiddleware(store);

    const query = "query { newOperation { id } }";
    const hash = sha256(query);

    const req = new Request("http://localhost/graphql", {
      body: JSON.stringify({
        extensions: {
          persistedQuery: { sha256Hash: hash, version: 1 },
        },
        query,
      }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });

    const result = await mw(req);
    assert.ok(result instanceof Request);
    const body = await result.json();
    assert.equal(body.query, query);
  });
});
