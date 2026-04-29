# `@myndhyve/wop-conformance` Changelog

Minor releases against the unchanged WOP v1.0 protocol contract. New
scenarios may ship as `1.X.0`; the protocol contract itself remains at
v1.0 (no breaking changes here unless protocol moves to v2).

## [1.7.0] — 2026-04-29

Adds vendor-neutral redaction scenarios (NFR-7) — spec-side companion
to in-tree redaction harnesses. Black-box assertions that any WOP-
compliant server doesn't leak canary content via observable surfaces.

### Added

- **`src/lib/canaries.ts`** — vendor-neutral canary fixture set + leak
  detector. 5 canary shapes (openai/anthropic/google/jwt-bearer/byok-
  credential-ref) built via runtime string concatenation so static
  secret scanners (TruffleHog, gitleaks) don't flag the file. Carries
  the unique marker `CANARY-WOP-CONFORMANCE-NEVER-SECRET` so leaks are
  unambiguously identifiable. Exports `findCanaryLeaks` +
  `assertNoCanaryLeak` helpers.
- **`src/scenarios/redaction.test.ts`** — 6 scenarios in 3 groups:
  1. **Discovery shape contract** (always runs): `secrets` and
     `aiProviders` advertisements are well-formed regardless of
     `secrets.supported`. When `supported === true`, scopes MUST be
     non-empty + `resolution === 'host-managed'`. `byok ⊆ supported`.
  2. **Bearer-token redaction** (always runs): invalid Bearer canary
     in `Authorization` header is not echoed in the 401 response body.
     Tested across two canary shapes (jwt-bearer + byok-credential-ref)
     plus a marker-only universal check.
  3. **credentialRef echo control** (gated on `secrets.supported`):
     canary planted in `configurable.ai.credentialRef` MUST NOT
     appear in any RunEvent payload. Uses poll-based capture so the
     scenario stays transport-agnostic. Trivially passes (skip-equiv)
     when host advertises `secrets.supported: false`.

### Spec references

- `capabilities.md` §"Secrets" + NFR-7 — secrets MUST NOT reach event
  logs / traces / errors / prompts / exports.
- `capabilities.md` §"aiProviders" — credentialRef is opaque + host-
  resolved; servers MUST NOT include the value in any RunEvent.
- Reference impl: `services/workflow-runtime/src/__tests__/redaction/`
  in MyndHyve carries the in-process companion harness covering
  surfaces the conformance suite can't see (logger output, OTel attrs).

Total at 1.7.0: 108 scenarios across 22 files (50 server-free + 53
server-required + 5 placeholder).

## [1.6.0] — 2026-04-28

Closes G6 / O4 — `wop.cost.*` cost attribution (runtime-side; conformance
scenarios are placeholder pending observable-span access).

### Added

- **`src/scenarios/cost-attribution.test.ts`** — 5 scenarios using
  `it.todo()` placeholders:
  1. Every node.completed for AI-call nodes carries the 6 allowlisted
     wop.cost.* OTel attributes.
  2. OTel span attributes never contain a key outside the allowlist.
  3. Credential-shaped fields from upstream provider responses don't
     appear in any OTel attribute (regression test for redaction).
  4. wop.cost.tokens.input/output are non-negative integers.
  5. wop.cost.usd is a non-negative number (fractional allowed).

### Why placeholder

The runtime side ships in this commit pair with the
`WOP_COST_ATTRIBUTE_NAMES` allowlist (6 attributes), `sanitizeCostForOtel`
pure function (15 unit tests including 3 dedicated redaction assertions),
and `applyCostAttributesToSpan` wired into Cloud Run's `ctx.recordCost`.
Conformance against a deployed server requires either OTel span access
or a cost-introspection surface — neither exists in the v1 conformance
driver today. The placeholder scenarios document the contract so they
become runnable when the access surface lands.

### Server-side prerequisite (when scenarios become runnable)

Implementations must expose either:
  - The OTel span attributes from node-completion spans, OR
  - A run-snapshot `metrics.cost` field with the same allowlisted shape.

The MyndHyve reference implements the runtime emission in this commit
pair at `packages/workflow-engine/src/observability/costAttribution.ts`
+ `services/workflow-runtime/src/runExecutor.ts` (recordCost wiring).

### Counts

Total: 102 scenarios across 21 files (50 server-free + 47 server-required + 5 placeholder).
Was 97 at 1.5.0. Server-free unchanged. Server-required unchanged.
+5 placeholder scenarios (it.todo) for cost-attribution.

## [1.5.0] — 2026-04-28

Closes G2 / S4 — mixed-mode SSE (`?streamMode=A,B`).

### Added

- **`src/scenarios/stream-modes-mixed.test.ts`** — 4 scenarios:
  1. Server accepts `streamMode=updates,messages` and emits a
     server-closed stream containing `run.completed`.
  2. `streamMode=values,updates` returns 400 with `unsupported_stream_mode`
     error envelope (values is exclusive per spec).
  3. `streamMode=updates,bogus` returns 400 (partial-unknown lists fail
     wholesale).
  4. Union semantics: `updates,debug` includes every event type that
     `updates`-only would include.

No new fixtures — reuses `conformance-delay`.

### Server-side prerequisite

Implementations must accept `?streamMode=` as a comma-separated subset
of `{values, updates, messages, debug}`, reject `values` combined with
others, reject unknown modes (returning the canonical
`unsupported_stream_mode` envelope with `supported` array), and apply
union-of-filters semantics. The MyndHyve reference shipped this in
commit `<this-commit>` at
`functions/src/canvas-runtime/transports/rest/sse.ts`.

### Counts

Total: 97 scenarios across 20 files (50 server-free + 47 server-required).
Was 93 at 1.4.0. Server-free unchanged. Server-required +4 (the four
mixed-mode scenarios).

## [1.4.0] — 2026-04-28

Closes G1 / S3 — SSE buffering (`?bufferMs=` aggregation hint).

### Added

- **`src/scenarios/stream-modes-buffer.test.ts`** — 4 scenarios:
  1. Server accepts `bufferMs` in [0..5000] and emits at least one
     `event: batch` SSE frame whose data parses to a JSON array of
     RunEventDoc.
  2. Out-of-range `bufferMs=99999` returns 400 with
     `validation_error`.
  3. Force-flush on terminal: with `bufferMs=4000`, terminal events
     arrive bundled in a batch BEFORE the timer would have fired
     (run.completed cannot be held back to the next interval).
  4. `bufferMs=0` behaves identically to omitting (per-event mode,
     zero batch frames).

No new fixtures — reuses `conformance-delay`.

### Server-side prerequisite

Implementations must accept `?bufferMs=` query parameter on
`GET /v1/runs/{runId}/events`, validate range [0..5000], and emit
`event: batch` SSE frames with array data when `bufferMs > 0`. Force
flush on terminal/suspend events. The MyndHyve reference shipped this
in commit `<this-commit>` at
`functions/src/canvas-runtime/transports/rest/sse.ts`.

### Counts

Total: 93 scenarios across 19 files (50 server-free + 43 server-required).
Was 89 at 1.3.0. Server-free unchanged (no new fixtures). Server-required
+4 (the four buffer-mode scenarios).

## [1.3.0] — 2026-04-28

Closes G5 / C3 — channel TTL reducer fold.

### Added

- **`fixtures/conformance-channel-ttl.json`** — workflow that writes 3
  entries to channel `events` (ttlMs=200), waits 300ms via `core.delay`,
  then writes a 4th entry. After the post-TTL write, the channel state
  MUST contain exactly the 4th entry.
- **`src/scenarios/channel-ttl.test.ts`** — single scenario asserting:
  terminal `completed`; final variables.events has length 1; surviving
  entry has value `"d"`; entry preserves the numeric `_ts` write timestamp.

### Server-side prerequisite

Implementations must support `core.channelWrite` Core WOP node with the
`append` reducer + `ttlMs` filter. The MyndHyve reference shipped this
in commit `<this-commit-pair>` at
`packages/workflow-engine/src/nodes/core/channelWrite.node.ts` plus
registration via `CORE_NODE_MODULES`.

### Counts

Total: 89 scenarios across 18 files (50 server-free + 39 server-required).
Was 87 at 1.2.0. Server-free +1 (auto-discovered fixture validity).
Server-required +1 (the channel-ttl scenario).

## [1.2.0] — 2026-04-28

Closes G3 / F2 — sub-workflow dispatch.

### Added

- **`fixtures/conformance-subworkflow-parent.json`** — parent workflow
  that invokes the child via `core.subWorkflow` with `waitForCompletion: true`
  and `outputMapping: { childOutcome: childResult }`.
- **`fixtures/conformance-subworkflow-child.json`** — two-node noop
  child that completes with a known `childResult` variable.
- **`src/scenarios/subworkflow.test.ts`** — two scenarios:
  1. Parent reaches terminal `completed`; child variable propagates to
     parent through outputMapping (`childOutcome === "child-completed"`).
  2. Child run carries `parentRunId` + `parentNodeId` linkage; child's
     own snapshot reaches terminal `completed`.

### Server-side prerequisite

Implementations must support `core.subWorkflow` server-side dispatch.
The MyndHyve reference deployment ships the implementation in commit
`<this-commit>` at `services/workflow-runtime/src/serverChildWorkflow.ts`
(replaces the prior stub in `serverExecutionHost.ts`).

### Counts

Total: 87 scenarios across 17 files (49 server-free + 38 server-required).
Was 85 at 1.1.0. Server-free +2 (auto-discovered fixture validity for
the two new fixtures). Server-required +2 (the two subworkflow scenarios).

## [1.1.0] — 2026-04-27

Closes G4 / CC-1 — recursion-limit invariant.

### Added

- **`fixtures/conformance-cap-breach.json`** — six-node noop chain
  workflow. Run with `RunOptions.configurable.recursionLimit: 3` to
  trigger the per-run `nodeExecutionCount` cap.
- **`src/scenarios/cap-breach.test.ts`** — two scenarios:
  1. Run reaches terminal `failed` with `error.code = "recursion_limit_exceeded"`;
     `cap.breached` event has `kind: "node-executions"` payload with
     `limit`, `observed`, `nodeId`.
  2. `cap.breached` precedes `run.failed` in the event sequence; exactly
     `limit` `node.started` events emitted (over-limit node MUST NOT
     receive `node.started` — breach detected before dispatch).

### Server-side prerequisite

Implementations must support `RunOptions.configurable.recursionLimit`
parsing + per-run `nodeExecutionCount` enforcement. The MyndHyve
reference deployment ships this in commit `a0f19314` at
`services/workflow-runtime/src/recursionLimit.ts` +
`runExecutor.ts` dispatch loop.

### Counts

Total: 85 scenarios across 16 files (47 server-free + 38 server-required).
Was 82 at 1.0.0.

## [1.0.0] — 2026-04-27

Initial release alongside WOP v1.0 protocol. See spec
`CHANGELOG.md` `[1.0.0]` entry for the corpus-wide release record.

- 82 scenarios across 15 files (46 server-free + 36 server-required).
- Coverage: discovery, auth, errors, run lifecycle, idempotency,
  cancellation, HITL approval/clarification, failure paths, identity
  passthrough, multi-node ordering, SSE stream modes, replay/fork,
  version negotiation.
- `wop-conformance` CLI wraps `vitest run` with friendlier flags.
