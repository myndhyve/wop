# `wop-client` — Python Reference SDK (scaffold)

> **Status: FINAL v1.0 (2026-04-27).** Synchronous Python client for the WOP REST surface. Mirrors the TypeScript SDK at `../typescript/`. Not yet published to PyPI.

A zero-dependency Python client for any WOP-compliant server. Wraps the canonical REST endpoints with typed dataclasses, and ships a pure-stdlib SSE iterator for `GET /v1/runs/{runId}/events`.

This SDK is hand-authored rather than codegen'd from OpenAPI. Same rationale as the TypeScript SDK — see `../typescript/README.md` §rationale.

---

## Quickstart

```python
from wop_client import (
    WopClient,
    CreateRunRequest,
    ForkRunRequest,
    ResolveInterruptRequest,
)

client = WopClient(
    base_url="https://api.example.com",
    api_key="hk_test_abc123",
)

# Discovery (no auth required)
caps = client.discovery_capabilities()
print(caps.protocolVersion, caps.limits.envelopesPerTurn)

# Run lifecycle
resp = client.runs_create(CreateRunRequest(workflowId="my-wf", inputs={"foo": "bar"}))
run_id = resp.runId

# Poll for completion (or use SSE — see below)
while True:
    snap = client.runs_get(run_id)
    if snap.status in {"completed", "failed", "cancelled"}:
        break
    import time; time.sleep(0.5)

# HITL approval (run-scoped)
client.interrupts_resolve_by_run(
    run_id, "gate",
    ResolveInterruptRequest(resumeValue={"action": "accept"}),
)

# Replay / fork
fork = client.runs_fork(run_id, ForkRunRequest(fromSeq=5, mode="branch"))

# SSE stream (synchronous generator)
for event in client.runs_events(run_id, stream_mode="updates"):
    print(event.type, event.payload)
```

---

## Install (dev, from local checkout)

```bash
cd sdk/python
python -m venv .venv && source .venv/bin/activate
pip install -e .[dev]
```

Once published, install will be:

```bash
pip install wop-client
```

---

## What's covered (v0.1)

| Endpoint | SDK method |
|---|---|
| `GET /.well-known/wop` | `client.discovery_capabilities()` |
| `GET /v1/openapi.json` | `client.discovery_openapi()` |
| `GET /v1/workflows/{id}` | `client.workflows_get(id)` |
| `POST /v1/runs` | `client.runs_create(body, idempotency_key=..., dedup=...)` |
| `GET /v1/runs/{id}` | `client.runs_get(id)` |
| `GET /v1/runs/{id}/events` (SSE) | `client.runs_events(id, stream_mode=...)` (sync generator) |
| `GET /v1/runs/{id}/events/poll` | `client.runs_poll_events(id, last_sequence=..., timeout_seconds=...)` |
| `POST /v1/runs/{id}/cancel` | `client.runs_cancel(id, body=..., idempotency_key=...)` |
| `POST /v1/runs/{id}:fork` | `client.runs_fork(id, body, idempotency_key=...)` |
| `POST /v1/runs/{id}/interrupts/{nodeId}` | `client.interrupts_resolve_by_run(id, node_id, body)` |
| `GET /v1/interrupts/{token}` | `client.interrupts_inspect_by_token(token)` |
| `POST /v1/interrupts/{token}` | `client.interrupts_resolve_by_token(token, body)` |

**Idempotency-Key** is supported via the `idempotency_key=` keyword argument on every mutation method.

**Trace-ID surfacing**: `WopError` captures the W3C `traceparent` from response headers and exposes `error.trace_id` (32-hex). `str(error)` auto-suffixes `(trace=<id>)` so logs are searchable against backend traces per `observability.md` §Trace context propagation.

---

## What's deferred to v0.2

| Feature | Why |
|---|---|
| Async client (`AsyncWopClient` via httpx) | Sync stdlib API works for v0.1; async needs a non-stdlib HTTP lib. |
| Webhook subscription endpoints | Webhook spec still loose. |
| Artifacts endpoints | Spec stub; signature unstable. |
| Auto-retry with exponential backoff | Stable retry policy needs cross-impl agreement. |

---

## Layout

```
sdk/python/
  README.md                 — this file
  pyproject.toml            — PEP 621 packaging (hatchling)
  src/wop_client/
    __init__.py             — public exports + __version__
    types.py                — dataclasses + Literal aliases
    errors.py               — WopError (with traceparent capture)
    client.py               — WopClient sync API
    sse.py                  — generator-based SSE consumer (pure stdlib)
```

---

## Versioning

Pre-1.0. Breaking changes may land between minor versions until v1.0. Tracks the WOP protocol version (currently `1.0.0`).

## References

- Spec corpus: `../../README.md`
- OpenAPI: `../../api/openapi.yaml` (the SDK mirrors this surface)
- AsyncAPI: `../../api/asyncapi.yaml` (the SSE consumer follows these channels)
- TypeScript counterpart: `../typescript/`
- WOP plan P2-F3: reference SDKs (TypeScript first, Python next)
