import { formatPrice, formatPercent } from "@aestus/ui";

interface TickerItem {
  symbol: string;
  price: number;
  change_pct_24h: number;
}

interface TickerStripProps {
  tickers: TickerItem[];
}

const styles = {
  row: {
    display: "flex",
    flexDirection: "row" as const,
    gap: 18,
    overflow: "hidden",
    flex: 1,
    alignItems: "center",
  },
  item: {
    display: "flex",
    flexDirection: "row" as const,
    alignItems: "center",
    gap: 5,
    flexShrink: 0,
  },
  sym: {
    fontSize: 11,
    fontWeight: 600,
    color: "var(--text-dim)",
    letterSpacing: "0.3px",
    fontFamily: "'IBM Plex Sans', sans-serif",
  } as React.CSSProperties,
  px: {
    fontFamily: "'IBM Plex Mono', monospace",
    fontSize: 12,
    color: "var(--text-strong)",
    fontFeatureSettings: '"tnum"',
  } as React.CSSProperties,
};

export default function TickerStrip({ tickers }: TickerStripProps) {
  return (
    <div style={styles.row}>
      {tickers.map((t) => (
        <div key={t.symbol} style={styles.item}>
          <span style={styles.sym}>{t.symbol}</span>
          <span style={styles.px}>{formatPrice(t.price)}</span>
          <span
            style={{
              fontFamily: "'IBM Plex Mono', monospace",
              fontSize: 11,
              color: t.change_pct_24h >= 0 ? "var(--green)" : "var(--red)",
              fontFeatureSettings: '"tnum"',
            }}
          >
            {formatPercent(t.change_pct_24h)}
          </span>
        </div>
      ))}
    </div>
  );
}
