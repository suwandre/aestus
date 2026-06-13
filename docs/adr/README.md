# Architecture Decision Records

Every major infrastructure, provider, or cross-cutting implementation choice that is not obvious from the spec gets a short ADR here. ADRs are immutable once accepted — if a decision changes, write a new ADR that supersedes the old one.

## When to write an ADR

Write an ADR when a task involves choosing between non-trivial alternatives for:

- Infrastructure components (message bus, cache, database engine, storage format)
- External providers (exchanges, data feeds, LLM providers, news sources, on-chain APIs)
- Cross-service contracts (wire format, serialization, protocol)
- Significant deviations from the spec defaults or the non-goals doc

Do NOT write an ADR for implementation details (function signatures, library versions, folder layout) — those belong in code or inline comments.

## Template

```markdown
# ADR-NNN — <Short title>

- Status: accepted | superseded by ADR-XXX | deprecated
- Date: YYYY-MM-DD
- Task: <task ID that prompted this decision>

## Context

<One paragraph: what problem are we solving, what constraints apply.>

## Decision

<What we chose and the key reasons.>

## Alternatives considered

<What else was evaluated and why it was not chosen.>

## Consequences

<What this decision enables, what it forecloses, what must be monitored.>
```

## Index

| ADR                         | Title                | Status   |
| --------------------------- | -------------------- | -------- |
| [ADR-001](ADR-001-stack.md) | Core stack selection        | accepted |
| [ADR-002](ADR-002-realtime-transport.md) | Realtime transport: SSE | accepted |
