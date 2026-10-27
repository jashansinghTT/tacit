# Tacit status

Updated: 2026-10-27T18:40:45+00:00

State: bootstrapping. Spec, API contract and team board written; model packages pulling;
workers starting.

See .orchestration/board.json for cards and owners.

<!-- runtime:start -->
### Runtime (watchdog, 2026-10-27T19:16:06+00:00)

| service | state | check |
|---|---|---|
| backend | up | http://127.0.0.1:8710/api/health |
| llm | up | http://127.0.0.1:21020/v1/models |
| speech | up | http://127.0.0.1:21013/ |
| gr00t | up | http://127.0.0.1:21030/health |
| hamer | DOWN | http://127.0.0.1:21000/health |
| gaze | DOWN | http://127.0.0.1:21001/health |
| rfdetr | DOWN | http://127.0.0.1:21002/health |
| vggt | DOWN | http://127.0.0.1:21003/health |

tmux sessions: drama3: 2 windows (created Mon Oct 19 07:45:00 2026); gptoss: 3 windows (created Tue Oct 13 04:19:04 2026); mm3: 1 windows (created Wed Sep  9 14:57:33 2026); tacit-heartbeat: 1 windows (created Tue Oct 27 19:10:18 2026); tacit-models: 1 windows (created Tue Oct 27 18:33:23 2026); tacit-team: 3 windows (created Tue Oct 27 18:42:05 2026)
<!-- runtime:end -->
