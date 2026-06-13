# ADR-002 — Realtime transport: SSE over WebSocket

- Status: accepted
- Date: 2026-06-13
- Task: P15-T001

## Context

The Cockpit UI needs server-pushed updates for market state changes, feature snapshots,
anomaly detections, and briefing availability. The transport must:

1. Authenticate with the same single-user bearer token used by the REST API.
2. Work reliably from a browser without custom client libraries.
3. Operate behind standard HTTP reverse proxies (nginx).
4. Support subscription filtering to avoid client-side firehose processing.
5. Work in fixture-first mode (no live NATS) with a dev broadcaster.
6. Remain simple enough for a single developer to maintain.

The two realistic candidates are **Server-Sent Events (SSE)** and **WebSocket**.

## Decision

Use **SSE** (`Content-Type: text/event-stream`) served at `GET /api/realtime/stream`.

Key reasons:

- **Unidirectional is sufficient.** The UI never sends data back on the stream channel;
  it uses the REST API for mutations. WebSocket bidirectionality adds protocol complexity
  with no benefit here.
- **Standard HTTP.** SSE uses a plain `GET` with a long-lived streaming response — no
  protocol upgrade, no `101 Switching Protocols`. Auth is a standard `Authorization`
  header on the initial request, identical to every other API endpoint.
- **Proxy-friendly.** nginx, Caddy, and HAProxy handle chunked HTTP natively. The only
  required tuning is `X-Accel-Buffering: no` to disable response buffering. WebSocket
  needs `proxy_http_version 1.1` and `Upgrade`/`Connection` header forwarding.
- **Browser built-in reconnect.** `EventSource` handles reconnection and `Last-Event-ID`
  tracking automatically. WebSocket reconnect is application code.
- **Simpler server implementation.** A `ReadableStream` response is all that is needed
  in Bun; no `Bun.serve()` WebSocket upgrade path, no per-message framing, no ping/pong.

## Fallback behavior

- If the SSE connection drops, the browser `EventSource` reconnects with exponential
  backoff (built-in) and the server sends a `connected` event with the current sequence
  number so the client can detect missed events and re-fetch stale data via REST.
- If the server is about to restart, it broadcasts a `reconnect_required` event so
  clients can prepare before the connection drops.
- In degraded mode (NATS unavailable, fixture broadcaster inactive) the server continues
  to send `heartbeat` events so the UI can distinguish a healthy-but-quiet stream from
  a broken connection.

## Alternatives considered

| Alternative                | Reason not chosen                                                                         |
| -------------------------- | ----------------------------------------------------------------------------------------- |
| WebSocket                  | Bidirectionality unused; more complex proxy config; application-owned reconnect required  |
| HTTP polling               | High latency for market updates; wasteful for a persistent single-user process            |
| gRPC-Web streaming         | Requires additional proxy transcoder; no benefit over SSE at this scale                   |
| MQTT over WebSocket        | Additional broker dependency; over-engineered for single-user UI event delivery           |

## Consequences

- The API server must keep SSE connections open indefinitely; Bun's `ReadableStream`
  handles this without blocking the event loop.
- Nginx must be configured with `proxy_buffering off` for the `/api/realtime/stream`
  location (documented in `docs/local_dev.md`).
- The SSE endpoint is behind the same auth gate as the REST API — no anonymous access
  even in open dev mode when `API_TOKEN` is unset (open dev mode passes all requests).
- Subscription state is in-memory only; a server restart resets all connections.
  Clients must call the REST API to re-sync state after reconnect.
