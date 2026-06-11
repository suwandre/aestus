/**
 * Briefing prompt construction (P13-T005; deterministic-level guardrail in T007).
 *
 * The system message states the decision-support contract: proposals not
 * commands, never invent price levels, cite the context sections used, and
 * return `no_trade` when the edge is weak. The user message summarizes the
 * packet section-by-section, states the packet quality explicitly (so the model
 * calibrates confidence), lists the deterministic levels, and embeds a
 * machine-readable facts block. The real model reads it as grounding context;
 * the fake provider parses the facts block to stay packet-consistent. Either way
 * the model supplies narrative only and never invents a number (hard rule #2).
 */
import type { ContextPacket } from "@aestus/contracts";
import type { LlmMessage } from "./provider/types";

/** Markers delimiting the JSON facts block inside the user message. */
const FACTS_OPEN = "<packet_facts>";
const FACTS_CLOSE = "</packet_facts>";

/**
 * The deterministic grounding the model is allowed to reason over. Every number
 * here comes from the level engine / packet — the model may explain or select
 * among these values but must not introduce others.
 */
export interface PromptFacts {
  context_packet_id: string;
  primary_asset: string;
  reference_price: number;
  direction: "long" | "short" | "none";
  is_no_trade: boolean;
  no_trade_reasons: string[];
  no_trade_recheck: string[];
  entry_zone: { low: number; high: number } | null;
  invalidation: number | null;
  targets: number[];
  supports: number[];
  resistances: number[];
  quality_label: "strong" | "adequate" | "weak";
  quality_score: number;
  degraded_feeds: string[];
  anomaly: { id: string; type: string; title: string };
  supporting_refs: string[];
}

/** Distil a context packet into the deterministic facts the model may use. */
export function buildPromptFacts(packet: ContextPacket): PromptFacts {
  const levels = packet.deterministic_levels;
  const noTrade = levels.no_trade;
  const refs = [packet.id, packet.trigger.id, ...packet.news.map((n) => n.id)];
  return {
    context_packet_id: packet.id,
    primary_asset: packet.primary_asset,
    reference_price: levels.reference_price,
    direction: levels.direction,
    is_no_trade: noTrade?.is_no_trade ?? false,
    no_trade_reasons: noTrade?.reasons ?? [],
    no_trade_recheck: noTrade?.recheck ?? [],
    entry_zone: levels.entry_zone,
    invalidation: levels.invalidation,
    targets: levels.targets,
    supports: levels.supports,
    resistances: levels.resistances,
    quality_label: packet.quality.label,
    quality_score: packet.quality.score,
    degraded_feeds: packet.quality.degraded_feeds,
    anomaly: {
      id: packet.trigger.id,
      type: packet.trigger.type,
      title: packet.trigger.title,
    },
    supporting_refs: refs,
  };
}

/** Render the facts as a fenced block the model and fake provider both read. */
function renderFacts(facts: PromptFacts): string {
  return `${FACTS_OPEN}\n${JSON.stringify(facts, null, 2)}\n${FACTS_CLOSE}`;
}

/** Parse the facts block back out of prompt text; null if absent/invalid. */
export function extractPromptFacts(text: string): PromptFacts | null {
  const start = text.indexOf(FACTS_OPEN);
  const end = text.indexOf(FACTS_CLOSE);
  if (start === -1 || end === -1 || end < start) return null;
  const json = text.slice(start + FACTS_OPEN.length, end).trim();
  try {
    return JSON.parse(json) as PromptFacts;
  } catch {
    return null;
  }
}

/**
 * The decision-support contract every briefing is generated under. Emphasizes:
 * proposals not commands (rule #3), never invent price levels (rule #2), cite
 * the context sections used, and prefer `no_trade` when the edge is weak.
 */
export const BRIEFING_SYSTEM_PROMPT = [
  "You are the analyst behind Aestus, a decision-support cockpit for one self-hosted trader. Cockpit, not autopilot.",
  "",
  "Rules:",
  "1. Every briefing is a PROPOSAL with reasoning, never a command. Do not instruct the user to buy, sell, enter, exit, or place any order. Lay out a thesis they can accept or reject.",
  "2. You never invent price levels. The entry zone, invalidation, targets, and position size are computed deterministically and given to you below. You may explain or choose among them, but you must not introduce any price the data does not contain.",
  "3. Ground every claim in the provided context and cite the sections you used (anomaly, market snapshot, news ids, macro, on-chain, analogues, deterministic levels).",
  '4. If the edge is weak, the context is degraded or stale, or signals conflict, return stance "no_trade" with explicit reasons and the conditions that would make you re-check. No-trade is a first-class, valuable outcome.',
  "5. Calibrate confidence to the data quality stated below: lower it when packet quality is weak or feeds are degraded.",
  "6. Be concise and specific. Return only fields that conform to the requested schema. No preamble, no execution instructions.",
].join("\n");

/** Cite-able context sections, listing the ids the model may reference. */
function formatSections(packet: ContextPacket): string {
  const ms = packet.market_snapshot;
  const snapshotBits = [
    `${ms.canonical_asset_id} @ reference ${packet.deterministic_levels.reference_price}`,
    ms.funding_z !== null ? `funding_z ${ms.funding_z}` : null,
    ms.oi_delta !== null ? `oi_delta ${ms.oi_delta}` : null,
    ms.volume_z !== null ? `volume_z ${ms.volume_z}` : null,
  ]
    .filter((b): b is string => b !== null)
    .join(", ");
  const list = (xs: string[]): string => (xs.length > 0 ? xs.join(", ") : "none");
  return [
    "## Context sections (cite the ids you rely on)",
    `- Anomaly: ${packet.trigger.id} — ${packet.trigger.type} (severity ${packet.trigger.severity}): ${packet.trigger.title}`,
    `- Market snapshot: ${snapshotBits}`,
    `- Correlated assets: ${list(packet.correlated_assets.map((c) => c.canonical_asset_id))}`,
    `- News: ${list(packet.news.map((n) => n.id))}`,
    `- Macro: ${list(packet.macro.map((m) => `${m.event_id} (${m.title}, ${m.importance})`))}`,
    `- On-chain: ${list(packet.on_chain.map((e) => e.event_type))}`,
    `- Historical analogues: ${packet.historical_analogues.length}`,
  ].join("\n");
}

/** Packet quality, stated explicitly so the model calibrates confidence. */
function formatQuality(packet: ContextPacket): string {
  const q = packet.quality;
  const degraded = q.degraded_feeds.length > 0 ? q.degraded_feeds.join(", ") : "none";
  return [
    "## Packet quality (calibrate confidence to this)",
    `- Label: ${q.label}; score ${q.score.toFixed(2)}`,
    `- Degraded feeds: ${degraded}`,
    q.notes ? `- Notes: ${q.notes}` : null,
  ]
    .filter((l): l is string => l !== null)
    .join("\n");
}

/** The deterministic levels, listed explicitly (the model may not add others). */
function formatLevels(facts: PromptFacts): string {
  const ez = facts.entry_zone ? `${facts.entry_zone.low}–${facts.entry_zone.high}` : "n/a";
  const list = (xs: number[]): string => (xs.length > 0 ? xs.join(", ") : "none");
  return [
    "## Deterministic levels (supplied by the level engine — never introduce others)",
    `- Direction: ${facts.direction}; reference price ${facts.reference_price}`,
    `- Entry zone: ${ez}`,
    `- Invalidation: ${facts.invalidation ?? "n/a"}`,
    `- Targets: ${list(facts.targets)}`,
    `- Supports: ${list(facts.supports)}; Resistances: ${list(facts.resistances)}`,
    `- No-trade flag: ${facts.is_no_trade}${facts.is_no_trade ? ` (${facts.no_trade_reasons.join("; ")})` : ""}`,
  ].join("\n");
}

/**
 * Build the chat messages for a briefing: the system contract plus a structured,
 * section-by-section user message that states the deterministic levels and the
 * packet quality explicitly and embeds the machine-readable facts block.
 */
export function buildBriefingMessages(packet: ContextPacket): LlmMessage[] {
  const facts = buildPromptFacts(packet);
  const user = [
    `# Briefing request: ${packet.primary_asset}`,
    "",
    formatSections(packet),
    "",
    formatQuality(packet),
    "",
    formatLevels(facts),
    "",
    renderFacts(facts),
    "",
    "## Task",
    'Return a briefing draft for this asset. Choose a stance (long, short, or no_trade). If the edge is weak or the context is degraded, prefer "no_trade" with reasons and re-check conditions. Cite the context sections you used. Do not introduce any price not listed above.',
  ].join("\n");
  return [
    { role: "system", content: BRIEFING_SYSTEM_PROMPT },
    { role: "user", content: user },
  ];
}
