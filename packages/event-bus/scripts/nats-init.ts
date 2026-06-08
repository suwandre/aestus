/**
 * Create/update JetStream streams and durable consumers from the declarative
 * topology (P05-T005). Idempotent: safe to re-run, and reproduces the full
 * setup after a JetStream reset.
 *
 *   bun run scripts/nats-init.ts            # apply against $NATS_URL
 *   bun run scripts/nats-init.ts --dry-run  # print the planned topology, no connection
 *
 * Environment:
 *   NATS_URL  NATS server URL (default nats://127.0.0.1:4222)
 *
 * Works for local/dev/prod by pointing NATS_URL at the target server.
 */
import {
  connect,
  AckPolicy,
  RetentionPolicy,
  StorageType,
  nanos,
  type JetStreamManager,
} from "nats";
import { buildStreamSpecs, buildConsumerSpecs } from "../src/topology";

const NATS_URL = process.env.NATS_URL ?? "nats://127.0.0.1:4222";
const dryRun = process.argv.includes("--dry-run");

function planText(): string {
  const streams = buildStreamSpecs();
  const consumers = buildConsumerSpecs();
  const lines: string[] = ["Planned JetStream topology:", ""];
  for (const s of streams) {
    lines.push(
      `  stream ${s.name}  subjects=[${s.subjects.join(", ")}]  ` +
        `max_age=${s.maxAgeSeconds}s  max_bytes=${s.maxBytes}`,
    );
    for (const c of consumers.filter((c) => c.stream === s.name)) {
      lines.push(`    └─ consumer ${c.durableName}  — ${c.description}`);
    }
  }
  return lines.join("\n");
}

async function applyStream(
  jsm: JetStreamManager,
  spec: ReturnType<typeof buildStreamSpecs>[number],
) {
  const config = {
    name: spec.name,
    subjects: spec.subjects,
    storage: StorageType.File,
    retention: RetentionPolicy.Limits,
    max_age: nanos(spec.maxAgeSeconds * 1000),
    max_bytes: spec.maxBytes,
  };
  try {
    await jsm.streams.info(spec.name);
    await jsm.streams.update(spec.name, config);
    console.log(`updated stream ${spec.name}`);
  } catch {
    await jsm.streams.add(config);
    console.log(`created stream ${spec.name}`);
  }
}

async function applyConsumer(
  jsm: JetStreamManager,
  spec: ReturnType<typeof buildConsumerSpecs>[number],
) {
  const config = {
    durable_name: spec.durableName,
    ack_policy: AckPolicy.Explicit,
    description: spec.description,
  };
  try {
    await jsm.consumers.info(spec.stream, spec.durableName);
    await jsm.consumers.update(spec.stream, spec.durableName, config);
    console.log(`updated consumer ${spec.stream}/${spec.durableName}`);
  } catch {
    await jsm.consumers.add(spec.stream, config);
    console.log(`created consumer ${spec.stream}/${spec.durableName}`);
  }
}

async function main() {
  if (dryRun) {
    console.log(planText());
    return;
  }
  const nc = await connect({ servers: NATS_URL });
  try {
    const jsm = await nc.jetstreamManager();
    for (const spec of buildStreamSpecs()) await applyStream(jsm, spec);
    for (const spec of buildConsumerSpecs()) await applyConsumer(jsm, spec);
    console.log(`NATS topology applied to ${NATS_URL}`);
  } finally {
    await nc.drain();
  }
}

main().catch((err) => {
  console.error("nats-init failed:", err);
  process.exit(1);
});
