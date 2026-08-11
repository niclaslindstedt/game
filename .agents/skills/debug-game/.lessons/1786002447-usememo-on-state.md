---
title: Never `useMemo(…, [state])` — the run state is mutated in place, so the memo never re-runs
date: 2026-08-06
scope: pwa/src/
concepts: [preact, memoization, mutable-state]
---

`GameState` has ONE object identity for a whole run: the step pipeline mutates
it rather than replacing it. So any app-side `useMemo(() => derive(state),
[state])` computes once at mount and is frozen for the rest of the run, while
everything derived directly in the render body keeps updating around it — which
makes the bug look like "half the surface is live and half is stuck".

Shipped example: `TalkOverlay.tsx` memoized `talkChoices(state)` that way, so
every conversation in the game drew each new page of speech under the OPENING
node's answer rows (the index the player pressed was still resolved against the
real node by the engine, so the rows on screen were not the rows being chosen
between). The fix is to call the derivation in the render body — these filters
are a pass over a handful of rows, and any dependency list would have to name
the node AND every flag a gate reads.

It is invisible to the tests (there is no jsdom/testing-library in this repo)
and invisible in the YAML. Catching it needed a screenshot of the SECOND page
of a tree — which is the general lesson: when eyeballing a multi-page surface,
shoot a page that is not the first one.
