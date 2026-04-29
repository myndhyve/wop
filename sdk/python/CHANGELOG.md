# `wop-client` Changelog

## [1.0.0] — 2026-04-27

Aligned with WOP spec v1.0 final. Pinned to v1.0.0 alongside the spec corpus tag and the TypeScript + Go reference SDKs.

### What's covered

- All 12 documented REST endpoints have a 1:1 SDK method (discovery, workflows, runs lifecycle, SSE + poll events, cancel, fork, interrupt resolve by run + by token).
- `Idempotency-Key` supported on every mutation method via the `idempotency_key=` keyword argument.
- Synchronous-generator SSE consumer accepts `stream_mode` as a single value or a sequence (S4), accepts `buffer_ms=` query forwarding (S3), and transparently flattens `event: batch` arrays back into per-event yields.
- Trace-ID surfacing — `WopError` captures W3C `traceparent` from response headers and exposes `error.trace_id`; `str(error)` auto-suffixes `(trace=<id>)` per `observability.md` §Trace context propagation.
- Zero runtime dependencies — pure Python stdlib (`urllib`, `email`, `json`).

### Deferred to v1.x

- Async client (`AsyncWopClient` via `httpx`).
- Webhook subscription endpoints.
- Artifacts endpoints.
- Auto-retry with exponential backoff.
