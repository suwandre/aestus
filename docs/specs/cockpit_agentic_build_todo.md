# Aestus - Agentic Build TODO

Companion to:

- `docs/specs/cockpit_spec.md` - product/system source of truth.
- `docs/specs/cockpit_ui_implementation.md` - presentation-layer source of truth.

Purpose: give future coding agents a granular backlog where each task is small, scoped, testable, and context-rich. The project is a self-hosted, single-user, crypto-primary decision-support cockpit. It must never become an automated execution bot in MVP.

## Global implementation rules

1. Do one task ID at a time unless a human explicitly asks for a batch.
2. Do not add automated order placement, exchange API keys for trading, order execution, or position-closing logic.
3. Do not let the LLM invent price levels. Entry, invalidation, target, sizing, and risk numbers must come from deterministic code.
4. Briefings are proposals with reasoning, including no-trade proposals. They are not commands.
5. Every user decision - act, skip, snooze, dismiss, watch - should be logged with the context that informed it.
6. Prefer fixture-first development so frontend/backend agents can work without live providers or LLM secrets.
7. Keep the system single-user and self-hosted. Avoid multi-tenant abstractions unless they are trivial and do not increase scope.
8. Keep cost visible. LLM usage, provider calls, and data-feed choices must remain compatible with the low monthly cost target.
9. Every task should update docs, tests, fixtures, or acceptance notes when relevant.
10. When a task changes a contract, update shared schemas, fixtures, API docs, and frontend types together.

## Model and effort routing

The loop runner selects the model per phase (`--model claude-sonnet-4-6` / `--model claude-opus-4-8`). Effort applies to Opus only; default high, max reserved for the few judgment-critical phases.

| Phases  | Model  | Effort | Rationale                                                                                     |
| ------- | ------ | ------ | --------------------------------------------------------------------------------------------- |
| P00-P02 | Sonnet | -      | docs, scaffolding, containers: mechanical                                                     |
| P03-P05 | Opus   | high   | contracts/schemas/event bus: mistakes ripple through every later task                         |
| P06-P08 | Sonnet | -      | ingestion adapters and normalization: pattern-repetitive                                      |
| P09     | Sonnet | -      | features are formula-specified and fixture-tested                                             |
| P10-P11 | Opus   | high   | anomaly detection design; context packet quality determines briefing quality                  |
| P12-P13 | Opus   | max    | deterministic level engine + LLM boundaries: core differentiator and safety rails             |
| P14-P16 | Sonnet | -      | API, realtime stream, frontend foundations: well-specified                                    |
| P17     | Sonnet | -      | panels; escalate P17-T005 and P17-T006 to Opus high (pixel-parity-critical card + chart port) |
| P18-P28 | Sonnet | -      | remaining tabs, ops, testing, deploy docs                                                     |
| P29     | Opus   | high   | security hardening needs adversarial thinking                                                 |
| P30     | Opus   | max    | final acceptance and integration judgment                                                     |

Escalation rule: if a task fails its done-when criteria twice on Sonnet, retry once on Opus high before marking it `[!]`.

## Task status legend

- `[ ]` Not started
- `[~]` In progress
- `[x]` Done
- `[!]` Blocked or needs human decision

## Recommended agent completion note

When completing a task, report:

- Task ID
- Files changed
- Tests/checks run
- Any assumptions made
- Any follow-up task IDs created

---

## P00 - Product guardrails and source-of-truth setup

Goal: Lock the implementation against the system and UI specs so future agents do not drift into an exchange, bot, or generic dashboard.

### [x] P00-T001 - Add source documents to repo docs

- Agent action: Place `cockpit_spec.md`, `cockpit_ui_implementation.md`, and this todo file under `docs/specs/`. Add a README note that these files are the product source of truth.

- Done when: Repo contains the three docs and README links to them.

### [x] P00-T002 - Create implementation principles doc

- Agent action: Write `docs/principles.md` summarizing: cockpit not autopilot, context over raw signal, no-trade is valid, deterministic levels, LLM narrative only, single-user/self-hosted/low-cost.

- Done when: Principles doc exists and mirrors the specs without adding new product scope.

### [x] P00-T003 - Create non-goals doc

- Agent action: Write `docs/non_goals.md` listing no automated order execution, no HFT, no multi-tenant SaaS, no signal-selling service, no premium-feed dependency for MVP.

- Done when: Non-goals doc exists and explicitly says no trade placement or auto-close logic in MVP.

### [x] P00-T004 - Create glossary

- Agent action: Write `docs/glossary.md` defining asset, venue, market state, feature snapshot, anomaly, context packet, briefing, decision, setup, regime, R-multiple, invalidation.

- Done when: Glossary exists and uses consistent terms from both specs.

### [x] P00-T005 - Create architecture decision log folder

- Agent action: Create `docs/adr/README.md` explaining that every major infra/provider choice gets a short ADR.

- Done when: ADR folder exists with template and first README.

### [x] P00-T006 - Write ADR for chosen stack

- Agent action: Create ADR confirming Rust ingestion/features, TypeScript/Bun API/LLM, NATS JetStream, Redis/BullMQ, Postgres+vector, ClickHouse, single VPS containers. Record that native C/Zig FFI kernels are intentionally deferred to D11 (post-MVP learning optimization, pure-Rust baseline first).

- Done when: ADR states the chosen stack and why it matches latency/cost/self-hosting constraints.

### [x] P00-T007 - Write MVP scope boundary

- Agent action: Create `docs/mvp_scope.md` with included MVP capabilities and explicitly deferred features.

- Done when: MVP scope identifies the first exchanges, first assets, first tabs, and deferred providers without ambiguity.

### [x] P00-T008 - Define agent handoff protocol

- Agent action: Create `docs/agent_handoff.md` with rules: complete one task ID at a time, update checkbox/status, include tests, record assumptions, avoid scope expansion.

- Done when: Future agents can pick a task and know how to report completion.

## P01 - Monorepo foundation

Goal: Create the repository shape and tooling so backend, frontend, shared contracts, and infra can evolve together.

### [x] P01-T001 - Create monorepo root structure

- Agent action: Create folders: `apps/web`, `apps/api`, `services/ingestion`, `services/features`, `services/context`, `packages/contracts`, `packages/ui`, `packages/config`, `infra`, `docs`, `fixtures`, `scripts`.

- Done when: Folders exist with placeholder README files explaining ownership.

### [x] P01-T002 - Initialize package manager for TypeScript workspaces

- Agent action: Set up Bun workspace config for `apps/api`, `apps/web`, `packages/contracts`, `packages/ui`, and `packages/config`.

- Done when: `bun install` works and workspace packages resolve locally.

### [x] P01-T003 - Initialize Rust workspace

- Agent action: Create a Rust workspace for `services/ingestion`, `services/features`, and shared Rust crates such as `crates/event_model` and `crates/market_math`.

- Done when: `cargo check --workspace` succeeds with placeholder crates.

### [x] P01-T004 - Add root task runner commands

- Agent action: Add root scripts for `dev`, `test`, `lint`, `typecheck`, `format`, `docker:up`, `docker:down`, and `db:migrate`.

- Done when: A contributor can see all common commands from the root README.

### [x] P01-T005 - Configure formatting

- Agent action: Add Prettier for TS/MD/JSON and rustfmt for Rust. Include a single root command to format all code.

- Done when: Formatting command runs without changing generated/fixture data unexpectedly.

### [x] P01-T006 - Configure linting

- Agent action: Add ESLint for TS and Clippy config for Rust. Keep rules practical and enforce unused code/import cleanup.

- Done when: Lint command runs successfully on placeholder code.

### [x] P01-T007 - Configure TypeScript strict mode

- Agent action: Set strict TS configs for API, web, contracts, and UI packages.

- Done when: `bun run typecheck` fails on implicit any and passes on placeholders.

### [x] P01-T008 - Add environment variable templates

- Agent action: Create `.env.example` files for root, API, ingestion, frontend, and infra. Include no secrets.

- Done when: All required env vars are documented with safe example values.

### [x] P01-T009 - Create conventional commit/task branch guidance

- Agent action: Add `docs/dev_workflow.md` explaining branch naming by task ID, commit style, and PR checklist.

- Done when: Agent can create a branch named like `task/P03-T004-clickhouse-schema`.

### [x] P01-T010 - Add CI skeleton

- Agent action: Create CI workflow that runs formatting, linting, typecheck, Rust check, and tests on pull requests.

- Done when: CI file exists and would run the basic checks when repository is hosted.

## P02 - Local infrastructure and containers

Goal: Make the full stack runnable locally before real providers are connected.

### [x] P02-T001 - Create Docker Compose baseline

- Agent action: Create `infra/docker-compose.yml` with Postgres, Redis, ClickHouse, NATS JetStream, API, web, ingestion, feature engine placeholders.

- Done when: `docker compose up` starts the databases/message bus even if app services are placeholders.

### [x] P02-T002 - Configure NATS JetStream container

- Agent action: Enable JetStream persistence and mount a local volume. Expose client and monitoring ports.

- Done when: NATS starts with JetStream enabled and persists streams across restarts.

### [x] P02-T003 - Configure Redis container

- Agent action: Add Redis with append-only persistence for BullMQ and hot cache development.

- Done when: Redis starts and survives restart with volume-backed data.

### [x] P02-T004 - Configure Postgres container

- Agent action: Add Postgres with healthcheck and init script for required extensions, including vector support if image supports it.

- Done when: Postgres healthcheck passes and extension init is documented.

### [x] P02-T005 - Configure ClickHouse container

- Agent action: Add ClickHouse with volume and basic user/password settings from env.

- Done when: ClickHouse starts locally and accepts simple SQL query.

### [x] P02-T006 - Add local object/artifact folder

- Agent action: Create mounted `./.local/artifacts` for generated briefings, logs, exports, and screenshots during dev.

- Done when: Local artifact path exists and is ignored by git.

### [x] P02-T007 - Create infra health script

- Agent action: Write a script that checks NATS, Redis, Postgres, and ClickHouse connectivity.

- Done when: Running the script clearly reports pass/fail for each dependency.

### [x] P02-T008 - Document local boot sequence

- Agent action: Write `docs/local_dev.md` with steps to install Bun/Rust/Docker, copy env files, start infra, run API, run web.

- Done when: A new agent can boot local stack from docs only.

### [x] P02-T009 - Add Makefile or equivalent aliases

- Agent action: Provide short aliases such as `make up`, `make down`, `make logs`, `make reset-local`.

- Done when: Common infra commands work from repo root.

### [x] P02-T010 - Create local reset script

- Agent action: Add a destructive local reset script that drops volumes only after an explicit confirmation flag.

- Done when: Reset script cannot accidentally delete data without a clear flag.

## P03 - Shared contracts and event schemas

Goal: Define typed data boundaries before implementing services so every agent knows the exact shapes.

### [x] P03-T001 - Create asset identity schema

- Agent action: In `packages/contracts`, define `AssetIdentity` with symbol, base, quote, asset_class, canonical_id, display_name, icon_key, tags.

- Done when: Schema validates BTCUSDT, ETHUSDT, SPX, DXY, GOLD, and VIX fixtures.

### [x] P03-T002 - Create venue schema

- Agent action: Define `Venue` and `VenueInstrument` with venue_id, market_type, instrument_id, canonical_asset_id, tick_size, lot_size, quote_currency.

- Done when: Schema can represent Binance perp, Bybit perp, Hyperliquid, OKX, spot, and macro proxies.

### [x] P03-T003 - Create raw market event schema

- Agent action: Define raw event envelope with source, venue, received_at, provider_timestamp, sequence, event_type, raw_payload_hash.

- Done when: Every raw ingested message can be stored/replayed with source traceability.

### [x] P03-T004 - Create normalized market event schema

- Agent action: Define normalized event variants: price_tick, trade, orderbook_delta, funding_rate, open_interest, liquidation, mark_price, index_price.

- Done when: Schema is discriminated and supports deterministic validation.

### [x] P03-T005 - Create macro event schema

- Agent action: Define economic calendar event fields: event_id, region, currency, title, scheduled_at, importance, consensus, previous, actual, source.

- Done when: Fixture can represent CPI, FOMC, NFP, PPI, jobless claims.

### [x] P03-T006 - Create news item schema

- Agent action: Define news/narrative schema with title, url, source, published_at, entities, summary, relevance_score, sentiment, tags.

- Done when: Schema supports RSS/news and future social sources.

### [x] P03-T007 - Create on-chain event schema

- Agent action: Define on-chain event variants for exchange_flow, whale_transfer, stablecoin_mint_burn, token_unlock, dex_activity.

- Done when: Schema can represent BTC exchange netflow and whale accumulation fixture.

### [x] P03-T008 - Create feature snapshot schema

- Agent action: Define rolling features: returns, volatility, z_scores, funding_z, oi_delta, volume_z, correlation_set, basis, regime labels.

- Done when: Schema covers UI feature stack and anomaly detection inputs.

### [x] P03-T009 - Create anomaly event schema

- Agent action: Define anomaly fields: id, type, severity, sigma, assets, venues, title, description, detected_at, status, context_refs, rule_ref.

- Done when: Schema covers funding spike, OI surge, volume anomaly, correlation break, basis dislocation, whale flow, macro approaching.

### [x] P03-T010 - Create context packet schema

- Agent action: Define context packet with trigger anomaly, market snapshot, correlated assets, news, macro, on-chain, historical analogues, deterministic levels.

- Done when: Schema is usable as the input to LLM briefing generation.

### [x] P03-T011 - Create briefing schema

- Agent action: Define briefing fields: stance, thesis, entry_zone, invalidation, targets, size_suggestion, timeframe, confidence, model, supporting_context, cost_metadata.

- Done when: Schema supports long, short, and no_trade stances.

### [x] P03-T012 - Create decision schema

- Agent action: Define decision fields: briefing_id, decision_type, rationale, planned_entry, planned_stop, planned_targets, risk_r, tags, decided_at.

- Done when: Schema supports act, skip, snooze, dismiss, and watch actions.

### [x] P03-T013 - Create journal trade schema

- Agent action: Define trade lifecycle fields: entry, exit, size, fees, realized_pnl, r_multiple, outcome_status, setup_tags, linked_briefing_id.

- Done when: Schema supports later analytics by setup/regime/signal.

### [x] P03-T014 - Generate JSON Schema from contracts

- Agent action: Export JSON Schema files for all public contract types into `packages/contracts/schema`.

- Done when: Backend and frontend can validate fixtures without importing runtime code.

### [x] P03-T015 - Add fixture validation test

- Agent action: Create tests that load every fixture in `fixtures/` and validate against the contracts.

- Done when: Invalid fixture shapes fail CI.

### [x] P03-T016 - Document schema versioning

- Agent action: Write `docs/contracts_versioning.md` explaining breaking changes, migration notes, and event version fields.

- Done when: Agents know how to evolve schemas safely.

## P04 - Storage schemas and migrations

Goal: Create persistent storage foundations for hot state, relational metadata, vectors, and high-volume time-series.

### [x] P04-T001 - Choose migration tools

- Agent action: Select and configure a TS-friendly migration tool for Postgres and a SQL migration pattern for ClickHouse.

- Done when: Migration commands are documented and runnable locally.

### [x] P04-T002 - Create Postgres asset tables

- Agent action: Add tables for assets, venues, venue_instruments, watchlists, and watchlist_members.

- Done when: Migrations create canonical asset and watchlist structures.

### [x] P04-T003 - Create Postgres news tables

- Agent action: Add news_items, news_entities, news_embeddings placeholder/vector column, and source metadata.

- Done when: News items can be deduplicated by URL/hash and queried by asset/entity.

### [ ] P04-T004 - Create Postgres macro tables

- Agent action: Add macro_events with scheduled, actual, consensus, previous, importance, source, and revision fields.

- Done when: Calendar events can be updated when actual data arrives.

### [ ] P04-T005 - Create Postgres on-chain tables

- Agent action: Add on_chain_events table with event_type, chain, asset_id, value, addresses, source, and raw_ref.

- Done when: On-chain items can be linked into context packets.

### [ ] P04-T006 - Create Postgres anomaly tables

- Agent action: Add anomalies table plus anomaly_context_refs for links to market/news/macro/on-chain/historical context.

- Done when: Anomaly status and context references persist.

### [ ] P04-T007 - Create Postgres context packet tables

- Agent action: Add context_packets and context_packet_items storing structured packet snapshots.

- Done when: Generated briefings can be reproduced from stored packet data.

### [ ] P04-T008 - Create Postgres briefing tables

- Agent action: Add briefings table storing stance, thesis, levels, confidence, model metadata, cost metadata, context_packet_id.

- Done when: Briefings persist independently of transient UI state.

### [ ] P04-T009 - Create Postgres decision and journal tables

- Agent action: Add decisions, journal_entries, journal_outcomes, and trade_tags tables.

- Done when: User actions and outcomes can be logged and queried.

### [ ] P04-T010 - Create Postgres config tables

- Agent action: Add settings for watchlists, alert rules, feed enablement, model routing, notification channels, layout preferences.

- Done when: Single-user config survives restarts.

### [ ] P04-T011 - Create ClickHouse raw event table

- Agent action: Create raw_market_events with event envelope fields and raw payload hash/reference.

- Done when: Raw provider messages can be retained for replay/debugging.

### [ ] P04-T012 - Create ClickHouse normalized event tables

- Agent action: Create normalized_market_events table or family of tables optimized by asset, venue, event_type, timestamp.

- Done when: Market event history can be queried by asset/time efficiently.

### [ ] P04-T013 - Create ClickHouse OHLCV aggregate tables

- Agent action: Create materialized views or aggregation tables for 1m, 5m, 15m, 1h OHLCV.

- Done when: Frontend charts can query candles without scanning ticks.

### [ ] P04-T014 - Create ClickHouse feature snapshot table

- Agent action: Create feature_snapshots with versioned feature fields and timestamp.

- Done when: Feature engine can persist rolling feature state over time.

### [ ] P04-T015 - Create ClickHouse anomaly metrics table

- Agent action: Create anomaly_metrics for severity, sigma, feature values at trigger time.

- Done when: Analytics can inspect feature values behind triggered anomalies.

### [ ] P04-T016 - Add retention and downsampling doc

- Agent action: Write `docs/data_retention.md` covering raw ticks, normalized events, aggregates, news, briefings, and journal retention.

- Done when: Retention choices match single-user VPS cost constraints.

### [ ] P04-T017 - Seed development data

- Agent action: Create seed scripts for assets, venues, watchlist, alert rule defaults, and sample UI fixture data.

- Done when: Fresh local environment has usable sample data.

### [ ] P04-T018 - Add migration smoke test

- Agent action: Create CI/local test that applies migrations to empty databases and verifies key tables exist.

- Done when: Migration smoke test passes for Postgres and ClickHouse.

## P05 - Event bus and streaming backbone

Goal: Implement the event backbone that connects ingestion, features, anomalies, context assembly, LLM jobs, API, and UI.

### [ ] P05-T001 - Define NATS stream names

- Agent action: Document and create streams: raw.market, normalized.market, feature.snapshot, anomaly.detected, context.packet, briefing.generated, decision.logged, system.health.

- Done when: Stream names and subjects are stable and documented.

### [ ] P05-T002 - Create event envelope library

- Agent action: Implement shared envelope helpers with event_id, schema_version, trace_id, source, emitted_at, payload_type, payload.

- Done when: All services publish consistent envelopes.

### [ ] P05-T003 - Create Rust NATS publisher helper

- Agent action: Add Rust helper crate for publishing envelopes to NATS with retries and structured errors.

- Done when: Rust ingestion placeholder can publish a test event.

### [ ] P05-T004 - Create TypeScript NATS client helper

- Agent action: Add TS package for subscribe/publish/request patterns with type validation.

- Done when: API/context services can publish and subscribe to contract-validated events.

### [ ] P05-T005 - Create stream initialization script

- Agent action: Add script to create/update streams and durable consumers for local/dev/prod.

- Done when: NATS setup is reproducible after reset.

### [ ] P05-T006 - Create dead-letter stream pattern

- Agent action: Define DLQ subjects for failed event handling and include original event + error metadata.

- Done when: Failed consumers can route poison events without blocking streams.

### [ ] P05-T007 - Add replay utility

- Agent action: Build script to replay events from ClickHouse or fixtures into NATS for testing.

- Done when: Feature/anomaly engines can be tested from deterministic event streams.

### [ ] P05-T008 - Add event inspection CLI

- Agent action: Create a small CLI that tails selected NATS subjects and pretty-prints envelopes.

- Done when: Developer can inspect live events without custom scripts.

### [ ] P05-T009 - Implement heartbeat publisher

- Agent action: Each service should publish periodic system.health events with service name, version, uptime, and dependency status.

- Done when: Data tab can later consume service health states.

### [ ] P05-T010 - Document event ordering assumptions

- Agent action: Write doc explaining sequence handling, provider timestamps, received timestamps, and what ordering guarantees not to assume.

- Done when: Agents avoid writing logic that depends on impossible cross-provider ordering.

## P06 - Crypto market ingestion MVP

Goal: Connect the first real-time market feeds with normalized output, starting narrow but production-shaped.

### [ ] P06-T001 - Create ingestion service skeleton

- Agent action: Build Rust service with config loading, structured logging, NATS publisher, health endpoint, graceful shutdown.

- Done when: Service starts locally and publishes heartbeat events.

### [ ] P06-T002 - Implement provider trait/interface

- Agent action: Define a Rust trait for exchange adapters: connect, subscribe, parse_raw, normalize, reconnect, health.

- Done when: New exchange adapters can follow the same pattern.

### [ ] P06-T003 - Implement Binance perp price/trade adapter

- Agent action: Connect Binance public WebSocket for selected perp symbols and emit raw + normalized trade/price events.

- Done when: BTCUSDT and ETHUSDT trades/prices stream locally into NATS.

### [ ] P06-T004 - Implement Binance mark/funding adapter

- Agent action: Connect or poll Binance public endpoints for mark price and funding rate.

- Done when: Funding and mark price events emit with correct timestamps and venue metadata.

### [ ] P06-T005 - Implement Binance open interest polling

- Agent action: Poll Binance OI endpoint at configured cadence and emit normalized open_interest events.

- Done when: OI events are stored with asset, venue, value, timestamp, and source.

### [ ] P06-T006 - Implement Binance liquidation stream

- Agent action: Connect Binance liquidation/order force stream where available and normalize liquidation events.

- Done when: Liquidation events include side, price, quantity, notional, asset, venue.

### [ ] P06-T007 - Add Binance reconnect/backoff logic

- Agent action: Implement exponential backoff, ping/pong handling, stale stream detection, and reconnect metrics.

- Done when: Unplug/replug network simulation recovers without process crash.

### [ ] P06-T008 - Add Bybit adapter placeholder

- Agent action: Create adapter skeleton and fixture parser for Bybit without requiring full live connection yet.

- Done when: Bybit fixture can normalize to the same event shapes.

### [ ] P06-T009 - Add Hyperliquid adapter placeholder

- Agent action: Create adapter skeleton and fixture parser for Hyperliquid order/price/open interest shapes.

- Done when: Hyperliquid fixture can normalize to contract schema.

### [ ] P06-T010 - Add OKX adapter placeholder

- Agent action: Create adapter skeleton and fixture parser for OKX perp/spot data shapes.

- Done when: OKX fixture can normalize to contract schema.

### [ ] P06-T011 - Create exchange capability matrix

- Agent action: Document for each exchange: supported price/trade/OI/funding/liquidation/orderbook feeds, protocol, rate limits, and MVP status.

- Done when: Future agents know exactly what remains for each venue.

### [ ] P06-T012 - Add symbol mapping config

- Agent action: Create config mapping venue instrument IDs to canonical asset IDs and quote/base assets.

- Done when: BTCUSDT across venues maps to the same canonical BTC perp asset.

### [ ] P06-T013 - Add raw payload hashing

- Agent action: Hash raw messages before publish/storage for dedupe and debugging.

- Done when: Raw events include stable hash and duplicate messages can be identified.

### [ ] P06-T014 - Persist normalized events to ClickHouse

- Agent action: Add writer consumer that batches normalized market events into ClickHouse.

- Done when: Live Binance events appear in ClickHouse within configured flush interval.

### [ ] P06-T015 - Persist hot market state to Redis

- Agent action: Maintain Redis keys for latest price, mark, funding, OI, and 24h summary per venue instrument.

- Done when: API can read latest market state without ClickHouse scan.

### [ ] P06-T016 - Add ingestion metrics

- Agent action: Expose counts, error rates, reconnects, message lag, last message time per provider/feed.

- Done when: Data tab and logs can reveal stale feeds.

## P07 - Macro, news, and on-chain ingestion MVP

Goal: Add contextual feeds needed for briefings without relying on expensive providers.

### [ ] P07-T001 - Create contextual ingestion service skeleton

- Agent action: Build TS or Rust service for scheduled lower-frequency contextual feeds with config, logging, NATS, and health.

- Done when: Service runs separately from high-frequency exchange ingestion.

### [ ] P07-T002 - Implement economic calendar provider abstraction

- Agent action: Define interface for calendar providers with fetch, normalize, dedupe, and update actuals.

- Done when: New free/low-cost calendar sources can be added safely.

### [ ] P07-T003 - Add calendar fixture importer

- Agent action: Before live provider work, create importer for CPI/FOMC/NFP/PPI/jobless fixtures.

- Done when: Upcoming Events UI can be developed from realistic data.

### [ ] P07-T004 - Implement RSS news fetcher

- Agent action: Create configurable RSS fetcher with source list, polling cadence, dedupe by URL/hash, and publish news events.

- Done when: Crypto/financial RSS items populate Postgres and NATS.

### [ ] P07-T005 - Add news entity extraction job

- Agent action: Implement cheap model or deterministic keyword pass to tag assets, venues, protocols, macro entities in news.

- Done when: News items contain entity tags like BTC, ETH, Binance, CPI, ETF.

### [ ] P07-T006 - Add news relevance scoring job

- Agent action: Score news relevance to watched assets and anomaly context using cheap model or rules.

- Done when: News list can sort/filter by relevance to current focus asset.

### [ ] P07-T007 - Add news embedding pipeline placeholder

- Agent action: Create interface and storage pathway for embeddings, with provider behind config and safe no-op fallback.

- Done when: Postgres can store embedding refs when provider is enabled.

### [ ] P07-T008 - Create on-chain provider abstraction

- Agent action: Define normalized interface for whale flow, exchange flow, stablecoin mint/burn, token unlock, DEX activity.

- Done when: On-chain sources are pluggable and marked by confidence/source.

### [ ] P07-T009 - Add on-chain fixture importer

- Agent action: Create sample exchange netflow, whale transfer, active addresses, MVRV, realized cap change data.

- Done when: On-Chain Insights UI can develop before live provider selection.

### [ ] P07-T010 - Add contextual dedupe logic

- Agent action: Deduplicate news/macro/on-chain items by provider IDs, URLs, timestamps, and payload hashes.

- Done when: Repeated polls do not create duplicate context records.

### [ ] P07-T011 - Persist contextual items

- Agent action: Write news, macro, and on-chain normalized items into Postgres with source metadata.

- Done when: Context assembler can query contextual data from Postgres.

### [ ] P07-T012 - Document low-cost provider candidates

- Agent action: Create `docs/provider_candidates.md` with free/low-cost options, limitations, rate limits, and what data each covers.

- Done when: Future provider decisions remain grounded in the low-cost constraint.

## P08 - Normalization and data quality layer

Goal: Ensure all incoming data is comparable, auditable, and visibly fresh/stale in the UI.

### [ ] P08-T001 - Implement timestamp normalization

- Agent action: Standardize provider timestamp, received timestamp, and normalized timestamp handling across events.

- Done when: Events always preserve provider and ingestion times separately.

### [ ] P08-T002 - Implement decimal precision policy

- Agent action: Use decimal-safe types for prices, sizes, funding, OI, and notional values.

- Done when: No code uses floating point where precision errors would affect displayed prices/levels.

### [ ] P08-T003 - Implement symbol normalization tests

- Agent action: Add tests for mapping venue symbols to canonical assets, including perps vs spot.

- Done when: BTCUSDT perp and BTC spot are not confused.

### [ ] P08-T004 - Implement stale-feed detection

- Agent action: Mark a feed stale when no valid message arrives within configured thresholds per feed type.

- Done when: System health events include fresh/stale state by feed.

### [ ] P08-T005 - Implement outlier guardrails

- Agent action: Detect impossible price/funding/OI values and route them to quarantine/DLQ rather than feature calculations.

- Done when: Bad payload fixtures do not corrupt hot state or features.

### [ ] P08-T006 - Add source confidence metadata

- Agent action: Attach source confidence/quality labels to contextual data and lower-confidence market proxies.

- Done when: Briefings can show when context depends on weak or fixture/proxy data.

### [ ] P08-T007 - Implement normalized data explorer query

- Agent action: Build backend query to inspect recent normalized events by asset, venue, type, and time.

- Done when: Data tab can display raw normalized event history.

### [ ] P08-T008 - Create data quality dashboard endpoint

- Agent action: Expose feed freshness, event counts, error counts, lag, and last-seen timestamps.

- Done when: Frontend Data tab can render source health without scraping logs.

## P09 - Feature engine

Goal: Compute deterministic rolling features that power anomaly detection, market state, and chart overlays.

### [ ] P09-T001 - Create feature service skeleton

- Agent action: Build Rust feature engine with NATS consumer, Redis hot state access, ClickHouse writer, health heartbeat.

- Done when: Service can consume normalized events and publish placeholder feature snapshots.

### [ ] P09-T002 - Implement rolling window library

- Agent action: Create reusable rolling windows for count, sum, mean, variance, min, max, percentile, z-score.

- Done when: Library tests pass on deterministic fixtures.

### [ ] P09-T003 - Implement OHLCV aggregation consumer

- Agent action: Consume trade/price events and maintain 1m/5m/15m/1h candles for watched assets.

- Done when: ClickHouse aggregate tables update from live or replayed events.

### [ ] P09-T004 - Implement return calculations

- Agent action: Compute rolling returns for 1m, 5m, 15m, 1h, 24h per asset/venue.

- Done when: Feature snapshots include return fields required by UI.

### [ ] P09-T005 - Implement realized volatility features

- Agent action: Compute rolling realized volatility and volatility regime labels.

- Done when: Market State Summary can show volatility regime.

### [ ] P09-T006 - Implement volume anomaly features

- Agent action: Compute rolling volume z-score and volume percentile per asset/venue.

- Done when: Volume anomaly detector has deterministic inputs.

### [ ] P09-T007 - Implement funding features

- Agent action: Track funding current, rolling mean, funding z-score, and cross-venue funding spread.

- Done when: Funding spike and funding divergence detectors can use features.

### [ ] P09-T008 - Implement open-interest features

- Agent action: Compute OI deltas, OI z-score, OI/price divergence flags.

- Done when: Feature snapshots include OI increase/decrease state.

### [ ] P09-T009 - Implement liquidation cluster features

- Agent action: Aggregate liquidation events by price bucket and time window.

- Done when: Chart overlays can display liquidation clusters.

### [ ] P09-T010 - Implement cross-venue basis features

- Agent action: Compute mark/index/spot/perp basis where data exists.

- Done when: Venue comparison table can display basis divergence.

### [ ] P09-T011 - Implement rolling correlation features

- Agent action: Compute BTC/ETH/SOL vs SPX/DXY/GOLD/OIL/VIX rolling correlations when data exists or fixtures available.

- Done when: Correlation matrix and correlation break detector have inputs.

### [ ] P09-T012 - Implement market breadth features

- Agent action: Compute percent of watched assets up/down, volatility distribution, and risk-on/risk-off proxy.

- Done when: Market State Summary can display breadth and risk regime.

### [ ] P09-T013 - Persist feature snapshots

- Agent action: Batch write feature snapshots to ClickHouse and latest snapshot to Redis.

- Done when: API can read latest and historical feature data.

### [ ] P09-T014 - Publish feature snapshots

- Agent action: Emit feature.snapshot events to NATS for anomaly engine and UI realtime updates.

- Done when: Downstream services receive schema-valid feature snapshot events.

### [ ] P09-T015 - Add feature replay test

- Agent action: Replay fixtures through feature service and assert known z-score/regime outputs.

- Done when: Feature calculations are deterministic and regression-tested.

### [ ] P09-T016 - Document feature formulas

- Agent action: Create `docs/feature_formulas.md` with formulas, windows, thresholds, and known limitations.

- Done when: Future agents can update formulas without guessing intent.

## P10 - Anomaly detection engine

Goal: Detect unusual conditions through deterministic rules, statistical deviation, and narrative clustering placeholders.

### [ ] P10-T001 - Create anomaly service skeleton

- Agent action: Build Rust or TS service consuming feature snapshots and contextual events, publishing anomaly.detected.

- Done when: Service emits heartbeat and validates anomaly payloads.

### [ ] P10-T002 - Define anomaly type registry

- Agent action: Create registry for funding_spike, oi_surge, volume_anomaly, correlation_break, whale_flow, basis_dislocation, macro_approaching, news_cluster.

- Done when: Every anomaly type has display label, severity policy, required fields, and UI color semantics.

### [ ] P10-T003 - Implement funding spike detector

- Agent action: Detect funding current/z-score above configured thresholds, with per-asset/venue rule config.

- Done when: Fixture with elevated funding emits one funding_spike anomaly.

### [ ] P10-T004 - Implement OI surge detector

- Agent action: Detect unusual OI delta and combine with price direction metadata.

- Done when: Fixture OI jump emits oi_surge with price/OI context.

### [ ] P10-T005 - Implement volume anomaly detector

- Agent action: Detect volume z-score or percentile breakouts over rolling windows.

- Done when: Fixture high-volume SOL event emits volume_anomaly.

### [ ] P10-T006 - Implement liquidation cluster detector

- Agent action: Detect large liquidation cluster near current price using bucketed liquidation features.

- Done when: Fixture cluster above price emits liquidation_cluster anomaly.

### [ ] P10-T007 - Implement basis dislocation detector

- Agent action: Detect cross-venue basis/funding divergence above threshold.

- Done when: Fixture with venue divergence emits basis_dislocation anomaly.

### [ ] P10-T008 - Implement correlation break detector

- Agent action: Detect correlation departure vs rolling baseline for selected cross-asset pairs.

- Done when: BTC vs DXY/SPX fixture emits correlation_break when correlation shifts.

### [ ] P10-T009 - Implement macro approaching detector

- Agent action: Emit alert when high-importance macro event is within configured window.

- Done when: CPI/FOMC fixture emits macro_approaching anomaly at correct lead time.

### [ ] P10-T010 - Implement whale/on-chain detector

- Agent action: Emit whale_flow or exchange_flow anomaly based on on-chain event thresholds.

- Done when: Whale accumulation fixture emits whale_flow anomaly.

### [ ] P10-T011 - Implement news clustering placeholder

- Agent action: Group recent news by entities/tags and emit news_cluster when relevance/velocity exceeds threshold.

- Done when: Multiple BTC ETF headlines in a short window emit news_cluster.

### [ ] P10-T012 - Implement alert dedupe/cooldown

- Agent action: Prevent repeated identical anomalies from spamming the user within configurable cooldown windows.

- Done when: Repeated fixture events produce one active anomaly plus update count/last_seen.

### [ ] P10-T013 - Implement severity scoring

- Agent action: Convert feature magnitude, source confidence, recency, and asset priority into severity/conviction input score.

- Done when: Anomalies have stable severity values from 0-100 or low/medium/high.

### [ ] P10-T014 - Implement anomaly status lifecycle

- Agent action: Support active, snoozed, dismissed, resolved, expired statuses.

- Done when: API/UI can change status and status persists.

### [ ] P10-T015 - Persist anomalies

- Agent action: Write anomaly records and metric snapshots to Postgres/ClickHouse as appropriate.

- Done when: Anomaly inbox survives service restart.

### [ ] P10-T016 - Publish anomalies

- Agent action: Emit anomaly.detected events for context builder, API, alerts, and UI.

- Done when: NATS tail shows schema-valid anomaly events.

### [ ] P10-T017 - Add rule config storage

- Agent action: Store user-defined rule thresholds in Postgres with defaults in seed data.

- Done when: Changing a rule changes detector behavior after reload.

### [ ] P10-T018 - Document anomaly logic

- Agent action: Create `docs/anomaly_detection.md` with each detector, thresholds, inputs, and edge cases.

- Done when: Future agents can tune detectors without re-inferring behavior.

## P11 - Context packet builder

Goal: Assemble the context around an anomaly so the LLM and user see more than a raw signal.

### [ ] P11-T001 - Create context service skeleton

- Agent action: Build TS service consuming anomaly.detected and creating context packets via Redis/Postgres/ClickHouse queries.

- Done when: Service emits heartbeat and placeholder context.packet events.

### [ ] P11-T002 - Implement market snapshot query

- Agent action: Fetch latest price, returns, funding, OI, volume, volatility, basis, and liquidation features for anomaly assets.

- Done when: Context packet contains current market state for trigger asset.

### [ ] P11-T003 - Implement correlated asset query

- Agent action: Fetch current state and relevant features for configured correlated assets such as ETH, SPX, DXY, GOLD, VIX.

- Done when: Context packet includes cross-asset snapshot for BTC anomaly.

### [ ] P11-T004 - Implement venue comparison query

- Agent action: Fetch funding, OI, price, basis, and freshness across venues for same canonical asset.

- Done when: Context packet can explain whether a dislocation is venue-specific.

### [ ] P11-T005 - Implement recent news retrieval

- Agent action: Retrieve recent news by asset/entity and relevance score within configurable windows.

- Done when: Context packet includes only relevant recent news with source metadata.

### [ ] P11-T006 - Implement macro event retrieval

- Agent action: Retrieve upcoming and recent high-importance macro events around anomaly time.

- Done when: Context packet identifies CPI/FOMC/NFP proximity when relevant.

### [ ] P11-T007 - Implement on-chain retrieval

- Agent action: Retrieve recent on-chain events for asset and market-wide stablecoin/flow context.

- Done when: Context packet includes exchange flows/whale events when available.

### [ ] P11-T008 - Implement historical analogue placeholder

- Agent action: Query prior similar anomaly types and market regimes from ClickHouse/Postgres; use fixtures first if history is sparse.

- Done when: Context packet can include analogues or explicitly say insufficient history.

### [ ] P11-T009 - Implement source freshness summary

- Agent action: Add freshness/staleness info for every feed contributing to a packet.

- Done when: Briefing UI can show if a packet is degraded by stale feeds.

### [ ] P11-T010 - Implement context packet persistence

- Agent action: Store full packet snapshot in Postgres before sending to LLM.

- Done when: Briefings can be reproduced even if live state changes.

### [ ] P11-T011 - Publish context packet event

- Agent action: Emit context.packet event after successful packet assembly.

- Done when: LLM orchestration receives context packet asynchronously.

### [ ] P11-T012 - Add packet quality score

- Agent action: Compute a basic completeness/quality score based on required data presence and source freshness.

- Done when: LLM prompt can include data quality and UI can warn on weak context.

### [ ] P11-T013 - Add context packet fixture test

- Agent action: Build a BTC funding spike fixture and assert expected market/news/macro/on-chain sections.

- Done when: Context builder test verifies packet shape and retrieval logic.

### [ ] P11-T014 - Document packet assembly policy

- Agent action: Write `docs/context_packets.md` explaining what goes into packets and how missing data is represented.

- Done when: Agents do not silently omit missing data.

## P12 - Deterministic level and risk engine

Goal: Produce entry, invalidation, target, size, and no-trade conditions deterministically, not by LLM invention.

### [ ] P12-T001 - Create level engine module

- Agent action: Create service/module that receives context packet market data and outputs deterministic level candidates.

- Done when: Module has typed input/output independent of LLM code.

### [ ] P12-T002 - Implement ATR/volatility band calculation

- Agent action: Compute ATR-like or volatility-band levels from OHLCV data for watched assets.

- Done when: Level output includes volatility-derived bands with formula metadata.

### [ ] P12-T003 - Implement swing structure detection

- Agent action: Detect recent swing highs/lows over configurable windows.

- Done when: Level output includes structural support/resistance candidates.

### [ ] P12-T004 - Implement liquidation cluster levels

- Agent action: Convert liquidation buckets into candidate target/invalidation/context levels.

- Done when: Chart and briefing can show cluster-derived levels.

### [ ] P12-T005 - Implement support/resistance placeholder

- Agent action: Create simple deterministic S/R from recent pivots and high-volume nodes if available.

- Done when: Level output includes confidence/source for S/R levels.

### [ ] P12-T006 - Implement entry zone policy

- Agent action: Convert direction + nearby structure/volatility into entry zone ranges.

- Done when: Directional briefing receives numeric entry zone from level engine.

### [ ] P12-T007 - Implement invalidation policy

- Agent action: Choose invalidation level based on thesis direction, swing/ATR, and trigger context.

- Done when: Every directional briefing gets explicit invalidation source metadata.

### [ ] P12-T008 - Implement target policy

- Agent action: Generate one or more target levels from structure, ATR multiples, and liquidity clusters.

- Done when: Directional briefing has deterministic targets with derivation labels.

### [ ] P12-T009 - Implement size suggestion policy

- Agent action: Suggest size relative to configured max risk, volatility, confidence, and stop distance.

- Done when: Size is expressed as risk-relative guidance, not order quantity.

### [ ] P12-T010 - Implement no-trade condition output

- Agent action: When levels are too noisy/invalid, output no_trade candidate with re-check conditions.

- Done when: No-trade briefing can show why and what would change the assessment.

### [ ] P12-T011 - Add level audit trail

- Agent action: Store formulas, inputs, and selected level derivations in context packet/briefing metadata.

- Done when: User can inspect why each numeric level exists.

### [ ] P12-T012 - Add deterministic level tests

- Agent action: Use fixed candles/liquidation fixtures to assert stable entry/invalidation/target outputs.

- Done when: LLM changes cannot alter deterministic numeric level tests.

## P13 - LLM orchestration and briefing generation

Goal: Generate concise, grounded briefings from stored context packets while tracking cost, model, and data quality.

### [ ] P13-T001 - Create LLM orchestration service skeleton

- Agent action: Build TS/Bun service with job queue consumer, provider abstraction, prompt templates, cost tracking, and health heartbeat.

- Done when: Service can process a fake context packet job and store a fake briefing.

### [ ] P13-T002 - Define model provider interface

- Agent action: Create interface for chat/completion calls with model name, token estimates, timeout, retry, cost, and structured output support.

- Done when: Providers can be swapped without changing briefing logic.

### [ ] P13-T003 - Add fake/local LLM provider

- Agent action: Implement deterministic fake provider for tests and frontend development.

- Done when: Briefing pipeline works without external network/model secrets.

### [ ] P13-T004 - Implement model routing config

- Agent action: Read routing rules from settings: cheap model for extraction/scoring, strong model for briefings/research.

- Done when: Model choices are configurable per task type.

### [ ] P13-T005 - Create briefing prompt template

- Agent action: Write prompt that emphasizes decision support, no commands, no invented numbers, cite context sections, include no-trade when edge is weak.

- Done when: Prompt references deterministic levels and packet quality explicitly.

### [ ] P13-T006 - Create structured briefing output schema

- Agent action: Require model output to match briefing schema: stance, thesis, factors, invalidation_reasoning, confidence_reasoning, recheck_condition.

- Done when: Invalid model output is rejected or repaired safely.

### [ ] P13-T007 - Inject deterministic levels into prompts

- Agent action: Ensure numeric entry/invalidation/targets are provided by level engine and model may only explain/select among them.

- Done when: Prompt forbids inventing unprovided price levels.

### [ ] P13-T008 - Implement briefing validation

- Agent action: Validate stance, confidence range, required fields, no forbidden execution language, and no missing invalidation for directional ideas.

- Done when: Bad briefing outputs fail validation and do not notify user.

### [ ] P13-T009 - Implement no-trade briefing path

- Agent action: Allow model to return no_trade with reasons and re-check conditions, without requiring entry/targets.

- Done when: No-trade output is stored and displayed as first-class briefing.

### [ ] P13-T010 - Persist briefing and metadata

- Agent action: Store briefing text, structured fields, model, token usage, cost, cache hit, context packet ID.

- Done when: Briefing detail can show model/cost/observability metadata.

### [ ] P13-T011 - Publish briefing generated event

- Agent action: Emit briefing.generated event for API/UI/notifications after successful storage.

- Done when: Realtime UI receives generated briefing event.

### [ ] P13-T012 - Implement briefing cache policy

- Agent action: Avoid regenerating identical briefings for duplicate anomalies within cooldown unless context materially changes.

- Done when: Duplicate anomaly does not create unnecessary LLM spend.

### [ ] P13-T013 - Add prompt regression fixtures

- Agent action: Store representative context packets and expected high-level output assertions.

- Done when: Prompt changes can be tested for schema and safety regressions.

### [ ] P13-T014 - Document LLM safety boundaries

- Agent action: Create `docs/llm_boundaries.md` covering narrative-only reasoning, deterministic numbers, no execution, cost controls, and data freshness warnings.

- Done when: Future agents keep LLM logic inside intended boundaries.

## P14 - API layer and single-user auth

Goal: Expose typed HTTP endpoints for the frontend while keeping the system simple, private, and self-hosted.

### [ ] P14-T001 - Create API app skeleton

- Agent action: Build Bun/TypeScript API server with config, logging, health endpoint, typed routes, graceful shutdown.

- Done when: API starts locally and reports dependency health.

### [ ] P14-T002 - Add API contract validation

- Agent action: Use shared contracts to validate request/response payloads at route boundaries.

- Done when: Invalid API responses fail tests during development.

### [ ] P14-T003 - Implement simple single-user auth

- Agent action: Add session/token auth suitable for self-hosted single-user deployment; do not add multi-tenant accounts.

- Done when: Unauthenticated requests are blocked except health/public static as intended.

### [ ] P14-T004 - Create asset/watchlist endpoints

- Agent action: Implement list assets, get asset, list watchlists, update watchlist members, get watchlist market states.

- Done when: Cockpit watchlist can load real/fixture data.

### [ ] P14-T005 - Create market state endpoints

- Agent action: Implement latest state, venue comparison, feature stack, correlation matrix, and chart candle endpoints.

- Done when: Markets and Cockpit tabs can query required market data.

### [ ] P14-T006 - Create anomaly endpoints

- Agent action: Implement list anomalies, get anomaly detail, update status, get context refs.

- Done when: Alerts tab can list, open, snooze, dismiss, and resolve anomalies.

### [ ] P14-T007 - Create briefing endpoints

- Agent action: Implement list briefings, get briefing detail, regenerate briefing, link to context packet.

- Done when: Briefings tab can display stored briefings and details.

### [ ] P14-T008 - Create decision endpoints

- Agent action: Implement create decision, update decision, list decisions by briefing/asset/date.

- Done when: Decision modal can log act/skip/snooze/dismiss rationale.

### [ ] P14-T009 - Create journal endpoints

- Agent action: Implement journal list, detail, create manual entry, update outcome, tag management.

- Done when: Journal tab can record and update trades/outcomes.

### [ ] P14-T010 - Create research endpoint

- Agent action: Implement submit question endpoint that creates research job and returns/streams answer status.

- Done when: Research tab can ask ad-hoc questions against system data.

### [ ] P14-T011 - Create analytics endpoints

- Agent action: Implement KPI, equity/R curve, setup edge, regime breakdown, signal quality endpoints.

- Done when: Analytics tab can render MVP metrics from journal data.

### [ ] P14-T012 - Create data health endpoints

- Agent action: Implement source health, feed list, feed detail, normalized data explorer endpoints.

- Done when: Data tab can display ingestion and system health.

### [ ] P14-T013 - Create settings endpoints

- Agent action: Implement watchlist settings, alert rules, model routing, notifications, layout preferences.

- Done when: Settings tab can persist single-user preferences.

### [ ] P14-T014 - Add OpenAPI generation

- Agent action: Generate OpenAPI or equivalent typed client docs from route definitions.

- Done when: Frontend and future agents can inspect API contracts.

### [ ] P14-T015 - Add API integration tests

- Agent action: Test every MVP endpoint using seeded local database/fixture data.

- Done when: API tests pass without live provider keys.

## P15 - Realtime API and UI event stream

Goal: Make the frontend feel live with controlled, typed streaming updates rather than random polling.

### [ ] P15-T001 - Choose realtime transport

- Agent action: Decide and document WebSocket vs SSE for MVP; prioritize simplicity and reliability for single-user app.

- Done when: ADR records chosen transport and fallback behavior.

### [ ] P15-T002 - Implement realtime server endpoint

- Agent action: Create authenticated realtime endpoint that streams typed UI events.

- Done when: Client can connect and receive heartbeat messages.

### [ ] P15-T003 - Map backend events to UI events

- Agent action: Translate NATS events into UI-facing events: market_state_updated, feature_updated, anomaly_created, briefing_created, source_health_changed.

- Done when: Frontend does not need to understand raw backend event bus subjects.

### [ ] P15-T004 - Add subscription filtering

- Agent action: Support filtering by watchlist, asset, venue, and tab to reduce client update volume.

- Done when: Cockpit receives relevant updates without full firehose.

### [ ] P15-T005 - Implement connection lifecycle events

- Agent action: Send connected, heartbeat, reconnect_required, and degraded-mode events.

- Done when: UI can show connection status accurately.

### [ ] P15-T006 - Implement event sequence handling

- Agent action: Include sequence numbers and timestamps so frontend can drop stale/out-of-order updates.

- Done when: Client state is not corrupted by delayed events.

### [ ] P15-T007 - Add realtime fixture broadcaster

- Agent action: Create dev tool to broadcast fixture updates at realistic intervals.

- Done when: Frontend can be developed with live-feeling fake data.

### [ ] P15-T008 - Add realtime tests

- Agent action: Test auth, heartbeat, event mapping, filtering, and disconnect cleanup.

- Done when: Realtime endpoint is covered by automated tests.

## P16 - Frontend foundations

Goal: Create the UI base system before tab-specific implementation.

### [ ] P16-T000 - Adopt cockpit.html as canonical visual reference

- Agent action: Place the approved static mock `cockpit.html` under `docs/specs/reference/cockpit.html` and treat it as the pixel-level source of truth for the Cockpit look. Extract its `:root` CSS custom properties verbatim into the design token package (P16-T002) - do not re-derive, re-name, or "improve" the palette. Pin the type stack to IBM Plex Sans (UI) + IBM Plex Mono (all tabular numbers, with `font-feature-settings: "tnum"`). Any deviation from the reference tokens, fonts, radii, or spacing requires a short ADR explaining why.

- Done when: The token package values byte-match the `:root` block in `cockpit.html`, fonts are pinned, and `docs/specs/cockpit_ui_implementation.md` and the reference file agree. A reviewer diffing a rendered component against the mock sees no token-level drift (colors, borders, radii, font).

### [ ] P16-T001 - Initialize web app

- Agent action: Create frontend app with chosen framework, TypeScript strict mode, routing, API client, and build config.

- Done when: Web app loads locally and connects to API health endpoint.

### [ ] P16-T002 - Create design token package

- Agent action: Implement theme tokens by extracting them verbatim from `docs/specs/reference/cockpit.html` `:root` (canonical) as documented in `docs/specs/cockpit_ui_implementation.md`: backgrounds (`--bg #070a0f`, `--panel #0d1119`, `--panel-2`, `--panel-hl`), borders (`--border #1a212d`, `--border-soft`), text scale (`--text-strong`/`--text`/`--text-dim`/`--text-faint`), semantic colors (green `#26c281`, red `#e35d5b`, amber `#e0a13e`, blue `#4f8df7`, violet `#7b6cf6`, pink `#e368a8`, cyan `#3fb6c4`), radii (7px panel / 5px control / 4px badge), spacing (9px grid gap base), and the IBM Plex Sans + IBM Plex Mono fonts.

- Done when: No component hardcodes colors outside the token system, and every token value matches `cockpit.html` exactly.

### [ ] P16-T003 - Create base layout shell

- Agent action: Build app shell with left nav, top bar, main content region, right/overlay support, and responsive constraints.

- Done when: Shell visually matches high-density terminal direction.

### [ ] P16-T004 - Implement top bar logo/product mark

- Agent action: Add the Aestus product mark (purple chevron-A + trend arrow, from `docs/specs/reference/aestus-logo.svg`) and `AESTUS` wordmark (uppercase, wide tracking, white) with compact styling and a future workspace/system indicator. Use `--brand`/`--brand-2` for the mark and avatar; keep `--purple` as the functional UI accent.

- Done when: Top bar shows the Aestus identity. (The main dashboard tab remains named "Cockpit" - do not rename it.)

### [ ] P16-T005 - Implement global command/search input

- Agent action: Build command/search visual component with keyboard shortcut hint; wire to placeholder actions initially.

- Done when: User sees searchable command input in top bar.

### [ ] P16-T006 - Implement market ticker strip

- Agent action: Build horizontal ticker strip showing key assets, price, percent change, up/down color, freshness.

- Done when: Ticker can render fixture BTC/ETH/SPX/DXY/GOLD/VIX values.

### [ ] P16-T007 - Implement time/timezone display

- Agent action: Show current time and configured timezone in top bar with update interval.

- Done when: Top bar displays Europe/Berlin or configured exchange/UTC time clearly.

### [ ] P16-T008 - Implement system status cluster

- Agent action: Show connection, feed health, notification, settings/user icons with degraded state support.

- Done when: User can tell if system is connected and feeds are healthy.

### [ ] P16-T009 - Implement side navigation

- Agent action: Create nav items for Cockpit, Markets, Alerts, Briefings, Research, Journal, Analytics, Playbooks, Data, Settings/System.

- Done when: Routes and active states work for every tab.

### [ ] P16-T010 - Create core UI primitives

- Agent action: Build reusable Card, Panel, Table, Badge, Metric, Sparkline placeholder, Tabs, Drawer, Modal, Button, Input, Select, Tooltip.

- Done when: Tab tasks can compose primitives instead of reinventing styling.

### [ ] P16-T011 - Create numeric formatting utilities

- Agent action: Implement price, percent, basis points, funding, notional, compact number, sigma, confidence, R-multiple formatting.

- Done when: All values format consistently across frontend.

### [ ] P16-T012 - Create stale/loading/error components

- Agent action: Build standard skeleton, empty, error, stale badge, and degraded-source callout components.

- Done when: Every data component can represent non-happy states.

### [ ] P16-T013 - Create frontend API client

- Agent action: Generate or handwrite typed client using shared contracts/OpenAPI.

- Done when: Components fetch typed data without ad-hoc fetch calls.

### [ ] P16-T014 - Create realtime client store

- Agent action: Implement connection, event subscription, reconnection, and state patch handling.

- Done when: Frontend can consume fixture realtime broadcaster.

### [ ] P16-T015 - Add frontend fixture mode

- Agent action: Allow app to run entirely from fixtures when API is unavailable.

- Done when: Design/components can be reviewed without backend services.

### [ ] P16-T016 - Add visual regression/story catalog placeholder

- Agent action: Create stories or component gallery for primitives and key panels.

- Done when: Design polish can happen independently from live data.

## P17 - Cockpit tab implementation

Goal: Build the main high-density decision cockpit view from the UI spec.

### [ ] P17-T001 - Create Cockpit route layout

- Agent action: Implement desktop grid: left watchlist/market/correlation column, center briefing/chart/news/events, right order-flow/on-chain/ask, bottom alerts.

- Done when: Route matches `docs/specs/reference/cockpit.html` and the `cockpit_ui_implementation.md` layout grid (5-track columns `262fr 380fr 400fr 196fr 224fr`, areas: left | opp/chart/news/events | flow/onchain, alerts + ask along the bottom).

### [ ] P17-T002 - Build Watchlist Panel

- Agent action: Render assets with icon, symbol, price, 24h change, alert count, freshness, and selected state.

- Done when: Selecting an asset updates focused asset state.

### [ ] P17-T003 - Build Market State Summary

- Agent action: Render risk regime, volatility regime, BTC volatility, funding, OI, market breadth with semantic badges.

- Done when: Panel can show bullish/bearish/neutral/degraded states.

### [ ] P17-T004 - Build Correlation Matrix Mini

- Agent action: Render compact correlation grid for key assets and macro instruments with values and muted/positive/negative semantics.

- Done when: Matrix handles missing/stale correlation values gracefully.

### [ ] P17-T005 - Build Top Briefing Opportunity Card

- Agent action: Render current top briefing with stance, conviction, timeframe, status, thesis, key factors, invalidation, entry considerations.

- Done when: Card supports long, short, and no-trade briefings.

### [ ] P17-T006 - Build Main Chart component shell

- Agent action: Render the candle chart region with overlay toggles for volume, OI, funding, liquidation levels, VPVR. Port the chart's visual rendering directly from `cockpit.html` (the inline SVG renderer) so MVP keeps the signature look, not a generic placeholder: green/red candles with wicks, translucent volume bars beneath, solid liquidation-cluster lines with right-edge price labels (red upper / green lower), a dashed amber POC line labeled "POC", and the green current-price line with its boxed price + time tag. Keep the data-wiring (fixture candles, level inputs) decoupled from the styling so the renderer can later accept live data. Deterministic levels only - the chart draws levels supplied by the level engine, never values invented by the LLM.

- Done when: Chart displays fixture candles and overlays horizontal levels, AND a reviewer comparing it to `cockpit.html` sees matching candle/volume/liquidation-line/POC/current-price styling. (Advanced interactions - drawing tools, heatmaps, multi-asset compare - remain deferred to D09.)

### [ ] P17-T007 - Build Order Flow/Depth Panel

- Agent action: Render venue selector, timeframe selector, price ladder/depth bars, imbalance, and buy/sell pressure badge.

- Done when: Panel handles missing orderbook feed with degraded state.

### [ ] P17-T008 - Build Recent News & Narratives panel

- Agent action: Render recent context items with timestamp, title, source/type badges, relevance, and asset/entity tags.

- Done when: Panel filters to focused asset and supports all/news/on-chain/social tabs.

### [ ] P17-T009 - Build Upcoming Events panel

- Agent action: Render macro events with time-to-event, currency, importance, consensus/actual placeholders.

- Done when: High-importance events are visually prominent.

### [ ] P17-T010 - Build On-Chain Insights panel

- Agent action: Render exchange netflow, whale transactions, active addresses, MVRV, realized cap change with directional badges.

- Done when: Panel marks data source confidence and staleness.

### [ ] P17-T011 - Build Active Alerts Table

- Agent action: Render latest active alerts with time, type, asset, title, context summary, conviction, status.

- Done when: Clicking alert opens anomaly detail drawer.

### [ ] P17-T012 - Build Ask Mini Panel

- Agent action: Render compact natural-language input plus latest answer/summary for focused asset.

- Done when: Submitting routes to Research or calls research endpoint in mini mode.

### [ ] P17-T013 - Wire Cockpit data loading

- Agent action: Connect panels to API endpoints and fixture fallback.

- Done when: Cockpit loads from seeded data without manual prop wiring.

### [ ] P17-T014 - Wire Cockpit realtime updates

- Agent action: Apply market, anomaly, briefing, and source health realtime events to Cockpit state.

- Done when: Ticker/watchlist/alerts update live from fixture broadcaster.

### [ ] P17-T015 - Add Cockpit keyboard shortcuts

- Agent action: Implement focus search, switch asset, open top alert, open top briefing, dismiss selected drawer.

- Done when: Power-user shortcuts work and are documented in help.

### [ ] P17-T016 - Add Cockpit responsive fallback

- Agent action: For narrow screens, prioritize watchlist, top briefing, chart, alerts, ask; collapse secondary panels.

- Done when: Mobile/narrow view remains usable for away-from-desk checks.

## P18 - Markets tab implementation

Goal: Build asset universe, per-asset market state, venue comparison, features, and cross-asset relationship views.

### [ ] P18-T001 - Create Markets route layout

- Agent action: Implement split layout with universe table and selected asset detail panels.

- Done when: Route renders all component slots from UI spec.

### [ ] P18-T002 - Build Market Universe Table

- Agent action: Columns: asset, asset class, price, 24h %, volume, volatility, funding, OI delta, alerts, regime, freshness.

- Done when: Table supports sorting and filtering by class/venue/status.

### [ ] P18-T003 - Build Selected Asset Header

- Agent action: Show selected asset identity, canonical symbol, venues, current price, key stats, status badges.

- Done when: Changing selected asset updates all child panels.

### [ ] P18-T004 - Build Venue Comparison Table

- Agent action: Render per-venue price, mark, funding, OI, basis, volume, liquidity, data freshness.

- Done when: Cross-venue divergence is highlighted.

### [ ] P18-T005 - Build Feature Stack panel

- Agent action: Render z-scores, volatility, volume, OI, funding, basis, liquidity, regime in compact rows.

- Done when: Feature values include deterministic/source labels.

### [ ] P18-T006 - Build Cross-Asset Relationship View

- Agent action: Show selected asset correlations vs BTC/ETH/SPX/DXY/GOLD/OIL/VIX with trend/change indicators.

- Done when: Handles missing macro data with explicit empty/stale state.

### [ ] P18-T007 - Add Market filters

- Agent action: Implement filters for asset class, venue, alert status, regime, and watchlist membership.

- Done when: Filters update URL/query state for shareable navigation.

### [ ] P18-T008 - Wire Markets data endpoints

- Agent action: Connect route to market state, venue comparison, feature stack, and correlation API endpoints.

- Done when: Markets tab works with seeded backend data.

### [ ] P18-T009 - Wire Markets realtime updates

- Agent action: Patch table rows and selected asset panels from realtime market/feature/source events.

- Done when: Visible market rows update without full reload.

### [ ] P18-T010 - Add export/copy debug action

- Agent action: Allow copying selected asset state JSON for debugging/agent handoff.

- Done when: Copied JSON includes asset, venues, latest features, and freshness.

## P19 - Alerts tab implementation

Goal: Build the workflow for reviewing, triaging, and configuring anomaly alerts.

### [ ] P19-T001 - Create Alerts route layout

- Agent action: Implement inbox table, detail pane/drawer, and rule builder section.

- Done when: Route clearly separates active alert triage from rule configuration.

### [ ] P19-T002 - Build Alert Inbox Table

- Agent action: Columns: detected time, type, asset, severity, sigma, title, status, source/freshness, briefing status.

- Done when: Table supports filter by status/type/asset/severity.

### [ ] P19-T003 - Build Alert Detail Pane

- Agent action: Show full anomaly details: trigger metrics, related assets, latest context, source data, timeline, available briefing.

- Done when: User can understand raw trigger before reading LLM synthesis.

### [ ] P19-T004 - Add alert status actions

- Agent action: Implement snooze, dismiss, mark resolved, reopen from detail and table row actions.

- Done when: Status changes persist via API and update UI immediately.

### [ ] P19-T005 - Build Alert Rule Builder

- Agent action: Implement UI to create/edit deterministic alert rules with asset scope, feature, threshold, window, cooldown, severity.

- Done when: Rule builder produces valid rule config payloads.

### [ ] P19-T006 - Add rule validation UI

- Agent action: Show invalid combinations, missing windows, impossible thresholds, and estimated alert frequency placeholder.

- Done when: User cannot save malformed rules.

### [ ] P19-T007 - Wire alert endpoints

- Agent action: Connect list/detail/status/rule endpoints to the UI.

- Done when: Alerts tab operates on backend seeded anomalies/rules.

### [ ] P19-T008 - Wire realtime alert creation

- Agent action: New anomaly_created events appear in inbox with non-disruptive highlight and optional sound/notification state.

- Done when: Alert inbox updates live.

### [ ] P19-T009 - Add alert empty states

- Agent action: Handle no active alerts, no matching filters, all feeds stale, and no rules configured.

- Done when: Every empty state tells user what to do next.

### [ ] P19-T010 - Add alert audit trail display

- Agent action: Show when alert was created, updated, snoozed, dismissed, or converted into a briefing/decision.

- Done when: Alert lifecycle is transparent.

## P20 - Briefings tab implementation

Goal: Build the central thesis/proposal review experience with context and decision logging.

### [ ] P20-T001 - Create Briefings route layout

- Agent action: Implement briefing list on left and detail view on right, with context drawer/modal support.

- Done when: Route supports fast scanning and detailed review.

### [ ] P20-T002 - Build Briefing List

- Agent action: Show stance, asset, title, confidence, timeframe, generated time, status, linked alert, decision state.

- Done when: List filters by stance, asset, confidence, date, decision status.

### [ ] P20-T003 - Build Briefing Detail header

- Agent action: Render asset, stance, confidence, timeframe, model, generated time, status, and source freshness.

- Done when: User immediately sees whether briefing is current and grounded.

### [ ] P20-T004 - Build thesis and factors section

- Agent action: Render thesis, key factors, supporting/contradicting context, and no-trade reasoning when applicable.

- Done when: Briefing clearly distinguishes narrative from deterministic values.

### [ ] P20-T005 - Build levels and risk section

- Agent action: Render entry zone, invalidation, targets, suggested size, and derivation/source labels from level engine.

- Done when: Price levels show deterministic source metadata, not just text.

### [ ] P20-T006 - Build supporting context section

- Agent action: Show linked anomaly, related market state, news, macro, on-chain, historical analogues, and data quality.

- Done when: User can audit the context behind the briefing.

### [ ] P20-T007 - Build cost/observability section

- Agent action: Show originating model, token usage, cache hit, feeds/signals consulted, packet quality.

- Done when: LLM cost and provenance are visible.

### [ ] P20-T008 - Build Decision Logging Modal

- Agent action: Support act, skip, snooze, dismiss, watch; capture rationale, entry/stop/targets, risk, tags, recheck time.

- Done when: Decision payload validates against shared decision schema.

### [ ] P20-T009 - Wire briefing endpoints

- Agent action: Connect list/detail/regenerate/decision endpoints.

- Done when: Briefings tab loads and logs decisions against seeded briefings.

### [ ] P20-T010 - Wire briefing realtime events

- Agent action: New briefing_generated events appear in list and can optionally become top opportunity.

- Done when: Briefing list updates live without refresh.

### [ ] P20-T011 - Add regenerate briefing flow

- Agent action: Allow manual regeneration from detail with clear cost/freshness warning.

- Done when: Regeneration creates new version or updates according to documented policy.

### [ ] P20-T012 - Add briefing version history placeholder

- Agent action: Show prior versions or a message that version history is not yet available.

- Done when: Future versioning does not require UI redesign.

## P21 - Research tab implementation

Goal: Build natural-language querying over the system data without letting chat dominate the cockpit.

### [ ] P21-T001 - Create Research route layout

- Agent action: Implement composer, answer panel, source/context sidebar, and saved recent questions list.

- Done when: Route feels data-grounded, not generic chatbot.

### [ ] P21-T002 - Build Research Composer

- Agent action: Support question input, asset/timeframe selectors, data source toggles, and suggested prompt chips.

- Done when: User can ask “what is driving BTC today?” with explicit scope.

### [ ] P21-T003 - Build Answer Panel

- Agent action: Render answer summary, reasoning sections, confidence/data quality, and follow-up suggestions.

- Done when: Answers cite internal source blocks/contexts by type.

### [ ] P21-T004 - Build Source Context Sidebar

- Agent action: Show retrieved market snapshots, news items, macro events, anomaly refs, journal refs used in answer.

- Done when: User can inspect grounding data.

### [ ] P21-T005 - Implement research job backend

- Agent action: Create research job flow that retrieves relevant internal data and calls LLM with guardrail prompt.

- Done when: Research answers are grounded in stored system data, not just model memory.

### [ ] P21-T006 - Implement source retrieval for research

- Agent action: Query market state, feature history, anomalies, briefings, news, macro, on-chain, and journal by user question scope.

- Done when: Research packet includes explicit source categories.

### [ ] P21-T007 - Add research answer persistence

- Agent action: Store questions, answers, sources, model metadata, and cost.

- Done when: Recent questions can be revisited.

### [ ] P21-T008 - Add research guardrail copy

- Agent action: UI should explain when data is missing/stale and avoid presenting answers as trade commands.

- Done when: Research response states uncertainty and missing data clearly.

### [ ] P21-T009 - Wire Research endpoints

- Agent action: Connect submit/status/read history endpoints.

- Done when: Research tab works with fake provider and seeded data.

### [ ] P21-T010 - Add mini-panel integration

- Agent action: Connect Cockpit Ask Mini Panel to Research backend or route with prefilled context.

- Done when: Asking from Cockpit preserves focused asset and timeframe.

## P22 - Journal and learning loop MVP

Goal: Record decisions and outcomes so the system can learn which signals work for this trader.

### [ ] P22-T001 - Create Journal route layout

- Agent action: Implement table/list, detail pane, outcome form, and filters.

- Done when: Journal tab can show trades and decisions separately or linked.

### [ ] P22-T002 - Build Journal Entry Table

- Agent action: Columns: date/time, asset, direction, setup, linked briefing, entry, exit, R, PnL, outcome status, tags.

- Done when: Table supports date/asset/setup/outcome filters.

### [ ] P22-T003 - Build Journal Entry Detail

- Agent action: Show full decision rationale, linked briefing, context snapshot, trade lifecycle, notes, screenshots/attachments placeholder.

- Done when: User can audit why a trade was taken or skipped.

### [ ] P22-T004 - Build Outcome Update Form

- Agent action: Capture exit price/time, fees, realized PnL, R multiple, screenshots/notes, what happened.

- Done when: Outcome update validates and recalculates R/PnL.

### [ ] P22-T005 - Implement create journal from decision

- Agent action: When user chooses act, create journal entry linked to briefing and decision context.

- Done when: Acting on a briefing produces a draft/open journal record.

### [ ] P22-T006 - Implement skip/dismiss learning records

- Agent action: Store skip/dismiss decisions as learning records even without trade entry.

- Done when: System can later analyze missed/skipped setups.

### [ ] P22-T007 - Implement manual journal entry flow

- Agent action: Allow user to add a trade not generated from a briefing.

- Done when: Manual entries can still be tagged and included in analytics.

### [ ] P22-T008 - Implement tag management

- Agent action: Create setup tags, regime tags, signal tags, mistake tags, and freeform notes.

- Done when: Journal and analytics can group by tags.

### [ ] P22-T009 - Implement R-multiple calculation

- Agent action: Calculate R from entry, stop/invalidation, exit, direction, and size/risk.

- Done when: R multiple remains consistent across journal and analytics.

### [ ] P22-T010 - Wire Journal endpoints

- Agent action: Connect journal list/detail/create/update/outcome/tag endpoints.

- Done when: Journal tab works with seeded and newly created entries.

### [ ] P22-T011 - Add journal fixtures

- Agent action: Create sample winning, losing, breakeven, skipped, and no-trade records.

- Done when: Analytics can be developed against realistic journal data.

### [ ] P22-T012 - Document learning loop policy

- Agent action: Create `docs/learning_loop.md` explaining how decisions/outcomes feed future analytics and eventual earned automation candidates.

- Done when: Agents understand why logging is first-class.

## P23 - Analytics tab implementation

Goal: Turn the journal and signal history into performance feedback for the trader.

### [ ] P23-T001 - Create Analytics route layout

- Agent action: Implement KPI row, equity/R curve, setup edge table, regime breakdown, signal quality insights.

- Done when: Route matches UI implementation sections.

### [ ] P23-T002 - Build KPI Cards

- Agent action: Show total trades, win rate, expectancy, average R, max drawdown, profit factor, best/worst setup placeholders.

- Done when: KPIs handle insufficient sample size explicitly.

### [ ] P23-T003 - Build Equity/R Curve

- Agent action: Render cumulative R and optional equity curve over time with drawdown markers.

- Done when: Chart works from journal fixtures.

### [ ] P23-T004 - Build Setup Edge Table

- Agent action: Group by setup/anomaly type with count, win rate, avg R, expectancy, drawdown, confidence/sample warning.

- Done when: Small sample groups are flagged as unreliable.

### [ ] P23-T005 - Build Regime Breakdown

- Agent action: Compare performance by market regime, volatility regime, time of day, asset, and direction.

- Done when: User can see where edge appears or disappears.

### [ ] P23-T006 - Build Signal Quality Insights

- Agent action: Show which anomaly classes preceded good/bad outcomes and which are over-alerting.

- Done when: Insights distinguish descriptive stats from proven edge.

### [ ] P23-T007 - Implement analytics queries

- Agent action: Backend computes KPIs, R curve, setup edge, regime breakdown, signal quality from journal/anomaly tables.

- Done when: API returns same metrics as UI requires.

### [ ] P23-T008 - Add analytics date filters

- Agent action: Implement timeframe filters: 7d, 30d, 90d, all, custom.

- Done when: Analytics queries and UI update together.

### [ ] P23-T009 - Add insufficient-data states

- Agent action: Show clear warnings when sample size is too small for conclusions.

- Done when: UI does not overstate edge from tiny samples.

### [ ] P23-T010 - Document analytics formulas

- Agent action: Create `docs/analytics_formulas.md` defining win rate, expectancy, profit factor, drawdown, R multiple, setup edge.

- Done when: Metrics are reproducible and auditable.

## P24 - Playbooks, Data, and Settings tabs

Goal: Implement the support tabs that make the cockpit configurable, observable, and eventually repeatable.

### [ ] P24-T001 - Create Playbooks route layout

- Agent action: Implement card grid/list and detail view for setup playbooks.

- Done when: Playbooks tab exists even if MVP starts with fixtures.

### [ ] P24-T002 - Build Playbook Card

- Agent action: Show setup name, description, signal types, required conditions, historical stats, active/inactive state.

- Done when: Cards explain when a playbook is relevant.

### [ ] P24-T003 - Build Playbook Detail

- Agent action: Show rules, required context, invalidation ideas, examples, linked past trades, automation eligibility placeholder.

- Done when: Detail reinforces earned automation as future-only.

### [ ] P24-T004 - Create Data route layout

- Agent action: Implement source health summary, feed list, feed detail, normalized data explorer.

- Done when: Data tab supports operational debugging.

### [ ] P24-T005 - Build Source Health Summary

- Agent action: Show service/feed health, freshness, lag, event rates, error counts, degraded status.

- Done when: User can see whether data is trustworthy.

### [ ] P24-T006 - Build Feed List

- Agent action: List provider feeds by type, venue/source, status, last message, events/min, error rate.

- Done when: Feeds can be filtered by market/news/macro/on-chain/system.

### [ ] P24-T007 - Build Feed Detail

- Agent action: Show provider metadata, last payload summary, recent errors, reconnect history, config, and raw/normalized examples.

- Done when: Agent/user can debug one source without logs.

### [ ] P24-T008 - Build Normalized Data Explorer

- Agent action: Allow query by asset, venue, event type, time window and render normalized rows.

- Done when: Explorer helps validate ingestion/normalization.

### [ ] P24-T009 - Create Settings/System route layout

- Agent action: Implement settings sections for watchlists, alert rules, model routing, notifications, layout, system.

- Done when: Settings are grouped by practical user tasks.

### [ ] P24-T010 - Build Watchlist Settings

- Agent action: Add/remove/reorder assets, choose primary venues, configure visible columns.

- Done when: Watchlist updates persist and affect Cockpit.

### [ ] P24-T011 - Build Model Routing Settings

- Agent action: Configure provider/model per task type, max cost, timeout, caching, fallback fake provider.

- Done when: Model choices are visible and adjustable.

### [ ] P24-T012 - Build Notification Settings

- Agent action: Configure in-app, push/bot placeholders, severity thresholds, quiet hours, snooze defaults.

- Done when: Notification behavior can be tuned by user.

### [ ] P24-T013 - Build Layout Settings

- Agent action: Configure density, theme mode, panel visibility, default tab, chart defaults.

- Done when: Layout preferences persist.

### [ ] P24-T014 - Wire settings endpoints

- Agent action: Connect all settings forms to API and persist to Postgres.

- Done when: Reload preserves settings state.

## P25 - Notifications and away-from-desk alerts

Goal: Deliver anomaly/briefing alerts without becoming spammy or implying automatic execution.

### [ ] P25-T001 - Create notification service skeleton

- Agent action: Build TS service consuming anomaly/briefing events and sending in-app/push channels according to settings.

- Done when: Service heartbeat appears in system health.

### [ ] P25-T002 - Implement notification rule evaluator

- Agent action: Apply severity, asset/watchlist, quiet hours, snooze, cooldown, and briefing availability filters.

- Done when: Only eligible events generate notifications.

### [ ] P25-T003 - Implement in-app notification store

- Agent action: Persist in-app notifications with read/unread, clicked, dismissed, source event, created_at.

- Done when: Notification bell can show unread state.

### [ ] P25-T004 - Implement push/bot provider abstraction

- Agent action: Create interface for messaging bot/push providers with fake provider for tests.

- Done when: MVP can use fake provider before Telegram/Discord/etc is selected.

### [ ] P25-T005 - Create notification payload templates

- Agent action: Design concise payloads for anomaly, briefing, thesis broken, macro approaching, source degraded.

- Done when: Payloads include context and never include trade execution commands.

### [ ] P25-T006 - Implement thesis invalidation watch placeholder

- Agent action: Create logic placeholder to watch open journal entries against invalidation conditions and emit notification event.

- Done when: Open-position monitoring exists without closing trades.

### [ ] P25-T007 - Add notification delivery logging

- Agent action: Record attempted/sent/failed/skipped delivery and reason.

- Done when: User can debug why a notification did or did not arrive.

### [ ] P25-T008 - Wire notification UI

- Agent action: Connect bell/dropdown or panel to notification store and status actions.

- Done when: Unread notifications are visible and actionable.

## P26 - Observability, cost control, and system health

Goal: Make the self-hosted system understandable and cheap to run.

### [ ] P26-T001 - Add structured logging standard

- Agent action: Adopt JSON logs with service, trace_id, event_id, asset, venue, task_id, error metadata.

- Done when: Logs across services can be correlated.

### [ ] P26-T002 - Add trace IDs across pipeline

- Agent action: Propagate trace_id from raw event to anomaly to context packet to briefing to notification.

- Done when: A single anomaly can be traced through all services.

### [ ] P26-T003 - Add metrics endpoint per service

- Agent action: Expose counters/gauges for events processed, errors, lag, queue depth, LLM cost, provider calls.

- Done when: Metrics can be scraped or read by health endpoints.

### [ ] P26-T004 - Add BullMQ dashboard or queue health endpoint

- Agent action: Expose job counts, failed jobs, retries, age, and stuck job detection.

- Done when: Context/LLM/notification jobs are operationally visible.

### [ ] P26-T005 - Implement cost budget settings

- Agent action: Add daily/monthly LLM cost budget fields and enforcement mode: warn, degrade, block noncritical.

- Done when: System can remain within low monthly cost target.

### [ ] P26-T006 - Implement LLM cost ledger

- Agent action: Store model calls, estimated tokens, price, cache hits, task type, linked briefing/research IDs.

- Done when: Cost/observability metadata is auditable.

### [ ] P26-T007 - Add degraded-mode behavior

- Agent action: Define what each service/UI does when a dependency is stale/down: NATS, Redis, Postgres, ClickHouse, LLM provider.

- Done when: System fails visibly and safely rather than silently.

### [ ] P26-T008 - Create system status page/panel data

- Agent action: Aggregate service health, feed health, queue health, DB health, and cost status for UI.

- Done when: Settings/System or Data tab can show overall operational state.

### [ ] P26-T009 - Add log redaction policy

- Agent action: Ensure API keys, auth tokens, and private config never appear in logs.

- Done when: Sensitive values are redacted in tests and runtime logging.

### [ ] P26-T010 - Document operations runbook

- Agent action: Create `docs/ops_runbook.md` for restart, backup, restore, feed stale, LLM provider down, disk full, high cost.

- Done when: Single operator can recover common failures.

## P27 - Testing, fixtures, and replay workflows

Goal: Make the cockpit buildable by agents without needing live markets for every task.

### [ ] P27-T001 - Create fixture catalog

- Agent action: Organize fixtures by scenario: quiet market, BTC funding spike, ETH liquidation cluster, SOL volume anomaly, macro event, whale flow, no-trade.

- Done when: Each fixture scenario has README explaining expected behavior.

### [ ] P27-T002 - Create raw provider payload fixtures

- Agent action: Store representative raw payloads for Binance, Bybit, Hyperliquid, OKX, macro, RSS, on-chain.

- Done when: Parsers can be tested without network access.

### [ ] P27-T003 - Create normalized event fixtures

- Agent action: Store schema-valid normalized events for each event type.

- Done when: Contract validation covers all event variants.

### [ ] P27-T004 - Create feature fixture snapshots

- Agent action: Store expected feature snapshots for key scenarios.

- Done when: Feature engine tests can assert deterministic outputs.

### [ ] P27-T005 - Create anomaly fixture outputs

- Agent action: Store expected anomalies for scenarios and threshold configs.

- Done when: Anomaly detection regression tests are stable.

### [ ] P27-T006 - Create context packet fixtures

- Agent action: Store expected context packets for BTC funding, ETH liquidation, SOL volume, macro/no-trade scenarios.

- Done when: LLM prompt tests have realistic inputs.

### [ ] P27-T007 - Create briefing fixtures

- Agent action: Store representative long/short/no-trade briefing outputs from fake provider.

- Done when: Frontend Briefings tab works without model calls.

### [ ] P27-T008 - Create journal/analytics fixtures

- Agent action: Store sample trade history with mixed outcomes and tags.

- Done when: Journal and Analytics tabs can develop independently.

### [ ] P27-T009 - Implement end-to-end replay script

- Agent action: Replay fixture raw events through ingestion/normalization/features/anomalies/context/briefing using fake LLM.

- Done when: One command demonstrates core pipeline locally.

### [ ] P27-T010 - Add API contract tests

- Agent action: For each endpoint, assert response matches shared contract and fixture values.

- Done when: Frontend can trust API shapes.

### [ ] P27-T011 - Add frontend component tests

- Agent action: Test critical components for render, empty, error, stale, and interaction states.

- Done when: UI primitives and main panels have regression coverage.

### [ ] P27-T012 - Add smoke E2E test

- Agent action: Automate user flow: open Cockpit, see alert, open briefing, log skip/act, update journal outcome, view analytics.

- Done when: The core user journey works end-to-end in fixture mode.

## P28 - Deployment, backup, and self-hosting

Goal: Package the system for a single modest server with safe persistence and no accidental public exposure.

### [ ] P28-T001 - Create production Dockerfiles

- Agent action: Add optimized Dockerfiles for API, web, ingestion, features, context, LLM, notifications.

- Done when: Images build reproducibly from repository.

### [ ] P28-T002 - Create production compose file

- Agent action: Create `infra/docker-compose.prod.yml` with volumes, restart policies, healthchecks, resource limits, and env references.

- Done when: Single VPS can run all services via compose.

### [ ] P28-T003 - Add reverse tunnel/CDN docs

- Agent action: Document Cloudflare Tunnel or equivalent secure HTTPS access with no open inbound ports. For MVP prefer Tailscale (Serve for tailnet-only HTTPS, Funnel if public access is needed): free, no domain purchase required, automatic certs via `<machine>.<tailnet>.ts.net`. A paid domain + named Cloudflare Tunnel is a later, optional upgrade.

- Done when: Deployment guide avoids exposing raw service ports publicly.

### [ ] P28-T004 - Add backup script

- Agent action: Create script to backup Postgres, ClickHouse metadata/aggregates policy, Redis config if needed, and env-free app config.

- Done when: Operator can create timestamped backups.

### [ ] P28-T005 - Add restore script

- Agent action: Create tested restore workflow for Postgres and critical app state.

- Done when: Restore can rebuild local environment from backup artifact.

### [ ] P28-T006 - Add volume layout doc

- Agent action: Document which Docker volumes contain durable state and which are disposable caches/logs.

- Done when: Operator knows what not to delete.

### [ ] P28-T007 - Add environment hardening checklist

- Agent action: Document secret generation, auth token setup, CORS/origin config, tunnel config, filesystem permissions.

- Done when: Deployment cannot proceed without filling secure env values.

### [ ] P28-T008 - Add startup order/health policy

- Agent action: Ensure services wait for dependencies or degrade gracefully; compose healthchecks reflect real readiness.

- Done when: System starts reliably after VPS reboot.

### [ ] P28-T009 - Add disk usage monitor

- Agent action: Implement simple periodic check or health metric for disk usage, especially ClickHouse and logs.

- Done when: Data tab/system status can warn before disk fills.

### [ ] P28-T010 - Create release checklist

- Agent action: Document steps to cut a local/prod release, run migrations, backup, deploy, verify, and rollback.

- Done when: Future agents can deploy without improvising.

## P29 - Security, privacy, and safety hardening

Goal: Keep the personal trading cockpit private, safe, and clearly non-executing.

### [ ] P29-T001 - Audit for execution affordances

- Agent action: Search UI/API for buy, sell, place order, execute, close position actions and remove/rename unsafe affordances.

- Done when: No component can place orders or imply it will.

### [ ] P29-T002 - Add API rate limiting

- Agent action: Add simple per-session/IP rate limits for auth, research, briefing regeneration, and expensive endpoints.

- Done when: Accidental loops do not trigger runaway LLM or DB usage.

### [ ] P29-T003 - Add CSRF/origin protections

- Agent action: If using cookie sessions, implement CSRF protections and strict allowed origins.

- Done when: Browser access is protected for self-hosted deployment.

### [ ] P29-T004 - Add secret scanning ignore/guard

- Agent action: Document secrets policy and add local checks or gitignore patterns for env files and provider keys.

- Done when: Secrets are not committed.

### [ ] P29-T005 - Add prompt injection guardrails for news/research

- Agent action: Treat external news/social text as untrusted data in prompts and separate it from instructions.

- Done when: LLM prompts cannot be overridden by article/social content.

### [ ] P29-T006 - Add data privacy doc

- Agent action: Document what data is stored locally, what is sent to LLM providers, and how to disable external LLM calls.

- Done when: User understands privacy/cost tradeoffs.

### [ ] P29-T007 - Add safe error messages

- Agent action: Ensure UI errors do not reveal secrets, internal tokens, or raw stack traces.

- Done when: Frontend receives user-safe errors with correlation IDs.

### [ ] P29-T008 - Add dependency update policy

- Agent action: Document how to update dependencies and run tests before deployment.

- Done when: Security updates can be applied without breaking stack.

## P30 - MVP stitching and acceptance

Goal: Validate that the first usable cockpit works as an integrated decision-support system.

### [ ] P30-T001 - Define MVP scenario script

- Agent action: Write a manual test script: start local stack, replay BTC funding spike, see alert, generate briefing, log decision, update outcome, view analytics.

- Done when: Script can be followed step-by-step by an agent.

### [ ] P30-T002 - Run full fixture pipeline

- Agent action: Execute replay from raw/normalized events through feature/anomaly/context/briefing using fake LLM.

- Done when: Artifacts exist at each pipeline stage and match expected fixtures.

### [ ] P30-T003 - Verify Cockpit live feel

- Agent action: Use fixture broadcaster and confirm ticker/watchlist/chart/alerts update without reload.

- Done when: Cockpit feels live and shows freshness indicators.

### [ ] P30-T004 - Verify deterministic levels

- Agent action: Confirm briefing numeric levels match level engine outputs and not LLM-invented values.

- Done when: Changing fake LLM text cannot change level values.

### [ ] P30-T005 - Verify no-trade path

- Agent action: Replay no-trade scenario and confirm briefing, UI, decision logging, and analytics all support no_trade.

- Done when: No-trade is not treated as an error or missing data.

### [ ] P30-T006 - Verify stale/degraded states

- Agent action: Simulate stale feed/LLM outage/ClickHouse down and confirm UI/API show degraded states safely.

- Done when: System communicates uncertainty instead of hiding failures.

### [ ] P30-T007 - Verify cost controls

- Agent action: Simulate LLM budget warning/block mode and confirm regeneration/research behavior respects settings.

- Done when: Budget limits prevent runaway model calls.

### [ ] P30-T008 - Verify journal learning loop

- Agent action: Log act/skip/dismiss decisions and outcomes, then confirm analytics reflect them correctly.

- Done when: Learning loop path is complete.

### [ ] P30-T009 - Create MVP demo data reset

- Agent action: Add one command to reset local env to known demo state with fixtures.

- Done when: A reviewer can reproduce the same demo every time.

### [ ] P30-T010 - Write MVP known limitations

- Agent action: Create `docs/mvp_known_limitations.md` listing incomplete providers, fake data areas, scaling limits, and future tasks.

- Done when: Limitations are explicit and not hidden as product behavior.

### [ ] P30-T011 - Tag MVP release candidate

- Agent action: When all acceptance checks pass, create release notes summarizing what is usable and what remains deferred.

- Done when: Repository has a clear MVP checkpoint.

---

## Deferred post-MVP backlog seeds

These are intentionally not part of the initial MVP unless a human reprioritizes them.

### [ ] D01 - Full Bybit live adapter

- Agent action: Replace fixture-only Bybit support with full public WebSocket/polling implementation for price, trade, funding, OI, liquidations, and orderbook where available.
- Done when: Bybit streams pass the same ingestion and normalization tests as Binance.

### [ ] D02 - Full Hyperliquid live adapter

- Agent action: Implement live Hyperliquid market data adapter and map instruments into canonical assets.
- Done when: Hyperliquid BTC/ETH/SOL data appears in venue comparison and basis/funding views.

### [ ] D03 - Full OKX live adapter

- Agent action: Implement OKX public market data adapter for MVP asset set.
- Done when: OKX feed health and market states appear alongside Binance.

### [ ] D04 - Deribit options context

- Agent action: Add Deribit options data ingestion for BTC/ETH implied volatility, skew, and large options flows.
- Done when: Options context can appear in context packets and briefings.

### [ ] D05 - Mobile companion UI

- Agent action: Build a mobile-first alert/briefing/journal workflow optimized for away-from-desk use.
- Done when: User can triage alerts, read briefings, and log decisions from a phone.

### [ ] D06 - Earned automation research mode

- Agent action: Create analysis-only tooling to identify candidate signal classes after months of journaled outcomes; do not place trades.
- Done when: Playbooks can show automation eligibility metrics without any execution capability.

### [ ] D07 - Strategy simulation/backtesting

- Agent action: Add offline replay/backtest module for validated signal classes using stored historical events and journal assumptions.
- Done when: Backtest results are explicitly labeled hypothetical and separate from live briefings.

### [ ] D08 - Advanced historical analogue search

- Agent action: Improve analogue retrieval using feature vectors and event similarity rather than simple anomaly-type matching.
- Done when: Context packets include ranked analogues with similarity score and outcome distribution.

### [ ] D09 - Rich charting upgrades

- Agent action: Add advanced chart interactions: multi-timeframe overlays, drawing tools, VPVR, liquidation heatmap, compare assets.
- Done when: Chart remains fast and readable without turning into an execution terminal.

### [ ] D10 - Local/open-model experimentation

- Agent action: Add local or low-cost open-model providers for extraction, scoring, and maybe briefing drafts.
- Done when: Model routing can use local providers with comparable structured-output validation.

### [ ] D11 - Native kernel playground (C/Zig via FFI)

- Agent action: After the Rust feature engine is complete, correct, and benchmarked, extract the hottest numerical inner loops (e.g., z-score, rolling correlation) into C (SIMD intrinsics) and Zig kernels called in-process via FFI (wired through build.rs). Benchmark Rust vs C vs Zig on identical fixtures.
- Done when: Kernels are feature-flagged off by default, outputs match the pure-Rust implementation exactly on deterministic fixtures, a benchmark report compares all three implementations, and the system runs fully with kernels disabled.
- Note: This is a deliberate learning indulgence, not a performance requirement (spec §11). End-to-end latency is network/LLM-dominated; do not start this before the pure-Rust baseline exists.
