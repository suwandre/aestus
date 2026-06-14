"use client";

import { Panel } from "@aestus/ui";

export interface OrderFlowLevel {
  price: number;
  size: number;
  sum: number;
}

export interface OrderFlowData {
  symbol: string;
  venue: string;
  timeframe: string;
  midPrice: number;
  asks: OrderFlowLevel[];
  bids: OrderFlowLevel[];
  maxSum: number;
  imbalancePct: number;
  degraded?: boolean;
}

interface Props {
  data: OrderFlowData;
}

const DD: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 6,
  background: "var(--panel-2)",
  border: "1px solid var(--border)",
  borderRadius: 5,
  height: 26,
  padding: "0 9px",
  fontSize: 10.5,
  color: "var(--text)",
  cursor: "default",
};

const GRID_3: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr 1fr",
  position: "relative",
  alignItems: "center",
};

function DepthRow({
  level,
  side,
  maxSum,
}: {
  level: OrderFlowLevel;
  side: "ask" | "bid";
  maxSum: number;
}) {
  const widthPct = ((level.sum / maxSum) * 100).toFixed(1);
  const barBg = side === "ask" ? "rgba(227,93,91,0.10)" : "rgba(38,194,129,0.10)";
  const pxColor = side === "ask" ? "var(--red)" : "var(--green)";

  return (
    <div style={{ ...GRID_3, padding: "3.5px 12px" }}>
      <div
        style={{
          position: "absolute",
          right: 0,
          top: 1,
          bottom: 1,
          width: `${widthPct}%`,
          borderRadius: 2,
          background: barBg,
          zIndex: 0,
        }}
      />
      <span style={{ position: "relative", zIndex: 1, color: pxColor, fontWeight: 500 }}>
        {level.price.toLocaleString("en-US")}
      </span>
      <span
        style={{ position: "relative", zIndex: 1, textAlign: "right", color: "var(--text-dim)" }}
      >
        {level.size.toFixed(1)}
      </span>
      <span
        style={{ position: "relative", zIndex: 1, textAlign: "right", color: "var(--text-dim)" }}
      >
        {level.sum.toFixed(1)}
      </span>
    </div>
  );
}

export function OrderFlowPanel({ data }: Props) {
  const isPositive = data.imbalancePct >= 0;
  const imbalanceSign = isPositive ? "+" : "";
  const imbalanceSide = isPositive ? "Buy ▲" : "Sell ▼";
  const imbalanceSideBg = isPositive ? "rgba(38,194,129,.14)" : "rgba(227,93,91,.14)";
  const imbalanceSideColor = isPositive ? "var(--green)" : "var(--red)";
  const imbalanceNumColor = isPositive ? "var(--green)" : "var(--red)";

  return (
    <Panel title={`Order Flow (${data.symbol})`}>
      {data.degraded ? (
        <div
          style={{
            padding: "14px 12px",
            color: "var(--orange)",
            fontSize: 11,
            borderBottom: "1px solid var(--border-soft)",
          }}
        >
          ⚠ Orderbook feed unavailable
        </div>
      ) : (
        <>
          {/* Controls */}
          <div
            style={{
              display: "flex",
              gap: 6,
              padding: "9px 12px",
              borderBottom: "1px solid var(--border-soft)",
            }}
          >
            <div style={{ ...DD, flex: 1 }}>
              {data.venue}{" "}
              <span style={{ marginLeft: "auto", color: "var(--text-dim)", fontSize: 8 }}>▾</span>
            </div>
            <div style={DD}>
              {data.timeframe}{" "}
              <span style={{ marginLeft: 6, color: "var(--text-dim)", fontSize: 8 }}>▾</span>
            </div>
          </div>

          {/* Table */}
          <div style={{ fontFamily: "var(--mono)", fontSize: 10.5 }}>
            <div
              style={{
                ...GRID_3,
                padding: "6px 12px",
                color: "var(--text-faint)",
                fontSize: 9,
                letterSpacing: ".5px",
              }}
            >
              <span>PRICE</span>
              <span style={{ textAlign: "right" }}>SIZE (BTC)</span>
              <span style={{ textAlign: "right" }}>SUM</span>
            </div>

            {/* Asks (reversed so lowest ask is closest to mid) */}
            {[...data.asks].reverse().map((lvl, i) => (
              <DepthRow key={i} level={lvl} side="ask" maxSum={data.maxSum} />
            ))}

            {/* Mid price */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                padding: "9px 12px",
                margin: "3px 0",
                background: "rgba(38,194,129,.06)",
                borderTop: "1px solid var(--border-soft)",
                borderBottom: "1px solid var(--border-soft)",
              }}
            >
              <span
                style={{
                  fontFamily: "var(--mono)",
                  fontSize: 18,
                  fontWeight: 600,
                  color: "var(--green)",
                }}
              >
                {data.midPrice.toLocaleString("en-US", {
                  minimumFractionDigits: 1,
                  maximumFractionDigits: 1,
                })}
              </span>
            </div>

            {/* Bids */}
            {data.bids.map((lvl, i) => (
              <DepthRow key={i} level={lvl} side="bid" maxSum={data.maxSum} />
            ))}
          </div>
        </>
      )}

      {/* Footer */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          padding: "9px 12px",
          borderTop: "1px solid var(--border-soft)",
          marginTop: "auto",
          fontSize: 10.5,
        }}
      >
        <span style={{ color: "var(--text-dim)" }}>Imbalance ({data.timeframe})</span>
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ color: imbalanceNumColor, fontFamily: "var(--mono)" }}>
            {imbalanceSign}
            {data.imbalancePct.toFixed(2)}%
          </span>
          <span
            style={{
              display: "flex",
              alignItems: "center",
              gap: 3,
              background: imbalanceSideBg,
              color: imbalanceSideColor,
              fontSize: 10,
              fontWeight: 600,
              borderRadius: 4,
              padding: "2px 7px",
            }}
          >
            {imbalanceSide}
          </span>
        </div>
      </div>
    </Panel>
  );
}
