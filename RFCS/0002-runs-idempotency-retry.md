# RFC 0002: Idempotency and Retry Semantics for `POST /v1/runs`

| Field | Value |
|---|---|
| **RFC** | 0002 |
| **Title** | Idempotency and Retry Semantics for `POST /v1/runs` |
| **Status** | `Draft` |
| **Author(s)** | David Tufts (@davidscotttufts) |
| **Created** | 2026-05-01 |
| **Updated** | 2026-05-01 |
| **Affects** | `spec/v1/idempotency.md`, `spec/v1/rest-endpoints.md`, `schemas/error-envelope.schema.json` (no shape change), `conformance/src/scenarios/idempotency.test.ts` |
| **Compatibility** | `additive` |
| **Supersedes** | — |
| **Superseded by** | — |

## Summary

`spec/v1/idempotency.md` specifies the `Idempotency-Key` header contract for `POST /v1/runs`, but leaves three normative gaps: (1) the **retry-after-timeout** behavior when a client doesn't know whether the original request succeeded; (2) the **acknowledgment timing** that lets a client know its retry is being deduplicated vs. processed fresh; (3) the **boundary between Layer 1 (HTTP idempotency cache) and Layer 2 (engine invocation log)** when a retry's idempotency key matches but the original run is mid-execution. This RFC fills those gaps with normative `MUST`/`SHOULD` rules, ships matching conformance scenarios, and establishes the per-boundary RFC pattern for subsequent normative-semantics work (per `LT4.5` of `docs/plans/WOP-LEADERSHIP-TRACK.md` in the MyndHyve repo).

## Motivation

Today, two client implementations of `POST /v1/runs` retry behavior can both pass `idempotency.test.ts` while disagreeing on:

1. **Timeout retry.** Client A sends `POST /v1/runs` with key `K`; the request times out at 10s with no response received. The client retries with the same key. Did the original request succeed? `idempotency.md` says the server caches the eventual response and replays — but doesn't say whether the second request blocks until the first completes, returns 409 immediately, or behaves nondeterministically.
2. **In-flight conflict.** Client B sends `POST /v1/runs` with key `K`; before the response arrives, the user clicks "submit" again from a separate tab. Two concurrent requests with the same key. `idempotency.md` §"Concurrent duplicates" says one MUST process to completion; the other MAY block or return `409 idempotency_in_flight`. Either is allowed — but clients can't tell which they'll get.
3. **Layer-1 vs Layer-2 confusion.** The HTTP idempotency cache holds the response of the run-creation request (i.e., the `runId` and the initial `RunSnapshot`). Layer 2 holds per-side-effect dedup inside the run. A retry of `POST /v1/runs` matches Layer 1; the engine inside the run uses Layer 2 for the LLM/payment/email side effects of nodes. Today the spec doesn't explain that the two layers are independent — which leads to confusion when an implementer wonders "do I need to dedup the LLM call when the user retries the run-creation request?" (Answer: no, Layer 1 catches it; Layer 2 only matters for *node-internal* retries.)

These gaps don't break interop — clients work against the MyndHyve reference impl. But they prevent two independent hosts from being interchangeable.

The conformance suite report from MyndHyve's reference deployment surfaced this in 2026-04-29: scenario `idempotency.test.ts` "concurrent duplicates" passes against MyndHyve but is the only scenario where the suite's "either pass" branch is taken, suggesting hosts could pass without actually agreeing on behavior.

## Proposal

### 1. Retry-after-timeout MUST behave deterministically

When a client retries `POST /v1/runs` with the same `Idempotency-Key` AND the same body AND the original request's response was not received (network timeout, abrupt connection close), the server MUST behave as follows:

- If the original request **completed and the response is in the cache**: return the cached response with `WOP-Idempotent-Replay: true` (existing behavior, unchanged).
- If the original request **is still in-flight**: the server MUST either (a) block the retry and return the same response when the original completes, OR (b) return `409 Conflict` with `{error: "idempotency_in_flight", retryAfter: <seconds>}`. The server MUST NOT process both requests as independent.
- If the original request **completed but the cache was evicted** (per `idempotency.md` §"Server responsibilities" #4): the server MAY treat the retry as fresh. The response MUST set `WOP-Idempotent-Replay: false` to signal the eviction so callers can audit any duplicate side effects.

The `WOP-Idempotent-Replay` header is **REQUIRED on every response** to a request that carried `Idempotency-Key`. Today the header is RECOMMENDED on replay only; this RFC promotes it to MUST and adds the explicit `false` case for fresh-after-eviction.

### 2. Acknowledgment timing within the in-flight window

For the in-flight branch above, the server MUST decide between (a) block-and-replay and (b) `409` deterministically based on a **server-published acknowledgment timeout**:

- If the original request will complete within the server's acknowledgment timeout, the server SHOULD block-and-replay (option a).
- If the timeout will be exceeded, the server MUST return `409 idempotency_in_flight` (option b).

The acknowledgment timeout is server-implementation-defined but MUST be at least `5` seconds. Servers MAY advertise the actual value via `/.well-known/wop`'s existing `limits` object (additive: new optional field `limits.idempotencyAckTimeoutSec`).

This rule turns the previously-nondeterministic OR clause into a deterministic dispatch: clients can reason about which branch they'll hit based on observable server load.

### 3. Layer-1 vs Layer-2 boundary

`idempotency.md` MUST gain a new section that explicitly states:

- **Layer 1 (HTTP `Idempotency-Key`)** catches duplicate `POST /v1/runs` requests. The cached response is the run-creation response (`{runId, status, ...}`), not the run's eventual outcome.
- **Layer 2 (engine `invocationId`)** catches duplicate side effects *inside* a single run. Side effects in different runs (even with identical inputs) are NOT deduplicated by Layer 2.
- **A retry of `POST /v1/runs` does NOT trigger Layer-2 dedup.** If the client receives a fresh `runId` (because the cache was evicted), the engine will execute the run from scratch — including any LLM/payment/email side effects. Clients that want end-to-end dedup MUST rely on Layer 1; Layer 2 is for engine-internal retry only.

This is documentation-only. No implementation change needed; the layers ARE independent today, but the spec doesn't say so.

### 4. Retry budget

A client retrying `POST /v1/runs` SHOULD apply exponential backoff with jitter, starting at 100 ms and capping at 10 s. After 5 retries (≈ 30 s elapsed wall-clock), the client SHOULD surface the failure rather than retrying further. This is RECOMMENDED, not REQUIRED — implementations MAY tune within reason.

The server MUST handle at least **5 retries** with the same key arriving as fast as **100 ms apart** without losing the cached response (per `scale-profiles.md` §"Retry semantics").

### 5. Schema diff

`spec/v1/capabilities.md` and `schemas/capabilities.schema.json` gain one optional field:

```diff
   "limits": {
     "type": "object",
     "required": ["clarificationRounds", "schemaRounds", "envelopesPerTurn"],
     "properties": {
       ...
+      "idempotencyAckTimeoutSec": {
+        "type": "integer",
+        "minimum": 5,
+        "description": "Maximum seconds the server will block a retry of POST /v1/runs that arrives while the original is still in-flight before returning 409 idempotency_in_flight. Default 5 if absent."
+      }
     }
   }
```

Per `COMPATIBILITY.md` §2.1, this is additive: existing clients ignore the new field and assume the 5-second floor; existing servers MAY omit the field and remain compliant.

### 6. Spec-text edits

`spec/v1/idempotency.md` gains a new §"Retry semantics for `POST /v1/runs`" that incorporates rules 1–4 above with concrete examples. The existing §"Concurrent duplicates" is rewritten to reference the new section instead of leaving the OR clause open.

`spec/v1/rest-endpoints.md`'s `POST /v1/runs` section gains a pointer to the new idempotency section.

## Compatibility

**Additive** per `COMPATIBILITY.md` §2.1.

- New optional capability field — existing servers MAY omit it.
- Promotion of `WOP-Idempotent-Replay` header from SHOULD to MUST — existing servers either already set it (compliant) or didn't (now non-compliant under this RFC, but only after the RFC reaches `Accepted` and ships in a v1.x minor).
- New `MUST` rule for acknowledgment timing — turns previously-allowed nondeterminism into a deterministic dispatch. No behavior change required for servers that already pick one branch consistently; the rule narrows the conformance gap.

The `WOP-Idempotent-Replay: false` case for fresh-after-eviction is new wire vocabulary, but it's an additive header value (existing clients see it as "header present, not true" and treat it as fresh, which is correct).

A server that today returns `409` for the in-flight case under all loads remains compliant. A server that today block-and-replays under all loads remains compliant if its blocking duration is ≤ `idempotencyAckTimeoutSec`. A server that today flips between the two cases nondeterministically MUST adopt one (or split based on the acknowledgment timeout) to remain compliant.

This is the closest the safety-fix exception gets to applying — the nondeterminism is a correctness gap. Per `COMPATIBILITY.md` §3, a safety-fix break would require a 90-day RFC window. This RFC chooses the additive path: existing servers can be tightened in their next minor release, and the conformance suite gains scenarios that exercise both branches deterministically.

## Conformance

Affected scenarios in `conformance/src/scenarios/idempotency.test.ts`:

- **Existing scenarios remain valid.** "same key + same body replays" continues to pass against compliant hosts.
- **New scenario:** "in-flight retry returns 409 OR blocks-and-replays deterministically per advertised ack timeout." The scenario sends a slow-running run-creation request, immediately retries with the same key, and asserts the response shape matches the dispatch rule.
- **New scenario:** "WOP-Idempotent-Replay: false on fresh-after-eviction." Uses `--no-cache` mode (see `idempotency.md` §"Eviction") to force eviction; asserts the replay header is set to false on the next request.
- **New scenario:** "5 retries within 30s succeed against `production` scale profile." Tagged `@scale-profile-production` per `scale-profiles.md`. Drives 5 retries 100ms apart; asserts all succeed.

These scenarios ship in `@myndhyve/wop-conformance@1.11.0` (the next minor) alongside the spec text.

## Alternatives considered

1. **Do nothing.** Leave the OR clause open. Rejected because two compliant hosts can disagree on observable behavior, which prevents the cross-host portability claim per `WOP_COMPREHENSIVE_ANALYSIS.md` §Interoperability (B-).

2. **Always require block-and-replay.** Tighten to a single behavior: server MUST block and return the same response when complete. Rejected because long-running run-creation (rare but possible) would create thundering-herd problems on the server, and the `409`-then-poll pattern is what high-throughput hosts already do. Removing the option would break `high-throughput` hosts.

3. **Always require `409`.** Tighten to a single behavior: server MUST return 409 immediately. Rejected because small/dev hosts that complete within milliseconds shouldn't burden every client with an extra round trip. Removing the option would penalize `minimal` hosts for no benefit.

4. **Make it a runtime advertisement instead of an RFC.** Server publishes its dispatch policy via `/.well-known/wop`, clients adapt. Rejected because the dispatch is observable from the response shape (block-and-replay returns the same response; 409 returns the conflict envelope) — no advertisement is needed. The `idempotencyAckTimeoutSec` field exists only so clients can size their wait timeouts.

5. **Bump v2.** Treat the gap as breaking, fix in v2. Rejected because v1.0 is locked per `ROADMAP.md` and the gap is fillable additively.

## Unresolved questions

1. Does the new MUST on `WOP-Idempotent-Replay` apply to non-mutating endpoints that happen to receive the header? The current wording says no (the header is meaningful only on `POST /v1/runs` and other mutating endpoints per `idempotency.md` §"Endpoints affected"), but the spec could be more explicit.

2. Should servers be required to log the dispatch decision (block vs 409) for audit? Useful for observability but adds complexity. The threat-model work in LT7 may surface a dependency.

3. The 5-second floor on `idempotencyAckTimeoutSec` is conservative — chosen to match `scale-profiles.md` §"Retry semantics" floors. Is a higher floor (e.g., 10s) better given that LLM-creation requests can take longer? Open to discussion in the comment window.

## Implementation notes (non-normative)

The MyndHyve reference impl currently implements block-and-replay in all cases via the in-process idempotency cache (`services/workflow-runtime/src/middleware/idempotency.ts`). Adopting this RFC requires:

- Adding the dispatch-by-timeout logic.
- Setting `WOP-Idempotent-Replay: false` on cache miss.
- Optionally advertising `limits.idempotencyAckTimeoutSec` in `/.well-known/wop`.

Estimated effort: ≤ 1 day. The change is in one middleware module; the conformance scenarios already drive the surface.

The `wop-host-inmem` and `wop-host-sqlite` reference hosts under LT2 SHOULD implement this RFC's requirements from the start — both are simpler than the MyndHyve impl and the spec rules are well-defined.

## Acceptance criteria

- [ ] `spec/v1/idempotency.md` gains §"Retry semantics for `POST /v1/runs`" with rules 1–4.
- [ ] `spec/v1/idempotency.md` §"Concurrent duplicates" rewritten to reference new section.
- [ ] `spec/v1/rest-endpoints.md` `POST /v1/runs` section links to new idempotency text.
- [ ] `spec/v1/capabilities.md` + `schemas/capabilities.schema.json` add optional `limits.idempotencyAckTimeoutSec`.
- [ ] `conformance/src/scenarios/idempotency.test.ts` gains 3 new scenarios per §Conformance above.
- [ ] `@myndhyve/wop-conformance@1.11.0` published with new scenarios.
- [ ] `CHANGELOG.md` entry under v1.x minor referencing this RFC.
- [ ] MyndHyve reference impl implements the new MUSTs and passes the new scenarios. (Not blocking on RFC acceptance; can land in a follow-up.)

## References

- `spec/v1/idempotency.md` — base contract this RFC extends.
- `spec/v1/rest-endpoints.md` — `POST /v1/runs` endpoint definition.
- `spec/v1/capabilities.md` — discovery-payload field for ack timeout.
- `spec/v1/scale-profiles.md` — retry-budget floors that this RFC's §4 references.
- `COMPATIBILITY.md` §2.1, §3 — additive vs safety-fix distinction this RFC navigates.
- `RFCS/0001-rfc-process.md` — process this RFC is filed under.
- `docs/WOP_COMPREHENSIVE_ANALYSIS.md` (MyndHyve repo, non-normative) §Interoperability — flagged the nondeterminism this RFC closes.
- IETF `draft-ietf-httpapi-idempotency-key-header` — concurrent inspiration; WOP's contract is stricter (composite key includes tenantId).
