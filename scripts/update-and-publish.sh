#!/usr/bin/env bash
# One-click scorecard refresh: boot the server, run /admin/update-all, wait
# for it to finish, publish the results into personal-site-vue, then stop
# the server again.
set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEST_DIR="/Users/vasko6d/code/personal-site-vue/public/json/8a-scorecards"
PORT=8091
POLL_INTERVAL_SECONDS=5
STARTUP_TIMEOUT_SECONDS=30

cd "$REPO_DIR"

set -a
# shellcheck disable=SC1091
source .env
set +a

if [ -z "${EIGHTA_ADMIN_API_TOKEN:-}" ]; then
  echo "EIGHTA_ADMIN_API_TOKEN not set in .env" >&2
  exit 1
fi

existing_pid="$(lsof -ti:"$PORT" || true)"
if [ -n "$existing_pid" ]; then
  echo "Killing existing process already on port $PORT ($existing_pid)..."
  kill -9 $existing_pid
  sleep 1
fi

server_log="$(mktemp)"

cleanup() {
  echo "Stopping server..."
  local pid
  pid="$(lsof -ti:"$PORT" || true)"
  if [ -n "$pid" ]; then
    kill $pid 2>/dev/null || true
    sleep 2
    kill -9 $pid 2>/dev/null || true
  fi
  # Playwright's Chromium normally exits with its parent Node process, but
  # clean up defensively so a one-click script never leaves a stray window.
  pkill -f "ms-playwright.*chromium" 2>/dev/null || true
  rm -f "$server_log"
}
trap cleanup EXIT

echo "Starting server..."
npx ts-node src/index.ts > "$server_log" 2>&1 &

echo "Waiting for server to come up..."
started=false
for _ in $(seq 1 "$STARTUP_TIMEOUT_SECONDS"); do
  if grep -q "server started" "$server_log" 2>/dev/null; then
    started=true
    break
  fi
  sleep 1
done
if [ "$started" != true ]; then
  echo "Server did not start within ${STARTUP_TIMEOUT_SECONDS}s:" >&2
  cat "$server_log" >&2
  exit 1
fi
echo "Server is up."

echo "Triggering /admin/update-all..."
kickoff_response="$(curl -sS -X POST -H "Authorization: Bearer $EIGHTA_ADMIN_API_TOKEN" "http://localhost:$PORT/admin/update-all")"
echo "  $kickoff_response"

echo "Polling status every ${POLL_INTERVAL_SECONDS}s..."
while true; do
  status_response="$(curl -sS -H "Authorization: Bearer $EIGHTA_ADMIN_API_TOKEN" "http://localhost:$PORT/admin/update-all/status")"
  job_status="$(echo "$status_response" | python3 -c "import json,sys; print(json.load(sys.stdin).get('status', 'unknown'))")"
  echo "  [$(date +%H:%M:%S)] status: $job_status"
  if [ "$job_status" = "completed" ]; then
    echo "$status_response" | python3 -m json.tool
    break
  fi
  sleep "$POLL_INTERVAL_SECONDS"
done

shopt -s nullglob
out_files=(out-json/*.json)
if [ ${#out_files[@]} -eq 0 ]; then
  echo "No files found in out-json/ - refusing to touch $DEST_DIR" >&2
  exit 1
fi

echo "Generating manifest.json..."
npx ts-node src/generate-manifest.ts
out_files=(out-json/*.json)

echo "Publishing ${#out_files[@]} file(s) to $DEST_DIR (overwriting existing contents)..."
mkdir -p "$DEST_DIR"
rm -f "$DEST_DIR"/*.json
cp "${out_files[@]}" "$DEST_DIR"/

echo "Done. $DEST_DIR now contains:"
ls "$DEST_DIR"
