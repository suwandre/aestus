/**
 * Frontend SSE client for Aestus realtime stream.
 * Handles connection, reconnection, and event dispatch.
 */
import type { UIEvent } from "@aestus/contracts";

type Status = "connecting" | "connected" | "disconnected" | "error";
type Handler = (event: UIEvent) => void;

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";
const MAX_RETRIES = 5;
const RETRY_DELAY_MS = 3000;

export class RealtimeClient {
  private url: string;
  private es: EventSource | null = null;
  private handlers: Set<Handler> = new Set();
  private status: Status = "disconnected";
  private lastSeq = -1;
  private retries = 0;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(url: string) {
    this.url = url;
  }

  connect(): void {
    if (this.es) return;
    this.status = "connecting";
    this.openEventSource();
  }

  disconnect(): void {
    if (this.retryTimer !== null) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
    if (this.es) {
      this.es.close();
      this.es = null;
    }
    this.status = "disconnected";
    this.retries = 0;
  }

  on(handler: Handler): () => void {
    this.handlers.add(handler);
    return () => {
      this.handlers.delete(handler);
    };
  }

  getStatus(): Status {
    return this.status;
  }

  getLastSeq(): number {
    return this.lastSeq;
  }

  private openEventSource(): void {
    const es = new EventSource(this.url);
    this.es = es;

    es.onopen = () => {
      this.status = "connected";
      this.retries = 0;
    };

    es.onmessage = (e: MessageEvent<string>) => {
      try {
        const event = JSON.parse(e.data) as UIEvent;
        if ("seq" in event && typeof event.seq === "number") {
          this.lastSeq = event.seq;
        }
        for (const handler of this.handlers) {
          handler(event);
        }
      } catch {
        // Malformed JSON — ignore
      }
    };

    es.onerror = () => {
      this.status = "error";
      es.close();
      this.es = null;
      this.scheduleReconnect();
    };
  }

  private scheduleReconnect(): void {
    if (this.retries >= MAX_RETRIES) {
      this.status = "error";
      return;
    }
    this.retries += 1;
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      if (this.status !== "disconnected") {
        this.status = "connecting";
        this.openEventSource();
      }
    }, RETRY_DELAY_MS);
  }
}

export function createRealtimeClient(params?: {
  asset?: string;
  watchlist?: string;
}): RealtimeClient {
  const url = new URL(`${API_BASE}/api/realtime/stream`);
  if (params?.asset) {
    url.searchParams.set("asset", params.asset);
  }
  if (params?.watchlist) {
    url.searchParams.set("watchlist", params.watchlist);
  }
  return new RealtimeClient(url.toString());
}
