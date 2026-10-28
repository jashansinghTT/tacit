# Design sources for the web card

> The third-party previews, background frames and component files this note mentions were working
> references during the build and are not kept in the repository. The shipped backgrounds are in
> `web/public/bg/`; sources: [MotionSites](https://motionsites.ai) and [21st.dev](https://21st.dev).

Fetched by the lead from MotionSites and 21st.dev (the MCP tools only exist in the lead's session).
Adapt them to the Tacit design system; do not copy third-party branding or copy text.

Quota spent: MotionSites free plan, 3 of 3 prompt retrievals (nothing more is available without a
plan: https://motionsites.ai/unlimited). 21st.dev free tier, 2 of 2 component retrievals for
2026-10-27 (the quota resets daily at 00:00 UTC; ask the lead for more after that).

## Background videos (MotionSites, free)

In `docs/design/media/` (gitignored; copy what you use into `web/public/media/bg/`):

| File | Look | Suggested use |
|---|---|---|
| `bg-wireframe-mesh.mp4` | grey particle mesh rippling on black, 1920×1080, 10 s loop | landing hero or the Check section (reads as "3D reconstruction") |
| `bg-blue-rings.mp4` | blue light rings on black, 10 s loop | CTA section background |
| `bg-dark-lens.mp4` | light scene (not dark) | do not use |

Frames: `docs/design/media/*.jpg`. Videos are 5.8 to 7.5 MB; transcode a 1280-wide WebM/H.264 copy
for the web (`ffmpeg -i in.mp4 -vf scale=1280:-2 -c:v libx264 -crf 28 -an out.mp4`) and add a poster.

## MotionSites prompts (summarised; adapt the pattern, not the brand)

### 1. Veyra Electric: "Electric, inside out." (hero pattern)
Source release: https://github.com/amirmushichge/veyra-interactive-car (tag `v1.0.0`; check its
LICENSE before reusing code, and keep attribution if you do). Preview: `.tools/design/veyra-electric.png`
in the main repo.

The pattern: one framed media plane (3px white frame, radius 16px) holding a product still; four
image-relative hotspots (48px targets, small bright discs with a thin plus, restrained hover
labels); hover plays a short forward clip on a canvas (reverse clip on leave; never overlapping
playback; hold the last frame); click zooms/crossfades into a detail view with a title,
description, three component points and a Back control (Escape returns); a slim title row
("Explore beneath the surface. Select a point to begin.") and a four-column footer of short notes.
States: `overview → entering → detail → returning → overview`, with guards while transitioning.

For Tacit: the framed plane is a rendered still (or live R3F canvas) of the workbench: the
expert's ghost hands, the parts, the Franka arm. Five hotspots: **Watch** (camera / hands),
**Check** (point cloud), **Teach** (lesson card), **Do** (robot arm), **Earn** (exchange). Hover
animates that part of the scene; click enters a detail panel that explains the step and links into
the app. Dark version: graphite plane, hairline frame instead of white, electric-accent hotspots.

### 2. Cybersecurity Hero: animated icon pipeline (flow section)
Dark card (`#0d0b12`, radius 20px, 1px `rgba(255,255,255,0.07)` border) with a large radial
gradient arc at the top (`radial-gradient(circle at 50% -70%, transparent 60%, … tinted stops …, #fff 95%)`)
and a 40px crosshatch grid masked to the arc. Centrepiece: round neumorphic nodes (46px side,
64px centre; `box-shadow: 6px 6px 12px rgba(0,0,0,.4), -4px -4px 10px rgba(255,255,255,.03),
inset 1px 1px 1px rgba(255,255,255,.05), inset 4px 4px 8px rgba(0,0,0,.4)`, dotted outer ring at
`inset: -7px`) joined by 1px lines; an SVG beam path through the node centres with a moving
gradient window (animate `x1`/`x2` of a `userSpaceOnUse` linear gradient, half-width 5%), a glow
copy of the path (`feGaussianBlur stdDeviation=2`), a radial "splash" on arrival at the centre node
(`scale .4 → 1.4`, fade out, 0.8 s), and side glows that light the node being passed.
State machine on `requestAnimationFrame`: segment 1 (800 ms) → splash (800 ms) → segment 2 (800 ms)
→ idle (1000 ms), looping. Large light headline (`font-weight: 300`, clamp 2.4 to 4 rem, -0.02em)
with a gradient-clipped second line.

For Tacit: five nodes, Watch → Check → Teach → Do → Earn, the beam travelling node to node with
a splash at each, each node labelled with the model and chip that does that step.

### 3. Liquid Glass CTA (closing section)
Full-width section with a looping muted background video, 200px black fades at top and bottom,
centred serif-italic headline, two pill buttons (one "liquid glass", one solid white), and a slim
footer bar (copyright left, links right). Liquid-glass button CSS:

```css
.liquid-glass-strong {
  background: rgba(255,255,255,0.01); background-blend-mode: luminosity;
  backdrop-filter: blur(50px); -webkit-backdrop-filter: blur(50px); border: none;
  box-shadow: 4px 4px 4px rgba(0,0,0,0.05), inset 0 1px 1px rgba(255,255,255,0.15);
  position: relative; overflow: hidden;
}
.liquid-glass-strong::before {
  content: ''; position: absolute; inset: 0; border-radius: inherit; padding: 1.4px;
  background: linear-gradient(180deg, rgba(255,255,255,.5) 0%, rgba(255,255,255,.2) 20%,
    rgba(255,255,255,0) 40%, rgba(255,255,255,0) 60%, rgba(255,255,255,.2) 80%, rgba(255,255,255,.5) 100%);
  -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
  -webkit-mask-composite: xor; mask-composite: exclude; pointer-events: none;
}
```
Use `bg-blue-rings.mp4` (local) instead of the prompt's remote HLS stream.

## 21st.dev components (code in `docs/design/21st/`)

- `animated-beam.tsx`: Magic UI's AnimatedBeam (MIT): SVG path between two refs inside a
  container, quadratic curvature, moving gradient via framer-motion, ResizeObserver re-measure.
  Use for the Watch → Earn connectors and the Box page model links.
- `spotlight.tsx`: a pointer-following radial light with a lit 1px edge ring (needs
  `@radix-ui/react-slot`; updates two CSS variables per frame; skips touch). Use on cards and panels.
- Bento grid: build it from the design system (no retrieval left today). Searched options for
  reference: https://21st.dev/@kokonutd/components/bento-grid,
  https://21st.dev/@manuarora700/components/bento-grid.
- Other candidates seen (metadata only): Border Beam (https://21st.dev/@dillionverma/components/border-beam),
  Pulse Beams (https://21st.dev/@manuarora700/components/pulse-beams), Robot Hero (R3F, https://21st.dev/@alexperezcedeno/components/robot-hero).
