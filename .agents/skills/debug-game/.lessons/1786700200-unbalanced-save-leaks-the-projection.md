---
title: A body drawn the wrong SIZE is somebody else's unbalanced `ctx.save()` — look at what was drawn BEFORE it, not at the body
date: 2026-08-09
scope: pwa/src/game/render/, pwa/src/game/drive-screen/
concepts: [rendering, canvas, projection, billboard, symptom-far-from-cause]
---

"The car stretches sometimes in the minigame" was reported against the car and
was nowhere near it. Every body in this game is drawn inside `billboard()`
(render/tilt.ts), which is `ctx.save()` → translate → apply the INVERSE world
projection → draw → `ctx.restore()`. Leave one extra `save()` on the stack
inside that callback and `endBillboard` pops the wrong frame: the inverse
projection never comes off, and every body drawn AFTER that one wears a second
one — 1/pitch taller (a third again at the shipped 0.75, and half again if it
happens twice in a frame). The hero's wagon is drawn last because it is nearest
the camera, so it takes the worst of it while the wreck three lanes back that
caused it looks perfectly fine.

The leak was an early `return` skipping a guarded `ctx.restore()`
(`drawLightCones`, render/vehicles.ts — `if (tailOut) return;` sitting after
`if (yaw !== 0) ctx.save();`). Two ways to find this fast:

- `grep -c "ctx.save()"` vs `ctx.restore()` per file only proves the LITERALS
  balance. It said 2/2 here. What matters is whether every path between them
  runs the restore, so read for `return`/`continue`/`throw` INSIDE a save block
  and prefer `if (!x) { … }` over an early return there.
- Assert it, don't screenshot it. `tests/vehicle_assembly_test.ts` has a
  transform-tracking canvas probe (`drawProbe`); giving it `matrix()` and
  `depth()` accessors turns "did this pass give the context back" into a
  one-line expectation, and the size bug into a diff of two blit lists. On
  screen it is a car that looks wrong for reasons nothing near it explains.

The flags that reach the leaky branch also arrive TOGETHER for a physical
reason (a rear-ending both knocks the tail lamps out and spins the car), which
is why "sometimes" was really "most collisions".
