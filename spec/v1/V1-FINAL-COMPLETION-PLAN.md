# WOP v1.0 — Final Completion Plan

> **Historical release record (non-normative).** This document is the as-shipped record of the v1.0 launch. It carries forward MyndHyve-specific delivery context (project IDs, Cloud Run URLs, internal milestones) because that context is what the launch actually was. None of the content here modifies the normative wire contract defined in the FINAL v1.0 prose specs; treat this doc as launch retrospective + post-v1.0 ecosystem roadmap.

> **Status: COMPLETE — WOP v1.0 FINAL released 2026-04-27.** All 12 prose specs are FINAL v1.0; all 10 JSON Schemas compile clean; OpenAPI 3.1 + AsyncAPI 3.1 lint clean; 3 reference SDKs pinned to 1.0.0; conformance suite at 1.0.0 with 82 scenarios (46 server-free passing locally). The spec corpus is the protocol contract; **engine-implementation conformance** (the six triggers below) is now post-v1.0 ecosystem work — implementations validate themselves against the conformance suite at their own cadence, and the spec contract is locked. See §"v1.0 release record" at the bottom of this doc for the release artifacts.

This plan lives in the spec corpus (alongside `CHANGELOG.md` + `CONTRIBUTING.md`) because it defines what "v1.0 final" means, not how to build the spec. The how-to-build-the-spec roadmap is at `docs/plans/WORKFLOW-PROTOCOL-WOP-PLAN.md` (gitignored).

## Contents

- [Overview](#overview) — current state + trigger progress + gap-code glossary
- Trigger 1 — [SSE buffering (closes S3)](#trigger-1--sse-buffering-closes-s3)
- Trigger 2 — [Mixed-mode SSE (closes S4)](#trigger-2--mixed-mode-sse-closes-s4)
- Trigger 3 — [Sub-workflow node module (closes F2)](#trigger-3--sub-workflow-node-module-closes-f2)
- Trigger 4 — [Recursion-limit enforcement (closes F4 + CC-1)](#trigger-4--recursion-limit-enforcement-closes-f4--cc-1)
- Trigger 5 — [Channel TTL reducer fold (closes C3)](#trigger-5--channel-ttl-reducer-fold-closes-c3)
- Trigger 6 — [AI cost attribution (closes O4)](#trigger-6--ai-cost-attribution-closes-o4)
- [Cross-cutting: SDK status preservation](#cross-cutting-sdk-status-preservation)
- [Reference deployment](#reference-deployment) — where to point the suite + the action item
- [Definition of v1.0 Final](#definition-of-v10-final) — what shipped (all ✅ done)
- [Post-v1.0 ecosystem roadmap](#post-v10-ecosystem-roadmap-the-six-triggers) — the six triggers as conformance milestones
- [How this plan evolves](#how-this-plan-evolves-post-v10) — per-trigger workflow + blocker convention
- [What this plan does NOT cover](#what-this-plan-does-not-cover) — Part 2 Phase D deferrals
- [v1.0 release record](#v10-release-record-2026-04-27) — what shipped on 2026-04-27 + per-trigger tracker
- [References](#references)

**Reader-task quick-jumps:**

- *Implementation PR author* → find your trigger above and read its "Engine-side contract" subsection.
- *Conformance contributor* → find your trigger and read "Files to write" + "Conformance scenarios"; bump `@wop/conformance` minor when scenarios land.
- *Implementer claiming v1.0 conformance* → run `@wop/conformance` `1.0.0` (or any later `1.X.0`) against your deployment; non-zero exit = non-conformant.

---

## Overview

**Trigger progress: 0 of 6 complete.** (See §"Definition of v1.0 Final" near the bottom for the full checkbox state.)

What's done (full state captured in `CHANGELOG.md`):

- 12 prose specs, 10 first-class JSON Schemas, OpenAPI 3.1 + AsyncAPI 3.1.
- 3 reference SDKs (TS / Python / Go) with feature parity — including S3 + S4 SSE consumer support already shipped.
- 82-scenario conformance suite (46 server-free + 36 server-required).
- All 21 originally-listed gaps closed at the spec layer (18 fully ✅; 3 spec-firm with engine impl pending).

### Gap-code conventions

Throughout this plan, items are referenced by their gap-code in the source spec docs:

| Prefix | Series | Defined in |
|---|---|---|
| `F*` | Fixture gaps | `conformance/fixtures.md` §Open spec gaps |
| `S*` | Stream-mode gaps | `stream-modes.md` §Open spec gaps |
| `C*` | Channel gaps | `channels-and-reducers.md` §Open spec gaps |
| `O*` | Observability gaps | `observability.md` §Open spec gaps |
| `JS*` | JSON Schema gaps | `schemas/README.md` §Open gaps (all closed) |
| `CC-*` | Cross-cuts to impl plan | `WORKFLOW-PROTOCOL-WOP-PLAN.md` §"Cross-cuts to impl plan" (working copy only — gitignored) |

What's left for v1.0 final — six triggers, organized by type:

| # | Trigger | Closes | Type | What we add |
|---|---|---|---|---|
| 1 | SSE buffering shipped in reference impl | S3 | SSE wire | 1 scenario file |
| 2 | Mixed-mode SSE shipped in reference impl | S4 | SSE wire | 1 scenario file |
| 3 | `core.subWorkflow` node module shipped | F2 | New node module | 2 fixture JSONs + 1 scenario file |
| 4 | Per-run `nodeExecutionCount` counter shipped | F4 + CC-1 | Engine-internal | 1 fixture JSON + 1 scenario file |
| 5 | Channel `ttlMs` reducer fold shipped | C3 | Engine-internal | 1 fixture JSON + 1 scenario file |
| 6 | `wop.cost.*` activity emission shipped | O4 | Activity completion | 1 scenario file |

Total fan-out from our side: **4 fixture JSONs + 6 scenario files**, each unblocked by a different engine PR. Most are <100 lines. Total estimated effort: **~14-15 hours** of mechanical work — sum of per-trigger ranges (3-4 + 1.5 + 3 + 2 + 2.5 + 2), gated on the engine pieces landing. (Triggers 1, 2, and 6 reuse existing fixtures; Trigger 3 adds 2; Triggers 4 + 5 each add 1.)

---

## Trigger 1 — SSE buffering (closes S3)

### Engine-side contract

Per `stream-modes.md` §"Aggregation hint":

- `GET /v1/runs/{runId}/events?bufferMs=N` accepted with N in `0..5000`. Out of range → `400 validation_error`. `0` is "no buffering" (same as omitting).
- Server accumulates events for up to N ms then emits a single SSE event with `event: batch` and `data:` as a JSON array of `RunEventDoc`.
- Forced-flush triggers (server MUST flush regardless of accumulation): terminal run events (`run.completed` / `run.failed` / `run.cancelled`), node-suspension events (`node.suspended`), connection close.
- Resumption (`Last-Event-ID`) honors the SSE `id:` of the BATCH; servers SHOULD use the highest `sequence` in the batch as the SSE id.

### Conformance scenarios

File: `conformance/src/scenarios/stream-modes-buffer.test.ts`

| Scenario | Asserts |
|---|---|
| `?bufferMs=200` against `conformance-delay` (delayMs=2000) | At least one `event: batch` SSE payload in the stream; total event count matches non-buffered run |
| Forced-flush on terminal | Terminal run event arrives within 1s of run completion regardless of buffer accumulation |
| `?bufferMs=0` | Behaves identically to omitting the parameter (per-event emission) |
| Out-of-range `?bufferMs=99999` | `400 validation_error` |
| `Last-Event-ID` resume after a batch | Server resumes from highest sequence in the prior batch |

### SDK status

✅ Already shipped in TS / Python / Go — all three transparently flatten `event: batch` arrays back into per-event yields. No SDK changes needed.

### Effort

~3-4h. The `Last-Event-ID` resume scenario alone needs the test driver to capture an SSE id from a prior batch and re-issue with that header — not lightweight. Forced-flush timing assertions (terminal event arriving within 1s) need careful clock handling to avoid flakes.

---

## Trigger 2 — Mixed-mode SSE (closes S4)

### Engine-side contract

Per `stream-modes.md` §"Mixed mode":

- `?streamMode=A,B` (comma-separated) accepted as union-of-filters. Allowed combinations: any subset of `{updates, messages, debug}`. The `values` mode MUST NOT combine with others (state.snapshot semantics need exclusive ownership).
- Each emitted event's `event:` field MUST label which mode admitted it (e.g., `event: updates` or `event: messages`). When an event qualifies under multiple modes, server picks any one consistently.
- Unsupported combinations return `400 unsupported_stream_mode`. The error body's `supported` array includes single mode names; mixed combinations are NOT advertised.

### Conformance scenarios

File: `conformance/src/scenarios/stream-modes-mixed.test.ts`

| Scenario | Asserts |
|---|---|
| `?streamMode=updates,messages` against `conformance-stream-text` | See §note C below. |
| `?streamMode=values,updates` | `400 unsupported_stream_mode`; body's `error` is `unsupported_stream_mode` |
| `?streamMode=garbage,updates` | `400 unsupported_stream_mode` (entire combination rejected if any element is unknown) |
| `?streamMode=updates` (single value via same regex) | Behaves identically to non-mixed mode (back-compat). |

> **§note C — Mixed-mode union assertion.** The stream MUST contain BOTH state-transition events (per `updates` mode) AND `output.chunk` events (per `messages` mode). Each emitted event's `event:` field MUST label which mode admitted it (e.g., `event: updates` or `event: messages`).

### SDK status

✅ Already shipped — TS accepts `StreamMode \| readonly StreamMode[]`, Python accepts `Sequence[StreamMode]`, Go has `StreamModes []StreamMode`. No SDK changes needed.

### Effort

~1.5h.

---

## Trigger 3 — Sub-workflow node module (closes F2)

### Engine-side contract

Per `node-packs.md` §"Reserved Core WOP node typeIds" + `fixtures.md` §F2 design:

- New node typeId `core.subWorkflow` registered in the engine's NodeModule registry.
- Config shape: `{ workflowId: string, inputs?: object }`.
- Behavior: parent run suspends; child run starts with the supplied workflowId + inputs in the SAME workspace/tenant; parent resumes when child reaches terminal status.
- Child's terminal `RunSnapshot.variables` flows to the parent's output port (recommend port name `result`).
- Cancellation cascade: cancelling the parent MUST cancel the child within 5s.
- Trace propagation per `observability.md` §"Sub-workflow attributes" (closes O2): child's `wop.run` span is a parent-child of the invoke node's `wop.node.<typeId>` span; child carries `wop.parent.{run_id, workflow_id, node_id}` attributes.
- Child `channel.written` events carry `sourceEngineId` + `sourceRunId` per `channels-and-reducers.md` §"Distributed reducers" (closes C2).

### Files to write

1. `conformance/fixtures/conformance-subworkflow-parent.json` — single `core.subWorkflow` node configured with `workflowId: "conformance-subworkflow-child"` + `inputs: {payload: {fromParent: true}}`.
2. `conformance/fixtures/conformance-subworkflow-child.json` — single `core.identity` node echoing `payload`.
3. `conformance/src/scenarios/subworkflow.test.ts` — scenarios below.

### Conformance scenarios

| Scenario | Asserts |
|---|---|
| Parent terminal | Parent reaches terminal `completed` |
| Distinct runIds | Two distinct runIds in the event-log queries (parent + child) |
| Round-trip | Parent's `RunSnapshot.variables.result.payload` deep-equals `{fromParent: true}` |
| Cancellation cascade | Parent cancel → both runs reach `cancelled` within 5s |
| Trace correlation (best-effort) | Child's first event references the parent's invoke node — verifiable via `wop.parent.run_id` if the server's trace exporter is reachable to the test driver; otherwise skip |

### Effort

~3h. 2 fixture JSONs + scenario file with 5 `it()`s.

---

## Trigger 4 — Recursion-limit enforcement (closes F4 + CC-1)

### Engine-side contract

Per `capabilities.md` §"Engine-enforced limits and the cap.breached event":

- Per-run counter `nodeExecutionCount`, incremented on every `applyNodeTransition(..., 'started')`.
- Resolved limit at run-start: `min(RunOptions.configurable.recursionLimit, Capabilities.limits.maxNodeExecutions)`. Default if no override: `maxNodeExecutions` (default 100).
- Caller-supplied `recursionLimit` validated at run-create via `validateRecursionLimit()` (already shipped) — out-of-range returns `400 validation_error` BEFORE the run starts.
- When `nodeExecutionCount > resolvedLimit`:
  - Emit `cap.breached` event with `kind: 'node-executions'`, `limit: resolvedLimit`, `observed: nodeExecutionCount`.
  - Transition the run to `failed`.
  - Set `RunSnapshot.error.code = 'recursion_limit_exceeded'`.
- NO `eventLogSchemaVersion` bump required — `cap.breached` already exists in the event-type enum with `node-executions` in its `kind` enum.

### Files to write

1. `conformance/fixtures/conformance-cap-breach.json` — 10 sequential `core.noop` nodes (`a → b → c → ... → j`).
2. `conformance/src/scenarios/cap-breach.test.ts` — scenarios below.

### Conformance scenarios

| Scenario | Asserts |
|---|---|
| Without override | 10 nodes < default `maxNodeExecutions: 100` → terminal `completed` |
| With `configurable.recursionLimit: 5` | Terminal `failed`; `RunSnapshot.error.code === 'recursion_limit_exceeded'` |
| Event log carries `cap.breached` | See §note B below. |
| Override > server ceiling | `configurable.recursionLimit: 9999` (assumed > maxNodeExecutions) → `400 validation_error` at run-create (no run created). |

> **§note B — `cap.breached` payload assertion.** The event-log query MUST contain one event with `type: 'cap.breached'`, `payload.kind: 'node-executions'`, `payload.limit: resolvedLimit` (= 5 in this scenario), and `payload.observed: resolvedLimit + 1` (= 6 on increment-on-start, per the spec's wording "incremented on every `applyNodeTransition(..., 'started')`" in `capabilities.md` §"Engine-enforced limits"). The `+ 1` form makes the assertion robust regardless of internal timing details.

### Effort

~2h.

---

## Trigger 5 — Channel TTL reducer fold (closes C3)

> **🚧 PRE-TRIGGER BLOCKER**: writing the conformance fixture requires a node typeId that writes to a declared channel. The PRD §8.7 Core WOP node list reserves `core.setVariable` (writes to **variables**, NOT channels), `core.subWorkflow`, etc., but no `core.channelWrite`. Two acceptable resolution paths before the fixture can land:
>
> 1. **Canonicalize a Core WOP `core.channelWrite` node** in `node-packs.md`'s reserved list — matches the `core.<conceptName>` convention, semantically a workflow primitive, requires a one-line addition to the spec.
> 2. **Document a test-only node typeId** in the fixture (e.g., `conformance.channelWrite`) and register it in `fixtures.md` §NodeModule registration as a conformance-only contract — keeps the spec-canonical Core WOP list small while unblocking the fixture.
>
> Decide which path BEFORE the engine PR for `ttlMs` fold ships. The engine work itself doesn't depend on the resolution; only the conformance fixture does.

### Engine-side contract

Per `channels-and-reducers.md` §"Channel TTL":

- `ChannelDeclaration.ttlMs` (integer, range 1ms..1 year) recognized at workflow registration.
- Applies to `append` / `votes` / `feedback` reducers; ignored for others (servers MAY refuse `ttlMs` declarations on unsupported reducers with `400 Bad Request`).
- Drop policy is **lazy**: engine MAY drop expired entries on read OR on next write. No guarantee of removal between expiry and next access.
- Comparison uses the per-entry `RunEventDoc.timestamp` (NOT replay wall-clock) so replays are deterministic.
- Combines with `maxSize`: both apply; whichever bound trips first wins.

### Files to write

1. `conformance/fixtures/conformance-channel-ttl.json` — workflow with:
   - One channel `feedback` declared with `reducer: feedback, ttlMs: 500`.
   - One node `writer` (typeId TBD — minimal "write to channel" — could reuse a generic `core.setVariable`-style or pack-provided node).
   - Inputs: `{firstWrite, secondWrite, sleepMs}`.
2. `conformance/src/scenarios/channel-ttl.test.ts` — scenarios below.

### Conformance scenarios

| Scenario | Asserts |
|---|---|
| Write old entry → sleep > ttlMs → read | Old entry NOT present in `RunSnapshot.channels.feedback` |
| Write old + new (within ttlMs) → read | Both entries present; reducer's normal accumulation honored |
| Write old + new (old > ttlMs old, new fresh) → read | Only new entry present |
| Replay determinism (within TTL window) | See §note A below. |
| `ttlMs` on `replace` reducer (per server policy) | Either `400 Bad Request` at registration OR `ttlMs` ignored. Both are spec-compliant — assert whichever the server's policy returns. |

> **§note A — Replay determinism scope.** Forking the run via `:fork mode=replay` **within `ttlMs` of the most recent entry** produces a `RunSnapshot.channels.feedback` byte-identical to the original. The spec explicitly permits drift outside the TTL window per `channels-and-reducers.md` §"Channel TTL" ("the resulting state matches the original run **modulo TTL drift**"). The conformance test MUST scope its replay to a window narrower than `ttlMs`.

### Effort

~2-2.5h. Depends on whether `core.channelWrite` ships alongside the TTL fold (per the PRE-TRIGGER BLOCKER above): with the canonical node, it's ~2h; with a test-only workaround, ~2.5h.

---

## Trigger 6 — AI cost attribution (closes O4)

### Engine-side contract

Per `observability.md` §"Cost attribution attributes":

- AI activity completion emits these span attributes when the underlying provider returned billable usage:
  - `wop.cost.tokens.input` (number, SHOULD)
  - `wop.cost.tokens.output` (number, SHOULD)
  - `wop.cost.tokens.total` (number, MAY)
  - `wop.cost.usd` (number, MAY)
  - `wop.cost.currency` (string, MAY)
  - `wop.cost.estimated` (boolean, MAY)
  - `wop.cost.provider` (string, SHOULD)
- Structured-log metric record `wop.cost.recorded` with required fields `runId`, `nodeId`, `provider`, `tokensInput`, `tokensOutput`.
- OTel metric `wop.cost.usd` (Counter, monotonic, unit `USD`) with required attribute `provider` + `wop.cost.estimated`.

### Files to write

File: `conformance/src/scenarios/cost-attribution.test.ts`

Reuses the existing `conformance-stream-text` fixture. The mock-provider extension's `usage-only` provider (per `run-options.md` §"Canonical mock provider catalog") already supplies deterministic usage counts.

### Conformance scenarios

| Scenario | Asserts |
|---|---|
| Run with `mockProvider: { id: 'usage-only', config: { usage: {promptTokens: 5, completionTokens: 4, totalTokens: 9} } }` | Run reaches terminal `completed` |
| Structured-log metric record present | Server emits at least one structured log with `metricKind: 'wop.cost.recorded'` containing `tokensInput: 5`, `tokensOutput: 4` |
| Span attributes (best-effort) | If a trace exporter is reachable to the test driver, the activity span carries `wop.cost.tokens.input` + `wop.cost.tokens.output` matching the mock config |

The span-attribute assertions are observability-pipeline-dependent (need an OTel collector reachable from the test driver). The structured-log metric assertion works against any server that writes to its standard logger — typically reachable via an admin/log endpoint or a query-the-deployment-logs hook the test environment provides.

### SDK status

No SDK changes needed — these are server-emitted attributes/metrics that observability collectors consume directly.

### Effort

~2h.

---

## Cross-cutting: SDK status preservation

For traceability — the table below confirms what's already shipped in each reference SDK so future contributors don't re-do the work:

| Surface | TS | Python | Go |
|---|---|---|---|
| S3 `?bufferMs=` query forward | ✅ `EventsStreamOptions.bufferMs` | ✅ `stream_events(buffer_ms=)` | ✅ `StreamEventsOptions.BufferMs` |
| S3 `event: batch` flatten | ✅ flushAndYield returns array | ✅ `_flush_event` returns list | ✅ flush distinguishes batch JSON |
| S4 array streamMode | ✅ `streamMode: StreamMode \| readonly StreamMode[]` | ✅ `Sequence[StreamMode]` | ✅ `StreamModes []StreamMode` |
| O4 / C3 / F2 / F4 / CC-1 | n/a — server-side surfaces, no SDK changes needed |

---

## Reference deployment

Each post-v1.0 trigger's "passing against the reference impl" assertion needs a concrete deployment target. The URL is pinned below; the WOP REST surface itself ships as part of the per-trigger engine work.

### Reference deployment configuration

- **Reference deployment URL:** `https://workflow-runtime-82091227540.us-central1.run.app` (project-number form; the older `workflow-runtime-gjw5bcse7a-uc.a.run.app` hash form remains reachable). Cloud Run service `workflow-runtime` in GCP project `myndhyve-prod`.
- **Current WOP-surface status (2026-04-29):** the full canonical surface is live and feature-complete as of revision `workflow-runtime-00026-4vl`. All 8 OpenAPI-spec'd endpoints carry full implementations; the architect-review-revised follow-on plan for SSE / Webhooks / Fork closed all three tracks.

  **Live, feature-complete (B.1–B.2 + B.6 full + Tracks 1/2/3a/3b):**
  - `GET /.well-known/wop` — Capabilities JSON, `protocolVersion: "1.0.0"`.
  - `GET /v1/openapi.json` — bundled OpenAPI 3.1 doc.
  - `POST /v1/runs` — canonical run-creation with tenant-auth body-spoof guard.
  - `GET /v1/runs/{runId}` — `RunSnapshot` projection per the schema.
  - `POST /v1/runs/{runId}/cancel` — `{reason?}` body persisted on the cancellation event.
  - `GET /v1/runs/{runId}/artifacts/{artifactId}` — resolves runtime artifact IDs against `state.nodeOutputs`.
  - `GET /v1/runs/{runId}/events` (SSE) — **all four modes** (`values`, `updates`, `messages`, `debug`) + mixed mode (`updates,messages` etc.) + `bufferMs` aggregation per stream-modes.md. In-memory `applyEvent` projection; zero N+1 reads on `values`-mode synthesis. Last-Event-ID resume + values-baseline emission.
  - `GET /v1/runs/{runId}/events/poll` — short-poll fallback.
  - `POST /v1/runs/{runId}/interrupts/{nodeId}` — writes `resumeValue` into the workspace-scoped suspension doc and triggers `resumeRun()`.
  - `POST /v1/runs/{runId}:fork` — **both `branch` and `replay` modes live**. Branch: folds source events `[0, fromSeq)` into a seeded RunState + applies optional `runOptionsOverlay`. Replay: same fold-and-seed plus the executor reads the InvocationLog from the source's keyspace for deterministic playback; cache misses emit `replay.diverged` events (informational; surfaces in `debug` stream mode + run timeline).
  - `POST /v1/webhooks` + `DELETE /v1/webhooks/{webhookId}` — **subscription store + dispatch loop live**. SSRF-validated URLs, HMAC-SHA256 signing over `{timestamp}.{rawBody}` with `X-WOP-Signature` + `X-WOP-Timestamp` headers (replay-attack-resistant), per-workspace concurrency cap (10 in-flight), 5s `AbortController` timeout, circuit breaker (4 consecutive fails → 1h cooldown), 100/7d-rolling-failure auto-disable. Best-effort delivery scope; durable retries (Cloud Tasks) tracked as a separate follow-on per `webhooks.md`.

  **Backward compat:**
  - The legacy `POST /v1/canvases/{canvasTypeId}/runs` continues to serve back-compat traffic and carries `Deprecation: true` + `Sunset: Wed, 28 Apr 2027 00:00:00 GMT` + `Link: </v1/runs>; rel="successor-version"` (Phase B.5).
  - The legacy `GET /v1/runs/{runId}` was removed (no callers); the canonical version replaces it at the same path.

  **Host adapter layer (PRD §11 Phase 2 / G19):**
  - All 16 interfaces are populated by `defaultHostAdapterSuite()` — 7 real impls, 3 minimal, 5 throw-on-use stubs (Phase B.3 / B.4a / B.4b).

  **Architecture review fixes baked in (21 findings across the three follow-on tracks):**
  - 3 CRITICAL: SSRF guard on subscription URLs, replay-resistant HMAC signing, retry-durability scope decision (best-effort with documented Cloud Tasks deferral).
  - 7 HIGH: `EventLog.onAppend` chaining, `applyEvent` in-memory projection, divergence callback contract, branch field-copy contract, idempotency-key handling, 422 fromSeq bounds, dispatcher payload reduction.
  - 7 MEDIUM + 4 LOW: messages-mode diagnostic, mixed-mode label priority, secret redaction, per-instance concurrency, fetch timeout, long-term failure policy, eventsUrl format, conformance-delta tracking.

  Conformance scenarios for the implemented surface should now pass against the deployment, including S3 (buffering), S4 (mixed mode), R3/R4 (replay branch + replay determinism), W1-W3 (webhook register / fire / verify). The few remaining parked scenarios (`messages` mode AI chunk emission, durable webhook retries, full event-stream divergence detection) are deferred follow-ons named in the spec docs themselves.
- **Test API keys:** issued via the admin panel's `seedGlobalData` flow with the `hk_test_` prefix per `auth.md`. The conformance suite's test API keys (per the impl plan owner's deploy runbook) are the canonical credentials.
- **Who runs the suite:** when an engine PR ships a trigger surface, the impl plan owner runs `npm run wop:check` against the reference deployment as part of the PR's pre-merge gate. After merge, the conformance contributor (whoever lands the fixture/scenario commit) confirms the suite passes a second time before bumping `@wop/conformance` to a new minor and updating the post-v1.0 trigger tracker in §"v1.0 release record" below.
- **What if the reference deployment is unreachable:** the corresponding scenario is parked with a `(blocked: reference deployment <reason>)` note in the conformance suite's PR until the deployment is restored. The suite's server-free subset (46 scenarios) MUST still pass on every PR independent of deployment availability.

---

## Definition of v1.0 Final

**v1.0 ships when the spec contract is locked, the schemas compile, the SDKs build, and the conformance suite is published — independent of any specific engine implementation's progress against that suite.** This is the RFC 2616 / HTTP model: the protocol is a contract; implementations validate themselves against the conformance suite at their own cadence.

All four checklists below are ✅ DONE as of 2026-04-27.

### Spec corpus ✅ DONE

- [x] All 12 prose specs read `Status: FINAL v1.0 (2026-04-27).`
- [x] CHANGELOG.md captures the v1.0 final release.
- [x] No "PROPOSED v1.1" or "PROPOSED v2" tags remain in the corpus.
- [x] All open-spec-gap tables across the corpus show ✅ for the original 21 items.
- [x] `node-packs.md` `https://packs.wop.dev/` deployment status note records that the hosted registry is post-v1.0 ops work — does not block v1.0 final.

### Reference SDKs ✅ DONE

- [x] TS / Python / Go SDKs all build clean against the v1.0 spec.
- [x] Each SDK's package.json / pyproject.toml / Go module version pinned to `1.0.0`.
- [x] CHANGELOG entries for each SDK note v1.0 alignment.

### Conformance suite ✅ DONE

- [x] `@wop/conformance` published at `1.0.0`.
- [x] 82 scenarios across 15 files (46 server-free + 36 server-required).
- [x] Server-free subset (46 scenarios — fixtures + spec-corpus self-validator) passes locally.
- [x] All scenario IDs present in `fixtures.md` have matching JSON files.

### CI + tooling ✅ DONE

- [x] `scripts/wop-check.sh` runs all 6 stages clean on every merge.
- [x] `.github/workflows/wop-spec.yml` exercises Go via `setup-go@v5`.
- [x] All committed package-lock.json + go.mod files match a fresh install.

---

## Post-v1.0 ecosystem roadmap (the six triggers)

The six triggers below were originally framed as v1.0 blockers. They are now **post-v1.0 ecosystem work** — each one is a piece of engine-implementation conformance the *implementations* validate against the published v1.0 conformance suite at their own cadence. **They do not gate the v1.0 spec tag.** They are kept here as the canonical list of "what each implementation needs to support to claim v1.0 conformance against the suite."

| # | Trigger | Closes | Type | Conformance fan-out |
|---|---|---|---|---|
| 1 | SSE buffering shipped in reference impl | S3 | SSE wire | 1 scenario file |
| 2 | Mixed-mode SSE shipped in reference impl | S4 | SSE wire | 1 scenario file |
| 3 | `core.subWorkflow` node module shipped | F2 | New node module | 2 fixture JSONs + 1 scenario file |
| 4 | Per-run `nodeExecutionCount` counter shipped | F4 + CC-1 | Engine-internal | 1 fixture JSON + 1 scenario file |
| 5 | Channel `ttlMs` reducer fold shipped | C3 | Engine-internal | 1 fixture JSON + 1 scenario file |
| 6 | `wop.cost.*` activity emission shipped | O4 | Activity completion | 1 scenario file |

**Tracking:** as each trigger lands in any implementation, the implementation's owner SHOULD open a PR adding the corresponding scenario(s) to the conformance suite. The suite remains versioned at `1.0.0` regardless — additional scenarios are minor releases of `@wop/conformance` against the unchanged v1.0 protocol contract.

The six per-trigger §sections earlier in this doc remain as the canonical engine-side contract spec for each surface — read those when implementing.

### Coordination notes

- The 6 trigger sections are **independent** — they can ship in any order, in any combination, on each implementation's preferred schedule.
- When an implementer ships one of these engine pieces, they SHOULD link the relevant trigger §section in their PR description so reviewers can cross-check the engine behavior against the conformance assertions.
- If a trigger section's engine contract turns out to need a spec-text correction (engine implementer finds an ambiguity), open a PR against the relevant prose doc. Spec corrections after v1.0 ship as v1.0.x point releases per `CONTRIBUTING.md`.
- **If an implementer discovers the spec contract is BREAKING** — i.e., a wire-shape change that the SDKs already implement against — that's a v1.1 conversation, NOT a v1.0.x patch. Re-engage via `CONTRIBUTING.md` §"Coordination with the impl plan."

---

## How this plan evolves (post-v1.0)

When a trigger fires in any implementation (engine PR merged):

1. **Land the conformance work** — add the fixture JSON(s) and scenario file from this trigger's "Files to write" list (in the per-trigger §sections above). Bump `@wop/conformance` to a new minor (`1.X.0`) — additional scenarios against the unchanged v1.0 protocol contract are minor releases of the suite.
2. **Update fixtures.md** — flip the trigger's row in the open-spec-gap table from "spec ✅ / impl pending" → "✅" and remove the `(impl pending)` marker from the §section heading. The conformance suite's `spec-corpus-validity.test.ts` round-trip check then re-includes the fixture id in its scan (the existing strip regex stops matching once `(impl pending)` is gone).
3. **Cross-link from §"v1.0 release record"** — under the trigger's row, add the implementation PR URL + the conformance commit URL so future readers can trace what landed where.
4. **Keep the per-trigger §section** above as a record of the engine-side contract — do NOT delete. Implementers reading this doc later see the full v1.0 conformance narrative.

### Convention: pre-trigger blockers

If a trigger surfaces a spec decision needed BEFORE the conformance fixture can land (typeId selection, escape hatches, etc.), flag it with a `🚧 PRE-TRIGGER BLOCKER` blockquote at the top of the trigger §section, listing the resolution paths. The convention was first used in Trigger 5 (channel TTL — needs `core.channelWrite` typeId or test-only equivalent). Reuse the same visual style so blockers are scannable across the doc.

---

## What this plan does NOT cover

- **P2-F2** (`@wop/engine` rename + republish) — package extraction work, deferred to Part 2 Phase D per `WORKFLOW-PROTOCOL-WOP-PLAN.md` and the `PRD-WOP-MYNDHYVE-EXTENSION-LAYER.md`. Not a v1.0 blocker.
- **P2-R1 / P2-R2** (canvas-type decoupling, storage-agnostic event log + suspend) — same; Part 2 Phase D.
- **Hosted node-pack registry** at `packs.wop.dev` — operations / DevOps work; spec is firm. Not a v1.0 blocker.
- **P2-F7** (reference docs site / dev portal) — covered by per-package READMEs for v1.0; full docs site is post-v1.0.

These are tracked in `docs/plans/WORKFLOW-PROTOCOL-WOP-PLAN.md` Part 2 Phase D.

## v1.0 release record (2026-04-27)

WOP v1.0 final tagged on 2026-04-27. This is the protocol contract; implementations validate against it at their own cadence per the post-v1.0 ecosystem roadmap above.

### What shipped

| Surface | State |
|---|---|
| Prose specs | 12 files, all `Status: FINAL v1.0 (2026-04-27)` — auth, capabilities, channels-and-reducers, idempotency, interrupt, node-packs, observability, replay, rest-endpoints, run-options, stream-modes, version-negotiation |
| JSON Schemas | 10 first-class schemas, all compile clean under Ajv2020 |
| API definitions | OpenAPI 3.1 (`api/openapi.yaml`) + AsyncAPI 3.1 (`api/asyncapi.yaml`), both lint clean, all `$ref`s resolve |
| Reference SDKs | TS (`@wop/client`) + Python (`wop-client`) + Go (`wopclient`) — all pinned to `1.0.0` |
| Conformance suite | `@wop/conformance` `1.0.0` — 82 scenarios across 15 files (46 server-free + 36 server-required) |
| CI gating | `scripts/wop-check.sh` 6-stage pipeline + `.github/workflows/wop-spec.yml` |
| Governance | `CONTRIBUTING.md` covers the post-v1.0 change process; `CHANGELOG.md` captures release |

### Post-v1.0 trigger tracker

This table is populated as each implementation ships the corresponding surface. Empty rows = no implementation has shipped that trigger yet.

| Trigger | Closes | First impl PR | Conformance scenario commit | Conformance suite version |
|---|---|---|---|---|
| 1 — SSE buffering | S3 | `b914051b` | `2a932a74` | 1.4.0 |
| 2 — Mixed-mode SSE | S4 | `dea29467` | `55a23546` | 1.5.0 |
| 3 — `core.subWorkflow` | F2 | `f7447984` | `6d8325c9` | 1.2.0 |
| 4 — Recursion-limit enforcement | F4 + CC-1 | `a0f19314` | `eb199a2f` | 1.1.0 |
| 5 — Channel TTL reducer fold | C3 | `167bc7f6` | `3be5eb6c` | 1.3.0 |
| 6 — AI cost attribution | O4 | `<this-pair>` | `<this-pair>` | 1.6.0 (placeholder) |

**Phase A complete (2026-04-28).** All six post-v1.0 conformance triggers shipped against the unchanged WOP v1.0 protocol contract. The MyndHyve reference implementation now ships the runtime + conformance fan-out for each. Trigger 6 conformance is `it.todo()` placeholder pending observable-span access in the conformance driver — runtime side (allowlist + redaction) is fully unit-tested.

### Phase A follow-ups (low-priority polish)

| Item | Severity | Notes |
|---|---|---|
| **SSE per-event `event:<mode>` label** | Low | `stream-modes.md:195` says SSE events SHOULD carry `event: <mode>` (e.g., `event: updates`) in mixed mode. Phase A impl uses `event: <type>` (e.g., `event: node.completed`) for backward-compat with the existing `stream-modes.test.ts` scenario. Switching requires migrating the existing scenario to expect `event: <mode>` instead. SDKs that try to discriminate-by-mode work around this by inspecting the type. |
| **Channel-write parallel-branch transactionality** | Medium | v1 `core.channelWrite` does read-modify-write through `ctx.variables` (non-transactional). Two parallel branches writing to the same channel race; last-write-wins. Spec needs a transactional channel storage primitive (out of v1 scope). |
| **Cost-attribution observable surface** | Medium | G6 conformance scenarios are `it.todo()` until either (a) the conformance driver gains OTel span access, or (b) the runtime exposes `metrics.cost` on the `RunSnapshot` shape with the canonical `wop.cost.*` allowlisted keys. (b) is the cleaner path — extends the existing snapshot vs. requiring a new instrumentation surface. |

---

## References

- `CHANGELOG.md` — full state of what's shipped
- `CONTRIBUTING.md` — contribution process for spec changes (post-v1.0 patches + minor + major)
- `conformance/fixtures.md` — fixture contracts (each trigger section above maps to specific fixtures here)
- `conformance/README.md` — conformance suite operator docs
- `docs/PRD-WOP-MYNDHYVE-EXTENSION-LAYER.md` — Part 2 Phase D blueprint (post-v1.0 work)
- `docs/plans/WORKFLOW-PROTOCOL-WOP-PLAN.md` — historical plan (gitignored)
