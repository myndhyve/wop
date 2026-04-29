# `@myndhyve/wop` — TypeScript Reference SDK (scaffold)

> **Status: FINAL v1.0 (2026-04-27).** Hand-authored thin client for the WOP REST surface. Mirrors `../api/openapi.yaml`. Not yet published to npm.

A zero-runtime-dep TypeScript client for any WOP-compliant server. Wraps the canonical REST endpoints with a typed surface, and ships a small SSE helper for `GET /v1/runs/{runId}/events`.

This SDK is hand-authored rather than codegen'd from OpenAPI for two reasons:

1. **Idiomatic shape.** OpenAPI codegen produces verbose accessors (`api.runs.runs_create()`, etc.) that are nicer if hand-curated. A 1.0 reference SDK should set the API style other ecosystems (Python, Go) follow.
2. **Stays close to the spec.** Each method maps 1:1 to a documented endpoint, and types come from the spec's JSON Schemas (referenced via the OpenAPI doc), not from a generator's intermediate representation.

---

## Quickstart

```typescript
import { WopClient } from '@myndhyve/wop';

const client = new WopClient({
  baseUrl: 'https://api.example.com',
  apiKey: 'hk_test_abc123',
});

// Discovery
const caps = await client.discovery.capabilities();
console.log(caps.protocolVersion, caps.limits);

// Workflows
const wf = await client.workflows.get('my-workflow-id');

// Run lifecycle
const { runId } = await client.runs.create({
  workflowId: 'my-workflow-id',
  inputs: { foo: 'bar' },
});

// Poll (or use SSE — see below)
let snap = await client.runs.get(runId);
while (snap.status !== 'completed' && snap.status !== 'failed') {
  await new Promise((r) => setTimeout(r, 500));
  snap = await client.runs.get(runId);
}

// Cancel mid-flight
await client.runs.cancel(runId, { reason: 'user request' });

// HITL approval (run-scoped)
await client.interrupts.resolveByRun(runId, 'gate', { resumeValue: { action: 'accept' } });

// Replay / fork
const fork = await client.runs.fork(runId, { fromSeq: 5, mode: 'branch' });

// SSE stream
for await (const event of client.runs.events(runId, { streamMode: 'updates' })) {
  console.log(event.type, event.payload);
}
```

---

## Quickstart (Node)

```bash
cd sdk/typescript
npm install        # installs @myndhyve/wop deps locally (NOT in parent monorepo)
npx tsc --noEmit   # typecheck the SDK source
```

---

## What's covered (v0.1)

| Endpoint | SDK method |
|---|---|
| `GET /.well-known/wop` | `client.discovery.capabilities()` |
| `GET /v1/openapi.json` | `client.discovery.openapi()` |
| `GET /v1/workflows/{id}` | `client.workflows.get(id)` |
| `POST /v1/runs` | `client.runs.create(body, opts?)` |
| `GET /v1/runs/{id}` | `client.runs.get(id)` |
| `GET /v1/runs/{id}/events` (SSE) | `client.runs.events(id, opts?)` (async iterable) |
| `GET /v1/runs/{id}/events/poll` | `client.runs.pollEvents(id, opts?)` |
| `POST /v1/runs/{id}/cancel` | `client.runs.cancel(id, body?)` |
| `POST /v1/runs/{id}:fork` | `client.runs.fork(id, body)` |
| `POST /v1/runs/{id}/interrupts/{nodeId}` | `client.interrupts.resolveByRun(id, nodeId, body)` |
| `GET /v1/interrupts/{token}` | `client.interrupts.inspectByToken(token)` |
| `POST /v1/interrupts/{token}` | `client.interrupts.resolveByToken(token, body)` |

**Idempotency-Key** is supported via the `idempotencyKey` option on every mutation method.

**Typed `RunConfigurable`** — `client.runs.create(...).configurable` is now a typed surface with reserved keys (`recursionLimit`, `model`, `temperature`, `maxTokens`, `promptOverrides`) plus pass-through for impl extensions.

---

## What's deferred to v0.3

| Feature | Why |
|---|---|
| Webhook subscription endpoints | Webhook spec still loose; implement once `webhooks.md` is in DRAFT. |
| Artifacts endpoints | Spec stub; signature unstable. |
| Auto-retry with exponential backoff | Stable retry policy needs cross-impl agreement. |
| Browser bundle (`@myndhyve/wop/browser`) | Hand-rolled SSE works in Node; browser fetch+ReadableStream is similar but needs separate testing. |

---

## Layout

```
sdk/typescript/
  README.md                  — this file
  package.json               — @myndhyve/wop scaffold (NOT a workspace member)
  tsconfig.json              — strict TS, ESM
  src/
    index.ts                 — public surface (WopClient + types)
    client.ts                — WopClient class (auth, request helper)
    types.ts                 — request/response types mirrored from the OpenAPI spec
    sse.ts                   — async-iterable SSE consumer
```

---

## Versioning

This SDK pins to a specific WOP protocol version (`X.Y.Z`). Mismatch behavior is forward-compat tolerant — see `../../version-negotiation.md`. Breaking spec changes will increment the SDK major.

## References

- Spec corpus: `../../README.md`
- OpenAPI: `../../api/openapi.yaml` (the SDK mirrors this surface)
- AsyncAPI: `../../api/asyncapi.yaml` (the SSE consumer follows these channels)
- WOP plan P2-F3: TypeScript reference SDK
