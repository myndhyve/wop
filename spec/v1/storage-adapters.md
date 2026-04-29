# WOP Spec v1 — Storage Adapters

> **Status: FINAL v1.0 (2026-04-29).** Comprehensive coverage of the two normative storage-adapter contracts (`RunEventLogIO` and `SuspendIO`) that any WOP-compliant engine implementation MUST satisfy. Stable surface for external review. Keywords MUST, SHOULD, MAY follow [RFC 2119](https://www.rfc-editor.org/rfc/rfc2119). See `auth.md` for the status legend.

---

## Why this exists

The WOP runtime needs durable storage for two state surfaces:

1. **Event log** — append-only sequence of `RunEventDoc` per run. Source of truth for the projected `RunSnapshot`. Consumers (UI, CLI, conformance suite) subscribe to the live tail; replay tools fold history.
2. **Suspension state** — durable per-suspension records that survive process restarts so HITL approvals + external-event waits can resume cross-session.

Concrete deployments choose their own backing store: the MyndHyve reference deployment uses Firestore (browser + Cloud Run); other deployments may use Postgres-backed self-hosted runtimes, in-memory test harnesses, or any alternate cloud backend. The spec specifies the contracts that any such backend MUST satisfy so the engine package stays storage-agnostic. This document defines the two contracts and points at the in-memory reference implementations the engine ships for tests + portable deployments.

---

## Contract 1 — `RunEventLogIO`

The event-log persistence contract. Implementations MUST persist append-only events keyed on `(runId, sequence)` with monotonic sequence assignment per run.

### Methods

```typescript
interface RunEventLogIO {
  /**
   * Atomically append an event to a run's log. Implementation MUST:
   *   1. Read the current max sequence (per-run scoped).
   *   2. Assign sequence = max + 1 (or 0 if log is empty).
   *   3. Persist the event with the assigned sequence.
   *   4. Return the persisted doc.
   *
   * Concurrent appends to the same run MUST yield distinct sequences.
   * On Firestore: wrap in `runTransaction`. On Postgres: serializable
   * transaction OR `INSERT ... RETURNING sequence` over a per-run sequence.
   */
  appendAtomic(runId: string, event: RunEventDocInput): Promise<RunEventDoc>;

  /**
   * Read events in sequence order. `fromSequence` is INCLUSIVE
   * (default 0). `limit` defaults to 100; implementations MAY clamp
   * higher limits.
   */
  read(
    runId: string,
    opts?: { fromSequence?: number; limit?: number },
  ): Promise<RunEventDoc[]>;

  /**
   * Get the most-recently-appended event for a run. Returns null if no
   * events exist. Used by replay tools for `fromSeq` bounds checks.
   */
  getLatest(runId: string): Promise<RunEventDoc | null>;

  /**
   * Subscribe to events from `fromSequence` (inclusive). Returns an
   * unsubscribe function. Backends use Firestore `onSnapshot`,
   * Postgres LISTEN/NOTIFY, or polling — the contract surface is
   * agnostic. Implementation MUST normalize timestamps to JS `Date`
   * before invoking `onEvent`.
   *
   * Backfill: subscribers MUST receive events at or after
   * `fromSequence` already in the log BEFORE any live appends. Mirrors
   * Firestore's onSnapshot initial-snapshot behavior.
   */
  subscribe(
    runId: string,
    fromSequence: number,
    onEvent: (event: RunEventDoc) => void,
    onError: (err: Error) => void,
  ): () => void;
}
```

### Reference implementations (non-normative)

The engine package ships an in-memory reference implementation; the MyndHyve reference deployment ships two Firestore-backed implementations. All three are illustrative — third-party hosts MAY ship their own.

| Implementation | Use | Module |
|---|---|---|
| `InMemoryEventLogIO` | Tests + reference deployments without durability | Engine package (re-exported as `InMemoryEventLogIO`) |
| `serverEventLogIO.ts` (Cloud Run) | MyndHyve reference deployment, Cloud Run durability | `services/workflow-runtime/src/serverEventLogIO.ts` (MyndHyve-specific) |
| `browserEventLogIO.ts` (browser) | MyndHyve reference deployment, browser-side durability | `src/core/workflow/host/browserEventLogIO.ts` (MyndHyve-specific) |

Both Firestore-backed implementations are MyndHyve-specific; the contract surface above is the normative part and is reusable for any backend.

---

## Contract 2 — `SuspendIO`

The suspension-state persistence contract. Implementations MUST persist pending suspensions keyed on `suspensionId` and surface them for cross-process resume.

### Methods

```typescript
interface SuspendIO {
  /** Create a new pending suspension doc. */
  createPending(doc: PendingDoc): Promise<void>;

  /** Read the current state of a suspension. Returns null if missing. */
  read(suspensionId: string): Promise<PendingDoc | null>;

  /** Patch a suspension to resumed/rejected/timed-out status. */
  update(suspensionId: string, patch: Partial<PendingDoc>): Promise<void>;

  /**
   * Subscribe to changes on a suspension doc. Callback fires whenever
   * the doc updates. Returns an unsubscribe fn. Implementation MUST
   * deliver the current state as the initial snapshot, then live
   * updates as they arrive. Mirrors Firestore's onSnapshot.
   */
  watch(
    suspensionId: string,
    cb: (doc: PendingDoc | null) => void,
  ): () => void;

  /**
   * Return pending suspensions matching the filter. Used by the
   * SuspendManager's rehydration on startup. Implementations MUST
   * apply `status == 'pending'` automatically and honor `cardTypes`,
   * `runIds`, `ownerUserId`, `limit` filters at the storage layer
   * rather than post-filtering in JS (cost + perf).
   */
  query(filter: SuspendQueryFilter): Promise<PendingDoc[]>;
}
```

### Doc shape

`PendingDoc` (alias for `FirestorePendingDoc` for back-compat):

```typescript
interface PendingDoc {
  suspensionId: string;
  runId: string;
  nodeId: string;
  reason: PendingSuspension['reason'];
  status: 'pending' | 'resumed' | 'rejected' | 'timed-out';
  createdAt: string;          // ISO 8601
  expiresAt?: string;
  resumedAt?: string;
  resumeValue?: unknown;
  rejectReason?: unknown;
  prompt?: PendingSuspension['prompt'];
  cardType?: string;
  timeoutMs?: number;
  ownerUserId?: string;       // Optional; rehydration filter
  projectId?: string;         // Optional; surface filter
}
```

### Reference implementations (non-normative)

| Implementation | Use | Module |
|---|---|---|
| `InMemorySuspendIO` | Tests + reference deployments without durability | Engine package (re-exported as `InMemorySuspendIO`) |
| Browser `firestoreSuspendIO.ts` | MyndHyve reference deployment, browser-side durability | `src/core/workflow/host/firestoreSuspendIO.ts` (MyndHyve-specific) |
| Cloud Run `firestoreSuspendIO.ts` | MyndHyve reference deployment, Cloud Run durability | `services/workflow-runtime/src/firestoreSuspendIO.ts` (MyndHyve-specific) |

---

## Naming and back-compat

The original v1.0 type + class names carried a `Firestore-` prefix because Firestore was the only initial implementation:
- `FirestoreSuspendIO` (interface)
- `FirestorePendingDoc` (doc shape)
- `FirestoreSuspendManager` (durable manager class)

Post-v1.0 adopts host-agnostic names:
- `SuspendIO`
- `PendingDoc`
- `DurableSuspendManager`

The original prefixed names remain exported as type aliases (and a class alias for `FirestoreSuspendManager` → `DurableSuspendManager`) for back-compat. New consumer code SHOULD prefer the unprefixed names; existing imports of the prefixed names continue to resolve to the same types/class.

The event-log contract `RunEventLogIO` was already host-agnostic in v1.0 — no rename needed.

---

## Compliance checklist

A storage adapter implementation MUST:

- [ ] Yield distinct sequences for concurrent `appendAtomic` calls within the same run (event log).
- [ ] Apply per-run sequence isolation (different runs have independent counters).
- [ ] Filter by `fromSequence` inclusively in `read` and `subscribe`.
- [ ] Default `read` limit to 100 events.
- [ ] Deliver the historical tail before live appends in `subscribe` (event log) and the current state as the first watch callback (suspend).
- [ ] Honor `query` filter combinations at the storage layer (suspend).
- [ ] Apply `status == 'pending'` filter automatically in `query` (suspend).

A storage adapter SHOULD:

- [ ] Provide a `clear()` test helper.
- [ ] Provide a `size()` test helper.
- [ ] Tolerate subscriber-callback exceptions without crashing the storage layer.

---

## Future work

- **Postgres reference implementation** — `pg`-backed adapter as a non-Firestore durable example. Tracked as a follow-on; the in-memory adapters cover tests + reference-deployment use cases until Postgres ships.
- **SQLite reference implementation** — file-backed durable example for self-hosted deployments without a managed Firestore or Postgres. Lower-priority follow-on.
- **Adapter compliance suite** — shared vitest test suite that any third-party adapter can run to verify spec compliance. The in-memory adapter tests
  (`InMemoryEventLogIO.test.ts`, `InMemorySuspendIO.test.ts`) are the prototypes for this; extracting them into a parameterized harness is post-v1.0 ecosystem work.

---

## See also

- `auth.md` — API key + scope vocabulary
- `replay.md` — uses `RunEventLogIO.read({fromSequence, limit})` for fork-fold
- `interrupt.md` — uses `SuspendIO` for HITL persistence
- `version-negotiation.md` — `RunEventDoc.engineVersion` is part of the contract
- WOP plan: gap G8 (storage-agnostic event/suspend adapters)
- Reference impls:
  - `packages/workflow-engine/src/protocol/InMemoryEventLogIO.ts`
  - `packages/workflow-engine/src/engine/InMemorySuspendIO.ts`
  - `packages/workflow-engine/src/protocol/EventLog.ts` (RunEventLogIO interface)
  - `packages/workflow-engine/src/engine/FirestoreSuspendManager.ts` (SuspendIO interface)
