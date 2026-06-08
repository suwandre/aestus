import { describe, expect, test } from "bun:test";
import { STREAMS } from "@aestus/contracts";
import {
  buildStreamSpecs,
  buildConsumerSpecs,
  DEFAULT_MAX_AGE_SECONDS,
  DEFAULT_MAX_BYTES,
} from "../src/topology";

describe("jetstream topology", () => {
  test("a stream spec exists for every canonical stream, with its subjects", () => {
    const specs = buildStreamSpecs();
    expect(specs.length).toBe(STREAMS.length);
    for (const stream of STREAMS) {
      const spec = specs.find((s) => s.name === stream.name);
      expect(spec).toBeDefined();
      expect(spec!.subjects).toEqual([...stream.subjects]);
      expect(spec!.maxAgeSeconds).toBeGreaterThan(0);
      expect(spec!.maxBytes).toBeGreaterThan(0);
    }
  });

  test("streams without overrides use the defaults", () => {
    const feature = buildStreamSpecs().find((s) => s.name === "FEATURE_SNAPSHOT");
    expect(feature!.maxAgeSeconds).toBe(DEFAULT_MAX_AGE_SECONDS);
    expect(feature!.maxBytes).toBe(DEFAULT_MAX_BYTES);
  });

  test("consumers reference existing streams and have unique durable names", () => {
    // buildConsumerSpecs throws on unknown stream or duplicate durable name.
    const consumers = buildConsumerSpecs();
    expect(consumers.length).toBeGreaterThan(0);
    const streamNames = new Set(STREAMS.map((s) => s.name));
    for (const c of consumers) {
      expect(streamNames.has(c.stream)).toBe(true);
      expect(c.durableName.length).toBeGreaterThan(0);
    }
    const keys = consumers.map((c) => `${c.stream}/${c.durableName}`);
    expect(new Set(keys).size).toBe(keys.length);
  });
});
