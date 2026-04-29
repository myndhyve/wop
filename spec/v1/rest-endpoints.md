# WOP Spec v1 — REST Endpoint Catalog

> **Status: FINAL v1.0 (2026-04-27).** Comprehensive coverage of the canonical REST surface (14 paths) with per-route auth + scope, now formalized in `api/openapi.yaml` against the JSON Schemas in `schemas/`. Replay/fork has shipped at `replay.md` + the `:fork` endpoint. Not yet final: bulk operations and gRPC transport remain in "Open spec gaps". Keywords MUST, SHOULD, MAY follow [RFC 2119](https://www.rfc-editor.org/rfc/rfc2119). See `auth.md` for the status legend.

---

## Scope

This document catalogs the REST surface a WOP-compliant server MUST expose, plus optional surfaces (MCP, A2A) that a server MAY expose. Path templates use `{paramName}` for path parameters.

## Versioning

- All paths under `/v1/` are versioned. Breaking changes go to `/v2/`.
- A server MAY support multiple versions concurrently (`/v1/...` and `/v2/...` side by side) for migration windows.
- Servers MUST return `400 Bad Request` for paths under unversioned roots.

## Required endpoints

Every WOP-compliant server MUST expose:

### Discovery

| Method | Path | Auth | Scope | Purpose |
|---|---|---|---|---|
| `GET` | `/.well-known/wop` | None | None | Capability declaration (see `capabilities.md` — outline) |
| `GET` | `/v1/openapi.json` | None | None | Self-describing OpenAPI spec |

### Workflow manifest

| Method | Path | Auth | Scope | Purpose |
|---|---|---|---|---|
| `GET` | `/v1/workflows/{workflowId}` | API key | `manifest:read` | Workflow definition |

### Runs

| Method | Path | Auth | Scope | Purpose |
|---|---|---|---|---|
| `POST` | `/v1/runs` | API key | `runs:create` | Create a run |
| `GET` | `/v1/runs/{runId}` | API key | `runs:read` | Read run state |
| `GET` | `/v1/runs/{runId}/events` | API key | `runs:read` | SSE event stream (resumable via `Last-Event-ID`) |
| `GET` | `/v1/runs/{runId}/events/poll` | API key | `runs:read` | Long-poll fallback for non-SSE clients |
| `POST` | `/v1/runs/{runId}/cancel` | API key | `runs:cancel` | Cancel an in-flight run |

#### `POST /v1/runs` request

```json
{
  "workflowId": "string (required)",
  "inputs": "object (optional)",
  "tenantId": "string (optional, server-defaults from API key)",
  "scopeId": "string (optional, opaque correlation)",
  "callbackUrl": "string (optional, signed-token HITL callback)",
  "configurable": "object (optional, per-run parameter overlay)",
  "tags": "string[] (optional)",
  "metadata": "object (optional)"
}
```

Headers:
- `Authorization: Bearer <key>` — REQUIRED
- `Idempotency-Key` — RECOMMENDED (see `idempotency.md`)
- `X-Dedup: enforce` — OPTIONAL; when set, server cross-host claim system rejects duplicate (tenantId, scopeId) pairs with `409 Conflict`

#### `POST /v1/runs` response

```json
{
  "runId": "string",
  "status": "pending | running | waiting-approval | ...",
  "eventsUrl": "string (SSE endpoint)",
  "statusUrl": "string"
}
```

Status codes:
- `201 Created` — run accepted
- `400 Bad Request` — malformed body, unknown workflowId, invalid inputs
- `401/403` — auth failures (see `auth.md`)
- `409 Conflict` — `X-Dedup` collision; body `{ error: "run_already_active", activeRunId, activeHost, retryAfter }`; header `Retry-After: <seconds>`
- `429 Too Many Requests` — rate-limit; header `Retry-After: <seconds>`

### HITL (approvals + suspensions)

| Method | Path | Auth | Scope | Purpose |
|---|---|---|---|---|
| `POST` | `/v1/runs/{runId}/approvals/{nodeId}` | API key | `approvals:respond` | Resolve an approval gate |
| `POST` | `/v1/interrupts/{token}` | Signed token | None | Resolve any HITL interrupt via callback URL |
| `GET` | `/v1/interrupts/{token}` | Signed token | None | Inspect an interrupt without resolving |

The signed-token surface (`/v1/interrupts/{token}`) is for asynchronous HITL where the server POSTed a callback URL to an external system at suspension time. Tokens are HMAC-signed by the server with a configurable expiry (recommended default: 30 min). See `interrupt.md` (forthcoming) for token format.

### Artifacts

| Method | Path | Auth | Scope | Purpose |
|---|---|---|---|---|
| `GET` | `/v1/runs/{runId}/artifacts/{artifactId}` | API key | `artifacts:read` | Read a run-produced artifact |

### Webhooks

| Method | Path | Auth | Scope | Purpose |
|---|---|---|---|---|
| `POST` | `/v1/webhooks` | API key | `webhooks:manage` | Register a subscription |
| `DELETE` | `/v1/webhooks/{webhookId}` | API key | `webhooks:manage` | Unregister |

## Optional endpoints (transports)

A WOP-compliant server MAY expose additional transports. If exposed, they MUST follow these contracts:

### Server-Sent Events (SSE)

The `GET /v1/runs/{runId}/events` endpoint MUST:
- Set `Content-Type: text/event-stream`
- Honor `Last-Event-ID` request header to resume from the next sequence after that ID
- Emit a comment line (`:keepalive`) at least every 30 seconds to prevent intermediary timeouts
- Auto-close the connection when the run reaches a terminal status (`completed`, `failed`, `cancelled`)
- Stream events with `id:`, `event:`, `data:` fields per the SSE spec

### MCP (Model Context Protocol)

If exposed, the server MUST mount MCP at `/v1/mcp` (platform) or `/v1/mcp/{namespace}` (namespaced). MCP endpoints follow the MCP spec; this WOP spec does not redefine MCP semantics.

### A2A (Agent-to-Agent)

If exposed, the server MUST mount A2A at `/v1/a2a` (platform) or `/v1/a2a/{namespace}` (namespaced). The agent card is at `/v1/a2a/agent.json`.

## Headers

| Header | Direction | Purpose |
|---|---|---|
| `Authorization` | Request | `Bearer <api-key-or-jwt>` |
| `Idempotency-Key` | Request | Per-mutation idempotency token (see `idempotency.md`) |
| `X-Dedup` | Request | `enforce` to opt into cross-host run-claim deduplication |
| `X-Force-Engine-Version` | Request (test-keys-only) | Forces the run to emit events at the specified engine version. Used by the conformance suite to verify forward-compat fold-best-effort. Servers MUST reject on production keys with `403 force_engine_version_forbidden`. See `version-negotiation.md` + F5 in `conformance/fixtures.md`. |
| `Last-Event-ID` | Request (SSE) | Resume from sequence after this ID |
| `Retry-After` | Response | Seconds to wait before retrying (with 409, 429, 503) |
| `traceparent` / `tracestate` | Both | W3C Trace Context propagation (RECOMMENDED) |

## Error response shape

All error responses (REST surface) MUST be JSON:

```json
{
  "error": "<machine_readable_code>",
  "message": "<human_readable>",
  "details": "object (optional, error-specific)"
}
```

Common error codes:
- `unauthenticated`, `forbidden`, `key_expired`, `key_revoked` — see `auth.md`
- `validation_error` — request body/params malformed; `details` enumerates fields
- `not_found` — resource doesn't exist or caller can't see it (do not leak existence)
- `run_already_active` — `X-Dedup` collision
- `recursion_limit_exceeded` — run terminated due to safety cap
- `rate_limited` — too many requests
- `capability_not_provided` — a node's `requires` declared a runtime capability the host has not registered (G23). The `message` MUST name the missing capability id; `details.capability` SHOULD carry the same id machine-readably. The run terminates `failed` and the offending node MUST NOT execute. See `capabilities.md` §"Runtime capabilities (future)".
- `credential_required` (G22) — a node's `requiresSecrets[]` declared a secret but none was resolved. Either the host's `SecretResolver` returned null/undefined for the requested `(id, scope)` OR `RunOptions.configurable.ai.credentialRef` was missing for a `kind: 'ai-provider'` requirement on a BYOK provider. `message` SHOULD name the missing secret id; `details.requirement` SHOULD carry the full `SecretRequirement` shape.
- `credential_forbidden` (G22) — caller passed `RunOptions.configurable.ai.credentialRef` for a provider NOT in `Capabilities.aiProviders.byok`. The host doesn't permit BYOK for that provider; the caller must omit the credentialRef and let the host route via platform-managed keys. `details.provider` SHOULD carry the offending provider id.
- `credential_unavailable` (G22) — a node declares `requiresSecrets[]` but the host doesn't advertise `Capabilities.secrets.supported = true`. The host fundamentally can't resolve secrets for this run. The run terminates `failed` and the offending node MUST NOT execute. `details.requirement` SHOULD carry the SecretRequirement shape; `details.capability` SHOULD carry `"secrets"` so machine readers can map to the missing capability section.
- `internal_error` — unexpected server failure (no implementation details in `message`)

## Non-normative: pre-WOP host route shapes

> **Non-normative.** This section describes a compatibility pattern, not a normative requirement. WOP-compliant servers SHOULD use the canonical paths above. Hosts whose surfaces predate WOP MAY layer host-private aliases on top of the canonical routes.

Some hosts ship surfaces that predate WOP and use a slightly different shape — for example, scoping by a host-specific concept in the URL path. Those hosts MAY continue serving the legacy paths as aliases that map internally to the spec routes:

- `/v1/<host-scope>/{scopeId}/runs` — adds host-scope filtering in the path. WOP moves such scoping out of the path; servers that want filtering SHOULD use a query parameter (e.g., `?scope=...`) or carry the scope on the workflow definition.
- `/v1/<host-scope>/{scopeId}/manifest` — same shape as above.

The MyndHyve reference host uses this pattern for its existing `/v1/canvas-types/{canvasTypeId}/...` routes — see the host's documentation for the concrete realization.

---

## Open spec gaps

| # | Gap | Owner |
|---|---|---|
| R1 | `POST /v1/runs:fork` (replay/branch from event log) — see `replay.md` (forthcoming) | future |
| R2 | Bulk-cancel and pause/resume endpoints not yet spec'd | future |
| R3 | OpenAPI YAML hand-authored from this catalog | this milestone |
| R4 | Conformance test suite hits each endpoint with positive + negative cases | P2-F4 |

## References

- `auth.md` — authentication + scopes
- `idempotency.md` — `Idempotency-Key` contract
- `capabilities.md` — `/.well-known/wop` (forthcoming)
- `interrupt.md` — HITL + callback token format (forthcoming)
- `replay.md` — fork/replay endpoint (forthcoming)
