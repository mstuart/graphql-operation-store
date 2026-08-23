import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { describe, it } from "node:test";
import { operationStoreMiddleware as expressOperationStoreMiddleware } from "../src/middleware/express.ts";
import { operationStoreMiddleware } from "../src/middleware/fetch.ts";
import { MemoryStorage } from "../src/storage/memory.ts";
import { createOperationStore } from "../src/store.ts";

function sha256(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

class StringAssumingStorage extends MemoryStorage {
  getCallCount = 0;

  override get(hash: string): Promise<string | null> {
    this.getCallCount += 1;
    hash.toLowerCase();
    return super.get(hash);
  }
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

  it("accepts a known query sent alongside its hash in strict mode", async () => {
    const storage = new MemoryStorage();
    const query = "query { users { id } }";
    const hash = sha256(query);
    await storage.set(hash, query);

    const store = createOperationStore({ mode: "strict", storage });
    const mw = operationStoreMiddleware(store);
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
    assert.equal((await result.json()).query, query);
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

  it("passes through a JSON null body", async () => {
    const storage = new MemoryStorage();
    const store = createOperationStore({ mode: "strict", storage });
    const mw = operationStoreMiddleware(store);
    const req = new Request("http://localhost/graphql", {
      body: "null",
      headers: { "content-type": "application/json" },
      method: "POST",
    });

    const result = await mw(req);
    assert.ok(result instanceof Request);
    assert.equal(await result.json(), null);
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

  it("rejects an unknown hash without a query in allow-unknown mode", async () => {
    const storage = new MemoryStorage();
    const store = createOperationStore({ mode: "allow-unknown", storage });
    const mw = operationStoreMiddleware(store);
    const req = new Request("http://localhost/graphql", {
      body: JSON.stringify({
        extensions: {
          persistedQuery: { sha256Hash: "0".repeat(64), version: 1 },
        },
      }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });

    const result = await mw(req);
    assert.ok(result instanceof Response);
    assert.equal(result.status, 400);
  });

  it("rejects a query that does not match its hash", async () => {
    const storage = new MemoryStorage();
    const store = createOperationStore({ mode: "allow-unknown", storage });
    const mw = operationStoreMiddleware(store);
    const req = new Request("http://localhost/graphql", {
      body: JSON.stringify({
        extensions: {
          persistedQuery: { sha256Hash: sha256("query { other }"), version: 1 },
        },
        query: "query { users { id } }",
      }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });

    const result = await mw(req);
    assert.ok(result instanceof Response);
    assert.equal(result.status, 400);
  });

  it("returns 400 for a non-string query even when its hash is known", async () => {
    const storage = new MemoryStorage();
    const storedQuery = "query { users { id } }";
    const hash = sha256(storedQuery);
    await storage.set(hash, storedQuery);

    const store = createOperationStore({ mode: "strict", storage });
    const mw = operationStoreMiddleware(store);
    const req = new Request("http://localhost/graphql", {
      body: JSON.stringify({
        extensions: {
          persistedQuery: { sha256Hash: hash, version: 1 },
        },
        query: { operationName: "Users" },
      }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });

    let result: Request | Response | undefined;
    await assert.doesNotReject(async () => {
      result = await mw(req);
    });
    assert.ok(result instanceof Response);
    assert.equal(result.status, 400);
    assert.deepEqual(await result.json(), {
      errors: [{ message: "PersistedQueryNotFound" }],
    });
  });

  for (const hash of [null, 0, false]) {
    it(`returns 400 for present non-string hash ${JSON.stringify(hash)}`, async () => {
      const storage = new StringAssumingStorage();
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
      assert.ok(result instanceof Response);
      assert.equal(result.status, 400);
      assert.equal(storage.getCallCount, 0);
    });
  }
});

describe("express middleware", () => {
  for (const mode of ["strict", "allow-unknown"] as const) {
    it(`rejects a known hash paired with a different query in ${mode} mode`, async () => {
      const storage = new MemoryStorage();
      const storedQuery = "query { users { id } }";
      const hash = sha256(storedQuery);
      await storage.set(hash, storedQuery);

      const store = createOperationStore({ mode, storage });
      const middleware = expressOperationStoreMiddleware(store);
      let nextCalled = false;
      let responseBody: unknown;
      let responseStatus: number | undefined;
      interface ExpressResponse {
        json: (body: unknown) => void;
        status: (code: number) => ExpressResponse;
      }
      const response: ExpressResponse = {
        json: (body) => {
          responseBody = body;
        },
        status: (code) => {
          responseStatus = code;
          return response;
        },
      };

      await middleware(
        {
          body: {
            extensions: {
              persistedQuery: { sha256Hash: hash, version: 1 },
            },
            query: "query { products { id } }",
          },
        },
        response,
        () => {
          nextCalled = true;
        }
      );

      assert.equal(responseStatus, 400);
      assert.deepEqual(responseBody, {
        errors: [{ message: "PersistedQueryNotFound" }],
      });
      assert.equal(nextCalled, false);
    });
  }

  it("returns 400 for a non-string query even when its hash is known", async () => {
    const storage = new MemoryStorage();
    const storedQuery = "query { users { id } }";
    const hash = sha256(storedQuery);
    await storage.set(hash, storedQuery);

    const store = createOperationStore({ mode: "strict", storage });
    const middleware = expressOperationStoreMiddleware(store);
    let nextError: unknown;
    let responseBody: unknown;
    let responseStatus: number | undefined;
    interface ExpressResponse {
      json: (body: unknown) => void;
      status: (code: number) => ExpressResponse;
    }
    const response: ExpressResponse = {
      json: (body) => {
        responseBody = body;
      },
      status: (code) => {
        responseStatus = code;
        return response;
      },
    };

    await middleware(
      {
        body: {
          extensions: {
            persistedQuery: { sha256Hash: hash, version: 1 },
          },
          query: { operationName: "Users" },
        },
      },
      response,
      (error) => {
        nextError = error;
      }
    );

    assert.equal(responseStatus, 400);
    assert.deepEqual(responseBody, {
      errors: [{ message: "PersistedQueryNotFound" }],
    });
    assert.equal(nextError, undefined);
  });

  for (const hash of [null, 0, false]) {
    it(`returns 400 for present non-string hash ${JSON.stringify(hash)}`, async () => {
      const storage = new StringAssumingStorage();
      const store = createOperationStore({ mode: "strict", storage });
      const middleware = expressOperationStoreMiddleware(store);
      let nextCalled = false;
      let responseStatus: number | undefined;
      interface ExpressResponse {
        json: (_body: unknown) => void;
        status: (code: number) => ExpressResponse;
      }
      const response: ExpressResponse = {
        json: () => undefined,
        status: (code) => {
          responseStatus = code;
          return response;
        },
      };

      await middleware(
        {
          body: {
            extensions: {
              persistedQuery: { sha256Hash: hash, version: 1 },
            },
          },
        },
        response,
        () => {
          nextCalled = true;
        }
      );

      assert.equal(responseStatus, 400);
      assert.equal(storage.getCallCount, 0);
      assert.equal(nextCalled, false);
    });
  }
});
