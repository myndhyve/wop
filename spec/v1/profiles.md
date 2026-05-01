# WOP Spec v1 — Compatibility Profiles

> **Status: DRAFT v1.1 (2026-05-01).** Profiles are an additive layer over v1.0 capabilities. They MUST be derivable from existing `/.well-known/wop` fields without a wire-shape change. See `auth.md` for the status legend. Keywords MUST, SHOULD, MAY follow [RFC 2119](https://www.rfc-editor.org/rfc/rfc2119).

---

## Why this exists

"WOP-compatible" today means "passes some subset of `@myndhyve/wop-conformance`." That's accurate but not actionable: a host advertising `secrets.supported: true` and a host advertising `aiProviders.policies` aren't doing the same thing, and a client that depends on one doesn't necessarily work against the other.

A **compatibility profile** is a named set of capability requirements. A host that satisfies the requirements is in the profile. Clients pick the profile their workload depends on; hosts pick the profiles they implement; conformance matches the two.

Profiles are **derived from existing capability fields**, not declared as a new wire field. Two reasons:

1. **One source of truth.** A host that advertises `secrets.supported: true` but is "not in `wop-secrets`" would be a contradiction. Derivation makes it impossible.
2. **No protocol deploy.** Adding a `profiles[]` array to `/.well-known/wop` would touch every host's discovery payload and require a coordinated deploy. Derivation runs in the conformance suite and in client SDKs against the existing payload.

Per `COMPATIBILITY.md`, this document is additive — no v1.0 host implementation needs to change to be evaluated against profiles. Hosts that already satisfy a profile's requirements are already in it as of v1.0.

---

## Profile catalog

Seven v1.x profiles. The catalog is closed: new profiles require an RFC per `RFCS/0001-rfc-process.md`.

### `wop-core`

The minimum any conforming host MUST satisfy.

**Requirements:**
- `protocolVersion` is set to a `1.x.x` semver string.
- `supportedEnvelopes` is an array (MAY be empty for engine-only hosts that don't expose LLM-emitting nodes).
- `schemaVersions` is an object with non-negative integer values.
- `limits.clarificationRounds`, `limits.schemaRounds`, `limits.envelopesPerTurn` are all non-negative integers.

**Predicate:**

```
wop-core(c) :=
     typeof c.protocolVersion == 'string'
  && c.protocolVersion.startsWith('1.')
  && Array.isArray(c.supportedEnvelopes)
  && typeof c.schemaVersions == 'object'
  && typeof c.limits == 'object'
  && Number.isInteger(c.limits.clarificationRounds) && c.limits.clarificationRounds >= 0
  && Number.isInteger(c.limits.schemaRounds)         && c.limits.schemaRounds >= 0
  && Number.isInteger(c.limits.envelopesPerTurn)     && c.limits.envelopesPerTurn >= 0
```

A host that fails `wop-core` is not WOP-compatible. Every other profile implies `wop-core`.

### `wop-interrupts`

The host implements the interrupt/resume protocol per `interrupt.md`.

**Requirements:** This profile is satisfied by every conforming v1.0 host (interrupts are non-optional in v1.0 per `interrupt.md` §"Why this exists"). The profile exists so that downstream tooling can declare a dependency on interrupt-resume semantics explicitly.

**Predicate:**

```
wop-interrupts(c) :=
     wop-core(c)
  && c.supportedEnvelopes.includes('clarification.request')
```

The `clarification.request` envelope is the canonical interrupt envelope per `interrupt.md`. Approval-gate interrupts use a different mechanism (suspend/resume) but a host that supports clarifications MUST also support the suspend mechanism.

A host that genuinely doesn't expose any interrupt path (e.g., a fire-and-forget batch host) MAY publish without `clarification.request` in `supportedEnvelopes` and fail the `wop-interrupts` profile. Such hosts are still `wop-core`.

### `wop-stream-sse`

The host accepts SSE streaming on the events endpoint per `stream-modes.md`.

**Requirements:** SSE is the default streaming transport in v1.0. A host advertising `supportedTransports` either omits the field (REST-only is REQUIRED, SSE is RECOMMENDED) or includes `rest`. The conformance suite verifies SSE behavior at runtime.

**Predicate:**

```
wop-stream-sse(c) :=
     wop-core(c)
  && (c.supportedTransports == null || c.supportedTransports.includes('rest'))
```

This is a runtime profile: discovery-payload alone can't fully validate SSE behavior. Conformance scenarios in `stream-modes.test.ts`, `stream-modes-buffer.test.ts`, and `stream-modes-mixed.test.ts` exercise the wire behavior. A host passes `wop-stream-sse` when discovery passes the predicate AND those scenarios pass.

### `wop-stream-poll`

The host accepts polling on the events endpoint per `stream-modes.md` §"Polling mode."

**Requirements:** Polling is the fallback transport for clients that can't hold long-lived connections. A host advertises support implicitly by serving `GET /v1/runs/{runId}/events/poll` per `rest-endpoints.md`.

**Predicate:** Same shape as `wop-stream-sse` — runtime validated. Conformance scenarios in `stream-modes.test.ts` exercise polling.

```
wop-stream-poll(c) :=
     wop-core(c)
  && (c.supportedTransports == null || c.supportedTransports.includes('rest'))
```

A host MAY satisfy both `wop-stream-sse` and `wop-stream-poll`; in v1.0 most reference hosts do.

### `wop-secrets`

The host implements credential resolution per `run-options.md` §"Credential references" + `capabilities.md` §"Secrets."

**Requirements:** `secrets.supported: true` and `secrets.scopes` includes at least `user`. Hosts that advertise additional scopes (`tenant`, `run`) satisfy a richer subset; the predicate gates on the minimum.

**Predicate:**

```
wop-secrets(c) :=
     wop-core(c)
  && c.secrets != null
  && c.secrets.supported === true
  && Array.isArray(c.secrets.scopes)
  && c.secrets.scopes.includes('user')
```

`tenant`-scoped secrets are an OPTIONAL add-on; the conformance suite reports `wop-secrets` + advertised scope set separately.

### `wop-provider-policy`

The host enforces AI provider policy modes per `capabilities.md` §`aiProviders.policies`.

**Requirements:** `aiProviders.policies.modes` is present and non-empty. The reference impl supports all four modes (`disabled`, `optional`, `required`, `restricted`). The predicate gates on at least `optional` being present (which every conforming policy host supports as the default no-restriction mode).

**Predicate:**

```
wop-provider-policy(c) :=
     wop-core(c)
  && c.aiProviders != null
  && c.aiProviders.policies != null
  && Array.isArray(c.aiProviders.policies.modes)
  && c.aiProviders.policies.modes.length > 0
  && c.aiProviders.policies.modes.includes('optional')
```

The conformance suite verifies enforcement against the runtime; discovery-payload predicates prove the host advertises the contract.

### `wop-replay-fork`

The host implements `POST /v1/runs/{runId}:fork` per `replay.md`.

**Requirements:** `replay.supported: true` AND `replay.modes` is a non-empty array. Conventional values for `replay.modes`: `'replay'` (deterministic re-execution from `fromSeq`), `'branch'` (divergent execution with optional `runOptionsOverlay`). A host that supports only `branch` mode satisfies the discovery predicate; `replayDeterminism.test.ts` skip-equivalents at runtime if `'replay'` mode is absent or stubbed.

**Predicate:**

```
wop-replay-fork(c) :=
     wop-core(c)
  && c.replay != null
  && c.replay.supported === true
  && Array.isArray(c.replay.modes)
  && c.replay.modes.length > 0
```

This profile gates `replayDeterminism.test.ts` (LT3.1) + the existing `replay-fork.test.ts` scenarios. Hosts MAY support either or both modes; the conformance scenarios pass on whichever mode the host advertises.

### `wop-node-packs`

The host serves a node-pack registry per `node-packs.md` §"Registry HTTP API."

**Requirements:** The host responds 200 to `GET /v1/packs` with a list-shaped body. The discovery-payload predicate is structural; the runtime predicate is HTTP behavior.

**Predicate (discovery-payload only — runtime check separate):**

```
wop-node-packs-discovery(c) := wop-core(c)
```

Discovery alone can't tell whether the registry endpoints are wired. The conformance scenarios in `pack-registry.test.ts` and `pack-registry-publish.test.ts` exercise the runtime; a host passes `wop-node-packs` when it passes those scenarios.

A host MAY support read-only pack distribution (GET routes only — `wop-node-packs-readonly`) or read/write (GET + PUT/POST/DELETE — `wop-node-packs-publish`). The split sub-profiles are derivable from which scenarios pass; they don't appear in the discovery payload.

---

## Derivation

The reference derivation for any conforming v1.x discovery payload `c` is:

```
profiles(c) := {
  'wop-core'           if wop-core(c),
  'wop-interrupts'     if wop-interrupts(c),
  'wop-stream-sse'     if wop-stream-sse(c),
  'wop-stream-poll'    if wop-stream-poll(c),
  'wop-secrets'        if wop-secrets(c),
  'wop-provider-policy' if wop-provider-policy(c),
  'wop-node-packs'     if wop-node-packs-discovery(c),
  'wop-replay-fork'    if wop-replay-fork(c),
}
```

A reference TypeScript implementation lives in `@myndhyve/wop-conformance` at `src/lib/profiles.ts`. SDKs MAY include a derivation helper; the spec doesn't require it.

The derivation is **deterministic and pure** — same input, same profile set. It MUST NOT depend on host-specific state, time-of-day, or fields outside the discovery payload.

---

## Profile semantics

A host **claims** a profile by satisfying its predicate AND passing the conformance scenarios labelled with the profile tag. A host **passes** a profile when both conditions hold against the suite version it reports.

Profile claims are reported in:

- The host's README or compatibility documentation.
- The `INTEROP-MATRIX.md` row for the host.
- The host's response to clients that query for profile membership (no protocol-defined endpoint; runtime-derived in the SDK).

A profile is NOT something a host advertises in the discovery payload. The discovery payload advertises capabilities; the profile is what conformance derives from those capabilities.

---

## Adding a profile

New profiles are an additive change per `COMPATIBILITY.md` §2.1. The process:

1. File an RFC per `RFCS/0001-rfc-process.md` proposing the profile name, its predicate over capabilities, and the runtime conformance scenarios required to pass it.
2. The RFC ships with a same-PR update to `conformance/src/lib/profiles.ts` adding the derivation.
3. New conformance scenarios that gate on the profile use the profile tag in their `describe()` block.

Profiles MAY be deprecated via the `COMPATIBILITY.md` §7 deprecation policy (annotation + RFC; surface continues to behave through v1.x).

A new profile MUST NOT cause a previously-passing host to fail an existing profile. Profile predicates are append-only within v1.x.

---

## Why this is not a wire field

An earlier draft of this document proposed `capabilities.profiles: string[]` advertised in `/.well-known/wop`. Reasons it was rejected:

1. **Two answers to one question.** A host could advertise `profiles: ["wop-secrets"]` while `capabilities.secrets.supported = false` because two code paths set them. Derivation makes this impossible.
2. **Cloud Run redeploy.** Adding a wire field forces every host to redeploy. Derivation runs in the suite, no redeploy.
3. **Fragmentation risk.** With a wire field, hosts could advertise nonexistent profiles. With derivation, the closed catalog is enforced by the suite.

The derivation library is the single canonical implementation of profile membership.

---

## Open spec gaps

| ID | Description |
|---|---|
| LT4-PR1 | Sub-profiles (`wop-node-packs-readonly`, `wop-node-packs-publish`) are described above but not formally defined. RFC pending if a third-party host needs the split. |
| LT4-PR2 | Conformance suite tag mechanism for profile-gated scenarios is not yet implemented. Scenarios currently run unconditionally; the LT4 follow-up adds a `--profile=<name>` flag. |

---

## References

- `capabilities.md` — discovery-payload shape that profiles derive from.
- `interrupt.md` — interrupt protocol that `wop-interrupts` references.
- `stream-modes.md` — streaming transports that `wop-stream-sse` and `wop-stream-poll` reference.
- `run-options.md` — credential references that `wop-secrets` references.
- `node-packs.md` — registry HTTP API that `wop-node-packs` references.
- `COMPATIBILITY.md` — additive-change discipline that gates new profiles.
- `RFCS/0001-rfc-process.md` — RFC mechanism for adding profiles.
- `INTEROP-MATRIX.md` (forthcoming under LT2) — per-host profile pass/skip table.
