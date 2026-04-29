# WOP Conformance Suite — Fixture Workflow Contract

> **Status: DRAFT v0.1 (2026-04-26).** Defines the standardized fixture workflows every WOP-compliant server MUST seed before the conformance suite can exercise run-lifecycle, idempotency, stream-mode, interrupt, and replay scenarios. Stable surface for external review. Keywords MUST, SHOULD, MAY follow [RFC 2119](https://www.rfc-editor.org/rfc/rfc2119). Status legend per `../auth.md`.

---

## Why this exists

Run-lifecycle conformance tests need a stable target — a workflow whose `workflowId`, expected events, and terminal status are agreed in advance. Without this, every implementation defines its own test workflows and the conformance suite can't run cross-implementation.

This document defines a small set of fixture workflows whose canonical definitions live alongside the conformance suite (`fixtures/*.json`). A WOP-compliant server MUST seed these fixtures into its workflow store before running the conformance suite against itself.

---

## Seeding contract

A WOP-compliant server MUST:

1. Accept the canonical JSON fixture definitions in `fixtures/*.json` verbatim (they validate against `../schemas/workflow-definition.schema.json`).
2. Persist each fixture under its declared `id` so that subsequent `GET /v1/workflows/{id}` returns the seeded definition.
3. Treat seeding as idempotent — running the seeder repeatedly MUST NOT produce duplicate runs, error states, or version drift.
4. Expose the seeded fixtures to runs created with the conformance suite's API key.

How a server seeds is implementation-specific. The reference implementation seeds via its admin panel `seedGlobalData` callable; other servers MAY:

- Auto-seed at startup when `WOP_CONFORMANCE_SEED=true` env var is set.
- Provide a CLI command (e.g., `wop-server seed --conformance`).
- Document a manual upload procedure.

Servers MUST NOT require fixtures to be re-uploaded on every conformance run — the suite assumes they are already present.

---

## Fixture catalog

All fixtures MUST advertise:

- **`workflowId`** — exact string clients use to start runs
- **Trigger** — must be `manual` so the conformance suite can call `POST /v1/runs` without channel-specific setup
- **Inputs** — schema declared via `variables[]`
- **Expected behavior** — terminal status, expected event types, timing bounds

| Fixture | `workflowId` | Purpose | Terminal status | Bounded duration |
|---|---|---|---|---|
| Noop | `conformance-noop` | Cheapest possible run-lifecycle test | `completed` | ≤ 5s |
| Identity | `conformance-identity` | Verifies input/output passthrough | `completed` | ≤ 5s |
| Delay | `conformance-delay` | Verifies poll/SSE behavior over time | `completed` | ≤ 30s (input-controlled) |
| Failure | `conformance-failure` | Verifies error-event surface | `failed` | ≤ 5s |
| Approval | `conformance-approval` | Verifies HITL approval interrupt + resume | `completed` after resolve | unbounded (suspends) |
| Clarification | `conformance-clarification` | Verifies HITL clarification interrupt + resume | `completed` after resolve | unbounded (suspends) |
| Multi-node | `conformance-multi-node` | Verifies edge ordering + per-node events | `completed` | ≤ 10s |
| Idempotent | `conformance-idempotent` | Verifies `Idempotency-Key` cache | `completed` | ≤ 5s |
| Cancellable | `conformance-cancellable` | Verifies `:cancel` endpoint mid-run | `cancelled` after cancel | ≤ 60s (input-controlled) |
| Capability Missing | `conformance-capability-missing` | Verifies G23 dispatch refusal on unsatisfied `requires` | `failed` (`error.code='capability_not_provided'`) | ≤ 5s |

The `messages`-mode stream fixture (AI token streaming) is **deferred to v0.2** — fixture authoring requires a server-side AI provider mock that's out of scope for the initial drop.

---

## Per-fixture contracts

### `conformance-noop`

- **Purpose**: cheapest run-lifecycle test. Used by the conformance suite's `runs.test.ts` to verify create/read/terminal-event/cleanup work end-to-end.
- **Inputs**: none.
- **Expected events** (in order, `updates` mode):
  1. `run.started`
  2. `node.completed` (single node, typeId `core.noop`)
  3. `run.completed`
- **Terminal status**: `completed`.
- **Duration bound**: server MUST reach terminal state within 5s of accepting the run.

### `conformance-identity`

- **Purpose**: verify input → output passthrough.
- **Inputs**:
  - `payload` (object, required) — arbitrary JSON.
- **Expected behavior**: terminal `RunSnapshot.variables.payload` MUST deep-equal the input `payload`.
- **Terminal status**: `completed`.

### `conformance-delay`

- **Purpose**: verify the engine handles in-flight runs (status transitions over time, SSE keep-alives, poll fallback).
- **Inputs**:
  - `delayMs` (integer, required, 0 ≤ value ≤ 30000) — server MUST sleep for this duration before completing.
- **Expected behavior**: `GET /v1/runs/{runId}` MUST return `status: "running"` while the delay is in flight; `status: "completed"` after.
- **Terminal status**: `completed`.

### `conformance-failure`

- **Purpose**: verify the failure path (error event shape, terminal `failed` state).
- **Inputs**: none.
- **Expected events**:
  1. `run.started`
  2. `node.failed`
  3. `run.failed`
- **Terminal `RunSnapshot.error`**: MUST be a `{code, message}` object with both fields as strings.
- **Terminal status**: `failed`.

### `conformance-approval`

- **Purpose**: verify HITL approval interrupt + resume.
- **Inputs**: none.
- **Behavior**:
  1. Run starts and reaches an `approvalGate` node that calls `ctx.interrupt({kind: 'approval', ...})`.
  2. Server emits `interrupt.requested` (and SHOULD also emit `approval.requested` for back-compat).
  3. Run status MUST be `waiting-approval`.
  4. After client POSTs `{action: 'accept'}` to `/v1/runs/{runId}/interrupt`, server emits `approval.received` and resumes.
  5. Run reaches `completed`.
- **Terminal status (after accept)**: `completed`.
- **Resolve schema**: `{action: "accept" | "reject"}`. Server MUST reject any other shape with 400.

### `conformance-clarification`

- **Purpose**: verify HITL clarification interrupt + resume.
- **Inputs**: none.
- **Behavior**:
  1. Run starts and reaches a `clarificationGate` node.
  2. Server emits `clarification.requested` carrying `questions: [{id: "q1", question: "What is your favorite color?"}]`.
  3. After client POSTs `{answers: {q1: "blue"}}`, server emits `clarification.resolved`.
  4. Run reaches `completed`.
- **Terminal status (after resolve)**: `completed`.

### `conformance-multi-node`

- **Purpose**: verify multi-node DAG ordering + per-node events.
- **Inputs**: none.
- **Topology**: three nodes A → B → C, all `core.noop`.
- **Expected behavior**: `node.completed` events MUST arrive in the order A, B, C (assertable via `event.sequence` ordering).
- **Terminal status**: `completed`.

### `conformance-idempotent`

- **Purpose**: verify `Idempotency-Key` cache (rest-endpoints.md §6 + `idempotency.md`).
- **Inputs**:
  - `nonce` (string, required) — caller-supplied; server MUST NOT use this for any side effect, only for de-duplication semantics tests.
- **Expected behavior**:
  - `POST /v1/runs` with the same `Idempotency-Key` and same body twice → second response MUST replay the first (`WOP-Idempotent-Replay: true` header) and MUST NOT create a second run.
  - Same `Idempotency-Key` with a different body → 409.
- **Terminal status**: `completed`.

### `conformance-cancellable`

- **Purpose**: verify `:cancel` mid-run.
- **Inputs**:
  - `delayMs` (integer, required, 1 ≤ value ≤ 60000) — wait long enough for the conformance test to issue cancel.
- **Expected behavior**:
  1. Run reaches `running`.
  2. Client posts `POST /v1/runs/{runId}:cancel`.
  3. Server emits `run.cancelled` within 5s.
  4. Subsequent `GET /v1/runs/{runId}` MUST return `status: "cancelled"`.
- **Terminal status**: `cancelled`.

### `conformance-capability-missing`

- **Purpose**: verify G23 dispatch refusal — when a node declares `requires: ['<unsupported>']`, the engine MUST refuse to call its executor and terminate the run with the structured error.
- **Inputs**: none.
- **Topology**: single `conformance.requiresMissing` node. The fixture node declares `requires: ['conformance.never-provided']` — a sentinel capability id reserved by spec; production hosts MUST NOT register a provider for it.
- **Expected behavior**:
  1. Run starts and the engine reaches the single node.
  2. Pre-dispatch capability check fails because no host provider satisfies `conformance.never-provided`.
  3. Server emits `node.failed` with the underlying error, then `run.failed`.
  4. Run reaches terminal `failed`.
- **Terminal `RunSnapshot.error`**: `error.code === 'capability_not_provided'`. `error.message` MUST name the missing capability id (`conformance.never-provided`) verbatim so operators can act without grepping logs.
- **Terminal status**: `failed`.
- **Server prerequisites**: the host MUST have registered the `conformance.requiresMissing` NodeModule before seeding the fixture. Reference impl: opt-in via `WOP_CONFORMANCE_FIXTURES=1`. Hosts that don't register this fixture node MAY mark this scenario optional in their conformance manifest.

---

## `conformance-version-fold` (closes F5)

- **Purpose**: verify forward-compat fold-best-effort tolerance across the spec's engine-version cross-version interop matrix (`version-negotiation.md` §Cross-version interop matrix). Uses the test-keys-only `X-Force-Engine-Version` header to drive the same workflow at three different engine versions from a single deployed server — no multi-version fleet needed.
- **Fixture topology**: a single `core.noop` node. The workflow itself is trivial; the test exercises the server's READ path (projection, event-log fold) under each forced engine version.
- **Inputs**: none.
- **Conformance test driver**:
  1. Read the server's `Capabilities.testing.forceEngineVersionRange = { min, max }`.
  2. For each version `v` in `[min, current, max]` (deduped):
     - POST `/v1/runs` with body `{workflowId: "conformance-version-fold"}` AND header `X-Force-Engine-Version: v`. Use a test API key.
     - Poll until terminal.
     - **Assert** terminal status is `completed`.
     - **Assert** `GET /v1/runs/{runId}` returns a valid `RunSnapshot` (the projection tolerates the version mismatch via fold-best-effort).
     - **Assert** `GET /v1/runs/{runId}/events/poll?lastSequence=0&timeout=1` returns a non-empty `events[]` array (event log is readable).
- **Negative paths**:
  - Same fixture with a production API key returns `403 force_engine_version_forbidden`.
  - Same fixture with `X-Force-Engine-Version: <out-of-range>` returns `400 unsupported_force_engine_version`.
- **Cross-link**: see `version-negotiation.md` §Conformance via X-Force-Engine-Version for the underlying matrix. The fixture is intentionally minimal (single noop) so the test isolates version-fold tolerance from any node-specific behavior.

This fixture closes F5 without requiring any new server-side test infrastructure beyond the `X-Force-Engine-Version` header. Servers that don't advertise `forceEngineVersionRange` in Capabilities can mark this fixture optional in their conformance manifest.

---

## `conformance-stream-text` (closes F1)

- **Purpose**: verify the `messages` SSE stream mode end-to-end through a deterministic AI mock. Without a mock provider, conformance suites can't exercise streaming AI without burning real API budget; with one, the test is fully reproducible.
- **Fixture topology**: a single `core.ai.callPrompt` (or similar AI-bearing typeId) node. The node's actual prompt content is irrelevant — the conformance driver intercepts the AI dispatch via `configurable.mockProvider`.
- **Inputs**: none.
- **Conformance test driver**:
  1. POST `/v1/runs` with body:
     ```jsonc
     {
       "workflowId": "conformance-stream-text",
       "configurable": {
         "mockProvider": {
           "id": "stream-text",
           "config": {
             "tokens": ["Hello", " ", "world", "!"],
             "delayMsPerToken": 10,
             "finishReason": "stop",
             "usage": { "promptTokens": 5, "completionTokens": 4, "totalTokens": 9 }
           }
         }
       }
     }
     ```
     Use a test API key (server returns 403 on production keys per `run-options.md` §Authorization).
  2. Subscribe to `/v1/runs/{runId}/events?streamMode=messages`.
  3. **Assert** chunk arrival order: `["Hello", " ", "world", "!"]` — same order as `tokens`.
  4. **Assert** the final chunk has `isLast: true`, `meta.finishReason === "stop"`, `meta.usage.completionTokens === 4`.
  5. **Assert** SSE stream closes on terminal — server-closed, not timeout.
  6. **Assert** terminal status is `completed`.
- **Negative paths**:
  - Same fixture with a production API key returns `403 mock_provider_forbidden`.
  - Same fixture with `mockProvider.id: "does-not-exist"` returns `400 unsupported_mock_provider`.
- **Replay assertion**: forking the run with `mode: replay` produces a byte-identical event log (mock providers are inherently replay-deterministic — no Layer-2 invocation log needed).

This fixture is the canonical `messages`-mode test. Once it's wired into the conformance suite, the suite gains 5+ new server-required scenarios. Servers that don't yet support the mock-provider extension can mark this fixture optional in their conformance manifest until they do.

---

## `conformance-subworkflow-parent` + `conformance-subworkflow-child` (closes F2 spec-side; runtime impl pending)

> **Status: spec firm (2026-04-27 — typeId canonicalized to `core.subWorkflow` per `docs/PRD-WOP-MYNDHYVE-EXTENSION-LAYER.md` §8.7 Core WOP node list). Runtime implementation pending — every WOP-compliant server MUST register a `core.subWorkflow` node module before this fixture lands. Add the fixture JSONs when the runtime is in place.**

- **Purpose**: verify child-run lifecycle when a parent workflow invokes a child via `core.subWorkflow`. Specifically: child `run.started` and `run.completed` events fire; child outputs flow back into the parent's variables; cancelling the parent cancels the child.
- **Topology**:
  - **Child (`conformance-subworkflow-child`)**: single `core.identity` node that echoes its `payload` input. Reuses the existing identity contract.
  - **Parent (`conformance-subworkflow-parent`)**: one `core.subWorkflow` node configured with `workflowId = "conformance-subworkflow-child"` and `inputs = {payload: {fromParent: true}}`. The node's output port `result` carries the child's terminal `RunSnapshot.variables.payload`.
- **Inputs (parent)**: none.
- **Conformance test driver assertions**:
  1. Parent run reaches terminal `completed`.
  2. Two distinct `runId`s appear in the event log query — one for the parent, one for the child.
  3. Parent's `RunSnapshot.variables` contains `result.payload === {fromParent: true}` (the round-trip from invoke + identity echo).
  4. Cancelling the parent mid-flight cancels the child (`run.cancelled` events on both within 5s).

Spec design choices to firm up before this fixture lands:

- Canonical sub-workflow node typeId — `core.subWorkflow`. Aligned with the Core WOP node list defined in `docs/PRD-WOP-MYNDHYVE-EXTENSION-LAYER.md` §8.7, which uses the `core.<conceptName>` flat-camelCase pattern (`core.start`, `core.delay`, `core.loop`, `core.parallel`, `core.interrupt`, etc.). Sub-workflow invocation is a workflow primitive expressed as a node — same shape as `core.interrupt`. Multi-segment alternatives like `core.workflow.invoke` would have been the lone outlier in the Core WOP namespace.
- Child run's RunSnapshot is owned by the same workspace/tenant as the parent — sub-workflow doesn't cross authorization boundaries.
- Child's events are NOT inlined into the parent's event log; they live in the child's own subcollection. The parent emits a single `node.started` / `node.completed` pair around the invoke node, not all of the child's events.
- Cancellation cascade: parent cancel MUST cancel the child within 5s (suite's existing cancellation timing bound).
- Trace correlation (already specced — see `observability.md` §Sub-workflow attributes / O2): child's `wop.run` is a parent-child span of the invoke-node's `wop.node.<typeId>`, with required attributes `wop.parent.{run_id, workflow_id, node_id}`. Conformance assertion: the child run's first event-log entry's `engineVersion` field SHOULD be on the same trace as the parent's invoke-node — verifiable post-run via the OTel exporter if available.

Once the typeId is canonicalized in the spec corpus (likely as a §section in `rest-endpoints.md` or a new `sub-workflows.md`), the fixture JSONs and matching `subworkflow.test.ts` can land.

---

## `conformance-cap-breach` (closes F4 spec-side; runtime impl pending)

> **Status: spec firm (2026-04-27 — closed via the unified `cap.breached` design in `capabilities.md` §Engine-enforced limits). Runtime counter implementation is now a normal Phase-1.1 follow-up — NO `eventLogSchemaVersion` bump or fleet-coordination needed because `cap.breached` already exists with `kind: 'node-executions'` in its enum. Add the fixture JSON when the impl plan owner ships the per-run counter.**

- **Purpose**: verify the `Capabilities.limits.maxNodeExecutions` ceiling clamps `RunOptions.configurable.recursionLimit` at run-start, and that the engine emits `cap.breached` + transitions to `failed` when the per-run counter exceeds the resolved limit.
- **Topology**: 10 sequential `core.noop` nodes (`a → b → c → … → j`). A run completes naturally if no per-run override is supplied. With `configurable.recursionLimit = 5`, the run MUST trip after the 5th node.
- **Inputs**: none.
- **Conformance test driver**:
  1. POST `/v1/runs` with `{workflowId: "conformance-cap-breach", configurable: {recursionLimit: 5}}`.
  2. Server SHOULD validate `recursionLimit ≤ Capabilities.limits.maxNodeExecutions`. If `maxNodeExecutions` is `100` (default), `5` is fine.
  3. Poll until terminal.
  4. **Assert** terminal status is `failed`.
  5. **Assert** `RunSnapshot.error.code === "recursion_limit_exceeded"`.
  6. **Assert** the event log contains a `cap.breached` event with `payload: {kind: "node-executions", limit: 5, observed: 6}` (or whichever `observed > limit` value the engine recorded).
- **Negative path**: same fixture without the override completes normally (10 `node.completed` events, terminal `completed`).

This fixture is unblocked when:

1. The impl plan owner ships CC-1's hard invariant (per-run `nodeExecutionCount` counter; `RunEvent` schema bump for `cap.breached` payload's `kind: "node-executions"` value; `RunStateMachine` transition to `failed` on exceedance).
2. The conformance suite's `wop-conformance` driver gains the matching scenario file `cap-breach.test.ts`.

Both items are blocked on coordination with the impl plan owner — see WOP plan CC-1.

---

## `conformance-channel-ttl` (closes C3 — channel TTL reducer fold)

> **Status: shipped 2026-04-28 (`@myndhyve/wop-conformance` 1.3.0 + reference impl).** Server-side `core.channelWrite` Core WOP node landed in `packages/workflow-engine/src/nodes/core/channelWrite.node.ts`; conformance scenario at `src/scenarios/channel-ttl.test.ts`.

- **Purpose**: verify the `append` reducer applies `ttlMs` filter at write time, dropping entries older than the cutoff.
- **Topology**: 4 sequential `core.channelWrite` nodes targeting channel `events` with `ttlMs: 200`, separated by a `core.delay` of 300ms between writes 3 and 4. The 4th write fires after the TTL window has elapsed.
- **Inputs**: none. Each node carries a static `value` in its `config` (`a`, `b`, `c`, `d` respectively).
- **Conformance test driver**:
  1. POST `/v1/runs` with `{workflowId: "conformance-channel-ttl"}`.
  2. Poll until terminal.
  3. **Assert** terminal status is `completed`.
  4. **Assert** `RunSnapshot.variables.events.length === 1` — the 3 priors aged out at the 4th write.
  5. **Assert** `RunSnapshot.variables.events[0].value === "d"` — the surviving entry is the post-delay write.
  6. **Assert** `typeof RunSnapshot.variables.events[0]._ts === "number"` — entries carry numeric write timestamps.

---

## NodeModule registration

The fixtures reference these typeIds:

| typeId | Required by | Behavior |
|---|---|---|
| `core.noop` | noop, multi-node, approval, clarification, cancellable | Immediate completion, no output |
| `core.identity` | identity | Echo `input.payload` to `output.payload` |
| `core.delay` | delay, cancellable | Sleep `config.delayMs` ms |
| `core.fail` | failure | Throw with `code: "conformance_test_failure"`, message: "Intentional conformance failure" |
| `core.approvalGate` | approval | Call `ctx.interrupt({kind: 'approval', ...})` |
| `core.clarificationGate` | clarification | Call `ctx.interrupt({kind: 'clarification', ...})` |
| `conformance.requiresMissing` | capability-missing | Declares `requires: ['conformance.never-provided']`; engine MUST refuse dispatch (G23). Opt-in registration via `registerConformanceFixtures(registry)` from `@myndhyve/workflow-engine`; the reference impl gates this on `WOP_CONFORMANCE_FIXTURES=1` so production deployments don't expose the fixture surface. |

A WOP-compliant server's NodeModule registry MUST include implementations for all six core typeIds before seeding fixtures. The reference implementation provides these in `packages/workflow-engine/src/core-nodes/` (forthcoming — currently scattered across `src/core/workflow/nodes/`). The `conformance.requiresMissing` fixture node is opt-in — see the row above.

---

## Versioning

Each fixture's JSON has its own `version` field. Conformance suite v0.X targets fixture version 1.0.0. Fixture spec breaking changes MUST bump the major; the suite MUST refuse to run against an unrecognized fixture version with a clear error message.

---

## File layout

```
conformance/
  fixtures.md                — this file
  fixtures/
    conformance-noop.json
    conformance-identity.json
    conformance-delay.json
    conformance-failure.json
    conformance-approval.json
    conformance-clarification.json
    conformance-multi-node.json
    conformance-idempotent.json
    conformance-cancellable.json
```

Each JSON is a valid `WorkflowDefinition` per `../schemas/workflow-definition.schema.json`. Servers MUST treat them as opaque blobs to seed verbatim — do not transform field names or strip fields.

---

## Open spec gaps

| # | Gap | Owner |
|---|---|---|
| F1 | Streaming-mode fixture (`messages` stream) — done (2026-04-27: closed via the mock-provider extension defined in `run-options.md`. Conformance fixture `conformance-stream-text` in this doc; test driver invokes with `configurable.mockProvider.id='stream-text'` + canned token sequence + asserts deterministic `messages`-mode chunk arrival). | ✅ |
| F2 | Sub-workflow fixture — spec firm (2026-04-27: typeId `core.subWorkflow` canonicalized per PRD-WOP-MYNDHYVE-EXTENSION-LAYER.md §8.7). Runtime impl pending — servers register `core.subWorkflow` node module before fixture lands. | spec ✅ / impl pending |
| F3 | Replay fixture — needs a finished run + finalized event log to fork from. Partial coverage: `replay-fork.test.ts` already exercises `:fork` against `conformance-noop`. | partial |
| F4 | Capability-limit fixture — spec firm (2026-04-27: closed via the unified `cap.breached` design in `capabilities.md` §Engine-enforced limits). Runtime counter implementation pending — normal Phase-1.1 follow-up, no `eventLogSchemaVersion` bump needed. | spec ✅ / impl pending |
| F5 | Schema-version-cycle fixture — done (2026-04-27: closed via the `X-Force-Engine-Version` test-keys-only header. Conformance fixture `conformance-version-fold` runs a single noop at each supported version and asserts the projection + event-log fold tolerate the cross-version matrix). | ✅ |

## References

- `README.md` — conformance suite operator docs
- `../schemas/workflow-definition.schema.json` — every fixture validates against this
- `../rest-endpoints.md` — endpoint contracts the fixtures exercise
- `../interrupt.md` — HITL primitive used by approval + clarification fixtures
- `../idempotency.md` — semantics the idempotent fixture exercises
