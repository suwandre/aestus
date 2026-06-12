import type { JournalTrade } from "@aestus/contracts";
import type { FixtureStore } from "../store";
import type { Router } from "../router";

/** Closed trades only. */
function closed(journal: JournalTrade[]): JournalTrade[] {
  return journal.filter((j) => j.outcome_status !== "open" && j.realized_pnl !== null);
}

export function registerAnalyticsRoutes(router: Router, store: FixtureStore): void {
  // GET /api/analytics/kpi
  router.get("/api/analytics/kpi", () => {
    const trades = closed(store.journal);
    const wins = trades.filter((t) => t.outcome_status === "win").length;
    const losses = trades.filter((t) => t.outcome_status === "loss").length;
    const totalPnl = trades.reduce((s, t) => s + (t.realized_pnl ?? 0), 0);
    const avgR =
      trades.length > 0 ? trades.reduce((s, t) => s + (t.r_multiple ?? 0), 0) / trades.length : 0;
    const winRate = trades.length > 0 ? wins / trades.length : 0;
    return Response.json({
      total_trades: trades.length,
      wins,
      losses,
      win_rate: winRate,
      total_pnl: totalPnl,
      avg_r: avgR,
      open_trades: store.journal.filter((j) => j.outcome_status === "open").length,
    });
  });

  // GET /api/analytics/equity-curve
  router.get("/api/analytics/equity-curve", () => {
    const trades = closed(store.journal).sort((a, b) => {
      const aTime = a.exit?.at ?? a.entry.at;
      const bTime = b.exit?.at ?? b.entry.at;
      return aTime < bTime ? -1 : aTime > bTime ? 1 : 0;
    });
    let equity = 0;
    const curve = trades.map((t) => {
      equity += t.realized_pnl ?? 0;
      return { at: t.exit?.at ?? t.entry.at, equity, r: t.r_multiple };
    });
    return Response.json(curve);
  });

  // GET /api/analytics/setup-edge
  router.get("/api/analytics/setup-edge", () => {
    const trades = closed(store.journal);
    const bySetup = new Map<string, { wins: number; total: number; pnl: number }>();
    for (const t of trades) {
      for (const tag of t.setup_tags.length > 0 ? t.setup_tags : ["untagged"]) {
        const prev = bySetup.get(tag) ?? { wins: 0, total: 0, pnl: 0 };
        bySetup.set(tag, {
          wins: prev.wins + (t.outcome_status === "win" ? 1 : 0),
          total: prev.total + 1,
          pnl: prev.pnl + (t.realized_pnl ?? 0),
        });
      }
    }
    return Response.json(
      Array.from(bySetup.entries()).map(([setup, s]) => ({
        setup,
        trades: s.total,
        win_rate: s.total > 0 ? s.wins / s.total : 0,
        total_pnl: s.pnl,
      })),
    );
  });

  // GET /api/analytics/regime
  router.get("/api/analytics/regime", () => {
    const trades = closed(store.journal);
    const byRegime = new Map<string, { wins: number; total: number }>();
    for (const t of trades) {
      const key = t.regime_at_entry
        ? `${t.regime_at_entry.trend}/${t.regime_at_entry.volatility}`
        : "unknown";
      const prev = byRegime.get(key) ?? { wins: 0, total: 0 };
      byRegime.set(key, {
        wins: prev.wins + (t.outcome_status === "win" ? 1 : 0),
        total: prev.total + 1,
      });
    }
    return Response.json(
      Array.from(byRegime.entries()).map(([regime, s]) => ({
        regime,
        trades: s.total,
        win_rate: s.total > 0 ? s.wins / s.total : 0,
      })),
    );
  });

  // GET /api/analytics/signal-quality
  router.get("/api/analytics/signal-quality", () => {
    const trades = closed(store.journal);
    const bySignal = new Map<string, { wins: number; total: number }>();
    for (const t of trades) {
      const key = t.signal ?? "unknown";
      const prev = bySignal.get(key) ?? { wins: 0, total: 0 };
      bySignal.set(key, {
        wins: prev.wins + (t.outcome_status === "win" ? 1 : 0),
        total: prev.total + 1,
      });
    }
    return Response.json(
      Array.from(bySignal.entries()).map(([signal, s]) => ({
        signal,
        trades: s.total,
        win_rate: s.total > 0 ? s.wins / s.total : 0,
      })),
    );
  });
}
