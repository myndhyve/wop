/**
 * Env-var validation for the WOP conformance suite.
 *
 * Required:
 *   WOP_BASE_URL — the server root, e.g., https://api.example.com
 *   WOP_API_KEY  — credential for runs:read / manifest:read scopes
 *
 * Optional (cosmetic — surfaced in failure messages):
 *   WOP_IMPLEMENTATION_NAME    — e.g., "acme-wop-server"
 *   WOP_IMPLEMENTATION_VERSION — e.g., "1.0.0"
 */

export interface ConformanceEnv {
  readonly baseUrl: string;
  readonly apiKey: string;
  readonly implementationName: string;
  readonly implementationVersion: string;
}

let cached: ConformanceEnv | null = null;

export function loadEnv(): ConformanceEnv {
  if (cached) return cached;

  const baseUrl = process.env.WOP_BASE_URL?.trim();
  const apiKey = process.env.WOP_API_KEY?.trim();

  if (!baseUrl) {
    throw new Error(
      'WOP_BASE_URL env var is required. Example: WOP_BASE_URL=https://api.example.com',
    );
  }
  if (!apiKey) {
    throw new Error(
      'WOP_API_KEY env var is required. See docs/wop-spec/v1/auth.md for credential format.',
    );
  }

  // Strip trailing slash so URL composition is consistent.
  const normalizedBase = baseUrl.replace(/\/$/, '');

  cached = {
    baseUrl: normalizedBase,
    apiKey,
    implementationName: process.env.WOP_IMPLEMENTATION_NAME?.trim() ?? 'unknown',
    implementationVersion: process.env.WOP_IMPLEMENTATION_VERSION?.trim() ?? 'unknown',
  };
  return cached;
}
