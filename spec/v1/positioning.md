# WOP Spec v1 — Positioning

> **Status: DRAFT v1.1 (2026-05-01).** Honest comparison of WOP against adjacent workflow / orchestration ecosystems. Non-normative — this document doesn't constrain any conforming implementation. See `auth.md` for the status legend.

---

## What WOP is

WOP is **an open protocol for portable, durable, AI-native workflow execution across hosts.**

Concretely: WOP standardizes how independent systems define, start, stream, interrupt, resume, replay, validate, and observe durable workflows that include LLM-emitted structured envelopes, human-in-the-loop checkpoints, and conformance-tested cross-host behavior.

## What WOP is not

- A general-purpose batch-job orchestrator. Use Airflow, Argo, or your cloud's batch service.
- A durable-execution runtime SDK. Use Temporal or AWS Step Functions for that level of operational maturity.
- A BPMN-style enterprise process modeling notation. Use BPMN where governance + tooling weight matters.
- A LangChain replacement. Use LangChain or LangGraph for application-level LLM orchestration when host portability isn't a goal.
- A workflow-engine framework. WOP is the wire contract; engines are implementations of that contract.

## Why this doc exists

`WOP_COMPREHENSIVE_ANALYSIS.md` (B- / 82) graded WOP's competitive differentiation as B+, with the warning: "If positioned as a universal workflow engine, WOP will be compared unfavorably to mature incumbents." This document positions WOP precisely so reviewers don't pattern-match it into the wrong category.

---

## Comparison table

| System | Strength | WOP comparison |
|---|---|---|
| **Temporal** | Durable execution runtime; production-mature retries, signals, timers, task queues | Temporal is a runtime; WOP is a protocol. WOP can run on Temporal-backed hosts; the two are complementary, not competing. |
| **Apache Airflow** | Scheduled batch data pipelines; mature ecosystem; cron-driven | WOP is interactive + AI-mediated, not scheduled batch. WOP is not a better Airflow. |
| **Argo Workflows** | Kubernetes-native parallel jobs; container workflows | Argo is k8s-native + container-centric. WOP is host-neutral and AI-aware but much less battle-tested for container orchestration. |
| **AWS Step Functions** | Enterprise trust; AWS-service integrations; ASL state-machine clarity | Step Functions is AWS-distribution and ASL-locked. WOP competes only on portability + AI-native semantics + host neutrality. |
| **BPMN / OMG** | Standards legitimacy; enterprise process-modeling depth; governance history | BPMN is enterprise-standard for human-process modeling. WOP is API/AI-native but lacks BPMN's neutral-standardization weight. |
| **LangGraph** | Closest conceptual competitor in agent-workflow land; durable execution + HITL primitives | LangGraph is a framework. WOP is a protocol + conformance suite. WOP can host LangGraph-built workflows; LangGraph can be a client of a WOP host. |
| **Model Context Protocol (MCP)** | Standardizes tool/resource/prompt access for LLM apps | **Complementary, not competing.** MCP standardizes what tools an LLM can call; WOP standardizes how multi-step LLM workflows run, pause, resume, stream, and validate. Worked example in `mcp-integration.md`. |

---

## When to choose WOP

Use WOP when:

- **You need portable AI workflows.** Workflows that can run on multiple hosts (your dev box, your prod cluster, a vendor's managed runtime) without vendor lock-in.
- **You need durable LLM-mediated workflows.** Multi-step LLM execution with structured envelope outputs, human approval checkpoints, refine-feedback loops.
- **You need cross-host interop.** Independent implementations of "the same protocol" that produce comparable behavior — verifiable via the conformance suite.
- **You need standardized observability + replay.** A debug bundle from one host can be ingested by tooling built for another.
- **You want pack-style extensibility.** Workspace operators install signed node packs from a registry; the trust model is part of the protocol.

## When NOT to choose WOP

Use something else when:

- **You're orchestrating non-LLM batch data pipelines.** Airflow / Argo / native cron is better suited.
- **You need a durable-execution runtime with deep production maturity TODAY.** Temporal has a decade of production hardening; WOP has months. Run WOP on top of Temporal where you can.
- **You're running a single-host application that doesn't need cross-host portability.** A framework (LangGraph, LangChain) is lower-overhead than implementing a protocol.
- **Your enterprise compliance posture requires BPMN + an OMG-recognized standardization body.** WOP's governance is documented but not yet at OMG-class neutrality.
- **You need scheduled/cron-driven execution.** WOP is request-driven; scheduling is a host concern, not protocol-defined.

---

## How WOP integrates with the alternatives

### With MCP (Model Context Protocol)

WOP runs the workflow; MCP exposes tools to the LLM nodes inside that workflow. A WOP node that needs to "search the web" or "read a file" calls an MCP tool from a registered MCP server. WOP's wire contract advertises MCP-compatibility via `capabilities.mcp` (host-implementation-defined).

See `spec/v1/mcp-integration.md` for the worked example.

### With Temporal / durable-execution runtimes

A WOP host can be implemented on top of Temporal. The host's HTTP layer accepts WOP requests; the host's worker translates each WOP run into a Temporal workflow execution. The Temporal `WorkflowID` corresponds to the WOP `runId`; signals translate to interrupt resolutions; activities translate to node executions.

This gives you Temporal's durability + WOP's portable contract. The reference impl uses a simpler in-process executor; a Temporal-backed host is a viable second reference impl (and is referenced in `INTEROP-MATRIX.md` as a future row).

### With LangGraph

A LangGraph application can run inside a WOP node — the LangGraph runtime executes inside `core.langgraph` (a vendor-prefixed node type) and emits envelopes that the WOP engine validates. Conversely, a WOP-compliant host can be the durable backend that LangGraph delegates to for cross-host portability.

### With BPMN

A BPMN process model can be compiled into a WOP `WorkflowDefinition`. The BPMN human-task element becomes a WOP `interrupt` of kind `approval`; BPMN service tasks become WOP nodes. The resulting workflow runs against any WOP host. The BPMN-to-WOP compiler is out of scope for the protocol; the wire contracts make it possible.

### With Step Functions / cloud-vendor orchestrators

A WOP host can be implemented on top of Step Functions. The WOP HTTP surface dispatches each `POST /v1/runs` to a Step Functions execution; events are aggregated from the Step Functions execution log into the WOP event stream. This lets a workspace use Step Functions for billing/operability while exposing the WOP wire contract for client portability.

---

## What WOP solves especially well

The fit-with-problem statement: **"How do independent systems define, start, stream, interrupt, resume, replay, validate, and observe durable AI workflows?"**

In practice, WOP's strongest claims are:

- LLM-driven workflows with structured envelopes (`prd.create` / `theme.create` / `tasks.create` / `clarification.request` / etc.).
- Human approval, clarification, and refinement checkpoints with normative resume semantics.
- Host-neutral workflow execution APIs that two independent hosts can pass the same conformance suite against.
- Conformance-tested protocol behavior, not just framework convention.
- Node-pack extensibility with signing + workspace approval + sandboxed execution.
- Separating protocol semantics from product concepts (MyndHyve product extensions sit cleanly above the protocol).
- Multi-transport ambitions across REST, SSE, MCP, and A2A-style surfaces.

---

## What WOP is underdeveloped at

Honest about gaps (per `WOP_COMPREHENSIVE_ANALYSIS.md`):

- **Standardization maturity.** Governance is still vendor-driven (`myndhyve/wop`); migration to a vendor-neutral org is roadmapped, not scheduled.
- **Independent implementations.** As of 2026-05-01: MyndHyve flagship + an in-memory reference host. SQLite reference is planned. Cross-vendor interop is not yet evidence-tested at scale.
- **Runtime guarantees.** Public scalability + SLA language is sharper than v1.0 but not yet at Temporal/Step-Functions enterprise depth.
- **External security review.** Threat models published; commissioned third-party audit gated on governance maturity per `ROADMAP.md`.

These are documentation + ecosystem maturity gaps, not architectural ones.

---

## Recommended public message

```text
WOP is an open protocol for defining, running, streaming, interrupting,
replaying, and validating durable AI workflows across hosts.
```

NOT:

```text
WOP is the universal replacement for Temporal, Airflow, Argo, BPMN, and
Step Functions.
```

Avoiding the second framing avoids a comparison test WOP isn't ready to win and that doesn't represent the actual differentiation.

---

## See also

- `spec/v1/mcp-integration.md` — worked example of WOP + MCP composition.
- `spec/v1/host-extensions.md` — protocol core vs host-specific extensions distinction.
- `INTEROP-MATRIX.md` — cross-host conformance pass record.
- `ROADMAP.md` — v1.x and post-v1.0 ecosystem roadmap.
- `WOP_COMPREHENSIVE_ANALYSIS.md` (MyndHyve repo) — source analysis driving this positioning.
