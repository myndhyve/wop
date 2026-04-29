# SECURITY

> **Status: STUB v1.0 (2026-04-29).** Placeholder for the security-advisory
> process. The protocol's normative security requirements are specified
> elsewhere (see `auth.md`, `idempotency.md`, `webhooks.md`); this file
> exists to give downstream implementors a single place to look up "how
> do I report a vulnerability in WOP itself?" Once the v1.0 reference
> implementation has a stable contact channel, this stub will graduate
> to a full advisory policy. Until then, treat the recommendations below
> as best-effort guidance, not normative protocol behavior.

## Reporting

If you discover a vulnerability in:

- the spec corpus (`spec/v1/`),
- the reference SDKs (`sdk/{typescript,python,go}/`),
- the conformance harness (`conformance/`),
- the schemas, OpenAPI, or AsyncAPI contracts,

please use one of these two channels:

**Preferred — GitHub Security Advisories**
File a private advisory at https://github.com/myndhyve/wop/security/advisories/new. GitHub provides an embargoed working space for coordinated disclosure, CVE coordination, and downstream notification.

**Email fallback — `security@myndhyve.ai`**
For reporters who prefer email or for non-vulnerability concerns (license violations, attribution disputes, suspected supply-chain issues).

**Do not file a public issue** for vulnerabilities — the public issue tracker is not embargoed.

## Scope

This file covers protocol- and reference-implementation-level
vulnerabilities only. Vulnerabilities in third-party WOP-compatible
servers, clients, or hosts are out of scope and should be reported to
the respective project's security contact.

For the full normative auth/authorization model, including the bearer
token format and the canonical 401/403 error envelope, see `auth.md`.
For idempotent run-creation and tenant isolation, see `idempotency.md`.
For webhook delivery integrity (HMAC signing, replay prevention), see
`webhooks.md`.

## Coordinated disclosure

Reporters SHOULD allow at least 90 days from initial report before
publishing details. The advisory team will acknowledge receipt and
provide a remediation timeline as quickly as resourcing allows. The
project is in early incubation; firm response-time SLAs will be
added once a maintainer rotation is in place.

If the vulnerability is being actively exploited, file the GitHub Security Advisory or email `security@myndhyve.ai` with the subject prefixed `[ACTIVE EXPLOIT]` so the maintainer set is paged.

## What's tracked

- The advisory team will assign each report a numeric `WOP-SA-YYYY-NNNN`
  identifier upon triage.
- Patched releases will reference the advisory ID in `CHANGELOG.md`
  under a `### Security` heading.
- A consolidated index of past advisories will live at
  `security/advisories.md` once the first advisory is
  resolved.

## Retired stubs

This document will be promoted from STUB to FINAL when:

1. ~~A stable advisory contact channel is in place.~~ **Done 2026-04-29** — GitHub Security Advisories enabled + `security@myndhyve.ai` provisioned.
2. The first advisory has been triaged end-to-end (acknowledgment →
   patch → public disclosure → CHANGELOG entry).
3. The 90-day disclosure window above has been confirmed against the
   host repository's release cadence.

Until then, expect this file to change without major-version bumps.
