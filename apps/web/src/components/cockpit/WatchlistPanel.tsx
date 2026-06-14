"use client";

import { formatPercent, formatPrice, Panel } from "@aestus/ui";

export interface WatchlistItem {
  asset_id: string;
  symbol: string;
  price: number;
  change_pct_24h: number;
  alert_count: number;
  icon_char: string;
  icon_color: string;
  icon_text_color?: string;
}

interface WatchlistPanelProps {
  items: WatchlistItem[];
  focusedAssetId: string;
  onSelectAsset: (assetId: string) => void;
}

const TH_STYLE: React.CSSProperties = {
  fontSize: 9,
  fontWeight: 600,
  letterSpacing: ".6px",
  color: "var(--text-faint)",
  textTransform: "uppercase",
  padding: "7px 12px 6px",
  borderBottom: "1px solid var(--border-soft)",
  fontFamily: "var(--sans)",
};

const TD_STYLE: React.CSSProperties = {
  padding: "5.5px 12px",
  fontSize: 11.5,
  borderBottom: "1px solid var(--border-soft)",
  fontFamily: "var(--mono)",
};

export function WatchlistPanel({ items, focusedAssetId, onSelectAsset }: WatchlistPanelProps) {
  return (
    <Panel
      title="Watchlists"
      headerRight={
        <span style={{ color: "var(--text-dim)", fontSize: 15, lineHeight: 1, cursor: "pointer" }}>
          +
        </span>
      }
    >
      {/* Watchlist selector */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          background: "var(--panel-2)",
          border: "1px solid var(--border)",
          borderRadius: 5,
          height: 28,
          padding: "0 9px",
          margin: "10px 12px 4px",
          fontSize: 11.5,
          color: "var(--text)",
          cursor: "default",
        }}
      >
        Main Watchlist
        <span style={{ marginLeft: "auto", color: "var(--text-dim)", fontSize: 9 }}>▾</span>
      </div>

      {/* Table */}
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <th style={{ ...TH_STYLE, textAlign: "left" }}>Asset</th>
            <th style={{ ...TH_STYLE, textAlign: "right" }}>Price</th>
            <th style={{ ...TH_STYLE, textAlign: "right" }}>24H %</th>
            <th style={{ ...TH_STYLE, textAlign: "right" }}>Alerts</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => {
            const isSelected = item.asset_id === focusedAssetId;
            const isPos = item.change_pct_24h >= 0;
            return (
              <tr
                key={item.asset_id}
                onClick={() => onSelectAsset(item.asset_id)}
                style={{
                  cursor: "pointer",
                  background: isSelected ? "var(--panel-hl)" : undefined,
                }}
              >
                <td style={{ ...TD_STYLE, fontFamily: "var(--sans)" }}>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 7,
                      fontWeight: 500,
                      color: "var(--text-strong)",
                    }}
                  >
                    <span
                      style={{
                        width: 15,
                        height: 15,
                        borderRadius: "50%",
                        background: item.icon_color,
                        color: item.icon_text_color ?? "#0a0e15",
                        fontSize: 8,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontWeight: 700,
                        flex: "0 0 15px",
                      }}
                    >
                      {item.icon_char}
                    </span>
                    {item.symbol}
                  </div>
                </td>
                <td style={{ ...TD_STYLE, textAlign: "right" }}>{formatPrice(item.price)}</td>
                <td
                  style={{
                    ...TD_STYLE,
                    textAlign: "right",
                    color: isPos ? "var(--green)" : "var(--red)",
                  }}
                >
                  {formatPercent(item.change_pct_24h)}
                </td>
                <td style={{ ...TD_STYLE, textAlign: "right" }}>
                  {item.alert_count > 0 ? (
                    <span
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        minWidth: 16,
                        height: 16,
                        borderRadius: 4,
                        background: "rgba(227,93,91,.14)",
                        color: "var(--red)",
                        fontSize: 10,
                        fontWeight: 600,
                        fontFamily: "var(--mono)",
                        padding: "0 4px",
                      }}
                    >
                      {item.alert_count}
                    </span>
                  ) : (
                    <span style={{ color: "var(--text-faint)" }}>—</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </Panel>
  );
}
