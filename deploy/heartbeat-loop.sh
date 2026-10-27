#!/usr/bin/env bash
# Keep the lead heartbeat fresh for as long as the interactive lead's Claude process lives.
pid="$1"; hb="$HOME/tacit/.orchestration/heartbeat"
while kill -0 "$pid" 2>/dev/null; do date -Is > "$hb"; sleep 240; done
