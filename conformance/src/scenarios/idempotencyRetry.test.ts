/**
 * Idempotency-retry scenarios per RFC 0002 (Status: Draft).
 *
 * Builds on `idempotency.test.ts` (which covers basic Layer-1 cache and
 * 409-on-body-conflict) by exercising the deterministic-dispatch
 * additions RFC 0002 introduces:
 *
 *   1. WOP-Idempotent-Replay header is present on every keyed response
 *      (RFC 0002 §1).
 *   2. Retry-budget floor — hosts handle ≥5 retries 100ms apart with
 *      the cached response (RFC 0002 §4 + scale-profiles.md §"Retry
 *      semantics").
 *   3. Same-key replay returns same runId across the budget.
 *   4. (Optional) hosts that advertise `limits.idempotencyAckTimeoutSec`
 *      MUST set it to integer ≥ 5 per RFC 0002 §5.
 *
 * RFC 0002 status note: as of 2026-05-01 this RFC is `Draft`. The
 * scenarios use SHOULD-vocabulary in their assertions where the RFC
 * promotes today's SHOULD to MUST. When RFC 0002 reaches `Accepted`
 * the assertions tighten in a follow-up suite minor.
 *
 * Profile gating: `wop-core` (and `wop-stream-poll` to read snapshots).
 * Every conforming host runs these.
 *
 * @see RFCS/0002-runs-idempotency-retry.md
 * @see spec/v1/idempotency.md
 * @see spec/v1/scale-profiles.md §"Retry semantics"
 */

import { describe, it, expect } from 'vitest';
import { driver } from '../lib/driver.js';

const WORKFLOW_ID = 'conformance-idempotent';

function freshKey(suffix: string): string {
  return `wop-conformance-${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${suffix}`;
}

describe('idempotency-retry: WOP-Idempotent-Replay header per RFC 0002 §1', () => {
  it('first request with new key returns false (or absent SHOULD per current spec); replay returns true', async () => {
    const key = freshKey('replay-header');
    const body = { workflowId: WORKFLOW_ID, inputs: { nonce: 'replay-test' } };

    const first = await driver.post('/v1/runs', body, { headers: { 'Idempotency-Key': key } });
    expect(first.status, driver.describe(
      'rest-endpoints.md',
      'first POST /v1/runs returns 201',
    )).toBe(201);

    const firstReplay = first.headers.get('wop-idempotent-replay');
    // Per RFC 0002 §1: header SHOULD be present even on the first call,
    // set to "false". Pre-RFC spec only requires it on the replay.
    // Permissive assertion: if present, MUST be "false" or "true".
    if (firstReplay !== null) {
      expect(['false', 'true'].includes(firstReplay), driver.describe(
        'RFC 0002 §1 (Draft) / idempotency.md §Server responsibilities',
        'WOP-Idempotent-Replay value MUST be "true" or "false"',
      )).toBe(true);
    }

    const replay = await driver.post('/v1/runs', body, { headers: { 'Idempotency-Key': key } });
    expect(
      [200, 201].includes(replay.status),
      driver.describe('idempotency.md §Layer 1', 'replay returns 200 or 201'),
    ).toBe(true);

    const replayHeader = replay.headers.get('wop-idempotent-replay');
    // Per idempotency.md §Server responsibilities #2: SHOULD be set.
    // RFC 0002 §1 promotes to MUST. Today's strictness: present on replay.
    expect(replayHeader, driver.describe(
      'idempotency.md §Server responsibilities #2',
      'WOP-Idempotent-Replay SHOULD be set on idempotent replay responses',
    )).not.toBeNull();
    if (replayHeader !== null) {
      expect(replayHeader, driver.describe(
        'idempotency.md §Server responsibilities #2',
        'WOP-Idempotent-Replay on replay MUST be "true"',
      )).toBe('true');
    }
  });
});

describe('idempotency-retry: 5-retry budget per RFC 0002 §4 + scale-profiles.md §"Retry semantics"', () => {
  it('5 retries 100ms apart with same key all return the same runId', async () => {
    const key = freshKey('retry-budget');
    const body = { workflowId: WORKFLOW_ID, inputs: { nonce: 'retry-budget' } };

    const responses = [];
    for (let i = 0; i < 5; i++) {
      const res = await driver.post('/v1/runs', body, { headers: { 'Idempotency-Key': key } });
      responses.push(res);
      if (i < 4) await new Promise((r) => setTimeout(r, 100));
    }

    for (const res of responses) {
      expect(
        [200, 201].includes(res.status),
        driver.describe(
          'scale-profiles.md §Retry semantics',
          'host MUST handle ≥5 retries 100ms apart without losing the cached response',
        ),
      ).toBe(true);
    }

    const runIds = new Set(responses.map((r) => (r.json as { runId?: string })?.runId));
    expect(runIds.size, driver.describe(
      'idempotency.md §Layer 1',
      '5 retries with same key MUST collapse to exactly one runId',
    )).toBe(1);
  });
});

describe('idempotency-retry: limits.idempotencyAckTimeoutSec contract per RFC 0002 §5', () => {
  it('host advertising idempotencyAckTimeoutSec sets integer ≥ 5', async () => {
    const res = await driver.get('/.well-known/wop', { authenticated: false });
    expect(res.status).toBe(200);

    const limits = (res.json as { limits?: Record<string, unknown> })?.limits;
    if (!limits) return; // limits required per capabilities.md §3 — covered elsewhere
    const ack = limits.idempotencyAckTimeoutSec;
    if (ack === undefined) {
      // Per RFC 0002 §5, the field is optional; absence implies the
      // 5-second floor. Nothing to assert.
      return;
    }
    expect(typeof ack === 'number' && Number.isInteger(ack), driver.describe(
      'RFC 0002 §5 (Draft)',
      'limits.idempotencyAckTimeoutSec MUST be an integer when advertised',
    )).toBe(true);
    expect(ack as number, driver.describe(
      'RFC 0002 §5 (Draft)',
      'limits.idempotencyAckTimeoutSec MUST be ≥ 5',
    )).toBeGreaterThanOrEqual(5);
  });
});
