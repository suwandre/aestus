export type Method = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
export type Params = Record<string, string>;
export type Handler = (req: Request, params: Params, url: URL) => Promise<Response> | Response;

interface Route {
  method: Method;
  parts: string[];
  handler: Handler;
}

/** Convert a URL path like "/api/assets/:id" into a regex-free match result. */
function matchPath(parts: string[], segments: string[]): Params | null {
  if (parts.length !== segments.length) return null;
  const params: Params = {};
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i]!;
    if (p.startsWith(":")) {
      params[p.slice(1)] = decodeURIComponent(segments[i]!);
    } else if (p !== segments[i]) {
      return null;
    }
  }
  return params;
}

export class Router {
  private routes: Route[] = [];

  add(method: Method, pattern: string, handler: Handler): this {
    const parts = pattern.split("/").filter(Boolean);
    this.routes.push({ method, parts, handler });
    return this;
  }

  get(pattern: string, handler: Handler): this {
    return this.add("GET", pattern, handler);
  }

  post(pattern: string, handler: Handler): this {
    return this.add("POST", pattern, handler);
  }

  patch(pattern: string, handler: Handler): this {
    return this.add("PATCH", pattern, handler);
  }

  put(pattern: string, handler: Handler): this {
    return this.add("PUT", pattern, handler);
  }

  delete(pattern: string, handler: Handler): this {
    return this.add("DELETE", pattern, handler);
  }

  async handle(req: Request): Promise<Response> {
    const url = new URL(req.url);
    const segments = url.pathname.split("/").filter(Boolean);
    const method = req.method as Method;
    for (const route of this.routes) {
      if (route.method !== method) continue;
      const params = matchPath(route.parts, segments);
      if (params !== null) {
        return await route.handler(req, params, url);
      }
    }
    return Response.json({ error: "Not Found" }, { status: 404 });
  }
}
