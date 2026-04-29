/**
 * Runtime capabilities scenarios (G23) — partial coverage / forward-compat.
 *
 * G23 (Runtime Capability Declarations) is a post-v1.0 additive
 * enhancement that lets a NodeModule declare host facilities it depends
 * on via `requires: ['chat.sendPrompt']` and lets the host advertise the
 * providers it has registered via `runtimeCapabilities: string[]` in the
 * `/.well-known/wop` response. Per the v1 spec status legend
 * (capabilities.md §"Status legend"), this is **(future)** — clients MUST
 * tolerate its absence.
 *
 * Scenarios in this file:
 *
 *   1. Forward-compat shape check — IF `runtimeCapabilities` is present
 *      in the discovery response, it MUST be a string array of unique,
 *      non-empty entries.
 *   2. (Deferred) End-to-end dispatch refusal — when a workflow uses a
 *      NodeModule that declares `requires: ['<unsupported>']`, the run
 *      MUST terminate with `RunSnapshot.error.code =
 *      'capability_not_provided'` and MUST NOT execute the node.
 *
 * The deferred E2E needs a fixture node that declares a `requires` entry
 * the conformance host is guaranteed not to provide. That fixture lands
 * with G23's reference-implementation slice; spec'd here so reviewers
 * can see the eventual shape.
 *
 * Spec references (current):
 *   - docs/WORKFLOW_ORCHESTRATION_GAPS.md §G23
 *   - docs/wop-spec/v1/capabilities.md §"Runtime capabilities (future)"
 *   - packages/workflow-engine/src/protocol/RuntimeCapabilityRegistry.ts
 */

import { describe, it, expect } from 'vitest';
import { driver } from '../lib/driver.js';
import { pollUntilTerminal } from '../lib/polling.js';

describe('runtime-capabilities: /.well-known/wop forward-compat shape (G23)', () => {
  it('IF runtimeCapabilities is present, it MUST be a string[] of unique non-empty entries', async () => {
    const res = await driver.get('/.well-known/wop', { authenticated: false });

    expect(res.status, driver.describe(
      'capabilities.md §2',
      'discovery endpoint MUST return 200',
    )).toBe(200);

    const body = res.json as { runtimeCapabilities?: unknown } | undefined;
    const caps = body?.runtimeCapabilities;

    if (caps === undefined) {
      // Spec-allowed — runtimeCapabilities is (future). The vast majority
      // of v1.0 hosts will omit it. Assertion passes trivially; don't
      // force a value on a host that doesn't advertise any.
      expect(caps).toBeUndefined();
      return;
    }

    expect(Array.isArray(caps), driver.describe(
      'capabilities.md §"Runtime capabilities (future)"',
      'runtimeCapabilities MUST be an array when present',
    )).toBe(true);

    const arr = caps as unknown[];
    for (const entry of arr) {
      expect(typeof entry, driver.describe(
        'capabilities.md §"Runtime capabilities (future)"',
        'every runtimeCapabilities entry MUST be a string',
      )).toBe('string');
      expect((entry as string).length, driver.describe(
        'capabilities.md §"Runtime capabilities (future)"',
        'every runtimeCapabilities entry MUST be non-empty',
      )).toBeGreaterThan(0);
    }

    const unique = new Set(arr as string[]);
    expect(unique.size, driver.describe(
      'capabilities.md §"Runtime capabilities (future)"',
      'runtimeCapabilities entries MUST be unique',
    )).toBe(arr.length);
  });

});

// ── E2E dispatch refusal ─────────────────────────────────────────────────
//
// Requires the host to have registered the `conformance.requiresMissing`
// fixture node + seeded `conformance-capability-missing` workflow. The
// reference impl gates the node behind `WOP_CONFORMANCE_FIXTURES=1` —
// hosts that don't expose the fixture surface should skip this describe
// block in their conformance manifest.

describe('runtime-capabilities: dispatch refusal on unsatisfied requires (G23 E2E)', () => {
  it('terminates the run with error.code = capability_not_provided', async () => {
    const create = await driver.post('/v1/runs', {
      workflowId: 'conformance-capability-missing',
    });
    expect(create.status, driver.describe(
      'capabilities.md §"Runtime capabilities (future)"',
      'POST /v1/runs MUST accept the run; refusal is engine-side at dispatch time, not request-validation',
    )).toBe(201);
    const runId = (create.json as { runId: string }).runId;

    const terminal = await pollUntilTerminal(runId);

    expect(terminal.status, driver.describe(
      'capabilities.md §"Runtime capabilities (future)"',
      'a node with unsatisfied requires MUST cause the run to terminate as failed',
    )).toBe('failed');

    const error = (terminal as { error?: { code?: string; message?: string } }).error;
    expect(error?.code, driver.describe(
      'rest-endpoints.md §"Common error codes"',
      'terminal RunSnapshot.error.code MUST be "capability_not_provided"',
    )).toBe('capability_not_provided');

    expect(error?.message, driver.describe(
      'capabilities.md §"Runtime capabilities (future)"',
      'error.message MUST name the missing capability id verbatim so operators can act without grepping logs',
    )).toContain('conformance.never-provided');
  });
});
