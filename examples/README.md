# WOP Examples

Runnable example projects that demonstrate the WOP wire contract. Each example is self-contained — drop into the directory, `npm install`, `npm start`.

## Quick reference

| Example | Profile required | Host target | CI runs against |
|---|---|---|---|
| [`tiny-workflow/`](./tiny-workflow/) | `wop-core` | Any | in-memory host |
| [`streaming-client/`](./streaming-client/) | `wop-stream-sse` | Any | in-memory host |
| [`idempotent-runs/`](./idempotent-runs/) | `wop-core` | Any | in-memory host |
| [`approval-workflow/`](./approval-workflow/) | `wop-interrupts` | MyndHyve (or any host claiming the profile) | skip-equivalent without `WOP_MYNDHYVE_BASE_URL` |
| [`branch-fork/`](./branch-fork/) | `wop-replay-fork` (with `branch` mode) | MyndHyve | skip-equivalent without `WOP_MYNDHYVE_BASE_URL` |
| [`mcp-tool/`](./mcp-tool/) | host-extension probe (`myndhyve.mcp` or equivalent) | MyndHyve | skip-equivalent without `WOP_MYNDHYVE_BASE_URL` |
| [`node-pack-publishing/`](./node-pack-publishing/) | `wop-node-packs` | n/a — defaults to `--dry-run` mode | always passes (dry-run) |

## Env-var taxonomy

Each example reads from a small set of well-defined env vars. Defaults target the in-memory reference host so most examples "just work" with `npm start` after that host is up.

| Variable | Default | Used by |
|---|---|---|
| `WOP_BASE_URL` | `http://127.0.0.1:3737` | All in-memory-targeting examples (tiny / streaming / idempotent) |
| `WOP_API_KEY` | `wop-inmem-dev-key` | Same as above |
| `WOP_MYNDHYVE_BASE_URL` | (unset) | MyndHyve-targeting examples (approval, branch-fork, mcp-tool); when unset, those examples skip-equivalent |
| `WOP_MYNDHYVE_API_KEY` | (unset) | Same |
| `WOP_WORKFLOW_ID` | (per-example default) | Override the workflow used by that example |
| `WOP_PACK_REGISTRY_URL` | (unset) | `node-pack-publishing` `--live` mode only |
| `WOP_PACK_PUBLISH_KEY` | (unset) | `node-pack-publishing` `--live` mode only (super-admin Bearer) |

## Running locally

```bash
# Terminal 1 — start the in-memory reference host (most examples use this)
cd examples/hosts/in-memory && npm install && npm start

# Terminal 2 — run any in-memory-targeting example
cd examples/tiny-workflow && npm install && npm start

# To exercise MyndHyve-targeting examples, supply credentials:
WOP_MYNDHYVE_BASE_URL=https://workflow-runtime-gjw5bcse7a-uc.a.run.app \
WOP_MYNDHYVE_API_KEY=$YOUR_KEY \
  npm start --prefix examples/approval-workflow
```

## CI behavior

`.github/workflows/examples.yml` runs every example end-to-end. Each example declares its `host:` target in the matrix:

- `host: in-memory` — CI starts the in-memory reference host, runs the example.
- `host: myndhyve` — CI runs only when the env var the example documents is set as a secret. Default: skip-equivalent.
- `host: dry-run` — example needs no host; runs always.

Examples that hit MyndHyve use `Idempotency-Key` so re-runs in CI don't multiply runs against the production canonical URL.

## Adding an example

1. Drop a new dir under `examples/<name>/` with `package.json` + `README.md` + the example source.
2. README header MUST include the standard table:

   ```markdown
   | Profile required | <profile name> |
   | Host target      | <in-memory / MyndHyve / dry-run> |
   | Run modes        | <default / --live / etc> |
   ```

3. Add a row to the matrix in `.github/workflows/examples.yml`.
4. The example MUST `process.exit(1)` on any unexpected status code or shape mismatch — silent success is forbidden.

## See also

- [`hosts/in-memory/`](./hosts/in-memory/) — reference host that powers most examples.
- [`hosts/sqlite/`](./hosts/sqlite/) — durable reference host; "build your own host" walkthrough.
- [`../QUICKSTART-10MIN.md`](../QUICKSTART-10MIN.md) — fastest "hello world" path.
- [`../spec/v1/profiles.md`](../spec/v1/profiles.md) — closed catalog of compatibility profiles examples gate on.
