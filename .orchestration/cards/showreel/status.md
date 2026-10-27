# Status: showreel

State: review
Updated: 2026-10-27T23:24:22+00:00

Merge gate met; see handoff.md.

## Works
- First cut `~/tacit/data/showreel/first-cut.mp4` (74.3 s, 1080p H.264 + AAC) and four preview clips (title,
  Watch to Check, Teach to Do, outro), copies in `~/tacit/.orchestration/evidence/showreel/`.
- Storyboard `showreel/STORYBOARD.md`, claims ledger `showreel/CLAIMS.md`, section README
  `~/tacit/data/showreel/README.md`, contact sheets in `.orchestration/evidence/showreel/`.
- Soundtrack generated on chip 1 (MiniMax Music 3, two takes in the lead's window); credit and
  machine-generated disclosure on the end card.
- Two independent review passes; their findings acted on (see handoff.md).

## Next
- The user reviews the first cut. Open choices for them in handoff.md (opening length, soundtrack take).
- No final render until the user has reviewed.

## Notes for others
- Listing detail API 500 (market._count_episodes got a list): reported, fixed by the lead at 21:31Z.
- Web nit: VerifyTab's details table shows the AI clip's score as "0.23" (toFixed on 0.235); the raw score
  is about 0.2353, so 0.24 (as the score ring shows) is right.
- No GPU access for this user (render node ACL is ttuser only), so WebGL captures are software-rendered.
