# Aestus

Self-hosted, single-user, crypto-primary decision-support cockpit. **Not a trading bot.**

## Source of truth

These files are the binding product and implementation contracts. Read them before implementing anything.

| File | Purpose |
|------|---------|
| [`docs/specs/cockpit_spec.md`](docs/specs/cockpit_spec.md) | Product and system specification — what the system is, data model, pipeline, behavior |
| [`docs/specs/cockpit_ui_implementation.md`](docs/specs/cockpit_ui_implementation.md) | Presentation-layer contract — layout, tokens, components, interaction spec |
| [`docs/specs/cockpit_agentic_build_todo.md`](docs/specs/cockpit_agentic_build_todo.md) | Agentic task backlog — every build task, phase routing, done-when criteria |
| [`docs/specs/cockpit.html`](docs/specs/cockpit.html) | Pixel-level UI reference — canonical visual target for the Cockpit tab |

## Documentation index

| File | Purpose |
|------|---------|
| [`docs/principles.md`](docs/principles.md) | Core implementation principles (cockpit not autopilot, deterministic levels, etc.) |
| [`docs/non_goals.md`](docs/non_goals.md) | Explicit non-goals and out-of-scope items for MVP |
| [`docs/glossary.md`](docs/glossary.md) | Term definitions used across specs and code |
| [`docs/mvp_scope.md`](docs/mvp_scope.md) | MVP boundary — what is in, what is deferred |
| [`docs/agent_handoff.md`](docs/agent_handoff.md) | Protocol for agentic build loop task execution |
| [`docs/adr/`](docs/adr/) | Architecture decision records |

## Hard rules

1. No automated order placement, trading API keys, order execution, or position-closing logic — ever.
2. The LLM never invents price levels. All numeric levels come from deterministic code.
3. Briefings are proposals with reasoning. They are not commands.
4. Every user decision is logged with its informing context.
5. Fixture-first: frontend and backend must work without live providers or LLM secrets.
