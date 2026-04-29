# WOP Spec v1 — Observability and OpenTelemetry Taxonomy

> **Status: FINAL v1.0 (2026-04-27).** Comprehensive coverage of the canonical `wop.*` attribute namespace, span naming conventions, and metric kinds. Stable surface for external review. Keywords MUST, SHOULD, MAY follow [RFC 2119](https://www.rfc-editor.org/rfc/rfc2119). See `auth.md` for the status legend.

---

## Why this exists

External implementers and operators need a shared vocabulary for tracing and metrics so that:

1. Dashboards built against one WOP server work against another.
2. SDKs can correlate client-side spans with server-side spans without per-vendor mapping tables.
3. Conformance tests can verify "the server emits a span named `wop.node.<typeId>` with attribute `wop.node_id`" without ambiguity.

WOP defines the canonical `wop.*` attribute namespace. Implementations MAY alias to vendor-specific taxonomies (e.g., `langgraph.*` for LangSmith integration, `dd.*` for Datadog) per deployment, but **the spec does not prescribe a mapping**. Vendor bridges are the deployer's responsibility.

---

## Trace context propagation

A WOP-compliant server MUST honor and emit [W3C Trace Context](https://www.w3.org/TR/trace-context/) headers on every HTTP request and SSE event:

| Header | Direction | Purpose |
|---|---|---|
| `traceparent` | Both | Standard W3C trace + span ID + sampled flag |
| `tracestate` | Both | Vendor-specific trace state (opaque to WOP) |

Servers SHOULD propagate `traceparent` through the engine into:
- Every NodeModule execution span
- Every external API call (AI providers, webhooks)
- Every event log append (so durable events carry the originating trace)

Clients SHOULD include `traceparent` on outbound requests so server-side spans nest under the client's parent span.

---

## Span attributes

A WOP-compliant server emitting OTel spans for engine activity MUST use the following canonical attributes. Implementations MAY add their own attributes outside the `wop.*` namespace; the spec only constrains what's inside it.

### Run-level attributes

Set on every span emitted during a run's lifecycle:

| Attribute | Type | Required | Notes |
|---|---|---|---|
| `wop.run_id` | string | MUST | Run ID (e.g., `run_abc123`) |
| `wop.workflow_id` | string | MUST | Workflow ID the run is executing |
| `wop.protocol_version` | string | SHOULD | Server's WOP protocol version |
| `wop.tenant_id` | string | MAY | Tenant/workspace scoping (if applicable) |
| `wop.scope_id` | string | MAY | Project/scope correlation (if applicable) |

### Node-level attributes

Set on spans scoped to a single node execution:

| Attribute | Type | Required | Notes |
|---|---|---|---|
| `wop.node_id` | string | MUST | Node ID within the workflow |
| `wop.node_type` | string | MUST | Node typeId (e.g., `core.ai.callPrompt`) |
| `wop.node_attempt` | number | MUST | Zero-based retry counter |
| `wop.event_seq` | number | SHOULD | Sequence number of the most recent event for this node |

### Event-level attributes

Set on spans that emit a specific event:

| Attribute | Type | Required | Notes |
|---|---|---|---|
| `wop.event_type` | string | MUST | Event type (e.g., `node.completed`, `approval.received`) |
| `wop.event_seq` | number | MUST | Sequence number assigned on append |

### HITL attributes

Set on spans involving human-in-the-loop suspensions:

| Attribute | Type | Required | Notes |
|---|---|---|---|
| `wop.interrupt_kind` | string | MUST | One of `approval`, `clarification`, `external-event`, `custom` |
| `wop.interrupt_id` | string | MUST | Suspension ID |
| `wop.interrupt_count` | number | SHOULD | Per-(run, node) counter for replay determinism |

### Capability-limit attributes

Set on spans where a `CapabilityLimitExceededError` was thrown:

| Attribute | Type | Required | Notes |
|---|---|---|---|
| `wop.cap_kind` | string | MUST | One of `clarification`, `schema`, `envelopes`, `node-executions` |
| `wop.cap_limit` | number | MUST | The limit value |
| `wop.cap_observed` | number | MUST | The observed value when the limit fired |

### Replay / branch attributes

Set on the `wop.run` span of a run created via `POST /v1/runs/{runId}:fork`:

| Attribute | Type | Required | Notes |
|---|---|---|---|
| `wop.replay.source_run_id` | string | MUST | RunId of the run this fork was derived from. |
| `wop.replay.from_seq` | number | MUST | Sequence number we forked at (inclusive — events `< from_seq` are fixed history). |
| `wop.replay.mode` | string | MUST | `replay` (re-execute exactly) or `branch` (re-execute with `runOptionsOverlay`). |

**Span linkage:** the forked run's `wop.run` span MUST carry an OTel `Link` to the source run's `wop.run` span (via the source's traceId + spanId). This is the OTel-canonical way to express "this new trace was derived from that other trace without a parent-child causal relationship" — replays are NOT causal children of the original (the user's `:fork` request causes them, not the original run). Trace viewers (Honeycomb, Tempo, Jaeger) render the Link natively.

Operators can answer questions like "show me all replay-mode forks of run X" or "show me runs that diverged at sequence > 100" by aggregating on the three `wop.replay.*` attributes — no trace-graph query required.

### Privacy classification attributes (closes O5)

Set on spans / events / metric records carrying potentially sensitive data, so observability collectors can apply the deployer's policy (retention, masking, export gating) before forwarding to long-term storage.

| Attribute | Type | Required | Notes |
|---|---|---|---|
| `wop.pii_present` | boolean | SHOULD | Computed aggregate. `true` when ANY input, output, variable, channel write, or activity payload on this span / event has a sensitivity marker (per `Privacy classification` §below). Servers SHOULD set on every span where the answer is determinable; MAY omit when uncertain. |
| `wop.compliance_class` | string | SHOULD | Top-level workflow classification from `WorkflowMetadata.complianceClass`. One of `public`, `pii`, `phi`, `pci`, `regulated`. Single string per run — applies to ALL spans the run produces. |
| `wop.sensitive_fields` | string[] | MAY | Names of sensitive fields touched by this span (e.g., `["variables.userEmail", "channels.feedback"]`). Useful for fine-grained audit; high cardinality so collectors typically drop in aggregation. |

**Aggregate computation rules** for `wop.pii_present`:

- The engine MUST set `wop.pii_present: true` on the `wop.run` span when the workflow declares `metadata.complianceClass !== 'public'` OR any `variable.sensitive`, `channel.sensitive`, or pack-level `node.outputs[port].sensitive` is `true`.
- On `wop.node.<typeId>` spans: `true` when the node consumes from OR writes to a sensitive variable / channel / output port.
- On `wop.activity.<provider>` spans: `true` when the activity payload contains a sensitive field (e.g., a `userEmail` flowing into an LLM call).

**Compliance class semantics:**

| Class | Meaning | Typical retention |
|---|---|---|
| `public` | No sensitivity; default. Trace data may be retained indefinitely. | Per deployer's standard policy. |
| `pii` | Personal data per GDPR/CCPA scope (names, emails, behavioral data). | Shorter retention; right-to-erasure tooling MUST be aware. |
| `phi` | Protected Health Information per HIPAA. | Encrypted at rest; access-logged. |
| `pci` | Payment card data per PCI DSS. | Tokenized; raw values MUST NOT appear in observability. |
| `regulated` | Other regulated categories the deployer manages (export-controlled, attorney-client, etc.). | Deployer-defined policy. |

The spec doesn't enforce retention or storage rules — those are the deployer's collector / backend policy. The spec only guarantees the *signal*: a collector inspecting a span's attributes can route / mask / drop based on `wop.pii_present` + `wop.compliance_class` without parsing payload contents.

See "Privacy classification" §below in the main `Span attributes` series for the underlying field-marker layer.

### Sub-workflow attributes (closes O2)

Set on the `wop.run` span of a child run started by a parent workflow's invoke-style node (sub-workflow dispatch, cross-canvas-invoke, etc.):

| Attribute | Type | Required | Notes |
|---|---|---|---|
| `wop.parent.run_id` | string | MUST | RunId of the parent run. |
| `wop.parent.workflow_id` | string | MUST | WorkflowId of the parent run. |
| `wop.parent.node_id` | string | MUST | NodeId of the invoke node in the parent that spawned this child. |

**Span linkage: parent-child causal nesting.** The child run's `wop.run` span MUST be set as a *child span* of the parent's invoke-node `wop.node.<typeId>` span (via OTel `parentSpanId`). Sub-workflow invocation IS causal — the parent's invoke-node spawns the child — so parent-child nesting is semantically correct AND is what operators want visually. Clicking the parent's invoke-node span in Honeycomb / Tempo / Jaeger drills into the child run, exactly like clicking a function call drills into the function body.

This contrasts with the replay/branch case above (Span Link, sibling-style) because replays are NOT causal children of the source run — the user's `:fork` request is the cause. For sub-workflows, the parent's invoke-node IS the cause.

**Propagation mechanism.** The parent engine emits the invoke-node span with `traceparent` set; when starting the child run (via REST `POST /v1/runs`, MCP `tools/call`, or A2A invoke), the parent MUST forward that `traceparent` to the child engine. The child engine's first span (`wop.run`) MUST use the forwarded `traceparent` as its parent reference — the same W3C Trace Context propagation flow already specced in §Trace context propagation.

The child engine SHOULD also emit the three `wop.parent.*` attributes alongside the parent reference — letting dashboards filter / aggregate ("show me all child runs spawned by workflow X" or "show me invoke-node failures by parent.node_id") without graph queries.

Cross-link with `channels-and-reducers.md` §Distributed reducers: a child run's `channel.written` events carry `sourceEngineId` + `sourceRunId` (from C2's cross-engine writes). When operators trace from a parent's `channel-write` trigger fire back to the child write that caused it, the trace's parent-child span structure makes the connection one click — no manual run-ID correlation required.

---

## Span naming

A WOP-compliant server SHOULD use these canonical span names. Implementations MAY use additional names outside the `wop.*` prefix.

| Span name | When emitted | Parent |
|---|---|---|
| `wop.run` | Top-level span for an entire run | none (or client trace) |
| `wop.node.<typeId>` | Wraps a single node execution | `wop.run` |
| `wop.node.<typeId>.attempt` | Wraps one retry attempt within a node | `wop.node.<typeId>` |
| `wop.event.append` | Wraps `EventLog.appendAtomic` | nearest active span |
| `wop.interrupt` | Wraps a HITL suspension (open until resumed) | `wop.node.<typeId>` |
| `wop.activity.<provider>` | Wraps an external API call (e.g., `wop.activity.openai`) | nearest active span |

Span names with `<typeId>` substitute the actual node type — e.g., `wop.node.core.ai.callPrompt`.

---

## Structured-log metric records (lightweight)

In addition to OTel metrics (defined in the next section), a WOP-compliant server SHOULD emit structured-log records with the following `metricKind` field. These are the cheap-to-emit complement: logs-based, ingested by most observability platforms natively, useful for ad-hoc querying when a full metrics pipeline isn't deployed.

| `metricKind` | When | Required fields |
|---|---|---|
| `wop.run.created` | After successful `POST /v1/runs` | `runId`, `workflowId`, `tenantId?` |
| `wop.run.completed` | On terminal status (`completed`/`failed`/`cancelled`) | `runId`, `status`, `durationMs` |
| `wop.run.claim.conflict` | On `X-Dedup` 409 conflict | `transport`, `projectId`, `activeRunId`, `activeHost`, `retryAfterSeconds` |
| `wop.node.completed` | Per node completion | `runId`, `nodeId`, `nodeType`, `status`, `durationMs`, `attempt` |
| `wop.activity.invoked` | Per external API call | `runId`, `nodeId`, `provider`, `status`, `latencyMs`, `idempotencyHit?` |
| `wop.cap.exceeded` | When `CapabilityLimitExceededError` fires | `runId`, `kind`, `limit`, `observed` |
| `wop.cost.recorded` | After every billable AI activity (closes O4; see "Cost attribution attributes" §) | `runId`, `nodeId`, `provider`, `tokensInput`, `tokensOutput`, `usd?`, `currency?`, `estimated?` |
| `wop.mcp.invocation` | Per MCP tool call | `invocationId`, `tenantId`, `moduleId`, `uid?`, `status`, `errorCode?`, `latencyMs` |

---

## OpenTelemetry metrics (full)

Format follows [OpenTelemetry Semantic Conventions](https://opentelemetry.io/docs/specs/semconv/general/attribute-naming/) style: each metric declares an `instrument`, `unit` (UCUM code), `description`, applicable `attributes`, recommended histogram boundaries (when applicable), and a `stability` tier.

A WOP-compliant server SHOULD emit all `Stable` metrics. `Experimental` metrics MAY be emitted; consumers MUST tolerate their addition or removal in v1.x patch releases.

### Attribute cardinality conventions

The metric attribute tiers below reuse the canonical `wop.*` span attributes from §Span attributes. Cardinality bounds:

| Attribute | Cardinality | Use as metric attribute? |
|---|---|---|
| `wop.run_id` | UNBOUNDED (1 per run) | NEVER. Use [exemplars](https://opentelemetry.io/docs/specs/otel/metrics/data-model/#exemplars) to link metric points back to traces. |
| `wop.workflow_id` | Tenant-bounded (typically <100 per tenant) | Recommended. |
| `wop.node_id` | Workflow-bounded (typically <50 per workflow) | Opt-in — may explode at scale. Aggregations SHOULD prefer `wop.node_type`. |
| `wop.node_type` | Pack-bounded (typically <50 globally; <500 with vendor packs) | Recommended. |
| `wop.tenant_id` | Platform-bounded (one per tenant) | Required for multi-tenant deployments. Consumers MAY drop at aggregation if cardinality budget is tight. |
| `wop.scope_id` | Tenant-bounded | Opt-in. |
| `provider` (activities) | Bounded enum (`openai`, `anthropic`, `google`, …) | Required for activity metrics. |

### Run lifecycle metrics

#### `wop.run.created`

| Field | Value |
|---|---|
| Instrument | Counter |
| Unit | `1` (count) |
| Description | Number of runs accepted by `POST /v1/runs`. Increments BEFORE the run begins executing — covers both runs that complete and runs that fail to start. |
| Attributes (Required) | `wop.workflow_id`, `wop.tenant_id` (if multi-tenant) |
| Attributes (Recommended) | `wop.scope_id` |
| Stability | Stable |

#### `wop.run.completed`

| Field | Value |
|---|---|
| Instrument | Counter |
| Unit | `1` (count) |
| Description | Number of runs that reached a terminal status. Discriminate via the `wop.run_status` attribute. |
| Attributes (Required) | `wop.run_status` (`completed` \| `failed` \| `cancelled`), `wop.workflow_id` |
| Attributes (Recommended) | `wop.tenant_id` |
| Stability | Stable |

#### `wop.run.duration`

| Field | Value |
|---|---|
| Instrument | Histogram |
| Unit | `s` (seconds) |
| Description | Wall-clock duration from `POST /v1/runs` accept to terminal status. Includes time suspended on HITL interrupts — operators wanting "active execution time only" should pair with `wop.node.duration` aggregations. |
| Attributes (Required) | `wop.run_status`, `wop.workflow_id` |
| Attributes (Recommended) | `wop.tenant_id` |
| Recommended buckets (s) | `[0.5, 1, 2.5, 5, 10, 30, 60, 300, 600, 1800, 3600]` (0.5s — 1h) |
| Stability | Stable |

#### `wop.run.active`

| Field | Value |
|---|---|
| Instrument | UpDownCounter |
| Unit | `1` (count) |
| Description | Number of in-flight runs (status NOT in `completed`/`failed`/`cancelled`). Increments on `POST /v1/runs` accept; decrements on terminal transition. |
| Attributes (Required) | `wop.tenant_id` (if multi-tenant) |
| Attributes (Recommended) | `wop.workflow_id` |
| Stability | Stable |

### Node lifecycle metrics

#### `wop.node.completed`

| Field | Value |
|---|---|
| Instrument | Counter |
| Unit | `1` (count) |
| Description | Number of node executions that reached a terminal node status. |
| Attributes (Required) | `wop.node_type`, `wop.run_status` (`completed` \| `failed` \| `skipped` \| `cancelled`) |
| Attributes (Recommended) | `wop.workflow_id`, `wop.tenant_id` |
| Stability | Stable |

#### `wop.node.duration`

| Field | Value |
|---|---|
| Instrument | Histogram |
| Unit | `s` (seconds) |
| Description | Per-node execution duration. Per-attempt (a node with 3 retries records 3 samples). |
| Attributes (Required) | `wop.node_type`, `wop.run_status` |
| Attributes (Recommended) | `wop.node_attempt` (zero-based) |
| Recommended buckets (s) | `[0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1, 5, 10, 30, 60]` (1ms — 1min) |
| Stability | Stable |

#### `wop.node.attempts`

| Field | Value |
|---|---|
| Instrument | Counter |
| Unit | `1` (count) |
| Description | Number of retry attempts on a node. Counts only attempts strictly after the first; a node that succeeds first try contributes 0. |
| Attributes (Required) | `wop.node_type` |
| Attributes (Recommended) | `wop.workflow_id` |
| Stability | Stable |

### Activity (external API call) metrics

#### `wop.activity.invocations`

| Field | Value |
|---|---|
| Instrument | Counter |
| Unit | `1` (count) |
| Description | Number of external API calls (LLM, payment, webhook). Discriminates by `provider`. |
| Attributes (Required) | `provider` (e.g., `openai`, `anthropic`, `google`), `wop.run_status` (`success` \| `error` \| `idempotent_hit`) |
| Attributes (Recommended) | `wop.node_type` |
| Stability | Stable |

#### `wop.activity.duration`

| Field | Value |
|---|---|
| Instrument | Histogram |
| Unit | `s` (seconds) |
| Description | Wall-clock duration of a single external API call. |
| Attributes (Required) | `provider`, `wop.run_status` |
| Recommended buckets (s) | `[0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, 30, 60, 120]` (10ms — 2min) |
| Stability | Stable |

#### `wop.activity.tokens`

| Field | Value |
|---|---|
| Instrument | Counter |
| Unit | `{token}` (UCUM custom unit; OTel-style annotated count) |
| Description | LLM tokens billed. Pairs with `observability.md` §Cost attribution attributes (O4) — same numbers, different aggregation level. |
| Attributes (Required) | `provider`, `direction` (`input` \| `output`) |
| Attributes (Recommended) | `wop.cost.estimated` (boolean — true when computed server-side rather than provider-returned) |
| Stability | Stable |

### Capability-limit metrics

#### `wop.cap.exceeded`

| Field | Value |
|---|---|
| Instrument | Counter |
| Unit | `1` (count) |
| Description | Number of `CapabilityLimitExceededError` occurrences, broken down by limit kind. Useful for "are we tuning limits too tight?" SLOs. |
| Attributes (Required) | `wop.cap_kind` (`clarification` \| `schema` \| `envelopes` \| `node-executions`) |
| Attributes (Recommended) | `wop.workflow_id`, `wop.node_type` |
| Stability | Stable |

### Run-claim metrics

#### `wop.run.claim.conflicts`

| Field | Value |
|---|---|
| Instrument | Counter |
| Unit | `1` (count) |
| Description | Number of `X-Dedup: enforce` 409 conflicts. Useful for "are clients retrying too aggressively?" SLOs. |
| Attributes (Required) | `transport` (`rest` \| `mcp` \| `a2a`), `wop.tenant_id` |
| Stability | Stable |

### HITL metrics

#### `wop.interrupt.requested`

| Field | Value |
|---|---|
| Instrument | Counter |
| Unit | `1` (count) |
| Description | Number of HITL suspensions emitted. |
| Attributes (Required) | `wop.interrupt_kind` (`approval` \| `clarification` \| `external-event` \| `custom`) |
| Attributes (Recommended) | `wop.workflow_id`, `wop.node_type` |
| Stability | Stable |

#### `wop.interrupt.duration`

| Field | Value |
|---|---|
| Instrument | Histogram |
| Unit | `s` (seconds) |
| Description | Wall-clock time from suspension request to resolution (or timeout). Note the wide bucket range — HITL is slow by nature. |
| Attributes (Required) | `wop.interrupt_kind`, `wop.run_status` (`resolved` \| `timeout` \| `cancelled`) |
| Recommended buckets (s) | `[60, 300, 900, 1800, 3600, 14400, 86400, 604800]` (1min — 1week) |
| Stability | Stable |

### Cost attribution metrics

The cost-attribution metrics below pair with the `wop.cost.*` attributes (see "Cost attribution attributes" §). Promoted from Experimental → Stable on 2026-04-27 alongside O4 closure.

#### `wop.cost.usd`

| Field | Value |
|---|---|
| Instrument | Counter (monotonic) |
| Unit | `USD` |
| Description | Cumulative cost in USD. Use only when the server can derive cost from a published rate card; omit rather than guess. |
| Attributes (Required) | `provider`, `wop.cost.estimated` |
| Attributes (Recommended) | `wop.tenant_id`, `wop.workflow_id` |
| Stability | Stable |

---

## Privacy classification (closes O5)

The privacy classification surface gives workflow authors + NodeModule packs explicit ways to mark fields as sensitive. The engine reads those markers to compute the `wop.pii_present` / `wop.compliance_class` / `wop.sensitive_fields` span attributes (defined in §Span attributes above) AND to apply masking when persisting events.

### Workflow-level: `metadata.complianceClass`

`WorkflowMetadata.complianceClass` declares the top-level sensitivity tier of the entire workflow:

```jsonc
{
  "metadata": {
    "complianceClass": "phi"   // 'public' (default) | 'pii' | 'phi' | 'pci' | 'regulated'
  }
}
```

This is the workflow-author's claim about what kind of data flows through. Sets `wop.compliance_class` on every span the run produces. Persists with the workflow definition; reviewable at workflow-register time.

### Field-level markers

Three places authors can mark individual fields as sensitive:

**1. Workflow variables** — `WorkflowVariable.sensitive: boolean`:

```jsonc
{
  "variables": [
    { "name": "userEmail", "type": "string", "sensitive": true },
    { "name": "totalScore", "type": "number" }
  ]
}
```

When `true`, the engine masks the variable's value in persisted `variable.changed` events, `state.snapshot` projections, and the projected `RunSnapshot.variables` returned by `GET /v1/runs/{runId}`. Reads inside the workflow's NodeModule executors work normally — only persistence and external surfaces mask.

**2. Per-node output overrides** — `WorkflowNode.outputSensitivity`:

```jsonc
{
  "id": "ai-1",
  "typeId": "core.ai.callPrompt",
  "outputSensitivity": {
    "draftEmail": true,
    "tokensUsed": false
  }
}
```

When a normally-non-sensitive node receives sensitive data IN THIS WORKFLOW (e.g., a generic `core.ai.callPrompt` rendering a PHI-bearing prompt template), the workflow author marks specific output ports without changing the underlying NodeModule. Engine masks the marked output-port values in `node.completed` event payloads.

**3. Pack-level output declaration** — pack manifest `nodes[].outputs[<port>].sensitive: boolean`:

```jsonc
{
  "name": "vendor.acme.salesforce-tools",
  "nodes": [
    {
      "typeId": "vendor.acme.salesforce.upsert",
      "outputs": {
        "ssn": { "sensitive": true }
      }
    }
  ]
}
```

When a NodeModule ALWAYS handles sensitive data (a Salesforce upsert always touches PII), the pack author declares it once in the manifest. Workflows using this typeId inherit the markers automatically; `outputSensitivity` overrides at the workflow level if needed.

**4. Channel sensitivity** — `ChannelDeclaration.sensitive: boolean`:

```jsonc
{
  "channels": {
    "phiNotes": { "reducer": "feedback", "sensitive": true }
  }
}
```

When `true`, `channel.written` event payloads have their `value` field masked. The reduced channel state in `RunSnapshot.channels` is also masked when read via the REST surface.

### Masking behavior

The engine's masking mode is server policy, advertised via `Capabilities.compliance.defaultMode`:

| Mode | Behavior |
|---|---|
| `mask` (default) | Replace value with the literal string `"[REDACTED]"`. |
| `omit` | Drop the field entirely from the persisted payload. |
| `hash` | Replace with `"sha256:<hex>"` so audit trails can detect equality without revealing the value. |
| `passthrough` | Record values as-is. Use only when a downstream collector handles masking. NOT recommended for production. |

A WOP-compliant server SHOULD:

1. Default to `mask` for any field marked sensitive.
2. Apply masking BEFORE the event reaches the durable event log (so leaks via the log itself are prevented).
3. Apply the same mode consistently within a single run (so replays produce identical event logs).

Servers MAY allow per-workflow overrides via `metadata.complianceConfig.maskingMode` — useful when a workflow needs hash-based audit but the server default is `mask`.

### Replay implications

Sensitive fields are NOT replay-deterministic by default — replays can't see the original values, so any execution path that branches on a masked field MAY diverge. Authors who need replay-deterministic sensitive data SHOULD:

- Use external secret storage (vault) and re-resolve during replay via a deterministic key.
- OR use `hash` masking mode (audit-only equality) instead of `mask` / `omit` (which lose information).

Replay tooling MUST surface a warning when a `:fork` operation re-executes from a sequence that depended on a masked field — the replay may produce different outputs than the original. The `replay.diverged` event (already in the RunEvent enum) is the structured signal.

### What this is NOT

- The spec does NOT enforce retention or storage rules — those are deployer's collector / backend policy.
- The spec does NOT detect PII automatically. Authors and pack maintainers MUST annotate fields. Auto-detection (regex-based, ML-based) is a vendor-pack feature, not a spec feature.
- The classification class enum is intentionally small (5 values). Industry-specific subdivisions (HIPAA's 18 PHI identifiers, GDPR's "special categories") are NOT modeled at the spec level — those are domain-specific extensions in `metadata.complianceConfig`.

---

## Reference implementation status (non-normative)

> **Non-normative.** This section describes a transitional state of the MyndHyve reference implementation. It does NOT modify the canonical `wop.*` requirement above. Future implementations SHOULD emit `wop.*` directly; the aliasing pattern below is provided so operators of the existing reference impl can comply with the spec at the collector layer until the rename lands.

The MyndHyve reference implementation currently emits OTel attributes under a host-private `myndhyve.*` namespace (e.g., `myndhyve.workflow.id`, `myndhyve.run.id`, `myndhyve.pauseRun.outcome`) rather than the spec-canonical `wop.*`. This is a known reference-implementation gap tracked in the impl plan as CC-3. Until the mechanical rename lands, deployments consuming traces from that implementation can apply a per-deployment OTel collector aliasing rule:

```yaml
# OTel collector config — alias host-private attributes to canonical wop.*
processors:
  attributes/wop_canonical:
    actions:
      - key: wop.workflow_id
        from_attribute: myndhyve.workflow.id
        action: insert
      - key: wop.run_id
        from_attribute: myndhyve.run.id
        action: insert
      # ... per-attribute mapping
```

Spec-compliant implementations MUST emit `wop.*` directly; the aliasing pattern above is for the existing MyndHyve reference impl only and is not normative.

## Vendor aliasing (out of scope)

Operators who deploy WOP-compliant servers and also use commercial observability platforms (Datadog, Honeycomb, LangSmith, etc.) typically need to alias `wop.*` attributes to vendor-specific taxonomies. **This is per-deployment configuration, NOT spec'd.** Recommended pattern:

- Run an [OpenTelemetry Collector](https://opentelemetry.io/docs/collector/) between the server and the vendor backend.
- Apply an `attributes` processor that copies/renames `wop.*` to the vendor's namespace.

Example aliasing rule (collector config snippet):

```yaml
processors:
  attributes/aliasing:
    actions:
      - key: langgraph.thread_id
        from_attribute: wop.run_id
        action: insert
      - key: langgraph.checkpoint_ns
        from_attribute: wop.workflow_id
        action: insert
```

Spec compliance does NOT require any such mapping. A server that emits only `wop.*` attributes is fully compliant; the operator chooses whether to bridge.

---

## Implementer guidance

A WOP-compliant server SHOULD:

1. Use a single OTel SDK instance for the lifetime of the process.
2. Configure the OTel resource with `service.name` matching the implementation's published name (e.g., `@your-org/workflow-engine` — the MyndHyve reference impl uses `@myndhyve/workflow-engine`).
3. Set `service.version` to the published implementation version.
4. Sample spans according to `OTEL_TRACES_SAMPLER` env conventions; default to `parentbased_traceidratio=0.1` (10% sampling).
5. Emit logs at `info` level for `wop.*` `metricKind` records and `error` level for `CapabilityLimitExceededError` and unhandled failures.

A WOP-compliant client (CLI, SDK) SHOULD:

1. Generate a `traceparent` for every command that issues a request.
2. Display the trace ID in error messages so operators can search backend traces.
3. Surface `wop.run.claim.conflict` events as user-actionable retry prompts.

---

## Cost attribution attributes (closes O4)

For AI-driven activities (`core.ai.callPrompt`, `core.ai.generateFromPrompt`, `wop.activity.<provider>` spans), servers SHOULD attach the following attributes when the underlying provider call returns billable usage info:

| Attribute | Type | Required | Notes |
|---|---|---|---|
| `wop.cost.tokens.input` | number | SHOULD | Input/prompt tokens billed. |
| `wop.cost.tokens.output` | number | SHOULD | Output/completion tokens billed. |
| `wop.cost.tokens.total` | number | MAY | Convenience sum; consumers can compute themselves. |
| `wop.cost.usd` | number | MAY | Estimated cost in USD. Servers SHOULD use a published rate card per model; if pricing is unavailable, omit rather than guess. |
| `wop.cost.currency` | string | MAY | ISO 4217 code when `wop.cost.<currency>` is non-USD (default `usd`). |
| `wop.cost.estimated` | boolean | MAY | True when the cost was server-side computed rather than returned by the provider. |
| `wop.cost.provider` | string | SHOULD | Provider name for cost attribution roll-up (e.g., `openai`, `anthropic`, `google`). Same value as the provider in `wop.activity.<provider>` span name. |

Aggregation guidance: dashboards SHOULD roll up `wop.cost.tokens.*` and `wop.cost.usd` by `wop.workflow_id`, `wop.tenant_id`, `wop.scope_id`, and `wop.cost.provider`. The dimension cardinality is bounded by tenant/project counts and the (small) provider list; safe for OTel histograms.

`metricKind` extension:

| `metricKind` | When | Required fields |
|---|---|---|
| `wop.cost.recorded` | After every billable AI activity | `runId`, `nodeId`, `provider`, `tokensInput`, `tokensOutput`, `usd?`, `currency?`, `estimated?` |

Privacy: cost attributes MUST NOT include the prompt/response text (use `wop.cost.tokens.*` for billable counts, never substring excerpts).

---

## Open spec gaps

| # | Gap | Owner |
|---|---|---|
| O1 | Full OTel metric definitions — done (2026-04-27: 13 metrics defined in semconv style under "OpenTelemetry metrics (full)" §, with instrument / unit / attributes / recommended histogram buckets / stability tier per metric. All 13 Stable as of O4 promotion). Cardinality bounds documented per attribute. | ✅ |
| O2 | Sub-workflow span linkage — done (2026-04-27: child `wop.run` is a parent-child span of the invoke-node's `wop.node.<typeId>` (causal nesting); three required attributes `wop.parent.run_id`, `wop.parent.workflow_id`, `wop.parent.node_id`. Parent forwards W3C `traceparent` on REST/MCP/A2A invocation. See "Sub-workflow attributes" §). | ✅ |
| O3 | Replay/branch span linkage — done (2026-04-27: forked `wop.run` carries an OTel `Link` to the source span + three required attributes `wop.replay.source_run_id`, `wop.replay.from_seq`, `wop.replay.mode`. See "Replay / branch attributes" §). | ✅ |
| O4 | Cost attribution attributes — done (2026-04-27: typed `wop.cost.tokens.*` + `wop.cost.usd` + `wop.cost.estimated` attributes; `wop.cost.recorded` log metric; `wop.cost.usd` OTel metric promoted Experimental → Stable). | ✅ |
| O5 | Privacy classification — done (2026-04-27: full surface — three span attributes (`wop.pii_present`, `wop.compliance_class`, `wop.sensitive_fields`) + workflow-level `metadata.complianceClass` + field markers on variables/nodes/channels/pack outputs + four masking modes (`mask`/`omit`/`hash`/`passthrough`) advertised via `Capabilities.compliance.defaultMode`. See "Privacy classification" §). | ✅ |

## References

- `auth.md` — auth model + status legend
- `rest-endpoints.md` — endpoint catalog (canonical `traceparent`/`tracestate` headers)
- `idempotency.md` — `wop.activity.invoked.idempotencyHit?` field
- `capabilities.md` — `CapabilityLimitExceededError` shape (powering `wop.cap.exceeded`)
- W3C Trace Context: <https://www.w3.org/TR/trace-context/>
- OpenTelemetry semantic conventions: <https://opentelemetry.io/docs/specs/semconv/>
- Reference impl: forthcoming via impl plan PR 3b.12 (OTel propagation + emission)
- WOP plan cross-cut: CC-3 — Phase 3b uses `wop.*` taxonomy when emitting spans
