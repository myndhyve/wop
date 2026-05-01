/**
 * Compatibility-profile derivation for WOP v1.x.
 *
 * Profiles are a named set of capability requirements. A host's profile
 * set is derived from the `/.well-known/wop` discovery payload — never
 * declared as a separate wire field. See `spec/v1/profiles.md` for the
 * normative predicate definitions.
 *
 * This module is the single canonical implementation of profile membership.
 * Conformance scenarios use it to gate profile-specific assertions; SDKs
 * MAY re-export the derivation helper to give clients a way to ask
 * "does this host satisfy `wop-secrets`?" without re-implementing the
 * predicates.
 *
 * **Derivation is deterministic and pure.** Same payload, same profile
 * set. No time-of-day, host-specific state, or hidden inputs.
 */

/**
 * Closed v1.x catalog. Adding a profile requires an RFC per
 * `RFCS/0001-rfc-process.md`.
 */
export const PROFILE_NAMES = [
  'wop-core',
  'wop-interrupts',
  'wop-stream-sse',
  'wop-stream-poll',
  'wop-secrets',
  'wop-provider-policy',
  'wop-node-packs',
] as const;

export type ProfileName = (typeof PROFILE_NAMES)[number];

/**
 * Loose typing for the discovery payload — just enough structure to
 * apply the predicates safely. Schema-level validation is the
 * conformance suite's `discovery.test.ts` job.
 */
export interface DiscoveryPayload {
  protocolVersion?: unknown;
  supportedEnvelopes?: unknown;
  schemaVersions?: unknown;
  limits?: {
    clarificationRounds?: unknown;
    schemaRounds?: unknown;
    envelopesPerTurn?: unknown;
    [key: string]: unknown;
  };
  supportedTransports?: unknown;
  secrets?: {
    supported?: unknown;
    scopes?: unknown;
    [key: string]: unknown;
  };
  aiProviders?: {
    supported?: unknown;
    byok?: unknown;
    policies?: {
      modes?: unknown;
      [key: string]: unknown;
    };
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

function isStringArray(value: unknown): value is readonly string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === 'string');
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

/**
 * `wop-core` predicate. Every other profile implies `wop-core`. A host
 * that fails this predicate is not WOP-compatible.
 *
 * @see spec/v1/profiles.md §`wop-core`
 */
export function isCore(c: DiscoveryPayload): boolean {
  if (typeof c.protocolVersion !== 'string') return false;
  if (!c.protocolVersion.startsWith('1.')) return false;
  if (!Array.isArray(c.supportedEnvelopes)) return false;
  if (!c.supportedEnvelopes.every((entry) => typeof entry === 'string')) return false;
  if (typeof c.schemaVersions !== 'object' || c.schemaVersions === null) return false;
  if (typeof c.limits !== 'object' || c.limits === null) return false;
  if (!isNonNegativeInteger(c.limits.clarificationRounds)) return false;
  if (!isNonNegativeInteger(c.limits.schemaRounds)) return false;
  if (!isNonNegativeInteger(c.limits.envelopesPerTurn)) return false;
  return true;
}

/**
 * `wop-interrupts` predicate.
 *
 * @see spec/v1/profiles.md §`wop-interrupts`
 */
export function isInterrupts(c: DiscoveryPayload): boolean {
  if (!isCore(c)) return false;
  if (!isStringArray(c.supportedEnvelopes)) return false;
  return c.supportedEnvelopes.includes('clarification.request');
}

/**
 * `wop-stream-sse` predicate (discovery-payload only — runtime SSE
 * behavior is verified by `stream-modes*.test.ts`).
 *
 * @see spec/v1/profiles.md §`wop-stream-sse`
 */
export function isStreamSse(c: DiscoveryPayload): boolean {
  if (!isCore(c)) return false;
  if (c.supportedTransports == null) return true;
  if (!isStringArray(c.supportedTransports)) return false;
  return c.supportedTransports.includes('rest');
}

/**
 * `wop-stream-poll` predicate (discovery-payload only — runtime polling
 * behavior is verified by `stream-modes.test.ts`).
 *
 * @see spec/v1/profiles.md §`wop-stream-poll`
 */
export function isStreamPoll(c: DiscoveryPayload): boolean {
  if (!isCore(c)) return false;
  if (c.supportedTransports == null) return true;
  if (!isStringArray(c.supportedTransports)) return false;
  return c.supportedTransports.includes('rest');
}

/**
 * `wop-secrets` predicate.
 *
 * @see spec/v1/profiles.md §`wop-secrets`
 */
export function isSecrets(c: DiscoveryPayload): boolean {
  if (!isCore(c)) return false;
  if (c.secrets == null || typeof c.secrets !== 'object') return false;
  if (c.secrets.supported !== true) return false;
  if (!isStringArray(c.secrets.scopes)) return false;
  return c.secrets.scopes.includes('user');
}

/**
 * `wop-provider-policy` predicate.
 *
 * @see spec/v1/profiles.md §`wop-provider-policy`
 */
export function isProviderPolicy(c: DiscoveryPayload): boolean {
  if (!isCore(c)) return false;
  if (c.aiProviders == null || typeof c.aiProviders !== 'object') return false;
  const policies = c.aiProviders.policies;
  if (policies == null || typeof policies !== 'object') return false;
  if (!isStringArray(policies.modes)) return false;
  if (policies.modes.length === 0) return false;
  return policies.modes.includes('optional');
}

/**
 * `wop-node-packs` discovery-only predicate. Runtime registry behavior
 * is verified by `pack-registry*.test.ts`. Discovery alone cannot tell
 * whether GET /v1/packs returns a list-shaped body.
 *
 * @see spec/v1/profiles.md §`wop-node-packs`
 */
export function isNodePacksDiscovery(c: DiscoveryPayload): boolean {
  return isCore(c);
}

/**
 * Derive the full profile set from a discovery payload.
 *
 * Returns a set sorted by `PROFILE_NAMES` order so output is stable
 * across calls and across implementations.
 */
export function deriveProfiles(c: DiscoveryPayload): readonly ProfileName[] {
  const result: ProfileName[] = [];
  if (isCore(c)) result.push('wop-core');
  if (isInterrupts(c)) result.push('wop-interrupts');
  if (isStreamSse(c)) result.push('wop-stream-sse');
  if (isStreamPoll(c)) result.push('wop-stream-poll');
  if (isSecrets(c)) result.push('wop-secrets');
  if (isProviderPolicy(c)) result.push('wop-provider-policy');
  if (isNodePacksDiscovery(c)) result.push('wop-node-packs');
  return result;
}

/**
 * One-shot membership check.
 */
export function hasProfile(c: DiscoveryPayload, profile: ProfileName): boolean {
  switch (profile) {
    case 'wop-core':
      return isCore(c);
    case 'wop-interrupts':
      return isInterrupts(c);
    case 'wop-stream-sse':
      return isStreamSse(c);
    case 'wop-stream-poll':
      return isStreamPoll(c);
    case 'wop-secrets':
      return isSecrets(c);
    case 'wop-provider-policy':
      return isProviderPolicy(c);
    case 'wop-node-packs':
      return isNodePacksDiscovery(c);
  }
}
