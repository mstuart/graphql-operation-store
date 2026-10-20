import type { OperationStore } from "../store.js";

export function operationStoreMiddleware(
  store: OperationStore
): (req: Request) => Promise<Request | Response> {
  return async (req: Request): Promise<Request | Response> => {
    if (req.method !== "POST") {
      return req;
    }

    let body: Record<string, unknown> | null;
    try {
      body = (await req.clone().json()) as Record<string, unknown> | null;
    } catch {
      return req;
    }

    if (body === null) {
      return req;
    }

    const extensions = body.extensions as
      | { persistedQuery?: { version?: number; sha256Hash?: unknown } }
      | undefined;

    const persistedQuery = extensions?.persistedQuery;
    if (!(persistedQuery && Object.hasOwn(persistedQuery, "sha256Hash"))) {
      // Preserve the original body for downstream when no persisted query is present.
      return req;
    }

    const hash = persistedQuery.sha256Hash;
    const query = body.query as string | undefined;

    const resolved =
      typeof hash === "string"
        ? await store.resolvePersisted(hash, query)
        : null;

    if (!resolved) {
      return new Response(
        JSON.stringify({
          errors: [{ message: "PersistedQueryNotFound" }],
        }),
        {
          headers: { "content-type": "application/json" },
          status: 400,
        }
      );
    }

    body.query = resolved;

    const headers = new Headers(req.headers);
    headers.delete("content-length");
    return new Request(req, {
      body: JSON.stringify(body),
      headers,
      referrer: req.referrer,
      referrerPolicy: req.referrerPolicy,
    });
  };
}
