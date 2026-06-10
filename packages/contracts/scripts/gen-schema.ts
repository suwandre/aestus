/**
 * Generate JSON Schema (draft 2020-12) files for every public contract type
 * into `packages/contracts/schema/`. These let the backend and frontend
 * validate fixtures without importing the runtime Zod code (P03-T014).
 *
 * Run with: `bun run gen:schema`
 */
import { z } from "zod/v4";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { AssetIdentity } from "../src/asset";
import { Venue, VenueInstrument } from "../src/venue";
import { VenueQuote } from "../src/venue-quote";
import { RawMarketEvent } from "../src/raw-event";
import { NormalizedMarketEvent } from "../src/normalized-event";
import { MacroEvent } from "../src/macro";
import { NewsItem } from "../src/news";
import { OnChainEvent } from "../src/onchain";
import { FeatureSnapshot } from "../src/feature-snapshot";
import { AnomalyEvent } from "../src/anomaly";
import { DeterministicLevels } from "../src/levels";
import { ContextPacket } from "../src/context-packet";
import { Briefing } from "../src/briefing";
import { Decision } from "../src/decision";
import { JournalTrade } from "../src/journal";
import { EventEnvelope } from "../src/envelope";
import { DeadLetter } from "../src/dlq";
import { SystemHealth } from "../src/health";

const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, "..", "schema");

/** Public contract types, keyed by their JSON Schema file name. */
const contracts: Record<string, z.ZodType> = {
  AssetIdentity,
  Venue,
  VenueInstrument,
  VenueQuote,
  RawMarketEvent,
  NormalizedMarketEvent,
  MacroEvent,
  NewsItem,
  OnChainEvent,
  FeatureSnapshot,
  AnomalyEvent,
  DeterministicLevels,
  ContextPacket,
  Briefing,
  Decision,
  JournalTrade,
  EventEnvelope,
  DeadLetter,
  SystemHealth,
};

rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });

for (const [name, schema] of Object.entries(contracts)) {
  const jsonSchema = z.toJSONSchema(schema, { target: "draft-2020-12" });
  const withId = { $id: `${name}.schema.json`, title: name, ...jsonSchema };
  writeFileSync(join(outDir, `${name}.schema.json`), JSON.stringify(withId, null, 2) + "\n");
}

console.log(`Wrote ${Object.keys(contracts).length} JSON Schema files to ${outDir}`);
