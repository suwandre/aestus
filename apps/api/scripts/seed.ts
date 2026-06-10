/**
 * Aestus development seed.
 *
 * Loads the reference fixtures (assets, venues, instruments) into Postgres and
 * creates sensible single-user defaults (a watchlist, a couple of alert rules,
 * model routing, feed enablement) so a fresh local environment has usable data.
 *
 * Idempotent: every insert is `ON CONFLICT DO NOTHING`, so re-running is safe.
 * Transactional UI data (anomalies/briefings/decisions) is NOT seeded here — in
 * fixture-first mode the frontend reads those straight from `fixtures/` (rule #5).
 *
 * Usage (run from apps/api, with Postgres up):
 *   bun run db:seed
 *
 * Env: DATABASE_URL (default postgres://aestus:aestus@localhost:5432/aestus).
 */
import { SQL } from "bun";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

const REPO_ROOT = join(import.meta.dir, "..", "..", "..");
const FIXTURES = join(REPO_ROOT, "fixtures");
const DATABASE_URL = process.env.DATABASE_URL ?? "postgres://aestus:aestus@localhost:5432/aestus";

async function loadFixture<T>(relPath: string): Promise<T> {
  return JSON.parse(await readFile(join(FIXTURES, relPath), "utf8")) as T;
}

/** Render a string list as a Postgres array literal, e.g. ["a","b"] -> {"a","b"}. */
function pgArray(values: string[]): string {
  return `{${values.map((v) => `"${v.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`).join(",")}}`;
}

interface AssetFixture {
  symbol: string;
  base?: string;
  quote?: string;
  asset_class: string;
  canonical_id: string;
  display_name: string;
  icon_key: string;
  tags: string[];
}
interface VenueFixture {
  venue_id: string;
  display_name: string;
  market_types: string[];
}
interface InstrumentFixture {
  venue_id: string;
  market_type: string;
  instrument_id: string;
  canonical_asset_id: string;
  tick_size: string;
  lot_size: string;
  quote_currency: string;
}

const WATCHLIST_ID = "default";
const WATCHLIST_ASSETS = [
  "crypto:btc-usdt",
  "crypto:eth-usdt",
  "macro:spx",
  "macro:dxy",
  "macro:gold",
  "macro:vix",
];

const ALERT_RULES = [
  {
    id: "default-funding-spike",
    name: "BTC funding spike",
    asset: "crypto:btc-usdt",
    condition: "funding_spike",
    params: { sigma: 3 },
  },
  {
    id: "default-oi-surge",
    name: "BTC open-interest surge",
    asset: "crypto:btc-usdt",
    condition: "oi_surge",
    params: { oi_delta: 0.05 },
  },
  {
    id: "default-macro-approaching",
    name: "High-importance macro approaching",
    asset: null,
    condition: "macro_approaching",
    params: { importance: "high", lead_minutes: 60 },
  },
  // Engine defaults (P10) — thresholds the anomaly detectors load at startup.
  // Editing a row changes detector behavior on reload (P10-T017).
  {
    id: "default-volume-anomaly",
    name: "Volume anomaly z-score",
    asset: null,
    condition: "volume_anomaly",
    params: { sigma: 2 },
  },
  {
    id: "default-basis-dislocation",
    name: "Cross-venue basis dislocation",
    asset: null,
    condition: "basis_dislocation",
    params: { bps: 3 },
  },
  {
    id: "default-correlation-break",
    name: "Correlation break vs baseline",
    asset: null,
    condition: "correlation_break",
    params: { delta: 0.5 },
  },
  {
    id: "default-liquidation-cluster",
    name: "Liquidation cluster size",
    asset: null,
    condition: "liquidation_cluster",
    params: { min_size: 1 },
  },
  {
    id: "default-whale-flow",
    name: "Whale / exchange flow notional",
    asset: null,
    condition: "whale_flow",
    params: { amount_usd: 50000000 },
  },
  {
    id: "default-news-cluster",
    name: "News cluster velocity",
    asset: null,
    condition: "news_cluster",
    params: { min_items: 2, min_relevance: 0.5 },
  },
  {
    id: "default-cooldown",
    name: "Alert dedupe cooldown",
    asset: null,
    condition: "cooldown",
    params: { minutes: 30 },
  },
];

// Defaults reflect the runtime-LLM-provider DECISION in progress.md.
const MODEL_ROUTING = [
  { task_kind: "briefing", provider: "ollama", model: "kimi-k2.6", params: {} },
  { task_kind: "classification", provider: "ollama", model: "minimax-m2.7", params: {} },
];

const FEED_SETTINGS = [
  { feed_id: "binance", enabled: true },
  { feed_id: "macro", enabled: true },
  { feed_id: "bybit", enabled: false },
  { feed_id: "okx", enabled: false },
  { feed_id: "hyperliquid", enabled: false },
];

async function seed(): Promise<void> {
  const assets = await loadFixture<AssetFixture[]>("assets/identities.json");
  const venues = await loadFixture<VenueFixture[]>("venues/venues.json");
  const instruments = await loadFixture<InstrumentFixture[]>("venues/instruments.json");

  const sql = new SQL(DATABASE_URL);
  try {
    for (const a of assets) {
      await sql`INSERT INTO assets (canonical_id, symbol, base, quote, asset_class, display_name, icon_key, tags)
        VALUES (${a.canonical_id}, ${a.symbol}, ${a.base ?? null}, ${a.quote ?? null},
                ${a.asset_class}::asset_class, ${a.display_name}, ${a.icon_key}, ${pgArray(a.tags)}::text[])
        ON CONFLICT (canonical_id) DO NOTHING`;
    }

    for (const v of venues) {
      await sql`INSERT INTO venues (venue_id, display_name, market_types)
        VALUES (${v.venue_id}, ${v.display_name}, ${pgArray(v.market_types)}::market_type[])
        ON CONFLICT (venue_id) DO NOTHING`;
    }

    for (const i of instruments) {
      await sql`INSERT INTO venue_instruments
          (venue_id, instrument_id, market_type, canonical_asset_id, tick_size, lot_size, quote_currency)
        VALUES (${i.venue_id}, ${i.instrument_id}, ${i.market_type}::market_type,
                ${i.canonical_asset_id}, ${i.tick_size}, ${i.lot_size}, ${i.quote_currency})
        ON CONFLICT (venue_id, instrument_id) DO NOTHING`;
    }

    await sql`INSERT INTO watchlists (id, name, description)
      VALUES (${WATCHLIST_ID}, ${"Default"}, ${"Seeded default watchlist"})
      ON CONFLICT (id) DO NOTHING`;
    for (let idx = 0; idx < WATCHLIST_ASSETS.length; idx++) {
      await sql`INSERT INTO watchlist_members (watchlist_id, canonical_asset_id, sort_order)
        VALUES (${WATCHLIST_ID}, ${WATCHLIST_ASSETS[idx]}, ${idx})
        ON CONFLICT (watchlist_id, canonical_asset_id) DO NOTHING`;
    }

    for (const r of ALERT_RULES) {
      await sql`INSERT INTO alert_rules (id, name, canonical_asset_id, condition, params)
        VALUES (${r.id}, ${r.name}, ${r.asset}, ${r.condition}, ${JSON.stringify(r.params)}::jsonb)
        ON CONFLICT (id) DO NOTHING`;
    }

    for (const m of MODEL_ROUTING) {
      await sql`INSERT INTO model_routing (task_kind, provider, model, params)
        VALUES (${m.task_kind}, ${m.provider}, ${m.model}, ${JSON.stringify(m.params)}::jsonb)
        ON CONFLICT (task_kind) DO NOTHING`;
    }

    for (const f of FEED_SETTINGS) {
      await sql`INSERT INTO feed_settings (feed_id, enabled)
        VALUES (${f.feed_id}, ${f.enabled})
        ON CONFLICT (feed_id) DO NOTHING`;
    }

    const [{ count: assetCount }] =
      (await sql`SELECT count(*)::int AS count FROM assets`) as Array<{ count: number }>;
    console.log(
      `seeded: ${assets.length} assets, ${venues.length} venues, ${instruments.length} instruments, ` +
        `watchlist '${WATCHLIST_ID}' (${WATCHLIST_ASSETS.length} members), ${ALERT_RULES.length} alert rules, ` +
        `${MODEL_ROUTING.length} model routes, ${FEED_SETTINGS.length} feed settings. assets table now has ${assetCount} rows.`,
    );
  } finally {
    await sql.close();
  }
}

try {
  await seed();
} catch (err) {
  console.error(`seed failed: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
}
