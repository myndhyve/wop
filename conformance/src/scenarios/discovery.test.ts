/**
 * Discovery scenarios — `/.well-known/wop` and `/v1/openapi.json`.
 *
 * These are the only two endpoints that MUST work without authentication
 * (per `auth.md` §2 + `rest-endpoints.md`). They're the cheapest cross-
 * implementation contracts to verify.
 */

import { describe, it, expect } from 'vitest';
import { driver } from '../lib/driver.js';

describe('discovery: /.well-known/wop', () => {
  it('returns 200 with required Capabilities fields per capabilities.md §2', async () => {
    const res = await driver.get('/.well-known/wop', { authenticated: false });

    expect(res.status, driver.describe(
      'capabilities.md §2',
      'discovery endpoint MUST be reachable without auth and return 200',
    )).toBe(200);

    const body = res.json as Record<string, unknown> | undefined;
    expect(body, driver.describe('capabilities.md §2', 'response MUST be JSON')).toBeDefined();

    // Per capabilities.md §3 (in-package shape), these 4 fields are REQUIRED.
    for (const required of ['protocolVersion', 'supportedEnvelopes', 'schemaVersions', 'limits']) {
      expect(body?.[required], driver.describe(
        'capabilities.md §3',
        `Capabilities.${required} MUST be present`,
      )).toBeDefined();
    }
  });

  it('serves Cache-Control per capabilities.md §4 (caching guidance)', async () => {
    const res = await driver.get('/.well-known/wop', { authenticated: false });
    const cacheControl = res.headers.get('cache-control');

    expect(cacheControl, driver.describe(
      'capabilities.md §4',
      'response SHOULD carry a Cache-Control header to allow client caching',
    )).toBeTruthy();
  });

  it('declares non-zero limits per capabilities.md §3 (CapabilityLimiter shape)', async () => {
    const res = await driver.get('/.well-known/wop', { authenticated: false });
    const limits = (res.json as { limits?: Record<string, number> } | undefined)?.limits;

    expect(limits, driver.describe(
      'capabilities.md §3',
      'Capabilities.limits MUST be present',
    )).toBeDefined();

    for (const k of ['clarificationRounds', 'schemaRounds', 'envelopesPerTurn']) {
      const v = limits?.[k];
      expect(typeof v, driver.describe(
        'capabilities.md §3',
        `limits.${k} MUST be a non-negative integer`,
      )).toBe('number');
      expect(v ?? -1, driver.describe(
        'capabilities.md §3',
        `limits.${k} MUST be >= 0`,
      )).toBeGreaterThanOrEqual(0);
    }
  });
});

describe('discovery: /v1/openapi.json', () => {
  it('returns 200 with a parseable OpenAPI 3.1 document', async () => {
    const res = await driver.get('/v1/openapi.json', { authenticated: false });

    expect(res.status, driver.describe(
      'rest-endpoints.md',
      'self-describing OpenAPI endpoint MUST return 200',
    )).toBe(200);

    const body = res.json as { openapi?: string } | undefined;
    expect(body?.openapi, driver.describe(
      'rest-endpoints.md',
      'response MUST declare openapi >= 3.1',
    )).toMatch(/^3\.[1-9]/);
  });
});
