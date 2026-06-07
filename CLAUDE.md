# Aestus — Agent Guardrails

Self-hosted, single-user, crypto-primary decision-support cockpit. **Not a trading bot.**

## Source of truth (read before inventing anything)

- `docs/specs/cockpit_spec.md` — product/system spec
- `docs/specs/cockpit_ui_implementation.md` — presentation-layer contract
- `docs/specs/cockpit_agentic_build_todo.md` — task backlog (P00–P30)
- `docs/specs/cockpit.html` — pixel-level UI reference

Naming: product/brand = **Aestus**; "Cockpit" = main dashboard tab + concept ("cockpit, not autopilot"). Do not global-rename either direction.

## Hard rules (never violate)

1. No automated order placement, no trading API keys, no order execution, no position-closing logic.
2. The LLM never invents price levels. Entry, invalidation, target, sizing, risk numbers come from deterministic code only.
3. Briefings are proposals with reasoning (including no-trade). Never commands.
4. Every user decision (act, skip, snooze, dismiss, watch) is logged with its informing context.
5. Fixture-first development — frontend/backend must work without live providers or LLM secrets.
6. Single-user, self-hosted. No multi-tenant abstractions unless trivial.
7. Keep cost visible; stay compatible with the €10–30/month target.
8. When a task changes a contract: update shared schemas, fixtures, API docs, and frontend types together.
9. Update docs/tests/fixtures/acceptance notes when relevant.
10. No scope expansion. If a task seems to require it, mark the task `[!]` and log why.

## Working protocol

- One task ID at a time, in order, within the assigned phase.
- Before each task: read the relevant section of `progress.md` and `git log --oneline -15` for files you will touch — prior tasks may contain decisions/addendums that bind you.
- After each task: flip its checkbox `[ ]` → `[x]` in the todo, append a `progress.md` entry (task ID, files changed, checks run, assumptions, follow-ups), commit (conventional commit, include todo + progress.md changes in the same commit).
- Blocked or needs a human decision: mark `[!]`, log the reason in `progress.md`, commit, stop.
- Never edit `metrics.csv` (runner-owned).
