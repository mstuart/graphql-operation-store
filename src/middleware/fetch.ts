import type { OperationStore } from '../store.js';

export function operationStoreMiddleware(
  store: OperationStore
): (req: Request) => Promise<Request | Response> {
  return async (req: Request): Promise<Request | Response> => {
    if (req.method !== 'POST') return req;

    let body: Record<string, unknown>;
    try {
      body = (await req.json()) as Record<string, unknown>;
    } catch {
      return req;
    }

    const extensions = body.extensions as
      | { persistedQuery?: { version?: number; sha256Hash?: string } }
      | undefined;

    const persistedQuery = extensions?.persistedQuery;
    if (!persistedQuery?.sha256Hash) {
      // No persisted query header — rebuild request with parsed body so downstream can use it
      return new Request(req.url, {
        method: req.method,
        headers: req.headers,
        body: JSON.stringify(body),
      });
    }

    const hash = persistedQuery.sha256Hash;
    const query = body.query as string | undefined;

    const resolved = query
      ? await store.resolve(query)
      : await store.resolve(hash);

    if (!resolved) {
      return new Response(
        JSON.stringify({
          errors: [{ message: 'PersistedQueryNotFound' }],
        }),
        {
          status: 400,
          headers: { 'content-type': 'application/json' },
        }
      );
    }

    body.query = resolved;

    return new Request(req.url, {
      method: req.method,
      headers: req.headers,
      body: JSON.stringify(body),
    });
  };
}
