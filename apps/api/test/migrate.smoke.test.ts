/**
 * Migration smoke test (P04-T018).
 *
 * Creates throwaway, EMPTY Postgres and ClickHouse databases, runs the real
 * migration runner (scripts/migrate.ts) against them, asserts the key tables
 * exist and that schema_migrations recorded every migration file, then drops
 * the throwaway databases. This exercises the genuine cold-start path without
 * touching the dev databases.
 *
 * Skips automatically when the databases are unreachable (e.g. the default CI
 * `ts-checks` job has no DB services) — the dedicated `migration-smoke` CI job
 * provides Postgres + ClickHouse so it runs there for real.
 */
import { test, expect } from "bun:test";
import { SQL } from "bun";
import { readdir } from "node:fs/promises";
import { join } from "node:path";

const PG_BASE = process.env.DATABASE_URL ?? "postgres://aestus:aestus@localhost:5432/aestus";
const CH_URL = process.env.CLICKHOUSE_URL ?? "http://aestus:aestus@localhost:8123";
const SMOKE_DB = "aestus_migrate_smoke";
const MIGRATE_SCRIPT = join(import.meta.dir, "..", "scripts", "migrate.ts");
const PG_MIGRATIONS = join(import.meta.dir, "..", "..", "..", "infra", "migrations", "postgres");
const CH_MIGRATIONS = join(import.meta.dir, "..", "..", "..", "infra", "migrations", "clickhouse");

const PG_KEY_TABLES = [
  "assets",
  "venues",
  "venue_instruments",
  "watchlists",
  "watchlist_members",
  "news_items",
  "news_entities",
  "news_embeddings",
  "macro_events",
  "on_chain_events",
  "anomalies",
  "anomaly_context_refs",
  "context_packets",
  "context_packet_items",
  "briefings",
  "decisions",
  "journal_entries",
  "journal_outcomes",
  "trade_tags",
  "alert_rules",
  "feed_settings",
  "model_routing",
  "notification_channels",
  "layout_preferences",
  "schema_migrations",
];

const CH_KEY_TABLES = [
  "raw_market_events",
  "normalized_market_events",
  "ohlcv_1m",
  "ohlcv_5m",
  "ohlcv_15m",
  "ohlcv_1h",
  "feature_snapshots",
  "anomaly_metrics",
  "schema_migrations",
];

function smokePgUrl(): string {
  const u = new URL(PG_BASE);
  u.pathname = `/${SMOKE_DB}`;
  return u.toString();
}

function chParts(): { endpoint: string; user?: string; password?: string } {
  const u = new URL(CH_URL);
  const user = decodeURIComponent(u.username) || undefined;
  const password = decodeURIComponent(u.password) || undefined;
  u.username = "";
  u.password = "";
  return { endpoint: u.toString().replace(/\/$/, ""), user, password };
}

async function chQuery(statement: string, db?: string): Promise<string> {
  const { endpoint, user, password } = chParts();
  const headers: Record<string, string> = {};
  if (user) headers["X-ClickHouse-User"] = user;
  if (password) headers["X-ClickHouse-Key"] = password;
  const url = db ? `${endpoint}/?database=${encodeURIComponent(db)}` : `${endpoint}/`;
  const res = await fetch(url, { method: "POST", headers, body: statement });
  const text = await res.text();
  if (!res.ok) throw new Error(`ClickHouse ${res.status}: ${text.trim()}`);
  return text;
}

async function databasesReachable(): Promise<boolean> {
  try {
    const sql = new SQL(PG_BASE);
    await Promise.race([
      sql.unsafe("SELECT 1"),
      new Promise((_, reject) => setTimeout(() => reject(new Error("pg timeout")), 3000)),
    ]);
    await sql.close();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3000);
    const { endpoint } = chParts();
    const res = await fetch(`${endpoint}/ping`, { signal: controller.signal });
    clearTimeout(timer);
    return res.ok;
  } catch {
    return false;
  }
}

async function countSqlFiles(dir: string): Promise<number> {
  return (await readdir(dir)).filter((f) => f.endsWith(".sql")).length;
}

const dbUp = await databasesReachable();
const smokeTest = dbUp ? test : test.skip;
if (!dbUp) {
  console.log("[migrate.smoke] databases unreachable — skipping (start with `bun run docker:up`)");
}

smokeTest(
  "migrations apply to empty Postgres and ClickHouse databases",
  async () => {
    // ── Provision empty databases ──────────────────────────────────────────
    const root = new SQL(PG_BASE);
    await root.unsafe(`DROP DATABASE IF EXISTS ${SMOKE_DB} WITH (FORCE)`);
    await root.unsafe(`CREATE DATABASE ${SMOKE_DB}`);
    await root.close();

    const pgSetup = new SQL(smokePgUrl());
    await pgSetup.unsafe("CREATE EXTENSION IF NOT EXISTS vector");
    await pgSetup.unsafe('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');
    await pgSetup.unsafe("CREATE EXTENSION IF NOT EXISTS pg_trgm");
    await pgSetup.close();

    await chQuery(`DROP DATABASE IF EXISTS ${SMOKE_DB}`);
    await chQuery(`CREATE DATABASE ${SMOKE_DB}`);

    try {
      // ── Run the real migration runner against the empty databases ─────────
      const proc = Bun.spawn(["bun", MIGRATE_SCRIPT], {
        cwd: join(import.meta.dir, ".."),
        env: {
          ...process.env,
          DATABASE_URL: smokePgUrl(),
          CLICKHOUSE_URL: CH_URL,
          CLICKHOUSE_DB: SMOKE_DB,
        },
        stdout: "pipe",
        stderr: "pipe",
      });
      const exitCode = await proc.exited;
      const stdout = await new Response(proc.stdout).text();
      const stderr = await new Response(proc.stderr).text();
      if (exitCode !== 0) {
        throw new Error(
          `migrate runner exited ${exitCode}\nstdout:\n${stdout}\nstderr:\n${stderr}`,
        );
      }

      // ── Assert Postgres key tables ────────────────────────────────────────
      const pg = new SQL(smokePgUrl());
      try {
        const rows =
          (await pg`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'`) as Array<{
            table_name: string;
          }>;
        const tables = new Set(rows.map((r) => r.table_name));
        for (const table of PG_KEY_TABLES) {
          expect(tables.has(table), `Postgres table ${table} should exist`).toBe(true);
        }
        const [{ n }] = (await pg`SELECT count(*)::int AS n FROM schema_migrations`) as Array<{
          n: number;
        }>;
        expect(n).toBe(await countSqlFiles(PG_MIGRATIONS));
      } finally {
        await pg.close();
      }

      // ── Assert ClickHouse key tables ──────────────────────────────────────
      const tablesText = await chQuery(
        `SELECT name FROM system.tables WHERE database = '${SMOKE_DB}' FORMAT TabSeparated`,
        SMOKE_DB,
      );
      const chTables = new Set(
        tablesText
          .split("\n")
          .map((s) => s.trim())
          .filter(Boolean),
      );
      for (const table of CH_KEY_TABLES) {
        expect(chTables.has(table), `ClickHouse table ${table} should exist`).toBe(true);
      }
      const chCount = await chQuery(
        "SELECT count() FROM schema_migrations FORMAT TabSeparated",
        SMOKE_DB,
      );
      expect(Number(chCount.trim())).toBe(await countSqlFiles(CH_MIGRATIONS));
    } finally {
      // ── Drop throwaway databases ──────────────────────────────────────────
      const cleanup = new SQL(PG_BASE);
      await cleanup.unsafe(`DROP DATABASE IF EXISTS ${SMOKE_DB} WITH (FORCE)`);
      await cleanup.close();
      await chQuery(`DROP DATABASE IF EXISTS ${SMOKE_DB}`);
    }
  },
  60000,
);
