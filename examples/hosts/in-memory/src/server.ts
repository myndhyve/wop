/**
 * WOP in-memory reference host.
 *
 * A minimal, single-process, zero-runtime-deps implementation of the
 * WOP v1 wire contract. Built to:
 *
 *   1. Serve as the runnable example for the "WOP in 10 minutes" guide.
 *   2. Drive the @myndhyve/wop-conformance suite end-to-end.
 *   3. Anchor the INTEROP-MATRIX as a non-MyndHyve reference host.
 *
 * Design choices:
 *
 *   - Built-in Node `http` module — no express, no fetch dependencies.
 *   - All state in process memory — runs, events, idempotency cache.
 *   - Workflow "execution" is a tiny dispatch table over fixture node
 *     types: core.noop / core.delay. Real engines plug in here via
 *     a NodeRegistry; this host doesn't have one.
 *   - Profile: claims wop-core + wop-stream-poll + wop-stream-sse.
 *
 * NOT FOR PRODUCTION. Skip:
 *   - Persistence (process restart drops every run).
 *   - Multi-tenant scoping (single hardcoded tenant).
 *   - Auth beyond Bearer presence (no real JWT verification).
 *   - Layer 2 idempotency, redaction harness, BYOK, provider policy,
 *     node packs — none of these are advertised in the discovery
 *     payload, so the conformance suite doesn't gate on them.
 */

import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { randomUUID, createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { EventEmitter } from 'node:events';

const __dirname = dirname(fileURLToPath(import.meta.url));
const HOST = process.env.WOP_HOST ?? '127.0.0.1';
const PORT = Number(process.env.WOP_PORT ?? 3737);
const API_KEY = process.env.WOP_API_KEY ?? 'wop-inmem-dev-key';

// ─── Types ───────────────────────────────────────────────────────────────────

type RunStatus =
  | 'pending'
  | 'running'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'waiting-approval';

interface FixtureWorkflow {
  id: string;
  name: string;
  version: string;
  nodes: ReadonlyArray<{
    id: string;
    typeId: string;
    name: string;
    inputs: Record<string, unknown>;
  }>;
  variables?: ReadonlyArray<{
    name: string;
    type: string;
    required: boolean;
    defaultValue?: unknown;
  }>;
  settings?: { timeout?: number };
}

interface RunEvent {
  readonly seq: number;
  readonly runId: string;
  readonly type: string;
  readonly nodeId?: string;
  readonly data?: unknown;
  readonly timestamp: string;
}

interface Run {
  runId: string;
  workflowId: string;
  status: RunStatus;
  inputs: Record<string, unknown>;
  events: RunEvent[];
  startedAt: string;
  endedAt: string | null;
  error: { code: string; message: string } | null;
  cancelRequested: boolean;
  abortController: AbortController;
}

// ─── In-memory state ─────────────────────────────────────────────────────────

const workflows = new Map<string, FixtureWorkflow>();
const runs = new Map<string, Run>();

// Layer-1 idempotency cache. Per spec/v1/idempotency.md §"Cache key
// composition" — single tenant here so tenantId is constant. The composite
// key is sha256(tenantId + endpoint + idempotency-key); the stored entry
// includes the body hash so we can 409 on reuse with a different body.
interface IdempotencyEntry {
  status: number;
  body: string;
  contentType: string;
  bodyHash: string;
  storedAt: number;
}
const idempotencyCache = new Map<string, IdempotencyEntry>();
const IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours per spec

const eventBus = new EventEmitter();
eventBus.setMaxListeners(1000);

// ─── Fixture loading ─────────────────────────────────────────────────────────

function loadFixtures(): void {
  // Look for fixtures in conformance/fixtures/ at the public-repo root.
  // Walk up from this file until we find a `conformance/fixtures` dir.
  let probe = __dirname;
  for (let i = 0; i < 10; i++) {
    const candidate = join(probe, 'conformance', 'fixtures');
    try {
      const entries = readdirSync(candidate);
      for (const file of entries) {
        if (!file.endsWith('.json')) continue;
        const raw = readFileSync(join(candidate, file), 'utf8');
        const parsed = JSON.parse(raw) as FixtureWorkflow;
        workflows.set(parsed.id, parsed);
      }
      return;
    } catch {
      probe = dirname(probe);
    }
  }
  // No fixtures found — register a synthetic noop so basic discovery works.
  workflows.set('conformance-noop', {
    id: 'conformance-noop',
    name: 'Synthetic Noop',
    version: '1.0.0',
    nodes: [{ id: 'noop', typeId: 'core.noop', name: 'Noop', inputs: {} }],
  });
}

// ─── Workflow execution ──────────────────────────────────────────────────────

function appendEvent(run: Run, type: string, opts: { nodeId?: string; data?: unknown } = {}): void {
  const event: RunEvent = {
    seq: run.events.length,
    runId: run.runId,
    type,
    ...(opts.nodeId !== undefined ? { nodeId: opts.nodeId } : {}),
    ...(opts.data !== undefined ? { data: opts.data } : {}),
    timestamp: new Date().toISOString(),
  };
  run.events.push(event);
  eventBus.emit(`events:${run.runId}`, event);
}

type NodeOutcome = 'completed' | 'cancelled' | 'failed';

async function executeNode(
  run: Run,
  node: FixtureWorkflow['nodes'][number],
): Promise<NodeOutcome> {
  if (run.cancelRequested) {
    appendEvent(run, 'node.cancelled', { nodeId: node.id });
    return 'cancelled';
  }
  appendEvent(run, 'node.started', { nodeId: node.id });

  switch (node.typeId) {
    case 'core.noop':
      // Yields immediately.
      break;

    case 'core.delay': {
      const delayMs = resolveInputAsNumber(node.inputs.delayMs, run.inputs, 100);
      try {
        await sleep(delayMs, run.abortController.signal);
      } catch {
        // Aborted via cancel.
        appendEvent(run, 'node.cancelled', { nodeId: node.id });
        return 'cancelled';
      }
      break;
    }

    default:
      // Unknown node type — fail the run with a recognizable code.
      run.error = {
        code: 'unsupported_node_type',
        message: `In-memory host does not implement node type "${node.typeId}". This host supports core.noop and core.delay only.`,
      };
      appendEvent(run, 'node.failed', {
        nodeId: node.id,
        data: { code: 'unsupported_node_type', typeId: node.typeId },
      });
      return 'failed';
  }

  appendEvent(run, 'node.completed', { nodeId: node.id });
  return 'completed';
}

async function runWorkflow(run: Run): Promise<void> {
  const workflow = workflows.get(run.workflowId);
  if (!workflow) {
    run.status = 'failed';
    run.error = {
      code: 'workflow_not_found',
      message: `Unknown workflowId: ${run.workflowId}`,
    };
    appendEvent(run, 'run.failed', { data: run.error });
    run.endedAt = new Date().toISOString();
    return;
  }

  run.status = 'running';
  appendEvent(run, 'run.started');

  for (const node of workflow.nodes) {
    if (run.cancelRequested) {
      run.status = 'cancelled';
      appendEvent(run, 'run.cancelled');
      run.endedAt = new Date().toISOString();
      return;
    }
    const outcome = await executeNode(run, node);
    if (outcome === 'failed') {
      run.status = 'failed';
      appendEvent(run, 'run.failed', { data: run.error });
      run.endedAt = new Date().toISOString();
      return;
    }
    if (outcome === 'cancelled') {
      run.status = 'cancelled';
      appendEvent(run, 'run.cancelled');
      run.endedAt = new Date().toISOString();
      return;
    }
  }

  if (run.cancelRequested) {
    run.status = 'cancelled';
    appendEvent(run, 'run.cancelled');
  } else {
    run.status = 'completed';
    appendEvent(run, 'run.completed');
  }
  run.endedAt = new Date().toISOString();
}

function resolveInputAsNumber(
  declared: unknown,
  variables: Record<string, unknown>,
  fallback: number,
): number {
  if (
    declared !== null &&
    typeof declared === 'object' &&
    'type' in declared &&
    (declared as { type: unknown }).type === 'variable'
  ) {
    const variableName = (declared as { variableName?: string }).variableName;
    if (variableName !== undefined && typeof variables[variableName] === 'number') {
      return variables[variableName] as number;
    }
  }
  if (typeof declared === 'number') return declared;
  return fallback;
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new Error('aborted'));
      return;
    }
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = (): void => {
      clearTimeout(timer);
      reject(new Error('aborted'));
    };
    signal.addEventListener('abort', onAbort, { once: true });
  });
}

// ─── HTTP plumbing ───────────────────────────────────────────────────────────

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function sendJSON(
  res: ServerResponse,
  status: number,
  body: unknown,
  extraHeaders: Record<string, string> = {},
): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(payload),
    ...extraHeaders,
  });
  res.end(payload);
}

function sendError(
  res: ServerResponse,
  status: number,
  code: string,
  message: string,
  extra: Record<string, unknown> = {},
): void {
  // Per spec/v1/auth.md error envelope: {error: <code>, message: <human>, ...}.
  sendJSON(res, status, { error: code, message, ...extra });
}

function checkAuth(req: IncomingMessage, res: ServerResponse): boolean {
  const auth = req.headers.authorization;
  if (typeof auth !== 'string' || !auth.startsWith('Bearer ')) {
    sendError(res, 401, 'unauthenticated', 'Missing or malformed Authorization header.');
    return false;
  }
  const token = auth.slice('Bearer '.length).trim();
  if (token !== API_KEY) {
    // Per spec/v1/auth.md §3: invalid credential returns 401. 403 is for
    // valid credential lacking permission for the resource.
    sendError(res, 401, 'invalid_credential', 'Bearer token rejected.');
    return false;
  }
  return true;
}

function hashBody(body: string): string {
  return createHash('sha256').update(body).digest('hex');
}

function buildIdempotencyCacheKey(endpoint: string, key: string): string {
  return createHash('sha256').update(`single-tenant:${endpoint}:${key}`).digest('hex');
}

function pruneIdempotencyCache(): void {
  const cutoff = Date.now() - IDEMPOTENCY_TTL_MS;
  for (const [key, entry] of idempotencyCache) {
    if (entry.storedAt < cutoff) idempotencyCache.delete(key);
  }
}

// ─── Route handlers ──────────────────────────────────────────────────────────

function handleOpenApi(_req: IncomingMessage, res: ServerResponse): void {
  // Minimal OpenAPI 3.1 stub. The reference impl serves the canonical
  // `api/openapi.yaml` bundle from this repo's root; to keep the in-memory
  // host single-file, we emit just enough structure to satisfy the
  // discovery scenario's "openapi >= 3.1" assertion. Hosts that target
  // full OpenAPI conformance should serve api/openapi.yaml's converted
  // JSON form here.
  sendJSON(res, 200, {
    openapi: '3.1.0',
    info: {
      title: 'WOP in-memory reference host',
      version: '0.1.0',
      description:
        'Stub OpenAPI document. The full canonical OpenAPI bundle lives at api/openapi.yaml in the WOP repo. This host serves only the shape conformance suites assert on.',
    },
    paths: {
      '/.well-known/wop': { get: { summary: 'Capability discovery', responses: { '200': { description: 'OK' } } } },
      '/v1/runs': { post: { summary: 'Create run', responses: { '201': { description: 'Created' } } } },
      '/v1/runs/{runId}': { get: { summary: 'Get run snapshot', responses: { '200': { description: 'OK' } } } },
      '/v1/runs/{runId}/cancel': { post: { summary: 'Cancel run', responses: { '200': { description: 'OK' } } } },
      '/v1/runs/{runId}/events': { get: { summary: 'SSE event stream', responses: { '200': { description: 'OK' } } } },
      '/v1/runs/{runId}/events/poll': { get: { summary: 'Polling event read', responses: { '200': { description: 'OK' } } } },
    },
  });
}

function handleDiscovery(_req: IncomingMessage, res: ServerResponse): void {
  // Per spec/v1/capabilities.md: protocolVersion / supportedEnvelopes /
  // schemaVersions / limits required. No auth required for /.well-known/wop.
  const payload = {
    protocolVersion: '1.0.0',
    implementation: {
      name: 'wop-host-in-memory',
      version: '0.1.0',
      vendor: 'wop-spec (reference example)',
    },
    supportedEnvelopes: [],
    schemaVersions: {},
    limits: {
      clarificationRounds: 0,
      schemaRounds: 0,
      envelopesPerTurn: 0,
      maxNodeExecutions: 1000,
    },
    supportedTransports: ['rest'],
  };
  sendJSON(res, 200, payload, { 'Cache-Control': 'public, max-age=300' });
}

async function handleCreateRun(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (!checkAuth(req, res)) return;

  const bodyText = await readBody(req);
  let parsed: { workflowId?: string; inputs?: Record<string, unknown> };
  try {
    parsed = JSON.parse(bodyText) as { workflowId?: string; inputs?: Record<string, unknown> };
  } catch {
    sendError(res, 400, 'validation_error', 'Request body MUST be valid JSON.');
    return;
  }

  if (typeof parsed.workflowId !== 'string') {
    sendError(res, 400, 'validation_error', 'workflowId MUST be a string.');
    return;
  }

  const workflow = workflows.get(parsed.workflowId);
  if (!workflow) {
    sendError(res, 404, 'workflow_not_found', `Unknown workflowId: ${parsed.workflowId}`);
    return;
  }

  // Layer-1 idempotency. Per spec/v1/idempotency.md §"Concurrent duplicates"
  // and §"Caller responsibilities": same key + same body → cached replay;
  // same key + different body → 409 (caller misuse: a key is supposed to
  // pin one logical operation).
  const idempotencyKey = req.headers['idempotency-key'];
  const incomingBodyHash = hashBody(bodyText);
  if (typeof idempotencyKey === 'string') {
    pruneIdempotencyCache();
    const cacheKey = buildIdempotencyCacheKey('POST /v1/runs', idempotencyKey);
    const cached = idempotencyCache.get(cacheKey);
    if (cached) {
      if (cached.bodyHash !== incomingBodyHash) {
        sendError(
          res,
          409,
          'idempotency_key_conflict',
          'Idempotency-Key reused with a different request body. A key MUST pin exactly one logical operation.',
        );
        return;
      }
      res.writeHead(cached.status, {
        'Content-Type': cached.contentType,
        'Content-Length': Buffer.byteLength(cached.body),
        'WOP-Idempotent-Replay': 'true',
      });
      res.end(cached.body);
      return;
    }
  }

  const runId = `run-${randomUUID()}`;
  const inputs = parsed.inputs ?? {};
  const run: Run = {
    runId,
    workflowId: parsed.workflowId,
    status: 'pending',
    inputs,
    events: [],
    startedAt: new Date().toISOString(),
    endedAt: null,
    error: null,
    cancelRequested: false,
    abortController: new AbortController(),
  };
  runs.set(runId, run);

  const responseBody = {
    runId,
    status: run.status,
    workflowId: run.workflowId,
    startedAt: run.startedAt,
  };
  const responseText = JSON.stringify(responseBody);

  // Cache before kicking off async execution so a retry within the run's
  // lifetime gets the cached response.
  if (typeof idempotencyKey === 'string') {
    const cacheKey = buildIdempotencyCacheKey('POST /v1/runs', idempotencyKey);
    idempotencyCache.set(cacheKey, {
      status: 201,
      body: responseText,
      contentType: 'application/json',
      bodyHash: incomingBodyHash,
      storedAt: Date.now(),
    });
  }

  // Fire-and-forget execution. Any throw in runWorkflow becomes a
  // run.failed event; we don't bubble exceptions to the HTTP layer.
  void runWorkflow(run).catch((err: unknown) => {
    const message = err instanceof Error ? err.message : String(err);
    run.status = 'failed';
    run.error = { code: 'internal', message };
    appendEvent(run, 'run.failed', { data: run.error });
    run.endedAt = new Date().toISOString();
  });

  res.writeHead(201, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(responseText),
    'WOP-Idempotent-Replay': typeof idempotencyKey === 'string' ? 'false' : '',
  });
  res.end(responseText);
}

function handleGetRun(req: IncomingMessage, res: ServerResponse, runId: string): void {
  if (!checkAuth(req, res)) return;

  const run = runs.get(runId);
  if (!run) {
    sendError(res, 404, 'run_not_found', `Unknown runId: ${runId}`);
    return;
  }

  const snapshot = {
    runId: run.runId,
    workflowId: run.workflowId,
    status: run.status,
    inputs: run.inputs,
    startedAt: run.startedAt,
    endedAt: run.endedAt,
    ...(run.error ? { error: run.error } : {}),
  };
  sendJSON(res, 200, snapshot);
}

async function handleCancelRun(
  req: IncomingMessage,
  res: ServerResponse,
  runId: string,
): Promise<void> {
  if (!checkAuth(req, res)) return;

  // Drain body even if we don't use it, so request is closed cleanly.
  await readBody(req);

  const run = runs.get(runId);
  if (!run) {
    sendError(res, 404, 'run_not_found', `Unknown runId: ${runId}`);
    return;
  }

  if (run.status === 'completed' || run.status === 'failed' || run.status === 'cancelled') {
    sendJSON(res, 200, { runId, status: run.status, alreadyTerminal: true });
    return;
  }

  run.cancelRequested = true;
  run.abortController.abort();
  // Cancellation propagates via the run loop's cancelRequested check.
  // Per rest-endpoints.md POST /v1/runs/{runId}/cancel: response status MUST
  // be one of `cancelled` or `cancelling`.
  sendJSON(res, 200, { runId, status: 'cancelling' });
}

function handleEventsPoll(
  req: IncomingMessage,
  res: ServerResponse,
  runId: string,
  url: URL,
): void {
  if (!checkAuth(req, res)) return;

  const run = runs.get(runId);
  if (!run) {
    sendError(res, 404, 'run_not_found', `Unknown runId: ${runId}`);
    return;
  }

  const sinceParam = url.searchParams.get('since');
  const since = sinceParam !== null ? Number(sinceParam) : -1;
  const events = run.events.filter((e) => e.seq > since);
  const lastSeq = events.length > 0 ? events[events.length - 1]!.seq : since;

  sendJSON(res, 200, {
    runId,
    events,
    lastEventSeq: lastSeq,
    runStatus: run.status,
    isTerminal: run.status === 'completed' || run.status === 'failed' || run.status === 'cancelled',
  });
}

function handleEventsSse(req: IncomingMessage, res: ServerResponse, runId: string): void {
  if (!checkAuth(req, res)) return;

  const run = runs.get(runId);
  if (!run) {
    sendError(res, 404, 'run_not_found', `Unknown runId: ${runId}`);
    return;
  }

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });

  const writeEvent = (event: RunEvent): void => {
    res.write(`id: ${event.seq}\n`);
    res.write(`event: ${event.type}\n`);
    res.write(`data: ${JSON.stringify(event)}\n\n`);
  };

  // Replay backlog.
  for (const event of run.events) writeEvent(event);

  // If already terminal, close.
  if (run.status === 'completed' || run.status === 'failed' || run.status === 'cancelled') {
    res.end();
    return;
  }

  const onEvent = (event: RunEvent): void => {
    writeEvent(event);
    if (event.type === 'run.completed' || event.type === 'run.failed' || event.type === 'run.cancelled') {
      eventBus.off(`events:${runId}`, onEvent);
      res.end();
    }
  };
  eventBus.on(`events:${runId}`, onEvent);

  req.on('close', () => {
    eventBus.off(`events:${runId}`, onEvent);
  });
}

// ─── Router ──────────────────────────────────────────────────────────────────

const RUN_ID_PATTERN = /^\/v1\/runs\/([^/]+)$/;
const RUN_CANCEL_PATTERN = /^\/v1\/runs\/([^/]+)\/cancel$/;
const RUN_EVENTS_POLL_PATTERN = /^\/v1\/runs\/([^/]+)\/events\/poll$/;
const RUN_EVENTS_SSE_PATTERN = /^\/v1\/runs\/([^/]+)\/events$/;

async function route(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
  const path = url.pathname;
  const method = req.method ?? 'GET';

  if (method === 'GET' && path === '/.well-known/wop') {
    return handleDiscovery(req, res);
  }
  if (method === 'GET' && path === '/v1/openapi.json') {
    return handleOpenApi(req, res);
  }
  if (method === 'POST' && path === '/v1/runs') {
    return handleCreateRun(req, res);
  }

  let m = RUN_EVENTS_POLL_PATTERN.exec(path);
  if (m && method === 'GET') return handleEventsPoll(req, res, m[1]!, url);

  m = RUN_EVENTS_SSE_PATTERN.exec(path);
  if (m && method === 'GET') return handleEventsSse(req, res, m[1]!);

  m = RUN_CANCEL_PATTERN.exec(path);
  if (m && method === 'POST') return handleCancelRun(req, res, m[1]!);

  m = RUN_ID_PATTERN.exec(path);
  if (m && method === 'GET') return handleGetRun(req, res, m[1]!);

  sendError(res, 404, 'not_found', `No route for ${method} ${path}`);
}

// ─── Bootstrap ───────────────────────────────────────────────────────────────

loadFixtures();

const server = createServer((req, res) => {
  void route(req, res).catch((err: unknown) => {
    const message = err instanceof Error ? err.message : String(err);
    if (!res.headersSent) {
      sendError(res, 500, 'internal', message);
    } else {
      res.end();
    }
  });
});

server.listen(PORT, HOST, () => {
  console.log(
    `[wop-host-in-memory] listening on http://${HOST}:${PORT} (api key: ${API_KEY}, ${workflows.size} fixtures loaded)`,
  );
});
