# Aestus — Implementation Principles

These principles are distilled from `docs/specs/cockpit_spec.md` and `docs/specs/cockpit_ui_implementation.md`. They exist to keep every implementation decision aligned with the product's core purpose. They do not add scope — they constrain it.

---

## 1. Cockpit, not autopilot

The system surfaces opportunities and explains them. The human decides and executes. Automated order execution is explicitly out of scope. No trading API keys, no order submission, no position-closing logic — in MVP and in all subsequent phases unless a separate, explicit decision is made and documented.

The UI is called the "Cockpit" precisely because a cockpit gives the pilot full information and control — it does not fly the plane for them.

## 2. Context over raw signals

A raw alert ("funding spiked") is low value. The value is the assembled context around it: what else is happening, what is correlated, what news preceded it, what macro event is imminent, what the historical analogues looked like. Every alert must be backed by a context packet before the LLM touches it.

## 3. Honesty about edge — no-trade is a valid output

The system is expected to frequently conclude "no trade." A well-reasoned no-trade recommendation is as valuable as a setup. The briefing schema must support it as a first-class stance. The UI must present it without making the user feel the system failed.

## 4. Deterministic levels — the LLM narrates, never invents numbers

Entry zones, invalidation levels, targets, and sizing guidance must come from deterministic code (ATR, swing structure, liquidation clusters, volatility bands). The LLM may choose among provided candidates, explain them, and assess confidence — but may never invent a price level that was not provided by the level engine. This constraint must be enforced both in the prompt and in post-generation validation.

## 5. LLM as narrative layer only

The LLM's role is synthesis and explanation. It does not compute statistics, query databases, or run rules. All numbers, features, and anomaly classifications flow from deterministic code. The LLM receives a structured, validated context packet and returns structured, validated text.

## 6. Single-user, self-hosted, low-cost

The system is built for one person running it themselves. No multi-tenant abstractions, no auth systems designed for user onboarding, no SaaS infrastructure. The entire running cost must stay compatible with the €10–30/month target. Every data provider, model, and infra choice must be evaluated against this constraint.

## 7. Fixture-first development

Every service and component must be functional using local fixtures before live providers are connected. Agents should be able to build, test, and review any part of the system without API keys, WebSocket connections, or a running LLM. Fixtures are not test scaffolding — they are a first-class development mode.

## 8. A learning loop — decisions are data

Every decision the user makes (act, skip, snooze, dismiss) is recorded with the full context that informed it, the eventual outcome, and enough metadata to later ask "which signal classes and regimes actually produced profit for this user." The journal and analytics tabs are not optional features; they are how the system earns long-term trust.

## 9. Earned automation — not a starting assumption

Individual well-validated strategies may eventually be automated in a narrow, bounded way — but only after months of manual use demonstrate that a given signal class is reliable for this user. The architecture should make this possible later. It must not be assumed now.

## 10. Contracts first, implementations second

Shared data shapes (event schemas, API types, database schemas) must be defined and agreed before services implement them. When a task changes a contract, the schema, fixtures, API docs, and frontend types must all update in the same commit.
