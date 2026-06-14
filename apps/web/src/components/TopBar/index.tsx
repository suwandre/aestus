import CommandSearch from "@/components/CommandSearch";
import TickerStrip from "@/components/TickerStrip";
import Clock from "@/components/Clock";
import StatusCluster from "@/components/StatusCluster";

interface TickerItem {
  symbol: string;
  price: number;
  change_pct_24h: number;
}

interface TopBarProps {
  tickers: TickerItem[];
}

const AestusLogo = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 112 112"
    width="22"
    height="22"
    role="img"
    aria-label="Aestus"
    style={{ flexShrink: 0 }}
  >
    <defs>
      <linearGradient id="aestus-g" x1="16" y1="104" x2="88" y2="12" gradientUnits="userSpaceOnUse">
        <stop offset="0" stopColor="var(--brand-2)" />
        <stop offset="1" stopColor="#b431f5" />
      </linearGradient>
    </defs>
    <path d="M53.6 12.8 16 101.6l18-7.6 22.8-56.8z" fill="url(#aestus-g)" />
    <path d="M53.6 12.8 74.4 64l-11.6 6.4-9.2-23.6-4 37.2-8.4 7.2z" fill="url(#aestus-g)" />
    <path
      d="M34.4 76.8 48 58.4l10.4 8.4 20.8-36.4"
      stroke="url(#aestus-g)"
      fill="none"
      strokeWidth="8"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path d="M66.8 26.8 84 21.6l-4 17.6z" fill="url(#aestus-g)" />
  </svg>
);

export default function TopBar({ tickers }: TopBarProps) {
  return (
    <header
      style={{
        position: "sticky",
        top: 0,
        zIndex: 50,
        height: 46,
        background: "var(--panel-2)",
        borderBottom: "1px solid var(--border)",
        display: "flex",
        alignItems: "center",
        paddingLeft: 16,
        paddingRight: 16,
        gap: 16,
        boxSizing: "border-box",
      }}
    >
      {/* Logo */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
        <AestusLogo />
        <span
          style={{
            textTransform: "uppercase",
            letterSpacing: 3,
            fontWeight: 600,
            fontSize: 13,
            color: "var(--text-strong)",
            fontFamily: "'IBM Plex Sans', sans-serif",
          }}
        >
          AESTUS
        </span>
      </div>

      {/* Command Search */}
      <CommandSearch />

      {/* Ticker Strip */}
      <TickerStrip tickers={tickers} />

      {/* Right cluster */}
      <div style={{ display: "flex", alignItems: "center", gap: 14, flexShrink: 0 }}>
        <Clock />
        <StatusCluster />
      </div>
    </header>
  );
}
