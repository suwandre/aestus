"use client";

import { Panel } from "@aestus/ui";

const ASSETS = ["BTC", "ETH", "SPX", "DXY", "GOLD", "OIL"] as const;

export interface CorrelationMatrix {
  matrix: (number | null)[][];
  updatedAt: string;
  degraded?: boolean;
}

interface Props {
  data: CorrelationMatrix;
}

function cellBg(v: number | null): string {
  if (v === null) return "rgba(255,255,255,0.04)";
  const a = Math.min(Math.abs(v), 1);
  if (v >= 0.999) return `rgba(38,194,129,${(0.1 + a * 0.2).toFixed(3)})`;
  if (v > 0) return `rgba(38,194,129,${(0.06 + a * 0.3).toFixed(3)})`;
  return `rgba(227,93,91,${(0.06 + a * 0.3).toFixed(3)})`;
}

const TH: React.CSSProperties = {
  padding: "4px 0",
  fontSize: 9.5,
  fontWeight: 600,
  color: "var(--text-faint)",
  textAlign: "center",
};

const LBL: React.CSSProperties = {
  color: "var(--text-dim)",
  fontWeight: 600,
  textAlign: "left",
  paddingLeft: 2,
  fontSize: 9.5,
};

export function CorrelationMatrixPanel({ data }: Props) {
  return (
    <Panel title="Correlation Matrix (24H)">
      <div style={{ padding: "8px 12px 10px" }}>
        <table
          style={{
            width: "100%",
            borderCollapse: "collapse",
            fontFamily: "var(--mono)",
            fontSize: 10,
          }}
        >
          <thead>
            <tr>
              <th style={TH} />
              {ASSETS.map((a) => (
                <th key={a} style={TH}>
                  {a}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ASSETS.map((rowAsset, i) => (
              <tr key={rowAsset}>
                <td style={LBL}>{rowAsset}</td>
                {ASSETS.map((_, j) => {
                  const v = data.matrix[i]?.[j] ?? null;
                  const bg = cellBg(v);
                  return (
                    <td key={j} style={{ textAlign: "center", padding: 0 }}>
                      <span
                        style={{
                          display: "block",
                          padding: "5px 0",
                          borderRadius: 3,
                          margin: 1,
                          color: v === null ? "var(--text-faint)" : "#e9eef4",
                          fontSize: 10,
                          background: bg,
                        }}
                      >
                        {v === null ? "—" : v.toFixed(2)}
                      </span>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            color: "var(--text-faint)",
            fontSize: 9.5,
            marginTop: 8,
            fontFamily: "var(--mono)",
          }}
        >
          <span>Source: Calculated</span>
          <span style={{ color: data.degraded ? "var(--orange)" : undefined }}>
            {data.degraded ? "⚠ Stale" : `Updated: ${data.updatedAt}`}
          </span>
        </div>
      </div>
    </Panel>
  );
}
