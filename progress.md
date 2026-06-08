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
