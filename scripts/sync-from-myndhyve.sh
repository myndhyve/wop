#!/usr/bin/env bash
# sync-from-myndhyve.sh — copy the spec corpus from a MyndHyve checkout
# into this public WOP repo, applying the path/URL scrubs that distinguish
# the public layout from the in-tree layout.
#
# This is a STOP-GAP. The long-term sync model (submodule? monorepo split?
# delete the in-tree copy and consume @wop packages?) is open per ROADMAP.md
# §"Implementation ecosystem". Run this script after spec-text changes
# land in MyndHyve and you want to refresh the public repo.
#
# Usage:
#   ./scripts/sync-from-myndhyve.sh /path/to/myndhyve
#
# Exits non-zero if the source directory is missing or the post-sync
# validator fails.

set -euo pipefail

if [[ $# -ne 1 ]]; then
  echo "usage: $0 <path-to-myndhyve-checkout>" >&2
  exit 2
fi

SRC_ROOT="$1"
SRC="$SRC_ROOT/docs/wop-spec/v1"
DEST="$(cd "$(dirname "$0")/.." && pwd)"

if [[ ! -d "$SRC" ]]; then
  echo "error: $SRC does not exist" >&2
  exit 2
fi

echo "=== sync from $SRC -> $DEST ==="

# 1. Spec docs (15 normative + V1-FINAL-COMPLETION-PLAN release record).
SPEC_DOCS="auth.md capabilities.md channels-and-reducers.md idempotency.md interrupt.md node-packs.md observability.md registry-operations.md replay.md rest-endpoints.md run-options.md storage-adapters.md stream-modes.md version-negotiation.md webhooks.md V1-FINAL-COMPLETION-PLAN.md"
for f in $SPEC_DOCS; do
  cp "$SRC/$f" "$DEST/spec/v1/$f"
done

# 2. Repo-root governance + entry docs.
ROOT_DOCS="LICENSE LICENSE-DOCS NOTICE CODE_OF_CONDUCT.md CONTRIBUTING.md GOVERNANCE.md ROADMAP.md SECURITY.md CHANGELOG.md PUBLISHING.md QUICKSTART.md README.md"
for f in $ROOT_DOCS; do
  cp "$SRC/$f" "$DEST/$f"
done

# 3. Schemas, API, conformance, SDKs (excluding node_modules + dist).
rsync -a --delete --exclude='node_modules' --exclude='dist' --exclude='*.tsbuildinfo' "$SRC/schemas/" "$DEST/schemas/"
rsync -a --delete "$SRC/api/" "$DEST/api/"
rsync -a --delete --exclude='node_modules' --exclude='dist' --exclude='*.tsbuildinfo' "$SRC/conformance/" "$DEST/conformance/"
rsync -a --delete --exclude='node_modules' --exclude='dist' --exclude='*.tsbuildinfo' "$SRC/sdk/" "$DEST/sdk/"

# 4. .github (issue templates, PR template, CODEOWNERS).
rsync -a --delete "$SRC/.github/" "$DEST/.github/"
# Workflow lives at MyndHyve-repo .github/workflows/wop-spec.yml — re-fetch it.
mkdir -p "$DEST/.github/workflows"
cp "$SRC_ROOT/.github/workflows/wop-spec.yml" "$DEST/.github/workflows/wop-spec.yml"

# 5. Apply public-repo path scrubs.
sed -i '' 's|docs/wop-spec/v1/||g' "$DEST"/spec/v1/*.md "$DEST"/CONTRIBUTING.md "$DEST"/PUBLISHING.md "$DEST"/SECURITY.md "$DEST"/CHANGELOG.md "$DEST"/sdk/*/README.md "$DEST"/conformance/README.md "$DEST"/conformance/fixtures.md 2>/dev/null || true
sed -i '' 's|docs/wop-spec/|spec/|g' "$DEST"/CHANGELOG.md 2>/dev/null || true

# 6. CI workflow path adjustments.
sed -i '' 's|working-directory: docs/wop-spec/v1/|working-directory: |g; s|docs/wop-spec/v1/api/|api/|g' "$DEST/.github/workflows/wop-spec.yml" 2>/dev/null || true

# 7. wop-check.sh adjustments.
sed -i '' 's|SPEC_ROOT="docs/wop-spec/v1"|SPEC_ROOT="."|g' "$DEST/scripts/wop-check.sh" 2>/dev/null || true

# 8. Validate.
echo
echo "=== running validator ==="
bash "$DEST/scripts/wop-check.sh"

echo
echo "=== sync complete — review with 'git -C $DEST status' before committing ==="
