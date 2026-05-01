# WOP in 10 Minutes

> The fastest possible path from "what is WOP?" to "I have a workflow running on my laptop." Zero MyndHyve / Firebase / React. Just Node 20+ and a clone of this repo.

This guide walks through:

1. **Minute 0–2** — Start the in-memory reference host.
2. **Minute 2–5** — Run a workflow via curl.
3. **Minute 5–8** — Run the same workflow via the TypeScript SDK.
4. **Minute 8–10** — Stream events live via SSE.

The general-audience `QUICKSTART.md` covers more (BYOK, fork, node packs, conformance) and assumes you already have a host running. This guide assumes you have nothing.

---

## Prerequisites

```bash
node --version  # MUST be >= 20
git --version
```

That's it. No Docker, no cloud account, no API keys.

---

## Minute 0–2 — Start the in-memory reference host

```bash
git clone https://github.com/myndhyve/wop.git
cd wop/examples/hosts/in-memory
npm install
npm start
```

Output:

```
[wop-host-in-memory] listening on http://127.0.0.1:3737 (api key: wop-inmem-dev-key, 16 fixtures loaded)
```

Leave this running. The host has no persistence — when you Ctrl-C it, every run is dropped. That's the point: it's a reference example, not a production host.

In a separate terminal, verify it works:

```bash
curl http://127.0.0.1:3737/.well-known/wop | head -c 300
```

You should see a JSON capability advertisement.

---

## Minute 2–5 — Run a workflow via curl

### Discover

```bash
curl -s http://127.0.0.1:3737/.well-known/wop | jq '{protocolVersion, implementation}'
```

```json
{
  "protocolVersion": "1.0.0",
  "implementation": {
    "name": "wop-host-in-memory",
    "version": "0.1.0",
    "vendor": "wop-spec (reference example)"
  }
}
```

### Create a run

```bash
curl -s -X POST http://127.0.0.1:3737/v1/runs \
  -H "Authorization: Bearer wop-inmem-dev-key" \
  -H "Content-Type: application/json" \
  -d '{"workflowId":"conformance-noop"}'
```

```json
{
  "runId": "run-3f...",
  "status": "pending",
  "workflowId": "conformance-noop",
  "startedAt": "2026-05-01T12:34:56.000Z"
}
```

Save the `runId`.

### Get the snapshot

```bash
RUN_ID=run-3f...  # paste your runId here
curl -s -H "Authorization: Bearer wop-inmem-dev-key" \
  http://127.0.0.1:3737/v1/runs/$RUN_ID
```

If you waited a moment, `status` is now `completed`.

You just ran a WOP workflow. Three HTTP calls. No client library, no schema validation, no auth ceremony beyond a Bearer token.

---

## Minute 5–8 — Run the same workflow via the TypeScript SDK

Open another terminal in the same repo:

```bash
cd wop/sdk/typescript
npm install
npm run build
```

Then create a tiny script:

```bash
mkdir -p /tmp/wop-quickstart && cd /tmp/wop-quickstart
cat > quickstart.mjs <<'EOF'
import { WopClient } from '/Users/your-username/dev/wop/sdk/typescript/dist/index.js';

const client = new WopClient({
  baseUrl: 'http://127.0.0.1:3737',
  apiKey: 'wop-inmem-dev-key',
});

const caps = await client.discover();
console.log('Server:', caps.implementation?.name);

const run = await client.createRun({ workflowId: 'conformance-noop' });
console.log('Created:', run.runId);

let snap;
do {
  await new Promise(r => setTimeout(r, 250));
  snap = await client.getRun(run.runId);
} while (!['completed', 'failed', 'cancelled'].includes(snap.status));
console.log('Final:', snap.status);
EOF

node quickstart.mjs
```

Output:

```
Server: wop-host-in-memory
Created: run-...
Final: completed
```

The SDK is doing the same three calls under the hood, but you get type-checked clients (`@myndhyve/wop` for TypeScript, `wop-client` for Python, the Go SDK at `github.com/myndhyve/wop/sdk/go`) and consistent error handling.

A simpler version that doesn't require building the SDK locally is at [`examples/tiny-workflow/`](./examples/tiny-workflow/) — pure `fetch`, no SDK at all.

---

## Minute 8–10 — Stream events live via SSE

```bash
cd wop/examples/streaming-client
npm start
```

Output:

```
→ POST /v1/runs { workflowId: "conformance-noop" }
  runId: run-...
→ Streaming /v1/runs/run-.../events
  [0] run.started
  [1] node.started node=noop
  [2] node.completed node=noop
  [3] run.completed
✓ Stream closed after 4 events
```

The host's SSE stream replays the backlog on connect (so you see all 4 events even though the run was instant) and closes on the terminal event. That's how you build a live UI without polling.

For a longer demonstration, run a `conformance-cancellable` workflow with `delayMs: 5000` and you can watch the events trickle in over 5 seconds:

```bash
WOP_WORKFLOW=conformance-cancellable npm start
```

Then in another terminal, while the run is mid-flight, cancel it:

```bash
curl -s -X POST -H "Authorization: Bearer wop-inmem-dev-key" \
  http://127.0.0.1:3737/v1/runs/$RUN_ID/cancel
```

The streaming client will receive `node.cancelled` + `run.cancelled` and exit.

---

## What you just learned

| Concept | Where to read |
|---|---|
| WOP wire contract | `spec/v1/rest-endpoints.md`, `spec/v1/capabilities.md` |
| Run lifecycle + events | `spec/v1/observability.md` §"Canonical run lifecycle event names" |
| SSE consumption | `spec/v1/stream-modes.md` |
| Idempotency | `spec/v1/idempotency.md` + [`examples/idempotent-runs/`](./examples/idempotent-runs/) |
| Compatibility profiles | `spec/v1/profiles.md` |
| Build your own host | [`examples/hosts/in-memory/`](./examples/hosts/in-memory/) — the host you just ran is one file |
| Conformance | `conformance/README.md` — run the suite against your own host |

---

## Where to go next

- **`QUICKSTART.md`** — comprehensive guide covering BYOK, fork, node packs, webhooks against any host.
- **`INTEROP-MATRIX.md`** — see which conformance scenarios pass against MyndHyve, in-memory, and (future) SQLite hosts.
- **`spec/v1/positioning.md`** — when to use WOP vs Temporal / Airflow / LangGraph / MCP.
- **Build a node pack** — `spec/v1/node-packs.md` walks through manifest authoring + signing.

---

## Troubleshooting

| Issue | Fix |
|---|---|
| `EADDRINUSE` on port 3737 | Set `WOP_PORT=3738 npm start` and update the URLs in this guide |
| `npm start` errors with "tsx not found" | Re-run `npm install` in `examples/hosts/in-memory/` |
| `401 unauthenticated` | Include `Authorization: Bearer wop-inmem-dev-key` (or whatever `WOP_API_KEY` you set) |
| `400 validation_error: workflowId MUST be a string` | Body must be valid JSON with `workflowId` as a top-level string |
| `404 workflow_not_found` | The host loads fixtures from `conformance/fixtures/`; ensure you cloned the full repo |

If something else doesn't work, file an issue at https://github.com/myndhyve/wop/issues — the in-memory host is supposed to "just work" for this guide.
