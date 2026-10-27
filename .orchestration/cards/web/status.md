# Status: web

State: running
Updated: 2026-10-27T20:05:00+00:00

## Scope (after the lead's split)
Mine: landing, design system and shared components (`components/ui`, `components/layout`, styles,
`App.tsx`, `lib/api` core, `lib/mock` core), Studio, Skills, SkillDetail (overview, twin, SOP,
verify, answer), Box, Tour, NotFound. Learn/Lesson/Team → web-learn; Exchange/Listing/Sell/
Library/Earnings + `components/exchange` → web-exchange; RobotIndex/RobotLab +
`three/FrankaArm.tsx` + `lib/mock/robot.ts` → web-robot.

## Works (mock mode, screenshots checked)
- Design system: tokens (`src/styles/index.css`), primitives (`components/ui`: Button, Badge,
  Panel, Spotlight, Tabs, Segmented, Stat, Meter, ScoreRing, Sparkline, Ticker, Timeline, Stepper,
  Toast, Dialog, Switch, CheckRow, Slider, TextInput, Select, Avatar, Kbd, ServedByList,
  BackendBadge, ChipTag, VerifiedBadge), app shell (top bar, persona switcher sending
  `X-Tacit-User`, guided tour "Show me", page transitions, reduced motion).
- Landing: 3D hero (ghost hands + Franka mirroring them via IK) in the Veyra hotspot pattern with
  detail panels, Watch→Earn beam pipeline, live box stats, use-case bento, moat over the mesh
  video, Exchange preview, CTA over the rings video, footer.
- Box: board map of 4 chips, per-model p50 sparklines, DRAM/L1 meters.
- Skills list; Skill detail with Overview (video + overlays + steps), Twin (3D, synced clock,
  slow-mo, loop step, orbit), SOP (markdown + export), Verify (score, certificate, real vs AI-made
  point clouds), Answer questions (voice → STT → saved).
- Mock layer (`VITE_TACIT_MOCK=1`) for every route/socket in API.md; real build strips it.

## Now
Merged main (backend live on 8710). Switching my pages to the real API, then Studio (F1 live
capture with overlays, coach with `coach_audio`, VAD answers, processing view), then the
Playwright smoke suite and evidence screenshots.

## Decisions
- MotionSites/21st tools were only in the lead's session; adopted the lead's design sources from
  `docs/design/` (Veyra hotspot hero, Cybersecurity beam pipeline, liquid-glass CTA, AnimatedBeam
  and Spotlight from 21st). Backgrounds transcoded to `web/public/bg/` (not `/media`, which the
  backend owns).
- Versions pinned for React 18: r3f 8 / drei 9, three 0.172, TS 5.9, ESLint 9, Vite 7.
- Accent font: Instrument Serif italic for two headline words only (hero, closing CTA).
- `three/FrankaArm.tsx` is now web-robot's; the landing hero uses it (props `q`, `glow`). Please
  keep that API or tell me.

## Blockers
None.
