/**
 * Replay/fork scenarios — exercises `POST /v1/runs/{runId}:fork` per
 * `replay.md` and `rest-endpoints.md`.
 *
 * Strategy: start a `conformance-noop` run, wait for terminal, then
 * fork it. Two modes covered:
 *   - replay: re-execute from `fromSeq=0` (full replay). Should produce
 *     a new runId in terminal `completed` with no inputs change.
 *   - branch: re-execute from `fromSeq=0` with optional runOptionsOverlay.
 *
 * Plus error-path tests:
 *   - 400 on negative fromSeq.
 *   - 422 on fromSeq beyond the source run's event log length.
 *   - 400 on `replay` mode with non-empty runOptionsOverlay (per
 *     openapi.yaml — overlay is for branch only).
 */

import { describe, it, expect } from 'vitest';
import { driver } from '../lib/driver.js';
import { pollUntilTerminal } from '../lib/polling.js';

const SOURCE_WORKFLOW_ID = 'conformance-noop';

async function startAndFinishNoop(): Promise<string> {
  const create = await driver.post('/v1/runs', { workflowId: SOURCE_WORKFLOW_ID });
  if (create.status !== 201) {
    throw new Error(`Failed to start ${SOURCE_WORKFLOW_ID}: ${create.status}`);
  }
  const runId = (create.json as { runId: string }).runId;
  await pollUntilTerminal(runId);
  return runId;
}

describe('replay: fork from fromSeq=0 in replay mode', () => {
  it('produces a new run that reaches terminal `completed`', async () => {
    const sourceRunId = await startAndFinishNoop();

    const fork = await driver.post(
      `/v1/runs/${encodeURIComponent(sourceRunId)}:fork`,
      { fromSeq: 0, mode: 'replay' },
    );

    expect(fork.status, driver.describe(
      'rest-endpoints.md POST /v1/runs/{runId}:fork',
      'fork MUST return 201 on accepted replay',
    )).toBe(201);

    const body = fork.json as { runId?: unknown; sourceRunId?: unknown; mode?: unknown };
    expect(typeof body.runId, driver.describe(
      'replay.md',
      'fork response MUST include a new runId',
    )).toBe('string');
    expect(body.runId, 'forked runId MUST differ from source').not.toBe(sourceRunId);
    expect(body.sourceRunId, driver.describe(
      'replay.md',
      'fork response MUST echo sourceRunId',
    )).toBe(sourceRunId);
    expect(body.mode, 'fork response MUST echo mode').toBe('replay');

    const newRunId = body.runId as string;
    const terminal = await pollUntilTerminal(newRunId, { timeoutMs: 15_000 });
    expect(terminal.status, driver.describe(
      'replay.md',
      'replay of a successful run MUST reach the same terminal status',
    )).toBe('completed');
  });
});

describe('replay: fork from fromSeq=0 in branch mode with empty overlay', () => {
  it('produces a new run that reaches terminal `completed`', async () => {
    const sourceRunId = await startAndFinishNoop();

    const fork = await driver.post(
      `/v1/runs/${encodeURIComponent(sourceRunId)}:fork`,
      { fromSeq: 0, mode: 'branch', runOptionsOverlay: {} },
    );

    expect(fork.status, driver.describe(
      'rest-endpoints.md POST /v1/runs/{runId}:fork',
      'branch fork MUST return 201',
    )).toBe(201);

    const body = fork.json as { runId: string; mode: string };
    expect(body.mode).toBe('branch');

    const terminal = await pollUntilTerminal(body.runId, { timeoutMs: 15_000 });
    expect(terminal.status).toBe('completed');
  });
});

describe('replay: validation errors', () => {
  it('rejects negative fromSeq with 400', async () => {
    const sourceRunId = await startAndFinishNoop();
    const res = await driver.post(
      `/v1/runs/${encodeURIComponent(sourceRunId)}:fork`,
      { fromSeq: -1, mode: 'replay' },
    );
    expect(res.status, driver.describe(
      'rest-endpoints.md',
      'negative fromSeq MUST return 400',
    )).toBe(400);
  });

  it('rejects fromSeq beyond source event log length with 422', async () => {
    const sourceRunId = await startAndFinishNoop();
    // conformance-noop has at most a handful of events; 99999 is
    // guaranteed to be past the end.
    const res = await driver.post(
      `/v1/runs/${encodeURIComponent(sourceRunId)}:fork`,
      { fromSeq: 99999, mode: 'replay' },
    );
    expect(res.status, driver.describe(
      'rest-endpoints.md POST /v1/runs/{runId}:fork',
      'fromSeq beyond source event log MUST return 422',
    )).toBe(422);
  });

  it('rejects replay mode with non-empty runOptionsOverlay (overlay is branch-only)', async () => {
    const sourceRunId = await startAndFinishNoop();
    const res = await driver.post(
      `/v1/runs/${encodeURIComponent(sourceRunId)}:fork`,
      {
        fromSeq: 0,
        mode: 'replay',
        runOptionsOverlay: { configurable: { recursionLimit: 50 } },
      },
    );
    expect(res.status, driver.describe(
      'rest-endpoints.md POST /v1/runs/{runId}:fork',
      'replay mode + non-empty overlay MUST return 400 (overlay is branch-only)',
    )).toBe(400);
  });

  it('rejects fork on a non-existent run with 404', async () => {
    const res = await driver.post(
      '/v1/runs/conformance-no-such-run-id:fork',
      { fromSeq: 0, mode: 'replay' },
    );
    expect(
      [403, 404].includes(res.status),
      driver.describe('rest-endpoints.md', 'fork on unknown run MUST return 404 or 403'),
    ).toBe(true);
  });
});
