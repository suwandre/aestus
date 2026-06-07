import { z } from "zod/v4";
import { Id, Timestamp } from "./common";

/** Where a news/narrative item came from. `social` reserved for future feeds. */
export const NewsSourceType = z.enum(["rss", "news", "social", "other"]);
export type NewsSourceType = z.infer<typeof NewsSourceType>;

export const Sentiment = z.enum(["positive", "neutral", "negative"]);
export type Sentiment = z.infer<typeof Sentiment>;

/**
 * A news / narrative item. The schema is source-agnostic so RSS, news APIs,
 * and future social feeds all populate the same shape (`source_type`
 * distinguishes them). `entities` link to canonical asset ids or named tickers.
 */
export const NewsItem = z.object({
  id: Id,
  title: z.string().min(1),
  url: z.url(),
  /** Publisher / handle, e.g. `coindesk`, `@whale_alert`. */
  source: z.string().min(1),
  source_type: NewsSourceType.default("news"),
  published_at: Timestamp,
  /** Mentioned entities — canonical asset ids, tickers, orgs, people. */
  entities: z.array(z.string()).default([]),
  summary: z.string().min(1),
  /** Model/heuristic relevance, 0 (noise) to 1 (high signal). */
  relevance_score: z.number().min(0).max(1),
  sentiment: Sentiment,
  tags: z.array(z.string()).default([]),
});
export type NewsItem = z.infer<typeof NewsItem>;
