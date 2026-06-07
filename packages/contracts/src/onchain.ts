import { z } from "zod/v4";
import { Id, SchemaVersion, Timestamp } from "./common";

const Base = z.object({
  schema_version: SchemaVersion,
  /** Chain, e.g. `bitcoin`, `ethereum`. */
  chain: z.string().min(1),
  /** FK to `AssetIdentity.canonical_id` (or bare symbol for chain-native assets). */
  asset: Id,
  timestamp: Timestamp,
  /** On-chain data provider, e.g. `glassnode`, `nansen`, `arkham`. */
  source: z.string().min(1),
});

/** Net or directional movement of an asset to/from exchanges. */
const ExchangeFlow = Base.extend({
  event_type: z.literal("exchange_flow"),
  /** `net` allows a signed `amount` (positive = net inflow to exchanges). */
  direction: z.enum(["inflow", "outflow", "net"]),
  /** Amount in asset units (signed when `direction` is `net`). */
  amount: z.number(),
  amount_usd: z.number().optional(),
  /** Exchange this flow concerns; absent for aggregate netflow. */
  exchange: z.string().optional(),
});

/** A large single transfer between labeled wallets. */
const WhaleTransfer = Base.extend({
  event_type: z.literal("whale_transfer"),
  amount: z.number().positive(),
  amount_usd: z.number().optional(),
  from_label: z.string().optional(),
  to_label: z.string().optional(),
  /** Interpretation of the move relative to supply. */
  classification: z.enum(["accumulation", "distribution", "neutral"]).optional(),
  tx_hash: z.string().optional(),
});

const StablecoinMintBurn = Base.extend({
  event_type: z.literal("stablecoin_mint_burn"),
  action: z.enum(["mint", "burn"]),
  /** Stablecoin symbol, e.g. `USDT`, `USDC`. */
  stablecoin: z.string().min(1),
  amount: z.number().positive(),
});

const TokenUnlock = Base.extend({
  event_type: z.literal("token_unlock"),
  amount: z.number().positive(),
  amount_usd: z.number().optional(),
  /** Unlock bucket, e.g. `team`, `investors`, `ecosystem`. */
  category: z.string().optional(),
});

const DexActivity = Base.extend({
  event_type: z.literal("dex_activity"),
  /** DEX/venue name, e.g. `uniswap-v3`. */
  dex: z.string().min(1),
  pool: z.string().optional(),
  volume_usd: z.number().nonnegative(),
  activity_type: z.enum(["swap", "add_liquidity", "remove_liquidity"]).optional(),
});

/** Discriminated union of all on-chain event variants. */
export const OnChainEvent = z.discriminatedUnion("event_type", [
  ExchangeFlow,
  WhaleTransfer,
  StablecoinMintBurn,
  TokenUnlock,
  DexActivity,
]);
export type OnChainEvent = z.infer<typeof OnChainEvent>;
