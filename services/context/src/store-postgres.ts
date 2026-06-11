/**
 * Postgres-backed {@link PacketStore} (P11-T010).
 *
 * Uses Bun's built-in SQL client (same driver as the migration runner; no extra
 * dependency). On `save` it upserts the packet's scalar columns plus the full
 * `snapshot` JSONB (added in migration 0012) and replaces the packet's list
 * items in `context_packet_items`. `trigger_anomaly_id` is left NULL — the full
 * trigger is snapshotted in `trigger`/`snapshot`, so the packet reproduces even
 * if the anomaly row is gone, and we avoid a FK violation when it never existed.
 * Reproduction reads the `snapshot` column, which carries every section
 * (including venue_comparison / source_freshness that the normalized columns
 * don't model). This path runs only when `DATABASE_URL` is set; fixture-first
 * dev/CI uses {@link InMemoryPacketStore} instead.
 */
import { SQL } from "bun";
import { type ContextPacket, ContextPacket as ContextPacketSchema } from "@aestus/contracts";
import type { PacketStore } from "./store";

/** ContextPacket list sections mapped to their `context_packet_item_type`. */
const ITEM_SECTIONS = [
  { type: "correlated_asset", items: (p: ContextPacket) => p.correlated_assets },
  { type: "news", items: (p: ContextPacket) => p.news },
  { type: "macro", items: (p: ContextPacket) => p.macro },
  { type: "on_chain", items: (p: ContextPacket) => p.on_chain },
  { type: "historical_analogue", items: (p: ContextPacket) => p.historical_analogues },
] as const;

export class PostgresPacketStore implements PacketStore {
  private readonly sql: SQL;

  constructor(databaseUrl: string) {
    this.sql = new SQL(databaseUrl);
  }

  async save(packet: ContextPacket): Promise<void> {
    await this.sql.begin(async (tx) => {
      await tx`
        INSERT INTO context_packets (
          id, schema_version, generated_at, primary_asset, trigger_anomaly_id,
          trigger, market_snapshot, deterministic_levels, snapshot
        ) VALUES (
          ${packet.id}, ${packet.schema_version}, ${packet.generated_at}, ${packet.primary_asset},
          NULL,
          ${JSON.stringify(packet.trigger)}::jsonb,
          ${JSON.stringify(packet.market_snapshot)}::jsonb,
          ${JSON.stringify(packet.deterministic_levels)}::jsonb,
          ${JSON.stringify(packet)}::jsonb
        )
        ON CONFLICT (id) DO UPDATE SET
          schema_version = EXCLUDED.schema_version,
          generated_at = EXCLUDED.generated_at,
          primary_asset = EXCLUDED.primary_asset,
          trigger = EXCLUDED.trigger,
          market_snapshot = EXCLUDED.market_snapshot,
          deterministic_levels = EXCLUDED.deterministic_levels,
          snapshot = EXCLUDED.snapshot
      `;
      // Rewrite the denormalized list items so a re-save is idempotent.
      await tx`DELETE FROM context_packet_items WHERE packet_id = ${packet.id}`;
      for (const section of ITEM_SECTIONS) {
        const items = section.items(packet);
        for (let position = 0; position < items.length; position++) {
          await tx`
            INSERT INTO context_packet_items (packet_id, item_type, position, payload)
            VALUES (${packet.id}, ${section.type}, ${position}, ${JSON.stringify(items[position])}::jsonb)
          `;
        }
      }
    });
  }

  async get(id: string): Promise<ContextPacket | undefined> {
    const rows = (await this.sql`
      SELECT snapshot FROM context_packets WHERE id = ${id}
    `) as Array<{ snapshot: unknown }>;
    if (rows.length === 0) return undefined;
    return ContextPacketSchema.parse(rows[0]!.snapshot);
  }

  async close(): Promise<void> {
    await this.sql.end();
  }
}
