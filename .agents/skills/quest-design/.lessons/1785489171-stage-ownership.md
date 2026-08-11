---
title: A pass that raises a scene must step LAST, or a later pass silently steals the stage
date: 2026-07-31
scope: engine/game/step/
concepts: [step-order, scenes, staging]
---

Every scene-raising pass in `engine/game/step/index.ts` takes the stage the same
way — by writing `state.phase`. Whichever runs LAST wins, and the loser leaves
its own payload stranded on the state with nothing rendering it.

This shipped as a user-visible bug: a giver's offer box opened and vanished in
the same frame, because `stepSightThoughts` set `phase = "dialogue"` after
`stepQuests` had set `phase = "quest"`, leaving `state.questOffer` set behind a
dialogue the player then tapped away — the giver stayed mid-conversation for the
rest of the run. `stepQuests` therefore runs after every other scene-raising
pass, and both the walk-up and the tap additionally guard on
`state.dialogue === null`.

If you add a pass that raises a scene, decide explicitly where it sits in that
order and say so in a comment. The trace that found it was a
`requestAnimationFrame` loop in the running page logging `phase|questOffer?|pos`
each frame — instrumenting the real page is far faster here than reading the
step list, because the bug is one frame wide.
