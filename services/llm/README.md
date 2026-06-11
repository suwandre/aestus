# services/llm

TypeScript/Bun LLM orchestration service. Consumes assembled context packets,
drafts grounded briefings (proposals with reasoning, never commands), and emits
them for the API/UI/notifications — while tracking model, token usage, and cost.

The LLM supplies **narrative only**. Every numeric price level (entry,
invalidation, targets, sizing) is copied verbatim from the context packet's
deterministic levels (hard rule #2); the model may explain or select among them
but never invents a number. See `docs/llm_boundaries.md`.

Owned by: LLM agents (P13).
Consumes: `context.packet` NATS stream.
Publishes: `briefing.generated` NATS stream.
Providers: Ollama Cloud (Kimi K2.6 for briefings, MiniMax M3 for extraction);
a deterministic fake provider backs fixture-first dev/tests with no secrets.
