/** Public paths that bypass auth even when API_TOKEN is configured. */
const PUBLIC_PATHS: RegExp[] = [/^\/health$/, /^\/metrics$/];

/**
 * Single-user bearer-token auth (T003).
 *
 * Returns a 401 Response when the request should be rejected, or null when it
 * may proceed. When API_TOKEN is not configured every request is allowed
 * (fixture-first / dev mode). Public paths (/health, /metrics) always pass.
 */
export function checkAuth(req: Request, token: string | undefined): Response | null {
  const path = new URL(req.url).pathname;
  if (PUBLIC_PATHS.some((p) => p.test(path))) return null;
  if (!token) return null; // no token configured → open dev mode
  const header = req.headers.get("authorization") ?? "";
  if (header === `Bearer ${token}`) return null;
  return new Response(JSON.stringify({ error: "Unauthorized" }), {
    status: 401,
    headers: { "content-type": "application/json" },
  });
}
