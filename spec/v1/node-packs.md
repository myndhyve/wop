# WOP Spec v1 — Node Packs and the Public Registry

> **Status: FINAL v1.0 (2026-04-27).** Comprehensive coverage of the pack manifest format, distribution, signing, and registry HTTP API. Aligned with the reference implementation's `NodeModule` shape (`packages/workflow-engine/src/nodes/defineNode.ts`) but language-neutral. Stable surface for external review. Not yet referenced from a publicly-deployed registry. Keywords MUST, SHOULD, MAY follow [RFC 2119](https://www.rfc-editor.org/rfc/rfc2119). See `auth.md` for the status legend.

---

## Why this exists

Workflows in v1 are written against a fixed set of `core.*` node typeIds. Every implementation re-implements the same nodes (AI prompt calls, approval gates, HTTP fetches) because there's no shared distribution channel. Workflows that depend on a vendor-specific typeId (`vendor.acme.salesforce-upsert`) can't run against an implementation that doesn't ship that node.

WOP defines **node packs** as the unit of distribution. A pack is a self-describing archive containing:

1. A **manifest** declaring the node typeIds, schemas, and engine-version requirements.
2. A **runtime artifact** the engine loads at workflow-registration time (language-specific: a JS bundle, Python wheel, Go plugin, WASM module, or a remote MCP endpoint).
3. Optional **assets** (icons, prompt fragments, doc fragments).

A WOP-compliant **registry** is an HTTP service that hosts published packs and exposes a discovery + fetch API. The reference registry (forthcoming) is at `https://packs.wop.dev/`; deployers MAY operate private registries (the [npm enterprise](https://docs.npmjs.com/about-npm-enterprise) analog).

The pack/registry idiom parallels [npm](https://npmjs.com/) and [Helm chart repositories](https://helm.sh/docs/topics/chart_repository/) — chosen for ecosystem familiarity, not vendor lock-in.

---

## Pack identity

### Naming

Pack names use the reverse-DNS convention enforced by `typeId` patterns elsewhere in the spec (`workflow-definition.schema.json` §typeId):

```
<scope>.<author>.<pack>
```

| Scope | Reservation |
|---|---|
| `core.*` | Reserved for spec-canonical packs maintained by the WOP working group. Third parties MUST NOT publish under this scope. |
| `vendor.<org>.*` | Vendor-published packs. The `<org>` segment is reserved on first-publish; subsequent publishes from a different account return `403 forbidden`. |
| `community.<author>.*` | Hobbyist / individual packs. Lighter reservation; squatting is disputable but enforcement is best-effort. |
| `local.*` | NOT published. Reserved for in-repo / unpublished private packs. Registries MUST refuse `local.*` uploads with `400 invalid_pack_scope`. |

### Reserved Core WOP node typeIds

Within the `core.*` scope, the following typeIds are reserved for workflow primitives that every WOP-compliant server is expected to provide. Authoring source: `docs/PRD-WOP-MYNDHYVE-EXTENSION-LAYER.md` §8.7 Node Pack Model.

| TypeId | Purpose |
|---|---|
| `core.start` | Workflow entry point. |
| `core.end` | Workflow terminal. |
| `core.conditional` | Routing on edge conditions. |
| `core.delay` | Wall-clock pause. |
| `core.loop` | Iteration construct. |
| `core.parallel` | Fan-out / parallel execution. |
| `core.merge` | Fan-in / synchronization point. |
| `core.setVariable` | Write to workflow variables. |
| `core.getVariable` | Read from workflow variables. |
| `core.interrupt` | HITL primitive — see `interrupt.md`. |
| `core.identity` | Echo-input primitive — passes a named input port to an output port unchanged. Used by conformance fixtures to verify input/output passthrough; servers SHOULD ship for v1 conformance. |
| `core.subWorkflow` | Synchronous sub-workflow invocation — parent waits for child terminal. See `conformance/fixtures.md` §`conformance-subworkflow-parent`. |
| `core.channelWrite` | Write a value to a named channel using a typed reducer (v1: `append` only) with optional `ttlMs` filtering. Closes C3 channel-TTL fold. See `channels-and-reducers.md` §append + §TTL and `conformance/fixtures.md` §`conformance-channel-ttl`. |

The naming convention is `core.<conceptName>` — flat camelCase compound for multi-word names. Multi-segment dotted typeIds (e.g., `core.ai.callPrompt`) live in the **portable optional** node-pack tier (`wop.*` / `vendor.*`), not in Core WOP. Implementations MUST register these typeIds before claiming v1 conformance.

### Versioning

Pack versions follow [Semantic Versioning 2.0.0](https://semver.org/) (`MAJOR.MINOR.PATCH[-PRERELEASE][+BUILD]`). Workflow definitions pin pack versions via the same range syntax as npm (`^1.2.3`, `~1.2.0`, `>=1.0.0 <2.0.0`).

A registry MUST return the highest version satisfying the requested range. Prerelease versions are ONLY returned when the range is explicit (`^1.2.3-beta` matches `1.2.3-beta.1` but `^1.2.3` does NOT match prerelease versions per semver's "prerelease versions have lower precedence" rule).

---

## Manifest format

A pack's manifest is a JSON file named `pack.json` at the pack root. Schema: `schemas/node-pack-manifest.schema.json`.

```json
{
  "name": "vendor.acme.salesforce-tools",
  "version": "1.4.2",
  "description": "Salesforce CRM nodes for WOP workflows.",
  "author": "Acme Corp <devs@acme.example>",
  "license": "Apache-2.0",
  "homepage": "https://acme.example/wop/salesforce",
  "repository": "https://github.com/acme/wop-salesforce",
  "engines": {
    "wop": ">=1.0.0 <2.0.0"
  },
  "nodes": [
    {
      "typeId": "vendor.acme.salesforce.upsert",
      "version": "1.4.2",
      "label": "Salesforce Upsert",
      "category": "integration",
      "role": "side-effect",
      "capabilities": ["side-effectful", "mcp-exportable"],
      "configSchemaRef": "schemas/upsert.config.json",
      "inputSchemaRef":  "schemas/upsert.input.json",
      "outputSchemaRef": "schemas/upsert.output.json",
      "requiresSecrets": [
        { "id": "salesforce-oauth", "kind": "oauth-token", "scope": "tenant" }
      ]
    },
    {
      "typeId": "vendor.acme.summarize",
      "version": "1.4.2",
      "label": "AI Summarize",
      "category": "chat",
      "role": "streaming-output",
      "capabilities": ["streamable", "side-effectful", "mcp-exportable"],
      "configSchemaRef": "schemas/summarize.config.json",
      "inputSchemaRef":  "schemas/summarize.input.json",
      "outputSchemaRef": "schemas/summarize.output.json",
      "requiresSecrets": [
        { "id": "anthropic", "kind": "ai-provider", "provider": "anthropic", "scope": "tenant" }
      ]
    }
  ],
  "runtime": {
    "language": "javascript",
    "entry": "dist/index.js",
    "format": "esm"
  },
  "signing": {
    "publicKeyRef": "keys/2026-04.pem",
    "signatureRef": "pack.json.sig"
  }
}
```

### Required fields

| Field | Description |
|---|---|
| `name` | Pack name per §naming. |
| `version` | Semver. |
| `engines.wop` | Semver range — which WOP protocol versions this pack works against. |
| `nodes[]` | Each declared node has `typeId`, `version` (per-node, may differ from pack version), `category`, `role`, schemas. |
| `runtime` | Language + entry-point + format triple. See §runtime formats. |

### Optional fields

`description`, `author`, `license`, `homepage`, `repository`, `keywords[]`, `dependencies` (other packs), `peerDependencies` (engine-supplied capabilities the pack consumes), `signing` (see §signing).

### Per-node `requiresSecrets[]` (G22)

Each `nodes[].requiresSecrets[]` entry declares a secret the node needs at execution time. Hosts that advertise `Capabilities.secrets.supported = true` resolve these via their `SecretResolver` adapter (PRD §11 Phase 2); hosts that don't advertise secrets MUST refuse to dispatch a node with non-empty `requiresSecrets` and return `credential_unavailable`.

```json
"requiresSecrets": [
  { "id": "anthropic", "kind": "ai-provider", "provider": "anthropic", "scope": "tenant" },
  { "id": "salesforce-oauth", "kind": "oauth-token", "scope": "tenant" }
]
```

| Field | Type | Required | Notes |
|---|---|---|---|
| `id` | string | yes | Stable id the executor uses to look up the resolved secret. |
| `kind` | enum | yes | `ai-provider` / `api-key` / `oauth-token` / `custom`. Drives host resolution policy. |
| `provider` | string | iff `kind=ai-provider` | Provider id; MUST be in `Capabilities.aiProviders.supported`. |
| `scope` | enum | no (default `tenant`) | `tenant` / `user` / `run`. MUST match a scope in `Capabilities.secrets.scopes`. |

The host's `SecretResolver.resolveSecret(ctx)` returns an opaque `ResolvedSecret` reference that downstream provider adapters dereference internally. Raw key material NEVER appears in events, logs, traces, prompts, errors, exports, or screenshots — this is enforced by NFR-7 at the host layer.

**Engine semantics.** Before dispatching a node with `requiresSecrets`, the engine MUST:

1. Verify each entry's `kind` and `scope` against `Capabilities.secrets`. Mismatch → terminal `failed` with `error.code = credential_unavailable`.
2. If `kind = 'ai-provider'`, verify `provider` is in `Capabilities.aiProviders.supported` AND (for BYOK runs) that the run's `RunOptions.configurable.ai.credentialRef` references a stored credential of the right provider.
3. Call `SecretResolver.resolveSecret({ id, kind, provider, scope, runId, tenantId, userId })` and pass the opaque ref to the executor via the engine's existing context plumbing.

---

## Runtime formats

The `runtime.language` field declares how the engine loads the pack:

| `language` | `entry` is | Server requirement |
|---|---|---|
| `javascript` | Path to a JS module (CommonJS or ESM) | Engine running in Node 20+ or a JS-compatible WASM host |
| `python` | Path to a Python module / wheel | Python 3.10+ runtime adjacent to the engine |
| `go` | Path to a Go plugin (`.so`) or compiled binary | Go 1.22+ runtime; plugin support varies by platform |
| `wasm` | Path to a `.wasm` file with a defined ABI (forthcoming) | Any host with a WASM runtime |
| `remote` | URL to an HTTP endpoint conforming to the MCP tool surface | Engine acts as MCP client; pack runs anywhere reachable |

A registry MAY refuse uploads of any `language` it doesn't support. A workflow-engine implementation MAY refuse to load packs whose `language` it can't execute, returning `400 unsupported_runtime` at workflow-register time.

For cross-language interop (a JavaScript engine loading a Python pack), the `remote` runtime is the recommended bridge — the engine speaks MCP to the pack process running in its native runtime.

---

## Distribution

### Pack archive

A pack is distributed as a `.tgz` (gzipped tarball) with the following layout:

```
pack.json
README.md                  (recommended — surfaces in registry UI)
schemas/                   (JSON Schemas referenced from pack.json `*SchemaRef`)
dist/                      (runtime artifact; path matches `runtime.entry`)
keys/<key-id>.pem          (signing public key, when present)
pack.json.sig              (detached signature over pack.json)
```

The tarball MUST NOT include build artifacts beyond `dist/`, lockfiles, `.git`, `node_modules`, or any other path matched by an opt-out `.wopignore` (mirrors npm's `.npmignore`).

### Content addressing

Each published pack MUST have a content-addressable identifier — a SHA-256 hash of the tarball — exposed by the registry as `tarballSha256`. Workflow definitions MAY pin this hash for supply-chain integrity:

```json
{
  "engines": { "wop": "^1.0.0" },
  "packs": {
    "vendor.acme.salesforce-tools": {
      "version": "1.4.2",
      "integrity": "sha256-Z1OcMeAwT/zYMyN9z/eFoy0e0xUDCcG2rh7Yd6hmvqM="
    }
  }
}
```

Engines MUST verify the hash before loading a pack; mismatch results in `400 pack_integrity_failure`.

### Signing

Packs MAY be signed with [Sigstore](https://www.sigstore.dev/) or a manual public-key signature.

For manual signatures, `pack.json.sig` is an Ed25519 signature over `pack.json` using the key at `keys/<key-id>.pem` (declared in `signing.publicKeyRef`). The registry MAY enforce signature presence on `vendor.<org>.*` namespaces; signature verification is the engine's responsibility at load time.

For Sigstore signatures, `pack.json.sigstore` is a Sigstore bundle. Verification follows [Sigstore client spec](https://docs.sigstore.dev/cosign/verifying/verify/).

A registry MUST surface the verification status in its discovery API so consumers can decide policy (deny on unsigned, prefer Sigstore over manual, etc.).

---

## Registry HTTP API

A WOP-compliant registry MUST expose the following endpoints. All paths are relative to a registry base URL (e.g., `https://packs.wop.dev/v1/`).

### `GET /v1/packs/{name}`

Discovery — returns metadata about a pack including all published versions, latest version, and download URLs.

```json
{
  "name": "vendor.acme.salesforce-tools",
  "description": "Salesforce CRM nodes for WOP workflows.",
  "versions": {
    "1.4.2": {
      "tarballUrl": "https://packs.wop.dev/v1/packs/vendor.acme.salesforce-tools/-/1.4.2.tgz",
      "tarballSha256": "sha256-...",
      "manifestUrl": "https://packs.wop.dev/v1/packs/vendor.acme.salesforce-tools/-/1.4.2.json",
      "publishedAt": "2026-04-26T12:34:56Z",
      "signed": true,
      "signingMethod": "sigstore"
    }
  },
  "dist-tags": { "latest": "1.4.2" }
}
```

### `GET /v1/packs/{name}/-/{version}.tgz`

Fetch the pack tarball. Response MUST include `Content-Type: application/tar+gzip`, `Content-Length`, and `ETag: "sha256-..."` matching the manifest's `tarballSha256`.

### `GET /v1/packs/{name}/-/{version}.json`

Fetch the pack manifest WITHOUT the runtime payload. Useful for introspection without triggering a full download.

### `PUT /v1/packs/{name}/-/{version}.tgz`

Publish a new version. Body is the gzipped tarball. Auth via API key + `packs:publish` scope. Returns `201 Created` on success or `409 Conflict` if `(name, version)` already exists.

Headers:
- `Authorization: Bearer <api-key>`
- `X-Pack-Signing-Method: sigstore | manual | none`
- `X-Pack-Sha256: sha256-<base64>` (caller-asserted; server verifies)

Errors:
- `400 invalid_pack_scope` — name doesn't match `core.*` / `vendor.*` / `community.*`.
- `400 pack_integrity_failure` — server-computed SHA-256 doesn't match `X-Pack-Sha256`.
- `400 unsupported_runtime` — `runtime.language` value not accepted by this registry.
- `403 forbidden` — caller lacks the namespace claim.
- `409 conflict` — version already published (semver pinning is immutable per npm convention). Reference impl emits the more descriptive `version_conflict` body code; either form is spec-allowed.

### `DELETE /v1/packs/{name}/-/{version}`

Unpublish — registries SHOULD refuse this for versions older than 72 hours (npm's left-pad lesson). Auth via API key + `packs:publish` scope.

**Errors:**
- `400 unpublish_window_expired` — version is older than the registry's unpublish window (default 72h). Use the yank flow instead (`POST /v1/packs/{name}/-/{version}/yank`) for security incidents.
- `403 forbidden` — caller lacks `packs:publish` scope.
- `404 not_found` — version doesn't exist.

### `GET /v1/packs/-/search?q=<term>`

Full-text search across name + description + keywords. Returns paginated results.

---

## Trust model

A pack's trustworthiness is the consumer's call. The spec defines the wire shapes; deployment policy decides what to actually load.

A workflow-engine implementation SHOULD support a layered policy:

1. **Allowlist mode** — only load packs from a configured list (no registry calls).
2. **Pinned mode** — load any pack whose `(name, version, integrity)` matches an entry in the workflow definition's `packs` map.
3. **Verified mode** — load packs whose signing verification succeeds; refuse unsigned.
4. **Open mode** — load any pack the workflow references (development / sandbox only).

A registry SHOULD record provenance: who published which version when, and from what build environment. Consumers can audit before adopting a vendor's pack.

---

## Engine integration

A WOP-compliant engine MUST:

1. Resolve all packs declared in a workflow's `packs` map at workflow-register time, before executing any nodes.
2. Verify integrity (`tarballSha256`) and signature (when `signing` is present).
3. Surface load failures as `400 pack_load_failure` on the workflow-register response — not as a node-runtime failure.

A workflow that references a typeId not provided by any registered pack MUST be rejected at workflow-register time, NOT at run time. Catching this at register is the difference between "this workflow is broken" (engineer can fix) and "this run is broken" (user sees runtime failure).

---

## Open spec gaps

| # | Gap | Owner |
|---|---|---|
| NP1 | WASM ABI for `language: wasm` packs — needs a stable function-signature contract. | future v1.x |
| NP2 | Pack-level `dependencies` resolution (transitive packs) — currently underspecified. | future v1.x |
| NP3 | Mirror / federation between registries (npm-style upstream-fallback). | future |
| ~~NP4~~ | ~~Pack deprecation flow~~ — closed by `registry-operations.md` §"Deprecation flow" (2026-04-29). | ✅ closed |
| ~~NP5~~ | ~~Signing key rotation~~ — closed by `registry-operations.md` §"Signing-key rotation flow" (2026-04-29). | ✅ closed |

## References

- `auth.md` — the `packs:publish` scope used by the publish endpoint.
- `rest-endpoints.md` — error envelope shape.
- `version-negotiation.md` — `engines.wop` semver range semantics.
- `schemas/node-pack-manifest.schema.json` — canonical manifest JSON Schema.
- npm registry API: <https://docs.npmjs.com/cli/v10/configuring-npm/package-json> (idiom source — not a normative dependency).
- Sigstore: <https://www.sigstore.dev/> (signing reference).
- Reference registry: forthcoming at `https://packs.wop.dev/`.
