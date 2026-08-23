import type { OperationStore } from "../store.js";

interface ExpressRequest {
  body?: Record<string, unknown>;
  [key: string]: unknown;
}

interface ExpressResponse {
  json: (body: unknown) => void;
  status: (code: number) => ExpressResponse;
}

type NextFunction = (err?: unknown) => void;

export function operationStoreMiddleware(
  store: OperationStore
): (
  req: ExpressRequest,
  res: ExpressResponse,
  next: NextFunction
) => Promise<void> {
  return async (req, res, next) => {
    try {
      const { body } = req;
      if (!body || typeof body !== "object") {
        next();
        return;
      }

      const extensions = body.extensions as
        | { persistedQuery?: { version?: number; sha256Hash?: unknown } }
        | undefined;

      const persistedQuery = extensions?.persistedQuery;
      if (!(persistedQuery && Object.hasOwn(persistedQuery, "sha256Hash"))) {
        next();
        return;
      }

      const hash = persistedQuery.sha256Hash;
      const query = body.query as string | undefined;

      const resolved =
        typeof hash === "string"
          ? await store.resolvePersisted(hash, query)
          : null;

      if (!resolved) {
        res.status(400).json({
          errors: [{ message: "PersistedQueryNotFound" }],
        });
        return;
      }

      body.query = resolved;
      next();
    } catch (err) {
      next(err);
    }
  };
}
