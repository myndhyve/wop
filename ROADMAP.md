# WOP Roadmap

> **Status:** Living document. Updated as milestones land.

This roadmap distinguishes **stable v1.0** (locked contract), **v1.X minor work** (additive, conformance-only), and **post-v1.0 ecosystem** (extension profiles, infrastructure, governance).

The v1.0 protocol contract is **frozen**. Implementations validate themselves against `@wop/conformance` `1.0.0` (or any later `1.X.0`) at their own cadence. New scenarios ship as suite minors against the unchanged contract.

## Stable: v1.0 (released 2026-04-27)

Released and locked:

- 12 prose specs at FINAL v1.0
- 10 first-class JSON Schemas (compile clean under Ajv2020)
- OpenAPI 3.1 + AsyncAPI 3.1
- 3 reference SDKs: `@wop/client` (TS), `wop-client` (Python), `wopclient` (Go)
- `@wop/conformance` 1.0.0 with 82 scenarios

See [`CHANGELOG.md`](./CHANGELOG.md) for the release record and [`V1-FINAL-COMPLETION-PLAN.md`](./V1-FINAL-COMPLETION-PLAN.md) for the as-shipped delivery context (non-normative).

## v1.X minor: conformance suite expansion

These ship as `@wop/conformance` minor releases (`1.X.0`) against the unchanged v1.0 protocol. They do not modify the wire contract. Each line is a tracked trigger; status reflects the most recent suite release.

| Trigger | Closes | Status |
|---|---|---|
| SSE buffering scenarios | S3 | Suite 1.6.0 — shipped |
| Mixed-mode SSE scenarios | S4 | Suite 1.6.0 — shipped |
| Sub-workflow node module fixture | F2 | Pending — needs reference impl `core.subWorkflow` |
| Recursion-limit enforcement scenarios | F4 + CC-1 | Pending — needs runtime counter |
| Channel TTL reducer fold scenarios | C3 | Pending |
| AI cost attribution scenarios | O4 | Pending |

Triggers are detailed in [`V1-FINAL-COMPLETION-PLAN.md`](./V1-FINAL-COMPLETION-PLAN.md). Hosts publish which suite version they pass; non-pass on a later suite is **not** a v1.0 conformance regression.

## Post-v1.0 ecosystem

These are larger initiatives that expand the WOP ecosystem without modifying the v1.0 contract.

### Optional capability profiles

Capability profiles are clusters of optional behaviors a host can advertise via `/.well-known/wop`. They are documented as separate spec annexes. Each profile has its own conformance scenarios shipped as part of `@wop/conformance` and run only when the profile is advertised.

| Profile | Status | Notes |
|---|---|---|
| BYOK / secret resolution | Spec landed (`run-options.md` §"Credential references"); conformance pending host harness | Optional. Hosts that don't advertise `capabilities.secrets.supported = true` skip these scenarios. |
| Replay / fork | Spec landed (`replay.md`); conformance scenarios partial | Optional. |
| Channel TTL | Spec landed (`channels-and-reducers.md`); conformance pending | Optional. |
| Cost attribution | Spec landed (`observability.md` §"AI cost"); conformance pending | Optional. |

### Hosted infrastructure

| Item | Status | Notes |
|---|---|---|
| Hosted node-pack registry (`packs.wop.dev`) | Not started | Spec is firm at `registry-operations.md`; deployment is operations work. |
| Hosted docs site | Not started | Per-package READMEs cover near-term needs. |
| Public CI for community contributions | Not started | Currently runs in the source tree's CI. |

### SDK expansion

Additional SDKs ship only when there is concrete demand. The current set (TS, Python, Go) covers the most common host implementation languages. Candidates if requested: Rust, Java/Kotlin, Ruby, .NET.

### Implementation ecosystem

| Item | Status | Notes |
|---|---|---|
| MyndHyve reference host conformance certification | In progress | Tracked in MyndHyve-internal phased delivery plan. |
| Second independent host implementation | Not started | Needed to graduate to working-group governance per `GOVERNANCE.md`. |
| Third-party node-pack catalog | Not started | Depends on hosted registry. |

### Vendor-neutral org migration

The repository is currently at `github.com/myndhyve/wop`. Migration to a vendor-neutral org (target name: `wop-spec/wop`) is planned but **not on a calendar schedule**. The migration has a single tripwire:

> **Migration to `wop-spec/wop` is initiated when `MAINTAINERS.md` lists at least one maintainer not affiliated with the original steward (MyndHyve).**

When the tripwire fires, the migration plan is:

1. Open an RFC per `RFCS/0001-rfc-process.md` proposing the new org name and the mechanics (redirect, DNS, package owner transfer, CHANGELOG entry).
2. Ratify by maintainer lazy consensus (per `GOVERNANCE.md`).
3. Move the repository; configure `github.com/myndhyve/wop` as a permanent redirect.
4. Transfer ownership of npm scopes and PyPI/Go module names; old names continue resolving via metadata redirects where the package registry supports it.
5. Update all in-spec links to the new canonical URL in the next minor release.

Until the tripwire fires, the canonical URL remains `github.com/myndhyve/wop`. External implementers can rely on this URL through any v1.x release; migration will be announced via CHANGELOG, README banner, and direct outreach to known third-party implementers (per `MAINTAINERS.md` if the maintainer set has expanded).

Recruiting external maintainers is **out of band**. `MAINTAINERS.md` documents the criteria and process; this roadmap does not commit to a recruitment timeline.

## What this roadmap does not commit to

- A specific date for v1.1 or v2.0.
- Any breaking change to the v1.0 wire contract.
- Adoption by any specific vendor or platform.
- Hosting infrastructure on any specific cloud or domain (`packs.wop.dev` is the planned name; the deployment substrate is undecided).
- Migration of the repository to a different organization on a specific timeline (planned but not scheduled — gated on the tripwire described above and in `MAINTAINERS.md`).

## How to influence the roadmap

- **File an issue** with the `roadmap` label. Include the use case, not just the feature request.
- **Open a conformance report** if your implementation needs a scenario that doesn't exist yet.
- **Author an RFC** for a new capability profile. Profile RFCs follow the spec change process in `GOVERNANCE.md`.
