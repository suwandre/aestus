"use client";

import { Panel } from "@aestus/ui";

export type OnChainSignal = "bull" | "neu" | "high";
export type OnChainDirection = "up" | "down" | "flat";

export interface OnChainMetric {
  id: string;
  label: string;
  value: string;
  direction: OnChainDirection;
  signal: OnChainSignal;
  stale?: boolean;
}

export interface OnChainData {
  metrics: OnChainMetric[];
  degraded?: boolean;
}

interface Props {
  data: OnChainData;
}

const SIGNAL_STYLES: Record<OnChainSignal, { label: string; color: string }> = {
  bull: { label: "Bullish", color: "var(--green)" },
  neu: { label: "Neutral", color: "var(--orange)" },
  high: { label: "(High)", color: "var(--red)" },
};

const DIR_ARROW: Record<OnChainDirection, { char: string; color: string }> = {
  up: { char: "↑", color: "var(--green)" },
  down: { char: "↓", color: "var(--red)" },
  flat: { char: "→", color: "var(--text-dim)" },
};

const CIRCLE_ICON = (
  <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2">
    <circle cx="12" cy="12" r="9" />
  </svg>
);

export function OnChainPanel({ data }: Props) {
  return (
    <Panel title="On-Chain Insights">
      {data.degraded && (
        <div
          style={{
            padding: "6px 12px",
            fontSize: 10,
            color: "var(--orange)",
            borderBottom: "1px solid var(--border-soft)",
          }}
        >
          ⚠ Some metrics stale or unavailable
        </div>
      )}
      <div>
        {data.metrics.map((m, i) => {
          const sig = SIGNAL_STYLES[m.signal];
          const dir = DIR_ARROW[m.direction];
          const isLast = i === data.metrics.length - 1;
          return (
            <div
              key={m.id}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 9,
                padding: "9px 12px",
                borderBottom: isLast ? "none" : "1px solid var(--border-soft)",
                opacity: m.stale ? 0.6 : 1,
              }}
            >
              <span style={{ color: "var(--text-faint)", display: "flex", width: 14 }}>
                {CIRCLE_ICON}
              </span>
              <span style={{ flex: 1, fontSize: 11.5, color: "var(--text-dim)" }}>{m.label}</span>
              <span
                style={{
                  fontFamily: "var(--mono)",
                  color: "var(--text-strong)",
                  fontSize: 11.5,
                  display: "flex",
                  alignItems: "center",
                  gap: 5,
                }}
              >
                {m.value} <span style={{ color: dir.color }}>{dir.char}</span>
              </span>
              <span
                style={{
                  fontSize: 10,
                  width: 62,
                  textAlign: "right",
                  fontWeight: 500,
                  color: sig.color,
                }}
              >
                {sig.label}
              </span>
            </div>
          );
        })}
      </div>
    </Panel>
  );
}
