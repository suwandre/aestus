/**
 * Context service runtime (P11-T001 skeleton).
 *
 * Subscribes to `anomaly.detected.>`, assembles a context packet for each
 * anomaly, and publishes it on `context.packet.<asset>`. Assembly is injected
 * (`assemble`) so later P11 tasks can layer in real queries and tests can stub
 * it. The trigger's trace id is propagated to the published packet.
 */
import {
  type AnomalyEvent,
  AnomalyEvent as AnomalyEventSchema,
  ANOMALY_DETECTED,
  type ContextPacket,
} from "@aestus/contracts";
import type { EventBus, Subscription } from "@aestus/event-bus";
import type { ContextConfig } from "./config";
import { assembleContextPacket } from "./builder";
import { publishContextPacket } from "./publish";
import type { ContextMetrics } from "./health";
import type { ContextDataSource } from "./data/source";

export interface ContextServiceDeps {
  bus: EventBus;
  config: ContextConfig;
  metrics: ContextMetrics;
  /** Assembly function; defaults to {@link assembleContextPacket}. */
  assemble?: (trigger: AnomalyEvent) => ContextPacket | Promise<ContextPacket>;
  /** Clock injected into the default assembler. */
  now?: () => Date;
  /** Data source the default assembler reads from. */
  dataSource?: ContextDataSource;
}

/** Assemble and publish a packet for one anomaly; returns the packet. */
export async function processAnomaly(
  trigger: AnomalyEvent,
  deps: ContextServiceDeps,
  traceId?: string,
): Promise<ContextPacket> {
  const assemble =
    deps.assemble ??
    ((t: AnomalyEvent) =>
      assembleContextPacket(t, {
        ...(deps.now !== undefined ? { now: deps.now } : {}),
        ...(deps.dataSource !== undefined ? { dataSource: deps.dataSource } : {}),
        correlatedAssets: deps.config.correlatedAssets,
        venueThresholds: {
          fundingDispersion: deps.config.venueFundingDispersion,
          basisDispersionBps: deps.config.venueBasisDispersionBps,
        },
        newsWindowMinutes: deps.config.newsWindowMinutes,
        newsMinRelevance: deps.config.newsMinRelevance,
        macroWindowHours: deps.config.macroWindowHours,
        macroMinImportance: deps.config.macroMinImportance,
        onChainWindowHours: deps.config.onChainWindowHours,
        analogueLimit: deps.config.analogueLimit,
      }));
  const packet = await assemble(trigger);
  await publishContextPacket(deps.bus, packet, {
    source: deps.config.service,
    ...(traceId !== undefined ? { traceId } : {}),
  });
  deps.metrics.packetsBuilt += 1;
  return packet;
}

/**
 * Start consuming anomalies. Returns the subscription; call `unsubscribe()` to
 * stop. Decode/validation failures are logged and counted, never thrown, so a
 * single poison message can't kill the consumer.
 */
export async function startContextService(deps: ContextServiceDeps): Promise<Subscription> {
  return deps.bus.subscribe(
    `${ANOMALY_DETECTED.base}.>`,
    AnomalyEventSchema,
    async (trigger, envelope) => {
      deps.metrics.lastAnomalyEpochMs =
        Date.parse(envelope.emitted_at) || deps.metrics.lastAnomalyEpochMs;
      try {
        await processAnomaly(trigger, deps, envelope.trace_id);
      } catch (err) {
        deps.metrics.errors += 1;
        console.error(`[context] failed to assemble packet for ${trigger.id}:`, err);
      }
    },
    {
      onError: (error, _raw, subj) => {
        deps.metrics.errors += 1;
        console.error(`[context] bad anomaly message on ${subj}:`, error);
      },
    },
  );
}
