#!/usr/bin/env bash
# wop-check — one-shot validation of the WOP spec corpus.
#
# Runs server-free checks across all artifacts:
#   1. JSON Schemas compile + fixtures validate (vitest server-free subset)
#   2. TypeScript SDK builds clean (tsc)
#   3. Python SDK passes syntax + import smoke
#   4. Go SDK passes go vet (skipped if Go is not installed)
#   5. OpenAPI lints clean (redocly)
#   6. AsyncAPI validates (asyncapi-cli)
#   7. Publish-metadata audit (placeholder URLs, stale module paths,
#      private:true reminders) — see wop-check-publish-metadata.sh
#
# Mirror of .github/workflows/wop-spec.yml — run this before pushing
# to skip the round-trip CI wait. Exits non-zero on any failure.
#
# Total runtime: ~30s on a warm cache.

set -euo pipefail

SPEC_ROOT="."

echo "=== wop:check — validating $SPEC_ROOT/ ==="
echo

# 1. Conformance package — typecheck + server-free scenarios.
echo "[1/7] Conformance suite (typecheck + server-free scenarios)..."
(
  cd "$SPEC_ROOT/conformance"
  if [[ ! -d node_modules ]]; then
    echo "  installing conformance deps (one-time)..."
    npm install --no-audit --no-fund --prefer-offline >/dev/null
  fi
  npx tsc --noEmit
  npx vitest run \
    src/scenarios/fixtures-valid.test.ts \
    src/scenarios/spec-corpus-validity.test.ts
)
echo

# 2. TypeScript SDK — typecheck.
echo "[2/7] TypeScript reference SDK (tsc)..."
(
  cd "$SPEC_ROOT/sdk/typescript"
  if [[ ! -d node_modules ]]; then
    echo "  installing SDK deps (one-time)..."
    npm install --no-audit --no-fund --prefer-offline >/dev/null
  fi
  npx tsc --noEmit
)
echo

# 3. Python SDK — syntax check + import smoke. Mypy is NOT run here
# (it's an optional dev dep); contributors can `pip install -e .[dev]`
# and run mypy locally for a stricter check.
echo "[3/7] Python reference SDK (syntax + import smoke)..."
(
  cd "$SPEC_ROOT/sdk/python"
  PY=$(command -v python3.13 || command -v python3.12 || command -v python3.11 || command -v python3.10 || command -v python3)
  if [[ -z "$PY" ]]; then
    echo "  WARN: no python3.10+ found; skipping Python SDK smoke."
  else
    for f in src/wop_client/*.py; do
      "$PY" -c "import ast; ast.parse(open('$f').read())" || exit 1
    done
    "$PY" -c "import sys; sys.path.insert(0, 'src'); import wop_client; print('  wop_client', wop_client.__version__, 'imports clean')"
  fi
)
echo

# 4. Go SDK — go vet (skipped if Go not installed).
echo "[4/7] Go reference SDK (go vet)..."
(
  cd "$SPEC_ROOT/sdk/go"
  if ! command -v go >/dev/null 2>&1; then
    echo "  WARN: go binary not found; skipping Go SDK vet."
  else
    go vet ./...
  fi
)
echo

# 5. OpenAPI lint via redocly.
echo "[5/7] OpenAPI 3.1 (redocly lint)..."
(
  cd "$SPEC_ROOT/api"
  npx -y -p @redocly/cli@latest redocly lint openapi.yaml
)
echo

# 6. AsyncAPI validate.
echo "[6/7] AsyncAPI 3.1 (asyncapi validate)..."
npx -y -p @asyncapi/cli@latest asyncapi validate "$SPEC_ROOT/api/asyncapi.yaml"
echo

# 7. Publish-metadata audit — catches placeholder URLs, stale module
# paths, and reminds about `private: true` gates. Cheap (no network); run
# every time so any regression is caught before tag push.
echo "[7/7] Publish-metadata audit..."
"$(dirname "$0")/wop-check-publish-metadata.sh"
echo

echo "=== wop:check OK — spec corpus is internally consistent ==="
