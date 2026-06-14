/**
 * Typed frontend API client for Aestus backend.
 * All methods require the bearer token from NEXT_PUBLIC_API_TOKEN.
 */
import type {
  AssetIdentity as Asset,
  FeatureSnapshot,
  VenueQuote,
  AnomalyEvent as Anomaly,
  Briefing,
  Decision,
  JournalTrade as JournalEntry,
} from "@aestus/contracts";

// ResearchQuery is not yet in contracts; use a local placeholder shape.
export interface ResearchQuery {
  id: string;
  question: string;
  asset_id?: string;
  status: "pending" | "running" | "done" | "error";
  answer?: string;
  created_at: string;
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";
const API_TOKEN = process.env.NEXT_PUBLIC_API_TOKEN ?? "";

class ApiClient {
  private async request<T>(
    path: string,
    options: RequestInit = {},
    params?: Record<string, string | number | undefined>,
  ): Promise<T> {
    const url = new URL(`${API_BASE}${path}`);
    if (params) {
      for (const [key, val] of Object.entries(params)) {
        if (val !== undefined) {
          url.searchParams.set(key, String(val));
        }
      }
    }
    const res = await fetch(url.toString(), {
      ...options,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${API_TOKEN}`,
        ...options.headers,
      },
    });
    if (!res.ok) {
      throw new Error(`API error ${res.status}: ${res.statusText}`);
    }
    return res.json() as Promise<T>;
  }

  healthCheck(): Promise<{ status: string; ts: string }> {
    return this.request("/api/health");
  }

  getAssets(params?: { asset_class?: string }): Promise<Asset[]> {
    return this.request("/api/assets", {}, params);
  }

  getWatchlists(): Promise<unknown[]> {
    return this.request("/api/watchlists");
  }

  getMarketLatest(assetId: string): Promise<FeatureSnapshot> {
    return this.request(`/api/market/${encodeURIComponent(assetId)}/latest`);
  }

  getVenueQuotes(assetId: string): Promise<VenueQuote[]> {
    return this.request(`/api/market/${encodeURIComponent(assetId)}/quotes`);
  }

  getCandles(assetId: string, params?: { timeframe?: string; limit?: number }): Promise<unknown[]> {
    return this.request(`/api/market/${encodeURIComponent(assetId)}/candles`, {}, params);
  }

  getAnomalies(params?: {
    status?: string;
    asset_id?: string;
    limit?: number;
  }): Promise<Anomaly[]> {
    return this.request("/api/anomalies", {}, params);
  }

  getBriefings(params?: { asset_id?: string; stance?: string }): Promise<Briefing[]> {
    return this.request("/api/briefings", {}, params);
  }

  getBriefing(id: string): Promise<Briefing> {
    return this.request(`/api/briefings/${encodeURIComponent(id)}`);
  }

  createDecision(body: {
    briefing_id?: string;
    asset_id?: string;
    action: string;
    notes?: string;
  }): Promise<Decision> {
    return this.request("/api/decisions", {
      method: "POST",
      body: JSON.stringify(body),
    });
  }

  getJournal(params?: {
    asset_id?: string;
    status?: string;
    limit?: number;
  }): Promise<JournalEntry[]> {
    return this.request("/api/journal", {}, params);
  }

  postResearch(body: { question: string; asset_id?: string }): Promise<{ id: string }> {
    return this.request("/api/research", {
      method: "POST",
      body: JSON.stringify(body),
    });
  }

  getResearch(id: string): Promise<ResearchQuery> {
    return this.request(`/api/research/${encodeURIComponent(id)}`);
  }

  getDataSourceHealth(): Promise<unknown[]> {
    return this.request("/api/data-sources/health");
  }
}

export type { Asset, FeatureSnapshot, VenueQuote, Anomaly, Briefing, Decision, JournalEntry };
export const api = new ApiClient();
