#!/usr/bin/env bash
# Every 30 min (systemd timer): if the lead's heartbeat is stale and no lead session is running,
# start a headless lead session that continues the board. At most 6 starts a day; never if STOP exists.
set -uo pipefail
ROOT="$HOME/tacit"
HB="$ROOT/.orchestration/heartbeat"
EV="$ROOT/logs/team/events.log"
mkdir -p "$ROOT/logs/team"
[ -e "$ROOT/.orchestration/STOP" ] && exit 0
[ -e "$ROOT/.orchestration/DONE" ] && exit 0

age=999999
[ -f "$HB" ] && age=$(( $(date +%s) - $(date -d "$(cat "$HB")" +%s 2>/dev/null || echo 0) ))
[ "$age" -lt 3600 ] && exit 0

# A lead is already working if its tmux window runs claude.
if tmux list-panes -a -F '#{session_name}:#{window_name} #{pane_current_command}' 2>/dev/null | grep -q '^tacit-team:lead .*claude'; then
  exit 0
fi

today=$(date -u +%F)
starts=$(grep -c "\[$today.*start lead\|\[$today.*resume lead" "$EV" 2>/dev/null || echo 0)
[ "$starts" -ge 6 ] && exit 0

tmux has-session -t tacit-team 2>/dev/null || tmux new-session -d -s tacit-team -n idle "bash"
tmux kill-window -t tacit-team:lead 2>/dev/null || true
tmux new-window -d -t tacit-team -n lead "bash $ROOT/deploy/team/run-worker.sh lead 'The previous lead session is gone (heartbeat ${age}s old). Take over as lead: read .orchestration/LEAD.md, STATUS.md, .orchestration/board.json and every card status, touch the heartbeat, and continue the loop until the release is done or you are blocked. Keep STATUS.md true.'; exec bash"
