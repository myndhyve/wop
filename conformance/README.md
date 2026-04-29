# WOP Conformance Test Suite — `@myndhyve/wop-conformance` (scaffold)

> **Status: 1.7.0 (2026-04-29).** Seventh minor release — adds vendor-neutral redaction scenarios (NFR-7) gated on `secrets.supported`. Spec-side companion to in-tree redaction harnesses; black-box assertions that any WOP-compliant server doesn't leak canary content via response bodies, 401 envelopes, or RunEvent payloads. Previously: 1.6.0 (2026-04-28) closed the post-v1.0 ecosystem trigger set (G1–G6) with cost-attribution placeholder scenarios. See `CHANGELOG.md` below.

Black-box conformance suite for any WOP-compliant server. Point it at a server URL + API key; it issues HTTP requests against the spec'd endpoints and asserts that responses match the spec.

This package is intentionally self-contained — it does NOT depend on the reference implementation. A future spec-compliant server written in any language can run this suite against itself by spinning up its server, exporting the env vars, and running `npx vitest run`.

---

## Quickstart

Two ways to run: the friendly `wop-conformance` CLI (recommended for
operators) or `vitest` directly (recommended for CI).

### CLI

```bash
cd conformance
npm install

# Build the CLI binary
npm run build:cli

# Server-free subset (no deployment target needed)
./dist/cli.js --offline

# Full suite against a deployed server
./dist/cli.js \
  --base-url https://api.example.com \
  --api-key hk_test_abc123 \
  --impl acme-wop-server --impl-version 1.0.0

# Filter by test-name pattern
./dist/cli.js --base-url ... --api-key ... --filter "discovery|errors"
```

`./dist/cli.js --help` for the full flag reference. Env vars
(`WOP_BASE_URL`, `WOP_API_KEY`, `WOP_IMPLEMENTATION_*`) override CLI
flags only when the flag is unset.

### Direct vitest

```bash
cd conformance
npm install

export WOP_BASE_URL="https://api.example.com"
export WOP_API_KEY="hk_test_..."

npx vitest run                                 # full suite
npx vitest run src/scenarios/discovery.test.ts # single file
```

Exit code is non-zero on any failed assertion.

---

## What's covered (v0.6)

Server-free (run anywhere, including CI without a deployment target):

| Category | Spec doc | Coverage |
|---|---|---|
| **Fixtures** | [`fixtures.md`](./fixtures.md) | Every fixture JSON in `fixtures/*.json` validates against `../schemas/workflow-definition.schema.json`; `id` matches filename; manual trigger present. (12 assertions) |
| **Spec corpus** | the whole `` tree | JSON Schemas compile under Ajv2020; OpenAPI 3.1 + AsyncAPI 3.1 YAMLs structurally valid + their `$ref`s resolve; every prose `.md` carries a `Status:` legend tag; `fixtures.md` ↔ `fixtures/*.json` round-trip is consistent. (24 assertions) |

Server-required (requires `WOP_BASE_URL` + `WOP_API_KEY` + seeded fixtures):

| Category | Spec doc | Coverage |
|---|---|---|
| **Discovery** | [`capabilities.md`](../capabilities.md) | `/.well-known/wop` returns valid Capabilities shape with required fields; `Cache-Control` present; non-zero limits. |
| **Discovery** | [`rest-endpoints.md`](../rest-endpoints.md) | `/v1/openapi.json` returns a parseable OpenAPI 3.1 document. |
| **Auth** | [`auth.md`](../auth.md) | Missing/invalid API key returns `401` with canonical error envelope. |
| **Errors** | [`rest-endpoints.md`](../rest-endpoints.md) | All error responses share the `{error, message, details?}` envelope. |
| **Run lifecycle** | [`rest-endpoints.md`](../rest-endpoints.md) + [`fixtures.md`](./fixtures.md) | `POST /v1/runs` with `conformance-noop` fixture reaches terminal `completed` within bounded time. |
| **Idempotency** | [`idempotency.md`](../idempotency.md) | Same `Idempotency-Key` + same body replays (carries `WOP-Idempotent-Replay` header, returns same runId); same key + different body returns 409. |
| **Cancellation** | [`rest-endpoints.md`](../rest-endpoints.md) | `POST /v1/runs/{runId}/cancel` mid-flight on `conformance-cancellable` reaches terminal `cancelled` within 5s. |
| **HITL approval** | [`interrupt.md`](../interrupt.md) | `conformance-approval` suspends at `waiting-approval`; `{action: 'accept'}` resolve drives terminal `completed`. Invalid action and unknown nodeId return 400/422 and 404. |
| **HITL clarification** | [`interrupt.md`](../interrupt.md) | `conformance-clarification` suspends at `waiting-input`; `{answers: {q1: ...}}` resolve drives terminal `completed`. |
| **Failure path** | [`rest-endpoints.md`](../rest-endpoints.md) | `conformance-failure` reaches terminal `failed`; `RunSnapshot.error` is `{code: string, message: string}`. |
| **Identity passthrough** | [`fixtures.md`](./fixtures.md) | `conformance-identity` deep-equals nested JSON input through `inputs.payload` → `variables.payload`. |
| **Multi-node ordering** | [`fixtures.md`](./fixtures.md) | `conformance-multi-node` emits `node.completed` events for nodeIds a, b, c in topological order via `event.sequence`. Exercises `GET /v1/runs/{runId}/events/poll`. |
| **Stream modes** | [`stream-modes.md`](../stream-modes.md) | `updates` mode emits `run.started` + `run.completed` and the server closes on terminal; unsupported `streamMode` returns 400 with `supported` array; `debug` mode event count ≥ `updates` mode. Uses `conformance-delay` and a hand-rolled SSE client. |
| **Replay / fork** | [`replay.md`](../replay.md) | `POST /v1/runs/{runId}:fork` from a finished `conformance-noop` run reaches terminal `completed` in both `replay` and `branch` modes. Validation: negative `fromSeq` → 400; `fromSeq` past source log → 422; `replay` + non-empty overlay → 400; fork on unknown run → 404. |
| **Version negotiation** | [`version-negotiation.md`](../version-negotiation.md) + [`run-event.schema.json`](../schemas/run-event.schema.json) | `Capabilities.protocolVersion` advertised; every persisted event carries the 6 required `RunEventDoc` fields (`eventId`, `runId`, `type`, `payload`, `timestamp`, `sequence`); per-run sequence is strictly monotonic; `events/poll?lastSequence=` past end returns 200+empty (not 4xx). Cross-version compat scenarios deferred — need server-controllable `engineVersion` releases. |

Server-required (added in 1.1.0):

| Category | Spec doc | Coverage |
|---|---|---|
| **Cap breach (recursion limit)** | [`run-options.md`](../run-options.md) §recursionLimit + [`observability.md`](../observability.md) §cap.breached | `conformance-cap-breach` with `configurable.recursionLimit: 3`: terminal `failed` with `error.code = "recursion_limit_exceeded"`; `cap.breached {kind: "node-executions", limit, observed, nodeId}` payload; cap.breached precedes run.failed in sequence; exactly `limit` `node.started` events emitted (over-limit node MUST NOT receive node.started). |

Server-required (added in 1.2.0):

| Category | Spec doc | Coverage |
|---|---|---|
| **Sub-workflow dispatch** | [`node-packs.md`](../node-packs.md) §Reserved Core WOP typeIds + [`fixtures.md`](./fixtures.md) §F2 | `conformance-subworkflow-parent` invokes `conformance-subworkflow-child` via `core.subWorkflow` with blocking dispatch + outputMapping. Asserts: parent reaches terminal `completed`; child variable propagates via outputMapping (`childOutcome === "child-completed"`); child run snapshot carries `parentRunId` + `parentNodeId` linkage; child reaches terminal `completed`. |

Server-required (added in 1.3.0):

| Category | Spec doc | Coverage |
|---|---|---|
| **Channel TTL** | [`channels-and-reducers.md`](../channels-and-reducers.md) §append + §TTL | `conformance-channel-ttl` writes 3 entries with `ttlMs: 200`, waits 300ms via `core.delay`, writes a 4th. Asserts: final `variables.events.length === 1`; surviving entry value `"d"`; entry carries numeric `_ts`. Validates the write-time TTL filter drops priors. |

Server-required (added in 1.4.0):

| Category | Spec doc | Coverage |
|---|---|---|
| **SSE buffering** | [`stream-modes.md`](../stream-modes.md) §Aggregation hint | `?bufferMs=` query parameter. Reuses `conformance-delay` fixture. Asserts: server accepts in-range value (0..5000) and emits `event: batch` SSE frames with array data; out-of-range `99999` returns 400 `validation_error`; force-flush on terminal events (run.completed bundled BEFORE the timer would fire); `bufferMs=0` behaves identically to omitting (per-event mode). |

Server-required (added in 1.5.0):

| Category | Spec doc | Coverage |
|---|---|---|
| **SSE mixed mode** | [`stream-modes.md`](../stream-modes.md) §Mixed mode | Comma-separated `?streamMode=` query. Reuses `conformance-delay` fixture. Asserts: server accepts `updates,messages` and emits server-closed stream containing run.completed; `values,updates` returns 400 `unsupported_stream_mode` (values is exclusive); `updates,bogus` returns 400 (partial-unknown lists fail wholesale); union semantics — `updates,debug` includes every event type `updates`-only includes. |

Placeholder (added in 1.6.0, gated on observable-span access):

| Category | Spec doc | Coverage |
|---|---|---|
| **Cost attribution** | [`observability.md`](../observability.md) §Cost attribution attributes | 5 `it.todo()` scenarios documenting the contract for `wop.cost.*` OTel attributes (allowlist of 6 — provider, model, tokens.input, tokens.output, usd, duration_ms; redaction enforcement). Runs when a deployed reference exposes OTel spans or surfaces cost via the run snapshot. Runtime side + redaction unit tests are shipped. |

Server-required (added in 1.7.0):

| Category | Spec doc | Coverage |
|---|---|---|
| **Redaction** | [`capabilities.md`](../capabilities.md) §"Secrets" + NFR-7 + §"aiProviders" | Vendor-neutral assertions that the server doesn't leak secret material. Three scenario groups: (a) discovery shape contract — `secrets` + `aiProviders` advertisements are well-formed regardless of `secrets.supported`; when `supported === true`, scopes MUST be non-empty + `resolution === 'host-managed'`; `byok ⊆ supported`. (b) bearer-token redaction — invalid Bearer canary in `Authorization` header is not echoed in the 401 response body. (c) credentialRef echo control — gated on `secrets.supported === true`; canary planted in `configurable.ai.credentialRef` MUST NOT appear in any RunEvent payload (poll-based capture; transport-agnostic). Uses runtime-built canary fixtures (`lib/canaries.ts`) that defeat static secret scanners. 6 scenarios. |

Total at 1.7.0: 108 scenarios across 22 files (50 server-free + 53 server-required + 5 placeholder).

## Stubbed for v0.7

| Category | Why stubbed |
|---|---|
| `values` mode `state.snapshot` payload | Schema is implementation-shaped per spec gap S1 (`stream-modes.md`); cross-impl assertions blocked until schema firms up. |
| `messages` mode AI chunks | Needs server-side AI provider mock (fixture spec gap F1 in `fixtures.md`). |
| Cross-version compat | Needs server-controllable `engineVersion` cycle to test forward-fold-best-effort. |
| Capability-limit fixture | Needs a fixture that deliberately exceeds `clarificationRounds` / `schemaRounds` / `envelopesPerTurn` to assert `cap.breached` + `CapabilityLimitExceededError` shape. |

---

## Repo layout

```
conformance/
  README.md                    — this file
  fixtures.md                  — standardized fixture-workflow contract
  fixtures/                    — canonical WorkflowDefinition JSONs (servers seed verbatim)
    conformance-noop.json
    conformance-identity.json
    conformance-delay.json
    conformance-failure.json
    conformance-approval.json
    conformance-clarification.json
    conformance-multi-node.json
    conformance-idempotent.json
    conformance-cancellable.json
  package.json                 — @myndhyve/wop-conformance scaffold (NOT linked into the parent monorepo)
  vitest.config.ts             — test runner config
  tsconfig.json                — strict TypeScript
  src/
    lib/
      driver.ts                — WopDriver class (auth, request helpers, response asserts)
      env.ts                   — env-var validation + defaults
      polling.ts               — pollUntil/pollUntilStatus/pollUntilTerminal helpers
      sse.ts                   — minimal native-fetch SSE client (no eventsource dep)
    scenarios/
      fixtures-valid.test.ts            — fixture JSONs validate against workflow-definition schema (no server)
      discovery.test.ts                 — /.well-known/wop + /v1/openapi.json
      auth.test.ts                      — 401 / 403 envelopes
      errors.test.ts                    — error envelope shape
      runs-lifecycle.test.ts            — POST /v1/runs + terminal status (uses conformance-noop)
      idempotency.test.ts               — same key replay + body-mismatch 409 (uses conformance-idempotent)
      cancellation.test.ts              — :cancel mid-flight (uses conformance-cancellable)
      interrupt-approval.test.ts        — accept/reject + invalid action + unknown node (uses conformance-approval)
      interrupt-clarification.test.ts   — answers payload resume (uses conformance-clarification)
      failure-path.test.ts              — terminal `failed` + RunSnapshot.error shape (uses conformance-failure)
      identity-passthrough.test.ts      — nested JSON round-trip (uses conformance-identity)
      multi-node-ordering.test.ts       — node.completed sequence in DAG order (uses conformance-multi-node + events/poll)
      stream-modes.test.ts              — updates termination + 400 unsupported-mode + debug ⊇ updates (uses conformance-delay + SSE)
      replay-fork.test.ts               — :fork in replay + branch modes + 4 validation paths (uses conformance-noop)
      version-negotiation.test.ts       — protocolVersion + RunEventDoc shape + monotonic sequence + events/poll forward-compat
      spec-corpus-validity.test.ts      — server-free meta-check that the whole spec corpus is internally consistent
```

---

## How to extend

Add a new scenario file under `src/scenarios/<category>.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { driver } from '../lib/driver';

describe('my-spec-category', () => {
  it('does the thing per spec section 4.2', async () => {
    const res = await driver.get('/v1/some-endpoint');
    expect(res.status).toBe(200);
    // ... spec-derived assertions
  });
});
```

Each `expect(...)` should have a corresponding spec quote in the assertion message so failures cite the requirement, not just "expected X got Y".

---

## Future: publishable npm package

Once the suite stabilizes, this directory will be extracted to its own repo and published as `@myndhyve/wop-conformance`. Until then, `npm install` is run from this subdirectory only — it is intentionally NOT a workspace member of the parent monorepo so its deps don't pollute the impl's lockfile.

## References

- WOP plan P2-F4 (`docs/plans/WORKFLOW-PROTOCOL-WOP-PLAN.md`)
- Spec corpus: `../README.md`
- OpenAPI: `../api/openapi.yaml`
- AsyncAPI: `../api/asyncapi.yaml`
- JSON Schemas: `../schemas/`
