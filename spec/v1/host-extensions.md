# WOP Spec v1 — Host Extensions

> **Status: DRAFT v1.1 (2026-05-01).** Distinguishes the protocol's normative core from host-specific extensions. This document is the canonical reference cited from any spec doc that mentions a vendor-prefixed namespace (e.g., `myndhyve.*`). See `auth.md` for the status legend.

---

## Why this exists

A host implementing WOP often needs to expose product-specific concepts that aren't part of the protocol — workspaces, projects, canvases, custom node types, vendor analytics. The spec mentions some of these in passing (e.g., `myndhyve.canvasTypeId` in the `metadata` field of `POST /v1/runs`).

External implementers reading the spec need to know **which fields are normative** (every conforming host MUST honor them) **vs which are host-specific** (a host MAY add them; clients MUST tolerate their absence).

This document is the answer.

---

## The rule

Any field, event type, span name, or capability that doesn't match one of the canonical prefixes below is a **host extension**. Hosts MAY add them. Clients MUST tolerate them being missing or unrecognized.

### Canonical prefixes (protocol-owned)

| Prefix | Owner | Examples |
|---|---|---|
| `wop.*` | Protocol | `wop.run_id`, `wop.node.<typeId>`, `wop.event.append` |
| `core.*` | Protocol | `core.noop`, `core.delay`, `core.ai.callPrompt` (in node-pack scope) |
| `community.*` | Public registry | `community.john.image-tools` (per `node-packs.md` §Naming) |
| `vendor.<org>.*` | Public registry, org-authorized | `vendor.acme.search-tools` |
| `private.<host>.*` | Host-internal pack registry | `private.myndhyve.canvas-tools` (per `myndhyve/wop@0f2f7ff`) |
| `local.*` | In-repo / dev-time / unpublished packs | `local.dev-test` |

### Vendor-prefixed namespaces (host extensions)

A host MAY use any vendor-prefixed namespace for fields not covered above. Recommended convention: use the vendor's reverse-DNS or short identifier as the prefix.

| Prefix | Used by | Notes |
|---|---|---|
| `myndhyve.*` | MyndHyve flagship reference host | Workspace, project, canvas, persona, brand, etc. |
| `<your-vendor>.*` | Your host | Anything WOP doesn't define |

A client receiving an unknown vendor-prefixed field MUST treat it as opaque. Hosts MUST NOT depend on clients understanding their extension namespace.

---

## What stays in the protocol

WOP normatively owns:

| Concept | Spec doc |
|---|---|
| Workflow definitions | `rest-endpoints.md`, `schemas/workflow-definition.schema.json` |
| Run lifecycle (create / get / cancel / fork / interrupt) | `rest-endpoints.md` |
| Run events (closed event-name vocabulary) | `observability.md` §"Canonical run lifecycle event names" |
| Stream modes (SSE + polling) | `stream-modes.md` |
| Interrupts (HITL approval + clarification) | `interrupt.md` |
| Idempotency (Layer 1 + Layer 2) | `idempotency.md` |
| Version negotiation | `version-negotiation.md` |
| Capability discovery | `capabilities.md` |
| Node-pack manifest shape | `node-packs.md` |
| Compatibility profiles (derived from capabilities) | `profiles.md` |
| Scale profiles | `scale-profiles.md` |
| Conformance contracts | the `@myndhyve/wop-conformance` suite |

Anything else is a host concern.

---

## What hosts own

A host owns:

- **Authentication.** WOP defines the bearer-token error envelope; how the token is provisioned, rotated, scoped, etc., is a host concern.
- **Authorization.** WOP doesn't define RBAC. Hosts wire their own per-resource permissions.
- **Tenant / workspace / project scoping.** WOP receives `metadata` with whatever scoping fields the host needs; the protocol only requires that runs are isolated per the host's documented scoping rules.
- **Storage adapters.** The host's choice of database, key-value store, blob storage, vector index. WOP defines the `RunEventLogIO` and `SuspendIO` interfaces (see `storage-adapters.md`); how a host implements them is local.
- **Secret resolution.** Hosts that advertise `capabilities.secrets.supported: true` MUST follow the credential-reference contract; how secrets are stored (KMS, Vault, env vars) is a host choice.
- **Billing / quotas.** WOP doesn't bill. Hosts apply their own billing per workspace/tenant.
- **Audit / observability sinks.** Hosts wire their own log shipping, metrics export, OTel collectors.
- **Product-specific UI.** WOP doesn't ship UI. Hosts build whatever UI fits their product.
- **Domain extensions.** Workspace, project, canvas, persona, brand, knowledge base, agent personas — these are MyndHyve-specific concepts. Other hosts may have entirely different domain models.

The MyndHyve flagship host's domain extensions live in the MyndHyve repo, not in this spec corpus.

---

## How extensions appear on the wire

### Run metadata

`POST /v1/runs` accepts a `metadata` object. WOP doesn't constrain its shape beyond "MUST be a JSON object." Hosts use it for vendor-prefixed fields:

```json
{
  "workflowId": "conformance-noop",
  "metadata": {
    "myndhyve.canvasTypeId": "campaign-studio",
    "myndhyve.canvasId": "doc_abc123",
    "myndhyve.projectId": "proj_xyz"
  }
}
```

A WOP-conforming host MUST NOT reject the request because it doesn't recognize the `myndhyve.*` fields. A host MAY ignore them entirely. The MyndHyve reference host honors them; other hosts pass them through.

### Discovery payload extensions

`/.well-known/wop` returns an object. Hosts MAY add vendor-prefixed top-level fields:

```json
{
  "protocolVersion": "1.0.0",
  "supportedEnvelopes": [...],
  "myndhyve": {
    "workspaceId": "ws_default",
    "billingTier": "production"
  }
}
```

Per `capabilities.schema.json`, `additionalProperties: true` makes this additive. Clients MUST ignore unrecognized top-level fields.

### Run snapshot extensions

`GET /v1/runs/{runId}` returns a `RunSnapshot`. The schema's `additionalProperties: true` allows host fields. Conventional pattern:

```json
{
  "runId": "run-...",
  "workflowId": "...",
  "status": "completed",
  "myndhyve": {
    "workspaceRole": "editor",
    "auditUrl": "..."
  }
}
```

### Event payloads

Run events have a `data` field that's free-form. Hosts MAY include vendor-prefixed sub-fields. Clients MUST ignore unrecognized event types entirely (per `observability.md` §"Forward-compat").

### Span attributes

Span attributes outside the `wop.*` namespace are host extensions. The OTel allowlist enforced by the host's redaction harness covers `wop.*` plus any vendor-prefixed attributes the host has explicitly allowlisted.

---

## What hosts MUST NOT do

- **MUST NOT redefine `wop.*` semantics.** A host that emits `wop.run.completed` with a non-canonical payload shape is non-conformant. Hosts wanting different semantics use a vendor-prefixed event type.
- **MUST NOT add fields under `core.*` or other registry-reserved scopes.** These are protocol-managed namespaces.
- **MUST NOT make the protocol's normative requirements optional via extension.** A host that advertises `wop-secrets` but doesn't honor `credentialRef` redaction is non-conformant regardless of any extension fields.
- **MUST NOT depend on clients honoring host-extension fields.** Host extensions are opaque to clients by default.

---

## Extension lifecycle

A host extension MAY be:

1. **Promoted to the protocol** via an RFC per `RFCS/0001-rfc-process.md`, if multiple hosts converge on the same extension shape and an external implementer would benefit from a normative definition.
2. **Deprecated** in favor of a different extension or a protocol field. Hosts SHOULD document deprecation per `COMPATIBILITY.md` §7.
3. **Replaced** by a different vendor-prefixed namespace. The host updates its docs; clients pin to the new prefix.

Extension promotion is rare. Most host extensions stay host-specific forever; that's fine.

---

## See also

- `spec/v1/capabilities.md` §"Network-handshake superset" — fields tagged `(future)` are protocol-managed; fields outside that table are host extensions.
- `spec/v1/positioning.md` — what's in the protocol vs what's in adjacent ecosystems.
- `spec/v1/node-packs.md` §"Naming" — pack-name scope conventions.
- `RFCS/0001-rfc-process.md` — RFC mechanism for promoting an extension to the protocol.
- `COMPATIBILITY.md` — additive-change discipline that gates extension stability.
