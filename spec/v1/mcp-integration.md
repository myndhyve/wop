# WOP Spec v1 — MCP Integration

> **Status: DRAFT v1.1 (2026-05-01).** Worked example of how WOP and the Model Context Protocol (MCP) compose. Non-normative — this document doesn't prescribe a wire-level integration; it documents the recommended composition pattern. See `auth.md` for the status legend.

---

## TL;DR

**WOP runs the workflow. MCP exposes tools to the LLM nodes inside that workflow.** The two protocols compose; they don't compete.

A WOP node that calls an LLM gets its tools from registered MCP servers. The LLM, when it wants to use a tool, emits a tool-call envelope; the WOP host dispatches that to the MCP server; the MCP server returns a result; the host feeds the result back into the next LLM turn.

```
[WOP host] ── runs ──> [Workflow]
                         │
                         │  per node:
                         ▼
                       [LLM node]
                         │
                         │  LLM may emit tool-call envelopes
                         ▼
                       [WOP host's MCP client] ── calls ──> [MCP server]
                                                              │ (e.g. file system, search,
                                                              │  vector DB, host-vendor tools)
                                                              ▼
                                                            [Tool result]
                         ◄───── result ───────────────────────┘
                         │
                         ▼
                       [Next LLM turn]
```

---

## Why this composition

WOP standardizes the **execution semantics**: what does it mean to "run" a workflow, "interrupt" it, "stream" its events, "replay" it from the event log? WOP doesn't prescribe what tools an LLM has access to.

MCP standardizes the **tool/resource access**: how does an LLM-app discover and invoke tools, read resources, fetch prompts? MCP doesn't prescribe what runs the LLM-app or what to do with multi-step state.

The two layer naturally:

| Layer | Owner | Concerns |
|---|---|---|
| Workflow execution + state | WOP | Run lifecycle, events, interrupts, replay, observability, conformance |
| Tool/resource access | MCP | Tool catalog, schema, invocation, result shape |

A WOP host announces MCP-compatibility via `/.well-known/wop`'s `capabilities.mcp` (host-implementation-defined; not a normative WOP field). Workflow authors who depend on MCP tools select hosts that advertise the capability.

---

## Concrete example

A workflow that searches the web and summarizes the results:

```yaml
# Conceptual workflow definition
nodes:
  - id: search
    typeId: core.ai.callPrompt
    config:
      systemPrompt: "Search the web for the user's query and summarize."
      mcpServers: ["web-search"]    # host-extension field
  - id: summarize
    typeId: core.noop
edges:
  - from: search
    to: summarize
```

When this runs:

1. **WOP host** dispatches the `search` node.
2. The node invokes the LLM with the system prompt + the user input from `inputs.query`.
3. **LLM emits a tool-call envelope** asking for the `web-search.search` tool.
4. WOP host's MCP client connects to the `web-search` MCP server, invokes the `search(query)` tool.
5. **MCP server** returns search results.
6. WOP host feeds the result back into the LLM as the next turn's input.
7. LLM returns its summary as a workflow envelope (`summary.create` or similar).
8. WOP host stores the summary as an artifact, advances to the `summarize` node.

The LLM's tool-call envelope follows MCP's tool-call shape; the `summary.create` envelope follows WOP's envelope vocabulary. Each side owns its layer.

---

## Trust boundary

A registered MCP server is **trusted to behave per its manifest** (per `SECURITY/threat-model-node-packs.md` §"Sandbox execution" — the same trust model applies). A compromised MCP server can:

- Return malicious content that prompt-injects the LLM.
- Exfiltrate workflow inputs by returning them in the next tool result.
- Refuse to respect tool-allowlist restrictions.

WOP's response to these risks (per `SECURITY/threat-model-prompt-injection.md`):

- MCP tool responses MUST be wrapped in `<UNTRUSTED tool="...">` markers in the next LLM turn (`prompt-injection-mcp-marker` invariant).
- MCP tool responses MUST NOT advance HITL approval gates (`prompt-injection-mcp-no-approval` invariant).
- LLM-emitted tool-call envelopes MUST be validated against the workflow's declared tool allowlist (`prompt-injection-tool-allowlist` invariant).

These invariants are enforced by the WOP host; the MCP protocol doesn't have to know about them.

---

## Conformance + interop

A WOP host that supports MCP advertises the capability and (per the host's choice) lists supported MCP servers. A WOP client that depends on MCP looks at the discovery payload and confirms the host can execute the workflow.

**Interop today:**

- The **MyndHyve reference host** supports MCP via its in-tree MCP module registry (per the Q6 host-registry work; `services/workflow-runtime/src/routes/mcp.ts`).
- The **in-memory reference host** does NOT support MCP — its `core.noop` and `core.delay` nodes don't invoke LLMs at all. A workflow that requires MCP tools fails with `unsupported_node_type` against the in-memory host.
- A **third-party host** can implement MCP-compatibility independently; the WOP wire contract is unaffected.

A future conformance scenario (`mcp-tool-roundtrip.test.ts`, not yet in the suite) would gate on advertised MCP capability and verify the round-trip works against any conforming host.

---

## What WOP does NOT specify about MCP

- **Which MCP servers to load.** Host-implementation choice. Some hosts ship a curated set; some allow operator config.
- **MCP transport mechanics.** MCP itself is documented at `https://modelcontextprotocol.io`; WOP doesn't re-specify it.
- **Tool-discovery format.** MCP defines tool schemas; WOP doesn't override.
- **Result-redaction rules.** Hosts apply their redaction harness to MCP results before persisting them in event payloads (per `SECURITY/threat-model-secret-leakage.md`); the harness shape is host-defined.

---

## Future work

- A vendor-neutral way for a host to advertise its supported MCP servers in `/.well-known/wop`. Currently `capabilities.mcp` is host-implementation-defined; an additive field would let clients query before sending workflows.
- A conformance scenario that drives an MCP round-trip without depending on a specific MCP server (uses a synthetic MCP-server fixture). Filed under LT3 as a successor.
- A worked node-pack example showing an LLM-using-tools node that integrates MCP (would be `examples/mcp-tool/` in `LT6.2` of the leadership track; deferred to a successor session).

---

## See also

- `spec/v1/positioning.md` — why MCP is complementary, not competing.
- `spec/v1/host-extensions.md` — what's in the WOP wire contract vs what's a host extension.
- `SECURITY/threat-model-prompt-injection.md` — invariants on MCP tool responses.
- `SECURITY/threat-model-node-packs.md` — sandbox + trust model that MCP servers fit into.
- Model Context Protocol: https://modelcontextprotocol.io — the canonical MCP source.
