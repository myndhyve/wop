# WOP Spec v1

> **Status: FINAL v1.0 (2026-04-27).** Protocol contract is locked. Implementations validate against `@wop/conformance` `1.0.0` at their own cadence.

> **Workflow Orchestration Protocol** — wire-level spec for declaring, executing, suspending, resuming, and observing multi-step workflows across hosts. Started 2026-04-26; v1.0 final 2026-04-27.

The WOP spec is the externally-visible contract that lets independent implementations of workflow orchestration (engines, SDKs, debuggers, agents) interoperate. The reference implementation lives in `packages/workflow-engine/` of this repo; the spec is what other ecosystems pin against.

## Document index

| Doc | Status | Words | Covers |
|---|---|---|---|
| [`auth.md`](./auth.md) | FINAL v1.0 | ~1,000 | API keys, scopes, tenant isolation, rate limits, audit |
| [`rest-endpoints.md`](./rest-endpoints.md) | FINAL v1.0 | ~1,150 | Endpoint catalog with per-route auth/scope; canonical headers; error codes |
| [`idempotency.md`](./idempotency.md) | FINAL v1.0 | ~1,300 | Two-layer contract: HTTP `Idempotency-Key` + engine `invocationId` |
| [`version-negotiation.md`](./version-negotiation.md) | FINAL v1.0 | ~2,060 | Four version axes (engine, per-run event-log, per-event, runtime pinning); deploy-skew safety |
| [`capabilities.md`](./capabilities.md) | FINAL v1.0 | ~1,480 | `/.well-known/wop` handshake; in-package vs network-superset shapes |
| [`observability.md`](./observability.md) | FINAL v1.0 | ~1,260 | Canonical `wop.*` OTel namespace; span names; metric kinds |
| [`stream-modes.md`](./stream-modes.md) | FINAL v1.0 | ~1,150 | Four SSE consumption modes: `values`/`updates`/`messages`/`debug` |
| [`run-options.md`](./run-options.md) | FINAL v1.0 | ~1,180 | Per-run `configurable` overlay + `tags` + `metadata` (decoupled from versioning) |
| [`interrupt.md`](./interrupt.md) | FINAL v1.0 | ~1,500 | Canonical HITL primitive: 4 `kind`s, 5-action approval vocabulary, signed-token callback |
| [`replay.md`](./replay.md) | FINAL v1.0 | ~1,320 | `POST /v1/runs/{runId}:fork` for time-travel debugging |
| [`channels-and-reducers.md`](./channels-and-reducers.md) | FINAL v1.0 | ~1,500 | Typed state channels with explicit reducers (replaces variable-prefix conventions) |
| [`node-packs.md`](./node-packs.md) | FINAL v1.0 | ~1,750 | Pack manifest format + distribution + signing + registry HTTP API (P2-F5) |
| [`webhooks.md`](./webhooks.md) | FINAL v1.0 | ~1,400 | Subscription register/unregister; HMAC `{timestamp}.{rawBody}` signing; replay-attack-resistant verification recipe; best-effort delivery semantics + circuit breaker (post-v1.0 addition, 2026-04-29) |
| [`storage-adapters.md`](./storage-adapters.md) | FINAL v1.0 | ~1,150 | Normative `RunEventLogIO` + `SuspendIO` contracts for storage backends; in-memory reference impls; compliance checklist for third-party adapter authors (post-v1.0 addition, 2026-04-29) |
| [`registry-operations.md`](./registry-operations.md) | FINAL v1.0 | ~3,000 | Operator-side normative reference for node-pack registries: submission, validation, deprecation, yank, signing-key rotation, MyndHyve marketplace boundary (post-v1.0 addition, 2026-04-29 — closes NP4 + NP5 from `node-packs.md`) |

**Total**: 15 docs, ~22,200 words. The 12 v1.0 launch docs (top of table) all FINAL v1.0 as of 2026-04-27; `webhooks.md` + `storage-adapters.md` + `registry-operations.md` are post-v1.0 additions for surfaces that landed during the B.6 / G8 / G11 follow-on tracks.

## Quickstart

New to WOP? Start with **[`QUICKSTART.md`](./QUICKSTART.md)** for an end-to-end walkthrough covering:

- Calling a WOP-compliant server (auth + create run + read snapshot)
- Receiving live events (SSE / webhook patterns)
- Time-travel debugging (fork + replay)
- Writing a node pack
- Certifying your implementation against the conformance suite

## Operational references

- **[`PUBLISHING.md`](./PUBLISHING.md)** — operational plan for publishing the 4 spec-corpus artifacts (TS SDK, TS conformance, Python SDK, Go SDK). Cadence, release manager, pre-publish checklist, CI sketch.
- **[`registry-operations.md`](./registry-operations.md)** — operator-side reference for node-pack registries: submission / validation / deprecation / yank / signing-key rotation flows.
- **[`storage-adapters.md`](./storage-adapters.md)** — `RunEventLogIO` + `SuspendIO` contracts for storage backends; in-memory references.

## Status legend

| Tag | Meaning |
|---|---|
| **STUB** | Minimal coverage of stable surfaces only. Implementers SHOULD pin only to what's documented; assume gaps. |
| **DRAFT** | Comprehensive coverage of stable + in-flight surfaces, but not yet reviewed by spec committee. |
| **OUTLINE** | Sketched but not detailed. Section headings lock; field schemas may shift. |
| **FINAL** | Frozen. Breaking changes go to v2. |

Within DRAFT/OUTLINE specs, individual fields and section subgroups carry inline tags:
- **(stable)** — shape locked
- **(in-flight)** — driven by impl plan PRs in development
- **(future)** — deferred to v1.x or v2

## Reading order

For implementers building a WOP-compliant **server**:

1. **`auth.md`** — auth model + scope vocabulary
2. **`rest-endpoints.md`** — endpoint catalog
3. **`idempotency.md`** — two-layer contract (REQUIRED for safe retries)
4. **`version-negotiation.md`** — version stamping + deploy-skew rules
5. **`capabilities.md`** — `/.well-known/wop` handshake
6. **`stream-modes.md`** — SSE delivery modes
7. **`interrupt.md`** — HITL primitive
8. **`run-options.md`** — `configurable`/`tags`/`metadata`
9. **`observability.md`** — `wop.*` OTel taxonomy
10. **`replay.md`** — time-travel debug surface
11. **`channels-and-reducers.md`** — typed state model (largest, depends on others)

For implementers building a WOP-compliant **client (CLI, SDK, agent)**:

1. **`auth.md`**
2. **`rest-endpoints.md`** — request shapes
3. **`stream-modes.md`** — `?streamMode=` selection
4. **`capabilities.md`** — pre-flight handshake (advisory)
5. **`version-negotiation.md`** — `minClientVersion` + version pinning
6. **`run-options.md`** — `configurable` knobs the server accepts
7. **`interrupt.md`** — HITL UX patterns
8. **`replay.md`** — time-travel for end-user debug

## Spec foundations

Six items are **borrowed idioms** from adjacent ecosystems. Cited where used:

| Idiom | Borrowed from | Where in spec |
|---|---|---|
| Per-(run, changeId) version pinning | [Temporal `getVersion`](https://docs.temporal.io/dev-guide/typescript/versioning) | `version-negotiation.md` |
| Stream mode taxonomy (`values`/`updates`/`messages`/`debug`) | [LangGraph streaming](https://langchain-ai.github.io/langgraph/concepts/streaming/) | `stream-modes.md` |
| `interrupt(payload)` HITL primitive | [LangGraph human-in-the-loop](https://langchain-ai.github.io/langgraph/concepts/human_in_the_loop/) | `interrupt.md` |
| `configurable` per-run overlay | [LangChain `RunnableConfig.configurable`](https://python.langchain.com/docs/concepts/runnables/#configurable-runnables) | `run-options.md` |
| Typed channels + reducers | [LangGraph `Annotated[T, reducer]`](https://langchain-ai.github.io/langgraph/concepts/low_level/#state) | `channels-and-reducers.md` |
| Replay / fork-from-checkpoint | [LangGraph `update_state(checkpoint, ...)`](https://langchain-ai.github.io/langgraph/concepts/persistence/#update-state) | `replay.md` |

Borrowing is for **ecosystem familiarity**, not vendor lock-in — none of these implementations are normative dependencies. WOP-compliant implementations are free to ignore the borrowed source and follow the spec text alone.

## Machine-readable artifacts

| Artifact | Path | Version | Tooling |
|---|---|---|---|
| JSON Schemas | `schemas/*.schema.json` | 1.0 | Ajv2020 (JSON Schema 2020-12) |
| OpenAPI 3.1 spec | `api/openapi.yaml` | 1.0 | `redocly lint` / `redocly bundle` |
| AsyncAPI 3.1 spec | `api/asyncapi.yaml` | 1.0 | `asyncapi validate` / `asyncapi bundle` |
| Conformance suite | [`conformance/`](./conformance/) | 1.0.0 | `vitest` / `wop-conformance` CLI |
| TS reference SDK | [`sdk/typescript/`](./sdk/typescript/) | 1.0.0 | `tsc` |
| Python reference SDK | [`sdk/python/`](./sdk/python/) | 1.0.0 | `python3 -m ast` + import |
| Go reference SDK | [`sdk/go/`](./sdk/go/) | 1.0.0 | `go vet` |

The two API specs reference the JSON Schemas via cross-file `$ref`; bundlers inline them on demand. The conformance suite is a self-contained driver-style harness — point it at any WOP-compliant server with `WOP_BASE_URL` + `WOP_API_KEY` env vars and run `npx vitest run` (or use the `wop-conformance` CLI for friendlier output). At v1.0 the suite ships **82 scenarios across 15 files** (46 server-free + 36 server-required) covering discovery, auth, errors, run lifecycle, idempotency, cancellation, HITL approval/clarification, failure paths, identity passthrough, multi-node ordering, SSE stream modes, replay/fork, and version negotiation. See [`conformance/README.md`](./conformance/README.md).

## What's NOT in v1

These are deliberately deferred:

- **Reference node-pack registry deployment** — the spec is drafted at `node-packs.md` (P2-F5 v0.1 LANDED). The actual hosted registry at `https://packs.wop.dev/` is forthcoming.

## Reporting issues

See [CONTRIBUTING.md](./CONTRIBUTING.md) for the full guide. In short — file issues against the implementation repo with the label `wop-spec`. Include:

- Doc filename + section heading
- Specific RFC 2119 requirement that's unclear or contradictory
- Implementation impact (what's blocked / what's ambiguous)

## Changelog

See [CHANGELOG.md](./CHANGELOG.md) — `[1.0.0] — 2026-04-27 — WOP v1.0 FINAL` is the current top entry.

See [V1-FINAL-COMPLETION-PLAN.md](./V1-FINAL-COMPLETION-PLAN.md) — `Status: COMPLETE` as of 2026-04-27. The doc remains in the corpus as the v1.0 release record, plus the post-v1.0 ecosystem roadmap for the six implementation-conformance triggers (which ship as minor releases of `@wop/conformance` against the unchanged v1.0 protocol contract).

Current state: 12 prose specs FINAL v1.0 · 10 JSON Schemas · 82 conformance scenarios across 15 files (46 server-free + 36 server-required) · 3 reference SDKs at 1.0.0. Headline entries:

- **2026-04-26** — Initial draft of 11 prose docs + 3 JSON Schemas landed across multiple commits.
- **2026-04-26** — OpenAPI 3.1 (`api/openapi.yaml`) and AsyncAPI 3.1 (`api/asyncapi.yaml`) added; both lint clean and reference the JSON Schemas via `$ref`.
- **2026-04-26** — Conformance suite scaffold landed at `conformance/` (8 initial scenarios across discovery, auth, errors).
- **2026-04-26** — Fixture-workflow contract (`conformance/fixtures.md` + 9 canonical JSONs) defines the seeded-workflow surface every WOP-compliant server MUST ship. Suite grows to 23 scenarios; fixture-validity scenarios run server-free. Schema typeId pattern relaxed to allow camelCase (matches reference impl).
- **2026-04-26** — Conformance suite v0.3 lands idempotency, cancellation, and HITL approval/clarification scenarios. Total now 31 scenarios across 8 files (12 server-free + 19 server-required).
- **2026-04-26** — Conformance suite v0.4 lands failure-path, identity-passthrough, and multi-node ordering scenarios (the last exercises `GET /v1/runs/{runId}/events/poll` for the first time). Total now 34 scenarios across 11 files (12 server-free + 22 server-required). Remaining stubs: SSE stream-modes, replay `:fork`, version negotiation.
- **2026-04-26** — Conformance suite v0.5 lands SSE stream-mode scenarios via a hand-rolled native-fetch SSE client (`lib/sse.ts` — zero deps). Tests `updates` termination, unsupported-mode 400, and debug ⊇ updates invariant. Total now 37 scenarios across 12 files (12 server-free + 25 server-required). Remaining stubs: `values`-mode payload, `messages`-mode AI chunks, replay `:fork`, version negotiation.
- **2026-04-26** — TypeScript reference SDK scaffold (P2-F3) at `sdk/typescript/`. Hand-authored thin client for the canonical REST surface + async-iterable SSE consumer. Zero runtime deps. Builds cleanly with strict TS.
- **2026-04-26** — Conformance suite v0.6 lands replay/fork (`POST /v1/runs/{runId}:fork`), version negotiation (RunEventDoc shape + sequence monotonicity + forward-compat events/poll tolerance), AND a spec-corpus self-validator that catches drift across schemas/openapi/asyncapi/fixtures/prose-status without a server. Total now **71 scenarios across 15 files (36 server-free + 35 server-required)**.

## Related

- **[`ROADMAP.md`](./ROADMAP.md)** — v1.0 stable / v1.X minor / post-v1.0 ecosystem.
- **[`GOVERNANCE.md`](./GOVERNANCE.md)** — maintainer model, decision-making, and spec change process.
- **[`spec/v1/V1-FINAL-COMPLETION-PLAN.md`](./spec/v1/V1-FINAL-COMPLETION-PLAN.md)** — v1.0 release record (non-normative).
- **MyndHyve reference host** — the flagship production host built on top of WOP. Architectural details live in the host's own repository, not this one.
