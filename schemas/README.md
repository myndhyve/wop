# WOP Spec v1 — JSON Schemas

> **Status: DRAFT v0.2 (2026-04-26).** Hand-authored from prose specs. JSON Schema 2020-12. Validate with Ajv2020 (`require('ajv/dist/2020')`), `python-jsonschema`, or any other 2020-12 implementation. Implementations MAY pin to these schemas; servers MUST accept any JSON document that validates against them.

| Schema | Source spec | Coverage |
|---|---|---|
| `run-event.schema.json` | `version-negotiation.md` + `RunEventDoc` in `packages/workflow-engine/src/protocol/RunEvent.ts` | Event log envelope + 38 `RunEventType` variants |
| `suspend-request.schema.json` | `interrupt.md` | `InterruptPayload` with 4 `kind` discriminators (approval, clarification, external-event, custom) |
| `workflow-definition.schema.json` | `WorkflowDefinition` in `src/core/workflow/types/index.ts` | DAG of nodes + edges + triggers + variables + channels (from `channels-and-reducers.md`) |
| `error-envelope.schema.json` | `rest-endpoints.md` + `auth.md` | Canonical `{error, message, details?}` shape returned on every non-2xx |
| `capabilities.schema.json` | `capabilities.md` | `/.well-known/wop` response — protocolVersion + supportedEnvelopes + schemaVersions + limits + `(future)` superset |
| `run-snapshot.schema.json` | `rest-endpoints.md` §RunSnapshot | Projected run state from `GET /v1/runs/{runId}` |
| `run-options.schema.json` | `run-options.md` | Per-run input overlay (configurable + tags + metadata) on `POST /v1/runs` |
| `channel-written-payload.schema.json` | `channels-and-reducers.md` §Channel write event | Payload of the `channel.written` RunEvent — write input + reducer name |
| `run-event-payloads.schema.json` | `run-event.schema.json` §RunEventType (38 variants) | Per-RunEventType payload contracts, indexed by `$defs.<typeId>` for opt-in strict validation |
| `node-pack-manifest.schema.json` | `node-packs.md` | Pack manifest (`pack.json`) — name, version, engines, nodes[], runtime, signing |

## Validating against the schemas

### TypeScript / Node

```typescript
import Ajv2020 from 'ajv/dist/2020';
import addFormats from 'ajv-formats';
import schema from './run-event.schema.json';

const ajv = new Ajv2020({ allErrors: true, strict: false });
addFormats(ajv);
const validate = ajv.compile(schema);

if (!validate(myEvent)) {
  console.error(validate.errors);
}
```

### Python

```python
import json
import jsonschema

schema = json.load(open('run-event.schema.json'))
jsonschema.validate(my_event, schema)  # raises ValidationError on failure
```

## Cross-reference

- **Conformance test suite (P2-F4)** — black-box tests that fixture-validate against these schemas.
- **Reference SDKs (P2-F3)** — generate types via `quicktype` or `json-schema-to-typescript`.
- **OpenAPI 3.1 YAML (forthcoming)** — references these schemas via `$ref` instead of inlining.

## Open gaps

| # | Gap | Owner |
|---|---|---|
| JS1 | Per-`RunEventType` payload schemas — done (2026-04-26: `run-event-payloads.schema.json` covers all 38 variants in ~15 shape families). Top-level `run-event.schema.json` `payload` stays permissive for forward-compat; consumers MAY pin strict validation via `$defs.<typeId>`. | ✅ |
| JS2 | `Capabilities` schema — done (2026-04-26: `capabilities.schema.json` lifted from `Capabilities.ts`) | ✅ |
| JS3 | `RunOptions` schema (configurable + tags + metadata) — done (2026-04-26: `run-options.schema.json` lifted from `run-options.md`) | ✅ |
| JS4 | Channel-write event payload schema — done (2026-04-26: `channel-written-payload.schema.json` lifted from channels-and-reducers.md §Channel write event) | ✅ |
| JS5 | Error-envelope schema — done (2026-04-26: `error-envelope.schema.json` hoisted from inline OpenAPI) | ✅ |
| JS6 | `RunSnapshot` schema — done (2026-04-26: `run-snapshot.schema.json` hoisted from inline OpenAPI) | ✅ |

## Versioning

Schemas are versioned via `$id` URL (`/spec/v1/`). Breaking changes go to `/spec/v2/`. Non-breaking additions stay on v1 with `$comment` notes documenting added fields.
