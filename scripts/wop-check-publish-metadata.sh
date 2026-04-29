#!/usr/bin/env bash
# wop-check-publish-metadata — defensive pre-publish metadata audit.
#
# Catches the class of bugs the wop-package-release session found in
# 2026-04-29 P3 hardening: placeholder URLs, stale module paths, missing
# repository fields, etc. Run as part of `wop-check.sh` (stage 7) so any
# regression is caught before a tag push activates the publish workflow.
#
# Exits 0 if all checks pass, 1 if any fail.
#
# Scope: metadata only. SDK source code logic is owned elsewhere (per
# WOP-PHASED-DELIVERY.md §4.3); this script doesn't touch it.

set -euo pipefail

SPEC_ROOT="."
EXPECTED_REPO="github.com/myndhyve/wop"
EXPECTED_GO_MODULE="${EXPECTED_REPO}/sdk/go/v1"
EXPECTED_NPM_SCOPE="@myndhyve"
fail=0

err() { echo "  FAIL: $*" >&2; fail=1; }
ok()  { echo "  ok:   $*"; }

echo "=== wop:check:publish-metadata — auditing publishable manifests ==="
echo

# 1. Python pyproject.toml — no placeholder URLs.
echo "[1/7] Python pyproject.toml URLs..."
PYPROJECT="$SPEC_ROOT/sdk/python/pyproject.toml"
if grep -qE "github.com/example|github.com/wop-spec/wop-client-go" "$PYPROJECT"; then
  err "$PYPROJECT contains a placeholder URL (github.com/example or wop-spec/wop-client-go)."
  grep -nE "github.com/example|github.com/wop-spec/wop-client-go" "$PYPROJECT" >&2
elif ! grep -qE "github.com/myndhyve/wop" "$PYPROJECT"; then
  err "$PYPROJECT does not reference the canonical repo $EXPECTED_REPO."
else
  ok "$PYPROJECT references $EXPECTED_REPO."
fi

# 2. Go go.mod — module path matches expected pattern.
echo "[2/7] Go go.mod module path..."
GOMOD="$SPEC_ROOT/sdk/go/go.mod"
GO_MODULE_LINE=$(grep -E "^module " "$GOMOD" || true)
if [[ -z "$GO_MODULE_LINE" ]]; then
  err "$GOMOD has no module declaration."
elif [[ "$GO_MODULE_LINE" != "module $EXPECTED_GO_MODULE" ]]; then
  err "$GOMOD module path is '$GO_MODULE_LINE', expected 'module $EXPECTED_GO_MODULE'."
else
  ok "$GOMOD declares 'module $EXPECTED_GO_MODULE'."
fi

# 3. Publishable npm packages — `private: true` is a publish-blocker. We
#    keep `private: true` set in-tree as a deliberate gate (per PUBLISHING.md
#    pre-publish checklist) — flag this as a warning, not a failure, so the
#    user remembers to flip it at publish time. The script still exits 0
#    if this is the only "issue".
echo "[3/7] npm packages with private:true (publish gate reminder)..."
for PKG in "$SPEC_ROOT/sdk/typescript/package.json" "$SPEC_ROOT/conformance/package.json"; do
  if grep -qE '"private":\s*true' "$PKG"; then
    echo "  reminder: $PKG has \"private\": true — must be removed (or set to false) before \`npm publish\`."
  else
    ok "$PKG is not marked private."
  fi
done

# 4. PUBLISHING.md — Go SDK module path table entry matches go.mod.
echo "[4/7] PUBLISHING.md ↔ go.mod consistency..."
PUBLISHING="$SPEC_ROOT/PUBLISHING.md"
if ! grep -qE "wopclient" "$PUBLISHING"; then
  err "$PUBLISHING does not mention the Go package name 'wopclient'."
elif grep -qE "github.com/wop-spec/wop-client-go|github.com/example" "$PUBLISHING"; then
  err "$PUBLISHING references a stale or placeholder URL."
  grep -nE "github.com/wop-spec/wop-client-go|github.com/example" "$PUBLISHING" >&2
else
  ok "$PUBLISHING is consistent with go.mod."
fi

# 5. SDK READMEs — no stale `wop-spec/wop-client-go` import paths.
echo "[5/7] SDK READMEs — no stale import paths..."
for README in "$SPEC_ROOT/sdk/typescript/README.md" "$SPEC_ROOT/sdk/python/README.md" "$SPEC_ROOT/sdk/go/README.md" "$SPEC_ROOT/conformance/README.md"; do
  if grep -qE "github.com/example|github.com/wop-spec/wop-client-go" "$README"; then
    err "$README references a stale or placeholder URL."
    grep -nE "github.com/example|github.com/wop-spec/wop-client-go" "$README" >&2
  else
    ok "$README is clean."
  fi
done

# 6. npm package.json names — must use the chosen $EXPECTED_NPM_SCOPE,
#    never the placeholder `@wop/` scope. (The "@wop/protocol decision"
#    section in PUBLISHING.md and the §7 Q2 closure entry both keep
#    "@wop/protocol" verbatim as historical context — that's text in
#    docs, not a manifest "name" field, so it doesn't trip this check.)
echo "[6/7] npm package names use $EXPECTED_NPM_SCOPE scope..."
for PKG in "$SPEC_ROOT/sdk/typescript/package.json" "$SPEC_ROOT/conformance/package.json"; do
  PKG_NAME=$(grep -E '"name":' "$PKG" | head -1 | sed -E 's/.*"name":[[:space:]]*"([^"]+)".*/\1/')
  if [[ "$PKG_NAME" == @wop/* ]]; then
    err "$PKG has name '$PKG_NAME' — should be under $EXPECTED_NPM_SCOPE/."
  elif [[ "$PKG_NAME" != ${EXPECTED_NPM_SCOPE}/* ]]; then
    err "$PKG has name '$PKG_NAME' — does not start with $EXPECTED_NPM_SCOPE/."
  else
    ok "$PKG name '$PKG_NAME' is under $EXPECTED_NPM_SCOPE/."
  fi
done

# 7. LICENSE file present in every publishable artifact directory. npm
#    pack and PyPI both look for a sibling LICENSE; without one the
#    published artifact ships unlicensed regardless of the manifest's
#    `license` field.
echo "[7/7] LICENSE file in each publish directory..."
for DIR in "$SPEC_ROOT/sdk/typescript" "$SPEC_ROOT/sdk/python" "$SPEC_ROOT/sdk/go" "$SPEC_ROOT/conformance"; do
  if [[ -f "$DIR/LICENSE" ]]; then
    ok "$DIR/LICENSE exists."
  else
    err "$DIR/LICENSE missing — published package will ship unlicensed."
  fi
done

echo
if (( fail )); then
  echo "=== wop:check:publish-metadata FAILED — fix the issues above ==="
  exit 1
fi
echo "=== wop:check:publish-metadata OK — manifests are publish-ready ==="
