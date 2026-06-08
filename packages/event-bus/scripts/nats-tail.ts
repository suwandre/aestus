/**
 * Tail selected NATS subjects and pretty-print envelopes (P05-T008). Lets a
 * developer inspect live events without writing a custom script.
 *
 *   bun run scripts/nats-tail.ts                 # tail everything (subject `>`)
 *   bun run scripts/nats-tail.ts "raw.market.>"  # tail one or more subjects
 *   bun run scripts/nats-tail.ts --max 20 "dlq.>"# stop after N messages
 *
 * Environment: NATS_URL (default nats://127.0.0.1:4222).
 */
import { connect } from "nats";
import { decodeEnvelopeBytes, formatDecoded } from "../src/inspect";

const args = process.argv.slice(2);
const maxIdx = args.indexOf("--max");
const max = maxIdx >= 0 ? Number(args[maxIdx + 1]) : Infinity;
const subjects = args.filter((a, i) => !a.startsWith("--") && i !== maxIdx + 1);
if (subjects.length === 0) subjects.push(">");

async function main() {
  const nc = await connect({ servers: process.env.NATS_URL ?? "nats://127.0.0.1:4222" });
  console.log(`tailing ${subjects.join(", ")}  (ctrl-c to stop)`);
  let count = 0;
  const subs = subjects.map((subject) => nc.subscribe(subject));

  await Promise.all(
    subs.map(async (sub) => {
      for await (const msg of sub) {
        console.log(formatDecoded(msg.subject, decodeEnvelopeBytes(msg.data)));
        count += 1;
        if (count >= max) {
          for (const s of subs) s.unsubscribe();
          break;
        }
      }
    }),
  );

  await nc.drain();
  console.log(`\n${count} message(s) inspected`);
}

main().catch((err) => {
  console.error("nats-tail failed:", err);
  process.exit(1);
});
