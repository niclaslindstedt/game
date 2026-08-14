---
title: When a safe-mode dressing says a body is GONE, the sim owes it a parameter — a re-hue cannot delete anybody
date: 2026-08-14
scope: engine/game/drive/, pwa/src/game/drive-screen/
concepts: [sfw, drive, remains, feedback, eject]
---

SFW mode is a re-dressing, so the reflex is that nothing about the sim changes.
There is one exception and it shipped broken for months: the drive's heavy
`fairyDust` burst is drawn as **the whole of what is left of somebody**, and the
engine was still running the gore-off path underneath it — the struck body
tumbled off the bumper, flew a few lanes and lay in the gutter. The player saw a
person dissolve into glitter and then watched the same person skid to a stop.
Nothing failed: `gib`/`split` were correctly false, every burst was correct, and
three docs plus the gallery card all confidently described a body peeling away.

**A presentation may re-hue, re-shape and replace what a thing is MADE of, but
it cannot remove a body from the road — only the sim can.** So a dressing whose
picture implies an absence needs the sim to be told: `DriveParams.dust`, set
from `sfwModeEnabled()` beside `gib`/`split` in `begin.ts`, from `exhibit.sfw`
in `exhibit-run.ts`, and from the settings (never a `?gore` flag) in
`DriveWorkbench`. Its invariant is one line: **`dust` is exactly the dressing's
`fairy`.**

**And a body enters that road at TWO doors, not one.** `collide.ts` is the
bumper; `throwBody` (`eject.ts`) is everybody who comes off a saddle or through
a windscreen, and it pushes its own pedestrian at the end. A fix applied to one
leaves the other tumbling — and the eject path is the harder one to notice,
because it needs a two-wheeler in the lane. Either door still BOOKS its event
and its `bodies++`; what `dust` changes is only what the road keeps.

The cheapest check is the gallery: `--only drive-fairy-dust --at 200,900,1400`.
The 1400 ms frame is the whole test — the cloud has gone and the tarmac has to
be empty.
