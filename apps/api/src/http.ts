import type { ApiError } from "@split-ledger/shared";
import type { z } from "zod";

/** An error with an HTTP status that the error handler turns into a JSON body. */
export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly issues?: ApiError["issues"],
  ) {
    super(message);
  }
}

export const notFound = (what = "Not found") => new HttpError(404, what);

/** Validates a request body with a shared schema, or throws a 400 listing every problem. */
export function parseBody<S extends z.ZodType>(schema: S, body: unknown): z.output<S> {
  const result = schema.safeParse(body ?? {});
  if (result.success) return result.data;
  throw new HttpError(
    400,
    "Some fields need attention.",
    result.error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message })),
  );
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Route ids that aren't UUIDs can't exist; answer 404 instead of letting Postgres reject them. */
export function uuidParam(value: string | undefined, what = "Not found"): string {
  if (!value || !UUID.test(value)) throw notFound(what);
  return value.toLowerCase();
}
