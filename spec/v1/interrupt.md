# WOP Spec v1 — HITL Interrupt Primitive

> **Status: FINAL v1.0 (2026-04-27).** Comprehensive coverage of the canonical `interrupt(payload)` primitive, deterministic resume keys, the four `kind` discriminators (`approval`, `clarification`, `external-event`, `custom`), the 5-action approval vocabulary, and the signed-token callback URL surface. Stable surface for external review. Keywords MUST, SHOULD, MAY follow [RFC 2119](https://www.rfc-editor.org/rfc/rfc2119). See `auth.md` for the status legend.

---

## Why this exists

Workflow execution often needs to pause for input from outside the engine: human approval, AI clarification, an external event (webhook, scheduled time, message arrival). Without a single canonical primitive, every reason invents its own pause-and-resume semantics — leading to:

- Distributed implementations across `SuspendManager`, callback URLs, approval gates, and ad-hoc executor patterns.
- Inconsistent replay-determinism guarantees.
- Different correlation conventions per reason, making cross-cutting tooling (admin panels, observability) hard to build.

WOP defines a single `interrupt(payload)` primitive that NodeModules call to pause execution and resume on external input. Reason discrimination is via a typed `kind` field on the payload. The 5-action approval vocabulary becomes the canonical `kind: "approval"` shape; clarification, external-event, and custom interrupts share the same surface.

The `interrupt(payload)` idiom parallels [LangGraph's `interrupt`](https://langchain-ai.github.io/langgraph/concepts/human_in_the_loop/) — chosen for ecosystem familiarity.

---

## Primitive

A WOP-compliant engine MUST expose `interrupt` on the `NodeContext`:

```typescript
interface NodeContext {
  /**
   * Pause execution and wait for external resume. Returns the resume value
   * (validated against `payload.resumeSchema` if supplied) when an external
   * caller resolves the interrupt.
   *
   * Throws `InterruptCancelledError` if the run is cancelled while suspended.
   * Throws `InterruptTimeoutError` if `payload.timeoutMs` elapses without resume.
   */
  interrupt<TResume = unknown>(payload: InterruptPayload<TResume>): Promise<TResume>;
}
```

### `InterruptPayload`

```typescript
interface InterruptPayload<TResume = unknown> {
  /** Discriminator for resume-time routing + UI rendering + observability. */
  kind: 'approval' | 'clarification' | 'external-event' | 'custom';

  /**
   * Deterministic key used to short-circuit on re-entry after process death.
   * If two `interrupt()` calls in the same run emit the same key, the second
   * returns the cached result of the first. Recommended:
   * `${runId}:${nodeId}:${interruptCount}`.
   */
  key: string;

  /** Optional Zod schema (or equivalent) — resume value validated before return. */
  resumeSchema?: ResumeSchemaShape;

  /** Optional auto-reject after this duration. Throws `InterruptTimeoutError`. */
  timeoutMs?: number;

  /** Discriminated payload data (see "Per-kind payloads" below). */
  data: ApprovalData | ClarificationData | ExternalEventData | CustomData;
}
```

The `key` field is what makes interrupt **replay-deterministic**. On a recovery via `recoverRunFromEventLog`, the engine sees the persisted `interrupt.requested` event with its key. If the executor calls `interrupt()` again with the same key, the engine short-circuits and returns the persisted `resumeValue` without prompting the external system again.

### Resume value

```typescript
type ResumeValue<TResume> = TResume;
```

External systems resume an interrupt by calling `POST /v1/interrupts/{token}` (signed-token surface) or `POST /v1/runs/{runId}/interrupts/{nodeId}` (run-scoped surface, requires `approvals:respond` scope). The engine validates against `resumeSchema` and returns the value to the suspended executor.

---

## Per-kind payloads

### `kind: "approval"`

The canonical 5-action approval vocabulary from MyndHyve's existing implementation, lifted into the spec:

```typescript
interface ApprovalData {
  artifactId: string;
  artifactType: string;
  title: string;
  description?: string;
  artifactData: unknown;
  /** Allowed actions on this approval gate. Server enforces. */
  actions: Array<'accept' | 'reject' | 'refine' | 'edit' | 'ask'>;
  /** Multi-approver quorum (default 1 = single approver). */
  requiredApprovals?: number;
  approversList?: string[];
  /** Resolution policy when one approver rejects in a multi-approver gate. */
  rejectionPolicy?: 'single-veto' | 'majority';
}

interface RefineFeedback {
  /** Target of the feedback. */
  scope: 'whole' | 'section' | 'items';
  /** JSON path into artifactData when scope === 'section'. */
  sectionPath?: string;
  /** Item identifiers when scope === 'items'. */
  itemIds?: string[];
  /** Structured chip selections — UI-aware, AI-interpreted. */
  tags?: string[];
  /** Free-text feedback. At least one of {tags, text} SHOULD be populated. */
  text?: string;
}

type ApprovalResume =
  | { action: 'accept'; feedback?: string; decidedBy?: string; decidedAt: string }
  | { action: 'reject'; feedback?: string; decidedBy?: string; decidedAt: string }
  | { action: 'refine'; refineFeedback: RefineFeedback; decidedBy?: string; decidedAt: string }
  | { action: 'edit-accept'; editedArtifactData: unknown; decidedBy?: string; decidedAt: string }
  // 'ask' does NOT exit the suspend — the engine accumulates Q&A
  // exchanges on a side variable (e.g., `_askExchanges:{nodeId}`) and
  // keeps the suspend pending until accept/reject/refine/edit-accept fires.
  ;
```

**Layer distinction (`decidedBy`).** The `decidedBy` field above is **typed optional at the resume layer** because it represents the wire shape *as submitted by the client*. Clients that have already authenticated to the host (the common case) MAY omit `decidedBy` and let the host's auth layer populate it from the request principal. Clients that submit on behalf of a different principal (e.g., admin acting-as) MAY supply it explicitly; the host MAY accept or refuse per its policy.

At the **event-emission layer** the contract is stricter — see `decidedBy` rules in §"Host-side enforcement boundary" below. Hosts MUST populate `decidedBy` in every emitted `approval.received` event. The opacity contract applies in both layers.

**Action-name choice (`'edit-accept'`).** The hyphenated form distinguishes "approve with user-edited artifact" from plain `'accept'`. The reference impl emits `'edit-accept'` because the downstream artifact-sync path differs (the user's edited bytes replace the AI-generated bytes before propagation). Hosts MAY collapse this to `'accept' + editedArtifactData?` if their downstream pipelines don't need to distinguish, but the spec contract is `'edit-accept'` for cross-host interop.

**Backward-compat mapping.** Legacy clients that send only `decision: 'approved' | 'rejected' | 'timeout' | 'cancelled'` (the pre-WORKFLOW-REQUEST-CHANGES vocabulary) without an explicit `action` field SHOULD be normalized by the host:

| Legacy input | Normalized action |
|---|---|
| `decision: 'approved'`                           | `action: 'accept'` |
| `decision: 'rejected'` + `feedback` non-empty    | `action: 'refine'` with `refineFeedback: { scope: 'whole', text: <legacy feedback> }` |
| `decision: 'rejected'` + no `feedback`           | `action: 'reject'` |
| `decision: 'timeout' \| 'cancelled'`             | (host-internal — emit timeout sentinel, not a resume) |

Hosts MAY also accept legacy `feedback: string` alongside `refineFeedback: RefineFeedback` (the structured form supersedes the string when both are present).

#### Host-side enforcement boundary (`decidedBy`, role gating, quorum)

**`decidedBy` is host-defined opaque.** Hosts MAY use any string identifier — email address, UUID, JWT `sub` claim, OAuth principal, internal user ID — that is meaningful to the host's identity model. Other WOP consumers (clients, observability tools, conformance suites) MUST treat the value as an opaque string and MUST NOT parse it for structure. The engine emits whatever the host's resolution layer hands it.

**Role / permission / quorum enforcement is the host's responsibility, performed BEFORE the engine sees the `ApprovalResume`.** The host's resolution layer is the gate:

1. Caller submits a resume value via `POST /v1/runs/{runId}/interrupts/{nodeId}`.
2. Host's auth + RBAC layer verifies the principal AND checks `approversList` / `requiredApprovals` / role allowlists / budget thresholds against the host's own policy model.
3. Only if the policy check passes does the host hand the verified `ApprovalResume` to the engine.
4. The engine emits `approval.received` (or, for non-approval kinds, `interrupt.resolved`) with the principal recorded in `decidedBy`.

This factoring keeps WOP minimal — the protocol describes the lifecycle (request → response → recorded principal) and the wire shape, not the host's permission system. A host with rich RBAC (workspace roles, budget-tier approver assignment, multi-org quorum) and a host with no RBAC (single-user CLI runner) both implement the same wire contract.

**`approversList` and `requiredApprovals` advertise constraint, they do not enforce it.** When the engine surfaces an `InterruptPayload` with `approversList: ['admin', 'owner']`, the values are advisory metadata for clients (e.g., the UI shows "must be approved by admin or owner"). The actual enforcement at resolve time is host-side — the engine accepts whatever the host hands it. Clients that display the list MUST NOT assume the engine refuses non-listed approvers; the host's resolution layer is the only authoritative gate.

**Multi-approver quorum composition is implementation-defined for v1.0.** When `requiredApprovals > 1`, two valid models exist:

1. *Host-composed quorum*: the host's resolution endpoint accumulates verified resumes (one per approver), applies `rejectionPolicy` (`single-veto` / `majority`) and delivers ONE final `ApprovalResume` to the engine when quorum is reached. The engine sees a single terminal `approval.received` event.
2. *Engine-composed quorum*: the engine accumulates votes via per-resume calls to its resolution surface and emits one `approval.received` per vote (or a single terminal one — implementation choice). The reference implementation at `packages/workflow-engine/src/nodes/coordination/approvalGate.node.ts` uses this model with internal state at `_approvalVotes:{nodeId}`.

Either model satisfies the v1.0 wire contract: the FINAL terminal `approval.received` MUST carry a `decidedBy` representing whoever closed the quorum (the last approver, or a synthetic `quorum:<n>-of-<m>` identifier). The intermediate event sequence (whether per-vote partial-state events appear) is NOT spec-locked at v1.0 — see I1 in §"Open spec gaps."

**Interop note.** Conformance scenarios assert the wire-level contract (`decidedBy` non-empty, recorded in payload, immutable across replay) but DO NOT assert that any specific principal value is honored — that's host-policy territory.

The `ask` action is a side channel: it accumulates Q&A exchanges via the `askService` callback without resuming the executor. The interrupt stays pending until one of the four exit actions fires.

### `kind: "clarification"`

```typescript
interface ClarificationData {
  questions: Array<{
    id: string;
    question: string;
    /** Optional schema for the answer (e.g., choices, free-text). */
    schema?: AnswerSchemaShape;
  }>;
  contextType?: string;
}

type ClarificationResume = {
  answers: Array<{ id: string; answer: unknown }>;
};
```

### `kind: "external-event"`

```typescript
interface ExternalEventData {
  /** Stable description of what the engine is waiting for. Surfaced in admin
   *  panels and webhooks. Examples: "stripe.checkout.completed",
   *  "calendar.event.confirmed", "scheduled-time:2026-05-01T10:00Z". */
  eventType: string;
  /** Opaque correlation payload — whatever the external system needs to
   *  match the interrupt back to its source event. */
  correlation: Record<string, unknown>;
}

type ExternalEventResume = {
  eventPayload: unknown;
};
```

### `kind: "custom"`

Escape hatch for kinds not yet spec'd. Servers MUST accept and persist; UI rendering and admin tooling are best-effort.

```typescript
interface CustomData {
  customKind: string;
  payload: unknown;
}

type CustomResume = unknown;
```

---

## Wire surface

### Interrupt requested (event)

When `ctx.interrupt(payload)` is called, the engine MUST emit:

```typescript
{
  type: 'interrupt.requested',
  payload: {
    runId: string;
    nodeId: string;
    interruptId: string;
    kind: 'approval' | 'clarification' | 'external-event' | 'custom';
    key: string;
    data: ApprovalData | ClarificationData | ExternalEventData | CustomData;
    timeoutMs?: number;
    requestedAt: string; // ISO 8601
  }
}
```

The event is durable (in the event log) and surfaced via SSE (`updates` and `debug` modes — see `stream-modes.md`).

### Interrupt resolved (event)

When an external caller resolves an interrupt, the engine MUST emit:

```typescript
{
  type: 'interrupt.resolved',
  payload: {
    runId: string;
    nodeId: string;
    interruptId: string;
    kind: '...';
    resumeValue: unknown; // validated against resumeSchema
    resolvedAt: string;
    resolvedBy: string; // user ID for human resolution; system ID for external events
  }
}
```

### Resolution endpoints

A WOP-compliant server MUST expose:

```
POST /v1/runs/{runId}/interrupts/{nodeId}
Authorization: Bearer <api-key with approvals:respond scope>
Body: { resumeValue: <validated against resumeSchema> }
```

A WOP-compliant server SHOULD also expose a signed-token surface for asynchronous callbacks where the resolving system isn't authenticated to the protocol surface (e.g., a webhook from a payment provider):

```
POST /v1/interrupts/{token}
Body: { resumeValue: ... }
```

The token is HMAC-signed by the server with a configurable expiry (recommended default: 30 min). Format:

```
token = base64url(payload) + "." + hmac_sha256(secret, payload)
payload = JSON({ runId, nodeId, interruptId, expiresAt, intent: 'resolve' })
```

### Error responses

| HTTP | Code | Cause |
|---|---|---|
| `400` | `validation_error` | resumeValue fails schema validation |
| `401` / `403` | `unauthenticated` / `forbidden` | API key auth failures (see `auth.md`) |
| `404` | `interrupt_not_found` | The interrupt ID doesn't exist or already resolved |
| `409` | `interrupt_already_resolved` | Concurrent duplicate resolve (the second loses) |
| `410` | `interrupt_expired` | Signed-token surface only — token past `expiresAt` |
| `422` | `interrupt_cancelled` | Run was cancelled while interrupt was pending |

Cross-tab race semantics for the run-scoped surface: if Tab A and Tab B both POST to resolve the same interrupt, exactly one succeeds; the other receives `409 interrupt_already_resolved`.

---

## Replay determinism

A WOP-compliant engine MUST guarantee that a `ctx.interrupt(payload)` call with key `K` is invoked at most once for the lifetime of the run, regardless of process death, retry, or replay. Specifically:

1. First call with key `K` emits `interrupt.requested` and blocks.
2. External resolve via `POST /v1/interrupts/{...}` emits `interrupt.resolved` and unblocks.
3. After process death + recovery via `recoverRunFromEventLog`, the executor calls `ctx.interrupt(payload)` with the same key `K`. The engine consults the event log, finds the prior `interrupt.resolved`, and returns the persisted `resumeValue` synchronously (no new `interrupt.requested` emitted).

Implementations MAY cache resolved interrupts in memory for in-process replays; they MUST consult the event log for cross-process replays.

---

## Admin panel + observability

A WOP-compliant server SHOULD expose a "pending interrupts" admin view listing every run with a non-resolved `interrupt.requested` event. Each row SHOULD surface: `runId`, `nodeId`, `kind`, `requestedAt`, age, and a deep-link to the resolution UI for `kind: "approval" | "clarification"`.

OTel attributes per `observability.md`:
- `wop.interrupt_kind` — the discriminator
- `wop.interrupt_id` — the suspension ID
- `wop.interrupt_count` — replay-determinism counter

---

## Open spec gaps

| # | Gap | Owner |
|---|---|---|
| I1 | Multi-approver quorum execution semantics — order of votes, partial-state events, half-vote scenarios. Currently load-bearing in the reference impl's `approvalGate.node.ts`; should be lifted to spec. | future v1.x |
| I2 | Cancel-on-resolve semantics for cross-canvas approvals (parent waits on child interrupt — what happens when parent cancels?) | future |
| I3 | `external-event` correlation matching — is the spec strict (exact equality on `correlation`) or fuzzy (subset-match)? | future v1.x |
| I4 | Token format alternatives — JWT, paseto, etc. Currently HMAC-SHA256 is the only spec'd format. | future |

## References

- `auth.md` — auth model + scope vocabulary (`approvals:respond`)
- `rest-endpoints.md` — `POST /v1/runs/{runId}/interrupts/{nodeId}`, `POST /v1/interrupts/{token}`
- `version-negotiation.md` — `ctx.getVersion` is a separate primitive (versioning ≠ HITL)
- `observability.md` — `wop.interrupt_*` attributes
- `stream-modes.md` — `interrupt.requested` / `interrupt.resolved` events in `updates` and `debug` modes
- LangGraph HITL: <https://langchain-ai.github.io/langgraph/concepts/human_in_the_loop/>
- WOP plan: gap #18 (no spec-level HITL primitive)
- Reference impl: `packages/workflow-engine/src/engine/SuspendManager.ts`, `src/core/workflow/services/suspendResolution.ts` (5-action approval vocabulary), `functions/src/canvas-runtime/core/hitlManager.ts` (signed-token callback)
