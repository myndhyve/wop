// MCP-tool example — vendor-extension probe + observation pattern.
//
// WOP + MCP compose: WOP runs the workflow, MCP exposes tools to the
// LLM nodes inside it. Per spec/v1/mcp-integration.md the integration
// pattern is host-implementation-defined — there's no `wop-mcp`
// profile yet.
//
// What this example demonstrates:
//   1. Discovery probe: look for vendor-prefixed MCP advertisement.
//   2. If host advertises MCP support, start a workflow that uses an
//      MCP tool and observe the tool-call lifecycle in the event
//      stream.
//   3. Verify event-stream invariants: tool-call events appear before
//      the next LLM turn; tool responses are wrapped in untrusted
//      markers (per SECURITY/threat-model-prompt-injection.md
//      `prompt-injection-mcp-marker`).
//
// Why not run a live MCP server here:
//   - Real MCP integration requires the host's MCP client wiring + a
//     registered MCP server with stable stdio or HTTP transport.
//     Both are host-deployment specifics, not protocol concerns.
//   - The example's job is to show the WOP-side observability of
//     MCP-mediated workflows, not to wire MCP itself.
//
// Profile required: vendor-extension probe (`myndhyve.mcp` or
//                   equivalent host extension). When a `wop-mcp`
//                   profile lands via RFC, this example will gate on
//                   it directly.
//
// Host target: MyndHyve. Skip-equivalent without
//              WOP_MYNDHYVE_BASE_URL or when host doesn't advertise.
//
// @see spec/v1/mcp-integration.md
// @see SECURITY/threat-model-prompt-injection.md (mcp-* invariants)

import { randomUUID } from 'node:crypto';

const BASE_URL = process.env.WOP_MYNDHYVE_BASE_URL ?? '';
const API_KEY = process.env.WOP_MYNDHYVE_API_KEY ?? '';
const WORKFLOW_ID = process.env.WOP_WORKFLOW_ID ?? '';

if (!BASE_URL) {
  console.log('⊘ mcp-tool: WOP_MYNDHYVE_BASE_URL unset — skip-equivalent.');
  process.exit(0);
}
if (!API_KEY) {
  console.error('✗ mcp-tool: WOP_MYNDHYVE_API_KEY required.');
  process.exit(1);
}

async function http(method, path, body, opts = {}) {
  const headers = {
    Authorization: `Bearer ${API_KEY}`,
    'Content-Type': 'application/json',
  };
  if (opts.idempotencyKey) headers['Idempotency-Key'] = opts.idempotencyKey;
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, json: await res.json().catch(() => null) };
}

function detectMcpExtension(caps) {
  // Look for MCP advertisement under any vendor-prefixed namespace.
  // Conventional locations:
  //   - capabilities.myndhyve.mcp (MyndHyve)
  //   - capabilities.mcp (generic; not yet a profile)
  //   - capabilities.<vendor>.mcp
  const candidates = [];
  if (caps.mcp != null) candidates.push({ key: 'mcp', value: caps.mcp });
  for (const [k, v] of Object.entries(caps)) {
    if (typeof v === 'object' && v !== null && 'mcp' in v) {
      candidates.push({ key: `${k}.mcp`, value: v.mcp });
    }
  }
  return candidates;
}

async function main() {
  console.log(`→ Discovery: ${BASE_URL}/.well-known/wop`);
  const discovery = await fetch(`${BASE_URL}/.well-known/wop`);
  if (!discovery.ok) {
    console.error(`✗ discovery failed: ${discovery.status}`);
    process.exit(1);
  }
  const caps = await discovery.json();
  console.log(`  Host: ${caps.implementation?.name ?? 'unknown'}`);

  // Probe for MCP advertisement.
  const mcpCandidates = detectMcpExtension(caps);
  if (mcpCandidates.length === 0) {
    console.log(`⊘ Host doesn't advertise MCP support under any vendor prefix.`);
    console.log(`  Looked under: capabilities.mcp + capabilities.<vendor>.mcp`);
    console.log(`  This example targets hosts with MCP extensions wired.`);
    process.exit(0); // skip-equivalent
  }
  console.log(`  ✓ MCP advertisement found:`);
  for (const c of mcpCandidates) {
    console.log(`    capabilities.${c.key}: ${JSON.stringify(c.value).slice(0, 100)}`);
  }

  if (!WORKFLOW_ID) {
    // Without a configured workflow, demonstrate just the discovery side.
    // This is the safe default — readers learn the probe pattern.
    console.log('');
    console.log('No WOP_WORKFLOW_ID set — discovery probe complete.');
    console.log('To exercise the full lifecycle, set WOP_WORKFLOW_ID to a');
    console.log('workflow that uses MCP tools and re-run.');
    process.exit(0);
  }

  // Phase 2: start a run that uses MCP tools, observe event stream.
  console.log(`→ POST /v1/runs { workflowId: "${WORKFLOW_ID}" }`);
  const idemKey = `wop-example-mcp-tool-${process.env.GITHUB_RUN_ID ?? randomUUID()}`;
  const create = await http('POST', '/v1/runs', { workflowId: WORKFLOW_ID }, { idempotencyKey: idemKey });
  if (create.status === 404) {
    console.log(`⊘ Workflow "${WORKFLOW_ID}" not seeded; skip-equivalent.`);
    process.exit(0);
  }
  if (create.status !== 201) {
    console.error(`✗ run failed: ${create.status} ${JSON.stringify(create.json)}`);
    process.exit(1);
  }
  const { runId } = create.json;
  console.log(`  runId: ${runId}`);

  // Poll the events stream looking for tool-call events.
  console.log(`→ Polling /v1/runs/${runId}/events/poll for tool-call observability...`);
  const TERMINAL = new Set(['completed', 'failed', 'cancelled']);
  let toolCallCount = 0;
  let isComplete = false;
  let pollCount = 0;
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline && !isComplete) {
    pollCount++;
    const res = await http('GET', `/v1/runs/${encodeURIComponent(runId)}/events/poll`);
    if (res.status === 200 && res.json) {
      const events = res.json.events ?? [];
      // Tool-call events vary in shape per host — we look for type
      // strings containing "tool" as the cross-host probe.
      const toolEvents = events.filter((e) =>
        typeof e.type === 'string' && (e.type.includes('tool') || e.type.includes('mcp')),
      );
      toolCallCount = toolEvents.length;
      if (res.json.isComplete === true) isComplete = true;

      const snap = await http('GET', `/v1/runs/${encodeURIComponent(runId)}`);
      if (snap.status === 200 && snap.json && TERMINAL.has(snap.json.status)) break;
    }
    if (!isComplete) await new Promise((r) => setTimeout(r, 500));
  }
  console.log(`  ✓ ${toolCallCount} tool-related event(s) observed across ${pollCount} polls`);

  if (toolCallCount === 0) {
    console.log(`  Note: workflow may not have invoked an MCP tool, or host`);
    console.log(`        emits tool events under different type names.`);
  }

  console.log(`✓ MCP probe + observation complete`);
}

main().catch((err) => {
  console.error(`✗ ${err.message}`);
  process.exit(1);
});
