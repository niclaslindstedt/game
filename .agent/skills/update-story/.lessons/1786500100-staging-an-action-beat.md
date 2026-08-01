---
title: Staging an ACTION into a scene — depth is `pos.y`, height is `lift`
date: 2026-08-01
---

When a request turns a narrated beat into a played one ("he should actually
take the weapon off the wall"), the tier-3 edit is staging, not words — and the
cutscene stage has one trap in it: **`pos.y` is BOTH the mark an actor stands on
and the key the painter sorts by**. Raising an actor by lowering its `y` would
therefore send it BEHIND everything it just walked in front of, mid-jump. That
is what `jump`/`lift` exists for: it raises the drawing and leaves the sort key
alone.

The staging vocabulary that follows from it:

- **Depth is chosen by walking.** To put the hero behind the sofa, walk him
  round its end to a smaller `y` (the couch at `y: 96`, him at `y: 86`) — the
  occlusion is then free and correct, backrest across his knees included.
- **A leap is two `jump` beats**, and whatever the jump was FOR settles between
  them: the instants (`prop` hidden, `hold` sprite) collapse in one frame at the
  apex, so the piece leaves the wall on the frame he reaches it.
- **What he carries is the ITEM ICON at the paper doll's own anchor**
  (`HELD_DX`/`HELD_DY`, `pwa/src/game/paper-doll.ts`), never the wall sprite —
  wall art carries its mount, and the doll's anchor is what makes the cutscene
  hero and the field hero hold the weapon identically.

**Judge the staging from the apex frame, not the contact sheet.**
`pwa/scripts/cutscene-preview.mjs` shoots the START of each beat and polls at
100 ms, so a 400 ms arc is photographed a third of the way down and a grab that
lands perfectly looks like it missed. Poll `window.__cutscene` for
`beat === <the fall> && beatMs < 40` when a single frame is the thing being
judged.

And check the beat where the LINE lands: the closing caption wants the whole man
and the whole weapon in frame, so bring him back out from behind the furniture
before it, not after.
