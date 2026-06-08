# Event Streams & Subjects

The NATS JetStream topology that connects ingestion → features → anomalies →
context assembly → LLM briefings → API/UI, plus service health. This is the
**stable, documented** contract for stream and subject names (P05-T001).

## Source of truth

- **TypeScript:** `packages/contracts/src/streams.ts` — the canonical definitions,
  re-exported from `@aestus/contracts`.
- **Rust mirror:** `crates/event_model/src/streams.rs` — kept in sync by hand
  (no codegen between them yet; a divergence is a bug).

Every consumer — the stream-init script, the TS client helper, the Rust
publisher, the replay utility, the inspection CLI — derives names from these so
they never drift.

## Streams

JetStream stream names cannot contain `.`, `*`, `>`, or spaces, so each logical
stream has an `UPPER_SNAKE` name while the dotted form is its subject base. A
stream captures everything under its base via the `<base>.>` wildcard and also
binds the bare base for un-routed publishes.

| Stream               | Subject base         | Subjects                                     | Payload                 | Producer → Consumers                   |
| -------------------- | -------------------- | -------------------------------------------- | ----------------------- | -------------------------------------- |
| `RAW_MARKET`         | `raw.market`         | `raw.market`, `raw.market.>`                 | `RawMarketEvent`        | ingestion → normalizer, replay/archive |
| `NORMALIZED_MARKET`  | `normalized.market`  | `normalized.market`, `normalized.market.>`   | `NormalizedMarketEvent` | ingestion/normalizer → features, API   |
| `FEATURE_SNAPSHOT`   | `feature.snapshot`   | `feature.snapshot`, `feature.snapshot.>`     | `FeatureSnapshot`       | features → anomalies, context, API     |
| `ANOMALY_DETECTED`   | `anomaly.detected`   | `anomaly.detected`, `anomaly.detected.>`     | `AnomalyEvent`          | anomalies → context, API               |
| `CONTEXT_PACKET`     | `context.packet`     | `context.packet`, `context.packet.>`         | `ContextPacket`         | context → LLM briefing job, API        |
| `BRIEFING_GENERATED` | `briefing.generated` | `briefing.generated`, `briefing.generated.>` | `Briefing`              | LLM job → API/UI                       |
| `DECISION_LOGGED`    | `decision.logged`    | `decision.logged`, `decision.logged.>`       | `Decision`              | API → journal/storage, analytics       |
| `SYSTEM_HEALTH`      | `system.health`      | `system.health`, `system.health.>`           | `SystemHealth`          | every service → Data tab health view   |

`SystemHealth` is defined in P05-T009; the others reuse the P03 contracts.

## Initialization & reproducibility

Streams and durable consumers are created from a declarative topology
(`packages/event-bus/src/topology.ts`) by the idempotent init script. The setup
is fully reproducible after a JetStream reset:

```sh
make reset-local   # destroys volumes (NATS streams included)
make up            # start infra fresh
make nats-init     # recreate all streams + durable consumers
```

`make nats-init` (`bun run nats:init`) connects to `$NATS_URL`
(default `nats://127.0.0.1:4222`) and create-or-updates every stream and
consumer — safe to re-run. Use `bun run scripts/nats-init.ts --dry-run` to print
the planned topology without connecting. JetStream is the in-flight transport
buffer (short retention); ClickHouse/Postgres are the durable store.

## Subject token conventions

Producers append routing tokens after the base. Tokens are lowercased and
reduced to the NATS-safe charset (`a-z0-9_`) by `subject()` in both the TS and
Rust modules — never hand-build subjects, call the helper.

| Stream base          | Token shape                         | Example                                 |
| -------------------- | ----------------------------------- | --------------------------------------- |
| `raw.market`         | `<venue>.<symbol>`                  | `raw.market.binance.btc_usdt`           |
| `normalized.market`  | `<canonical_asset_id>.<event_type>` | `normalized.market.btc_usd.trade`       |
| `feature.snapshot`   | `<canonical_asset_id>.<timeframe>`  | `feature.snapshot.btc_usd.1m`           |
| `anomaly.detected`   | `<canonical_asset_id>.<kind>`       | `anomaly.detected.btc_usd.volume_spike` |
| `context.packet`     | `<canonical_asset_id>`              | `context.packet.btc_usd`                |
| `briefing.generated` | `<canonical_asset_id>`              | `briefing.generated.btc_usd`            |
| `decision.logged`    | `<decision_kind>`                   | `decision.logged.act`                   |
| `system.health`      | `<service_name>`                    | `system.health.ingestion`               |

Subscribers select with wildcards: a single asset is `normalized.market.btc_usd.>`;
the whole stream is `<base>.>`.

## Stability rules

- Stream names and subject **bases** are stable. Adding a routing token level is
  backward-compatible (existing `<base>.>` subscriptions keep matching). Removing
  or reordering token levels is a breaking change.
- Renaming a stream requires a migration: create the new stream, dual-publish,
  migrate consumers, then retire the old one.
- Payload evolution follows `docs/contracts_versioning.md` (the envelope carries
  `schema_version`).

## Dead-letter

Failed event handling routes to a dedicated `DLQ` stream (P05-T006) instead of
blocking the source stream. When a consumer cannot handle an event — decode
failure, contract-validation failure, or a throwing handler — the event is
re-published as a `DeadLetter` to `dlq.<original-subject>`:

| Stream | Subject base | Subjects       | Payload      |
| ------ | ------------ | -------------- | ------------ |
| `DLQ`  | `dlq`        | `dlq`, `dlq.>` | `DeadLetter` |

The original subject is preserved in the DLQ subject, so a monitor can filter by
origin (e.g. `dlq.raw.market.>`). A `DeadLetter` carries the original event
verbatim (UTF-8, so even non-JSON poison survives) plus `consumer`,
`error_type`, `error_message`, `failed_at`, and `attempts`.

In TypeScript, `makeDeadLetterHandler(bus, { consumer })` returns a subscription
`onError` hook that does this routing; the publish is fire-and-forget so a DLQ
failure cannot wedge the consumer. The `dlq-monitor` durable consumer is created
by `nats-init`.
