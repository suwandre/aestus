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

### P00-T002 — Create implementation principles doc
- Files: docs/principles.md (new)
- Checks: Verified doc covers all six required topics from task spec: cockpit not autopilot, context over raw signal, no-trade is valid, deterministic levels, LLM narrative only, single-user/self-hosted/low-cost; no new product scope added
- Assumptions: File authored by interrupted prior worker; content reviewed as meeting done-when criteria
- Follow-ups: none
