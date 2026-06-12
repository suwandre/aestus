import type { ZodType } from "zod/v4";

/**
 * Validate `data` against `schema` then return a JSON Response (T002).
 *
 * Throws ZodError when the data doesn't conform — invalid API responses fail
 * loudly during development rather than leaking malformed JSON to the client.
 */
export function respond<T>(schema: ZodType<T>, data: unknown, status = 200): Response {
  const validated = schema.parse(data);
  return Response.json(validated, { status });
}

export function respondList<T>(schema: ZodType<T>, items: unknown[]): Response {
  const validated = items.map((item) => schema.parse(item));
  return Response.json(validated);
}

export function respondError(message: string, status: number): Response {
  return Response.json({ error: message }, { status });
}
