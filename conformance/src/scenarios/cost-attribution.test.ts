/**
 * Cost attribution scenarios (G6 / O4) — partial coverage.
 *
 * The runtime side of G6 ships with:
 *   - WOP_COST_ATTRIBUTE_NAMES allowlist (6 attributes)
 *   - sanitizeCostForOtel() pure function with redaction enforcement
 *   - applyCostAttributesToSpan() wired into ctx.recordCost() in Cloud Run
 *   - RunSnapshot.metrics.wopCost rollup exposed via GET /v1/runs/{runId}
 *   - 15 unit tests including 3 dedicated redaction assertions
 *     (packages/workflow-engine/src/observability/__tests__/costAttribution.test.ts)
 *
 * Runnable scenario below: forward-compat shape check on any run's
 * metrics.wopCost — passes if the field is absent (allowed) AND if
 * present validates the spec-canonical shape.
 *
 * Still-deferred scenarios: end-to-end content checks require a
 * fixture node that invokes ctx.recordCost(). The Core WOP node set
 * (start/end/conditional/delay/loop/parallel/merge/setVar/getVar/
 * interrupt/identity/subWorkflow/channelWrite) doesn't include a cost-
 * emitter. Adding `conformance.cost.emit` is post-Phase-A work.
 *
 * Spec references:
 *   - docs/wop-spec/v1/observability.md §Cost attribution attributes
 *     (closes O4)
 *   - docs/wop-spec/v1/schemas/run-snapshot.schema.json §metrics.wopCost
 *   - docs/WORKFLOW_ORCHESTRATION_GAPS.md §G6
 */

import { describe, it, expect } from 'vitest';
import { driver } from '../lib/driver.js';
import { pollUntilTerminal } from '../lib/polling.js';

describe('cost-attribution: metrics.wopCost forward-compat shape (G6)', () => {
  it('on any run, IF metrics.wopCost is present, its shape MUST match the spec', async () => {
    // Use the noop fixture so we don't depend on AI nodes. The fixture
    // doesn't emit recordCost, so metrics.wopCost will typically be
    // absent — that's allowed. The assertion is forward-compat: when
    // present, the structure MUST be the canonical one.
    const create = await driver.post('/v1/runs', { workflowId: 'conformance-noop' });
    expect(create.status).toBe(201);
    const runId = (create.json as { runId: string }).runId;

    const terminal = await pollUntilTerminal(runId);
    const wopCost = terminal.metrics?.wopCost;

    if (wopCost === undefined) {
      // Spec-allowed — the noop fixture has no cost emission. Assertion
      // passes trivially; don't force a value on a workflow that produces
      // no cost.
      expect(wopCost).toBeUndefined();
      return;
    }

    // When present, validate the canonical shape per
    // run-snapshot.schema.json §metrics.wopCost.
    if ('usd' in wopCost) {
      expect(typeof wopCost.usd, 'metrics.wopCost.usd MUST be a number').toBe('number');
      expect(wopCost.usd!, 'metrics.wopCost.usd MUST be >= 0').toBeGreaterThanOrEqual(0);
    }
    if ('tokens' in wopCost && wopCost.tokens) {
      if ('input' in wopCost.tokens) {
        expect(Number.isInteger(wopCost.tokens.input)).toBe(true);
        expect(wopCost.tokens.input!).toBeGreaterThanOrEqual(0);
      }
      if ('output' in wopCost.tokens) {
        expect(Number.isInteger(wopCost.tokens.output)).toBe(true);
        expect(wopCost.tokens.output!).toBeGreaterThanOrEqual(0);
      }
    }
    if ('duration_ms' in wopCost) {
      expect(Number.isInteger(wopCost.duration_ms)).toBe(true);
      expect(wopCost.duration_ms!).toBeGreaterThanOrEqual(0);
    }
    if ('model' in wopCost) {
      expect(typeof wopCost.model, 'metrics.wopCost.model MUST be a string').toBe('string');
    }
    if ('provider' in wopCost) {
      expect(typeof wopCost.provider, 'metrics.wopCost.provider MUST be a string').toBe('string');
    }
  });
});

describe('cost-attribution: G6 / O4 (deferred — fixture node missing)', () => {
  it.todo('every node.completed for an AI-call node MUST carry wop.cost.* OTel attributes from the allowlist (provider, model, tokens.input, tokens.output, usd, duration_ms) — BLOCKED on a cost-emitting fixture node (`conformance.cost.emit`); runtime emission + RunSnapshot.metrics.wopCost surface ARE shipped');

  it.todo('the OTel span attribute set MUST NOT contain any key outside WOP_COST_ATTRIBUTE_NAMES (redaction) — BLOCKED on observable-span access; runtime enforcement is unit-tested at packages/workflow-engine/src/observability/__tests__/costAttribution.test.ts §"sanitizeCostForOtel — redaction"');

  it.todo('credential-shaped fields in the upstream provider response MUST NOT appear in any OTel attribute or in metrics.wopCost (regression test for G6 close-criteria allowlist enforcement) — BLOCKED on cost-emitting fixture; sanitizer-level redaction is unit-tested today and applies to BOTH the OTel and Firestore-rollup paths');

  it.todo('wop.cost.tokens.input / output MUST be non-negative integers in metrics.wopCost — sanitizer truncates fractional inputs (unit-tested); content assertion BLOCKED on cost-emitting fixture');

  it.todo('wop.cost.usd MUST be a non-negative number (fractional allowed) in metrics.wopCost — content assertion BLOCKED on cost-emitting fixture');
});
