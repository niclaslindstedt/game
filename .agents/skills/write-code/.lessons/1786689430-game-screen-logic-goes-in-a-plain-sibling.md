---
title: App-side logic worth testing goes in a plain sibling of `event-fx.ts`, never inside it — that module is unreachable from a root test
date: 2026-08-14
scope: pwa/src/game/game-screen/
concepts: [tests, typecheck, false-green, code-splitting]
---

`event-fx.ts` cannot be imported from `tests/` at all: it reaches
`pickup-ui.ts` → `PickupFeed.tsx`, and the root tsconfig typechecks `tests/`
without `--jsx`, so any test importing it fails `make lint` with TS6142 (the
general rule is a `commit` lesson; this names the module it bites on).

The tree already answers it, and following the pattern is free at the time you
write the code and expensive afterwards: the decision goes in a plain `.ts`
sibling that `event-fx.ts` calls, and the test imports the sibling.
`corpse-launch.ts` (how hard a kill throws a body) and `float-lane.ts` (where a
floating word sits, and — with `trackFloats` — which body it rides) are the two
shipped examples, each with its own root test.

Pick the sibling by what the logic IS, not by the event that raises it:
`trackFloats` moves a float, so it belongs beside the lane allocator that
placed it, which also keeps the tracker's "don't recompute `lift`" rule next to
the code that computes it.
