#!/usr/bin/env bash
# Run the Tacit backend (serves the API and the built web app on 127.0.0.1:8710).
set -euo pipefail
cd "$HOME/tacit"
export MUJOCO_GL="${MUJOCO_GL:-egl}"
exec "$HOME/tacit/.venv/bin/uvicorn" tacit.app:app --app-dir "$HOME/tacit/backend" \
  --host "${TACIT_HOST:-127.0.0.1}" --port "${TACIT_PORT:-8710}" --ws-max-size 16777216 --log-level info
