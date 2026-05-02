// Branch-fork example — diverge a run's execution from a chosen sequence.
//
// Branch mode (mode: 'branch') re-executes from `fromSeq` with optional
// runOptionsOverlay applied; downstream events MAY diverge by design.
// This is DIFFERENT from replay mode (mode: 'replay') which guarantees
// deterministic re-execution for time-travel debugging — most hosts
// (including MyndHyve as of 2026-05-02) implement branch but stub
// replay as 501.
//
// 1. Discover the host's wop-replay-fork advertisement.
// 2. Create a parent run that completes.
// 3. POST /v1/runs/{runId}:fork with mode=branch.
// 4. Poll fork until terminal.
// 5. Verify the fork reaches a terminal status.
//
// Profile required: wop-replay-fork (replay.supported: true and
//                   'branch' in replay.modes).
//
// Host target: MyndHyve. Skip-equivalent without WOP_MYNDHYVE_BASE_URL.
//
// @see spec/v1/replay.md
// @see spec/v1/profiles.md §wop-replay-fork

import { randomUUID } from 'node:crypto';

const BASE_URL = process.env.WOP_MYNDHYVE_BASE_URL ?? '';
const API_KEY = process.env.WOP_MYNDHYVE_API_KEY ?? '';
const WORKFLOW_ID = process.env.WOP_WORKFLOW_ID ?? 'conformance-noop';
const TERMINAL = new Set(['completed', 'failed', 'cancelled']);

if (!BASE_URL) {
  console.log('⊘ branch-fork: WOP_MYNDHYVE_BASE_URL unset — skip-equivalent.');
  process.exit(0);
}
if (!API_KEY) {
  console.error('✗ branch-fork: WOP_MYNDHYVE_API_KEY required.');
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

async function pollUntil(runId, predicate, { timeoutMs = 30000, intervalMs = 250 } = {}) {
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
  const discoveryRes = await fetch(`${BASE_URL}/.well-known/wop`);
  if (!discoveryRes.ok) {
    console.error(`✗ discovery failed: ${discoveryRes.status}`);
    process.exit(1);
  }
  const caps = await discoveryRes.json();
  const replay = caps.replay ?? {};
  if (replay.supported !== true) {
    console.log(`⊘ Host doesn't claim wop-replay-fork (replay.supported is ${replay.supported}).`);
    console.log(`  This example requires a host claiming the profile.`);
    process.exit(0); // skip-equivalent
  }
  const modes = Array.isArray(replay.modes) ? replay.modes : [];
  if (!modes.includes('branch')) {
    console.log(`⊘ Host doesn't advertise 'branch' mode (advertises: [${modes.join(', ')}]).`);
    process.exit(0);
  }
  console.log(`  ✓ Host claims wop-replay-fork; modes: [${modes.join(', ')}]`);

  // Phase 1 — parent run.
  const idemKey = `wop-example-branch-fork-${process.env.GITHUB_RUN_ID ?? randomUUID()}`;
  console.log(`→ POST /v1/runs (parent) — workflowId: "${WORKFLOW_ID}"`);
  const parent = await http('POST', '/v1/runs', { workflowId: WORKFLOW_ID }, { idempotencyKey: idemKey });
  if (parent.status === 404) {
    console.log(`⊘ Workflow "${WORKFLOW_ID}" not seeded on host; skip-equivalent.`);
    process.exit(0);
  }
  if (parent.status !== 201) {
    console.error(`✗ parent run failed: ${parent.status}`);
    process.exit(1);
  }
  const parentRunId = parent.json.runId;
  console.log(`  parentRunId: ${parentRunId}`);

  await pollUntil(parentRunId, (s) => TERMINAL.has(s.status));
  console.log(`  ✓ parent reached terminal`);

  // Phase 2 — branch-mode fork from sequence 0.
  console.log(`→ POST /v1/runs/${parentRunId}:fork { mode: 'branch', fromSeq: 0 }`);
  const fork = await http(
    'POST',
    `/v1/runs/${encodeURIComponent(parentRunId)}:fork`,
    { mode: 'branch', fromSeq: 0 },
    { idempotencyKey: `${idemKey}-fork` },
  );
  if (fork.status === 501) {
    console.log(`⊘ Fork mode=branch returned 501 — host has the route stubbed; skip-equivalent.`);
    process.exit(0);
  }
  if (![200, 201].includes(fork.status)) {
    console.error(`✗ fork failed: ${fork.status} ${JSON.stringify(fork.json)}`);
    process.exit(1);
  }
  const forkRunId = fork.json.runId;
  console.log(`  forkRunId: ${forkRunId}`);

  // Phase 3 — verify fork is a distinct run that reaches terminal.
  if (forkRunId === parentRunId) {
    console.error(`✗ fork returned same runId as parent — fork MUST mint a new runId`);
    process.exit(1);
  }
  const forkSnap = await pollUntil(forkRunId, (s) => TERMINAL.has(s.status));
  console.log(`  ✓ fork reached terminal: ${forkSnap.status}`);
  if (forkSnap.status !== 'completed') {
    console.error(`✗ Expected fork to complete, got ${forkSnap.status}`);
    process.exit(1);
  }
  console.log(`✓ Branch fork lifecycle complete`);
  console.log('');
  console.log('Note: branch mode permits divergent execution by design.');
  console.log('For deterministic replay, see spec/v1/replay.md mode=replay');
  console.log('and the conformance scenario replayDeterminism.test.ts.');
}

main().catch((err) => {
  console.error(`✗ ${err.message}`);
  process.exit(1);
});
