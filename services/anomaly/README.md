# anomaly — Aestus anomaly detection engine (P10)

Deterministic anomaly detection. Consumes feature snapshots
(`feature.snapshot.>`) and contextual events (`context.packet.>`: macro / news /
on-chain), runs rule + statistical detectors, and publishes `anomaly.detected`
events for the context builder, API, alerts, and UI.

**No LLM, no order placement.** Every anomaly comes from deterministic code. The
LLM never participates in detection (spec §100).

## Run

```bash
# Fixture mode (no NATS): loads repo fixtures, runs one eval pass in-memory.
cargo run -p anomaly

# Live mode: subscribe to NATS and persist.
NATS_URL=nats://127.0.0.1:4222 cargo run -p anomaly
```

## Config (env)

| Var | Default | Purpose |
| --- | --- | --- |
| `NATS_URL` | _unset_ | NATS server; unset → fixture mode |
| `ANOMALY_PORT` | `8083` | health HTTP port (`/health`) |
| `ANOMALY_EVAL_INTERVAL_SECS` | `30` | detection pass cadence |
| `HEARTBEAT_INTERVAL_MS` | `10000` | `system.health.anomaly` cadence |
| `REDIS_URL` / `CLICKHOUSE_URL` / `POSTGRES_URL` | _unset_ | persistence sinks (no-op when unset) |

See `docs/anomaly_detection.md` for per-detector logic, thresholds, and edge
cases.
