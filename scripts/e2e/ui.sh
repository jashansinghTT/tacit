#!/usr/bin/env bash
# Browser E2E run: merge the web branches into a throwaway branch, build, serve, and run the Playwright flows.
#
#   scripts/e2e/ui.sh [--no-merge] [--no-build] [playwright args...]     e.g. scripts/e2e/ui.sh -g F7
#
# - Throwaway checkout: $QA_UI_WT (default ~/tacit-wt/qa-ui) on local branch qa/ui-merge = main + work/web +
#   work/web-learn + work/web-exchange + work/web-robot (+ $QA_UI_EXTRA). Never pushed. A branch that does not
#   merge cleanly is left out and reported.
# - Served by `vite preview` on $QA_WEB_PORT (default 5790) with the app's own proxy to the backend on 8710.
#   `QA_WEB_URL=http://127.0.0.1:8710 scripts/e2e/ui.sh --no-merge --no-build` tests the app the backend serves.
# - Evidence: .orchestration/evidence/qa/runs/<UTC>-ui/ in this worktree (results.json, screens/, artifacts/).
set -euo pipefail

QA="$(cd "$(dirname "$0")/../.." && pwd)"
UI="${QA_UI_WT:-$HOME/tacit-wt/qa-ui}"
PORT="${QA_WEB_PORT:-5790}"
BRANCHES=(work/web work/web-learn work/web-exchange work/web-robot ${QA_UI_EXTRA:-})
merge=1 build=1
while [[ $# -gt 0 ]]; do
  case "$1" in
    --no-merge) merge=0; shift ;;
    --no-build) build=0; shift ;;
    *) break ;;
  esac
done

export QA_RUN_ID="${QA_RUN_ID:-$(date -u +%Y%m%dT%H%M%SZ)-ui}"
RUN="$QA/.orchestration/evidence/qa/runs/$QA_RUN_ID"
mkdir -p "$RUN"
log() { printf '%s %s\n' "$(date -u +%H:%M:%S)" "$*" | tee -a "$RUN/ui.log"; }

if [[ ! -d "$UI" ]]; then
  git -C "$QA" worktree add -q -B qa/ui-merge "$UI" main
fi
if (( merge )); then
  git -C "$UI" reset -q --hard
  git -C "$UI" clean -qfd -e web/node_modules
  git -C "$UI" checkout -q -B qa/ui-merge main
  for b in "${BRANCHES[@]}"; do
    if git -C "$UI" merge -q --no-edit --no-ff "$b" >/dev/null 2>&1; then
      log "merged $b ($(git -C "$QA" rev-parse --short "$b"))"
    else
      log "CONFLICT merging $b: left out ($(git -C "$UI" diff --name-only --diff-filter=U | tr '\n' ' '))"
      git -C "$UI" merge --abort
    fi
  done
fi
printf '%s\n' "$(git -C "$UI" log -1 --format='%h %s')" > "$RUN/ui-merge.txt"
for b in main "${BRANCHES[@]}"; do printf '%s %s\n' "$b" "$(git -C "$QA" rev-parse --short "$b")"; done >> "$RUN/ui-merge.txt"

cd "$UI/web"
if [[ ! -d node_modules ]] || [[ package-lock.json -nt node_modules/.package-lock.json ]]; then
  log "npm ci"
  npm ci --no-audit --no-fund --loglevel=error
fi
if (( build )); then
  log "build (tsc -b && vite build)"
  if ! npm run -s build > "$RUN/build.log" 2>&1; then
    log "BUILD FAILED with tsc; see build.log. Building with vite only to keep testing."
    npx vite build >> "$RUN/build.log" 2>&1
  fi
fi

mkdir -p "$UI/web/e2e"
cp "$QA/web/e2e/flows.spec.ts" "$UI/web/e2e/flows.spec.ts"
cp "$QA/scripts/e2e/playwright.config.ts" "$UI/web/e2e/qa.config.ts"

preview_pid=""
if [[ -z "${QA_WEB_URL:-}" ]]; then
  export QA_WEB_URL="http://127.0.0.1:$PORT"
  npx vite preview --port "$PORT" --strictPort --host 127.0.0.1 > "$RUN/preview.log" 2>&1 &
  preview_pid=$!
  trap '[[ -n "$preview_pid" ]] && kill "$preview_pid" 2>/dev/null || true' EXIT
  for _ in $(seq 1 60); do curl -fsS -o /dev/null "$QA_WEB_URL/" && break; sleep 0.5; done
fi
log "testing $QA_WEB_URL (run $QA_RUN_ID)"
set +e
QA_REPO="$QA" npx playwright test -c e2e/qa.config.ts "$@" 2>&1 | tee "$RUN/playwright.log"
status=${PIPESTATUS[0]}
set -e
python3 "$QA/scripts/e2e/teardown.py" "$RUN" "$status" || true
python3 "$QA/scripts/e2e/report.py" || true
log "playwright exit $status"
exit "$status"
