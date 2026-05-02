/**
 * MCP-discoverability scenarios — added 2026-05-02 / suite v1.16.0.
 *
 * `spec/v1/mcp-integration.md` §"Conformance + interop" calls out
 * `capabilities.mcp` as host-implementation-defined (not a normative
 * WOP field). The spec doesn't prescribe a wire-level MCP integration,
 * but it DOES say a WOP host that supports MCP "advertises the
 * capability and (per the host's choice) lists supported MCP servers."
 *
 * What this scenario locks in: IF a host advertises MCP-compatibility
 * — under either the standard `capabilities.mcp` slot OR a
 * vendor-namespaced slot like `capabilities.<vendor>.mcp` — it MUST
 * follow a consistent shape so clients can discover serverUrls
 * without per-vendor coupling.
 *
 * Required shape (when advertised):
 *   { supported: boolean, serverUrls: string[] }
 *
 * Hosts that don't advertise any MCP capability skip-equivalent
 * (test passes with no failed assertions per suite convention).
 *
 * @see spec/v1/mcp-integration.md
 * @see spec/v1/positioning.md (why MCP composes with WOP)
 */

import { describe, it, expect } from 'vitest';
import { driver } from '../lib/driver.js';

interface McpAdvertisement {
  supported?: unknown;
  serverUrls?: unknown;
}

interface DiscoveredMcp {
  path: string;
  ad: McpAdvertisement;
}

function collectMcpAdvertisements(caps: unknown): DiscoveredMcp[] {
  if (caps === null || typeof caps !== 'object') return [];
  const out: DiscoveredMcp[] = [];
  const capsObj = caps as Record<string, unknown>;

  // Standard slot per mcp-integration.md §"Conformance + interop"
  if (capsObj.mcp !== null && typeof capsObj.mcp === 'object') {
    out.push({ path: 'mcp', ad: capsObj.mcp as McpAdvertisement });
  }

  // Vendor-namespaced slot (host-implementation-defined per spec)
  for (const [key, value] of Object.entries(capsObj)) {
    if (key === 'mcp') continue;
    if (value === null || typeof value !== 'object') continue;
    const inner = value as Record<string, unknown>;
    if ('mcp' in inner && inner.mcp !== null && typeof inner.mcp === 'object') {
      out.push({ path: `${key}.mcp`, ad: inner.mcp as McpAdvertisement });
    }
  }
  return out;
}

async function fetchMcpAdvertisements(): Promise<DiscoveredMcp[]> {
  const res = await driver.get('/.well-known/wop', { authenticated: false });
  if (res.status !== 200) return [];
  const caps = (res.json as { capabilities?: unknown })?.capabilities;
  return collectMcpAdvertisements(caps);
}

describe('mcp: discoverability shape', () => {
  it('any advertised MCP capability has well-formed shape ({supported, serverUrls})', async () => {
    const advertisements = await fetchMcpAdvertisements();
    if (advertisements.length === 0) return; // skip-equivalent: host does not advertise MCP

    for (const { path, ad } of advertisements) {
      expect(typeof ad.supported, driver.describe(
        'spec/v1/mcp-integration.md §"Conformance + interop"',
        `capabilities.${path}.supported MUST be boolean when advertised`,
      )).toBe('boolean');

      if (ad.supported === true) {
        expect(Array.isArray(ad.serverUrls), driver.describe(
          'spec/v1/mcp-integration.md',
          `capabilities.${path}.serverUrls MUST be an array when supported:true`,
        )).toBe(true);

        if (Array.isArray(ad.serverUrls)) {
          expect(ad.serverUrls.length, driver.describe(
            'spec/v1/mcp-integration.md',
            `capabilities.${path}.serverUrls MUST be non-empty when supported:true`,
          )).toBeGreaterThan(0);

          for (const url of ad.serverUrls) {
            expect(typeof url, driver.describe(
              'spec/v1/mcp-integration.md',
              `capabilities.${path}.serverUrls entries MUST be strings`,
            )).toBe('string');
          }
        }
      }
    }
  });

  it('serverUrls are valid URL paths or absolute URLs', async () => {
    const advertisements = await fetchMcpAdvertisements();
    if (advertisements.length === 0) return; // skip-equivalent

    for (const { path, ad } of advertisements) {
      if (ad.supported !== true || !Array.isArray(ad.serverUrls)) continue;
      for (const url of ad.serverUrls) {
        if (typeof url !== 'string') continue;
        // Must be either a leading-slash path (host-relative) or an
        // absolute URL with http/https scheme. Anything else is
        // ambiguous to a client trying to connect.
        const isHostRelative = url.startsWith('/');
        const isAbsoluteHttp = url.startsWith('http://') || url.startsWith('https://');
        expect(isHostRelative || isAbsoluteHttp, driver.describe(
          'spec/v1/mcp-integration.md',
          `capabilities.${path}.serverUrls entry "${url}" MUST be a leading-slash path or absolute http(s) URL`,
        )).toBe(true);
      }
    }
  });
});
