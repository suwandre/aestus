# packages/event-bus

Contract-validated TypeScript client for the NATS event backbone (P05-T004).
Wraps every payload in the shared `EventEnvelope` and validates it against a
`@aestus/contracts` Zod schema on both publish and receive.

Two interchangeable implementations of the same `EventBus` interface:

- **`InMemoryBus`** — fixture-first dev and tests; no NATS server required. Still
  encodes/decodes through the same codec, so validation behaves identically.
- **`NatsBus`** — runtime, backed by the `nats` driver (lazily loaded).

```ts
import { InMemoryBus, NatsBus } from "@aestus/event-bus";
import { RawMarketEvent, PAYLOAD_TYPES, subject, RAW_MARKET } from "@aestus/contracts";

const bus = await NatsBus.connect("nats://127.0.0.1:4222"); // or new InMemoryBus()

await bus.subscribe(subject(RAW_MARKET, "binance", "btc-usdt"), RawMarketEvent, (event, env) => {
  // `event` is a validated RawMarketEvent; `env` carries trace_id/source/etc.
});

await bus.publish(subject(RAW_MARKET, "binance", "btc-usdt"), payload, RawMarketEvent, {
  source: "ingestion",
  payload_type: PAYLOAD_TYPES.RawMarketEvent,
});
```

Patterns: `publish`/`subscribe` (fire-and-forget), `request`/`respond`
(request-reply). Decode/validation failures raise `ContractValidationError`,
surfaced to a per-subscription `onError` hook (the dead-letter path, P05-T006).

Owned by: event-backbone agents (P05). Imported by: API, context, and other
TypeScript services.
