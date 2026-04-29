# WOP Governance

> **Status:** Initial maintainer-driven model. This will evolve toward a working group / steering committee as the contributor base grows.

## Repository

The canonical WOP repository is `github.com/myndhyve/wop`. The current repository name reflects the project's incubation under MyndHyve; a move to a vendor-neutral org (e.g., `wop-spec`) is on the roadmap and will be announced via a CHANGELOG entry and a redirect on the original URL.

## Mission

WOP is a vendor-neutral protocol for declaring, running, streaming, interrupting, replaying, and validating durable AI workflows across hosts. The protocol must remain implementable by any host, including hosts unaffiliated with the original maintainers.

## Roles

### Contributors

Anyone who opens an issue, sends a pull request, files a conformance report, or participates in design discussions. No formal status required.

### Reviewers

Contributors with merge rights on a defined area of the corpus (e.g., a single SDK, a spec section). Appointed by maintainers. Listed in the repository's `CODEOWNERS` file once that file lands.

### Maintainers

Contributors with merge rights across the corpus and authority to cut releases. The initial maintainer set is:

- **David Tufts** (@davidtufts) — initial steward, MyndHyve

New maintainers are appointed by lazy consensus among existing maintainers (see "Decision making" below). Maintainers are expected to:

- Respond to issues and pull requests within five business days.
- Merge only changes that pass the CI gates listed in `CONTRIBUTING.md`.
- Follow the spec change process below for any normative change.
- Disclose conflicts of interest and recuse on relevant decisions.

A maintainer may step down at any time by opening a pull request that updates this file. A maintainer may be removed for sustained inactivity (>6 months) or code-of-conduct violations by lazy consensus of the remaining maintainers.

## Decision making

The default decision rule is **lazy consensus**: a proposal is adopted if no maintainer raises a substantive objection within seven calendar days of the proposal being filed as a pull request or RFC.

For decisions that require explicit signoff (see "Spec change process"), the rule is **two maintainer approvals** with no outstanding objections.

Tiebreaker for unresolved disagreement: the lead maintainer (the first entry in the maintainer list) holds final authority. This is a transitional rule and is expected to be replaced by a steering committee vote once the maintainer set has at least three independent organizations represented.

## Spec change process

Changes are categorized by impact on the wire contract:

| Category | Examples | Process |
|---|---|---|
| **Editorial** | Typo fixes, prose clarifications that don't change normative meaning, link fixes | One maintainer approval. Merge directly. |
| **Non-normative addition** | New examples, new non-normative reference impl notes, new optional capability profiles | One maintainer approval. Merge directly. CHANGELOG entry required. |
| **Normative addition (backward-compatible)** | New optional fields, new SHOULD recommendations, new event types in additive position | RFC issue + two maintainer approvals + 7-day comment window. CHANGELOG entry. Conformance suite update if applicable. |
| **Breaking change** | Any change that invalidates an existing v1.0 conformance pass | New major version. Requires public RFC, 30-day comment window, two maintainer approvals from different organizations once that's possible. The v1.0 contract is **locked**; breaking changes ship as v2.0+ in parallel, not as v1.X. |

Every spec change must:

1. Pass the CI gates documented in `CONTRIBUTING.md` (schema validation, OpenAPI/AsyncAPI lint, link check).
2. Update the CHANGELOG.
3. Update `@wop/conformance` if the change introduces new testable behavior. Conformance scenarios for new optional surfaces ship as minor releases of the suite (`1.X.0`) against the unchanged v1.0 protocol.

## Release process

- **Spec corpus** ships as named tags (`v1.0`, `v1.1`, …). Major versions are reserved for breaking changes.
- **SDKs** (`@wop/client`, `wop-client`, `wopclient` Go) ship independently with semantic versioning. SDK majors track the spec major they target.
- **Conformance suite** (`@wop/conformance`) ships independently. Suite majors track the spec major; minors add scenarios for the same spec major.

A release requires: passing CI on `main`, a CHANGELOG entry, and a maintainer cutting the tag. The release workflow at `.github/workflows/release.yml` automates package publication once the tag is pushed.

## Security

Security disclosures follow the process documented in `SECURITY.md`. Reports are received by the maintainer set and acknowledged within 72 hours. Embargoed coordinated disclosure is the default for vulnerabilities that affect deployed implementations.

## Trademark

"WOP" and "Workflow Orchestration Protocol" are not currently registered trademarks. Implementations are encouraged to describe themselves as "WOP-compliant" when they pass a published conformance suite version. If the maintainer set later registers a trademark, the policy will be added to this document with a notice period.

## Path to working group

This document anticipates a transition from maintainer-driven governance to a working-group model once the project meets these conditions:

1. At least three independent organizations have a maintainer in good standing.
2. At least two host implementations (one of which is not the MyndHyve reference) pass `@wop/conformance` v1.0.
3. The maintainer set agrees by lazy consensus that the project has outgrown maintainer-driven governance.

When those conditions are met, a working group charter will be filed as an RFC and ratified by lazy consensus among the current maintainers. The charter will define voting rules, term limits, and the succession model for the lead-maintainer role.

## Amendments

This document is amended via the same process as a non-normative addition (one maintainer approval; CHANGELOG entry). Changes that affect the maintainer set or the decision rule require two maintainer approvals.
