# Model fixtures

Real request and response pairs from the Tacit models, captured on this box. Vision members
come from each standalone package on chip 0 (2026-10-27) with
`models/cohost-vision/tools/vision_probe.py fixtures <member> --port <port>`; the same requests
replayed against the cohost group give the same outputs (see `models/cohost-vision/README.md`).

| dir | model | port | request | notes |
|---|---|---|---|---|
| `hamer/` | HaMeR (`changh95/hamer-p150`) | 21000 | `request.json` right hand, `request_left.json` left hand of `sample1.jpg` | MANO parameters only (`mano_available: false`) |
| `gaze/` | Gaze-LLE (`changh95/gaze-lle-p150`) | 21001 | 3 head boxes on `source_1.jpg`, `heatmap_format: none`; `request_heatmap.json` asks for `npz` | base64 heatmaps dropped from the saved response |
| `rfdetr/` | RF-DETR (`changh95/rf-detr-p150`) | 21002 | `demo_source.jpg`, threshold 0.5 | 5 COCO detections |
| `vggt/` | VGGT-1B (`changh95/vggt-1b-p150`) | 21003 | 2 views (`view_1.jpg`, `view_2.jpg`), `output_format: npz` | `dense.data` (3.4 MB npz) dropped from `response.json`; `request_json.json` / `response_json.json` carry the dense arrays as JSON at `json_stride: 32` |

Every request body is the exact JSON that was sent (`curl -d @request.json localhost:<port>/predict`).
Standalone latency, warm, 20 requests (client wall p50 / model time p50): HaMeR 15.2 / 13.1 ms,
Gaze-LLE (3 heads) 9.6 / 6.3 ms, RF-DETR 13.2 / 8.7 ms, VGGT (2 views) 1112 / 895 ms.
Each member answered the same request bit-identically on repeat.
