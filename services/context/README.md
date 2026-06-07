# services/context

TypeScript/Bun context assembly service. Consumes anomaly events, queries
market/news/macro/on-chain data, and emits rich context packets for the
LLM briefing pipeline.

Owned by: context agents (P11).
Consumes: `anomaly.detected` NATS stream.
Publishes: `context.packet` NATS stream.
Reads from: Redis, Postgres, ClickHouse.
