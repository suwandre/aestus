/**
 * Replay events into NATS for testing (P05-T007). Reads contract payloads from
 * fixtures and republishes them as deterministic envelopes so the feature and
 * anomaly engines can be driven from repeatable event streams.
 *
 *   bun run scripts/replay.ts                  # replay all sources
 *   bun run scripts/replay.ts normalized       # replay one or more sources by key
 *   bun run scripts/replay.ts --dry-run        # build + count, no NATS connection
 *   bun run scripts/replay.ts --from clickhouse # (not implemented in P05)
 *
 * Sources: raw, normalized, features, anomalies (see src/replay.ts).
 * Environment: NATS_URL (default nats://127.0.0.1:4222).
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { NatsBus } from "../src/nats";
import { REPLAY_SOURCES, replaySource, replay, type PreparedEvent } from "../src/replay";

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const fromIdx = args.indexOf("--from");
const from = fromIdx >= 0 ? args[fromIdx + 1] : "fixtures";
const keys = args.filter((a) => !a.startsWith("--") && a !== from);

const fixturesDir = fileURLToPath(new URL("../../../fixtures", import.meta.url));

function loadFixture(file: string): unknown[] {
  const raw = JSON.parse(readFileSync(`${fixturesDir}/${file}`, "utf8"));
  return Array.isArray(raw) ? raw : [raw];
}

function selectedSources() {
  if (keys.length === 0) return REPLAY_SOURCES;
  return keys.map((k) => {
    const s = replaySource(k);
    if (!s)
      throw new Error(
        `unknown replay source '${k}'. Known: ${REPLAY_SOURCES.map((x) => x.key).join(", ")}`,
      );
    return s;
  });
}

async function main() {
  if (from === "clickhouse") {
    // Replaying from ClickHouse history is a documented follow-up; the
    // deterministic fixtures path below is what the engines test against.
    throw new Error("--from clickhouse is not implemented in P05; use fixtures");
  }

  const sources = selectedSources();
  const planned: { key: string; events: PreparedEvent[] }[] = sources.map((s) => ({
    key: s.key,
    events: s.build(loadFixture(s.file)),
  }));

  const total = planned.reduce((n, p) => n + p.events.length, 0);
  for (const p of planned) console.log(`source ${p.key}: ${p.events.length} event(s)`);

  if (dryRun) {
    console.log(`dry-run: ${total} event(s) across ${planned.length} source(s), not published`);
    return;
  }

  const bus = await NatsBus.connect(process.env.NATS_URL ?? "nats://127.0.0.1:4222");
  try {
    for (const p of planned) await replay(bus, p.events);
    console.log(`replayed ${total} event(s) into NATS`);
  } finally {
    await bus.close();
  }
}

main().catch((err) => {
  console.error("replay failed:", err);
  process.exit(1);
});
