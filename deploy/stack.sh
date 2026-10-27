#!/usr/bin/env bash
# Tacit stack control.
#   stack.sh up            start every model group that is not answering, then the backend
#   stack.sh up-models     model groups only
#   stack.sh down          stop the backend and every model group (clean tt-model stop)
#   stack.sh status        health of every model and the backend
#   stack.sh restart-backend
#   stack.sh logs <group>  tail a model group's container log
set -uo pipefail
ROOT="$HOME/tacit"
TTM="$ROOT/.tools/ttm/bin/tt-model"
LOG="$ROOT/logs"
mkdir -p "$LOG"

# group | package | profile | chip | port | health url
GROUPS_TABLE=$(cat <<'EOF'
speech|jashansinghTT/cohost-speech-blackhole|p150|1|21010|http://127.0.0.1:21013/
llm|jashansinghTT/gpt-oss-20b-blackhole-fast|p150|2|21020|http://127.0.0.1:21020/v1/models
gr00t|changh95/GR00T-N1.7-3B-p150||3|21030|http://127.0.0.1:21030/health
EOF
)

vision_layout() {
  "$ROOT/.venv/bin/python" -c "import yaml; print(yaml.safe_load(open('$ROOT/deploy/stack.yaml')).get('vision_layout','standalone'))" 2>/dev/null || echo standalone
}

healthy() { curl -sf -m 3 "$1" >/dev/null 2>&1; }

cohost_ready() {  # every member of a cohost group ready
  curl -sf -m 3 "$1" 2>/dev/null | "$ROOT/.venv/bin/python" -c "import json,sys; d=json.load(sys.stdin); sys.exit(0 if all(m.get('ready') for m in d['members'].values()) else 1)" 2>/dev/null
}

group_ok() {
  local name="$1" url="$2"
  if [ "$name" = "speech" ]; then cohost_ready "$url"; else healthy "$url"; fi
}

container_for_chip() {  # running container holding a chip, if any
  docker ps --format '{{.Names}} {{.Label "org.tenstorrent.tt-model.devices"}}' 2>/dev/null | awk -v c="$1" '$2==c {print $1}' | head -1
}

start_group() {
  local name="$1" pkg="$2" profile="$3" chip="$4" port="$5" url="$6"
  if group_ok "$name" "$url"; then echo "  ok      $name (chip $chip)"; return 0; fi
  local holder; holder=$(container_for_chip "$chip")
  if [ -n "$holder" ]; then echo "  booting $name (chip $chip held by $holder)"; return 0; fi
  echo "  start   $name on chip $chip, port $port"
  local args=(serve "$pkg" --device-id "$chip" --port "$port" --detach)
  [ -n "$profile" ] && args+=(--profile "$profile")
  "$TTM" "${args[@]}" >>"$LOG/serve-$name.log" 2>&1 || echo "  FAILED  $name (see $LOG/serve-$name.log)"
}

up_models() {
  echo "model groups:"
  while IFS='|' read -r name pkg profile chip port url; do
    start_group "$name" "$pkg" "$profile" "$chip" "$port" "$url"
  done <<< "$GROUPS_TABLE"
  if [ "$(vision_layout)" = "cohost" ] && [ -x "$ROOT/deploy/vision-up.sh" ]; then
    if healthy http://127.0.0.1:21000/health && healthy http://127.0.0.1:21002/health; then
      echo "  ok      vision cohost (chip 0)"
    elif [ -n "$(container_for_chip 0)" ]; then
      echo "  booting vision cohost (chip 0 held by $(container_for_chip 0))"
    else
      echo "  start   vision cohost on chip 0"
      "$ROOT/deploy/vision-up.sh" --no-wait >>"$LOG/serve-vision.log" 2>&1 || echo "  FAILED  vision (see $LOG/serve-vision.log)"
    fi
  else
    echo "  skip    vision (layout $(vision_layout); chip 0 belongs to the vision card until its gate passes)"
  fi
}

down_models() {
  for pkg in jashansinghTT/cohost-speech-blackhole jashansinghTT/gpt-oss-20b-blackhole-fast changh95/GR00T-N1.7-3B-p150; do
    "$TTM" stop "$pkg" >>"$LOG/stop.log" 2>&1 || true
  done
  [ -x "$ROOT/deploy/vision-down.sh" ] && "$ROOT/deploy/vision-down.sh" >>"$LOG/stop.log" 2>&1 || true
}

status() {
  printf "%-10s %-6s %-6s %s\n" GROUP CHIP STATE URL
  while IFS='|' read -r name pkg profile chip port url; do
    if group_ok "$name" "$url"; then s=up; elif [ -n "$(container_for_chip "$chip")" ]; then s=booting; else s=down; fi
    printf "%-10s %-6s %-6s %s\n" "$name" "$chip" "$s" "$url"
  done <<< "$GROUPS_TABLE"
  for m in hamer:21000 gaze:21001 rfdetr:21002 vggt:21003; do
    n=${m%%:*}; p=${m##*:}
    if healthy "http://127.0.0.1:$p/health"; then s=up; else s=down; fi
    printf "%-10s %-6s %-6s %s\n" "$n" 0 "$s" "http://127.0.0.1:$p/health"
  done
  if healthy http://127.0.0.1:8710/api/health; then s=up; else s=down; fi
  printf "%-10s %-6s %-6s %s\n" backend - "$s" "http://127.0.0.1:8710"
}

case "${1:-status}" in
  up) up_models; systemctl --user start tacit-backend.service 2>/dev/null || true ;;
  up-models) up_models ;;
  down) systemctl --user stop tacit-backend.service 2>/dev/null || true; down_models ;;
  down-models) down_models ;;
  status) status ;;
  restart-backend) systemctl --user restart tacit-backend.service ;;
  logs) "$TTM" logs "${2:?group package id}" ;;
  *) echo "usage: $0 up|up-models|down|status|restart-backend|logs <pkg>"; exit 2 ;;
esac
