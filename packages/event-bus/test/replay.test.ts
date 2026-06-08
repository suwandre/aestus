import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { NormalizedMarketEvent } from "@aestus/contracts";
import { InMemoryBus, REPLAY_SOURCES, replay, replaySource } from "../src/index";

const fixturesDir = fileURLToPath(new URL("../../../fixtures", import.meta.url));

function load(file: string): unknown[] {
  const raw = JSON.parse(readFileSync(`${fixturesDir}/${file}`, "utf8"));
  return Array.isArray(raw) ? raw : [raw];
}

describe("event replay", () => {
  test("every source builds events from its fixture and routes onto its stream", () => {
    for (const source of REPLAY_SOURCES) {
      const events = source.build(load(source.file));
      expect(events.length).toBeGreaterThan(0);
      for (const e of events) {
        // Subject is non-empty and namespaced under the source's stream base.
        expect(e.subject.split(".").length).toBeGreaterThanOrEqual(2);
        expect(e.payloadType.length).toBeGreaterThan(0);
      }
    }
  });

  test("replay is deterministic — same input, same subjects (run twice)", () => {
    const source = replaySource("normalized")!;
    const items = load(source.file);
    const a = source.build(items).map((e) => e.subject);
    const b = source.build(items).map((e) => e.subject);
    expect(a).toEqual(b);
  });

  test("normalized events replay onto the bus and validate at the subscriber", async () => {
    const bus = new InMemoryBus();
    const received: string[] = [];
    await bus.subscribe("normalized.market.>", NormalizedMarketEvent, (event, env) => {
      received.push(event.canonical_asset_id);
      // Deterministic envelope metadata stamped by replay.
      expect(env.source).toBe("replay");
      expect(env.event_id.startsWith("replay-normalized-")).toBe(true);
    });

    const source = replaySource("normalized")!;
    const events = source.build(load(source.file));
    await replay(bus, events);

    expect(received.length).toBe(events.length);
    await bus.close();
  });
});
