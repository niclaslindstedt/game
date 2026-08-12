---
title: WHERE a line is spoken is a story change too — and the placement is usually holding a mechanism up
date: 2026-08-10
scope: engine/game/items/flow.ts, content/thoughts.yaml, pwa/src/game/drive-screen/
concepts: [placement, monologue, drive, engine-work, story-skip, drift]
---

"That line should come first, not last" / "that line belongs on the road, not at
the far end" rewrites nothing and is still a full chain walk: the placement is
stated in `docs/story.md`, in the manuscript's italic stage note, and in the
content file's comment block, and it is IMPLEMENTED in engine code.

Budget for the engine half, because a placement is load-bearing in BOTH
directions. Moving the drive's arrival verdict INTO the destination's monologue
cost a rewrite of `introPages` and grew `GameState.introSkipped` (the replay
skip stopped being a page index once a half sat in front of the level's own).
Moving it back OUT — onto the run-in, printed in front of the place's own line —
deleted all of it: `arrivalThought` off `RunParams`/`SessionParams`/`GameState`,
`introSkipped`, the `arrivalPages` helper, a ref through two app modules, and a
`PROTOCOL_VERSION` bump for the wire field. Grep for who READS the placement
before editing it, and expect the diff to be mostly non-prose either way.

And grep BOTH phrasings before declaring the tree consistent. Half the tree
already said "the first page" while `introPages` did the opposite — doc comments
describing a placement drift silently, because nothing compiles them.
