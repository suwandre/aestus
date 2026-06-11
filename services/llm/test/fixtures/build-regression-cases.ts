/**
 * Build the prompt-regression fixtures (P13-T013).
 *
 * Derives representative context packets (long, short, no-trade, weak-quality)
 * from the repo's base context packet and pairs each with high-level output
 * expectations. Re-run after a ContextPacket contract change to refresh the
 * stored cases:
 *
 *   bun run test/fixtures/build-regression-cases.ts
 *
 * The committed `regression-cases.json` is what the regression test consumes;
 * this generator keeps the cases valid and reproducible rather than hand-authored.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { type ContextPacket, ContextPacket as ContextPacketSchema } from "@aestus/contracts";

const base = ContextPacketSchema.parse(
  JSON.parse(
    readFileSync(
      fileURLToPath(new URL("../../../../fixtures/context/packets.json", import.meta.url)),
      "utf8",
    ),
  )[0],
);

function variant(id: string, mutate: (p: ContextPacket) => void): ContextPacket {
  const p = structuredClone(base);
  p.id = id;
  mutate(p);
  return p;
}

const cases = [
  {
    name: "long-strong",
    expect: { stance: "long", directional: true, minConfidence: 0.5 },
    packet: variant("ctx-reg-long", () => {}),
  },
  {
    name: "short",
    expect: { stance: "short", directional: true },
    packet: variant("ctx-reg-short", (p) => {
      p.deterministic_levels.direction = "short";
    }),
  },
  {
    name: "no-trade",
    expect: { stance: "no_trade", directional: false },
    packet: variant("ctx-reg-no-trade", (p) => {
      p.deterministic_levels.no_trade = {
        is_no_trade: true,
        reasons: ["high-importance macro imminent", "volatility already elevated"],
        recheck: ["after the macro print clears"],
      };
    }),
  },
  {
    name: "weak-quality",
    expect: { stance: "long", directional: true, maxConfidence: 0.5 },
    packet: variant("ctx-reg-weak", (p) => {
      p.quality = {
        score: 0.3,
        label: "weak",
        degraded_feeds: ["venue_quotes", "news", "on_chain", "macro"],
        notes: "Quality 0.30 (weak); multiple feeds degraded.",
      };
    }),
  },
];

const outPath = fileURLToPath(new URL("./regression-cases.json", import.meta.url));
writeFileSync(outPath, JSON.stringify(cases, null, 2) + "\n");
console.log(`Wrote ${cases.length} regression cases to ${outPath}`);
