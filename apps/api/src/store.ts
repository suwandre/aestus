/**
 * Fixture-first in-memory store for the API layer (P14).
 *
 * Loads fixture JSON from the repo's `fixtures/` tree at startup so every
 * endpoint works without a live database (hard rule #5). Mutations update
 * in-memory state only; they are lost on restart (acceptable for dev/fixture
 * mode — the Postgres store, when DATABASE_URL is set, provides persistence).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type {
  AnomalyEvent,
  AnomalyStatus,
  AssetIdentity,
  Briefing,
  ContextPacket,
  Decision,
  FeatureSnapshot,
  JournalTrade,
  Ohlcv,
  VenueQuote,
} from "@aestus/contracts";

// ─── Settings shapes (not in contracts) ──────────────────────────────────────

export interface Watchlist {
  id: string;
  name: string;
  description: string;
  members: string[]; // canonical_asset_ids
}

export interface AlertRule {
  id: string;
  name: string;
  asset: string | null;
  condition: string;
  params: Record<string, unknown>;
}

export interface ModelRoute {
  task_kind: string;
  provider: string;
  model: string;
  params: Record<string, unknown>;
}

export interface FeedSetting {
  feed_id: string;
  enabled: boolean;
}

export interface NotificationChannel {
  id: string;
  type: string;
  target: string;
  enabled: boolean;
}

export interface LayoutPreference {
  key: string;
  value: unknown;
}

export interface ResearchJob {
  id: string;
  question: string;
  status: "pending" | "running" | "done" | "error";
  answer: string | null;
  created_at: string;
  completed_at: string | null;
}

// ─── Store ────────────────────────────────────────────────────────────────────

function loadJson<T>(repoRoot: string, relPath: string): T {
  const p = join(repoRoot, "fixtures", relPath);
  return JSON.parse(readFileSync(p, "utf8")) as T;
}

type VenueRaw = { venue_id: string; display_name: string; market_types: string[] };

export class FixtureStore {
  readonly assets: AssetIdentity[];
  readonly venues: VenueRaw[];
  watchlists: Watchlist[];
  anomalies: AnomalyEvent[];
  briefings: Briefing[];
  contextPackets: ContextPacket[];
  decisions: Decision[];
  journal: JournalTrade[];
  features: FeatureSnapshot[];
  candles: Ohlcv[];
  venueQuotes: VenueQuote[];
  alertRules: AlertRule[];
  modelRoutes: ModelRoute[];
  feedSettings: FeedSetting[];
  notifications: NotificationChannel[];
  layout: LayoutPreference[];
  researchJobs: ResearchJob[];

  constructor(repoRoot: string) {
    this.assets = loadJson<AssetIdentity[]>(repoRoot, "assets/identities.json");
    this.venues = loadJson<VenueRaw[]>(repoRoot, "venues/venues.json");
    this.anomalies = loadJson<AnomalyEvent[]>(repoRoot, "anomalies/events.json");
    this.briefings = loadJson<Briefing[]>(repoRoot, "briefings/briefings.json");
    this.contextPackets = loadJson<ContextPacket[]>(repoRoot, "context/packets.json");
    this.decisions = loadJson<Decision[]>(repoRoot, "decisions/decisions.json");
    this.journal = loadJson<JournalTrade[]>(repoRoot, "journal/trades.json");
    this.features = loadJson<FeatureSnapshot[]>(repoRoot, "features/snapshots.json");
    this.candles = loadJson<Ohlcv[]>(repoRoot, "market/candles.json");
    this.venueQuotes = loadJson<VenueQuote[]>(repoRoot, "market/venue_quotes.json");

    this.watchlists = [
      {
        id: "default",
        name: "Default",
        description: "Default watchlist",
        members: [
          "crypto:btc-usdt",
          "crypto:eth-usdt",
          "macro:spx",
          "macro:dxy",
          "macro:gold",
          "macro:vix",
        ],
      },
    ];

    this.alertRules = [
      {
        id: "default-funding-spike",
        name: "BTC funding spike",
        asset: "crypto:btc-usdt",
        condition: "funding_spike",
        params: { sigma: 3 },
      },
      {
        id: "default-oi-surge",
        name: "BTC open-interest surge",
        asset: "crypto:btc-usdt",
        condition: "oi_surge",
        params: { oi_delta: 0.05 },
      },
      {
        id: "default-macro-approaching",
        name: "High-importance macro approaching",
        asset: null,
        condition: "macro_approaching",
        params: { importance: "high", lead_minutes: 60 },
      },
      {
        id: "default-volume-anomaly",
        name: "Volume anomaly z-score",
        asset: null,
        condition: "volume_anomaly",
        params: { sigma: 2 },
      },
    ];

    this.modelRoutes = [
      { task_kind: "briefing", provider: "ollama", model: "kimi-k2.6", params: {} },
      { task_kind: "classification", provider: "ollama", model: "minimax-m3", params: {} },
    ];

    this.feedSettings = [
      { feed_id: "binance", enabled: true },
      { feed_id: "macro", enabled: true },
      { feed_id: "bybit", enabled: false },
      { feed_id: "okx", enabled: false },
      { feed_id: "hyperliquid", enabled: false },
    ];

    this.notifications = [
      {
        id: "default-webhook",
        type: "webhook",
        target: "http://localhost:3001/notify",
        enabled: false,
      },
    ];

    this.layout = [
      { key: "theme", value: "dark" },
      { key: "cockpit_columns", value: 3 },
    ];

    this.researchJobs = [];
  }

  // ─── Anomaly mutations ─────────────────────────────────────────────────────

  updateAnomalyStatus(id: string, status: AnomalyStatus): AnomalyEvent | undefined {
    const idx = this.anomalies.findIndex((a) => a.id === id);
    if (idx === -1) return undefined;
    const updated = { ...this.anomalies[idx]!, status };
    this.anomalies[idx] = updated;
    return updated;
  }

  // ─── Decision mutations ────────────────────────────────────────────────────

  addDecision(decision: Decision): void {
    this.decisions.push(decision);
  }

  updateDecision(id: string, patch: Record<string, unknown>): Decision | undefined {
    const idx = this.decisions.findIndex((d) => d.id === id);
    if (idx === -1) return undefined;
    const updated = { ...this.decisions[idx]!, ...patch } as Decision;
    this.decisions[idx] = updated;
    return updated;
  }

  // ─── Journal mutations ─────────────────────────────────────────────────────

  addJournalEntry(trade: JournalTrade): void {
    this.journal.push(trade);
  }

  updateJournalOutcome(id: string, patch: Record<string, unknown>): JournalTrade | undefined {
    const idx = this.journal.findIndex((j) => j.id === id);
    if (idx === -1) return undefined;
    const updated = { ...this.journal[idx]!, ...patch } as JournalTrade;
    this.journal[idx] = updated;
    return updated;
  }

  // ─── Briefing mutations ────────────────────────────────────────────────────

  addBriefing(briefing: Briefing): void {
    this.briefings.push(briefing);
  }

  // ─── Settings mutations ────────────────────────────────────────────────────

  updateWatchlistMembers(id: string, members: string[]): Watchlist | undefined {
    const idx = this.watchlists.findIndex((w) => w.id === id);
    if (idx === -1) return undefined;
    this.watchlists[idx] = { ...this.watchlists[idx]!, members };
    return this.watchlists[idx];
  }

  upsertAlertRule(rule: AlertRule): void {
    const idx = this.alertRules.findIndex((r) => r.id === rule.id);
    if (idx === -1) this.alertRules.push(rule);
    else this.alertRules[idx] = rule;
  }

  upsertModelRoute(route: ModelRoute): void {
    const idx = this.modelRoutes.findIndex((r) => r.task_kind === route.task_kind);
    if (idx === -1) this.modelRoutes.push(route);
    else this.modelRoutes[idx] = route;
  }

  updateFeedSetting(feedId: string, enabled: boolean): FeedSetting | undefined {
    const idx = this.feedSettings.findIndex((f) => f.feed_id === feedId);
    if (idx === -1) return undefined;
    this.feedSettings[idx] = { feed_id: feedId, enabled };
    return this.feedSettings[idx];
  }

  setLayoutPreference(key: string, value: unknown): void {
    const idx = this.layout.findIndex((l) => l.key === key);
    if (idx === -1) this.layout.push({ key, value });
    else this.layout[idx] = { key, value };
  }

  upsertNotificationChannel(channel: NotificationChannel): void {
    const idx = this.notifications.findIndex((n) => n.id === channel.id);
    if (idx === -1) this.notifications.push(channel);
    else this.notifications[idx] = channel;
  }

  // ─── Research jobs ─────────────────────────────────────────────────────────

  addResearchJob(job: ResearchJob): void {
    this.researchJobs.push(job);
  }

  updateResearchJob(id: string, patch: Partial<ResearchJob>): ResearchJob | undefined {
    const idx = this.researchJobs.findIndex((j) => j.id === id);
    if (idx === -1) return undefined;
    const updated = { ...this.researchJobs[idx]!, ...patch };
    this.researchJobs[idx] = updated;
    return updated;
  }
}
