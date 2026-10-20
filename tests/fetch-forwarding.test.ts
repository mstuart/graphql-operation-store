import assert from "node:assert/strict";
import { it } from "node:test";
import { operationStoreMiddleware } from "../src/middleware/fetch.ts";
import { MemoryStorage } from "../src/storage/memory.ts";
import { createOperationStore } from "../src/store.ts";

it("passes through malformed JSON without consuming the downstream body", async () => {
  const middleware = operationStoreMiddleware(
    createOperationStore({ mode: "strict", storage: new MemoryStorage() })
  );
  const request = new Request("https://example.com/graphql", {
    body: "{invalid",
    method: "POST",
  });
  const result = await middleware(request);
  assert.equal(result, request);
  assert.equal(await result.text(), "{invalid");
});

it("preserves exact non-persisted JSON bodies including whitespace", async () => {
  const middleware = operationStoreMiddleware(
    createOperationStore({ mode: "strict", storage: new MemoryStorage() })
  );
  await Promise.all(
    [' { "query": "{ users { id } }" } ', " null "].map(async (body) => {
      const request = new Request("https://example.com/graphql", {
        body,
        method: "POST",
      });
      const result = await middleware(request);
      assert.equal(result, request);
      assert.equal(await result.text(), body);
    })
  );
});

async function persistedRequest() {
  const storage = new MemoryStorage();
  const query = "query { users { id } }";
  await storage.set("stored-hash", query);
  const controller = new AbortController();
  const body = JSON.stringify({
    extensions: { persistedQuery: { sha256Hash: "stored-hash" } },
  });
  const request = new Request("https://example.com/graphql", {
    body,
    cache: "no-store",
    credentials: "include",
    headers: {
      "content-length": String(Buffer.byteLength(body)),
      "content-type": "application/json",
      "x-client": "preserved",
    },
    method: "POST",
    mode: "same-origin",
    redirect: "manual",
    referrer: "https://example.com/client",
    referrerPolicy: "no-referrer",
    signal: controller.signal,
  });
  const result = await operationStoreMiddleware(
    createOperationStore({ mode: "strict", storage })
  )(request);
  assert.ok(result instanceof Request);
  return { controller, query, request, result };
}

it("preserves request policy and abort propagation after query expansion", async () => {
  const { controller, request, result, query } = await persistedRequest();
  for (const key of [
    "cache",
    "credentials",
    "redirect",
    "mode",
    "referrer",
    "referrerPolicy",
  ] as const) {
    assert.equal(result[key], request[key], key);
  }
  assert.equal(result.headers.get("x-client"), "preserved");
  controller.abort("caller cancelled");
  assert.equal(result.signal.aborted, true);
  assert.equal(result.signal.reason, "caller cancelled");
  assert.equal((await result.json()).query, query);
});

it("removes stale content length when expanding a persisted query", async () => {
  const { result, query } = await persistedRequest();
  assert.equal(result.headers.get("content-length"), null);
  assert.equal(result.headers.get("content-type"), "application/json");
  assert.equal((await result.json()).query, query);
});
