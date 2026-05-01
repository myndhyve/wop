# WOP Interop Matrix

> **Last updated:** 2026-05-01
> **Conformance suite:** `@myndhyve/wop-conformance@1.10.0`

This matrix records which WOP-compatible hosts pass which conformance scenarios. It's the protocol-equivalent of a browser-compatibility table: hosts declare their advertised profile set, run the conformance suite, and publish the result here.

A host's place in this matrix is a **claim plus evidence**. The claim is the host's advertised profile (per `spec/v1/profiles.md`). The evidence is the conformance result published in the host's repository or under `examples/hosts/<name>/conformance.md`.

## Hosts

| Host | Repo / Path | Profile claim | Scale claim | Conformance link |
|---|---|---|---|---|
| **MyndHyve** (reference, production) | `myndhyve/myndhyve` (`services/workflow-runtime/`) | `wop-core` · `wop-interrupts` · `wop-stream-sse` · `wop-stream-poll` · `wop-secrets` · `wop-provider-policy` · `wop-node-packs` | `production` | `https://workflow-runtime-gjw5bcse7a-uc.a.run.app` (Cloud Run) |
| **In-memory** (reference, example) | `examples/hosts/in-memory/` | `wop-core` · `wop-stream-sse` · `wop-stream-poll` | `minimal` | `examples/hosts/in-memory/conformance.md` |
| **SQLite** (planned, example) | `examples/hosts/sqlite/` | TBD (LT2.3 follow-up) | TBD | TBD |

Third-party hosts append rows by opening a PR with their conformance result + repo link. No vetting beyond "the suite passes against the URL you provided."

## Scenario coverage

Cells are: `✅` (pass), `❌` (fail), `–` (host doesn't claim the profile this scenario gates on; suite skips or treats as absent-fallback pass).

Suite scenarios are listed in suite-file order. Each row is a `*.test.ts` file under `conformance/src/scenarios/`.

| Scenario | MyndHyve | In-memory | SQLite |
|---|---|---|---|
| `discovery.test.ts` | ✅ | ✅ | – |
| `runs-lifecycle.test.ts` | ✅ | ✅ | – |
| `idempotency.test.ts` | ✅ | ✅ | – |
| `cancellation.test.ts` | ✅ | ✅ | – |
| `auth.test.ts` | ✅ | ✅ | – |
| `errors.test.ts` | ✅ | ✅ | – |
| `failure-path.test.ts` | ✅ | ✅ | – |
| `multi-node-ordering.test.ts` | ✅ | ✅ | – |
| `policies.test.ts` | ✅ | ✅ (skip-eq) | – |
| `redaction.test.ts` | ✅ | ✅ (skip-eq) | – |
| `cost-attribution.test.ts` | ✅ (5 todo) | ✅ (5 todo) | – |
| `fixtures-valid.test.ts` | ✅ | ✅ | – |
| `spec-corpus-validity.test.ts` | ✅ | ✅ | – |
| `profileDerivation.test.ts` | ✅ | ✅ | – |
| `highConcurrency.test.ts` | ✅ | ✅ | – |
| `runtime-capabilities.test.ts` | ✅ | ❌ | – |
| `version-negotiation.test.ts` | ✅ | ❌ (1/4) | – |
| `cap-breach.test.ts` | ✅ | – | – |
| `channel-ttl.test.ts` | ✅ | – | – |
| `subworkflow.test.ts` | ✅ | – | – |
| `replay-fork.test.ts` | ✅ | – (1/6) | – |
| `interrupt-approval.test.ts` | ✅ | – (out-of-profile) | – |
| `interrupt-clarification.test.ts` | ✅ | – (out-of-profile) | – |
| `approval-payload.test.ts` | ✅ | ✅ (shape only) | – |
| `pack-registry.test.ts` | ✅ | – (out-of-profile, partial absence-fallback) | – |
| `pack-registry-publish.test.ts` | ✅ | ✅ (skip-eq) | – |
| `stream-modes.test.ts` | ✅ | ❌ (3/4) | – |
| `stream-modes-buffer.test.ts` | ✅ | ❌ (1/4) | – |
| `stream-modes-mixed.test.ts` | ✅ | ❌ (2/4) | – |
| `identity-passthrough.test.ts` | ✅ | ❌ | – |

**Summary:**

- **MyndHyve:** All scenarios pass (suite version 1.10.0). Reference deployment at Cloud Run rev `workflow-runtime-00066-hom` (per `WOP-PHASED-DELIVERY.md §8`).
- **In-memory:** 16/30 files fully pass; 14 with at least one failure. Of the 14, 8 are out-of-profile (host doesn't claim the profile the scenarios gate on); 4 are within-profile but minor (event-shape gap, SSE buffering); 2 have partial passes. See `examples/hosts/in-memory/conformance.md` for the full per-file record.
- **SQLite:** Not yet implemented. LT2.3 follow-up.

## Glossary

- **Profile claim** — the set of WOP profiles a host advertises per `spec/v1/profiles.md`. Profiles are derived from `/.well-known/wop` capabilities; the conformance suite verifies them via `conformance/src/lib/profiles.ts`.
- **Scale claim** — the scale tier a host claims it sustains per `spec/v1/scale-profiles.md`. Tiers are `minimal` / `production` / `high-throughput`.
- **Skip-equivalent (skip-eq)** — a scenario passes against a host that doesn't advertise the relevant capability, because the suite's test path checks for the absence-fallback behavior. Documented per scenario.
- **Out-of-profile** — a scenario fails because the host doesn't claim the profile that gates it; this is **not a regression** for the host's claim. It just means the host is in a smaller profile set.

## How to add a host

1. Implement WOP v1 against your stack. The two reference hosts (`MyndHyve` for production-grade, `in-memory` for example-grade) demonstrate the spectrum.
2. Decide which profiles your host claims based on which capabilities you advertise in `/.well-known/wop`. Run the derivation locally:
   ```bash
   curl <your-host>/.well-known/wop | npx tsx -e 'process.stdin.pipe(...)'
   # or use lib/profiles.ts directly from the conformance suite
   ```
3. Run `@myndhyve/wop-conformance` against your live host. Capture the per-file pass/fail.
4. Publish the result in your repo (or under `examples/hosts/<name>/conformance.md` if you're adding a reference host to this repo).
5. Open a PR adding a row to the **Hosts** and **Scenario coverage** tables above.

The matrix is a living artifact. New conformance suite minors (suite version bumps) MAY introduce scenarios that change a host's coverage — re-run + update.

## See also

- `spec/v1/profiles.md` — profile predicate definitions.
- `spec/v1/scale-profiles.md` — scale tier definitions.
- `spec/v1/V1-FINAL-COMPLETION-PLAN.md` — six post-v1.0 conformance triggers (S3/S4/F2/F4/C3/O4); reference-host certification.
- `examples/hosts/in-memory/conformance.md` — full per-file record for the in-memory host.
- `conformance/README.md` — conformance suite usage.
