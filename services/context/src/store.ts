/**
 * Context-packet persistence (P11-T010).
 *
 * The full assembled packet is stored before it is published to the LLM
 * orchestration layer, so a briefing can be reproduced later even if live
 * market/news/macro/on-chain state has since moved (done-when). Storage is
 * behind a small interface: an in-memory store backs fixture-first dev/tests
 * (hard rule #5) and a Postgres store backs real deployments. Both persist the
 * *complete* `ContextPacket` snapshot — including sections added after the
 * original `context_packets` schema (venue_comparison, source_freshness) — so
 * reproduction is lossless regardless of how the normalized columns evolve.
 */
import type { ContextPacket } from "@aestus/contracts";

export interface PacketStore {
  /** Durably store the full packet snapshot. Idempotent on `packet.id`. */
  save(packet: ContextPacket): Promise<void>;
  /** Retrieve a previously stored packet by id, or undefined if absent. */
  get(id: string): Promise<ContextPacket | undefined>;
  /** Release any underlying resources (no-op for in-memory). */
  close(): Promise<void>;
}

/** In-memory {@link PacketStore} for fixture-first dev and tests. */
export class InMemoryPacketStore implements PacketStore {
  private readonly packets = new Map<string, ContextPacket>();

  async save(packet: ContextPacket): Promise<void> {
    // Deep-clone so a later mutation of the caller's object can't rewrite history.
    this.packets.set(packet.id, structuredClone(packet));
  }

  async get(id: string): Promise<ContextPacket | undefined> {
    const stored = this.packets.get(id);
    return stored ? structuredClone(stored) : undefined;
  }

  async close(): Promise<void> {
    this.packets.clear();
  }

  /** Number of stored packets (test helper). */
  size(): number {
    return this.packets.size;
  }
}
