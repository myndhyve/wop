# WOP Spec v1 — Changelog

All notable changes to the WOP v1 spec, schemas, OpenAPI/AsyncAPI, conformance suite, and TypeScript reference SDK.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) loosely. Versions are spec-corpus-wide (one date, multiple artifact updates per row); per-artifact versions live in their respective `package.json` / schema `$id` fields.

> **Status legend** (per `auth.md` §status legend):
> STUB · DRAFT · OUTLINE · FINAL — see individual doc headers for current state.

---

## [1.0.0] — 2026-04-27 — WOP v1.0 FINAL

The v1.0 protocol contract is **locked**. The spec corpus, schemas, API definitions, reference SDKs, and conformance suite all ship at v1.0. Implementations validate themselves against `@wop/conformance` `1.0.0` at their own cadence — the protocol contract does NOT depend on any specific engine implementation's progress against the suite (RFC 2616 / HTTP model).

### Reference deployment URL pinned

The reference deployment (Cloud Run `workflow-runtime` in GCP project `myndhyve-prod`) is pinned at `https://workflow-runtime-gjw5bcse7a-uc.a.run.app`. The service is up; the canonical WOP REST surface lands as part of post-v1.0 engine work. See `V1-FINAL-COMPLETION-PLAN.md` §"Reference deployment".

### What's locked

- **Prose specs** — all 12 docs at `Status: FINAL v1.0 (2026-04-27)`: `auth.md` · `capabilities.md` · `channels-and-reducers.md` · `idempotency.md` · `interrupt.md` · `node-packs.md` · `observability.md` · `replay.md` · `rest-endpoints.md` · `run-options.md` · `stream-modes.md` · `version-negotiation.md`.
- **JSON Schemas** — 10 first-class schemas, all compile clean under Ajv2020.
- **API definitions** — OpenAPI 3.1 (`api/openapi.yaml`) + AsyncAPI 3.1 (`api/asyncapi.yaml`); both lint clean and all `$ref`s resolve.
- **Reference SDKs at 1.0.0** — `@wop/client` (TypeScript), `wop-client` (Python), `wopclient` (Go). All three accept array or comma-list `streamMode` (S4), accept `bufferMs` query forwarding (S3), and transparently flatten `event: batch` arrays back into per-event yields.
- **Conformance suite at 1.0.0** — `@wop/conformance` ships 82 scenarios across 15 files (46 server-free + 36 server-required). The friendly `wop-conformance` CLI is the recommended runner.
- **CI gating** — `scripts/wop-check.sh` 6-stage pipeline + `.github/workflows/wop-spec.yml` (the latter exercises Go via `setup-go@v5`).
- **Governance** — `CONTRIBUTING.md` covers the post-v1.0 change process (patch / minor / major); `V1-FINAL-COMPLETION-PLAN.md` reframed to `Status: COMPLETE` and serves as the v1.0 release record.

### Final spec gap state

- All 21 originally-listed gaps closed at the spec layer.
- 18 of 21 fully ✅ at both spec + impl reference. 3 are spec-firm with engine-implementation conformance pending (F2 sub-workflow, F4 cap-breach, CC-1 hard `recursionLimit` invariant) — tracked as the post-v1.0 ecosystem roadmap in `V1-FINAL-COMPLETION-PLAN.md`.
- Zero `PROPOSED v1.1` or `PROPOSED v2` markers remaining anywhere in the corpus.

### Post-v1.0 ecosystem roadmap

The 6 implementation-conformance triggers (S3 SSE buffering, S4 mixed-mode, F2 sub-workflow, F4/CC-1 cap-breach, C3 channel TTL, O4 cost attribution) ship as additional scenarios against the unchanged v1.0 protocol contract — i.e., minor releases of `@wop/conformance` (`1.X.0`). They do **NOT** gate the v1.0 spec tag. See `V1-FINAL-COMPLETION-PLAN.md` §"Post-v1.0 ecosystem roadmap" for the full per-trigger contract.

### Pre-v1.0 history

Releases prior to v1.0 (the iteration days that built up to this final tag) are preserved below for the historical record.

---

## [Unreleased]

### 2026-05-01 — Conformance suite 1.13.0 — LT3 timing-sensitive scenarios + wop-replay-fork profile

Lands LT3.1 + LT3.2 + LT3.4 + LT3.10 of the post-publication leadership track per `docs/plans/WOP-LEADERSHIP-TRACK.md` (MyndHyve-side). Closes 3 of the 4 originally-deferred timing-sensitive scenarios. LT3.5 staleClaim still deferred — needs SQLite host heartbeat + resume-on-startup work in a successor session.

**3 new conformance scenario files:**

- `streamReconnect.test.ts` (LT3.4) — disconnect mid-stream + reconnect with `Last-Event-ID` MUST resume without loss/duplication. Reconnect after terminal seq closes immediately. Tagged `@timing-sensitive`. Drove a within-profile gap fix in BOTH reference hosts (in-memory + SQLite) — they previously replayed full backlog regardless of `Last-Event-ID`; now they filter `event.seq > resumeAfterSeq`.
- `replayDeterminism.test.ts` (LT3.1) — gated on `wop-replay-fork` profile. Asserts: same workflow + same inputs across two `mode: 'replay'` forks produce structurally-identical event sequences. Skip-equivalent on hosts that 501 on `replay` mode (e.g., MyndHyve currently — branch mode is live, replay mode is stubbed). Branch mode is permitted to diverge by design (negative-control test).
- `interruptRace.test.ts` (LT3.2) — gated on `wop-interrupts` profile. Concurrent cancel + resolve at same node MUST resolve to one deterministic outcome (cancelled OR completed). Tagged `@timing-sensitive`. Self-test: cancel of completed run is idempotent (returns 200).

**New compatibility profile: `wop-replay-fork`**:

- Predicate: `replay.supported: true` AND `replay.modes` is non-empty array.
- Added to `conformance/src/lib/profiles.ts` `PROFILE_NAMES` + `deriveProfiles` + `hasProfile`.
- Documented in `spec/v1/profiles.md` with full predicate definition and gating note for `replayDeterminism` + `replay-fork` scenarios.

**Reference-host fixes:**

- `examples/hosts/in-memory/src/server.ts` — SSE handler now honors `Last-Event-ID` request header.
- `examples/hosts/sqlite/src/server.ts` — same fix; passes `resumeAfterSeq` to the SQLite event-read prepared statement.

**Suite bumped 1.12.0 → 1.13.0.**

**Validation:**
- All 7 new scenarios pass against the SQLite reference host.
- Full suite against SQLite: 173/231 pass (was 166/224 pre-LT3 phase A); +7 tests, +3 file-passing-count, all from new scenarios.
- CI gate `scripts/wop-check.sh` 8/8 green.

**LT3.5 (staleClaim) remains deferred** — needs SQLite host heartbeat renewal + resume-on-startup + multi-process orchestrator harness. Sized as a separate session.

### 2026-05-01 — LT2.3 + LT2.4 — SQLite reference host + "build your own host" walkthrough

Lands LT2.3 + LT2.4 of the post-publication leadership track per `docs/plans/WOP-LEADERSHIP-TRACK.md` (MyndHyve-side). The protocol's **first non-MyndHyve durable WOP host**.

**LT2.3 — `examples/hosts/sqlite/`**:

Single-process, ~700 LOC, single external dep (`better-sqlite3`). Implements all the same routes as the in-memory host (`/.well-known/wop` · `POST /v1/runs` · `GET /v1/runs/{runId}` · `cancel` · SSE events · poll events · debug-bundle) but every state transition writes through SQLite WAL. Runs + events + idempotency cache survive process restart.

**Schema** — 3 tables: `runs` (with `claim_holder_id` + `claim_expires_at` for cross-process safety), `events` (composite PK `(run_id, seq)` for monotonic ordering), `idempotency` (Layer-1 cache with `body_hash` for 409-on-conflict). Translates verbatim to Postgres / DynamoDB / Cassandra.

**Claim acquisition** — `UPDATE runs SET claim_holder_id = ? WHERE claim_holder_id IS NULL OR claim_expires_at < now`. SQL UPDATE returns affected-row-count: 1 = won, 0 = contended. 30-second TTL. Pattern translates to `SELECT FOR UPDATE SKIP LOCKED` (Postgres), conditional UPDATE (DynamoDB), `SET NX EX` (Redis).

**Profile claim**: `wop-core` + `wop-stream-sse` + `wop-stream-poll`. Scale claim: `minimal` (single-writer SQLite). Advertises `debugBundle.supported: true`.

**Conformance** (`examples/hosts/sqlite/conformance.md`): **22/36 files fully pass / 166/224 tests pass** vs in-memory's 22/36 files / 163/221 tests. Same shape — same out-of-profile gaps, same within-profile event-shape gap. The +3 net comes from the additional scenarios that landed in LT4-6 (idempotencyRetry, debugBundle, etc.).

**Durability proof** — README walks through stop-server-mid-run → restart → events still readable from SQLite file. The in-memory host can't demonstrate this property; the SQLite host is the cheapest possible proof of "wire contract is independent of storage layer."

**LT2.4 — README walkthrough doubles as the "Build Your Own Host" guide**:

Eight-section guided reading of `src/server.ts`: Schema · Event log is source of truth · Claim acquisition · Run execution · Idempotency · HTTP layer · SSE event stream · Graceful shutdown. Each section names the equivalent translation for Postgres / DynamoDB / Cassandra so a reader can swap storage backends without changing the wire contract. Also lists 5 concrete next-steps (Postgres swap · heartbeating · resume-on-startup · real auth · adding profiles).

**INTEROP-MATRIX.md** updated:
- 3rd row added for SQLite host with full per-scenario pass/fail.
- Glossary preserved; row-add procedure unchanged.
- Suite version reference bumped 1.10.0 → 1.12.0.

**Validation:**
- SQLite host typechecks under strict + exactOptionalPropertyTypes.
- `npm start` boots, accepts requests, persists runs to `./data/wop-host.sqlite`.
- Stop-restart-poll preserves run + events.
- Full conformance suite against live host: 166/224 tests pass.
- CI gate `scripts/wop-check.sh` 8/8 green.

**Out of scope (deferred):**
- Resume-on-startup (auto-pickup of orphaned runs whose claim has expired). Would demonstrate LT3.5 stale-claim semantics.
- Heartbeat renewal (claim_expires_at refresh while a long run is mid-execution).
- Postgres adapter (one driver swap; another `INTEROP-MATRIX.md` row).
- Multi-tenancy.

The remaining LT3.1 / LT3.2 / LT3.4 / LT3.5 timing-sensitive scenarios are gated on this host's resume-on-startup behavior plus a multi-process orchestrator. Successor session.

### 2026-05-01 — LT6 — DX & positioning: 10-min quickstart + 3 examples + 3 spec docs + CI gate

Lands LT6.1 + LT6.2 (partial: 3 of 7) + LT6.3 + LT6.4 + LT6.5 + LT6.6 + LT6.7 of the post-publication leadership track per `docs/plans/WOP-LEADERSHIP-TRACK.md`. Documentation + examples + GitHub Actions; no wire-shape change, no schema modifications, no SDK changes, no conformance scenario changes.

**LT6.1 — `QUICKSTART-10MIN.md`** (new at repo root):

Fastest path from "what is WOP?" to "I have a workflow running on my laptop." Boots the in-memory reference host, runs a workflow via curl + SDK + SSE. Zero MyndHyve / Firebase / React. Just Node 20+ and a clone of this repo. Complements the existing `QUICKSTART.md` (general-host, ~5 min) — this one is the bootstrap-from-zero path that the existing guide assumes you've already done.

**LT6.2 partial — 3 example projects**:

- `examples/tiny-workflow/` (~80 LOC) — smallest possible WOP run lifecycle. Discover + create + poll. Pure `fetch`.
- `examples/streaming-client/` (~110 LOC) — SSE event-stream consumer with hand-written 25-line frame parser.
- `examples/idempotent-runs/` (~80 LOC) — Layer-1 idempotency demo: 3 retries collapse to one runId; 4th call with conflicting body gets 409.

All three use only Node 20+ stdlib. All three pass end-to-end against the in-memory reference host.

The remaining 4 examples (`approval-workflow`, `replay-fork`, `mcp-tool`, `node-pack-publishing`) are deferred to a successor session — each requires profile features the in-memory host doesn't claim, so they'd target MyndHyve-only and need separate fixture work.

**LT6.3 — `spec/v1/positioning.md`** (DRAFT v1.1):

Honest comparison of WOP vs Temporal / Airflow / Argo / AWS Step Functions / BPMN / LangGraph / MCP. When to choose WOP and when not. How WOP integrates with each (Temporal-backed host, BPMN-to-WOP compiler, LangGraph-inside-a-WOP-node, etc.). Recommended public message and the framing to avoid. Closes the analysis recommendation #4 ("Clarify the category").

**LT6.4 — `spec/v1/mcp-integration.md`** (DRAFT v1.1):

Worked example of WOP + MCP composition. WOP runs the workflow; MCP exposes tools to the LLM nodes inside that workflow. Trust-boundary section cross-references `SECURITY/threat-model-prompt-injection.md` MCP invariants. Concrete request flow showing how the two protocols layer.

**LT6.5 — `spec/v1/host-extensions.md`** (DRAFT v1.1):

Canonical reference for what's in the protocol vs what's a host extension. Closed prefix table (`wop.*` / `core.*` / `community.*` / `vendor.<org>.*` / `private.<host>.*` / `local.*` are protocol-managed; vendor-prefixed namespaces like `myndhyve.*` are host extensions). What hosts MUST NOT do (redefine `wop.*` semantics; depend on clients honoring extension fields).

**LT6.6 — README tightening**:

Added 6 new spec-doc rows to the document index (profiles, scale-profiles, debug-bundle, positioning, mcp-integration, host-extensions). New §"Examples" pointing at the 3 runnable projects + the in-memory host. Quickstart section now offers two paths (10-min bootstrap vs general-host).

**LT6.7 — Examples CI gate**:

`.github/workflows/examples.yml` runs every example end-to-end against the in-memory reference host on push/PR touching `examples/**`. Matrix-driven so adding an example is a one-line change. Uses Node 20, 2-minute timeout per example, dumps host log on failure. Closes the "examples don't go stale" concern from the architecture review.

**LT6.6b — MyndHyve-side copy alignment** intentionally deferred — that's in-tree work in the MyndHyve repo, not the public WOP repo, and warrants its own session.

**Validation:**
- All 3 new examples run end-to-end against the in-memory host with `npm start`.
- CI gate `scripts/wop-check.sh` 8/8 green.
- All new spec docs carry the `Status: DRAFT v1.1 (2026-05-01)` tag and pass the spec-corpus-validity scenario.

### 2026-05-01 — LT5 — Observability events + debug-bundle spec + schema + conformance

Lands LT5.1 + LT5.3 + LT5.4 + LT5.6 of the post-publication leadership track per `docs/plans/WOP-LEADERSHIP-TRACK.md`. Bumps suite to `@myndhyve/wop-conformance@1.12.0`. LT5.2 rejected as redundant (existing observability.md already covers OTel mapping comprehensively); LT5.5 (Cloud Run endpoint deploy in MyndHyve reference impl) deferred to operator authorization for the workflow-protocol deploy checklist — endpoint added to in-memory reference host instead so LT5.6 conformance scenario runs end-to-end.

**LT5.1 — Canonical run lifecycle event names** (`spec/v1/observability.md`):

New §"Canonical run lifecycle event names" section adds a closed vocabulary table (`run.started` / `run.completed` / `run.failed` / `run.cancelled` / `node.*` / `approval.*` / `clarification.*` / `cap.breached` / `channel.written` / `run.replay.started`) with default severity per event class. Adopts `debug` / `info` / `warn` / `error` four-tier severity vocabulary. Closes the "canonical event names + severity levels" gap from `WOP_COMPREHENSIVE_ANALYSIS.md` §Observability (B-).

**LT5.2 — REJECTED (redundant)**:

Original plan called for a separate `spec/v1/observability-otel.md`. Rejected after audit: existing `spec/v1/observability.md` (FINAL v1.0, 623 lines) already comprehensively covers OTel span attributes, span naming, OTel metrics taxonomy, trace context propagation. A separate doc would duplicate without benefit. Architecture-review-style scope discipline applied.

**LT5.3 — Debug-bundle spec** (new `spec/v1/debug-bundle.md`, DRAFT v1.1):

Defines `GET /v1/runs/{runId}/debug-bundle` — portable JSON export of a single run's diagnostic state (run snapshot + events + spans + metrics + redaction state). Profile-gated on `capabilities.debugBundle.supported: true`. 8 MB default size cap with `truncated: true` overflow signal. Redaction inheritance from the host's harness; `redactionApplied: true` + `redactionMode: passthrough` declared as malformed combination.

**LT5.4 — Debug-bundle JSON schema** (new `schemas/debug-bundle.schema.json`):

Wire-shape contract. Required: `bundleVersion` / `generatedAt` / `host` / `run` / `events` / `redactionApplied` / `redactionMode`. Optional: `spans` / `metrics` / `truncated` / `truncatedReason`. Compiles clean under Ajv2020.

**LT5.5 — In-memory reference host implementation**:

Added `GET /v1/runs/{runId}/debug-bundle` endpoint to `examples/hosts/in-memory/src/server.ts`. Discovery payload now advertises `debugBundle.supported: true`. Reference example omits user-supplied `inputs` from the bundle (advertises `redactionMode: omit`) — a real production host would mask via its redaction harness. **MyndHyve Cloud Run deploy of this endpoint deferred** to operator authorization per CLAUDE.md §"Workflow protocol deploy checklist."

**LT5.6 — Debug-bundle conformance scenario** (new `conformance/src/scenarios/debugBundle.test.ts`):

6 scenarios. (a) Hosts advertising `debugBundle.supported` return 200 with valid bundle; hosts not advertising return 404 — strict skip-equivalent. (b) `metrics.eventCount === events.length` invariant. (c) Malformed `redactionApplied: true` + `redactionMode: passthrough` rejection. (d) Bundle events agree with `/events/poll` for the same run. (e) Canary in workflow inputs MUST NOT echo verbatim — pins `SECURITY/invariants.yaml secret-leakage-debug-bundle`.

`SECURITY/invariants.yaml` updated: `secret-leakage-debug-bundle` test glob migrated from the redaction.test.ts stand-in to the new dedicated `debugBundle.test.ts`.

**Validation:**
- All 6 new scenarios pass against the in-memory reference host.
- Full suite against in-memory host: **163/221 pass** (was 155/213 pre-LT5); gained +1 file +8 tests, all passing.
- CI gate `scripts/wop-check.sh` 8/8 green.

### 2026-05-01 — Conformance suite 1.11.0 — LT3 partial (5 of 9 adversarial scenarios)

Lands LT3.3 + LT3.6 + LT3.7 + LT3.8 + LT3.9 + LT3.10 of the post-publication leadership track per `docs/plans/WOP-LEADERSHIP-TRACK.md` (MyndHyve-side). LT3.1 (replayDeterminism) + LT3.2 (interruptRace) + LT3.4 (streamReconnect) + LT3.5 (staleClaim) deferred to a successor session — they involve heavy state machines or multi-host coordination beyond what one session ships well.

**5 new conformance scenario files** under `conformance/src/scenarios/`:

- `idempotencyRetry.test.ts` (LT3.6) — RFC 0002 (Draft) contracts: `WOP-Idempotent-Replay` header semantics, 5-retry budget at 100ms cadence per `scale-profiles.md §Retry semantics`, optional `limits.idempotencyAckTimeoutSec` ≥ 5 contract.
- `redactionAdversarial.test.ts` (LT3.7) — extends `redaction.test.ts` with canary injection through workflow inputs, error-envelope echo paths, and embedded entropy-shape strings. Cross-references `SECURITY/invariants.yaml` `secret-leakage-eventlog-payload` + `secret-leakage-error-envelope`.
- `providerPolicyEnforcement.test.ts` (LT3.8) — extends `policies.test.ts` with closed-mode-set verification, `restricted` ⇒ `optional` requirement, `errorCode` shape contract. Cross-references `SECURITY/invariants.yaml` `provider-policy-pre-dispatch` + `provider-policy-restricted-glob`.
- `maliciousManifest.test.ts` (LT3.9) — pack-registry rejection paths: bad pack names, bad versions, signature-not-available shape per `myndhyve/wop@434c8f2`. Skip-equivalent on hosts that don't claim `wop-node-packs`. Cross-references `SECURITY/invariants.yaml` `node-pack-manifest-name-match` + `node-pack-path-traversal`.
- `eventOrdering.test.ts` (LT3.3) — polling order monotonicity, repeated-poll stability for terminal runs, exactly-one-terminal-event invariant, terminal-event-is-last. Permissive on `seq` vs `sequence` field naming until version-negotiation convergence (LT2 v0.2 follow-up).

**Suite version bumped** `@myndhyve/wop-conformance@1.10.0 → 1.11.0` (LT3.10).

**Validation:**
- All 20 new scenarios pass against the in-memory reference host.
- Full suite against in-memory host: **155/213 pass** (was 135/193 pre-LT3); gained 5 scenario files + 20 tests; net pass-count up exactly 20.
- Surfaced one defect in the in-memory host: 404 `workflow_not_found` was echoing user-supplied `workflowId` verbatim, leaking JWT-shaped canaries. Fixed in same commit by removing the echo — the message no longer interpolates user input.

LT3.1/3.2/3.4/3.5 (replay-determinism, interrupt-race, stream-reconnect, stale-claim) intentionally deferred — each requires either heavy host-side support (replay) or wall-clock timing harnesses (timing-sensitive). Tagged for a successor session.

### 2026-05-01 — In-memory reference host + INTEROP-MATRIX

Lands LT2.1, LT2.2, and LT2.5 of the post-publication leadership track per `docs/plans/WOP-LEADERSHIP-TRACK.md` (MyndHyve-side). LT2.3 (SQLite host) and LT2.4 ("build your own host" walkthrough) deferred to a successor session.

**In-memory reference host** (new `examples/hosts/in-memory/`):

Single-process, single-file (~570 LOC) WOP v1 server using only Node stdlib. Zero runtime dependencies. Implements `/.well-known/wop`, `/v1/openapi.json`, `POST /v1/runs` (with Layer-1 idempotency + 409-on-body-conflict per `idempotency.md`), `GET /v1/runs/{runId}` (snapshot), `POST /v1/runs/{runId}/cancel`, `GET /v1/runs/{runId}/events` (SSE), `GET /v1/runs/{runId}/events/poll` (polling). Loads fixture workflows from `conformance/fixtures/`; executes `core.noop` and `core.delay` node types.

Profile claim: **`wop-core` + `wop-stream-sse` + `wop-stream-poll`** per `spec/v1/profiles.md`. Scale claim: **`minimal`** per `spec/v1/scale-profiles.md`.

This is the protocol's first **non-MyndHyve reference implementation** — closes the "Independent hosts have not yet demonstrated compatible behavior" gap from `WOP_COMPREHENSIVE_ANALYSIS.md` §Interoperability (B-).

**Conformance result** (`examples/hosts/in-memory/conformance.md`):

Per-file pass/fail record against suite version 1.10.0:

- **16 of 30 scenario files fully pass** (135 of 193 tests).
- 8 files fail because the host doesn't claim the gating profile — out-of-profile, **not** a regression.
- 4 files have within-profile gaps (event-shape `seq`→`eventId+sequence`, SSE `bufferMs` query forwarding, array `streamMode` parameter handling, identity passthrough). LT2 follow-up for a v0.2 release.

**INTEROP-MATRIX.md** (new at repo root):

Browser-compat-table-style matrix cross-tabulating MyndHyve (production reference) and in-memory (example reference) across all 30 conformance scenario files. Glossary defines "skip-equivalent" and "out-of-profile." Documents the row-add procedure for third-party hosts: "implement → claim profile → run conformance → publish result → open PR."

LT2.3 (SQLite reference host) is the next track and will demonstrate durable execution; LT2.4 README will become the "build your own host" walkthrough.

### 2026-05-01 — Security threat models + invariants index + CI gate

Lands the LT7.1–LT7.5 deliverables of the post-publication leadership track (per the MyndHyve-side `docs/plans/WOP-LEADERSHIP-TRACK.md`). All changes are documentation + CI gate — no wire-shape change, no schema modifications, no SDK changes. Conformance suite is untouched (existing scenarios are referenced by the new invariants index, no new scenarios in this commit).

**Threat models** (4 new files in `SECURITY/`):

- `SECURITY/threat-model-secret-leakage.md` — BYOK secret resolution path. Trust boundaries T1–T5 (client → host → KMS-encrypted store → provider → observable surface). STRIDE per surface (event log payloads, OTel spans, error envelopes, debug bundles, exports, provider response stream). 12 invariants. Companion to existing redaction harness work that shipped in `wop-byok-harness` + `wop-byok-impl` (per `WOP-PHASED-DELIVERY.md` §8).
- `SECURITY/threat-model-prompt-injection.md` — LLM-mediated workflows. T1–T4 trust boundaries (user → host → prompt context → LLM → envelope → action dispatch). Untrusted-marker discipline at every prompt-context boundary; envelope type validation; HITL-only authority for approvals; tool allowlist gating. 13 invariants.
- `SECURITY/threat-model-node-packs.md` — node-pack supply chain. T1–T5 trust transitions (author → registry → host → sandbox → workflow). Manifest validation, signature verification, workspace approval, sandbox execution (no `process` / no `eval` / capability-gated I/O / per-invocation timeout + memory caps), pack output as untrusted. 25 invariants — the largest model.
- `SECURITY/threat-model-provider-policy.md` — provider-policy bypass paths. Four-mode enforcement (`disabled` hard-deny / `optional` no-op / `required` BYOK-only / `restricted` allowlist-glob). Pre-dispatch hook required; resolver outage fail-open; `restricted` without allowlist fail-closed. 13 invariants.

**Invariants index** (`SECURITY/invariants.yaml`):

YAML index of every MUST-NOT invariant from the four threat models. 63 total: 30 protocol-tier, 32 reference-impl-tier, 1 advisory. Each entry maps to one or more test file globs. Architecture-review fix #8: free-form Markdown parsing of threat models was rejected (fragile to reformatting); the YAML is the canonical source of truth, threat models are human-readable documentation.

Adding an invariant requires (a) adding it to the threat model with a unique ID, (b) adding the entry to `invariants.yaml`, (c) for protocol-tier: ensuring at least one test glob resolves. Removing an invariant requires an RFC per `RFCS/0001-rfc-process.md` because invariants are part of the security commitment.

**CI gate** (`scripts/check-security-invariants.sh`):

New step 8 in `wop-check.sh`. Reads `invariants.yaml` and verifies every protocol-tier MUST-NOT has at least one matching test file. Fails closed if a protocol-tier invariant has zero coverage. Reference-impl-tier and advisory invariants are not gated at this step (they're verified by the reference impl's own CI, or are defense-in-depth without a hard MUST).

Current state: 30/30 protocol-tier invariants pass; reference impl tracks the remaining 32 in its in-tree test suite (per `WOP-PHASED-DELIVERY.md` §8). 1 advisory invariant (`secret-leakage-author-emit`) has no required test — defense-in-depth only.

**SECURITY.md** updated to point at the four threat models with invariant counts and to reference the new CI gate as step 8 of `wop-check.sh`.

LT7.6 (external audit engagement) is intentionally deferred — gated on LT1 governance maturity per the leadership-track dependency graph.

### 2026-05-01 — Compatibility profiles + scale profiles + RFC 0002 idempotency-retry

Lands the LT4 deliverables of the post-publication leadership track (per the MyndHyve-side `docs/plans/WOP-LEADERSHIP-TRACK.md`). All changes are additive per `COMPATIBILITY.md` §2.1 — no wire-shape change to `/.well-known/wop`, no schema modifications, no SDK changes. Conformance suite gains 2 new scenario files (25 server-free + N runtime).

**Compatibility profiles** (new spec doc `spec/v1/profiles.md`, DRAFT v1.1):

Closed catalog of 7 v1.x profiles, each defined as a **predicate over existing capability fields** — never declared as a separate wire field. A host that satisfies the predicate AND passes the relevant runtime conformance scenarios is in the profile. Catalog: `wop-core` · `wop-interrupts` · `wop-stream-sse` · `wop-stream-poll` · `wop-secrets` · `wop-provider-policy` · `wop-node-packs`.

Architecture decision recorded in §"Why this is not a wire field": derivation avoids two divergent answers to "what does this host implement," and avoids forcing every host into a Cloud Run redeploy.

**Profile derivation** (new conformance lib `conformance/src/lib/profiles.ts`):

Single canonical implementation of profile membership. Pure functions `isCore(c)` · `isInterrupts(c)` · `isStreamSse(c)` · `isStreamPoll(c)` · `isSecrets(c)` · `isProviderPolicy(c)` · `isNodePacksDiscovery(c)`, plus `deriveProfiles(c)` that returns the full set in `PROFILE_NAMES` order. SDKs MAY re-export these helpers; no requirement to.

**Profile derivation scenarios** (new `conformance/src/scenarios/profileDerivation.test.ts`):

25 server-free scenarios. Verify deterministic + pure derivation against representative discovery payloads — minimum-conforming, richly-advertised, broken (non-1.x), edge cases (empty `supportedEnvelopes`, fractional limits, missing `secrets.scopes` includes user, empty `policies.modes`). Asserts stability across calls, profile-name ordering, and `hasProfile` consistency with `deriveProfiles`.

**Scale profiles** (new spec doc `spec/v1/scale-profiles.md`, DRAFT v1.1):

Three tiers — `minimal` · `production` · `high-throughput` — with normative floors for: concurrent runs in flight (per tenant + global), `POST /v1/runs` p50/p99 latency, event-stream delivery delay, idempotency cache retention, backpressure mechanism, fan-out cap, replay latency. Independent axis from compatibility profiles. Scale profile claims live in host README + `INTEROP-MATRIX.md`; no discovery-payload advertisement.

Adds normative §"Backpressure semantics" (503 + Retry-After body shape), §"Retry semantics" (≥5 retries, ≥100ms apart), §"Fan-out semantics" (cap.breached emission for throttled siblings), §"Replay semantics" (cold-cache replay floor or 501 Not Implemented).

**RFC 0002** (new `RFCS/0002-runs-idempotency-retry.md`, Status: Draft):

First per-boundary normative-semantics RFC. Closes 3 normative gaps in `idempotency.md` for `POST /v1/runs`:

1. Retry-after-timeout dispatch is now deterministic — block-and-replay if original completes within advertised ack timeout, else `409 idempotency_in_flight`.
2. `WOP-Idempotent-Replay` header promoted from SHOULD to MUST on every keyed response, including explicit `false` for fresh-after-eviction.
3. Layer-1 vs Layer-2 boundary made explicit — `POST /v1/runs` retries hit Layer 1 only; Layer 2 invocation log is engine-internal per-side-effect dedup.

Adds optional `limits.idempotencyAckTimeoutSec` to `capabilities.schema.json` (additive). 5-second floor. Also formalizes a 5-retry / 100ms-apart retry-budget floor on the server side. RFC currently in 7-day comment window per `RFCS/0001-rfc-process.md`.

**High-concurrency conformance scenarios** (new `conformance/src/scenarios/highConcurrency.test.ts`):

Tagged `@scale-profile-production`. Drives 10 parallel run creations + 5 sequential retries 100ms apart against a live host. Asserts: zero double-execution, deterministic 200/201/409 dispatch, `Retry-After` on rate-limited responses, idempotency cache survives retry storm, host advertises `idempotencyAckTimeoutSec ≥ 5` if the field is present. Skip via `WOP_SKIP_SCALE_PRODUCTION=1` for `minimal` hosts.

**No deploy required.** No wire-shape change in this release; the only schema-adjacent edit is the new optional `limits.idempotencyAckTimeoutSec` field documented in RFC 0002 (additive — existing servers MAY omit). Reference deployment can pick up the conformance scenarios at its own cadence.

### 2026-05-01 — Governance: formal RFC process, MAINTAINERS, COMPATIBILITY, SECURITY graduation

Lands the LT1 deliverables of the post-publication leadership track (per the MyndHyve-side `docs/plans/WOP-LEADERSHIP-TRACK.md`). All changes are governance / process / docs only — no wire-shape changes, no schema changes, no SDK changes. Conformance suite is untouched.

**RFC process** (new):
- `RFCS/README.md` — process summary, status states, numbering, template requirements.
- `RFCS/0000-template.md` — authoring template; required sections: summary / motivation / proposal / compatibility / conformance / alternatives / unresolved questions / acceptance criteria.
- `RFCS/0001-rfc-process.md` — meta-RFC defining the process itself, status `Active`. Subsequent normative spec changes go through this process.

**Compatibility commitment** (new):
- `COMPATIBILITY.md` — v1.x is **additive-only** by default. One explicit exception: **safety-fix breaks** (CVE-class or correctness fixes that can't be expressed additively) ship under a 90-day public RFC window unless under embargoed disclosure. Everything else that would break v1.0 conformance goes to v2 in parallel.
- `GOVERNANCE.md` §"Spec change process" updated to reflect the safety-fix category and to point at `RFCS/`.

**Maintainer record** (new):
- `MAINTAINERS.md` — canonical maintainer set, promotion process, expectations, removal-for-cause rules, affiliation policy. `GOVERNANCE.md` defers to this file for the current set.
- Lead-maintainer role declared as transitional; replaced by steering-committee vote when path-to-working-group conditions are met.

**SECURITY graduation** (STUB → v1.0):
- `SECURITY.md` rewritten to v1.0 with explicit response SLA (acknowledgment ≤ 3 business days; triage ≤ 10 business days; coordinated disclosure 90 days), CVE-coordination intent (via GitHub Security Advisories CNA), `WOP-SA-YYYY-NNNN` advisory IDs, safe-harbor commitment, and forward-pointers to LT7 threat-model artifacts.

**Vendor-neutral org migration tripwire** (new):
- `ROADMAP.md` adds a §"Vendor-neutral org migration" section documenting the move to `wop-spec/wop` as gated on a single tripwire: at least one maintainer not affiliated with the original steward listed in `MAINTAINERS.md`. Recruitment is explicitly out of band.

**Cross-references**:
- `GOVERNANCE.md` §"See also" added linking to `MAINTAINERS.md`, `RFCS/`, `COMPATIBILITY.md`, `SECURITY.md`, `ROADMAP.md`.

No schema, OpenAPI, AsyncAPI, SDK, or conformance-suite changes. CI gate is unaffected.

### 2026-04-30 — Document `GET /v1/packs/{name}/-/{version}.sig` + expanded PUT publish error catalog (Q6)

`spec/v1/node-packs.md` §Registry HTTP API.

Two contract gaps closed against the reference impl shipped 2026-04-30 (myndhyve/myndhyve `wop-host-registry` series).

**1. New endpoint: `GET /v1/packs/{name}/-/{version}.sig`.**

The detached Ed25519 signature blob (already documented as a manifest concept via `signing.signatureRef` in §Manifest format) had no documented retrieval endpoint. Without it, end-to-end client verification (fetch keychain → fetch signature → fetch tarball → verify) is impossible — clients could fetch the public keys but had nowhere to fetch the signature against. Added the route with:

- `404 signature_not_available` for the unified missing/yanked/unsigned/storage-unwired states. The four cases are intentionally indistinguishable: yanked tarballs MUST NOT serve their signatures (consumers shouldn't verify against known-bad packs); the rest are infrastructure states the consumer can't act on differently.
- `400 invalid_pack_name` / `invalid_version` for URL-param validation.
- 302-redirect option so storage backends can serve the bytes directly without streaming through the registry.

The keychain endpoint (`GET /v1/packs/{name}/-/keychain`) was already documented in `registry-operations.md` §"Signing keychain"; the `.sig` endpoint completes the verification pair.

**2. Expanded PUT publish error catalog.**

The PUT publish section previously listed 5 error codes (`invalid_pack_scope`, `pack_integrity_failure`, `unsupported_runtime`, `forbidden`, `conflict`). The reference impl emits 14 more across four error families that clients need for proper UX surfacing:

- **URL/scope** (3 new): `invalid_pack_name` (regex mismatch), `invalid_version` (semver mismatch), and clarification that `invalid_pack_scope` covers the new `private.*` scope from the prior CHANGELOG entry.
- **Body shape** (1 new): `invalid_body` — caller sent JSON instead of octet-stream tarball.
- **Tarball extraction** (9 new, all with the `tarball_*` prefix for client-side switching): `tarball_gunzip_failed`, `tarball_too_large`, `tarball_manifest_missing`, `tarball_manifest_too_large`, `tarball_manifest_not_json`, `tarball_entry_missing`, `tarball_entry_too_large`, `tarball_path_traversal`, `tarball_tar_parse_failed`. Documented with reference-impl byte caps (50 MB total / 256 KB manifest / 5 MB entry source) — registries MAY use different caps but SHOULD emit the same code names.
- **Manifest contents** (2 new): `invalid_manifest` (schema validation failure with detail-path), `manifest_mismatch` (name or version differ from URL — reference impl prefers granular `manifest_name_mismatch` / `manifest_version_mismatch`, registries MAY emit either form, clients MUST handle either).

Also clarified the **idempotent re-publish** semantic: PUT with sha256-identical content for an existing `(name, version)` returns `200 OK` with the existing record, NOT 409. Lets retries and tooling-driven re-uploads succeed cleanly without conflict-handling boilerplate.

The Content-Type accepted on the body is now explicit: `application/gzip`, `application/x-gzip`, or `application/octet-stream`. Reference impl rejects other types as `invalid_body`.

Why now: closes the spec/impl drift surfaced during the WOP host-registry deployment (`docs/runbooks/WOP-HOST-REGISTRY-DEPLOYMENT.md` §6 publish flow). Without these codes documented, SDK / CLI authors writing against `node-packs.md` would map every 400 to a generic "bad request" UX instead of actionable per-stage diagnostics.

### 2026-04-30 — Reserve `private.<host>.*` scope for host-internal registries (Q6)

`spec/v1/node-packs.md` §Naming + `schemas/node-pack-manifest.schema.json`.

A new reverse-DNS scope formally reserved for **host-internal pack registries** (e.g., a vendor's self-hosted GCS-backed deployment). The reference impl already accepted `private.*` packs via its own `PACK_NAME_RE` for the WOP host-registry feature shipped 2026-04-30; the spec / canonical schema now match — closes the silent drift where `@myndhyve/wop-conformance@1.8.0`'s `node-pack-manifest.schema.json` would reject `private.*` packs even though the reference registry accepted them.

**What's reserved:** `private.<host>.<...>` follows the same dotted reverse-DNS shape as the other scopes. The `<host>` segment is operator-chosen — the host running the private registry picks a stable identifier that won't collide with `core` / `vendor.<org>` / `community.<author>` / `local`.

**What's enforced:**
- The public registry at `packs.wop.dev` (forthcoming) MUST refuse `private.*` uploads with `400 invalid_pack_scope`. Mirrors the `local.*` "not for public" semantic.
- Self-hosted registries MAY accept `private.*` uploads as host policy.
- A `private.<host>.*` pack CANNOT migrate to `packs.wop.dev` without renaming to `vendor.<host>.*` or another non-`private` scope (and re-signing).

**Distinction from `local.*`:** `local.*` is in-repo / dev-time / unpublished. `private.<host>.*` is the host's *curated production* registry — published, signed, version-tracked, but not in the public namespace. The two scopes are deliberately separate so a tooling decision ("can this pack be `npm pack` shipped vs needs registry submission?") is unambiguous.

**Schema change:** the regex in `node-pack-manifest.schema.json:name.pattern` widened from `^(core|vendor|community)\.[a-z]...$` to `^(core|vendor|community|private)\.[a-z]...$`. Additive — every pack that validated before still validates now; new `private.*` packs additionally validate.

Why now: closes drift between the spec's documented scopes and the reference registry's enforcement, surfaced by the WOP host-registry deployment runbook (`myndhyve/myndhyve@d8...d49b1` series). Aligns with `registry-operations.md` §"Host-private marketplace relationship" which described the deployment model but didn't reserve a scope for it.

### 2026-04-30 — §7 drift audit corrections (Q3 / Q6 / Q7 — multiple sections)

Reconciles spec text + JSON schemas with the actual MyndHyve reference impl wire shape after a cross-check of every `RESOLVED` §7 question against in-tree types/enums/payloads. Spec direction: **reality first** — extend or amend documented contracts to match what the reference impl already emits, since (a) tightening impl risks breaking persisted events + in-flight runs, (b) extending spec is purely additive for clients.

**Q3 — `secrets`** (`spec/v1/capabilities.md`):
- `run` scope tagged as **reserved** in v1.x — no reference impl ships it yet; future hosts MAY advertise it without a spec bump (additive in `scopes` array).
- Naming alias note added: hosts using a workspace-keyed storage path (e.g., `workspaces/{wsId}/secrets/{id}` in MyndHyve) advertise `tenant` here regardless of internal field naming — the wire term is `tenant`.

**Q6 — Pack registry errors**:
- `spec/v1/registry-operations.md` §submission validation: `manifest_path_mismatch` AND the more granular pair (`manifest_name_mismatch` / `manifest_version_mismatch`) both spec-allowed. Registries SHOULD prefer the granular pair for richer diagnostics; clients MUST handle either form. Reference impl emits the granular pair.
- `spec/v1/node-packs.md` §`DELETE /v1/packs/{name}/-/{version}`: documented `400 unpublish_window_expired` error returned when the version is older than the registry's unpublish window (default 72h per the npm convention). Use the yank flow for security incidents past the window.

**Q7 — Approval / interrupt resume payload** (`spec/v1/interrupt.md` + 2 schemas):
- **Wire-action rename `'edit'` → `'edit-accept'`.** The reference impl emits `'edit-accept'` to distinguish "approve with user-edited artifact" from plain `'accept'` (downstream artifact-sync paths differ — the user's edited bytes replace the AI-generated bytes before propagation). Schemas + spec text both updated.
  - **BREAKING within 24-hour same-day correction window.** The `'edit'` form landed in the spec at `0e0171b` (2026-04-30) but no published consumer was known. Any consumer that forked between then and now needs to update their parser.
- **`refineFeedback` shape rewrite from `string` to `RefineFeedback` object** with 5 fields (`scope`, `sectionPath?`, `itemIds?`, `tags?`, `text?`). Spec previously declared a string; the reference impl has always used the object form (`packages/workflow-engine/src/types/suspendSchemas.ts:22`).
- **Layer distinction (`decidedBy`)**: typed optional at the resume layer (client may omit; host's auth layer populates from request principal); MUST be populated by the host at the event-emission layer. New §"Layer distinction" prose block makes this explicit.
- **Backward-compat mapping documented** for legacy clients sending `decision: 'approved' | 'rejected' | 'timeout' | 'cancelled'` without `action`. Mapping table covers each legacy decision → new action.
- `schemas/run-event-payloads.schema.json` `approvalReceived`: action enum updated; `voter` → `decidedBy`; `decidedAt` added; `refineFeedback` object property added (with required `scope`); `editedArtifactData` property added.
- `schemas/suspend-request.schema.json` `actions[]` enum: `'edit'` → `'edit-accept'`.

### 2026-04-30 — `aiProviders.policies` reason-name correction (same-day spec fix)

Aligns the documented denial reasons with the actual `ProviderPolicyError`
enum in the reference impl. Detected when wiring the discovery
advertisement on `services/workflow-runtime` — the in-tree
`ProviderPolicyErrorReason` (engine package) is the authoritative
contract; the spec text shipped earlier today drifted from it.

- **`spec/v1/capabilities.md`** — denial-reason names corrected:
  - `"disabled"` → `"provider_disabled"` (matches `ProviderPolicyError`
    construction site in `serverExecutionHost.checkPolicyPreKey`).
  - `"restricted_no_allowlist"` removed as a separate reason — that
    case surfaces as `"model_not_allowed"` with `allowed: []` in the
    error context, NOT a distinct reason code (matches impl).
  - `"byok_required_but_unresolved"` added — the post-resolve case
    where BYOK was required AND a `credentialRef` was supplied, but
    the resolver returned no usable secret. Distinct wire shape from
    the pre-resolve `"byok_required"` (which fires when no
    `credentialRef` was ever supplied).
- The four-mode taxonomy (`disabled` / `optional` / `required` /
  `restricted`) is unchanged. Conformance scenarios in
  `@myndhyve/wop-conformance@1.8.0` only assert mode names, not
  reason names, so no scenario changes.

### 2026-04-30 — `aiProviders.policies` capability (G22 follow-on)

Documents the four-mode provider-policy taxonomy that hosts MAY enforce
to gate AI provider use per-request: `disabled` / `optional` / `required`
/ `restricted`. Additive, backward-compatible — hosts that omit the
field implement no enforcement and clients see only `optional`
semantics.

- **`spec/v1/capabilities.md`** — new `### aiProviders.policies` section
  inside the existing `aiProviders` block. Defines the four modes,
  their pre-dispatch behavior, the wire-format error code
  (`provider_policy_denied`), the four canonical denial reasons
  (`disabled` / `byok_required` / `model_not_allowed` /
  `restricted_no_allowlist`), the resolver fail-open contract (resolver
  outage → fail-open to `optional`; misconfigured `restricted` policy
  with empty/missing `allowedModels` → fail-closed), and a layered-
  scope resolution model (`workspace` / `project` / `canvas-type`).
  Field-reference table row added for `aiProviders.policies`.
- **`schemas/capabilities.schema.json`** — `aiProviders` gains an
  optional `policies` property (nested `modes` array with the four
  mode enum, optional `scopes` array, optional `errorCode` string
  override). Fully additive; existing capability documents continue
  to validate.

The policy *document* shape (per-workspace / per-project / per-canvas-
type storage) is intentionally host-internal and NOT part of the wire
protocol — clients learn the *outcome* through the
`provider_policy_denied` error, not by subscribing to host audit events.

Conformance scenario coverage to follow in a separate PR.

### 2026-04-29 — Publishing plan + CI workflow template (G10 phase 1)

New `PUBLISHING.md` (FINAL v1.0, ~1,400 words) covers the operational
plan for publishing the 4 spec-corpus distributable artifacts:

| Artifact | Package | Registry | Status |
|---|---|---|---|
| TypeScript SDK | `@wop/client` | npm | In-repo; first publish deferred |
| TypeScript conformance suite | `@wop/conformance` | npm | In-repo; first publish deferred |
| Python SDK | `wop-client` | PyPI | In-repo; first publish deferred |
| Go SDK | `wopclient` | Go modules | In-repo; first publish deferred |

Closes G10 phase 1 (operational plan + pre-publish checklist + CI
sketch). Phase 2 (actual first publication) requires three external
decisions before activation:
- Resolve the `@wop` npm org claim (or rename to a different scope).
- Resolve the `wop-client` PyPI project claim.
- Resolve the Go module path (host repo decision).

Phase 1 deliverables:
- **Publication policy** — versioning alignment (SDKs track spec
  major; conformance independently bumps minors), trigger matrix
  (spec patch / minor / major releases vs. SDK-only patches),
  deprecation policy (npm deprecate / PyPI yank / Go retraction).
- **Pre-publish checklist** — per-artifact gate that MUST pass
  before each publish. Hard gate; one failure means no release.
- **Release manager role** — designated per release cycle; runs
  the checklist + posts release notes + updates V1-FINAL doc.
- **CI workflow sketch** — `.github/workflows/wop-publish.yml.template`
  (committed but inactive — extension intentionally `.template` so
  GitHub Actions ignores it). Activation steps documented.

Package descriptions refreshed:
- Dropped "Scaffold — not yet published" language from the 3
  package manifests (`@wop/client`, `@wop/conformance`,
  `wop-client`). New language: "FINAL v1.0 — first <registry>
  publication tracked as G10 phase 2 (see PUBLISHING.md)."

In-repo-only artifacts (no plan to publish to package registries)
are explicitly listed: prose docs, JSON Schemas, conformance
fixtures, OpenAPI/AsyncAPI YAMLs. These ship via the docs site
when G12 phase 2 lands.

### 2026-04-29 — Registry operations spec (G11 phase 1)

New `registry-operations.md` (FINAL v1.0, ~3,000 words) covers the
operator-side lifecycle for node-pack registries — submission flow,
validation flow, deprecation flow, yank flow, signing-key rotation
flow, and the MyndHyve marketplace relationship. Pairs with
`node-packs.md` §"Registry HTTP API" (which covers wire shapes) —
`registry-operations.md` covers what registries do BEFORE accepting
a submission (validation), how versions retire (deprecation),
emergency security flows (yank), and how long-lived signing keys
rotate.

Closes two open spec gaps inline:
- **NP4 (pack deprecation flow)** — new
  `POST /v1/packs/{name}/-/{version}/deprecate` + reverting endpoint;
  consumer semantics (pinned consumers continue resolving deprecated
  versions; open/verified consumers log warnings); deprecation
  metadata block on `GET /v1/packs/{name}/-/{version}.json`.
- **NP5 (signing-key rotation)** — new keychain document with
  `validFrom` / `validUntil` / `rotatedFrom` / `rotationProof` per
  key entry; `POST /v1/packs/{name}/-/keychain/rotate` requires a
  signature from the OLD key over the new key's identity (so an
  attacker who steals only the old key still can't redirect to a key
  they control); compromise-flow guidance.

Spec also clarifies the MyndHyve marketplace relationship: same
wire format as public WOP packs, but private namespace
(`myndhyve.<canvas-type>.*`), MyndHyve-rooted signing chain,
verified-mode-only loading. Engine consumers in MyndHyve
workspaces consult both registries (private first, public second).

The hosted reference registry at `packs.wop.dev` remains
forthcoming; v1.0 ships the spec contract, not the deployment.

### 2026-04-29 — Quickstart guide + post-v1.0 docs index refresh (G12 phase 1)

New `QUICKSTART.md` end-to-end walkthrough at the top of the spec
corpus. Closes G12 phase 1 (in-repo navigability). Phase 2 (static-
site generator + hosted public site) is deferred — the in-repo
markdown index + quickstart cover developer-onboarding ergonomics
without requiring hosting infrastructure.

Sections:
- Discovery via `/.well-known/wop`
- Auth (bearer-token + scope vocabulary cross-reference)
- Run lifecycle (create + snapshot + cancel + interrupt + artifact)
- Live event delivery: SSE modes (updates / values / messages /
  debug + mixed mode + bufferMs) AND webhooks (subscription +
  HMAC verification recipe)
- Time-travel debugging (fork branch + replay + replay.diverged)
- RunOptions configurable + reserved keys including BYOK
  (ai.provider / ai.model / ai.credentialRef)
- Node-pack authoring pointer
- Conformance suite usage
- SDK pointers (TypeScript / Python / Go all FINAL v1.0)
- Storage adapter contract pointer

README index updated:
- Added `webhooks.md` (post-v1.0 addition this session, ~1,400 words)
- Added `storage-adapters.md` (post-v1.0 addition this session,
  ~1,150 words)
- Total: 14 docs, ~19,200 words

### 2026-04-29 — BYOK + secret-resolution surface added (G22 phase 1)

WOP-core spec additions for BYOK (Bring-Your-Own-Key) + secret
resolution. Closes the portable half of G22; the larger MyndHyve
host-side implementation (encrypted storage, KMS, audit, BYOK admin
UI, redaction tests) is a separate multi-week track that builds
against this surface.

Capabilities (capabilities.md + capabilities.schema.json):
- New `Capabilities.secrets` block with `supported` (boolean),
  `scopes` (subset of `["tenant", "user", "run"]`), `resolution`
  (currently always `"host-managed"`). Hosts that don't store
  credentials return `supported: false` and clients gate BYOK UX
  accordingly.
- New `Capabilities.aiProviders` block with `supported` (provider
  ids the host can route to: `anthropic`, `openai`, `gemini`, etc.)
  and `byok` (subset for which BYOK is permitted). Empty `byok`
  array → all calls use platform-managed keys.

NodeManifest (node-pack-manifest.schema.json + node-packs.md):
- New `nodes[].requiresSecrets[]` per-node array. Each entry:
  `{id, kind, provider?, scope?}` where `kind` is one of
  `ai-provider` / `api-key` / `oauth-token` / `custom`.
- New `SecretRequirement` $def in the schema.
- Engine semantics: before dispatching a node with
  `requiresSecrets`, verify against `Capabilities.secrets` +
  `Capabilities.aiProviders` + `RunOptions.configurable.ai.*`;
  call `SecretResolver.resolveSecret` and pass the opaque ref.

Error codes (rest-endpoints.md):
- `credential_required` — node declares secret but none resolved.
- `credential_forbidden` — caller passed `ai.credentialRef` for a
  non-BYOK provider.
- `credential_unavailable` — host doesn't advertise
  `Capabilities.secrets.supported`.

RunOptions reserved keys (run-options.md):
- `ai.provider` — provider override; must be in `aiProviders.supported`.
- `ai.model` — model override (BYOK-aware vs the legacy unscoped `model`).
- `ai.credentialRef` — opaque host-issued credential reference.
  NEVER carries raw key material; SecretResolver dereferences
  internally. Required when a node declares an `ai-provider`
  requirement on a BYOK provider.
- The `ai.*` namespace is RESERVED for spec-defined BYOK + provider-
  routing keys; vendor extensions MUST use a vendor prefix.

Hard rule preserved (NFR-7): any code path that emits a `RunEvent`,
OTel span, log line, error message, or exported artifact MUST NOT
contain raw key material. Hosts MUST add lint + redaction unit
tests verifying this invariant before exposing the BYOK surface.

### 2026-04-29 — DurableSuspendManager class rename (G9 phase 2)

`FirestoreSuspendManager` class export is renamed to
`DurableSuspendManager` to reflect its storage-agnostic intent — the
class only operates on the `SuspendIO` contract (G8) and is not
inherently coupled to Firestore. Original `FirestoreSuspendManager`
name preserved as a class alias (`export const FirestoreSuspendManager
= DurableSuspendManager`) for back-compat. Existing imports continue
to resolve unchanged.

The file path `engine/FirestoreSuspendManager.ts` is unchanged; file
rename is deferred until the new path can ship without breaking
existing import statements.

This closes the host-agnostic-naming half of G9. The `@wop/engine`
package rename + `@myndhyve/wop-host` adapter extraction are deferred
to G9 phase 3 (depends on G10 publishing infrastructure).

### 2026-04-29 — Engine package is React-free (G9 phase 1)

The `@myndhyve/workflow-engine` package no longer imports React. The
one UI leak — `NodeModule.card.componentLoader` field referencing
`ComponentType<NodeCardProps<T>>` from React — is replaced with a
structural `HostComponentLoaderResult` shape. Host-side renderers
(the browser app's `CardComponentRegistry`) cast the loader's
`default` to their framework's component type at consumption time;
Vue / Solid / Lit hosts can now consume the engine without React
in their dependency graph. `react` removed from
`peerDependencies`; `@types/react` removed from `devDependencies`.

The package is now fully framework-agnostic. The `@wop/engine`
package rename is deferred to G9 phase 3 (mechanical;
back-compat-friendly via npm-package alias).

### 2026-04-29 — Storage-adapter contracts formalized (G8 phase 1)

New normative spec doc `storage-adapters.md` covering the two storage
contracts every WOP-compliant engine implementation MUST satisfy:

- **`RunEventLogIO`** — append-only event log, monotonic per-run
  sequencing, atomic appends, range read, live subscribe with
  backfill. Surface unchanged from v1.0; this entry promotes it to
  documented normative status.
- **`SuspendIO`** — durable suspension state for cross-process resume.
  Method surface unchanged from the v1.0 `FirestoreSuspendIO`
  interface; renamed to host-agnostic `SuspendIO` post-v1.0 to
  reflect that storage backend is implementation-defined. Original
  `FirestoreSuspendIO` and `FirestorePendingDoc` types preserved as
  back-compat aliases.

In-memory reference adapters now ship in `@myndhyve/workflow-engine`:
- `InMemoryEventLogIO` — for tests + non-durable reference deployments.
- `InMemorySuspendIO` — same.

Both pass the contract tests pinned in
`packages/workflow-engine/src/{protocol,engine}/__tests__/` and are
intended as reference implementations for third-party adapter authors
(Postgres / SQLite / Redis backends are explicit future-work targets;
neither ships in v1.0).

Compliance checklist for third-party adapters lives in the spec doc;
the in-memory adapter tests are the de-facto prototype for a
parameterized adapter compliance suite (deferred follow-on work).

### 2026-04-29 — `replay.diverged` runtime emission (Track 3b)

Implementation-side closure for the `replay.diverged` event type that
the spec corpus has already enumerated since v1.0:

- `run-event.schema.json` already lists `replay.diverged` in the
  `type` enum (no change needed at the spec layer).
- `replay.md` §"Failure surfaces" already specifies the event payload
  (`{originalEventId, replayEventId, divergencePoint}`) and behavior
  ("emit informational event; continue execution").
- `stream-modes.md` already maps it to `debug` stream mode (and lists
  it in the AsyncAPI `AnyRunEvent` description).
- `observability.md` §"Replay attributes" already specifies the
  matching OTel span attribute `wop.replay.diverged: true`.

No spec-corpus change required; this entry records the runtime
landing for traceability. The reference impl
(`packages/workflow-engine/src/protocol/RunEvent.ts`) added the
`'replay.diverged'` literal to its `RunEventType` union to match the
JSON Schema enum, and the Cloud Run host
(`services/workflow-runtime/src/invocationLogBootstrap.ts`) now wires
the divergence callback to `getEventLog().append(...)`.

---

## 2026-04-27 — v1.1 promotion (Phase A + Phase B unblock)

Per the v1.1 promotion plan, four spec-only PROPOSED items move from
"future v1.1" → stable v1.0, plus Phase B's typeId decision unblocks
the F2 fixture entirely.

### Phase B unblock — F2 sub-workflow typeId
- Decision: `core.subWorkflow` per `docs/PRD-WOP-MYNDHYVE-EXTENSION-LAYER.md` §8.7 Core WOP node list.
- Updates: `fixtures.md` F2 §section (4 typeId references); `node-packs.md` gains a "Reserved Core WOP node typeIds" §section enumerating the full PRD-aligned list (`core.start` / `core.end` / `core.conditional` / `core.delay` / `core.loop` / `core.parallel` / `core.merge` / `core.setVariable` / `core.getVariable` / `core.interrupt` / `core.subWorkflow`). Naming convention documented: `core.<conceptName>` flat camelCase for Core WOP; multi-segment dotted typeIds (e.g., `core.ai.callPrompt`) live in the portable optional `wop.*` / `vendor.*` tier.
- F2 row: PROPOSED v1.1 → spec ✅ / impl pending.

### Phase A.4 — C3 Channel TTL (`ttlMs`) → stable
- `channels-and-reducers.md` §header: PROPOSED v1.1 → "(closes C3)".
- `ChannelDeclaration.ttlMs` field added to `workflow-definition.schema.json` (range 1ms..1yr).
- TS interface example in the prose includes `ttlMs?: number`.

### Phase A.3 — O4 Cost attribution → stable
- `observability.md` §"Cost attribution attributes" header: PROPOSED v1.1 → "(closes O4)".
- `wop.cost.recorded` log metric reclassified.
- `wop.cost.usd` OTel metric: Stability `Experimental` → `Stable`. All 13 OTel metrics now Stable.

### Phase A.2 — S4 Mixed mode → stable
- `stream-modes.md` §"Mixed mode" header: PROPOSED v1.1 → "(closes S4)".
- `api/openapi.yaml` `streamMode` parameter widened from strict enum to a regex pattern accepting comma-separated combinations (`updates,messages` etc.).

### Phase A.1 — S3 Aggregation hint (`bufferMs`) → stable
- `stream-modes.md` §"Aggregation hint" header: PROPOSED v1.1 → "(closes S3)".
- `api/openapi.yaml` adds `bufferMs` query parameter on the SSE endpoint (range 0..5000).

### SDK alignment for S3 + S4 across all 3 reference SDKs
- TS / Python / Go SSE consumers each:
  - Accept array (or comma-list) `streamMode` for S4.
  - Accept `bufferMs` query forwarding for S3.
  - Transparently flatten `event: batch` arrays back into per-event yields, so existing consumers don't change.

### Updated counts
- Spec gaps fully ✅: 18 of 21 (was 13). Remaining 3 are spec-firm with only runtime impl pending (F2 + F4 + CC-1).
- PROPOSED v1.1 items remaining: zero.
- All 12 prose docs are DRAFT or higher. All 10 JSON Schemas compile clean.

---

## 2026-04-27 — v1 corpus iteration day 2

Closes the rest of the iteration backlog including the largest remaining item (P2-F5 node-pack registry spec) and several PROPOSED v1.1 designs across stream-modes / channels / observability.

### Spec — schema corpus

- **JS1** ✅ — `run-event-payloads.schema.json` covers all 38 `RunEventType` variants in ~15 shape families. Top-level `run-event.schema.json` `payload` stays permissive for forward-compat; consumers MAY pin strict validation via `$defs.<typeId>`.
- **P2-F5** ✅ — `node-pack-manifest.schema.json` (the `pack.json` shape for shareable NodeModule packages). Closes the largest remaining "future" item.

Schema corpus grew from 8 → 10 first-class JSON Schemas. All compile clean under Ajv2020.

### Spec — prose

- **`capabilities.md`** OUTLINE v0.2 → DRAFT v0.3. After auth + rest-endpoints promoted on day 1, all 11 prose specs are now DRAFT or higher (no STUB or OUTLINE remaining).
- **`node-packs.md`** NEW DRAFT v0.1 (~1,750 words). Pack manifest format, runtime languages (JS / Python / Go / WASM / remote-MCP), distribution + signing (Sigstore + manual Ed25519), 6-endpoint registry HTTP API, 4-layer trust-policy model.

Prose corpus: 11 → 12 docs, ~14,900 → ~16,650 words.

### Reference SDKs (P2-F3 ✅ COMPLETE)

- **TS SDK v0.2.1** — added typed `RunConfigurable`, signed-token interrupt resolution, `WopError.traceId` extraction.
- **Python SDK v0.1** — new package `wop-client` (`sdk/python/`). Pure stdlib (no `httpx` / `requests`). Sync API; async deferred to v0.2. 12-endpoint coverage matching TS.
- **Go SDK v0.1** — new module `wopclient` (`sdk/go/`). Pure stdlib. Channel-based SSE consumer. 12-endpoint coverage matching TS+Python.

### Spec — proposed v1.1 designs

| Gap | Spec doc | Section |
|---|---|---|
| S3 | `stream-modes.md` | Aggregation hint `?bufferMs=N` (batched SSE delivery) |
| S4 | `stream-modes.md` | Mixed mode `?streamMode=A,B` (union-of-filters) |
| C3 | `channels-and-reducers.md` | Channel `ttlMs` (entry-age TTL for monotonic-append reducers) |
| O4 | `observability.md` | Cost attribution attributes (`wop.cost.tokens.*` + `wop.cost.usd`) |
| F2 | `conformance/fixtures.md` | Sub-workflow fixture pair (`conformance-subworkflow-parent` + `-child`) |
| F4 | `conformance/fixtures.md` | Capability-limit fixture (`conformance-cap-breach` — 10 noops + recursionLimit:5) |

All marked "PROPOSED v1.1 — Not in v1.0 normative surface; servers MAY implement." Consumers MUST NOT depend until promotion.

### CI / tooling

- **`scripts/wop-check.sh`** grew 4 → 6 stages: + Python SDK syntax + import smoke; + Go SDK `go vet` (skipped if Go not installed locally).
- **`.github/workflows/wop-spec.yml`** mirrors with `actions/setup-python@v5` + `actions/setup-go@v5` steps.
- **`spec-corpus-validity.test.ts`** strips PROPOSED §sections + table rows before scanning fixtures.md for IDs — so future-fixture documentation doesn't break the round-trip check.

### Updated counts

| Artifact | Day 1 close | Day 2 close |
|---|---|---|
| Prose specs (DRAFT or higher) | 11 of 11 | 12 of 12 (node-packs added) |
| First-class JSON Schemas | 8 | 10 |
| Conformance scenarios | 75 | 75 (no new scenarios; PROPOSED designs blocked on impl) |
| TS SDK endpoints | 12 | 12 |
| Python SDK endpoints | — | 12 |
| Go SDK endpoints | — | 12 |
| `wop:check` stages | 4 | 6 |

---

## 2026-04-26 — v1 corpus iteration day

After the initial v1 release, a focused iteration session closed multiple gaps:

### Spec — schema corpus

- **JS2** ✅ — `capabilities.schema.json` lifted from `Capabilities.ts` (was inline in OpenAPI).
- **JS3** ✅ — `run-options.schema.json` (input overlay shape — `configurable + tags + metadata`) lifted from `run-options.md`. OpenAPI `POST /v1/runs` body now uses this via `allOf` $ref.
- **JS4** ✅ — `channel-written-payload.schema.json` lifted from `channels-and-reducers.md` §Channel write event.
- **JS5** ✅ — `error-envelope.schema.json` lifted from inline OpenAPI (canonical `{error, message, details?}`).
- **JS6** ✅ — `run-snapshot.schema.json` lifted from inline OpenAPI (`GET /v1/runs/{runId}` shape).

Schema corpus grew from 3 to 8 first-class JSON Schemas. All compile clean under Ajv2020.

### Spec — prose

- **`auth.md`** STUB v0.1 → DRAFT v0.2. Stable surface (bearer-token + 8 scopes + canonical error envelope) is comprehensive enough for SDK + conformance authoring.
- **`rest-endpoints.md`** STUB v0.1 → DRAFT v0.2. 14 paths formalized in `api/openapi.yaml`; replay/fork landed at `:fork`.

### Conformance — `@wop/conformance`

- **v0.6.1** — `values`-mode reachability scenario.
- **`wop-conformance` CLI** binary (`src/cli.ts` → `dist/cli.js`). Operator-friendly `--offline`/`--filter`/`--base-url`/`--api-key`/`--impl`/`--impl-version` flags. `--help` and missing-args paths exit cleanly.
- **Portable assertions** — replaced 7 uses of `toBeOneOf` with `[a,b].includes(x)` so the suite works under both vitest 2.x and 4.x.
- **Lockfile** — `package-lock.json` committed for reproducible installs.

### TypeScript SDK — `@wop/client`

- **v0.2** — signed-token interrupt resolution (`inspectByToken` / `resolveByToken`) + typed `RunConfigurable` overlay surface.
- **`WopError`** captures W3C `traceparent` + extracts `traceId` from response headers per `observability.md` §Trace context propagation. Error messages auto-suffix with `(trace=<id>)` so operators can search backend traces from logs.
- **Lockfile** — `package-lock.json` committed.

### CI / tooling

- **`.github/workflows/wop-spec.yml`** — path-filtered workflow runs the 4-stage validation in <5 min on PRs touching `spec/**`.
- **`npm run wop:check`** — local one-shot mirror of CI: conformance + SDK + redocly + asyncapi-cli. ~30s warm.
- **`scripts/wop-check.sh`** — backing shell script with auto-install of subpackage deps.

### Reference impl alignment

- **WOP P2-R8** ✅ — Cloud Run server's `POST /v1/canvases/{canvasTypeId}/runs` body schema accepts the WOP-spec `configurable + tags + metadata` overlay fields. Pure pass-through (persisted on the run doc; runtime semantics for `configurable.recursionLimit` remains CC-1's hard-invariant work).

### Spec-corpus self-validator

- **`spec-corpus-validity.test.ts`** auto-discovers JSON Schemas + prose docs, so adding a new schema or prose file is automatically gated by the CI check. Skips `META_DOCS` (`README.md`, `CHANGELOG.md`, `CONTRIBUTING.md`) since they aren't normative spec docs.

### CHANGELOG + CONTRIBUTING

- `CHANGELOG.md` (this file) lands as the corpus-wide change log.
- `CONTRIBUTING.md` documents the contribution process — scope, status legend bumps, per-artifact change rules, the 8-check CI gate, coordination with the impl plan via CC-N entries.

### Updated counts

| Artifact | Pre-iteration | Post-iteration |
|---|---|---|
| Prose specs (DRAFT or higher) | 9 of 11 | 11 of 11 (auth + rest-endpoints promoted) |
| First-class JSON Schemas | 3 | 8 |
| Conformance scenarios | 71 | 75 (+ values-mode) |
| Conformance server-free scenarios | 36 | 40 |
| TS SDK endpoints | 10 | 12 (+ inspectByToken, resolveByToken) |
| Top-level npm scripts | — | + `npm run wop:check` |
| GitHub Actions workflows | — | + `wop-spec.yml` |

---

## 2026-04-26 — v1 corpus initial release

The full v1 spec corpus dropped in a single ~24-hour burst across many small commits. Listed here as a single milestone so external readers don't need to interleave 30+ git messages.

### Prose specs (11 docs)

| Doc | Status | Words |
|---|---|---|
| `auth.md` | STUB v0.1 | ~1,000 |
| `rest-endpoints.md` | STUB v0.1 | ~1,150 |
| `idempotency.md` | DRAFT v0.1 | ~1,300 |
| `version-negotiation.md` | DRAFT v0.2 | ~2,060 |
| `capabilities.md` | OUTLINE v0.2 | ~1,480 |
| `observability.md` | DRAFT v0.1 | ~1,260 |
| `stream-modes.md` | DRAFT v0.1 | ~1,150 |
| `run-options.md` | DRAFT v0.1 | ~1,180 |
| `interrupt.md` | DRAFT v0.1 | ~1,500 |
| `replay.md` | DRAFT v0.1 | ~1,320 |
| `channels-and-reducers.md` | DRAFT v0.1 | ~1,500 |

**Total**: ~14,900 words.

### JSON Schemas (3 files)

- `workflow-definition.schema.json` — DAG structure (nodes/edges/triggers/variables/groups/channels/metadata/settings).
- `run-event.schema.json` — persisted event document (`eventId`, `runId`, `type`, `payload`, `timestamp`, `sequence`).
- `suspend-request.schema.json` — `InterruptPayload` wire format with 4 `kind` discriminator (`approval`, `clarification`, `external-event`, `custom`).

All schemas declare `$schema: 2020-12` and compile cleanly under Ajv2020.

### Machine-readable APIs

- **OpenAPI 3.1** (`api/openapi.yaml`) — formal REST surface; 14 paths, 23 schemas, 5 reusable responses. References JSON Schemas via cross-file `$ref`. Lints clean under `@redocly/cli`.
- **AsyncAPI 3.1** (`api/asyncapi.yaml`) — formal SSE event surface; 4 channels (one per stream mode), 4 receive operations, 20 messages. Validates clean under `@asyncapi/cli`.

### Conformance test suite — `@wop/conformance` (v0.6)

| Version | Scenarios | New coverage |
|---|---|---|
| v0.1 | 8 | discovery, auth, errors |
| v0.2 | 23 | fixture contract (9 canonical workflow JSONs), run lifecycle |
| v0.3 | 31 | idempotency, cancellation, HITL approval/clarification |
| v0.4 | 34 | failure path, identity passthrough, multi-node ordering |
| v0.5 | 37 | SSE stream modes via hand-rolled SSE client (zero-dep) |
| v0.6 | 71 | spec-corpus self-validator, replay/fork, version negotiation |
| v0.6.1 | 72 | values-mode reachability |

**Operator UX**: `wop-conformance` CLI binary added in v0.6.0+ with `--offline`, `--filter`, `--base-url`/`--api-key`/`--impl-*` flags.

### TypeScript reference SDK — `@wop/client`

| Version | Surface |
|---|---|
| v0.1 | 10 endpoints (discovery, workflows, runs CRUD, run-scoped HITL, fork, events SSE+poll), zero runtime deps |
| v0.2 | + signed-token HITL (`inspectByToken` / `resolveByToken`), typed `RunConfigurable` |

### Reference impl alignment

- **CC-3 (DONE)** — OTel attributes renamed `myndhyve.*` → `wop.*` across 5 files (19 unique keys; snake_case per spec). Operator action: remap dashboards/alerts.
- **CC-4 (DONE)** — `Capabilities.limits.maxNodeExecutions` field added; default 100; merge semantics + prompt rendering.
- **CC-1 (PARTIAL)** — `validateRecursionLimit(requested, ceiling)` pure helper landed. Hard per-run invariant deferred (needs RunEvent type addition + `eventLogSchemaVersion` bump).

### Known gaps (deferred)

| Tracking ID | Doc | Description |
|---|---|---|
| F1 | `conformance/fixtures.md` | `messages`-mode fixture (AI provider mock needed) |
| F2 | `conformance/fixtures.md` | Sub-workflow fixture |
| F3 | `conformance/fixtures.md` | Replay-source fixture |
| F4 | `conformance/fixtures.md` | Capability-limit overrun fixture |
| F5 | `conformance/fixtures.md` | Schema-version-cycle fixture |
| S1 | `stream-modes.md` | `state.snapshot` payload schema firmness |
| S2 | `stream-modes.md` | `ai.message.chunk` token-level metadata |
| S3 | `stream-modes.md` | Subscriber-side aggregation hints (`?bufferMs=`) |
| S4 | `stream-modes.md` | Mixed-mode subscriptions (`?streamMode=updates,messages`) |
| O1–O5 | `observability.md` | OTel metric definitions, span linkage, replay/branch linkage, cost attribution, PII classification |

### What's NOT in v1

- Reference SDKs in Python + Go (P2-F3).
- Public node-pack registry — `npm` analog for shareable NodeModule packages (P2-F5).
- Webhook spec (deferred until `webhooks.md` reaches DRAFT).
- Conformance suite v1.0 declaration — current v0.6 is sufficient for early adopter review but not yet self-described as "complete".
