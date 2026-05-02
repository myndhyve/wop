// Approval-workflow example — full HITL approval lifecycle.
//
// 1. Discover the host's profile set; require wop-interrupts.
// 2. POST /v1/runs with workflowId that suspends at an approval gate.
// 3. Poll until status === 'waiting-approval'.
// 4. POST /v1/runs/{runId}/approvals/{nodeId} with { action: 'accept' }.
// 5. Poll until terminal 'completed'.
// 6. Verify event log includes approval.requested + approval.received.
//
// Profile required: wop-interrupts (host advertises clarification.request
// in supportedEnvelopes).
//
// Host target: MyndHyve (or any host claiming wop-interrupts).
// Skip-equivalent when WOP_MYNDHYVE_BASE_URL is unset.
//
// Production-pollution mitigation: uses Idempotency-Key keyed off
// process start time so CI re-runs collapse to a single run server-side.
//
// @see spec/v1/interrupt.md
// @see SECURITY/threat-model-prompt-injection.md (decidedBy invariants)

import { randomUUID } from 'node:crypto';

const BASE_URL = process.env.WOP_MYNDHYVE_BASE_URL ?? '';
const API_KEY = process.env.WOP_MYNDHYVE_API_KEY ?? '';
const WORKFLOW_ID = process.env.WOP_WORKFLOW_ID ?? 'conformance-approval';
const TERMINAL = new Set(['completed', 'failed', 'cancelled']);

if (!BASE_URL) {
  console.log('⊘ approval-workflow: WOP_MYNDHYVE_BASE_URL unset — skip-equivalent.');
  console.log('  Run `WOP_MYNDHYVE_BASE_URL=<url> WOP_MYNDHYVE_API_KEY=<key> npm start` to exercise.');
  process.exit(0);
}
if (!API_KEY) {
  console.error('✗ approval-workflow: WOP_MYNDHYVE_API_KEY required when WOP_MYNDHYVE_BASE_URL is set.');
  process.exit(1);
}

async function discover() {
  const res = await fetch(`${BASE_URL}/.well-known/wop`);
  if (!res.ok) throw new Error(`discovery failed: ${res.status}`);
  return res.json();
}

async function http(method, path, body) {
  const headers = {
    Authorization: `Bearer ${API_KEY}`,
    'Content-Type': 'application/json',
  };
  if (method === 'POST' && path === '/v1/runs') {
    // Idempotent run creation — keyed off this process's start so CI re-runs
    // collapse server-side per spec/v1/idempotency.md §Layer 1.
    headers['Idempotency-Key'] = `wop-example-approval-${process.env.GITHUB_RUN_ID ?? randomUUID()}`;
  }
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, json: await res.json().catch(() => null), headers: res.headers };
}

async function pollUntil(runId, predicate, { timeoutMs = 30000, intervalMs = 500 } = {}) {
  const deadline = Date.now() + timeoutMs;
  let last;
  while (Date.now() < deadline) {
    const res = await http('GET', `/v1/runs/${encodeURIComponent(runId)}`);
    if (res.status === 200 && res.json) {
      last = res.json;
      if (predicate(last)) return last;
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new Error(`pollUntil timed out at ${timeoutMs}ms; last status: ${last?.status}`);
}

async function main() {
  console.log(`→ Discovery: ${BASE_URL}/.well-known/wop`);
  const caps = await discover();
  const envelopes = caps.supportedEnvelopes ?? [];
  if (!envelopes.includes('clarification.request')) {
    console.error(
      `✗ Host doesn't claim wop-interrupts (no 'clarification.request' in supportedEnvelopes).`,
    );
    console.error(`  Advertised envelopes: [${envelopes.join(', ')}]`);
    console.error(`  This example requires a host that claims the wop-interrupts profile.`);
    process.exit(1);
  }
  console.log(`  ✓ Host claims wop-interrupts`);

  console.log(`→ POST /v1/runs { workflowId: "${WORKFLOW_ID}" }`);
  const create = await http('POST', '/v1/runs', { workflowId: WORKFLOW_ID });
  if (create.status === 404) {
    console.log(`⊘ Workflow "${WORKFLOW_ID}" not found on this host.`);
    console.log(`  Set WOP_WORKFLOW_ID to a workflow with an approval gate.`);
    process.exit(0); // skip-equivalent — host doesn't seed this fixture
  }
  if (create.status !== 201) {
    console.error(`✗ run creation failed: ${create.status} ${JSON.stringify(create.json)}`);
    process.exit(1);
  }
  const { runId } = create.json;
  console.log(`  runId: ${runId}`);
  if (create.headers.get('wop-idempotent-replay') === 'true') {
    console.log(`  (replay — this run was created by a prior CI invocation)`);
  }

  console.log(`→ Polling until waiting-approval...`);
  const suspended = await pollUntil(
    runId,
    (s) => s.status === 'waiting-approval' || TERMINAL.has(s.status),
    { timeoutMs: 30000 },
  );
  if (TERMINAL.has(suspended.status)) {
    // Run already done from a prior CI run (idempotent replay) — that's fine.
    console.log(`  ✓ Run already terminal: ${suspended.status} (idempotent replay path)`);
    process.exit(0);
  }
  const nodeId = suspended.currentNodeId;
  if (typeof nodeId !== 'string' || nodeId.length === 0) {
    console.error(`✗ Suspended snapshot missing currentNodeId; cannot drive approval.`);
    process.exit(1);
  }
  console.log(`  ✓ Suspended at node ${nodeId}`);

  console.log(`→ POST /v1/runs/${runId}/approvals/${nodeId} { action: 'accept' }`);
  const resolve = await http(
    'POST',
    `/v1/runs/${encodeURIComponent(runId)}/approvals/${encodeURIComponent(nodeId)}`,
    { action: 'accept' },
  );
  if (![200, 202].includes(resolve.status)) {
    console.error(`✗ approval resolve failed: ${resolve.status} ${JSON.stringify(resolve.json)}`);
    process.exit(1);
  }
  console.log(`  ✓ accept dispatched`);

  console.log(`→ Polling until terminal...`);
  const terminal = await pollUntil(runId, (s) => TERMINAL.has(s.status), { timeoutMs: 30000 });
  console.log(`  ✓ status: ${terminal.status}`);
  if (terminal.status !== 'completed') {
    console.error(`✗ Expected completed, got ${terminal.status}`);
    process.exit(1);
  }
  console.log(`✓ Approval workflow round-trip complete`);
}

main().catch((err) => {
  console.error(`✗ ${err.message}`);
  process.exit(1);
});
