---
title: A HUD resolve CALLS the scripts it walks past — filter by surface BEFORE resolving, never after
date: 2026-08-07
---

`resolveLayout` (`pwa/src/game/hud/resolve.ts`) does not just build a tree, it
runs every Lua judgement in the branches it walks. It used to resolve ALL
top-level regions and let `HudRoot` filter the result by surface — so a fight's
publish ran the road's `drive.speed_label` against a snapshot where
`state.drive` is an empty group, it threw on the first `..`, and `script.ts`
disowned both dials FOR THE REST OF THE RUN as its fail-open policy promises.
The player then reached the drive minigame and found two empty framed plates in
the corners of the windscreen. The surface is a parameter of the resolve now.

Two traps that let this ship green:

- **`?drive` (the workbench) cannot reproduce it.** It never mounts the field
  HUD, so the scripts are still healthy — the bug only exists on the path
  where a fight is resolved first. Reproduce a HUD script fault on the surface
  the PLAYER reaches it from, not the deep link.
- **`hud_catalog_test.ts`'s `VALUES` answers every binding the schema knows,
  the road's included**, so a whole-tree resolve looked perfectly fine there.
  A test for a cross-surface fault must build a context with ONLY that
  surface's bindings.
