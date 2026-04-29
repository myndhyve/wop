# WOP Spec v1 — Publishing Plan

> **Status: FINAL v1.0 (2026-04-29).** Operational plan for publishing the 4 spec-corpus artifacts (TypeScript SDK, TypeScript conformance suite, Python SDK, Go SDK) to their respective registries. Phase 1 documents intent + cadence + release manager + pre-publish checklist. Phase 2 (actual first publication + CI automation) is tracked as deferred work. See `auth.md` for the status legend.

---

## Why this exists

The spec corpus ships 4 distributable artifacts alongside the prose docs:

| Artifact | Package name | Version | Registry | Status |
|---|---|---|---|---|
| TypeScript SDK | `@wop/client` | `1.0.0` | npm | In-repo; first publish deferred |
| TypeScript conformance suite | `@wop/conformance` | `1.6.0` | npm | In-repo; first publish deferred |
| Python SDK | `wop-client` | `1.0.0` | PyPI | In-repo; first publish deferred |
| Go SDK | `wopclient` | `v1.0.0` | Go modules (proxy.golang.org) | In-repo; first publish deferred |

All four are FINAL v1.0 at the source level — the spec contract is locked, the implementations are pinned, the conformance suite passes against the reference deployment. What's NOT yet done is the actual first publication to public registries. This doc covers the operational plan for closing that gap.

---

## Publication policy

### What gets published when

| Trigger | Action |
|---|---|
| Spec patch release (e.g., 1.0.0 → 1.0.1) | All 4 artifacts re-publish at the patch version. |
| Spec minor release (e.g., 1.0.x → 1.1.0) | All 4 artifacts re-publish at a new minor (or patch, if changes are SDK-internal). |
| Spec major release (e.g., 1.x → 2.0) | All 4 artifacts re-publish at a new major. Old major remains accessible (npm tags, PyPI versions, Go module paths) for 12 months. |
| SDK-only patch (e.g., bug fix in TS client) | Only the affected SDK re-publishes; spec corpus version unchanged. |
| Conformance scenario addition | `@wop/conformance` minor bump; other artifacts unaffected. |

### Versioning alignment

- The 3 SDKs (`@wop/client`, `wop-client`, `wopclient`) MUST track the spec major. A spec at v1.x always has SDKs at v1.x. Within a major, SDK patch versions float independently.
- `@wop/conformance` independently bumps minors when scenarios are added/removed. Patch versions track bug fixes in scenario assertions.
- Go module path includes the major (`/v1`) per Go convention; v2 will be a new module path (`github.com/myndhyve/wop/sdk/go/v2`).

### Deprecation policy

A published version is deprecated when:

- A bug or security issue affects a specific version → npm `deprecate` / PyPI `yank` / Go module retraction.
- A new minor supersedes the version with backward-compat → optional deprecation, prefer next-version messaging in the changelog.

Critical security advisories follow the standard CVE flow + an entry in the spec-corpus security advisory log (lives in this repo at `SECURITY.md` — TBD).

---

## Pre-publish checklist

Run before EVERY publish (manual or CI-driven). The checklist is a hard gate; one item failing means the release doesn't go.

### All artifacts

- [ ] `npm run wop:check` passes locally — spec corpus is internally consistent.
- [ ] CHANGELOG entry exists at the canonical doc (e.g., `CHANGELOG.md` for spec releases; per-package CHANGELOG for SDK-only patches).
- [ ] Version field in the package manifest matches the git tag.
- [ ] License is `Apache-2.0` and `LICENSE` file is present in the published artifact.
- [ ] No `Scaffold` / `not yet published` language in the package description.

### `@wop/client` (npm)

- [ ] `cd sdk/typescript && npm run typecheck` clean.
- [ ] `cd sdk/typescript && npm run build` produces `dist/` cleanly.
- [ ] `npm pack --dry-run` shows ONLY `dist/`, `src/`, `README.md`, `package.json`, `LICENSE`. No tests, no node_modules, no .DS_Store.
- [ ] `package.json` `private` field is removed (or set to `false`) — `private: true` blocks publish.
- [ ] `package.json` `repository` field points at a public source location.

### `@wop/conformance` (npm)

- [ ] `cd conformance && npm run test` passes (server-free subset MUST pass; server-required scenarios MAY skip if no reference deployment is reachable).
- [ ] `cd conformance && npm run build:cli` produces `dist/cli.js` cleanly + the bin field resolves.
- [ ] `npx wop-conformance --help` works after a fresh install in a temp directory.
- [ ] `package.json` `private` field removed.

### `wop-client` (PyPI)

- [ ] `cd sdk/python && python -m hatchling build` produces `dist/*.whl` + `dist/*.tar.gz`.
- [ ] `python -m twine check dist/*` passes.
- [ ] Smoke test: `pip install dist/*.whl` in a fresh venv, `python -c "import wop_client; print(wop_client.__version__)"` works.
- [ ] `pyproject.toml` description doesn't mention "Scaffold".
- [ ] PyPI classifier `Development Status :: 5 - Production/Stable` (was `3 - Alpha` while in pre-publish).

### `wopclient` (Go modules)

- [ ] `cd sdk/go && go vet ./...` clean.
- [ ] `cd sdk/go && go test ./...` passes.
- [ ] `go.mod` declares `go 1.22+` and the correct module path with `/v1` major suffix.
- [ ] Tag the repo at `sdk/go/v1.0.0` (Go modules consume tags directly).
- [ ] Verify discoverability: `go list -m github.com/myndhyve/wop/sdk/go/v1@v1.0.0` resolves after the tag is pushed.

---

## Release manager

The spec working group designates a release manager per release cycle. The role:

- Runs the pre-publish checklist.
- Publishes the artifacts (or triggers the CI workflow that does).
- Updates the version-tracking entry in `V1-FINAL-COMPLETION-PLAN.md` §"v1.0 release record".
- Posts a release note in the spec-corpus repo's release feed.

For v1.0 launch, the release manager is the spec working group lead (currently TBD). For v1.x maintenance releases, the role rotates among working group members.

---

## CI automation (phase 2)

Phase 2 of G10 wires GitHub Actions to execute the publish on tag push. A sketch of the workflow lives at `.github/workflows/publish.yml.template` (committed but not active until a maintainer flips the trigger). The template:

```yaml
name: Publish

on:
  push:
    tags:
      - 'v*'

jobs:
  publish-ts-client:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          registry-url: 'https://registry.npmjs.org'
      - run: cd sdk/typescript && npm ci && npm run build
      - run: cd sdk/typescript && npm publish --access public
        env:
          NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}

  publish-conformance:
    # ... similar shape

  publish-python:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with:
          python-version: '3.12'
      - run: pip install --upgrade build twine
      - run: cd sdk/python && python -m build
      - run: cd sdk/python && twine upload dist/*
        env:
          TWINE_USERNAME: __token__
          TWINE_PASSWORD: ${{ secrets.PYPI_TOKEN }}

  publish-go:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      # Go modules are tag-based; no upload step required.
      # The proxy.golang.org cache picks up tags automatically.
      - run: echo "Go module v$VERSION published via tag push."
        env:
          VERSION: ${{ github.ref_name }}
```

Secrets required (configured in repo settings before activating the workflow):
- `NPM_TOKEN` — npm automation token with publish scope on `@wop` org.
- `PYPI_TOKEN` — PyPI API token scoped to `wop-client` project.
- Go publication needs no secret — Go modules consume tags directly from the public repo.

Activation steps when ready:
1. Resolve the `@wop` npm org claim (or rename to a different scope).
2. Resolve the PyPI project claim.
3. Resolve the Go module path (host repo decision).
4. Add the three secrets to repo settings.
5. Move `.github/workflows/publish.yml.template` to `.github/workflows/publish.yml`.
6. Push a `v1.0.0` tag.
7. Watch the workflow + verify each registry receives the artifact.

---

## In-repo-only artifacts (no plan to publish)

Some artifacts in the spec corpus are documentation-only and explicitly NOT for public registry publication:

- The 15 prose spec docs (`auth.md`, `rest-endpoints.md`, etc.) — distributed via the repo's docs site (G12 phase 2) when ready.
- The JSON Schemas (`schemas/*.json`) — referenced by URL from the published artifacts; the spec-corpus repo IS the authoritative source.
- The conformance fixtures (`conformance/fixtures/`) — pulled into `@wop/conformance` at build time.
- The OpenAPI + AsyncAPI YAMLs — referenced by URL.

These artifacts will be hosted at a public location (probably `wop.dev/spec/v1/`) under G12 phase 2; G10 doesn't need to re-publish them.

---

## See also

- `README.md` — spec corpus index.
- `CONTRIBUTING.md` — governance + contribution process.
- `V1-FINAL-COMPLETION-PLAN.md` — release record + per-trigger tracker.
- WOP plan: gap G10 (publishing + registry operations).
- npm publishing docs: <https://docs.npmjs.com/cli/v10/commands/npm-publish>
- PyPI publishing docs: <https://packaging.python.org/en/latest/tutorials/packaging-projects/>
- Go modules: <https://go.dev/ref/mod>
