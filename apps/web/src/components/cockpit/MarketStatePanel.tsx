"use client";

import { Badge, Panel } from "@aestus/ui";

export interface MarketState {
  risk_regime: "risk_on" | "risk_off" | "neutral";
  volatility_regime: "low" | "normal" | "high" | "spike";
  btc_vol_30d: number;
  btc_vol_30d_delta: number;
  funding_btc: number;
  oi_btc_notional: number;
  oi_btc_delta: number;
  market_breadth_pct: number;
  degraded?: boolean;
}

interface MarketStatePanelProps {
  state: MarketState;
}

function riskLabel(regime: MarketState["risk_regime"]): { label: string; color: string } {
  if (regime === "risk_on") return { label: "▲ Risk-On", color: "var(--green)" };
  if (regime === "risk_off") return { label: "▼ Risk-Off", color: "var(--red)" };
  return { label: "→ Neutral", color: "var(--text-dim)" };
}

function volRegimeLabel(regime: MarketState["volatility_regime"]): string {
  const map: Record<MarketState["volatility_regime"], string> = {
    low: "Low",
    normal: "Normal",
    high: "High",
    spike: "Spike",
  };
  return map[regime];
}

function volRegimeVariant(
  regime: MarketState["volatility_regime"],
): "green" | "gray" | "amber" | "red" {
  if (regime === "low") return "green";
  if (regime === "normal") return "gray";
  if (regime === "high") return "amber";
  return "red";
}

function breadthVariant(pct: number): "green" | "red" | "gray" {
  if (pct >= 55) return "green";
  if (pct <= 45) return "red";
  return "gray";
}

const ROW: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  padding: "6.5px 0",
  borderBottom: "1px solid var(--border-soft)",
  fontSize: 11.5,
};

const KEY: React.CSSProperties = { color: "var(--text-dim)" };

const VAL: React.CSSProperties = {
  fontFamily: "var(--mono)",
  color: "var(--text-strong)",
  display: "flex",
  alignItems: "center",
  gap: 6,
};

export function MarketStatePanel({ state }: MarketStatePanelProps) {
  const risk = riskLabel(state.risk_regime);
  const isVolPos = state.btc_vol_30d_delta >= 0;
  const isOiPos = state.oi_btc_delta >= 0;

  const fundingTag = state.funding_btc > 0.00008 ? "High" : state.funding_btc < 0 ? "Low" : "Norm";
  const fundingTagVariant =
    state.funding_btc > 0.00008 ? "red" : state.funding_btc < 0 ? "green" : "gray";

  const breadthLabel =
    state.market_breadth_pct >= 55
      ? "Bullish"
      : state.market_breadth_pct <= 45
        ? "Bearish"
        : "Neutral";

  return (
    <Panel title="Market State">
      <div style={{ padding: "2px 12px 4px" }}>
        <div style={{ ...ROW, borderBottom: "1px solid var(--border-soft)" }}>
          <span style={KEY}>Risk Regime</span>
          <span style={{ ...VAL, color: risk.color }}>{risk.label}</span>
        </div>
        <div style={ROW}>
          <span style={KEY}>Volatility Regime</span>
          <span style={VAL}>
            <Badge
              label={volRegimeLabel(state.volatility_regime)}
              variant={volRegimeVariant(state.volatility_regime)}
            />
          </span>
        </div>
        <div style={ROW}>
          <span style={KEY}>BTC 30D Volatility</span>
          <span style={VAL}>
            {state.btc_vol_30d.toFixed(1)}%{" "}
            <span style={{ color: isVolPos ? "var(--red)" : "var(--green)" }}>
              {isVolPos ? "+" : ""}
              {state.btc_vol_30d_delta.toFixed(1)}%
            </span>
          </span>
        </div>
        <div style={ROW}>
          <span style={KEY}>Funding (BTC)</span>
          <span style={VAL}>
            {(state.funding_btc * 100).toFixed(3)}%{" "}
            <Badge label={fundingTag} variant={fundingTagVariant} />
          </span>
        </div>
        <div style={ROW}>
          <span style={KEY}>Open Interest (BTC)</span>
          <span style={VAL}>
            ${(state.oi_btc_notional / 1e9).toFixed(1)}B{" "}
            <span style={{ color: isOiPos ? "var(--green)" : "var(--red)" }}>
              {isOiPos ? "+" : ""}
              {state.oi_btc_delta.toFixed(1)}%
            </span>
          </span>
        </div>
        <div style={{ ...ROW, borderBottom: "none" }}>
          <span style={KEY}>Market Breadth</span>
          <span style={VAL}>
            {state.market_breadth_pct}%{" "}
            <Badge label={breadthLabel} variant={breadthVariant(state.market_breadth_pct)} />
          </span>
        </div>
      </div>
    </Panel>
  );
}
