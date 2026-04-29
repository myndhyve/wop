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

The WOP security-advisory process is **TBD as of v1.0 final**. If you
discover a vulnerability in:

- the spec corpus (``),
- the reference SDKs (`sdk/{typescript,python,go}/`),
- the conformance harness (`conformance/`),

please open a private security advisory on the host repository
(GitHub: "Security" → "Advisories" → "Report a vulnerability") rather
than filing a public issue. If the host repository hasn't enabled
private advisories, email the repository owner address listed in the
top-level `CONTRIBUTING.md`.

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
publishing details. The advisory team will acknowledge receipt within
5 business days and provide a remediation timeline within 14 days.

If the vulnerability is being actively exploited, contact the host
repository owner directly via the advisory channel above with the
subject prefixed `[ACTIVE EXPLOIT]`.

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

1. A stable advisory contact channel is in place (private GitHub
   advisories enabled OR a dedicated security email).
2. The first advisory has been triaged end-to-end (acknowledgment →
   patch → public disclosure → CHANGELOG entry).
3. The 90-day disclosure window above has been confirmed against the
   host repository's release cadence.

Until then, expect this file to change without major-version bumps.
