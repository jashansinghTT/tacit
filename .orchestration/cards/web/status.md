# Status: web

State: running
Updated: 2026-10-27T18:55:00+00:00

## Now
Scaffolding `web/` (Vite 7, React 18.3, TS 5.9 strict, Tailwind 4, r3f 8 + drei 9 + three, zustand,
react-router 6, TanStack Query 5, recharts 2, lucide, framer-motion). Backend on 8710 is not up yet,
so pages are built against an in-app mock (`VITE_TACIT_MOCK=1`) that returns the exact shapes in
docs/API.md; the default build talks to the real API only.

## Decisions
- Design MCP tools (MotionSites `mcp__motionsites__*`, 21st.dev `mcp__21st__*`) are not available
  in this session's tool list, so no prompt retrievals or component quota were spent. The design
  system is built from first principles to the card's "control room for skills" brief.
- Pinned to versions that are known-compatible with React 18 (r3f 8 / drei 9, TS 5.9, ESLint 9,
  Vite 7) rather than the newest majors (TS 7, ESLint 10, Vite 8, r3f 9 need React 19 or are new).

## Blockers
None.
