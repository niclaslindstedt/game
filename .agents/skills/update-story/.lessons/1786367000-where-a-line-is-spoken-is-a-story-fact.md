---
title: WHERE a line is spoken is a story change too — and the placement is usually holding a mechanism up
date: 2026-08-10
scope: engine/game/items/flow.ts, content/thoughts.yaml
concepts: [placement, monologue, drive, engine-work, story-skip, drift]
---

"That line should come first, not last" rewrites nothing and is still a full
chain walk: the placement is stated in `docs/story.md`, in the manuscript's
italic stage note, and in the content file's comment block, and it is
IMPLEMENTED in engine code. Moving the drive's arrival verdict to the head of
the destination's monologue was one line of `introPages` and ten of prose.

Budget for the engine half, because a page ORDER is load-bearing more often
than it looks. The verdict went last so the replay skip could be a single
assignment — `introPage = level.intro.length` paged past the half already read
and landed on the half that had not been. Put in FRONT, that trick is gone: the
skip stopped being an index and became `introSkipped` on the state, with
`introPages` answering it by shrinking the monologue to the arrival line alone.
Whenever a reorder is asked for, grep for who READS the order before editing it.

And grep BOTH phrasings before declaring the tree consistent. Half the tree
(`RunParams.arrivalThought`, `SessionParams`, `GameState`) already said "the
first page" while `introPages` did the opposite — doc comments describing a
placement drift silently, because nothing compiles them.
