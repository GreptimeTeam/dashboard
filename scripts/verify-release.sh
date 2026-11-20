#!/usr/bin/env bash
# Verify a published dashboard release can boot and interact with key pages.
#
# Downloads build.tar.gz from GitHub Releases, serves the static HTML via
# vite preview (proxies /v1 → http://127.0.0.1:4000), then runs Playwright
# menu-smoke e2e (ephemeral DB + seeded fixtures) against the left-menu pages.
#
# Prerequisites:
#   - pnpm install (and playwright browsers: pnpm exec playwright install chromium)
#   - GreptimeDB listening on localhost:4000 (health: GET /v1/health)
#
# Usage:
#   ./scripts/verify-release.sh              # latest release
#   ./scripts/verify-release.sh v0.13.14     # specific tag
#   pnpm run smoke:release:tag -- v0.13.14
#
# Env overrides:
#   SMOKE_PORT=4173
#   SMOKE_HOST=127.0.0.1
#   SMOKE_FORCE_DOWNLOAD=1   re-download even if cached
#   SMOKE_STRICT=1           fail suite when any page action fails
#   REPO=GreptimeTeam/dashboard

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

REPO="${REPO:-GreptimeTeam/dashboard}"
TAG="${1:-${RELEASE_TAG:-}}"
HOST="${SMOKE_HOST:-127.0.0.1}"
PORT="${SMOKE_PORT:-4173}"
DB_HOST="${SMOKE_DB_HOST:-http://localhost:4000}"

resolve_latest_tag() {
  if command -v gh >/dev/null 2>&1 && gh auth status >/dev/null 2>&1; then
    gh release view --repo "$REPO" --json tagName -q .tagName
    return
  fi
  curl -fsSL "https://api.github.com/repos/${REPO}/releases/latest" \
    | python3 -c 'import json,sys; print(json.load(sys.stdin)["tag_name"])'
}

if [[ -z "$TAG" ]]; then
  echo "==> Resolving latest release tag from ${REPO}..."
  TAG="$(resolve_latest_tag)"
fi

# Normalize: accept both 0.13.14 and v0.13.14
if [[ "$TAG" != v* ]]; then
  TAG="v${TAG}"
fi

WORK_DIR="${ROOT_DIR}/artifacts/release-verify/${TAG}"
TARBALL="${WORK_DIR}/build.tar.gz"
DIST_DIR="${WORK_DIR}/dist"
DOWNLOAD_URL="https://github.com/${REPO}/releases/download/${TAG}/build.tar.gz"

echo "==> Verifying release ${TAG}"
echo "    download: ${DOWNLOAD_URL}"
echo "    workdir:  ${WORK_DIR}"
echo "    db host:  ${DB_HOST} (via vite preview /v1 proxy → 127.0.0.1:4000)"
echo "    serve:    http://${HOST}:${PORT}"
echo "    suite:    menu-smoke (fixture + mock data)"

mkdir -p "$WORK_DIR"

if [[ ! -f "$TARBALL" || "${SMOKE_FORCE_DOWNLOAD:-0}" == "1" ]]; then
  echo "==> Downloading build.tar.gz..."
  curl -fL --retry 3 --retry-delay 2 -o "$TARBALL" "$DOWNLOAD_URL"
else
  echo "==> Using cached tarball: ${TARBALL}"
fi

echo "==> Extracting..."
rm -rf "$DIST_DIR"
# Archive layout is ./dist/...
tar -xzf "$TARBALL" -C "$WORK_DIR"

if [[ ! -f "${DIST_DIR}/index.html" ]]; then
  echo "ERROR: ${DIST_DIR}/index.html not found after extract" >&2
  ls -la "$WORK_DIR" >&2 || true
  exit 1
fi

echo "==> Release artifact OK ($(du -sh "$DIST_DIR" | awk '{print $1}'))"
echo "    index: ${DIST_DIR}/index.html"

if ! curl -fsS --max-time 3 "${DB_HOST%/}/v1/health" >/dev/null 2>&1; then
  echo "WARN: GreptimeDB health check failed at ${DB_HOST}/v1/health"
  echo "      Pages may still open; API-backed widgets may warn."
fi

export SMOKE_DIST_DIR="$DIST_DIR"
export SMOKE_HOST="$HOST"
export SMOKE_PORT="$PORT"
export SMOKE_DB_HOST="$DB_HOST"
export SMOKE_NO_OPEN=1
export CI="${CI:-1}"

echo "==> Running Playwright menu-smoke e2e against release ${TAG}..."
pnpm exec playwright test -c playwright.menu.config.ts

REPORT_LATEST="${ROOT_DIR}/artifacts/menu-smoke/latest/index.html"
echo "==> PASS: release ${TAG} smoke verification succeeded"
echo "    report:      ${REPORT_LATEST}"
echo "    report URL:  file://${REPORT_LATEST}"
if [[ -d "${ROOT_DIR}/artifacts/menu-smoke/latest/screenshots" ]]; then
  echo "    screenshots: artifacts/menu-smoke/latest/screenshots"
fi
