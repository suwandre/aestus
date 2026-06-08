import { z } from "zod/v4";
import { decodeEvent, encodeEvent } from "./codec";
import { subjectMatches } from "./subject";
import {
  type EventBus,
  type EventHandler,
  type PublishOptions,
  type RequestHandler,
  type Subscription,
  type SubscribeOptions,
} from "./types";

interface MemSub {
  pattern: string;
  deliver: (subject: string, bytes: Uint8Array) => Promise<void>;
}

interface MemResponder {
  pattern: string;
  respond: (bytes: Uint8Array) => Promise<Uint8Array>;
}

/**
 * In-memory {@link EventBus} for fixture-first development and tests. Messages
 * are encoded and decoded through the same codec as the NATS bus, so contract
 * validation is exercised identically — only the transport differs (no server).
 */
export class InMemoryBus implements EventBus {
  private subs: MemSub[] = [];
  private responders: MemResponder[] = [];

  async publish<T>(
    subject: string,
    payload: T,
    schema: z.ZodType<T>,
    options: PublishOptions,
  ): Promise<void> {
    const { bytes } = encodeEvent(payload, schema, options);
    const targets = this.subs.filter((s) => subjectMatches(s.pattern, subject));
    await Promise.all(targets.map((s) => s.deliver(subject, bytes)));
  }

  async subscribe<T>(
    subject: string,
    schema: z.ZodType<T>,
    handler: EventHandler<T>,
    options?: SubscribeOptions,
  ): Promise<Subscription> {
    const sub: MemSub = {
      pattern: subject,
      deliver: async (deliveredSubject, bytes) => {
        try {
          const { payload, envelope } = decodeEvent(bytes, schema);
          await handler(payload, envelope);
        } catch (error) {
          if (options?.onError) options.onError(error, bytes, deliveredSubject);
          else throw error;
        }
      },
    };
    this.subs.push(sub);
    return {
      unsubscribe: async () => {
        this.subs = this.subs.filter((s) => s !== sub);
      },
    };
  }

  async respond<TReq, TRes>(
    subject: string,
    requestSchema: z.ZodType<TReq>,
    responseSchema: z.ZodType<TRes>,
    handler: RequestHandler<TReq, TRes>,
    options: PublishOptions,
  ): Promise<Subscription> {
    const responder: MemResponder = {
      pattern: subject,
      respond: async (bytes) => {
        const { payload, envelope } = decodeEvent(bytes, requestSchema);
        const result = await handler(payload, envelope);
        const reply = encodeEvent(result, responseSchema, {
          ...options,
          trace_id: envelope.trace_id,
        });
        return reply.bytes;
      },
    };
    this.responders.push(responder);
    return {
      unsubscribe: async () => {
        this.responders = this.responders.filter((r) => r !== responder);
      },
    };
  }

  async request<TReq, TRes>(
    subject: string,
    payload: TReq,
    requestSchema: z.ZodType<TReq>,
    responseSchema: z.ZodType<TRes>,
    options: PublishOptions,
  ): Promise<{ payload: TRes; envelope: import("@aestus/contracts").EventEnvelope }> {
    const responder = this.responders.find((r) => subjectMatches(r.pattern, subject));
    if (!responder) throw new Error(`no responder registered for subject '${subject}'`);
    const { bytes } = encodeEvent(payload, requestSchema, options);
    const replyBytes = await responder.respond(bytes);
    return decodeEvent(replyBytes, responseSchema);
  }

  async close(): Promise<void> {
    this.subs = [];
    this.responders = [];
  }
}
