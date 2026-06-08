import { z } from "zod/v4";
import { decodeEvent, encodeEvent } from "./codec";
import {
  type EventBus,
  type EventHandler,
  type PublishOptions,
  type RequestHandler,
  type Subscription,
  type SubscribeOptions,
} from "./types";

/**
 * Minimal structural typing for the parts of the `nats` client we use. Defined
 * locally (rather than importing `nats` types) so this package type-checks even
 * when `nats` is not installed — fixture-first dev/tests use {@link InMemoryBus}
 * and never load the driver. `nats` is a runtime dependency loaded lazily.
 */
interface NatsMsg {
  subject: string;
  data: Uint8Array;
  respond(data: Uint8Array): boolean;
}
interface NatsSub extends AsyncIterable<NatsMsg> {
  unsubscribe(): void;
}
interface NatsConnection {
  publish(subject: string, data: Uint8Array): void;
  subscribe(subject: string): NatsSub;
  request(subject: string, data: Uint8Array, opts: { timeout: number }): Promise<NatsMsg>;
  drain(): Promise<void>;
}
interface NatsModule {
  connect(opts: { servers: string | string[] }): Promise<NatsConnection>;
}

/** Lazily import the `nats` driver (a runtime-only dependency). */
async function loadNats(): Promise<NatsModule> {
  // Variable specifier keeps TS/bundlers from statically resolving `nats`,
  // so the package builds without the driver present.
  const specifier = "nats";
  return (await import(specifier)) as NatsModule;
}

/**
 * NATS-backed {@link EventBus} for runtime use. Shares the codec (and therefore
 * the exact contract validation) with {@link InMemoryBus}.
 */
export class NatsBus implements EventBus {
  private constructor(private readonly nc: NatsConnection) {}

  /** Connect to NATS (e.g. `nats://127.0.0.1:4222`). */
  static async connect(servers: string | string[]): Promise<NatsBus> {
    const { connect } = await loadNats();
    const nc = await connect({ servers });
    return new NatsBus(nc);
  }

  async publish<T>(
    subject: string,
    payload: T,
    schema: z.ZodType<T>,
    options: PublishOptions,
  ): Promise<void> {
    const { bytes } = encodeEvent(payload, schema, options);
    this.nc.publish(subject, bytes);
  }

  async subscribe<T>(
    subject: string,
    schema: z.ZodType<T>,
    handler: EventHandler<T>,
    options?: SubscribeOptions,
  ): Promise<Subscription> {
    const sub = this.nc.subscribe(subject);
    // Drain the subscription's async iterator in the background.
    void (async () => {
      for await (const msg of sub) {
        try {
          const { payload, envelope } = decodeEvent(msg.data, schema);
          await handler(payload, envelope);
        } catch (error) {
          if (options?.onError) options.onError(error, msg.data, msg.subject);
          else throw error;
        }
      }
    })();
    return { unsubscribe: async () => sub.unsubscribe() };
  }

  async respond<TReq, TRes>(
    subject: string,
    requestSchema: z.ZodType<TReq>,
    responseSchema: z.ZodType<TRes>,
    handler: RequestHandler<TReq, TRes>,
    options: PublishOptions,
  ): Promise<Subscription> {
    const sub = this.nc.subscribe(subject);
    void (async () => {
      for await (const msg of sub) {
        const { payload, envelope } = decodeEvent(msg.data, requestSchema);
        const result = await handler(payload, envelope);
        const reply = encodeEvent(result, responseSchema, {
          ...options,
          trace_id: envelope.trace_id,
        });
        msg.respond(reply.bytes);
      }
    })();
    return { unsubscribe: async () => sub.unsubscribe() };
  }

  async request<TReq, TRes>(
    subject: string,
    payload: TReq,
    requestSchema: z.ZodType<TReq>,
    responseSchema: z.ZodType<TRes>,
    options: PublishOptions & { timeoutMs?: number },
  ): Promise<{ payload: TRes; envelope: import("@aestus/contracts").EventEnvelope }> {
    const { bytes } = encodeEvent(payload, requestSchema, options);
    const msg = await this.nc.request(subject, bytes, { timeout: options.timeoutMs ?? 5000 });
    return decodeEvent(msg.data, responseSchema);
  }

  async close(): Promise<void> {
    await this.nc.drain();
  }
}
