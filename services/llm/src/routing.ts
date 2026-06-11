/**
 * Model routing config (P13-T004).
 *
 * Routes each LLM task kind to a provider/model so model choices are
 * configurable per task type (Done-when), per the runtime-LLM-provider DECISION
 * (progress.md): a strong reasoning model (Kimi K2.6) for briefings/research and
 * a cheap high-volume model (MiniMax M3) for extraction/scoring/classification
 * — keeping cost inside the €10–30/month envelope (hard rule #7).
 *
 * Settings layering (lowest → highest precedence):
 *   1. {@link DEFAULT_ROUTES} (the DECISION).
 *   2. The `model_routing` Postgres table (P04-T010), when `DATABASE_URL` is set.
 *   3. `LLM_MODEL_ROUTING` env JSON (per-task overrides; no DB needed).
 *
 * Unknown task kinds fall back to a tier default by task class, so a new caller
 * never crashes for lack of an explicit row.
 */
import { SQL } from "bun";
import type { LlmConfig } from "./config";

export interface ModelRoute {
  provider: string;
  model: string;
  params: Record<string, unknown>;
}

/** Task kinds routed to the strong reasoning tier; everything else is cheap. */
export const STRONG_TASKS = new Set(["briefing", "research", "thesis", "chat"]);

const STRONG_ROUTE: ModelRoute = { provider: "ollama", model: "kimi-k2.6", params: {} };
const CHEAP_ROUTE: ModelRoute = { provider: "ollama", model: "minimax-m3", params: {} };

/** Default per-task routes (the DECISION + the 0009_config seed). */
export const DEFAULT_ROUTES: Record<string, ModelRoute> = {
  briefing: { ...STRONG_ROUTE },
  research: { ...STRONG_ROUTE },
  thesis: { ...STRONG_ROUTE },
  chat: { ...STRONG_ROUTE },
  extraction: { ...CHEAP_ROUTE },
  scoring: { ...CHEAP_ROUTE },
  classification: { ...CHEAP_ROUTE },
  relevance: { ...CHEAP_ROUTE },
  sentiment: { ...CHEAP_ROUTE },
};

/** Resolves a task kind to a concrete model route. */
export class ModelRouting {
  constructor(private readonly routes: Record<string, ModelRoute>) {}

  /** Route for a task kind; tier default for unknown kinds. */
  resolve(taskKind: string): ModelRoute {
    const direct = this.routes[taskKind];
    if (direct) return direct;
    return STRONG_TASKS.has(taskKind) ? { ...STRONG_ROUTE } : { ...CHEAP_ROUTE };
  }

  /** All explicitly-configured routes (test/observability helper). */
  get all(): Record<string, ModelRoute> {
    return this.routes;
  }

  /** Routing from the built-in defaults only (fixture-first). */
  static fromDefaults(): ModelRouting {
    return new ModelRouting({ ...DEFAULT_ROUTES });
  }
}

/** Merge override routes over a base set (override wins per task kind). */
export function applyRoutes(
  base: Record<string, ModelRoute>,
  overrides: Record<string, Partial<ModelRoute>>,
): Record<string, ModelRoute> {
  const merged: Record<string, ModelRoute> = { ...base };
  for (const [kind, route] of Object.entries(overrides)) {
    const prior = merged[kind] ?? STRONG_ROUTE;
    merged[kind] = {
      provider: route.provider ?? prior.provider,
      model: route.model ?? prior.model,
      params: route.params ?? prior.params ?? {},
    };
  }
  return merged;
}

/** Shape of a `model_routing` row. */
interface ModelRoutingRow {
  task_kind: string;
  provider: string;
  model: string;
  params: Record<string, unknown> | null;
}

/** Convert `model_routing` rows into a route map. */
export function routesFromRows(rows: ModelRoutingRow[]): Record<string, ModelRoute> {
  const out: Record<string, ModelRoute> = {};
  for (const r of rows) {
    out[r.task_kind] = { provider: r.provider, model: r.model, params: r.params ?? {} };
  }
  return out;
}

/** Parse the `LLM_MODEL_ROUTING` env JSON into override routes (empty on absence/parse error). */
export function routesFromEnv(value: string | undefined): Record<string, Partial<ModelRoute>> {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value) as Record<string, Partial<ModelRoute>>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

/**
 * Load routing for the running service: defaults ← Postgres `model_routing`
 * (when `DATABASE_URL` set) ← `LLM_MODEL_ROUTING` env JSON. The DB read mirrors
 * the store-postgres pattern (Bun SQL); fixture-first runs skip it entirely.
 */
export async function loadRouting(config: LlmConfig): Promise<ModelRouting> {
  let routes: Record<string, ModelRoute> = { ...DEFAULT_ROUTES };

  if (config.databaseUrl) {
    const sql = new SQL(config.databaseUrl);
    try {
      const rows = (await sql`
        SELECT task_kind, provider, model, params FROM model_routing
      `) as ModelRoutingRow[];
      routes = applyRoutes(routes, routesFromRows(rows));
    } finally {
      await sql.close();
    }
  }

  routes = applyRoutes(routes, routesFromEnv(process.env.LLM_MODEL_ROUTING));
  return new ModelRouting(routes);
}
