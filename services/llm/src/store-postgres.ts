/**
 * Postgres-backed {@link BriefingStore} (P13-T010).
 *
 * Uses Bun's built-in SQL client (same driver as the migration runner; no extra
 * dependency). `save` upserts the briefing's scalar/array columns — including
 * cost metadata (hard rule #7) and the cache-hit flag — plus the full `snapshot`
 * JSONB (migration 0013) so a briefing reproduces losslessly regardless of how
 * the normalized columns evolve. `get`/`byPacket` read the `snapshot` column and
 * re-validate it through the contract. This path runs only when `DATABASE_URL`
 * is set; fixture-first dev/CI uses {@link InMemoryBriefingStore} instead.
 */
import { SQL } from "bun";
import { type Briefing, Briefing as BriefingSchema } from "@aestus/contracts";
import type { BriefingStore } from "./store";

/** Render a string list as a Postgres array literal, e.g. ["a","b"] -> {"a","b"}. */
function pgTextArray(values: string[]): string {
  return `{${values.map((v) => `"${v.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`).join(",")}}`;
}

/** Render a number list as a Postgres array literal, e.g. [1,2] -> {1,2}. */
function pgFloatArray(values: number[]): string {
  return `{${values.join(",")}}`;
}

export class PostgresBriefingStore implements BriefingStore {
  private readonly sql: SQL;

  constructor(databaseUrl: string) {
    this.sql = new SQL(databaseUrl);
  }

  async save(b: Briefing): Promise<void> {
    await this.sql`
      INSERT INTO briefings (
        id, schema_version, context_packet_id, generated_at, stance, thesis,
        factors, invalidation_reasoning, confidence_reasoning, recheck_condition,
        entry_zone, invalidation, targets, size_suggestion, timeframe, confidence,
        model, supporting_context,
        cost_provider, cost_model, cost_prompt_tokens, cost_completion_tokens,
        cost_total_tokens, cost_usd, cache_hit, snapshot
      ) VALUES (
        ${b.id}, ${b.schema_version}, ${b.context_packet_id}, ${b.generated_at},
        ${b.stance}::stance, ${b.thesis},
        ${pgTextArray(b.factors)}::text[], ${b.invalidation_reasoning ?? null},
        ${b.confidence_reasoning ?? null}, ${b.recheck_condition ?? null},
        ${b.entry_zone ? JSON.stringify(b.entry_zone) : null}::jsonb, ${b.invalidation},
        ${pgFloatArray(b.targets)}::double precision[],
        ${b.size_suggestion ? JSON.stringify(b.size_suggestion) : null}::jsonb,
        ${b.timeframe}, ${b.confidence}, ${b.model}, ${pgTextArray(b.supporting_context)}::text[],
        ${b.cost_metadata.provider}, ${b.cost_metadata.model}, ${b.cost_metadata.prompt_tokens},
        ${b.cost_metadata.completion_tokens}, ${b.cost_metadata.total_tokens}, ${b.cost_metadata.cost_usd},
        ${b.cache_hit}, ${JSON.stringify(b)}::jsonb
      )
      ON CONFLICT (id) DO UPDATE SET
        schema_version = EXCLUDED.schema_version,
        context_packet_id = EXCLUDED.context_packet_id,
        generated_at = EXCLUDED.generated_at,
        stance = EXCLUDED.stance,
        thesis = EXCLUDED.thesis,
        factors = EXCLUDED.factors,
        invalidation_reasoning = EXCLUDED.invalidation_reasoning,
        confidence_reasoning = EXCLUDED.confidence_reasoning,
        recheck_condition = EXCLUDED.recheck_condition,
        entry_zone = EXCLUDED.entry_zone,
        invalidation = EXCLUDED.invalidation,
        targets = EXCLUDED.targets,
        size_suggestion = EXCLUDED.size_suggestion,
        timeframe = EXCLUDED.timeframe,
        confidence = EXCLUDED.confidence,
        model = EXCLUDED.model,
        supporting_context = EXCLUDED.supporting_context,
        cost_provider = EXCLUDED.cost_provider,
        cost_model = EXCLUDED.cost_model,
        cost_prompt_tokens = EXCLUDED.cost_prompt_tokens,
        cost_completion_tokens = EXCLUDED.cost_completion_tokens,
        cost_total_tokens = EXCLUDED.cost_total_tokens,
        cost_usd = EXCLUDED.cost_usd,
        cache_hit = EXCLUDED.cache_hit,
        snapshot = EXCLUDED.snapshot
    `;
  }

  async get(id: string): Promise<Briefing | undefined> {
    const rows = (await this.sql`
      SELECT snapshot FROM briefings WHERE id = ${id}
    `) as Array<{ snapshot: unknown }>;
    if (rows.length === 0) return undefined;
    return BriefingSchema.parse(rows[0]!.snapshot);
  }

  async byPacket(contextPacketId: string): Promise<Briefing[]> {
    const rows = (await this.sql`
      SELECT snapshot FROM briefings
      WHERE context_packet_id = ${contextPacketId}
      ORDER BY generated_at DESC
    `) as Array<{ snapshot: unknown }>;
    return rows.map((r) => BriefingSchema.parse(r.snapshot));
  }

  async close(): Promise<void> {
    await this.sql.end();
  }
}
