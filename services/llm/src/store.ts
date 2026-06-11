/**
 * Briefing persistence (P13-T001 skeleton; Postgres store in T010).
 *
 * Storage is behind a small interface: an in-memory store backs fixture-first
 * dev/tests (hard rule #5) and a Postgres store backs real deployments (T010).
 * The full {@link Briefing} is stored — including cost metadata — so the
 * briefing detail can show model/cost/observability data without recomputation.
 */
import type { Briefing } from "@aestus/contracts";

export interface BriefingStore {
  /** Durably store a briefing. Idempotent on `briefing.id`. */
  save(briefing: Briefing): Promise<void>;
  /** Retrieve a stored briefing by id, or undefined if absent. */
  get(id: string): Promise<Briefing | undefined>;
  /** Most-recent briefings for a context packet (newest first). */
  byPacket(contextPacketId: string): Promise<Briefing[]>;
  /** Release any underlying resources (no-op for in-memory). */
  close(): Promise<void>;
}

/** In-memory {@link BriefingStore} for fixture-first dev and tests. */
export class InMemoryBriefingStore implements BriefingStore {
  private readonly briefings = new Map<string, Briefing>();

  async save(briefing: Briefing): Promise<void> {
    // Deep-clone so a later mutation of the caller's object can't rewrite history.
    this.briefings.set(briefing.id, structuredClone(briefing));
  }

  async get(id: string): Promise<Briefing | undefined> {
    const stored = this.briefings.get(id);
    return stored ? structuredClone(stored) : undefined;
  }

  async byPacket(contextPacketId: string): Promise<Briefing[]> {
    return [...this.briefings.values()]
      .filter((b) => b.context_packet_id === contextPacketId)
      .sort((a, b) => b.generated_at.localeCompare(a.generated_at))
      .map((b) => structuredClone(b));
  }

  async close(): Promise<void> {
    this.briefings.clear();
  }

  /** Number of stored briefings (test helper). */
  size(): number {
    return this.briefings.size;
  }
}
