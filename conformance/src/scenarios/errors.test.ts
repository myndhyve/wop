/**
 * Error envelope shape — every non-2xx response MUST share the same
 * `{error, message, details?}` JSON shape. Per rest-endpoints.md.
 *
 * We exercise a few intentional failure paths and verify each error
 * response has the correct envelope.
 */

import { describe, it, expect } from 'vitest';
import { driver } from '../lib/driver.js';

interface ErrorEnvelope {
  error: unknown;
  message: unknown;
  details?: unknown;
}

function assertErrorEnvelope(body: unknown, specSection: string): void {
  expect(typeof body, driver.describe(specSection, 'error response MUST be a JSON object')).toBe(
    'object',
  );
  const env = body as ErrorEnvelope;

  expect(typeof env.error, driver.describe(
    specSection,
    'error envelope MUST include `error` (machine-readable string)',
  )).toBe('string');

  expect(typeof env.message, driver.describe(
    specSection,
    'error envelope MUST include `message` (human-readable string)',
  )).toBe('string');

  if (env.details !== undefined) {
    expect(typeof env.details, driver.describe(
      specSection,
      'error envelope `details` (when present) MUST be a JSON object',
    )).toBe('object');
  }
}

describe('errors: 404 envelope', () => {
  it('GET /v1/runs/{nonexistentId} returns canonical envelope', async () => {
    const res = await driver.get('/v1/runs/conformance-this-run-id-does-not-exist');

    expect(
      [403, 404].includes(res.status),
      driver.describe('rest-endpoints.md', 'unknown run MUST return 404 (or 403 if leaking existence is forbidden)'),
    ).toBe(true);

    assertErrorEnvelope(res.json, 'rest-endpoints.md error envelope');
  });
});

describe('errors: 400 envelope (validation)', () => {
  it('POST /v1/runs with empty body returns canonical envelope', async () => {
    const res = await driver.post('/v1/runs', {});

    // 400 is canonical, but some servers may return 422; accept either as
    // long as the envelope is correct. The point of this test is the shape,
    // not the status code.
    expect(
      res.status,
      driver.describe('rest-endpoints.md', 'malformed POST /v1/runs MUST return 4xx'),
    ).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(500);

    assertErrorEnvelope(res.json, 'rest-endpoints.md error envelope');
  });
});
