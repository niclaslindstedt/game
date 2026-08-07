---
title: A line with no box, no name and no portrait is authored in CODE — and still owes the manuscript
date: 2026-08-07
---

The drive minigame's words (`GLUED_BARKS`, and now `CROWD_THOUGHTS` — forty
things the crowd is thinking as the hero drives through them) live in
`pwa/src/game/drive-screen/placards.ts`, not in `content/thoughts.yaml`. That
is not a filing accident and it is not an exemption from the chain: a
`ThoughtDef` is a speaker's NAME, a PORTRAIT, and PAGES the dialogue box flows
into a measured column and the player taps through, and a line floating over a
head on a road going past at 120 mph has none of those four. It is a BARK, like
a boss's set-piece line.

So when a request adds words to the road:

- author them where the presentation is (the `placards.ts` list), and pair the
  list's LENGTH with the engine-side count the sim indexes with — the engine is
  never told what the words are, so a list shorter than its count silently
  stops using its tail;
- walk the chain anyway. `docs/story.md` gets the beat, `docs/manuscript.md`
  gets all forty verbatim in narrative order, and the manuscript's "Where the
  data lives" table gets a row pointing at the code. The chain cares that a line
  is written down, not which file it sleeps in.

Two craft rules that came out of looking at it in the running game, both worth
reusing for any floating text on the drive: the camera only shows ~308 world px
past the bumper (`CAMERA_LEAD_FRAC`), so a line that fades in further out than
`READ_PX` (260) is drawn half off the right edge; and a six-word line at the
shout's wrap width folds into THREE rows, which is a paragraph when the reading
window is half a second — widen the column instead, and check it against a real
screenshot rather than the number.
