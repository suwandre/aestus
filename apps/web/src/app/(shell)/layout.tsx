import TopBar from "@/components/TopBar";
import Sidebar from "@/components/Sidebar";
import { fixtureTickers } from "@/lib/fixtures";

export default function ShellLayout({ children }: { children: React.ReactNode }) {
  // Map fixture tickers to the shape TopBar / TickerStrip expects
  const tickers = fixtureTickers.map(({ symbol, price, change_pct_24h }) => ({
    symbol,
    price,
    change_pct_24h,
  }));

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100vh",
        background: "var(--bg)",
      }}
    >
      <TopBar tickers={tickers} />

      <div
        style={{
          display: "flex",
          flex: 1,
          overflow: "hidden",
        }}
      >
        <Sidebar />
        <main
          style={{
            flex: 1,
            overflowY: "auto",
            minHeight: 0,
          }}
        >
          {children}
        </main>
      </div>
    </div>
  );
}
