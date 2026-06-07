# services/ingestion

Rust service that connects to exchange WebSocket/REST feeds and publishes
raw + normalized market events to NATS JetStream.

Owned by: ingestion agents (P06).
Publishes to: `raw.market`, `normalized.market` NATS streams.
Maintains: latest hot state in Redis.
