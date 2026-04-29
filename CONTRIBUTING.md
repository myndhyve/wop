# Contributing to WOP v1

Thanks for considering a contribution. The WOP spec is small, mechanical, and pre-1.0 — small focused PRs land fastest.

This guide covers:

1. What's in scope.
2. Status legend + when to bump status.
3. Per-artifact change rules (prose specs, JSON Schemas, OpenAPI, AsyncAPI, conformance, SDK).
4. The CI gate.
5. Coordination with the impl plan.

---

## What's in scope

The WOP v1 corpus describes the **wire-level contract** between independent implementations of workflow orchestration servers and the clients that talk to them. It does NOT prescribe:

- Internal data structures (Zustand vs Redux vs raw classes — implementer's call).
- Storage backends (Firestore vs Postgres vs SQLite — implementer's call).
- How LLM prompts are constructed (implementer's call, modulo the `Capabilities` handshake).
- UI conventions (any UI is fine — the spec only defines the wire data).

When a PR proposes adding to one of those surfaces, expect pushback: it likely belongs in an implementation's docs, not the spec.

---

## Status legend

Per `auth.md` §status legend (and reflected in every prose doc's header):

| Tag | Meaning |
|---|---|
| **STUB** | Minimal coverage of stable surfaces only. Implementers SHOULD pin only to what's documented; gaps are expected. |
| **DRAFT** | Comprehensive coverage of stable + in-flight surfaces, but not yet reviewed by spec committee. |
| **OUTLINE** | Sketched but not detailed. Section headings lock; field schemas may shift. |
| **FINAL** | Reviewed + frozen for a given v1.X release. Breaking changes require a major bump. |

When to bump status:

- **STUB → DRAFT**: when every stable wire-level field is documented (RFC 2119 keywords applied, examples present, edge cases called out).
- **DRAFT → OUTLINE**: backward — only when a section needs more design work than originally thought.
- **DRAFT → FINAL**: after committee review (none formally chartered yet — see "Process" below).

---

## Per-artifact change rules

### Prose specs (`*.md`)

- Every doc MUST include a header status block with: status tag, draft date, and a "stable surface for external review" note.
- Use RFC 2119 keywords (MUST, SHOULD, MAY, MUST NOT, SHOULD NOT) consistently.
- Cross-reference companion specs by relative path: `[capabilities.md](./capabilities.md)`, never absolute URLs.
- New surface area: add a "Why this exists" paragraph + an "Open spec gaps" table at the end.

### JSON Schemas (`schemas/*.schema.json`)

- Every schema declares `$schema: "https://json-schema.org/draft/2020-12/schema"`.
- Every schema has a `$id` that's a URL under `https://wop.dev/spec/v1/<name>.schema.json`.
- Use `additionalProperties: false` on every object — explicit field lists are mandatory for spec docs even if a runtime relaxes them.
- New required fields: bump the schema's implicit minor version + update CHANGELOG.md. New optional fields are non-breaking.

### OpenAPI / AsyncAPI

- Reference JSON Schemas via cross-file `$ref` (`../schemas/<name>.schema.json`); never inline.
- Lint must pass: `redocly lint api/openapi.yaml` and `asyncapi validate api/asyncapi.yaml` from `@asyncapi/cli`.
- Bundle must succeed: `redocly bundle api/openapi.yaml` and `asyncapi bundle api/asyncapi.yaml`.
- New endpoints: add a `tag`, an `operationId`, request/response schemas, and at least one error response.

### Conformance suite (`conformance/`)

- Each new scenario file in `conformance/src/scenarios/` follows the existing pattern:
  - Top-of-file docstring stating the spec doc(s) being verified.
  - `describe('category: …', …)` blocks per assertion group.
  - `expect(…, driver.describe('spec.md §section', 'requirement'))` so failure messages cite the requirement.
- New fixtures go in `conformance/fixtures/` AND must be added to `fixtures.md`'s catalog table + per-fixture contracts. The `spec-corpus-validity.test.ts` round-trip test will fail otherwise.
- Server-free scenarios (those not requiring `WOP_BASE_URL`) MUST run in <1s. CI gates on this.

### TypeScript reference SDK (`sdk/typescript/`)

- Every endpoint in `api/openapi.yaml` should map to ONE method on `WopClient`. If you add an endpoint to the spec, add the corresponding SDK method in the same PR.
- Types come from the spec — extend `src/types.ts` rather than redefining shapes inline.
- `tsc --noEmit` must pass with `strict + exactOptionalPropertyTypes`. No `as any`, no `@ts-ignore`.
- Zero runtime dependencies remains a goal. New deps need a stated reason in the PR description.

---

## The CI gate

A WOP-spec PR is mergeable when:

1. `redocly lint api/openapi.yaml` — clean.
2. `asyncapi validate api/asyncapi.yaml` — clean.
3. Every JSON Schema compiles via Ajv2020 (covered by `conformance/src/scenarios/spec-corpus-validity.test.ts`).
4. Every fixture validates against `workflow-definition.schema.json` (covered by `conformance/src/scenarios/fixtures-valid.test.ts`).
5. Every prose doc carries a `Status:` legend tag (covered by `spec-corpus-validity.test.ts`).
6. The TS SDK builds clean (`cd sdk/typescript && tsc --noEmit`).
7. The `wop-conformance --offline` server-free subset passes.
8. `CHANGELOG.md` updated when changing any artifact (1-line entry under `[Unreleased]` is fine).

Run the full local check from the repo root:

```bash
cd conformance && npm run typecheck && npm run test  # tests need WOP_BASE_URL/WOP_API_KEY OR --offline
cd ../sdk/typescript            && npm run typecheck
```

Or via the CLI:

```bash
conformance/dist/cli.js --offline
```

---

## Coordination with reference implementations

The v1.0 protocol contract is **locked**. Reference implementations (including the MyndHyve flagship host) validate themselves against `@wop/conformance` at their own cadence; new conformance scenarios ship as minor releases of the suite (`1.X.0`) against the unchanged v1.0 protocol.

When a spec PR proposes a change that interacts with reference implementations:

- **Cosmetic / additive** (new field, new event type as opt-in, new endpoint): merge spec PR independently. Implementations catch up at their own cadence.
- **Breaking impl assumptions** (schema bump on existing event, new required field, removed field): not allowed against v1.0. File as a v2.0 RFC per `GOVERNANCE.md` §"Spec change process".

---

## Process

See `GOVERNANCE.md` for the full decision-making and spec-change process. Quick reference:

- **PRs**: opened against this repo. Merge bar follows the change-category rules in `GOVERNANCE.md` §"Spec change process" (one approval for editorial / non-normative; two approvals + RFC for normative additions; v2.0 RFC for breaking changes).
- **Issues**: file using the issue templates at `.github/ISSUE_TEMPLATE/`. Bug reports include doc filename, section heading, the RFC 2119 requirement that's unclear or contradictory, and implementation impact.
- **Backwards compat**: the v1.0 contract is locked. Breaking changes ship only as a future v2.0 in parallel.

---

## Useful one-liners

```bash
# Validate every schema compiles + fixtures + spec corpus, all server-free
conformance/dist/cli.js --offline

# Lint OpenAPI
npx -y @redocly/cli@latest lint api/openapi.yaml

# Validate AsyncAPI
npx -y @asyncapi/cli@latest validate api/asyncapi.yaml

# Build TS SDK
(cd sdk/typescript && npm install && npm run build)

# Find every prose doc that's still STUB-tier (candidates for promotion)
grep -l "Status:.*STUB" *.md
```
