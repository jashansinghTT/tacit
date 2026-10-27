# Evidence: vision card (tacit-vision cohost on chip 0)

Captured 2026-10-27 with `models/cohost-vision/tools/vision_probe.py`; summarised in
`models/cohost-vision/README.md`. Every "identical_to_baseline" count compares the full response
of the cohost group with the standalone package's response to the same request (max abs diff 0).

- `latency_one_at_a_time.jsonl`: 20 warm requests per member, standalone vs cohost.
- `all_four_at_once.json`, `live_path_with_vggt.json`, `live_path_without_vggt.json`, `soak.json`:
  members called concurrently; every response checked against the standalone baseline.
- `status_port.json`: `GET :21004/` after all of the above (DRAM/L1 per member, compiles_after_capture).
- `cold_boot.txt`: `deploy/vision-up.sh` with the package's kernel cache emptied (221 s).
- `warm_boot_log.txt`: the co-host log of a warm boot (31 s), with the L1 report per phase.
- `cohost-config.json`: the group config the container receives.
