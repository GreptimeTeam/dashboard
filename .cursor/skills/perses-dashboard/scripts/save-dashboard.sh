#!/usr/bin/env bash
# Save a Perses dashboard JSON file to GreptimeDB via POST /v1/dashboards/{name}
set -euo pipefail

usage() {
  cat <<'EOF'
Usage: save-dashboard.sh --name <dashboard-name> --file <dashboard.json> [--host <url>]

Save a Perses Dashboard JSON file to GreptimeDB.

Options:
  --name <name>    Dashboard name (used in URL path, without .json suffix)
  --file <path>    Path to Perses dashboard JSON file
  --host <url>     GreptimeDB API host (default: GREPTIME_HOST or http://127.0.0.1:4000)

Environment:
  GREPTIME_HOST    Default API host
  GREPTIME_AUTH    Basic auth: base64 token OR user:password
  GREPTIME_DB      Value for x-greptime-db-name header (optional)

Example:
  GREPTIME_AUTH=admin:admin ./save-dashboard.sh --name my-dashboard --file dashboard.json
EOF
}

NAME=""
FILE=""
HOST="${GREPTIME_HOST:-http://127.0.0.1:4000}"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --name)
      NAME="${2:-}"
      shift 2
      ;;
    --file)
      FILE="${2:-}"
      shift 2
      ;;
    --host)
      HOST="${2:-}"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      usage >&2
      exit 1
      ;;
  esac
done

if [[ -z "$NAME" || -z "$FILE" ]]; then
  echo "Error: --name and --file are required" >&2
  usage >&2
  exit 1
fi

if [[ ! -f "$FILE" ]]; then
  echo "Error: file not found: $FILE" >&2
  exit 1
fi

if ! command -v jq >/dev/null 2>&1; then
  echo "Error: jq is required" >&2
  exit 1
fi

# Validate JSON and compact for POST body
if ! CONTENT=$(jq -c . "$FILE"); then
  echo "Error: invalid JSON in $FILE" >&2
  exit 1
fi

# Strip .json suffix from name if present
NAME="${NAME%.json}"

ENCODED_NAME=$(python3 -c "import urllib.parse; print(urllib.parse.quote('''$NAME''', safe=''))")

URL="${HOST%/}/v1/dashboards/${ENCODED_NAME}"

CURL_ARGS=(-sS -w "\n%{http_code}" -X POST "$URL" -H "Content-Type: application/json")

if [[ -n "${GREPTIME_AUTH:-}" ]]; then
  if [[ "$GREPTIME_AUTH" == *:* ]]; then
    AUTH_HEADER=$(printf '%s' "$GREPTIME_AUTH" | base64 | tr -d '\n')
  else
    AUTH_HEADER="$GREPTIME_AUTH"
  fi
  CURL_ARGS+=(-H "Authorization: Basic ${AUTH_HEADER}")
fi

if [[ -n "${GREPTIME_DB:-}" ]]; then
  CURL_ARGS+=(-H "x-greptime-db-name: ${GREPTIME_DB}")
fi

PAYLOAD=$(jq -n --arg content "$CONTENT" '{content: $content}')

RESPONSE=$(curl "${CURL_ARGS[@]}" -d "$PAYLOAD")
HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | sed '$d')

if [[ "$HTTP_CODE" -ge 200 && "$HTTP_CODE" -lt 300 ]]; then
  echo "Saved dashboard '${NAME}' to ${URL} (HTTP ${HTTP_CODE})"
  if [[ -n "$BODY" ]]; then
    echo "$BODY"
  fi
  exit 0
fi

echo "Failed to save dashboard (HTTP ${HTTP_CODE})" >&2
if [[ -n "$BODY" ]]; then
  echo "$BODY" >&2
fi
exit 1
