/**
 * Briefing prompt construction (P13-T001 skeleton; safety language in T005,
 * deterministic-level injection in T007).
 *
 * The prompt embeds a machine-readable facts block carrying the packet's
 * deterministic levels and quality. The model reads it as grounding context;
 * the fake provider parses it to stay packet-consistent. Either way the model
 * supplies narrative only and never invents a number (hard rule #2).
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
 * Build the chat messages for a briefing. The system message states the role;
 * the user message carries a human-readable summary plus the facts block.
 * (T005 expands the system message with the full decision-support / no-command
 * safety contract; T007 hardens the no-invented-numbers instruction.)
 */
export function buildBriefingMessages(packet: ContextPacket): LlmMessage[] {
  const facts = buildPromptFacts(packet);
  const system = [
    "You are a decision-support analyst for a single trader.",
    "You produce briefings that are proposals with reasoning, never commands.",
    "You never invent price levels: entry, invalidation, and targets are given.",
    "Return only narrative reasoning that conforms to the requested schema.",
  ].join(" ");
  const user = [
    `Asset: ${packet.primary_asset}. Trigger: ${packet.trigger.title}.`,
    `Context quality: ${packet.quality.label} (${packet.quality.score.toFixed(2)}).`,
    "Use only the deterministic levels and facts below.",
    renderFacts(facts),
  ].join("\n");
  return [
    { role: "system", content: system },
    { role: "user", content: user },
  ];
}
