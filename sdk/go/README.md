# `wopclient` — Go Reference SDK (scaffold)

> **Status: FINAL v1.0 (2026-04-27).** Synchronous Go client for the WOP REST surface. Mirrors the TypeScript and Python SDKs (same endpoint coverage, idiomatic Go shape). Not yet published as a Go module.

A zero-dependency Go client for any WOP-compliant server. Wraps the canonical REST endpoints with strongly-typed structs, and ships a channel-based SSE consumer for `GET /v1/runs/{runId}/events`.

This SDK is hand-authored rather than codegen'd from OpenAPI. Same rationale as the TypeScript SDK — see `../typescript/README.md` §rationale.

---

## Quickstart

```go
package main

import (
    "context"
    "fmt"
    "log"

    wopclient "github.com/myndhyve/wop/sdk/go/v1"
)

func main() {
    client, err := wopclient.NewClient("https://api.example.com", "hk_test_abc123")
    if err != nil {
        log.Fatal(err)
    }
    ctx := context.Background()

    // Discovery (no auth required)
    caps, err := client.GetCapabilities(ctx)
    if err != nil { log.Fatal(err) }
    fmt.Println(caps.ProtocolVersion, caps.Limits.EnvelopesPerTurn)

    // Run lifecycle
    resp, err := client.CreateRun(ctx,
        wopclient.CreateRunRequest{
            WorkflowID: "my-wf",
            Inputs:     map[string]any{"foo": "bar"},
        },
        wopclient.MutationOptions{},
    )
    if err != nil { log.Fatal(err) }

    // SSE stream
    events, cleanup, err := client.StreamEvents(ctx, resp.RunID,
        wopclient.StreamEventsOptions{StreamMode: wopclient.StreamModeUpdates})
    if err != nil { log.Fatal(err) }
    defer cleanup()
    for ev := range events {
        fmt.Println(ev.Type, ev.Payload)
    }
}
```

---

## Install (dev, from local checkout)

```bash
cd sdk/go
go vet ./...
go test ./...   # tests are forthcoming; v0.1 ships scaffold only
```

Once published, install will be:

```bash
go get github.com/myndhyve/wop/sdk/go/v1
```

---

## What's covered (v0.1)

| Endpoint | SDK method |
|---|---|
| `GET /.well-known/wop` | `client.GetCapabilities(ctx)` |
| `GET /v1/openapi.json` | `client.GetOpenAPI(ctx)` |
| `GET /v1/workflows/{id}` | `client.GetWorkflow(ctx, id)` |
| `POST /v1/runs` | `client.CreateRun(ctx, body, opts)` |
| `GET /v1/runs/{id}` | `client.GetRun(ctx, id)` |
| `GET /v1/runs/{id}/events` (SSE) | `client.StreamEvents(ctx, id, opts) → (<-chan, cleanup, err)` |
| `GET /v1/runs/{id}/events/poll` | `client.PollRunEvents(ctx, id, opts)` |
| `POST /v1/runs/{id}/cancel` | `client.CancelRun(ctx, id, body, opts)` |
| `POST /v1/runs/{id}:fork` | `client.ForkRun(ctx, id, body, opts)` |
| `POST /v1/runs/{id}/interrupts/{nodeId}` | `client.ResolveInterruptByRun(ctx, id, nodeID, body, opts)` |
| `GET /v1/interrupts/{token}` | `client.InspectInterruptByToken(ctx, token)` |
| `POST /v1/interrupts/{token}` | `client.ResolveInterruptByToken(ctx, token, body, opts)` |

**Idempotency-Key + X-Dedup** are passed via `MutationOptions{IdempotencyKey: "...", Dedup: true}` on every mutation.

**Trace-ID surfacing**: `*WopError` captures the W3C `Traceparent` from response headers and exposes `err.TraceID` (32-hex). `err.Error()` auto-suffixes `(trace=<id>)` so logs are searchable against backend traces per `observability.md` §Trace context propagation.

---

## SSE shape

```go
events, cleanup, err := client.StreamEvents(ctx, runID, wopclient.StreamEventsOptions{...})
defer cleanup()
for ev := range events {
    // ev is wopclient.RunEventDoc
}
```

The channel closes when the server closes the SSE stream (terminal run event), when ctx is cancelled, or when cleanup is called. Buffered with 16 slots; backpressure on slow consumers.

Per-event decode errors (non-JSON keep-alive, vendor extensions) are silently skipped — the consumer gets only valid `RunEventDoc` values.

---

## What's deferred to v0.2

| Feature | Why |
|---|---|
| Webhook subscription endpoints | Webhook spec still loose. |
| Artifacts endpoints | Spec stub; signature unstable. |
| Auto-retry with exponential backoff | Stable retry policy needs cross-impl agreement. |
| Builder-pattern API | Current method-positional API is fine for v0.1. |

---

## Layout

```
sdk/go/
  README.md       — this file
  go.mod          — Go module declaration (>=1.22)
  types.go        — Structs + JSON tags for every spec shape
  errors.go       — WopError (with traceparent capture)
  client.go       — WopClient sync API (12 endpoint methods)
  sse.go          — channel-based SSE consumer (pure stdlib)
```

---

## Versioning

Pre-1.0. Breaking changes may land between minor versions until v1.0. Tracks the WOP protocol version (currently `1.0.0`).

## References

- Spec corpus: `../../README.md`
- OpenAPI: `../../api/openapi.yaml` (the SDK mirrors this surface)
- AsyncAPI: `../../api/asyncapi.yaml` (the SSE consumer follows these channels)
- TypeScript counterpart: `../typescript/`
- Python counterpart: `../python/`
- WOP plan P2-F3: reference SDKs (TypeScript first, Python next, Go last)
