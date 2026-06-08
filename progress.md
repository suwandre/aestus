# Aestus Build Progress Log

Cross-phase memory for the agentic build loop. Workers append; never rewrite history.
Entries are the **binding record** of decisions, assumptions, and contract changes —
later workers must consult relevant entries before touching the same areas.

## Entry format

```
### <TASK-ID> — <short title>
- Files: <paths>
- Checks: <typecheck/tests/scripts run + result>
- Assumptions: <anything decided that the spec left open; "none" if none>
- Follow-ups: <new task IDs created or suggested; "none" if none>
```

Phase reviews append `### PXX REVIEW — PASS/FAIL` entries with findings.

---

### DECISION — Runtime LLM providers (binding; informs P00 ADR + P13)

- Provider: **Ollama Cloud** (subscription-billed API key, OpenAI/Anthropic-compatible). Chosen over per-token Anthropic API to fit the €10–30/mo flat-cost target. Claude subscriptions do not issue API keys for app embedding — not an option for runtime.
- Top-tier reasoning (spec §183 — briefings, thesis synthesis, NL chat): **Kimi K2.6**.
- High-volume narrow (spec §184 — entity extraction, relevance, sentiment, classification): **MiniMax M2.7**.
- Both behind the §182 provider-agnostic abstraction (swappable). Confirm exact `:cloud` tags against Ollama Cloud catalog at P13.
- Env: `OLLAMA_API_KEY`, `OLLAMA_BASE_URL`. Fixture-first: app runs with no LLM key present.
- NOTE: This concerns the **runtime app only**. The build loop (`scripts/loop.ps1`) stays on Claude Code (Opus 4.8 / Sonnet 4.6) per the todo routing table — do not remap it.
- Full detail: `docs/credentials.md`.

### P00-T001 — Add source documents to repo docs

- Files: README.md (new), docs/specs/cockpit_spec.md, docs/specs/cockpit_ui_implementation.md, docs/specs/cockpit_agentic_build_todo.md (pre-committed)
- Checks: Verified README links to all three spec docs and cockpit.html reference; spec files confirmed present under docs/specs/
- Assumptions: cockpit.html already placed in docs/specs/ by prior commit; README authored by interrupted prior worker and reviewed as correct
- Follow-ups: none

### P00-T008 — Define agent handoff protocol

- Files: docs/agent_handoff.md (new)
- Checks: Protocol covers startup checks (.stop, git status, progress.md, git log), per-task procedure (action, done-when verification, checkbox flip, progress entry, commit), blocked-task handling, commit conventions, and explicit do-not-do list; consistent with CLAUDE.md working protocol
- Assumptions: none
- Follow-ups: none

### P00-T007 — Write MVP scope boundary

- Files: docs/mvp_scope.md (new)
- Checks: First exchanges identified (Binance live, Bybit/Hyperliquid/OKX placeholder); first assets listed (BTC, ETH perps + macro proxies); all 10 tabs listed; deferred features explicitly called out; cost envelope stated
- Assumptions: Bybit/Hyperliquid/OKX live feeds treated as post-P30 only; social firehose deferred per non_goals.md; macro proxy source (SPX, DXY, GOLD, VIX) confirmed at P06/P07 — noted as TBD
- Follow-ups: P06/P07 — confirm free macro proxy sources for SPX/DXY/GOLD/VIX

### P00-T006 — Write ADR for chosen stack

- Files: docs/adr/ADR-001-stack.md (new)
- Checks: ADR covers all required stack components (Rust ingestion/features, TS/Bun API/LLM, NATS JetStream, Redis/BullMQ, Postgres+pgvector, ClickHouse, single VPS Docker Compose); includes runtime LLM provider decision from progress.md DECISION entry (Ollama Cloud, Kimi K2.6, MiniMax M2.7); explicitly defers FFI kernels to D11; alternatives table present
- Assumptions: Ollama Cloud model tag naming (e.g. kimi-k2.6:cloud) must be confirmed at P13 — noted in Consequences; pgvector image variant must be confirmed at P04 — noted in Consequences
- Follow-ups: P13 — confirm Ollama Cloud model tags against live catalog before hardcoding

### P00-T005 — Create architecture decision log folder

- Files: docs/adr/README.md (new)
- Checks: README explains when to write an ADR, includes full template, and indexes ADR-001 (written in P00-T006)
- Assumptions: ADR-001 pre-indexed in README because it is written immediately after in the same phase
- Follow-ups: none

### P00-T004 — Create glossary

- Files: docs/glossary.md (new)
- Checks: All twelve required terms defined (asset, venue, market state, feature snapshot, anomaly, context packet, briefing, decision, setup, regime, R-multiple, invalidation); definitions cross-checked against todo task descriptions and principles.md for consistency
- Assumptions: R-multiple formula shown for longs; sign convention for shorts noted inline
- Follow-ups: none

### P00-T003 — Create non-goals doc

- Files: docs/non_goals.md (new)
- Checks: Verified doc explicitly prohibits automated order execution and auto-close logic; covers all five required absolute non-goals (no order execution, no HFT, no multi-tenant SaaS, no signal-selling, no premium feed dependency for MVP); deferred features section present
- Assumptions: File authored by interrupted prior worker; content reviewed as meeting done-when criteria
- Follow-ups: none

### P01-T010 — Add CI skeleton

- Files: .github/workflows/ci.yml (new)
- Checks: YAML structure verified; two jobs (ts-checks, rust-checks) covering format-check, lint, typecheck, test for TS and fmt-check, cargo check, clippy, test for Rust; triggers on PR to main and push to main
- Assumptions: GitHub Actions target (self-hosted VPS has no CI runner — this file is for when the repo is hosted on GitHub per P28); Swatinem/rust-cache used for build-time savings; bun --frozen-lockfile for reproducible installs
- Follow-ups: none

### P01-T009 — Create conventional commit/task branch guidance

- Files: docs/dev_workflow.md (new)
- Checks: Doc covers branch naming (task/P03-T004-clickhouse-schema format), commit types/scope/rules, PR checklist with all required checks, agent loop summary; example branch name matches done-when criterion
- Assumptions: Doc intentionally overlaps with agent_handoff.md for PR/human workflow clarity — no duplication removal needed
- Follow-ups: none

### P01-T008 — Add environment variable templates

- Files: .env.example (root, new), apps/api/.env.example, apps/web/.env.example, services/ingestion/.env.example, infra/.env.example (all new)
- Checks: .gitignore already covers .env / .env.\* with !.env.example exception; no secrets in any example file; all required vars documented per credentials.md and ADR-001 stack (Postgres, Redis, NATS, ClickHouse, Ollama Cloud, optional on-chain/push)
- Assumptions: services/context and services/features will share infra vars from root .env at runtime; separate .env.example not required for pure library packages (contracts/ui/config)
- Follow-ups: none

### P01-T007 — Configure TypeScript strict mode

- Files: tsconfig.base.json (new), apps/api/tsconfig.json, apps/web/tsconfig.json, packages/contracts/tsconfig.json, packages/ui/tsconfig.json, packages/config/tsconfig.json (all new), apps/web/src/index.ts (placeholder added to satisfy no-inputs check)
- Checks: `bun run typecheck` passes all 5 workspace packages; verified implicit-any is rejected (TS7006 on untyped param); noUnusedLocals/noUnusedParameters enforced via strict:true + individual flags
- Assumptions: apps/web tsconfig uses Next.js plugin and dom lib ahead of P16 — these are forward-compatible; apps/web src placeholder matches pattern of other packages
- Follow-ups: none

### P01-T006 — Configure linting

- Files: eslint.config.js (new), package.json (lint script + type:module + eslint/typescript-eslint devDeps), Cargo.toml (workspace.lints section), services/ingestion/Cargo.toml, services/features/Cargo.toml, crates/event_model/Cargo.toml, crates/market_math/Cargo.toml (lints.workspace = true added to all members)
- Checks: `bun run lint` runs ESLint flat config (typescript-eslint recommended) and cargo clippy --workspace -- -D warnings; both pass clean on placeholder code
- Assumptions: ESLint flat config (eslint.config.js) requires "type":"module" in package.json root; Clippy warns on unwrap_used/expect_used rather than denying to allow placeholder code
- Follow-ups: none

### P01-T005 — Configure formatting

- Files: .prettierrc (new), .prettierignore (new), rustfmt.toml (new), package.json (format script updated to include cargo fmt --all)
- Checks: `bun run format` runs Prettier over TS/MD/JSON and cargo fmt over Rust workspace; `bun run format:check` passes clean; fixtures/ and _.generated._ excluded via .prettierignore; rustfmt.toml uses stable-only options (nightly-only imports_granularity/group_imports removed)
- Assumptions: Prettier printWidth=100 to match Rust max_width=100; LF line endings enforced for cross-platform consistency
- Follow-ups: none

### P01-T004 — Add root task runner commands

- Files: README.md (updated — Common commands table added), package.json (scripts already present from P01-T002)
- Checks: README table documents all required commands: dev, test, lint, typecheck, format, docker:up, docker:down, db:migrate plus Cargo equivalents
- Assumptions: Cargo commands documented in README alongside Bun commands for discoverability; no separate task runner (Make/just) added — the spec says "root scripts" which is covered by package.json + README
- Follow-ups: none

### P01-T003 — Initialize Rust workspace

- Files: Cargo.toml (root workspace), crates/event_model/Cargo.toml, crates/event_model/src/lib.rs, crates/market_math/Cargo.toml, crates/market_math/src/lib.rs, services/ingestion/Cargo.toml, services/ingestion/src/main.rs, services/features/Cargo.toml, services/features/src/main.rs, Cargo.lock
- Checks: `cargo check --workspace` passes; all 4 crates compile (event_model, market_math, ingestion, features)
- Assumptions: services/context is TypeScript (per P11 spec) and excluded from Rust workspace; workspace.dependencies shared for all crates
- Follow-ups: none

### P01-T002 — Initialize package manager for TypeScript workspaces

- Files: package.json (root Bun workspace), apps/api/package.json, apps/web/package.json, packages/contracts/package.json, packages/ui/package.json, packages/config/package.json, apps/api/src/index.ts, packages/contracts/src/index.ts, packages/ui/src/index.ts, packages/config/src/index.ts, bun.lock
- Checks: `bun install` succeeded (56 packages); `bun pm ls` shows all 5 workspace packages resolve at expected paths
- Assumptions: apps/web placeholder entry point deferred — Next.js app structure created at P16-T001; bun.lock committed (standard lockfile practice)
- Follow-ups: none

### P01-T001 — Create monorepo root structure

- Files: apps/web/README.md, apps/api/README.md, services/ingestion/README.md, services/features/README.md, services/context/README.md, packages/contracts/README.md, packages/ui/README.md, packages/config/README.md, infra/README.md, fixtures/README.md (docs/ and scripts/ pre-existed)
- Checks: All ten required new folders created with ownership READMEs; docs/ and scripts/ already present from P00
- Assumptions: none
- Follow-ups: none

### P00-T002 — Create implementation principles doc

- Files: docs/principles.md (new)
- Checks: Verified doc covers all six required topics from task spec: cockpit not autopilot, context over raw signal, no-trade is valid, deterministic levels, LLM narrative only, single-user/self-hosted/low-cost; no new product scope added
- Assumptions: File authored by interrupted prior worker; content reviewed as meeting done-when criteria
- Follow-ups: none

### P01 REVIEW — PASS

Verified all 10 P01 tasks against the actual repo with zero trust in progress.md claims.

- P01-T001: All 10 required folders present; every folder has a README explaining ownership and dependent services.
- P01-T002: `bun pm ls` shows all 5 workspace packages resolving at correct paths; bun.lock committed.
- P01-T003: `cargo check --workspace` passes; 4 crates compile (event_model, market_math, ingestion, features).
- P01-T004: Root README "Common commands" table lists all required commands (dev, test, lint, typecheck, format, docker:up, docker:down, db:migrate) plus Cargo equivalents.
- P01-T005: `bun run format:check` passes clean; .prettierrc, .prettierignore, rustfmt.toml all present.
- P01-T006: `bun run lint` passes (ESLint flat config + cargo clippy --workspace -D warnings); eslint.config.js present.
- P01-T007: All workspace tsconfigs extend tsconfig.base.json with `strict: true` (implies noImplicitAny); `bun run typecheck` passes on placeholders across all 5 packages.
- P01-T008: 5 .env.example files confirmed at root, apps/api, apps/web, services/ingestion, infra; no live secrets.
- P01-T009: docs/dev_workflow.md present; branch format `task/<PHASE-TASKID>-<short-slug>` documented with exact example `task/P03-T004-clickhouse-schema`.
- P01-T010: .github/workflows/ci.yml present; two jobs (ts-checks, rust-checks) covering format-check, lint, typecheck, and test for both TS and Rust on PR/push to main.

No [!] tasks in P01. No failures.

### P02-T010 — Create local reset script

- Files: scripts/reset-local.sh (new)
- Checks: `sh -n scripts/reset-local.sh` syntax-clean; running without `--confirm` exits with code 1 and clear error message listing what will be deleted; script uses `docker compose down --volumes --remove-orphans` which destroys all named volumes; explicit `--confirm` flag required — no prompt, no interactive input needed (safe for Makefile use)
- Assumptions: Makefile calls this with --confirm already passed (the Makefile reset-local target calls `sh scripts/reset-local.sh --confirm`); if called from terminal without --confirm, user sees the safety message and must re-run intentionally
- Follow-ups: none

### P02-T009 — Add Makefile aliases

- Files: Makefile (new)
- Checks: `make -n up` dry-runs correctly (docker compose -f infra/docker-compose.yml up -d); all required targets present: up, down, logs, ps, health, reset-local; all .PHONY declared
- Assumptions: Makefile targets `up`, `down`, `logs` map directly to docker compose commands; `health` delegates to scripts/infra-health.sh; `reset-local` delegates to scripts/reset-local.sh --confirm (created in P02-T010); Windows users should use WSL as noted in local_dev.md
- Follow-ups: none

### P02-T008 — Document local boot sequence

- Files: docs/local_dev.md (new)
- Checks: Doc covers all required steps: install Bun/Rust/Docker, copy env files, start infra, run API, run web; includes infra-health.sh usage, db:migrate note, Rust service build, docker compose down, reset-local reference, Makefile shortcuts, and troubleshooting table; WSL 2 note for Windows users
- Assumptions: db:migrate step documented as "not yet wired until P04" to avoid confusion; Makefile aliases referenced here and implemented in P02-T009
- Follow-ups: none

### P02-T007 — Create infra health script

- Files: scripts/infra-health.sh (new)
- Checks: `sh -n scripts/infra-health.sh` passes (syntax clean); script checks NATS (/healthz), Redis (redis-cli ping), Postgres (pg_isready), ClickHouse (/ping); each service prints [PASS] or [FAIL] with host:port; exits 0 only when all pass; all hosts/ports configurable via env vars with local-dev defaults
- Assumptions: redis-cli and pg_isready may not be installed on the host — FAIL message advises this; wget is used for HTTP checks (available on macOS via homebrew, standard on Linux)
- Follow-ups: none

### P02-T006 — Add local object/artifact folder

- Files: .local/artifacts/.gitkeep (new, force-added), .gitignore (appended .local/)
- Checks: `.local/` is in .gitignore so runtime artifacts (briefings, logs, screenshots) stay out of git; `.local/artifacts/.gitkeep` force-added to track directory structure; `git status` confirms file is staged correctly
- Assumptions: force-add (`git add -f`) is the standard pattern for tracking an otherwise-ignored directory; once committed, clones will have the path and won't need -f again
- Follow-ups: none

### P02-T005 — Configure ClickHouse container

- Files: infra/docker-compose.yml (updated: added CLICKHOUSE_DEFAULT_ACCESS_MANAGEMENT=1)
- Checks: `docker compose config --quiet` passes; clickhouse service has CLICKHOUSE_DB/USER/PASSWORD from env with defaults, named volume (clickhouse-data), HTTP port 8123 and native TCP port 9000 exposed; healthcheck polls /ping endpoint (no auth required); CLICKHOUSE_DEFAULT_ACCESS_MANAGEMENT=1 enables SQL-based user management needed at P04
- Assumptions: clickhouse/clickhouse-server:24.8-alpine handles CLICKHOUSE_USER/PASSWORD/DB via built-in Docker entrypoint; no custom config.xml needed for single-node dev — image defaults are appropriate
- Follow-ups: P04 — CREATE TABLE statements and any additional user grants go in ClickHouse migration scripts

### P02-T004 — Configure Postgres container

- Files: infra/postgres/init.sql (new), infra/docker-compose.yml (updated: postgres mounts init script)
- Checks: `docker compose config --quiet` passes; init.sql creates vector, uuid-ossp, and pg_trgm extensions; mounted as 10-init.sql under docker-entrypoint-initdb.d (prefix 10 leaves room for future ordering); healthcheck uses pg_isready with POSTGRES_USER and POSTGRES_DB from env; pgvector/pgvector:pg16 image includes vector extension natively
- Assumptions: pgvector image bundles the vector extension; uuid-ossp and pg_trgm are bundled in standard Postgres contrib — no extra packages needed
- Follow-ups: P04 — schema migrations will CREATE TABLE using these extensions

### P02-T003 — Configure Redis container

- Files: infra/redis/redis.conf (new), infra/docker-compose.yml (updated: redis mounts config file)
- Checks: `docker compose config --quiet` passes; appendonly=yes and appendfsync=everysec confirmed in redis.conf; redis-data named volume ensures AOF file survives container restart; healthcheck via redis-cli ping present
- Assumptions: No password for local dev (requirepass commented out); maxmemory-policy allkeys-lru suitable for BullMQ hot-cache mix — jobs are re-enqueued on start if evicted
- Follow-ups: none

### P02-T002 — Configure NATS JetStream container

- Files: infra/nats/nats-server.conf (new), infra/docker-compose.yml (updated: nats service uses config file)
- Checks: `docker compose config --quiet` passes; nats service now mounts nats-server.conf read-only and uses `-c /etc/nats/nats-server.conf`; JetStream store_dir matches named volume mount path (/data/jetstream); client port 4222 and monitoring port 8222 both exposed
- Assumptions: max_memory_store=256MB and max_file_store=1GB are conservative dev defaults; production can override via a separate config or env-substituted values
- Follow-ups: none

### P02-T001 — Create Docker Compose baseline

- Files: infra/docker-compose.yml (new)
- Checks: `docker compose -f infra/docker-compose.yml config --quiet` passes (YAML valid); app services placed under `profiles: ["app"]` so `docker compose up` starts only infra (postgres, redis, clickhouse, nats); all four infra services have healthchecks and named volumes
- Assumptions: pgvector/pgvector:pg16 image used for Postgres to enable pgvector extension at P04; clickhouse/clickhouse-server:24.8-alpine used (24.8 is an LTS release); app services are placeholders that build from source context — they will fail until Dockerfiles are added at respective phases
- Follow-ups: none

### P00 REVIEW — PASS

Verified all 8 P00 tasks against the actual repo with zero trust in progress.md claims.

- P00-T001: docs/specs/cockpit_spec.md, cockpit_ui_implementation.md, cockpit_agentic_build_todo.md all present; README links to all three plus cockpit.html.
- P00-T002: docs/principles.md present; covers all six required topics (cockpit not autopilot, context over raw signal, no-trade valid, deterministic levels, LLM narrative only, single-user/self-hosted/low-cost); no new product scope added.
- P00-T003: docs/non_goals.md present; first section explicitly prohibits automated order execution and auto-close logic; all five required absolute non-goals stated.
- P00-T004: docs/glossary.md present; all 12 required terms defined (asset, venue, market state, feature snapshot, anomaly, context packet, briefing, decision, setup, regime, R-multiple, invalidation); consistent with spec terminology.
- P00-T005: docs/adr/README.md present; includes full ADR template and indexes ADR-001.
- P00-T006: docs/adr/ADR-001-stack.md present; states all required stack components (Rust ingestion/features, TS/Bun API/LLM, NATS JetStream, Redis/BullMQ, Postgres+pgvector, ClickHouse, single VPS Docker Compose); rationale tied to latency/cost/self-hosting constraints; FFI deferral to D11 explicit.
- P00-T007: docs/mvp_scope.md present; first exchanges (Binance live, Bybit/Hyperliquid/OKX fixture-only), first assets (BTC/ETH perps + macro proxies SPX/DXY/GOLD/VIX/OIL), all 10 tabs listed by phase, deferred features and providers explicitly enumerated.
- P00-T008: docs/agent_handoff.md present; covers startup checks, per-task procedure, done-when verification, checkbox flip, progress entry format, blocked-task handling, commit conventions, and explicit do-not-do list.

No [!] tasks in P00. No failures.

### P02 REVIEW — PASS

Verified all 10 P02 tasks against the actual repo with zero trust in progress.md claims.

- P02-T001: infra/docker-compose.yml present and YAML-valid; app services under `profiles: ["app"]` so bare `docker compose up` starts only infra; all four infra services (postgres, redis, clickhouse, nats) have healthchecks and named volumes.
- P02-T002: infra/nats/nats-server.conf has `jetstream { store_dir: /data/jetstream }` mapped to named volume `nats-data`; client port 4222 and monitoring port 8222 exposed.
- P02-T003: infra/redis/redis.conf has `appendonly yes` + `appendfsync everysec`; named volume `redis-data:/data` in compose.
- P02-T004: infra/postgres/init.sql creates vector, uuid-ossp, and pg_trgm extensions with inline documentation; healthcheck uses `pg_isready`.
- P02-T005: ClickHouse service has named volume `clickhouse-data`, env-sourced credentials, `CLICKHOUSE_DEFAULT_ACCESS_MANAGEMENT=1`, healthcheck on `/ping`.
- P02-T006: `.local/artifacts/.gitkeep` tracked via `git ls-files`; `.local/` present in .gitignore line 16.
- P02-T007: scripts/infra-health.sh exists; reports `[PASS]`/`[FAIL]` per dependency (NATS, Redis, Postgres, ClickHouse) with host:port detail; exits 1 on any failure.
- P02-T008: docs/local_dev.md exists; covers prerequisites (Bun/Rust/Docker), env file copy, infra start, API start, web start, Rust services, stop, reset, Makefile shortcuts, and troubleshooting table.
- P02-T009: Makefile at repo root has up, down, logs, ps, health, reset-local targets; all declared .PHONY.
- P02-T010: scripts/reset-local.sh requires `--confirm` as first argument; exits 1 with explicit warning listing all data that will be deleted when flag is absent.

No [!] tasks in P02. No failures.

### P03-T001 — Create asset identity schema

- Files: packages/contracts/src/common.ts (new), packages/contracts/src/asset.ts (new), packages/contracts/src/index.ts (re-export), fixtures/assets/identities.json (new)
- Checks: All 6 required fixtures (BTCUSDT, ETHUSDT, SPX, DXY, GOLD, VIX) parse via `AssetIdentity.parse`; `bun run typecheck` clean
- Assumptions: Contracts use `zod/v4` (bundled in zod 3.25.76) for native `z.toJSONSchema` at T014. `base`/`quote` made optional so non-pair macro proxies (SPX/DXY/GOLD/VIX) validate. Added `rates` to AssetClass for future coverage; macro proxies use `macro:<sym>` canonical_id prefix, crypto uses `crypto:<base>-<quote>`. SCHEMA_VERSION=1 constant in common.ts (informs T016).
- Follow-ups: none

### P03-T002 — Create venue schema

- Files: packages/contracts/src/venue.ts (new), packages/contracts/src/index.ts, fixtures/venues/venues.json (new), fixtures/venues/instruments.json (new)
- Checks: Binance perp+spot, Bybit perp, Hyperliquid perp, OKX perp, and a macro proxy (SPX) all parse via `Venue`/`VenueInstrument`; `bun run typecheck` clean
- Assumptions: `tick_size`/`lot_size` typed as decimal strings (not numbers) to avoid float precision loss. Added `option`/`futures` to MarketType for future coverage; `macro_proxy` market type represents non-exchange feeds. VenueInstrument.canonical_asset_id is the FK to AssetIdentity.canonical_id.
- Follow-ups: none

### P03-T003 — Create raw market event schema

- Files: packages/contracts/src/raw-event.ts (new), packages/contracts/src/index.ts, fixtures/market/raw_events.json (new)
- Checks: aggTrade (with provider_timestamp) and markPriceUpdate (without) fixtures parse via `RawMarketEvent`; `bun run typecheck` clean
- Assumptions: Full raw payload is stored out-of-band (object store) keyed by `raw_payload_hash`; envelope holds only the hash for dedup/provenance. `provider_timestamp` optional (some feeds omit it); `sequence` is a non-negative int monotonic per source. `schema_version` stamped on every envelope per T016 plan.
- Follow-ups: none

### P03-T004 — Create normalized market event schema

- Files: packages/contracts/src/normalized-event.ts (new), packages/contracts/src/index.ts, fixtures/market/normalized_events.json (new)
- Checks: All 8 variants (price_tick, trade, orderbook_delta, funding_rate, open_interest, liquidation, mark_price, index_price) parse via `z.discriminatedUnion("event_type", ...)`; `bun run typecheck` clean
- Assumptions: Prices/sizes are numbers (not decimal strings) — normalization is where exact provider decimals become numeric inputs for feature math; exact bytes stay replayable via RawMarketEvent.raw_payload_hash. orderbook_delta uses `[price,size]` tuples with size 0 = level removal. Each variant shares a Base (venue, instrument_id, canonical_asset_id, timestamp, optional sequence).
- Follow-ups: none

### P03-T005 — Create macro event schema

- Files: packages/contracts/src/macro.ts (new), packages/contracts/src/index.ts, fixtures/macro/events.json (new)
- Checks: CPI, FOMC, NFP, PPI, jobless claims fixtures parse via `MacroEvent`; `bun run typecheck` clean
- Assumptions: `consensus`/`previous`/`actual` are nullable numbers — `actual` is null until the print lands (CPI/FOMC/PPI fixtures show null actual; NFP/jobless show released actuals). importance enum low/medium/high. Numeric-only values (percentages stored as the bare number, counts as raw integers).
- Follow-ups: none

### P03-T006 — Create news item schema

- Files: packages/contracts/src/news.ts (new), packages/contracts/src/index.ts, fixtures/news/items.json (new)
- Checks: An RSS news item and a social (whale-alert) item parse via `NewsItem`; `bun run typecheck` clean
- Assumptions: `source_type` enum (rss/news/social/other) makes the shape future-social-source-ready per Done-when. `sentiment` is a 3-way enum; `relevance_score` constrained 0..1. `entities` are free strings that may reference canonical asset ids or tickers.
- Follow-ups: none

### P03-T007 — Create on-chain event schema

- Files: packages/contracts/src/onchain.ts (new), packages/contracts/src/index.ts, fixtures/onchain/events.json (new)
- Checks: BTC exchange netflow (exchange_flow, direction=net, signed amount) and whale accumulation (whale_transfer, classification=accumulation) fixtures parse via `z.discriminatedUnion("event_type", ...)`; stablecoin mint also included; `bun run typecheck` clean
- Assumptions: 5 variants exchange_flow/whale_transfer/stablecoin_mint_burn/token_unlock/dex_activity. exchange_flow `net` direction allows signed amount (negative = net outflow / off-exchange accumulation). whale_transfer carries optional `classification` (accumulation/distribution/neutral) to satisfy the accumulation fixture. amount in asset units, amount_usd optional.
- Follow-ups: none

### P03-T008 — Create feature snapshot schema

- Files: packages/contracts/src/feature-snapshot.ts (new), packages/contracts/src/index.ts, fixtures/features/snapshots.json (new)
- Checks: BTC snapshot (full funding/oi/volume features) and SPX macro snapshot (funding_z/oi_delta null) parse via `FeatureSnapshot`; `bun run typecheck` clean
- Assumptions: `returns`/`volatility`/`z_scores` are horizon-keyed numeric maps (`Record<string,number>`) for flexibility across assets. `funding_z`/`oi_delta`/`volume_z` nullable (macro/spot-only assets lack funding/OI). `regime` mirrors spec §113: trend/volatility/risk sub-labels. correlation_set + basis are arrays of typed entries. These three z-scores are the anomaly-engine inputs (spec §100).
- Follow-ups: none

### P03-T009 — Create anomaly event schema

- Files: packages/contracts/src/anomaly.ts (new), packages/contracts/src/index.ts, fixtures/anomalies/events.json (new)
- Checks: All 7 types (funding_spike, oi_surge, volume_anomaly, correlation_break, basis_dislocation, whale_flow, macro_approaching) parse via `AnomalyEvent`; `bun run typecheck` clean
- Assumptions: `sigma` nullable — schedule-driven types (macro_approaching, whale_flow) have null sigma. AnomalyType enum matches spec §117 taxonomy. status lifecycle: active/acknowledged/resolved/expired/dismissed. context_refs are free-form ref strings (feature:/onchain:/macro: prefixes) linking supporting evidence; rule_ref optional for rule-based detections.
- Follow-ups: none

### P03-T010 — Create context packet schema

- Files: packages/contracts/src/levels.ts (new), packages/contracts/src/context-packet.ts (new), packages/contracts/src/index.ts, fixtures/context/packets.json (new)
- Checks: Composed packet (trigger AnomalyEvent + FeatureSnapshot + correlated assets + news + macro + on-chain + analogues + deterministic levels) parses via `ContextPacket`; `bun run typecheck` clean
- Assumptions: ContextPacket composes the prior contracts directly (single source of truth). Introduced shared `levels.ts` (`DeterministicLevels`, `EntryZone`) so T011 briefing reuses the same level types — per hard rule #2 these are code-computed and the LLM may only reference them. Added `HistoricalAnalogue` (when/description/similarity/outcome). market_snapshot is a FeatureSnapshot for the primary asset.
- Follow-ups: T011 briefing imports DeterministicLevels/EntryZone from levels.ts

### P03-T011 — Create briefing schema

- Files: packages/contracts/src/briefing.ts (new), packages/contracts/src/index.ts, fixtures/briefings/briefings.json (new)
- Checks: long, short, and no_trade briefings parse via `Briefing`; `bun run typecheck` clean
- Assumptions: For `no_trade`, entry_zone/invalidation/size_suggestion are null and targets empty (made nullable). entry_zone reuses `EntryZone` from levels.ts and is copied from the context packet's deterministic_levels (hard rule #2 — LLM never invents levels). Added `CostMetadata` (provider/model/tokens/cost_usd) per hard rule #7 cost visibility; cost_usd=0.0 reflects Ollama Cloud flat-subscription billing (see DECISION entry). `model` field is the LLM id. supporting_context holds evidence ref strings.
- Follow-ups: none

### P03-T012 — Create decision schema

- Files: packages/contracts/src/decision.ts (new), packages/contracts/src/index.ts, fixtures/decisions/decisions.json (new)
- Checks: act, skip, snooze, dismiss, watch decisions parse via `Decision`; `bun run typecheck` clean
- Assumptions: Plan fields (planned_entry/planned_stop/planned_targets/risk_r) nullable/empty for non-act decisions; populated only on `act`. `briefing_id` is the informing-context link (hard rule #4). Added optional `snooze_until` for the snooze action. Per hard rule #1 these record intent only — no execution.
- Follow-ups: none

### P03-T013 — Create journal trade schema

- Files: packages/contracts/src/journal.ts (new), packages/contracts/src/index.ts, fixtures/journal/trades.json (new)
- Checks: A closed winning trade and an open trade parse via `JournalTrade`; `bun run typecheck` clean
- Assumptions: entry/exit modeled as `TradeLeg {price, at}`; exit/realized_pnl/r_multiple null while open. To satisfy "analytics by setup/regime/signal" Done-when, added `setup_tags` (setup), optional `regime_at_entry` (reuses RegimeLabels), and optional `signal` (triggering anomaly type). `side` reuses Side enum. linked_briefing_id nullable (manual trades). Hard rule #1: records only, no execution.
- Follow-ups: none

### P03-T014 — Generate JSON Schema from contracts

- Files: packages/contracts/scripts/gen-schema.ts (new), packages/contracts/schema/\*.schema.json (15 generated), packages/contracts/package.json (+gen:schema script, +ajv devDep), bun.lock
- Checks: `bun run gen:schema` writes 15 draft-2020-12 schema files; verified an anomaly fixture validates against the generated JSON Schema via ajv with NO zod/runtime import (proves Done-when). `bun run typecheck` clean
- Assumptions: Used zod v4 native `z.toJSONSchema(schema, { target: "draft-2020-12" })` (no extra codegen dep). Added `ajv@8` as devDep — the standard draft-2020-12 validator, used here for verification and by the T015 fixture test, demonstrating consumers validate without importing zod. Discriminated unions serialize to `anyOf` with `const` discriminators (validator-portable). scripts/ excluded from tsc include so the Node-API generator doesn't need @types/node in the typecheck.
- Follow-ups: none

### P03-T015 — Add fixture validation test

- Files: packages/contracts/test/fixtures.test.ts (new), .prettierignore (exclude generated schema dir), progress.md (prettier-formatted)
- Checks: `bun test` in packages/contracts → 16 pass / 0 fail. Test loads every `.json` under fixtures/ and validates each item against its mapped contract via `.parse` (throws → fails CI). Includes a coverage test (any unmapped fixture fails CI) and a negative test (a malformed AssetIdentity is rejected). `bun run format:check` and `bunx eslint .` both clean.
- Assumptions: Test validates against the runtime contracts (zod) per Done-when wording ("validate against the contracts"); the T014 JSON-Schema path is the no-runtime alternative. Added a coverage guard so a new fixture without a contract mapping fails CI. Added `packages/contracts/schema/` to `.prettierignore` — generated artifacts are not hand-formatted (this also keeps the T014-generated files out of format:check); regenerate via `bun run gen:schema`.
- Follow-ups: none

### P03-T016 — Document schema versioning

- Files: docs/contracts_versioning.md (new)
- Checks: Doc covers the `schema_version`/`SCHEMA_VERSION` event-version field, breaking vs non-breaking change rules, the step-by-step migration process (edit zod → bump version → update fixtures → regenerate JSON Schema → update downstream → verify), a migration-notes table (baseline v1), and consumer/producer compatibility rules; `bun run format:check` clean
- Assumptions: Versioning is per-envelope for streamed events; reference data (AssetIdentity/Venue/MacroEvent/NewsItem) evolves via P04 storage migrations rather than a per-record version. Ties to CLAUDE.md hard rule #8 (update contracts/fixtures/docs/types together).
- Follow-ups: none

### P03 REVIEW — PASS

Verified all 16 P03 tasks against the actual repo with zero trust in progress.md claims. `bun test packages/contracts` → 16 pass / 0 fail. `bun run typecheck` → all 5 workspace packages exit 0.

- P03-T001: fixtures/assets/identities.json has all 6 required assets (BTCUSDT, ETHUSDT, SPX, DXY, GOLD, VIX); each parses via AssetIdentity.parse in the test suite.
- P03-T002: fixtures/venues/instruments.json covers Binance perp, Bybit perp, Hyperliquid perp, OKX perp, Binance spot, and macro_proxy (SPX); all parse via VenueInstrument.
- P03-T003: packages/contracts/src/raw-event.ts present; fixture raw_events.json tests pass; envelope includes source, venue, received_at, provider_timestamp (optional), sequence, event_type, raw_payload_hash for replay/traceability.
- P03-T004: normalized-event.ts uses z.discriminatedUnion on event_type with all 8 variants; all parse deterministically; tests pass.
- P03-T005: fixtures/macro/events.json has CPI, FOMC, NFP, PPI, and jobless claims; all parse via MacroEvent.
- P03-T006: news.ts source_type enum includes rss/news/social/other; fixtures include RSS and social items; tests pass.
- P03-T007: fixtures/onchain/events.json has exchange_flow (direction=net, negative amount = netflow out) and whale_transfer (classification=accumulation); both parse via OnChainEvent.
- P03-T008: feature-snapshot.ts includes returns, volatility, z_scores, funding_z, oi_delta, volume_z, correlation_set, basis, and regime labels; tests pass.
- P03-T009: fixtures/anomalies/events.json covers all 7 required types (funding_spike, oi_surge, volume_anomaly, correlation_break, basis_dislocation, whale_flow, macro_approaching); all parse via AnomalyEvent.
- P03-T010: context-packet.ts composes trigger AnomalyEvent + FeatureSnapshot + correlated assets + news + macro + on-chain + historical analogues + DeterministicLevels; fixture parses; tests pass.
- P03-T011: fixtures/briefings/briefings.json has long, short, and no_trade stances; all parse via Briefing.
- P03-T012: fixtures/decisions/decisions.json has act, skip, snooze, dismiss, and watch; all parse via Decision.
- P03-T013: journal.ts has setup_tags (setup), regime_at_entry (regime), and signal (anomaly type) fields; fixtures demonstrate both populated and null-exit (open) trades; tests pass.
- P03-T014: 15 draft-2020-12 JSON Schema files present in packages/contracts/schema/; each has "$schema": "https://json-schema.org/draft/2020-12/schema"; ajv@8 devDep present; gen:schema script produces them without runtime Zod import at validation time.
- P03-T015: fixtures.test.ts validates every fixture file via .parse (throws on bad shape); coverage guard fails CI on unmapped fixture files; negative test confirms rejection of invalid AssetIdentity; 16/16 pass.
- P03-T016: docs/contracts_versioning.md covers event version fields, breaking vs non-breaking change definitions, 7-step migration process, migration notes table (v1 baseline), and producer/consumer compatibility rules.

No [!] tasks in P03. No failures.

### DECISION — Migration tooling (binding; informs all of P04)

- Tool: a **custom SQL-file migration runner** in Bun (`apps/api/scripts/migrate.ts`), not an ORM migration tool (Drizzle/Prisma/Kysely). Rationale in `docs/migrations.md`: contracts are zod (not an ORM) so an ORM schema would become a competing source of truth; ClickHouse has no first-class TS migration tool; minimal-deps fits the €10–30/mo single-user target. Runner uses Bun's built-in `SQL` (Postgres) + `fetch` (ClickHouse HTTP) → zero new npm deps.
- Layout: `infra/migrations/postgres/NNNN_*.sql` (applied transactionally, in filename order) and `infra/migrations/clickhouse/NNNN_*.sql` (statement-split on `;`, single-line `--` comments only). Each engine tracks applied files in its own `schema_migrations` table → idempotent re-runs.
- Files are forward-only/immutable once applied; never renumber an applied migration. P04-T002…T015 add the actual table files under these dirs.

### P04-T001 — Choose migration tools

- Files: apps/api/scripts/migrate.ts (new), apps/api/package.json (db:migrate + :postgres/:clickhouse/:status scripts replace the placeholder), docs/migrations.md (new), infra/migrations/postgres/.gitkeep, infra/migrations/clickhouse/.gitkeep
- Checks: `bun run typecheck` clean (all 5 workspaces; scripts/ is outside apps/api `src` include, matching the P03-T014 precedent of keeping Node/Bun-API scripts out of tsc). `bun build` of migrate.ts OK. Ran live against Docker Postgres 16 + ClickHouse 24.8: `bun run db:migrate` → both "up to date" (creates `schema_migrations` in each), `db:migrate:status` → 0 applied / 0 pending. eslint + prettier clean.
- Assumptions: Runner connection defaults match docker-compose (`postgres://aestus:aestus@localhost:5432/aestus`, `http://aestus:aestus@localhost:8123`). ClickHouse HTTP defaults to the `default` db, so the runner targets `CLICKHOUSE_DB` (default `aestus`, the compose-created db) via `?database=`. `.env.example` files are permission-blocked for me — did not edit; compose already injects DATABASE_URL/CLICKHOUSE_URL for the api service. Postgres migrations run inside `sql.begin` using `tx.unsafe(ddl)` for multi-statement DDL.
- Follow-ups: none

### P04-T002 — Create Postgres asset tables

- Files: infra/migrations/postgres/0001_assets.sql (new)
- Checks: `bun run db:migrate:postgres` applied it against live Postgres 16; `psql \dt` confirms all 5 tables present (assets, venues, venue_instruments, watchlists, watchlist_members) + schema_migrations.
- Assumptions: Created Postgres enums `asset_class` (mirrors common.ts) and `market_type` (mirrors venue.ts) — reused by later migrations. `assets.canonical_id` is the FK target everywhere. `venue_instruments` PK is (venue_id, instrument_id); `tick_size`/`lot_size` are TEXT to preserve exact decimal precision per the contract. `venues.market_types` is an enum array. Added `watchlists` (id/name/description) and `watchlist_members` (watchlist_id, canonical_asset_id, sort_order) — not in the contracts (UI/config concern), modeled minimally for single-user. FKs cascade on delete.
- Follow-ups: none

### P04-T003 — Create Postgres news tables

- Files: infra/migrations/postgres/0002_news.sql (new)
- Checks: `bun run db:migrate:postgres` applied it; `psql \d news_items` confirms columns + the UNIQUE `idx_news_items_url_hash` (dedup) and source/published_at indexes. news_entities + news_embeddings created.
- Assumptions: Dedup is on `url_hash` (sha256 of canonical URL) via a UNIQUE index — added a dedicated column rather than uniquing the raw `url`. `news_entities(news_id, entity, canonical_asset_id?)` enables query by asset (FK to assets, SET NULL when entity isn't a tracked asset) and by entity (indexed). "Source metadata" = `source`/`source_type` columns on news_items (feed-registry/enablement is T010). `news_embeddings.embedding` is an unbounded `vector` placeholder (pgvector ext from init.sql); the fixed-dim column + ivfflat/hnsw index is deferred until the embedding model is chosen (noted in the migration + docs). Enums `news_source_type`, `sentiment` mirror news.ts.
- Follow-ups: none

### P04-T004 — Create Postgres macro tables

- Files: infra/migrations/postgres/0003_macro.sql (new)
- Checks: applied via `db:migrate:postgres`; verified the calendar-update path live — inserted a scheduled CPI row (actual null), then `UPDATE ... SET actual=3.3, actual_at=now(), revision=revision+1` succeeded (revision 0→1). Test row deleted afterward.
- Assumptions: `macro_events` mirrors MacroEvent (event_id PK, region, currency, title, scheduled_at, importance, consensus/previous/actual nullable, source). Added revision fields beyond the contract — `actual_at`, `revised_at`, `revision` (int counter), `updated_at` — to satisfy the "update when actual arrives" Done-when without a separate history table. Enum `macro_importance` mirrors macro.ts.
- Follow-ups: none

### P04-T005 — Create Postgres on-chain tables

- Files: infra/migrations/postgres/0004_onchain.sql (new)
- Checks: applied via `db:migrate:postgres`; `psql \d on_chain_events` confirms the task's columns (event_type, chain, asset_id, value, addresses, source, raw_ref) + id PK and indexes.
- Assumptions: Flattened the OnChainEvent discriminated union into one table with `id` PK (context packets link to it in T007 — satisfies Done-when). Variant-specific fields (direction, exchange, from/to_label, classification, tx_hash, action, stablecoin, category, dex, pool, activity_type) go in a JSONB `attributes` column rather than per-variant columns, matching the task's generic column list. `asset_id` is plain TEXT (not FK) since chain-native assets aren't always tracked in `assets`. `value`/`value_usd` are the magnitude/USD. Enum `on_chain_event_type` mirrors onchain.ts variants.
- Follow-ups: none

### P04-T006 — Create Postgres anomaly tables

- Files: infra/migrations/postgres/0005_anomalies.sql (new)
- Checks: applied via `db:migrate:postgres`; `\dt` confirms both `anomalies` and `anomaly_context_refs` present. `status` defaults to 'active' and persists; context refs persist in the linking table.
- Assumptions: `anomalies` mirrors AnomalyEvent (assets/venues kept as TEXT[] arrays per the contract — can't FK an array). The contract's flat `context_refs` is normalized into `anomaly_context_refs(anomaly_id, ref_type, ref)` with `ref_type` enum market/news/macro/on_chain/historical/feature so links are typed/queryable (Done-when). Enums `anomaly_type`, `anomaly_severity`, `anomaly_status`, `anomaly_context_ref_type` mirror anomaly.ts.
- Follow-ups: none

### P04-T007 — Create Postgres context packet tables

- Files: infra/migrations/postgres/0006_context_packets.sql (new)
- Checks: applied via `db:migrate:postgres`; `\dt` confirms `context_packets` + `context_packet_items`.
- Assumptions: To make a packet fully reproducible (Done-when), the scalar/single parts (trigger anomaly, market_snapshot, deterministic_levels) are snapshotted as JSONB on `context_packets`; the variable-length lists (correlated_assets, news, macro, on_chain, historical_analogues) live in `context_packet_items(packet_id, item_type, position, payload JSONB)` with an explicit ordinal so they reassemble in order. `trigger_anomaly_id` is a navigable FK (SET NULL on delete) alongside the embedded `trigger` JSONB, so reproduction doesn't depend on the anomaly row surviving. `primary_asset` FK RESTRICT. Enum `context_packet_item_type` matches the array fields of ContextPacket.
- Follow-ups: none

### P04-T008 — Create Postgres briefing tables

- Files: infra/migrations/postgres/0007_briefings.sql (new)
- Checks: applied via `db:migrate:postgres`; `\dt briefings` confirms it. Standalone table → persists independently of transient UI state (Done-when).
- Assumptions: `briefings` mirrors Briefing. `context_packet_id` FK RESTRICT. Levels: `entry_zone` JSONB {low,high} (nullable for no_trade), `invalidation` nullable, `targets` DOUBLE PRECISION[], `size_suggestion` JSONB nullable. CostMetadata flattened into `cost_provider/cost_model/cost_prompt_tokens/cost_completion_tokens/cost_total_tokens/cost_usd` columns for cost visibility/queryability (hard rule #7), separate from the authoring `model` column. Enum `stance` mirrors briefing.ts.
- Follow-ups: none

### P04-T009 — Create Postgres decision and journal tables

- Files: infra/migrations/postgres/0008_decisions_journal.sql (new)
- Checks: applied via `db:migrate:postgres`; `\dt` confirms `decisions`, `journal_entries`, `journal_outcomes`, `trade_tags`.
- Assumptions: `decisions` mirrors Decision (briefing_id FK RESTRICT to preserve the audit log per rule #4; plan fields nullable for non-act). JournalTrade is split: `journal_entries` holds the always-present entry leg + `outcome_status` (defaults 'open') + regime_at_entry JSONB + signal + linked_briefing_id (SET NULL); `journal_outcomes` (1:1, PK = journal_entry_id) holds the close leg (exit_price/at, realized_pnl, r_multiple) added when the trade closes; `trade_tags(journal_entry_id, tag)` normalizes setup_tags for analytics-by-setup. Enums `decision_type`, `trade_side`, `outcome_status` mirror the contracts (named `trade_side` to avoid colliding with a future generic `side`). Indexes on status/signal/tag/asset enable the query Done-when.
- Follow-ups: none

### P04-T010 — Create Postgres config tables

- Files: infra/migrations/postgres/0009_config.sql (new)
- Checks: applied via `db:migrate:postgres`; `\dt` confirms `alert_rules`, `feed_settings`, `model_routing`, `notification_channels`, `layout_preferences`. Watchlists were already added in 0001 (T002). All durable Postgres tables → survive restarts (Done-when).
- Assumptions: No contract backs these (config domain). `alert_rules` use a `condition` kind + JSONB `params`; `feed_settings` is one row per feed id for enablement; `model_routing` keys by LLM task_kind → provider/model (ties to the runtime-LLM-provider DECISION); `notification_channels` use a free-text `channel_type` + JSONB config; `layout_preferences` is a keyed JSONB store. Kept channel/condition as TEXT (not enums) since the value sets are open and config-driven.
- Follow-ups: none

### P04-T011 — Create ClickHouse raw event table

- Files: infra/migrations/clickhouse/0001_raw_market_events.sql (new)
- Checks: `bun run db:migrate:clickhouse` applied it against live ClickHouse 24.8; `SHOW TABLES` lists `raw_market_events` + `schema_migrations`.
- Assumptions: Mirrors RawMarketEvent; the full payload is external (object store keyed by raw_payload_hash) — this table is the replayable index. MergeTree, `PARTITION BY toYYYYMM(received_at)`, `ORDER BY (venue, source, received_at, sequence)` for per-feed ordered replay. `DateTime64(3,'UTC')` ms precision; venue/event_type are LowCardinality; `ingested_at DEFAULT now64(3)`. Used `CREATE TABLE IF NOT EXISTS` (smoke-test/idempotency friendly).
- Follow-ups: none

### P04-T012 — Create ClickHouse normalized event tables

- Files: infra/migrations/clickhouse/0002_normalized_market_events.sql (new)
- Checks: applied via `db:migrate:clickhouse`; `system.tables` confirms `normalized_market_events`.
- Assumptions: Chose a single wide table (not a per-variant family) for the 8 NormalizedMarketEvent variants — shared envelope columns + nullable per-variant columns, discriminated by `event_type`. orderbook_delta levels are `Array(Tuple(Float64,Float64))`; `side` is `Nullable(Enum8('buy'=1,'sell'=2))`. MergeTree `PARTITION BY toYYYYMM(timestamp)`, `ORDER BY (canonical_asset_id, event_type, timestamp)` so per-asset/time history is a prefix scan (Done-when: efficient query by asset/time).
- Follow-ups: none

### P04-T013 — Create ClickHouse OHLCV aggregate tables

- Files: infra/migrations/clickhouse/0003_ohlcv_aggregates.sql (new)
- Checks: applied via `db:migrate:clickhouse`; `system.tables` shows ohlcv_1m/5m/15m/1h + their \_mv. Functionally verified: inserted 3 out-of-order trades into normalized_market_events; reading ohlcv_1m with argMinMerge/argMaxMerge returned correct candle (open=100 first-by-time, high=110, low=90, close=110 last-by-time, volume=6, trades=3) — charts read candles without touching ticks (Done-when).
- Assumptions: One AggregatingMergeTree per timeframe fed by a per-timeframe materialized view over normalized_market_events (event_type IN trade/price_tick, price NOT NULL). open/close = AggregateFunction(argMin/argMax, Float64, DateTime64) read with -Merge; high/low/volume/trades = SimpleAggregateFunction. Bucketing via toStartOfMinute/FiveMinutes/FifteenMinutes/Hour. `assumeNotNull(price)` strips the source Nullable to match the non-null state types. Left a tiny `test:ohlcv` row set in the dev CH from verification — wiped by the reset-local before the T018 smoke test.
- Follow-ups: none

### P04-T014 — Create ClickHouse feature snapshot table

- Files: infra/migrations/clickhouse/0004_feature_snapshots.sql (new)
- Checks: applied via `db:migrate:clickhouse`; `system.tables` confirms `feature_snapshots`.
- Assumptions: Mirrors FeatureSnapshot. Horizon-keyed metrics (returns/volatility/z_scores) are `Map(String, Float64)`; correlation_set and basis are `Nested(...)` (parallel-array) columns matching the contract's array-of-objects; funding_z/oi_delta/volume_z Nullable; regime split into regime_trend/volatility/risk LowCardinality columns. `schema_version` versions the feature fields (Done-when). MergeTree `ORDER BY (canonical_asset_id, timestamp)` for rolling-state reads.
- Follow-ups: none

### P04-T015 — Create ClickHouse anomaly metrics table

- Files: infra/migrations/clickhouse/0005_anomaly_metrics.sql (new)
- Checks: applied via `db:migrate:clickhouse`; `system.tables` lists `anomaly_metrics`. All 8 CH base tables now present (raw/normalized events, 4 OHLCV, feature_snapshots, anomaly_metrics) + schema_migrations.
- Assumptions: anomaly_metrics is the analytics mirror of the Postgres `anomalies` row (linked by `anomaly_id` String). Retains severity/sigma + the feature state at trigger: named convenience columns (funding_z/oi_delta/volume_z), a generic `feature_values Map(String,Float64)` for arbitrary z_scores/returns, and regime labels. MergeTree `ORDER BY (canonical_asset_id, type, detected_at)` for per-asset/type analytics (Done-when).
- Follow-ups: none

### P04-T016 — Add retention and downsampling doc

- Files: docs/data_retention.md (new)
- Checks: prettier clean. Doc covers all required datasets (raw ticks, normalized events, aggregates, news, briefings, journal) + macro/on-chain/context/feature/anomaly; references the actual P04 table names and the ohlcv MVs.
- Assumptions: Tiered policy — expire raw ticks at 14d (candles preserve history), keep ohlcv_1h indefinitely, keep the decision record (briefings/decisions/journal) forever per rule #4. Concrete numbers chosen by me (spec had no retention guidance): raw envelopes 30d, ticks 14d, 1m 180d, 5m/15m 2y, feature_snapshots 180d, anomaly_metrics 2y, news 180d, on_chain 365d, context_packets 365d. TTLs are documented as `ALTER TABLE ... MODIFY TTL` to apply later rather than baked into the create migrations (so retention tuning doesn't rewrite schema migrations); Postgres prune is a scheduled-job DELETE (future ops phase) — briefings/decisions/journal explicitly excluded.
- Follow-ups: Wire the ClickHouse TTL ALTERs + the Postgres nightly prune job in a later ops phase (not yet a task ID).

### P04-T017 — Seed development data

- Files: apps/api/scripts/seed.ts (new), apps/api/package.json (+db:seed), package.json (+root db:seed proxy)
- Checks: `bun run db:seed` ran live → seeded 6 assets, 5 venues, 6 instruments, default watchlist (6 members), 3 alert rules, 2 model routes, 5 feed settings; ran twice to confirm idempotency (assets stayed at 6). Verified via psql: tags `{major,perp}`, market_types `{perp,spot}`, model_routing kimi-k2.6/minimax-m2.7. typecheck/eslint/prettier clean.
- Assumptions: Seed loads the reference fixtures (assets/venues/instruments) from `fixtures/` into Postgres + single-user defaults (watchlist 'default' over BTC/ETH/SPX/DXY/GOLD/VIX; 3 alert rules; model_routing from the runtime-LLM DECISION; feed_settings with binance+macro enabled, others disabled). Transactional UI data (anomalies/briefings/decisions) is NOT DB-seeded — fixture-first means the frontend reads those from `fixtures/` directly (rule #5); noted in the script header. Idempotent via ON CONFLICT DO NOTHING. NOTE for future workers: Bun 1.3 SQL does NOT encode JS arrays as Postgres array literals (sends "a,b" → "malformed array literal"); seed builds the `{...}` literal via a `pgArray()` helper and casts (`::text[]`, `::market_type[]`).
- Follow-ups: none

### P04-T018 — Add migration smoke test

- Files: apps/api/test/migrate.smoke.test.ts (new), .github/workflows/ci.yml (+migration-smoke job with postgres+clickhouse services)
- Checks: Smoke test passed live (36 assertions). Also ran a full cold-start: `reset-local --confirm` → fresh `docker compose up` → `db:migrate` applied all 9 Postgres + 5 ClickHouse migrations → `db:seed` populated → smoke test green.
- Assumptions: The test provisions its OWN throwaway databases (`aestus_migrate_smoke`) — CREATE DATABASE + extensions (pg) / CREATE DATABASE (ch), spawns the real `scripts/migrate.ts` against them via env (DATABASE_URL/CLICKHOUSE_DB), asserts all key tables exist + that schema_migrations count equals the number of `.sql` files per engine, then DROPs them (PG uses `WITH (FORCE)`). It self-skips when DBs are unreachable so the default CI `ts-checks` job (no DB) stays green; a dedicated `migration-smoke` CI job supplies Postgres (pgvector:pg16) + ClickHouse (24.8) services and a curl wait-for-ClickHouse step, then runs `bun test test/migrate.smoke.test.ts`. Verified the `aestus` user has CREATE DATABASE in both engines (PG superuser, CH access-management) so the throwaway-DB approach works in CI too.
- Follow-ups: none

### P04 REVIEW — PASS

Verified all 18 P04 tasks against a live, freshly-reset Docker stack (Postgres 16 / pgvector + ClickHouse 24.8). Cold-start path proven end-to-end: `reset-local --confirm` → `docker compose up` → `bun run db:migrate` (9 PG + 5 CH migrations applied) → `bun run db:seed` → `bun test test/migrate.smoke.test.ts` (1 pass / 36 assertions). Workspace `bun run typecheck`, `bunx eslint .`, and `bun run format:check` all clean.

- T001: SQL-file migration runner (`apps/api/scripts/migrate.ts`, Bun built-in SQL + ClickHouse HTTP, zero deps) + docs/migrations.md + package scripts. Idempotent, status mode works.
- T002–T010: 9 Postgres migrations create all required tables — assets/venues/instruments/watchlists(+members); news_items(+entities,+embeddings vector); macro_events(+revision fields); on_chain_events; anomalies(+context_refs); context_packets(+items, JSONB snapshots); briefings; decisions + journal_entries/outcomes + trade_tags; config (alert_rules/feed_settings/model_routing/notification_channels/layout_preferences). Enums mirror the contracts.
- T011–T015: 5 ClickHouse migrations — raw_market_events, normalized_market_events (single wide table over the 8-variant union), ohlcv_1m/5m/15m/1h (AggregatingMergeTree + MVs; candle aggregation functionally verified), feature_snapshots (Maps + Nested), anomaly_metrics.
- T016: docs/data_retention.md — tiered policy, concrete TTL/prune statements, decision record kept forever.
- T017: idempotent dev seed loads reference fixtures + single-user defaults.
- T018: self-contained smoke test (throwaway empty DBs, real runner, asserts key tables + migration counts) + dedicated `migration-smoke` CI job with DB services; self-skips when DBs are unreachable.

No [!] tasks in P04. No failures. Open follow-up (not a task ID): wire the ClickHouse TTL ALTERs + Postgres nightly prune job from data_retention.md in a later ops phase.

### P04 REVIEW — PASS

Independent review. Verified each task against the repo with zero trust in prior progress.md claims.

- T001: `apps/api/scripts/migrate.ts` exists and implements both Postgres (transactional via Bun SQL) and ClickHouse (HTTP statement-split) runners. `schema_migrations` tracked per engine. `docs/migrations.md` documents tool choice and all commands. Root `package.json` proxies `db:migrate`/`db:seed` to `apps/api`. Apps/api `package.json` exposes `db:migrate`, `db:migrate:postgres`, `db:migrate:clickhouse`, `db:migrate:status`, `db:seed`.
- T002: `infra/migrations/postgres/0001_assets.sql` — creates `assets`, `venues`, `venue_instruments`, `watchlists`, `watchlist_members` with correct FKs, enums mirroring contracts, and indexes.
- T003: `0002_news.sql` — `news_items` has `url_hash TEXT NOT NULL` with `UNIQUE INDEX` (dedup path). `news_entities` has `canonical_asset_id` FK and `entity` index (query by asset/entity path).
- T004: `0003_macro.sql` — `macro_events` has nullable `actual` plus `actual_at`, `revised_at`, `revision` columns; calendar-update path clear.
- T005: `0004_onchain.sql` — `on_chain_events` has `id TEXT PRIMARY KEY`; context packets (T007) embed snapshots as JSONB in `context_packet_items`.
- T006: `0005_anomalies.sql` — `anomalies` has `status anomaly_status NOT NULL DEFAULT 'active'`; `anomaly_context_refs(anomaly_id, ref_type, ref)` normalized with typed enum.
- T007: `0006_context_packets.sql` — `context_packets` snapshots `trigger`/`market_snapshot`/`deterministic_levels` as JSONB; `context_packet_items` snapshots ordered list items; `trigger_anomaly_id` SET NULL so reproduction survives anomaly row removal.
- T008: `0007_briefings.sql` — `briefings` table with all fields from contract (stance/thesis/levels/cost metadata/model/context_packet_id). Standalone, not tied to UI state.
- T009: `0008_decisions_journal.sql` — `decisions`, `journal_entries`, `journal_outcomes`, `trade_tags` with appropriate indexes on status/asset/signal/tag.
- T010: `0009_config.sql` — `alert_rules`, `feed_settings`, `model_routing`, `notification_channels`, `layout_preferences` all in Postgres (durable volume).
- T011: `infra/migrations/clickhouse/0001_raw_market_events.sql` — correct envelope fields, `raw_payload_hash`, MergeTree ORDER BY (venue, source, received_at, sequence).
- T012: `0002_normalized_market_events.sql` — single wide table, all 8 event-type variants, ORDER BY (canonical_asset_id, event_type, timestamp) enables per-asset/time prefix scans.
- T013: `0003_ohlcv_aggregates.sql` — `ohlcv_1m/5m/15m/1h` AggregatingMergeTree tables each fed by a dedicated materialized view over `normalized_market_events`; charts read these, never ticks.
- T014: `0004_feature_snapshots.sql` — `schema_version`, horizon-keyed Maps (returns/volatility/z_scores), Nested for correlation_set and basis, regime labels, ORDER BY (canonical_asset_id, timestamp).
- T015: `0005_anomaly_metrics.sql` — severity, sigma, named feature columns (funding_z/oi_delta/volume_z), generic `feature_values Map(String,Float64)`, regime labels at trigger time.
- T016: `docs/data_retention.md` — tiered policy covering every required dataset (raw ticks 30d/14d, aggregates 180d–indefinite, news 180d, macro indefinite, on-chain 365d, feature_snapshots 180d, anomaly_metrics 2y, briefings/decisions/journal forever). ClickHouse TTL commands provided; VPS cost constraint addressed.
- T017: `apps/api/scripts/seed.ts` — loads `fixtures/assets/identities.json`, `fixtures/venues/venues.json`, `fixtures/venues/instruments.json` (all non-empty, verified). Seeds default watchlist (6 assets), 3 alert rules, 2 model routes, 5 feed settings. Idempotent (`ON CONFLICT DO NOTHING`).
- T018: `apps/api/test/migrate.smoke.test.ts` — provisions throwaway `aestus_migrate_smoke` DBs, spawns real `migrate.ts` runner, asserts 24 Postgres key tables + 9 ClickHouse key tables, verifies `schema_migrations` counts equal file counts, self-skips when DBs unreachable. `.github/workflows/ci.yml` has dedicated `migration-smoke` job with `pgvector/pgvector:pg16` and `clickhouse/clickhouse-server:24.8-alpine` services.

No [!] tasks. No failures.

### P05-T001 — Define NATS stream names

- Files: packages/contracts/src/streams.ts (new), packages/contracts/src/index.ts (export), crates/event_model/src/streams.rs (new), crates/event_model/src/lib.rs (module), docs/event_streams.md (new)
- Checks: `cargo test -p event_model` (3 pass), `cargo clippy -p event_model -- -D warnings` clean, contracts `bun run typecheck` clean, subject helper smoke (`raw.market.binance.btc_usdt`, 8 streams, base lookup) verified
- Assumptions: JetStream stream names are UPPER_SNAKE (no dots) with the dotted form as the subject base; each stream binds the bare base plus `<base>.>` wildcard. TS file (`packages/contracts/src/streams.ts`) is the single source of truth; Rust mirror kept in sync by hand (no codegen yet). Subject routing-token conventions documented per-stream in docs/event_streams.md. `SystemHealth` payload contract is deferred to P05-T009.
- Follow-ups: none

### P05-T002 — Create event envelope library

- Files: packages/contracts/src/envelope.ts (new), packages/contracts/src/index.ts (export), packages/contracts/scripts/gen-schema.ts (+EventEnvelope), packages/contracts/schema/EventEnvelope.schema.json (generated), packages/contracts/test/envelope.test.ts (new), packages/contracts/tsconfig.json (+DOM lib for crypto.randomUUID), crates/event_model/src/envelope.rs (new), crates/event_model/src/lib.rs (module), crates/event_model/Cargo.toml (+uuid,time), Cargo.toml (workspace deps). Also reformatted T001 files (streams.ts, event_streams.md) that missed prettier.
- Checks: `cargo test -p event_model` (6 pass incl. envelope roundtrip), `cargo fmt --all --check` clean, `cargo clippy -p event_model --all-targets -- -D warnings` clean, contracts `bun run typecheck` clean, `bun test` (20 pass), `bun run gen:schema` (16 schemas), `bun run format:check` clean.
- Assumptions: Envelope fields exactly per task (event_id, schema_version, trace_id, source, emitted_at, payload_type, payload). `payload_type` is an open string with canonical names in `PAYLOAD_TYPES`. `trace_id` defaults to `event_id` at trace origin. Ids/timestamps are injectable (`makeEnvelope` args; Rust `Envelope::with`) for deterministic fixtures, otherwise auto (crypto.randomUUID / UUID v4; ISO/RFC-3339 now). Rust `now_rfc3339` falls back to epoch instead of panicking (crate denies unwrap/expect). `envelopeOf(payloadSchema)` gives a typed-payload validator. Added DOM lib to contracts tsconfig (Bun implements Web Crypto) rather than pulling @types/node.
- Follow-ups: none

### P05-T003 — Create Rust NATS publisher helper

- Files: crates/nats_publisher/Cargo.toml (new), crates/nats_publisher/src/lib.rs (new), Cargo.toml (member + async-nats/async-trait/futures deps), services/ingestion/Cargo.toml (+nats_publisher dep), services/ingestion/src/main.rs (publish test event), clippy.toml (new), Cargo.lock
- Checks: `cargo test -p nats_publisher -p ingestion` (4 pass: recording capture, retry-succeeds, retry-gives-up structured error, ingestion publishes-one-test-event), `cargo clippy --workspace --all-targets -- -D warnings` clean, `cargo fmt --all --check` clean
- Assumptions: Transport abstracted behind `Publisher` trait (async_trait) so the same call sites work against live NATS (`NatsPublisher`, async-nats 0.38) or an in-memory `RecordingPublisher` for fixture-first dev/tests — NATS is NOT required to build or run ingestion (CLAUDE rule #5). Retry policy is linear backoff (`base_delay * attempt`, default 3 attempts / 100ms) extracted into a single tested `with_retries` helper. Structured errors via thiserror (`Connect`/`Serialize`/`Publish{subject,attempts,cause}`); field named `cause` not `source` (thiserror reserves `source`). Ingestion main publishes one `TestEvent` envelope to `system.health.ingestion` on startup — live if `NATS_URL` set, else recorded in-memory. Added repo-root `clippy.toml` allowing unwrap/expect in tests (the deny-list is for production code only).
- Follow-ups: none
