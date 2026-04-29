# WOP Spec v1 — Capability Declaration (`/.well-known/wop`)

> **Status: FINAL v1.0 (2026-04-27).** Reconciled with PR 3b.1.1 + 3b.2 + CR #3 fixes, then formalized as `schemas/capabilities.schema.json` (per JS2). The in-package `Capabilities` shape is locked **(stable)** — see "In-package shape" below. The full network-handshake at `GET /.well-known/wop` is a superset that adds discovery/transport/observability fields tagged **(future)**. Conformance suite scenarios `discovery: /.well-known/wop` (3 scenarios) verify the stable surface end-to-end. Keywords MUST, SHOULD, MAY follow [RFC 2119](https://www.rfc-editor.org/rfc/rfc2119). See `auth.md` for the status legend.

---

## Why this exists

External clients (CLIs, SDKs, agents from other ecosystems) need a deterministic way to discover what a WOP-compliant server can do *before* they issue requests. Specifically:

- Which protocol version they're talking to (and whether their client is too old)
- Which envelope types and node types are registered
- What hard limits apply (recursion, run duration, request body size)
- Which transports are exposed (REST, MCP, A2A, gRPC)
- Which OTel attribute taxonomy traces will use
- Which `configurable` keys are accepted on per-run overrides

This document specifies the public surface. The richer in-package `Capabilities` type used by the engine itself (defined by impl plan PR 3b.1 in `packages/workflow-engine/src/protocol/capabilities.ts`) is a superset of this network shape.

---

## Endpoint

A WOP-compliant server MUST expose:

| Method | Path | Auth | Cache |
|---|---|---|---|
| `GET` | `/.well-known/wop` | None (public) | `Cache-Control: public, max-age=300` recommended |

The path follows [RFC 8615](https://www.rfc-editor.org/rfc/rfc8615) `.well-known` URI conventions. The response MUST be JSON with `Content-Type: application/json`.

A server MAY expose this at additional paths for backward compatibility but MUST treat `/.well-known/wop` as canonical.

---

## Two surfaces

The reference implementation now has a real `Capabilities` type (PR 3b.1.1, file `packages/workflow-engine/src/protocol/Capabilities.ts:69`). Its scope is **narrower** than this network-handshake document covers:

- **In-package `Capabilities`** — what the engine tells the LLM in the system prompt. 5 fields. **(stable)** — see "In-package shape" below.
- **Network-handshake `Capabilities`** — what `GET /.well-known/wop` returns to external clients. Superset of the in-package shape plus discovery/transport/observability/configurable. **(future)** — see "Network-handshake superset" below.

The in-package shape is locked. The network-handshake superset is sketched here as the design target; fields beyond the in-package set are tagged **(future)** until a follow-up PR lands them.

---

## In-package shape (PR 3b.1.1, **(stable)**)

What the engine actually has today, used to format the system prompt:

```typescript
interface Capabilities {
  protocolVersion: string;                          // engine ↔ LLM contract version
  supportedEnvelopes: readonly string[];            // ['prd.create', 'theme.create', ...]
  schemaVersions: Readonly<Record<string, number>>; // { 'prd.create': 2, 'theme.create': 1 }
  limits: CapabilityLimits;                         // hard caps on LLM behavior
  extensions?: Readonly<Record<string, unknown>>;   // per-canvas-type additions
}

interface CapabilityLimits {
  clarificationRounds: number;   // default 3
  schemaRounds: number;           // default 2
  envelopesPerTurn: number;       // default 5
}
```

**Default limits** (`DEFAULT_CAPABILITY_LIMITS` in `Capabilities.ts:118`):

```typescript
{ clarificationRounds: 3, schemaRounds: 2, envelopesPerTurn: 5 }
```

**Helper functions**:
- `buildCapabilities(opts)` — construct from envelope catalog + limits. Validates `schemaVersions` are non-negative integers (`Capabilities.ts:142`).
- `formatCapabilitiesForPrompt(caps)` — render as system-prompt text block. Sorts envelope types + extension keys deterministically for prompt-cache stability (`Capabilities.ts:186`).
- `mergeCapabilities(base, extension)` — per-canvas-type merge. Union of envelopes, extension wins on schema-version + limit conflicts (`Capabilities.ts:265`).

**Enforcement**: `CapabilityLimiter` (`packages/workflow-engine/src/protocol/CapabilityLimiter.ts`, PR 3b.2) tracks counters per (run, task, turn) and emits `CapabilityLimitExceededError` on breach.

---

## Network-handshake superset (**(future)**)

The full `GET /.well-known/wop` response. Everything beyond the in-package shape is **(future)** — schema sketches below show where headed; field-level shape may shift.

```json
{
  "protocolVersion": "1.0.0",
  "implementation": { "name": "...", "version": "...", "vendor": "..." },

  "engineVersion": 1,
  "eventLogSchemaVersion": 2,

  "supportedTransports": ["rest", "mcp", "a2a"],
  "supportedEnvelopes": ["prd.create", "theme.create", "..."],
  "schemaVersions": { "prd.create": 2, "theme.create": 1 },

  "limits": {
    "clarificationRounds": 3,
    "schemaRounds": 2,
    "envelopesPerTurn": 5,
    "maxNodeExecutions": 1000,
    "maxRunDurationSec": 86400,
    "maxRequestBodyBytes": 1048576
  },

  "configurable": {
    "model": { "type": "string" },
    "temperature": { "type": "number", "min": 0, "max": 2 },
    "recursionLimit": { "type": "number", "max": 1000 }
  },

  "observability": {
    "namespace": "wop",
    "spanAttributes": ["wop.run_id", "wop.node_id", "wop.node_type", "wop.event_seq", "wop.workflow_id", "wop.protocol_version"]
  },

  "runtimeCapabilities": ["chat.sendPrompt", "canvas.write"],

  "secrets": {
    "supported": true,
    "scopes": ["tenant", "user", "run"],
    "resolution": "host-managed"
  },

  "aiProviders": {
    "supported": ["anthropic", "openai", "gemini"],
    "byok": ["anthropic", "openai"]
  },

  "minClientVersion": "0.1.0"
}
```

### Field reference

| Field | Type | Status | Notes |
|---|---|---|---|
| `protocolVersion` | `string` | **(stable)** | In-package; engine ↔ LLM contract version. |
| `supportedEnvelopes` | `string[]` | **(stable)** | In-package. |
| `schemaVersions` | `Record<string, number>` | **(stable)** | In-package. **Per-envelope-type integer**, not per-spec-type semver. |
| `limits.clarificationRounds` | `number` | **(stable)** | In-package; default `3`. |
| `limits.schemaRounds` | `number` | **(stable)** | In-package; default `2`. |
| `limits.envelopesPerTurn` | `number` | **(stable)** | In-package; default `5`. |
| `extensions` | `Record<string, unknown>` | **(stable)** | In-package; per-canvas-type additions. |
| `implementation.{name,version,vendor}` | object | **(future)** | Network-only — identifies the server. |
| `engineVersion` | `number` | **(future)** | Network-only — see `version-negotiation.md`. Lift from impl. |
| `eventLogSchemaVersion` | `number` | **(future)** | Network-only — see `version-negotiation.md`. Lift from impl. |
| `supportedTransports` | `string[]` | **(future)** | Subset of `["rest", "mcp", "a2a", "grpc"]`. REST REQUIRED. |
| `limits.maxNodeExecutions` | `number` | **(stable)** | In-package; default `100` per CC-4 (landed 2026-04-26). Engine-side ceiling clamping `RunOptions.configurable.recursionLimit`. Exceedance emits `cap.breached` with `kind: "node-executions"` and transitions the run to `failed` per §"Engine-enforced limits + cap.breached" below (closes CC-1 spec-side). |
| `limits.maxRunDurationSec` | `number` | **(future)** | Cloud Run timeout reflection. |
| `limits.maxRequestBodyBytes` | `number` | **(future)** | Express body limit. |
| `configurable` | object | **(future)** | Per-run parameter overlay schema (gap #23 / P2-R8). |
| `observability` | object | **(future)** | OTel attribute taxonomy. See `observability.md` (forthcoming). |
| `minClientVersion` | `string` | **(future)** | Client-side version floor for `426 Upgrade Required`. |
| `runtimeCapabilities` | `string[]` | **(future)** | G23 — host-advertised opaque capability ids that NodeModules may require via `NodeModule.requires`. See §"Runtime capabilities (future)" below. |
| `secrets.supported` | `boolean` | **(future)** | G22 — host advertises secret/credential resolution. Clients gate BYOK flows on this. See §"Secrets" below. |
| `secrets.scopes` | `string[]` | **(future)** | G22 — subset of `["tenant", "user", "run"]`. Hosts that store secrets per-workspace return `["tenant"]`; per-user hosts return `["user"]`; both can co-exist. |
| `secrets.resolution` | `string` | **(future)** | G22 — currently always `"host-managed"`. Reserved for future modes (e.g., `"client-attached"` for clients that pass credentials inline; out of scope for v1.x). |
| `aiProviders.supported` | `string[]` | **(future)** | G22 — providers the host's AI proxy can route to (`anthropic`, `openai`, `gemini`, etc.). |
| `aiProviders.byok` | `string[]` | **(future)** | G22 — subset of `aiProviders.supported` for which BYOK is permitted. Empty array → host serves all callers via platform-managed keys; clients MUST NOT send `ai.credentialRef` for non-BYOK providers. |

### `configurable`

`(in-flight)` — schema for per-run parameter overrides accepted by `POST /v1/runs` `configurable` field. See `run-options.md` (forthcoming) for full semantics. The capability declaration enumerates the keys the server accepts:

```json
"configurable": {
  "model": { "type": "string", "description": "AI model override" },
  "temperature": { "type": "number", "min": 0, "max": 2 },
  "maxTokens": { "type": "number", "min": 1, "max": 8192 },
  "promptOverrides": { "type": "object" },
  "recursionLimit": { "type": "number", "min": 1, "max": 1000 }
}
```

A client MUST consult this capability before sending `configurable` values and MUST omit keys not listed. An unknown key on the wire MAY be rejected with `validation_error` or silently ignored — implementations differ; the spec recommends rejection so misconfiguration is loud.

### Runtime capabilities (**(future)** — G23)

`(future)` — additive post-v1.0 enhancement tracked as `WORKFLOW_ORCHESTRATION_GAPS.md` G23. Lets a host advertise opaque host facilities that NodeModules can require via `NodeModule.requires?: readonly string[]`. The protocol owns the *check*; provider value shapes are documented per-capability alongside their consumers, NOT here.

```json
"runtimeCapabilities": ["chat.sendPrompt", "canvas.write", "secrets.byok"]
```

**Field shape:** array of unique non-empty strings. Capability ids are dotted, domain-scoped (conventional namespaces: `chat.*`, `canvas.*`, `secrets.*`, `media.*`).

**Client semantics.** A client that submits a workflow whose nodes declare `requires: ['chat.sendPrompt']` SHOULD first verify the host advertises that capability. A host that lacks a capability MUST refuse to dispatch nodes that declare it in `requires`, terminating the run with `RunSnapshot.error.code = 'capability_not_provided'` and the missing capability id in the error message.

**Backward compat.** Clients MUST tolerate the field's absence — only hosts that opt into G23 advertise it. NodeModules with no `requires` (the v1.0 status quo) are unaffected.

See `packages/workflow-engine/src/protocol/RuntimeCapabilityRegistry.ts` for the engine-side install/get pattern (mirrors `installEventLog` / `installSuspendManager`). Conformance scenario stub: `conformance/src/scenarios/runtime-capabilities.test.ts`.

### `secrets` (**(future)** — G22)

`(future)` — additive post-v1.0 enhancement tracked as `WORKFLOW_ORCHESTRATION_GAPS.md` G22. Lets a host advertise that it supports secret-resolution + BYOK (Bring-Your-Own-Key) flows for AI provider credentials and other host-managed secrets.

```json
"secrets": {
  "supported": true,
  "scopes": ["tenant", "user", "run"],
  "resolution": "host-managed"
}
```

**Field shape:**

- `supported` (boolean) — host has any secret-resolution at all. Hosts that don't store credentials (e.g., test deployments) return `false` and clients MUST NOT attempt BYOK flows.
- `scopes` (string array, subset of `["tenant", "user", "run"]`) — declares which secret-storage scopes the host implements. A `tenant`-scoped secret is shared across the workspace; `user`-scoped is per-end-user; `run`-scoped is ephemeral per-run. Hosts that support multiple scopes return all of them.
- `resolution` (string, currently always `"host-managed"`) — the resolution mode. Reserved for forward-compat: future versions may add `"client-attached"` for clients that pass credentials inline (out of scope for v1.x — clients MUST use opaque references via `RunOptions.configurable.ai.credentialRef`).

**Client semantics.** Clients gate BYOK UX on `secrets.supported === true`. Without it, the BYOK flow is unavailable and the host serves all callers from platform-managed credentials.

**Server semantics.** Hosts that advertise secrets MUST implement `SecretResolver` (defined alongside the other host adapters in PRD §11 Phase 2). The `SecretResolver` returns opaque `ResolvedSecret` references that downstream provider adapters dereference internally — raw key material NEVER appears in the protocol surface (no events, logs, traces, prompts, errors, exports, screenshots).

**Hard rule (NFR-7):** any code path that emits a `RunEvent`, OTel span, log line, error message, or exported artifact MUST NOT contain raw key material. Hosts MUST add lint + redaction unit tests verifying this invariant before exposing the BYOK surface.

### `aiProviders` (**(future)** — G22)

`(future)` — companion to `secrets`. Advertises which AI providers the host's AI-proxy can route to and which permit BYOK.

```json
"aiProviders": {
  "supported": ["anthropic", "openai", "gemini"],
  "byok": ["anthropic", "openai"]
}
```

**Field shape:**

- `supported` (string array) — provider ids the host's AI-proxy can route to. Conventional ids: `anthropic`, `openai`, `gemini`, `mistral`, `cohere`, `vertex`, `bedrock`. Hosts MAY add vendor-prefixed extensions.
- `byok` (string array, subset of `supported`) — providers for which the host permits BYOK. Empty array → all calls use platform-managed keys; non-empty → clients MAY pass an opaque `ai.credentialRef` in `RunOptions.configurable` for matching providers.

**Client semantics.**

- `RunOptions.configurable.ai.provider` — selects the provider (must be in `supported`).
- `RunOptions.configurable.ai.model` — selects the model.
- `RunOptions.configurable.ai.credentialRef` — opaque host-issued reference to a stored secret (must reference a credential of a provider in `byok`).

**Server semantics.** Servers reject `ai.credentialRef` for providers NOT in `byok` with `credential_forbidden`. Servers reject unknown `provider` ids with `validation_error`.

### `observability`

`(in-flight)` — see `observability.md` (forthcoming).

```json
"observability": {
  "namespace": "wop",
  "spanAttributes": [
    "wop.run_id",
    "wop.node_id",
    "wop.node_type",
    "wop.event_seq",
    "wop.workflow_id",
    "wop.protocol_version"
  ],
  "spanNames": ["wop.run", "wop.node.<typeId>", "wop.interrupt"]
}
```

A server that exports OTel traces MUST use the `wop.*` namespace. Aliasing to vendor-specific taxonomies (e.g., `langgraph.*`, `datadog.*`) is per-deployment configuration, NOT spec'd.

---

## Engine-enforced limits and the `cap.breached` event (closes CC-1 spec-side)

The four `Capabilities.limits` fields (`clarificationRounds`, `schemaRounds`, `envelopesPerTurn`, `maxNodeExecutions`) are engine-enforced — the server MUST emit a `cap.breached` event AND fail the run / node when an attempted operation would exceed the configured ceiling. All four kinds share the same event surface (`run-event-payloads.schema.json#$defs.capBreached`) so consumers handle one event with a `kind` discriminator instead of N parallel surfaces.

### `cap.breached` payload

| Field | Type | Notes |
|---|---|---|
| `kind` | string | One of `clarification`, `schema`, `envelopes`, `node-executions`. |
| `limit` | integer | The ceiling that was tripped (server-resolved value — see §Resolution below). |
| `observed` | integer | The observed value at the moment of trip. Always strictly greater than `limit`. |
| `nodeId` | string (optional) | Set for node-scoped limits (`clarification`, `schema`). Absent for run-scoped (`envelopes`, `node-executions`). |

### Resolution: `recursionLimit` + `maxNodeExecutions`

For the `node-executions` kind specifically (which is the runtime invariant for `recursionLimit`):

1. The server resolves the effective limit as `min(RunOptions.configurable.recursionLimit, Capabilities.limits.maxNodeExecutions)`. If the caller didn't supply `configurable.recursionLimit`, the server uses `maxNodeExecutions` directly.
2. The server validates the caller's supplied value at run-create time via the `validateRecursionLimit()` helper documented in `run-options.md`. Out-of-range values return `400 validation_error` BEFORE the run starts — never at runtime.
3. The server maintains a per-run `nodeExecutionCount` counter, incremented on every node-state transition into `started`.
4. When `nodeExecutionCount > resolvedLimit`, the server:
   - Emits `cap.breached` with `kind: 'node-executions'`, `limit: resolvedLimit`, `observed: nodeExecutionCount`.
   - Transitions the run to `failed`.
   - Sets `RunSnapshot.error.code = 'recursion_limit_exceeded'` and `RunSnapshot.error.message` to a human-readable description.
   - Stops scheduling further nodes.

The other three kinds follow analogous patterns (per `clarification` / `schema` / `envelopes` semantics in §In-package shape above), differing only in *what* gets counted and *which counter* resets when.

### What this closes

- **CC-1**: the `recursionLimit` runtime invariant. The validation half (`validateRecursionLimit()`) shipped 2026-04-26; the runtime half lands here as a unified `cap.breached` emission rather than a separate event class. No `eventLogSchemaVersion` bump required — `cap.breached` already exists with `node-executions` in its `kind` enum (per `run-event-payloads.schema.json` and the `wop.cap_kind` OTel attribute in `observability.md`).
- **CC-4**: `Capabilities.limits.maxNodeExecutions` is now `(stable)`. Default `100`. The clamp ceiling for `recursionLimit` overrides.

### Industry-standard alignment

Modern workflow engines unify limit-related failures under a small set of event types:

- LangGraph: `GraphRecursionError` (single error class).
- Temporal / Cadence: cap exceedance folds under `WorkflowExecutionTimedOut` / `ActivityTaskFailed` with reason discriminator.
- AWS Step Functions: `ExecutionFailed` with `error: "States.Runtime"` covers all runtime caps.

WOP follows the same pattern: `cap.breached` with a `kind` discriminator covers all four engine-enforced caps.

### Conformance fixture

`conformance-cap-breach` (specced in `conformance/fixtures.md`) exercises the path end-to-end: 10 sequential noop nodes + `configurable.recursionLimit: 5` → terminal `failed` + `cap.breached` event with `kind: 'node-executions'`. Once the impl plan owner ships the runtime counter, the fixture lands without spec changes.

---

## Status legend

- **(stable)** — field shape locked. Implementations should support today.
- **(in-flight)** — driven by impl plan PRs (3b.1 and adjacent) currently in development. Shape may shift in compatible ways before WOP v1.0 final. Implementers SHOULD NOT pin to exact field shapes yet.
- **(future)** — deferred to a later spec milestone (v1.x or v2). MAY be omitted from current capability responses.

---

## Capability negotiation flow

A typical client startup:

```
1. Client → GET /.well-known/wop
2. Server → 200 OK, Capabilities JSON
3. Client checks:
   - protocolVersion satisfies my pinned floor?  → if not, abort with version-mismatch UX
   - implementation.version known?               → log advisory if mismatch
   - minClientVersion ≤ my version?              → if not, abort with upgrade-required UX
   - supportedEnvelopes includes envelopes I emit? → if not, narrow my behavior
   - limits compatible with my workload?         → if not, surface to user
4. Client → first protocol request
```

The server MUST NOT change capability response shape mid-session in a way that invalidates a client's prior negotiation. If the server's capabilities change (e.g., new node pack registered), it MAY surface this via a `Capabilities-Etag` response header that clients can probe periodically.

---

## Backward compatibility

Adding new fields to the `Capabilities` shape is non-breaking — clients ignore unknown fields. Removing or renaming fields is breaking and MUST be accompanied by a `protocolVersion` bump.

The status markers (stable/in-flight/future) protect implementers from premature-pinning: an implementer reading this doc today should pin only to **(stable)** fields and consult the impl plan's PR 3b.1 outcomes before shipping support for **(in-flight)** fields.

---

## Open spec gaps

| # | Gap | Owner |
|---|---|---|
| C1 | `Capabilities` TypeScript type is being defined in impl plan PR 3b.1 — re-sync this doc after that PR lands | impl plan |
| C2 | `Capabilities-Etag` header for mid-session capability change detection | future |
| C3 | Capability negotiation handshake for non-HTTP transports (MCP, A2A) | P2-F6 |
| C4 | Vendor extensions namespace (e.g., `vendor.<org>.*`) for adding non-spec fields without conflicting | future |
| C5 | Per-tenant capability scoping (a public key may see fewer capabilities than an admin key on the same server) | future v1.x |

## References

- `version-negotiation.md` — `engineVersion` + `eventLogSchemaVersion` deploy-skew safety
- `auth.md` — `/.well-known/wop` is unauthenticated by design
- `run-options.md` — `configurable` field semantics (forthcoming)
- `observability.md` — `wop.*` OTel taxonomy (forthcoming, partially defined here)
- Reference impl (forthcoming): `packages/workflow-engine/src/protocol/capabilities.ts` (impl plan PR 3b.1)
- WOP plan cross-cuts: CC-1 (`recursionLimit` invariant), CC-3 (`wop.*` taxonomy), CC-4 (`maxNodeExecutions` field)
