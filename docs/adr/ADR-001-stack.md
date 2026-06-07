# ADR-001 — Core stack selection

- Status: accepted
- Date: 2026-06-07
- Task: P00-T006

## Context

Aestus is a self-hosted, single-user, crypto-primary decision-support cockpit. The stack must:

1. Handle high-frequency real-time market data (ticks, funding, OI, liquidations) with low per-event overhead.
2. Persist large volumes of time-series data queryable by asset/time at low cost.
3. Support a rich, reactive single-page UI updated in near-real-time.
4. Keep total running cost within €10–30/month on a single VPS.
5. Remain fully runnable from local fixtures without external providers or LLM secrets (fixture-first rule).
6. Be implementable by a single developer/agentic loop without org-scale infrastructure.

## Decision

### Ingestion and feature engine — Rust

Rust handles high-throughput WebSocket message parsing, normalization, and rolling feature computation without GC pauses. The safe concurrency model prevents data races in stateful feature windows. Pure-Rust baseline for MVP; no C/Zig FFI performance kernels until post-MVP (see Consequences).

### API server and LLM orchestration — TypeScript / Bun

Bun's fast startup, native TypeScript support, and compatible npm ecosystem make it the pragmatic choice for the HTTP/WebSocket API layer and the LLM orchestration job queue. Shared contract types between API and frontend without a separate compilation step.

### Message bus — NATS JetStream

JetStream provides durable, replay-capable pub/sub with at-least-once delivery guarantees and consumer groups. Lighter than Kafka for a single-node deployment; lower ops overhead than RabbitMQ; built-in stream replay for feature/anomaly replay testing.

### Hot cache and job queue — Redis + BullMQ

Redis holds the latest market state per asset/venue (price, funding, OI, mark) so the API never scans ClickHouse for real-time reads. BullMQ (on Redis) manages the LLM briefing job queue with retries and rate limiting.

### Relational store — PostgreSQL with pgvector

Postgres stores all relational data: assets, venues, anomalies, context packets, briefings, decisions, journal, analytics, settings. pgvector extension is included for future news/briefing embedding search. Single engine for structured relational queries.

### Time-series / event store — ClickHouse

ClickHouse stores raw and normalized market events, OHLCV aggregates, feature snapshots, and anomaly metrics. Columnar compression makes per-asset/time queries efficient at scale. Self-hosted single-node ClickHouse fits the VPS cost model.

### Runtime LLM providers — Ollama Cloud (subscription billing)

Per-token Anthropic API billing is incompatible with the €10–30/month flat-cost target. Ollama Cloud provides subscription-billed access to open-weight models via an OpenAI/Anthropic-compatible API:

- **Briefings, thesis synthesis, NL research**: Kimi K2.6 (top-tier reasoning, confirmed against Ollama Cloud catalog at P13)
- **Entity extraction, relevance scoring, sentiment, classification**: MiniMax M2.7 (high-volume narrow tasks, lower cost per call)

Both models are behind the provider-agnostic abstraction defined in P13-T002 and swappable. Env: `OLLAMA_API_KEY`, `OLLAMA_BASE_URL`. The build loop (scripts/loop.ps1) is NOT affected — it continues to use Claude Code (Opus 4.8 / Sonnet 4.6) for agentic task execution.

### Deployment — single VPS, Docker Compose containers

All services run on a single VPS under Docker Compose. No Kubernetes, no cloud-managed databases, no multi-region. This matches the single-user/self-hosted constraint and keeps monthly infra cost predictable.

### Frontend — React (or equivalent) / TypeScript

Single-page app with strict TypeScript, shared contracts from `packages/contracts`, design tokens from `packages/ui`, realtime updates via WebSocket or SSE from the API. Specific framework selected in P16-T001.

## Alternatives considered

| Alternative | Reason not chosen |
|---|---|
| Kafka instead of NATS | Over-engineered for single-node; higher ops burden; no advantage at this scale |
| Go instead of Rust for ingestion | Rust is preferred for zero-cost abstractions and memory safety without GC in hot path |
| Node.js instead of Bun | Slower startup; Bun's TypeScript-native tooling reduces build steps |
| SQLite instead of Postgres | Limited vector support; less flexible for concurrent readers/writers |
| TimescaleDB instead of ClickHouse | ClickHouse is more efficient for columnar time-series scans at this event volume |
| Anthropic API (per-token) for runtime LLM | Incompatible with €10–30/month flat-cost target; Claude subscriptions do not issue API keys for app embedding |
| C/Zig FFI kernels in Rust for P00–P30 | Deferred: pure-Rust baseline covers MVP performance; FFI adds complexity and platform-specific build steps |

## Consequences

- The pure-Rust baseline must be sufficient for MVP market data volumes. If throughput proves insufficient at post-MVP scale, FFI optimization (D11 in the deferred backlog) is the upgrade path — not a mid-phase rewrite.
- The provider-agnostic LLM abstraction (P13-T002) must be designed to accept any OpenAI-compatible endpoint so Ollama Cloud model choices can be updated without service changes.
- Ollama Cloud model IDs (`kimi-k2.6:cloud` or equivalent) must be confirmed against the live catalog at P13 before hardcoding — model naming conventions may differ.
- Docker Compose single-node means no automatic failover. This is acceptable for a self-hosted single-user tool.
- pgvector extension availability must be verified at P04 migration time (base Postgres image may need to be `pgvector/pgvector:pg16` or similar).
