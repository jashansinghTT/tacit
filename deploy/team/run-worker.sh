#!/usr/bin/env bash
# Run (or resume) one Tacit team worker as a headless Claude Code session.
#   run-worker.sh <card> [message]   first run uses the card prompt; later runs resume the
#                                    same session with [message] (or "continue the card").
set -uo pipefail
card="$1"; shift || true
msg="${1:-}"
root="$HOME/tacit"
wt="$HOME/tacit-wt/$card"
[ "$card" = "lead" ] && wt="$root"
cdir="$root/.orchestration/cards/$card"
mkdir -p "$cdir" "$root/logs/team"
sid_file="$cdir/session_id"
log="$root/logs/team/$card.jsonl"
common=(--permission-mode auto --output-format stream-json --verbose
        --add-dir "$root" --add-dir "$HOME/tt-model-manager" --add-dir "$HOME/.cache/tt-model"
        --add-dir "$HOME/tacit-wt")
cd "$wt"
if [ ! -s "$sid_file" ]; then
  sid="$(python3 -c 'import uuid; print(uuid.uuid4())')"
  echo "$sid" > "$sid_file"
  prompt="$(cat "$root/deploy/team/prompts/$card.md")"
  echo "[$(date -Is)] start $card session $sid" >> "$root/logs/team/events.log"
  claude -p "$prompt" --session-id "$sid" "${common[@]}" >> "$log" 2>&1
else
  sid="$(cat "$sid_file")"
  [ -z "$msg" ] && msg="Continue your card from where you left off. Re-read your status.md and the card, then keep going until the merge gate is met."
  echo "[$(date -Is)] resume $card session $sid" >> "$root/logs/team/events.log"
  claude -p "$msg" --resume "$sid" "${common[@]}" >> "$log" 2>&1
fi
rc=$?
echo "[$(date -Is)] exit $card rc=$rc" >> "$root/logs/team/events.log"
exit $rc
