# WOP Spec v1 — Replay and Time-Travel Debugging

> **Status: FINAL v1.0 (2026-04-27).** Comprehensive coverage of `POST /v1/runs/{runId}:fork` for replay and branch-from-past, idempotency requirements on side-effecting nodes, determinism guarantees, and the admin Run Timeline View. Stable surface for external review. Keywords MUST, SHOULD, MAY follow [RFC 2119](https://www.rfc-editor.org/rfc/rfc2119). See `auth.md` for the status legend.

---

## Why this exists

The durable event log makes time-travel debugging nearly free: every meaningful state transition is persisted with a sequence number, so the run state at any point in history can be reconstructed deterministically by folding events up to that sequence.

Without a replay surface, this potential is wasted. Operators and developers who hit a workflow bug currently have to:
- Read raw event docs from Firestore.
- Mentally fold the events to reconstruct state.
- Make a hypothesis about what fix would change behavior.
- Modify the live workflow definition.
- Wait for new runs to confirm.

The cycle takes hours. WOP defines a `POST /v1/runs/{runId}:fork` endpoint that lets developers re-execute or branch from any historical sequence — debugging cycle drops to minutes.

The fork mechanism parallels [LangGraph's `update_state(checkpoint, ...)`](https://langchain-ai.github.io/langgraph/concepts/persistence/#update-state) and [`get_state_history`](https://langchain-ai.github.io/langgraph/concepts/persistence/#get-state-history) idioms — chosen for ecosystem familiarity.

---

## Two modes

### `replay`

Re-execute the workflow deterministically from event sequence `fromSeq`, using the *same* events the original run produced. Used to validate that current code reproduces the original behavior.

- The new run consumes events from the source run for sequences `< fromSeq` (treats them as fixed history).
- For sequences `>= fromSeq`, the new run executes against the *current* code path, persisting NEW events.
- If the new events match the original sequence-by-sequence, the replay is deterministic.
- If they diverge, the divergence point pinpoints the regression.

### `branch`

Re-execute starting at the *projected state* at `fromSeq`, but with new caller-supplied inputs / `configurable` overrides. Used for "what-if" debugging: "what would have happened if we'd approved instead of rejected at step N?"

- The projected state at `fromSeq` becomes the initial state of the branched run.
- Caller supplies new `RunOptions` to overlay.
- The branched run is a fully independent run (new `runId`, new event subcollection).
- The original run is unmodified.

---

## Endpoint

```
POST /v1/runs/{runId}:fork
Authorization: Bearer <api-key with runs:create scope>
Idempotency-Key: <UUID>  (RECOMMENDED)
```

Body:

```json
{
  "fromSeq": 42,
  "mode": "replay" | "branch",
  "runOptionsOverlay": {
    "configurable": { "model": "claude-haiku-4-5" },
    "tags": ["fork:debugging-issue-2456"]
  }
}
```

| Field | Type | Required for | Notes |
|---|---|---|---|
| `fromSeq` | `number` | both | Inclusive — events `< fromSeq` are fixed history; `>= fromSeq` are re-executed. `0` = full re-execution from start. |
| `mode` | `'replay' \| 'branch'` | both | Determines re-execution semantics (above). |
| `runOptionsOverlay` | `RunOptions` (see `run-options.md`) | branch only | MUST be omitted or empty for `replay` (replay must be deterministic — overlays would break that). |

### Response

```json
{
  "runId": "run_xyz789",
  "sourceRunId": "run_abc123",
  "fromSeq": 42,
  "mode": "branch",
  "status": "pending",
  "eventsUrl": "/v1/runs/run_xyz789/events"
}
```

Status codes:
- `201 Created` — fork accepted, new run started
- `400 Bad Request` — invalid `fromSeq` (out of range), `replay` with non-empty `runOptionsOverlay`, etc.
- `404 Not Found` — source `runId` doesn't exist or caller can't see it
- `409 Conflict` — only when `Idempotency-Key` is provided and the request is a duplicate of an in-flight fork
- `422 Unprocessable Entity` — `fromSeq` references a sequence number that doesn't exist in the source run's event log
- Higher codes per standard error response shape (`auth.md`, `idempotency.md`)

---

## Determinism guarantees

### `replay` mode

A WOP-compliant server MUST guarantee determinism of replay subject to the following caveats:

1. **Side-effecting nodes** — every NodeModule that calls an external API (LLM, payment, message) MUST consult `FirestoreInvocationLog` (see `idempotency.md` Layer 2). On replay, the cached response is returned — the external system is NOT called twice.
2. **`ctx.interrupt(payload)`** — every interrupt with key `K` short-circuits to the persisted `interrupt.resolved` value. The external system is NOT prompted again.
3. **`ctx.getVersion(changeId, min, max)`** — pinned values from the original run are preserved (events `< fromSeq` are fixed history). The branch the original run took is the branch the replay takes.
4. **Time-dependent code** — if a NodeModule reads `Date.now()` directly (not via the engine's logical clock), replay is non-deterministic. NodeModules MUST consume time via `ctx.now()` if available, or accept non-determinism.

### `branch` mode

`branch` mode is NOT deterministic by design — the caller is changing inputs/config. Determinism guarantees apply only to the events `< fromSeq` that are inherited as fixed history.

### Failure surfaces

If a `replay` mode fork diverges from the original (a node produces a different event than the original at the same sequence), the engine MUST:

1. Continue execution.
2. Emit a `replay.diverged` event with `{ originalEventId, replayEventId, divergencePoint }`.
3. Surface this event in `debug` stream mode and via OTel span attribute `wop.replay.diverged: true`.

The replayed run continues to completion or further divergence; the `replay.diverged` event is informational, not blocking.

---

## Replay-from-event-log internals

The engine implementation reuses the existing `recoverRunFromEventLog(runId)` machinery (per `WORKFLOW_ORCHESTRATION.md`):

1. `EventLog.read(sourceRunId, { fromSequence: 0, limit: fromSeq })` — load events `< fromSeq`.
2. `fold(events) → ProjectedRunState` — derive initial state.
3. New run is initialized with that state, copy-on-write into the new event subcollection.
4. For `replay`, executor invocations consult `FirestoreInvocationLog` keyed on `(sourceRunId, ...)` for side-effect dedup.
5. For `branch`, executor invocations create new invocation log entries keyed on `(newRunId, ...)`.

---

## Run Timeline View (admin panel)

A WOP-compliant server SHOULD expose an admin Run Timeline View that renders `runs/{runId}/events/{eventId}` as a per-node timeline with:

- Event payload inspection (collapsible JSON tree)
- Side-by-side state diffs at each event
- Jump-to-replay-from-here shortcut for any event
- Filter by event type / node / kind

This is the in-app equivalent of LangSmith's run inspection view; building it in-tree avoids vendor + PII-export costs and tailors to the implementation's specific event types and approval-gate semantics.

The Timeline View is OPTIONAL for spec compliance. If implemented, it MUST surface the replay endpoint via deep links.

---

## Use cases

1. **Reproduce a production bug** — replay the failing run; if it fails the same way, the bug is deterministic and a fix can be tested via branch mode.
2. **Validate a refactor** — replay multiple successful runs across the changed code path; if any diverge, investigate.
3. **Test an alternative approval decision** — branch from the approval point with the opposite action.
4. **A/B test prompt variants** — branch with different `configurable.promptOverrides`.
5. **Conformance testing** — black-box test suite branches a known fixture run from various points and asserts expected outputs.

---

## Open spec gaps

| # | Gap | Owner |
|---|---|---|
| RP1 | Bulk fork API — fork many runs at once for batch validation | future |
| RP2 | Branch-with-edited-event API — modify a specific event in-place rather than overlay options | future v1.x |
| RP3 | Determinism scoring — automated check across N runs that flags non-deterministic NodeModules | future |
| RP4 | Garbage collection — branched runs never auto-prune even if marked debug; needs retention policy | future v1.x |
| RP5 | Privacy considerations — replay re-uses cached LLM responses, but if those responses contain PII deleted from the original run, replay re-exposes it. Needs spec-level policy. | future v2 |

## References

- `auth.md` — auth model + scope vocabulary (`runs:create`)
- `rest-endpoints.md` — `POST /v1/runs/{runId}:fork` endpoint
- `version-negotiation.md` — event log structure + per-event schema versioning
- `idempotency.md` — Layer 2 invocation log (the determinism backbone for replay)
- `interrupt.md` — interrupt replay semantics
- `run-options.md` — `runOptionsOverlay` shape
- `observability.md` — `wop.replay.{source_run_id, from_seq, mode}` attributes + OTel `Link` from the forked `wop.run` span to the source's. See observability.md §Replay / branch attributes (closes O3).
- `stream-modes.md` — `replay.diverged` event in `debug` mode
- LangGraph state history: <https://langchain-ai.github.io/langgraph/concepts/persistence/#get-state-history>
- WOP plan: gap #28 (event log durable but not exposed for replay/fork)
- Reference impl: `WorkflowEngine.recoverRunFromEventLog` (substrate, currently used only for crash recovery), `EventLog.read({ fromSequence })` (range query primitive)
