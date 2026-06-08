/**
 * Aestus database migration runner.
 *
 * Applies versioned, ordered `.sql` migrations to Postgres and ClickHouse:
 *   - Postgres  : infra/migrations/postgres/*.sql   (transactional, via Bun's built-in SQL)
 *   - ClickHouse: infra/migrations/clickhouse/*.sql  (statement-split, over the HTTP interface)
 *
 * Each engine records applied migrations in its own `schema_migrations` table,
 * so re-running is idempotent — only pending files run, in filename order.
 * Migration files are plain SQL: numbered `NNNN_description.sql`, statements
 * separated by `;`, single-line `--` comments only.
 *
 * Usage (run from apps/api):
 *   bun run scripts/migrate.ts             # apply pending migrations to both engines
 *   bun run scripts/migrate.ts postgres    # Postgres only
 *   bun run scripts/migrate.ts clickhouse  # ClickHouse only
 *   bun run scripts/migrate.ts --status    # list applied/pending without applying
 *
 * Env (defaults match infra/docker-compose.yml):
 *   DATABASE_URL    postgres://aestus:aestus@localhost:5432/aestus
 *   CLICKHOUSE_URL  http://aestus:aestus@localhost:8123
 */
import { SQL } from "bun";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

const MIGRATIONS_ROOT = join(import.meta.dir, "..", "..", "..", "infra", "migrations");
const PG_DIR = join(MIGRATIONS_ROOT, "postgres");
const CH_DIR = join(MIGRATIONS_ROOT, "clickhouse");

const DATABASE_URL = process.env.DATABASE_URL ?? "postgres://aestus:aestus@localhost:5432/aestus";
const CLICKHOUSE_URL = process.env.CLICKHOUSE_URL ?? "http://aestus:aestus@localhost:8123";
const CLICKHOUSE_DB = process.env.CLICKHOUSE_DB ?? "aestus";

/** List `.sql` files in a migration directory, sorted by filename (= apply order). */
async function listMigrations(dir: string): Promise<string[]> {
  try {
    const entries = await readdir(dir);
    return entries.filter((f) => f.endsWith(".sql")).sort();
  } catch {
    return [];
  }
}

/** Split a ClickHouse migration file into individual statements (HTTP runs one per request). */
function splitStatements(text: string): string[] {
  const withoutComments = text
    .split("\n")
    .filter((line) => !line.trim().startsWith("--"))
    .join("\n");
  return withoutComments
    .split(";")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function logStatus(engine: string, applied: Set<string>, files: string[]): void {
  console.log(`[${engine}] ${applied.size} applied, ${files.length - applied.size} pending`);
  for (const file of files) {
    console.log(`  ${applied.has(file) ? "x" : " "} ${file}`);
  }
}

async function migratePostgres(statusOnly: boolean): Promise<void> {
  const files = await listMigrations(PG_DIR);
  const sql = new SQL(DATABASE_URL);
  try {
    await sql`CREATE TABLE IF NOT EXISTS schema_migrations (
      version TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`;
    const rows = (await sql`SELECT version FROM schema_migrations`) as Array<{ version: string }>;
    const applied = new Set(rows.map((r) => r.version));

    if (statusOnly) {
      logStatus("postgres", applied, files);
      return;
    }

    const pending = files.filter((f) => !applied.has(f));
    for (const file of pending) {
      const ddl = await readFile(join(PG_DIR, file), "utf8");
      await sql.begin(async (tx) => {
        await tx.unsafe(ddl);
        await tx`INSERT INTO schema_migrations (version) VALUES (${file})`;
      });
      console.log(`[postgres] applied ${file}`);
    }
    if (pending.length === 0) console.log("[postgres] up to date");
  } finally {
    await sql.close();
  }
}

/** Parse a ClickHouse URL into an auth-stripped endpoint plus credentials. */
function parseClickhouseUrl(raw: string): { endpoint: string; user?: string; password?: string } {
  const url = new URL(raw);
  const user = decodeURIComponent(url.username) || undefined;
  const password = decodeURIComponent(url.password) || undefined;
  url.username = "";
  url.password = "";
  return { endpoint: url.toString().replace(/\/$/, ""), user, password };
}

async function clickhouseQuery(statement: string): Promise<string> {
  const { endpoint, user, password } = parseClickhouseUrl(CLICKHOUSE_URL);
  const headers: Record<string, string> = {};
  if (user) headers["X-ClickHouse-User"] = user;
  if (password) headers["X-ClickHouse-Key"] = password;
  const res = await fetch(`${endpoint}/?database=${encodeURIComponent(CLICKHOUSE_DB)}`, {
    method: "POST",
    headers,
    body: statement,
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`ClickHouse query failed (${res.status}): ${text.trim()}`);
  }
  return text;
}

async function migrateClickhouse(statusOnly: boolean): Promise<void> {
  const files = await listMigrations(CH_DIR);
  await clickhouseQuery(
    `CREATE TABLE IF NOT EXISTS schema_migrations (
       version String,
       applied_at DateTime DEFAULT now()
     ) ENGINE = MergeTree ORDER BY version`,
  );
  const appliedText = await clickhouseQuery(
    "SELECT version FROM schema_migrations FORMAT TabSeparated",
  );
  const applied = new Set(
    appliedText
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean),
  );

  if (statusOnly) {
    logStatus("clickhouse", applied, files);
    return;
  }

  const pending = files.filter((f) => !applied.has(f));
  for (const file of pending) {
    const text = await readFile(join(CH_DIR, file), "utf8");
    for (const statement of splitStatements(text)) {
      await clickhouseQuery(statement);
    }
    await clickhouseQuery(`INSERT INTO schema_migrations (version) VALUES ('${file}')`);
    console.log(`[clickhouse] applied ${file}`);
  }
  if (pending.length === 0) console.log("[clickhouse] up to date");
}

const positional = process.argv[2];
const statusOnly = process.argv.includes("--status");
const target = positional && !positional.startsWith("--") ? positional : "all";

try {
  if (target === "all" || target === "postgres") await migratePostgres(statusOnly);
  if (target === "all" || target === "clickhouse") await migrateClickhouse(statusOnly);
} catch (err) {
  console.error(`migration failed: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
}
