import { describe, expect, test } from "bun:test";
import { SystemHealth } from "@aestus/contracts";
import { InMemoryBus, buildHealth, publishHealth, startHeartbeat } from "../src/index";

describe("heartbeat publisher", () => {
  test("overall status is the worst dependency; uptime is computed", () => {
    const health = buildHealth(
      {
        service: "ingestion",
        version: "0.1.0",
        intervalMs: 1000,
        startedAtMs: 1000,
        dependencies: () => [
          { name: "nats", status: "ok" },
          { name: "binance", status: "degraded", detail: "slow" },
        ],
      },
      6000,
    );
    expect(health.status).toBe("degraded");
    expect(health.uptime_seconds).toBe(5);
    SystemHealth.parse(health);
  });

  test("publishHealth emits a validated SystemHealth on system.health.<service>", async () => {
    const bus = new InMemoryBus();
    const received: SystemHealth[] = [];
    await bus.subscribe("system.health.>", SystemHealth, (h) => received.push(h));

    await publishHealth(bus, {
      service: "features",
      version: "0.2.0",
      intervalMs: 1000,
      now: () => 0,
    });

    expect(received.length).toBe(1);
    expect(received[0]!.service).toBe("features");
    expect(received[0]!.status).toBe("ok");
    await bus.close();
  });

  test("startHeartbeat publishes immediately and can be stopped", async () => {
    const bus = new InMemoryBus();
    let count = 0;
    await bus.subscribe("system.health.>", SystemHealth, () => {
      count += 1;
    });

    const handle = startHeartbeat(bus, {
      service: "api",
      version: "1.0.0",
      intervalMs: 100_000, // long; we only assert the immediate tick here
    });
    // Immediate publish is async; let it settle.
    await new Promise((r) => setTimeout(r, 0));
    await handle.unsubscribe();

    expect(count).toBe(1);
    await bus.close();
  });
});
