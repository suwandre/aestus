/**
 * Briefing cache policy (P13-T012).
 *
 * A duplicate anomaly (same asset + same deterministic decision inputs) arriving
 * within a cooldown must not trigger a fresh LLM call — that is wasted spend
 * against the €10–30/month envelope (hard rule #7). The cache keys on a
 * *material* signature of the packet: if the levels, no-trade flag, anomaly
 * type/severity, asset, or quality band change, the signature changes and the
 * briefing is regenerated ("unless context materially changes"). Cosmetic
 * differences (packet id, timestamp, exact scores) do not bust the cache.
 *
 * In-memory + per-process: dedup is a cost optimization, not a correctness
 * guarantee, so it need not survive a restart.
 */
import type { ContextPacket } from "@aestus/contracts";

/**
 * A stable signature of the material decision inputs. Two packets with the same
 * signature would produce an equivalent briefing, so the second is redundant.
 */
export function briefingSignature(packet: ContextPacket): string {
  const l = packet.deterministic_levels;
  return JSON.stringify({
    asset: packet.primary_asset,
    anomaly_type: packet.trigger.type,
    severity: packet.trigger.severity,
    direction: l.direction,
    entry_zone: l.entry_zone,
    invalidation: l.invalidation,
    targets: l.targets,
    no_trade: l.no_trade?.is_no_trade ?? false,
    quality: packet.quality.label,
  });
}

/** Tracks recently-generated signatures so duplicates within a cooldown are skipped. */
export class BriefingCache {
  private readonly seen = new Map<string, number>();

  constructor(private readonly cooldownMs: number) {}

  /** True when no equivalent briefing was generated within the cooldown. */
  shouldGenerate(signature: string, nowMs: number): boolean {
    const last = this.seen.get(signature);
    return last === undefined || nowMs - last >= this.cooldownMs;
  }

  /** Record that a briefing was generated for `signature` at `nowMs`. */
  record(signature: string, nowMs: number): void {
    this.seen.set(signature, nowMs);
  }
}
