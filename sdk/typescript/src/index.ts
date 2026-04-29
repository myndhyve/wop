/**
 * @wop/client — TypeScript reference SDK for WOP-compliant servers.
 *
 * Public surface:
 *   - WopClient (auth + endpoint methods)
 *   - WopError (typed error wrapping ErrorEnvelope)
 *   - All request/response types mirroring the OpenAPI spec
 *   - streamEvents helper for advanced SSE use cases
 *
 * See README.md for usage examples.
 */

export { WopClient } from './client.js';
export type { WopClientOptions, MutationOptions } from './client.js';
export { WopError } from './types.js';
export type {
  Capabilities,
  CancelRunRequest,
  CancelRunResponse,
  CreateRunRequest,
  CreateRunResponse,
  ErrorEnvelope,
  ForkRunRequest,
  ForkRunResponse,
  InterruptByTokenInspection,
  PollEventsResponse,
  ResolveInterruptByTokenResponse,
  ResolveInterruptRequest,
  ResolveInterruptResponse,
  RunConfigurable,
  RunEventDoc,
  RunSnapshot,
  RunStatus,
  StreamMode,
} from './types.js';
export { streamEvents } from './sse.js';
export type { EventsStreamContext, EventsStreamOptions } from './sse.js';
