# Database migrations

Aestus stores relational state in **Postgres** and high-volume time-series in
**ClickHouse**. Both are versioned with plain SQL migration files applied by a
small Bun runner — no ORM, so the zod contracts in `packages/contracts` stay the
single source of truth for shapes and the SQL stays readable and reviewable.

## Why a SQL-file runner (not Drizzle/Prisma/etc.)

- Contracts are zod, not an ORM schema. An ORM migration tool would create a
  second, competing source of truth for the data model.
- ClickHouse has no first-class TS migration tooling; a SQL-file pattern is the
  natural fit there. Using the same pattern for Postgres keeps one mental model.
- Single-user, self-hosted, €10–30/mo target — minimal dependencies win. The
  runner uses Bun's built-in `SQL` (Postgres) and `fetch` (ClickHouse HTTP), so
  it adds zero npm dependencies.

## Layout

```
infra/migrations/
  postgres/    NNNN_description.sql   # applied in filename order, transactionally
  clickhouse/  NNNN_description.sql   # applied in filename order, statement-by-statement
```

Each engine tracks what it has applied in its own `schema_migrations` table, so
the runner is idempotent: re-running applies only pending files.

### File conventions

- Name `NNNN_short_description.sql` with a zero-padded ordinal (`0001_`, `0002_`…).
  Filenames are the version key — never rename or renumber an applied migration;
  add a new one instead.
- Statements end with `;`. Use single-line `--` comments only (the ClickHouse
  splitter strips `--` lines before splitting on `;`).
- Migrations are forward-only and additive. Treat applied files as immutable.

## Commands

Run from the repo root (these proxy into `apps/api`):

```bash
bun run db:migrate            # apply pending Postgres + ClickHouse migrations
```

Or from `apps/api` for finer control:

```bash
bun run db:migrate            # both engines
bun run db:migrate:postgres   # Postgres only
bun run db:migrate:clickhouse # ClickHouse only
bun run db:migrate:status     # show applied/pending per engine, apply nothing
```

The databases must be running first:

```bash
bun run docker:up             # starts Postgres, ClickHouse, Redis, NATS
```

### Connection env

Defaults match `infra/docker-compose.yml`, so a stock local stack needs no
configuration:

| Var              | Default                                          |
| ---------------- | ------------------------------------------------ |
| `DATABASE_URL`   | `postgres://aestus:aestus@localhost:5432/aestus` |
| `CLICKHOUSE_URL` | `http://aestus:aestus@localhost:8123`            |

## Adding a migration

1. Create the next-numbered `.sql` file in the right engine directory.
2. If it changes a contract-backed shape, update the zod contract, fixtures,
   JSON Schema, and frontend types in the same change (CLAUDE.md hard rule #8).
3. `bun run db:migrate:status` to confirm it shows as pending, then
   `bun run db:migrate` to apply.
4. The migration smoke test (`apps/api/test/migrate.smoke.test.ts`) applies all
   migrations to empty databases and asserts key tables exist.
