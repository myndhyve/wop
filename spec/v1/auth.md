# WOP Spec v1 — Authentication and Authorization

> **Status: FINAL v1.0 (2026-04-27).** Comprehensive coverage of the bearer-token auth model, scope vocabulary, and the canonical 401/403 error envelope (now backed by `schemas/error-envelope.schema.json` per JS5). Not yet final: OAuth 2.0, mTLS, key rotation, and webhook HMAC remain in "Open spec gaps" — but the stable surface (API key + scopes + error envelope) is comprehensive enough for SDK + conformance authoring. Keywords MUST, SHOULD, MAY follow [RFC 2119](https://www.rfc-editor.org/rfc/rfc2119).
>
> **Status legend** (used across all spec/v1/*.md):
> - **STUB** — minimal coverage, only stable surfaces. Implementers SHOULD pin only to what's written; assume gaps.
> - **DRAFT** — comprehensive coverage of stable + in-flight surfaces, but not yet reviewed by spec committee.
> - **OUTLINE** — sketched but not detailed. Section headings lock; field schemas may shift.
> - **FINAL** — frozen. Breaking changes go to v2.

---

## Scope

This document specifies how WOP-compliant servers authenticate and authorize callers of the protocol's wire-level surfaces (REST, MCP, A2A, SSE). It does NOT prescribe identity-provider semantics; an implementation MAY use any identity provider (Firebase Auth, OAuth 2.0, mTLS, etc.) for human callers, and MUST use the API-key surface defined here for machine callers.

## Authentication models

A WOP-compliant server MUST support **at least one** of the following authentication models. It MAY support multiple in parallel.

### 1. API keys (machine callers)

REQUIRED for any server that exposes the WOP wire surface to non-human callers.

- The server MUST accept the API key in the `Authorization` HTTP header using the `Bearer` scheme: `Authorization: Bearer <key>`.
- The server MUST reject requests missing or malformed `Authorization` headers with HTTP `401 Unauthorized`.
- The server MUST validate the key against persisted records and reject unknown, revoked, or expired keys with HTTP `401 Unauthorized`.
- The server MUST verify the key carries the scope required for the requested operation (see "Scopes" below) and reject scope-insufficient requests with HTTP `403 Forbidden`.
- API keys MUST be stored hashed at rest; comparison MUST use a constant-time function (e.g., bcrypt). Plaintext storage is FORBIDDEN.

#### Key format

The spec does not prescribe the visible prefix; reference implementations are encouraged to use a short, recognizable prefix that distinguishes:
- Live keys from sandbox/test keys (e.g., `live_` vs `test_`)
- The implementation's own keys from those of other systems (e.g., a vendor identifier)

Example (the MyndHyve reference host): two-prefix scheme distinguishing live and sandbox keys, bcrypt-hashed, stored under a host-private collection. Other hosts MAY use any scheme they prefer.

#### Scopes

A WOP-compliant server MUST support the following scope vocabulary at minimum:

| Scope | Allows |
|---|---|
| `manifest:read` | Read workflow / canvas-type / endpoint manifests |
| `runs:create` | Create new runs |
| `runs:read` | Read run state and event stream |
| `runs:cancel` | Cancel an in-flight run |
| `artifacts:read` | Read artifacts produced by runs |
| `webhooks:manage` | Register/unregister webhook subscriptions |
| `approvals:respond` | Respond to HITL approval gates |
| `packs:publish` | Publish new versions of node-packs to the registry (see `registry-operations.md`) |
| `packs:yank` | Mark a published node-pack version yanked (advisory; existing pins keep resolving) |
| `packs:yank-revert` | Reinstate a yanked node-pack version (super-admin) |

A server MAY define additional scopes for non-protocol surfaces (e.g., `canvas-types:list`, `projects:list` for platform-level keys). Such extensions MUST NOT shadow the names above.

A key MAY hold any subset of scopes. The server MUST enforce scope checks at the endpoint level, not at the resource level — i.e., `runs:cancel` does not imply `runs:read`.

### 2. User-bearer tokens (human callers)

OPTIONAL. Servers that expose admin/management surfaces (CLIs, dashboards) typically accept user-bearer tokens issued by an identity provider.

- The server MUST validate the token against the issuing provider before authorizing any operation.
- User tokens MAY map to a richer permission model than API keys (e.g., role-based access control over multiple scope dimensions).
- User tokens MUST NOT bypass workspace/tenant isolation.

Reference implementation: Firebase Auth ID tokens, validated via the Firebase Admin SDK; mapped to a `users/{uid}` document carrying workspace memberships and role flags.

## Authorization

Beyond scope checks on API keys, a WOP-compliant server MUST enforce:

1. **Tenant isolation.** A caller authenticated for tenant A MUST NOT be able to read or mutate any resource scoped to tenant B. The server MUST verify resource-tenant binding inside the same transaction or query that fetches the resource. (See `idempotency.md` for the run-claim transactional check.)

2. **Scope-resource match.** Even if a key carries `runs:read`, the server MUST verify that the specific run the caller is requesting belongs to a tenant the key is authorized for.

3. **Test-mode segregation.** If the server distinguishes live and test keys (recommended), it MUST NOT permit a test key to read or mutate live data, and vice versa. Resources created by test keys MUST be marked as such.

## Error response shape

Auth failures use the standard JSON-RPC 2.0 error shape on JSON-RPC transports, and the following on REST:

```json
{
  "error": "<short_code>",
  "message": "<human-readable>",
  "scopeRequired": "<scope>"  // present on 403 only
}
```

Codes:
- `unauthenticated` (401) — no credential or invalid credential
- `forbidden` (403) — credential valid but lacks required scope or fails resource binding
- `key_expired` (401)
- `key_revoked` (401)

## Rate limiting

A WOP-compliant server SHOULD apply per-key rate limits and SHOULD return:

- HTTP `429 Too Many Requests`
- `Retry-After` header (seconds)
- Body: `{ window, limit, current, retryAfterSeconds }`

Rate-limit decisions MUST be made before scope checks (so a flooded key can be throttled even on endpoints it lacks scope for).

## Audit

A WOP-compliant server SHOULD log every authenticated request with at minimum: keyId, scope used, request method+path, timestamp, response status, latency. Logs MUST NOT include the API key value or any credential material.

---

## Open spec gaps

| # | Gap | Owner |
|---|---|---|
| A1 | OAuth 2.0 client-credentials flow not yet specified — currently API keys only | future v1.x |
| A2 | mTLS auth not yet specified | future v2 |
| A3 | API key rotation/grace-period semantics not specified | future v1.x |
| A4 | Webhook signature verification (HMAC) is implementation-defined; spec needs a canonical algorithm + header name | future v1.x — partly drafted in `webhooks.md` (TBD) |

## References

- `idempotency.md` — idempotency contract for mutating operations
- `rest-endpoints.md` — endpoint catalog with per-route scope requirements
