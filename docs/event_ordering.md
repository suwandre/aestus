# Event Ordering Assumptions

What you may and may **not** assume about the order and timing of events on the
Aestus backbone (P05-T010). Read this before writing any logic that compares
timestamps, sequences, or joins events from different feeds — most "ordering"
bugs come from assuming a global order that does not exist.

## The three timestamps

Every event carries up to three distinct notions of time. They are **not**
interchangeable and are **not** on the same clock.

| Field                | Where                                      | Clock                  | Meaning                                 |
| -------------------- | ------------------------------------------ | ---------------------- | --------------------------------------- |
| `provider_timestamp` | `RawMarketEvent` (optional)                | the provider's clock   | when the source says the event happened |
| `received_at`        | `RawMarketEvent`                           | Aestus ingestion clock | when we received the message            |
| `emitted_at`         | every `EventEnvelope`                      | the producer's clock   | when our producer emitted the envelope  |
| `timestamp`          | `NormalizedMarketEvent`, `FeatureSnapshot` | derived (see below)    | the event time used downstream          |

`provider_timestamp` is **optional** — some feeds omit it, and when present it
may be skewed, coarse, or occasionally non-monotonic. `received_at` is always
present but reflects our network path (jitter, buffering, reconnects), not the
true event order at the source. `emitted_at` is for tracing/observability, never
for business ordering.

Normalization picks the event `timestamp` as `provider_timestamp ?? received_at`.
Treat it as a best-effort event time, not ground truth.

## `sequence`

`RawMarketEvent.sequence` (and the optional `NormalizedMarketEvent.sequence`) is
a **monotonic-per-source** ordering token — an exchange sequence number, or a
local counter on a single connection.

- Monotonic **only within one `source`** (one feed/connection). It is **not**
  global, **not** comparable across venues, and **not** comparable across two
  connections to the same venue (e.g. after a reconnect, or a primary/backup).
- A gap in `sequence` means missed messages; equal/duplicate sequences can occur
  across reconnects. Dedup by `event_id`, not by sequence alone.

## What you MAY assume

- **Within a single `source` + subject**, events keep their relative order, and
  `sequence` is monotonic (modulo gaps from drops).
- **JetStream per-stream order**: messages in one stream have a monotonic stream
  sequence in storage. This is _delivery/storage_ order, not event-time order.
- `event_id` is unique per event → safe idempotency/dedup key.
- `trace_id` correlates an event with everything derived from it across stages.

## What you must NOT assume

- **No global total order.** There is no single timeline across assets, venues,
  or streams. Do not sort a merged multi-source set by time and treat ties as
  meaningful.
- **No cross-provider clock alignment.** Two providers' `provider_timestamp`
  values are on different clocks. Never join feeds by exact timestamp equality;
  never infer "A happened before B" across providers from raw timestamps.
- **No ordering across NATS subjects.** Core NATS gives no ordering guarantee
  between different subjects; even within a stream, redelivery after a `nack`
  and multiple interleaved publishers can reorder relative to event time.
- **No guarantee `received_at` matches source order.** Network jitter and
  reconnect/backfill can deliver older events after newer ones.
- **No exactly-once, in-order delivery.** Assume at-least-once and possibly
  out-of-order; consumers must be idempotent.

## Practical rules for consumers

1. **Dedup by `event_id`.** Replays (P05-T007), JetStream redelivery, and feed
   reconnects all produce duplicates.
2. **Order within a key, not globally.** Order per `(canonical_asset_id, source)`
   using `(timestamp, sequence)`; never across keys.
3. **Join with windows, not equality.** Correlate cross-provider events using a
   tolerance window on event time, never `==` on timestamps.
4. **Tolerate gaps and late arrivals.** Sequence gaps = dropped messages; an
   event with an older `timestamp` may arrive after a newer one. Use
   watermarks/grace windows rather than assuming completeness at a point in time.
5. **Keep derivations per-asset and monotonic-aware.** Feature/anomaly logic
   computes per `canonical_asset_id` and must not assume a globally consistent
   ordering of inputs from different sources.

When in doubt: if a piece of logic only works because two different providers'
clocks agree, or because events from different subjects arrive in a particular
order, it is wrong — rewrite it to be order-independent or window-based.
