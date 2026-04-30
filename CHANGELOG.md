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
