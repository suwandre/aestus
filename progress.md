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
- Checks: .gitignore already covers .env / .env.* with !.env.example exception; no secrets in any example file; all required vars documented per credentials.md and ADR-001 stack (Postgres, Redis, NATS, ClickHouse, Ollama Cloud, optional on-chain/push)
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
- Checks: `bun run format` runs Prettier over TS/MD/JSON and cargo fmt over Rust workspace; `bun run format:check` passes clean; fixtures/ and *.generated.* excluded via .prettierignore; rustfmt.toml uses stable-only options (nightly-only imports_granularity/group_imports removed)
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
