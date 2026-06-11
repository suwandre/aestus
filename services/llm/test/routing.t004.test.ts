import { describe, expect, test } from "bun:test";
import {
  applyRoutes,
  DEFAULT_ROUTES,
  ModelRouting,
  routesFromEnv,
  routesFromRows,
} from "../src/routing";

describe("P13-T004 model routing", () => {
  test("strong tier for briefings/research, cheap tier for extraction/scoring", () => {
    const routing = ModelRouting.fromDefaults();
    expect(routing.resolve("briefing").model).toBe("kimi-k2.6");
    expect(routing.resolve("research").model).toBe("kimi-k2.6");
    expect(routing.resolve("classification").model).toBe("minimax-m3");
    expect(routing.resolve("extraction").model).toBe("minimax-m3");
    expect(routing.resolve("scoring").model).toBe("minimax-m3");
  });

  test("unknown task kinds fall back to a tier default", () => {
    const routing = ModelRouting.fromDefaults();
    // "thesis" is a strong task; an arbitrary kind is treated as cheap.
    expect(routing.resolve("thesis").model).toBe("kimi-k2.6");
    expect(routing.resolve("some-new-narrow-task").model).toBe("minimax-m3");
  });

  test("overrides win per task kind; partial override keeps prior fields", () => {
    const merged = applyRoutes(DEFAULT_ROUTES, {
      briefing: { model: "kimi-k2.6:cloud" },
      classification: { provider: "openai", model: "gpt-x" },
    });
    expect(merged.briefing!.model).toBe("kimi-k2.6:cloud");
    expect(merged.briefing!.provider).toBe("ollama"); // unchanged
    expect(merged.classification!.provider).toBe("openai");
    expect(merged.extraction!.model).toBe("minimax-m3"); // untouched
  });

  test("routesFromRows maps DB settings rows", () => {
    const routes = routesFromRows([
      {
        task_kind: "briefing",
        provider: "ollama",
        model: "kimi-k2.6",
        params: { temperature: 0.2 },
      },
      { task_kind: "classification", provider: "ollama", model: "minimax-m3", params: null },
    ]);
    expect(routes.briefing).toEqual({
      provider: "ollama",
      model: "kimi-k2.6",
      params: { temperature: 0.2 },
    });
    expect(routes.classification!.params).toEqual({});
  });

  test("routesFromEnv parses JSON and tolerates garbage", () => {
    expect(routesFromEnv(undefined)).toEqual({});
    expect(routesFromEnv("not json")).toEqual({});
    expect(routesFromEnv('{"briefing":{"model":"kimi-k2.6:cloud"}}')).toEqual({
      briefing: { model: "kimi-k2.6:cloud" },
    });
  });

  test("a configured route changes the resolved briefing model", () => {
    const routing = new ModelRouting(
      applyRoutes(DEFAULT_ROUTES, routesFromEnv('{"briefing":{"model":"kimi-k2.6:cloud"}}')),
    );
    expect(routing.resolve("briefing").model).toBe("kimi-k2.6:cloud");
  });
});
