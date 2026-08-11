---
title: A HUD element's press only fires on `kind: button` or `kind: widget` — the schema accepts one on a `panel` and the renderer never draws it
date: 2026-08-09
scope: content/hud/, content/menus/, pwa/src/game/hud/nodes.tsx
concepts: [hud, press, actions, fail-silent, drive]
---

`hud-schema.mjs` allows `press:` on a `button`, a `widget` AND a `panel`, but
`HudNode` (`pwa/src/game/hud/nodes.tsx`) attaches a handler only in the `button`
and `widget` cases — a `panel` renders as a bare `<div>` with its children and
nothing else. The panel allowance exists for the in-game menus' backdrop
`dismiss:` (`MenuLayer.tsx` runs that one itself) and for nothing else. So
adding a press to an existing `panel` element compiles clean, passes
`hud_catalog_test`'s "names an action the app supplies on every press", draws a
byte-identical element, and answers no tap at all. Making an element pressable
means changing its `kind` to `button` (which also owes it an `aria:` — the
schema refuses one without).

Two more things a HUD element needs before a press can land, both invisible in
YAML:

- **The verb has to be supplied by the mounting screen.** An action the screen
  does not provide is a press that does nothing rather than a build error, by
  design — so `pauseGame` on the drive surface meant adding it to
  `DriveScreen.tsx`'s `hudContext.actions` beside `driveResume`/`driveSkip`.
- **The element has to be reachable by a pointer at all.** Whole HUD surfaces
  are deliberately tap-transparent (`.drive-hud-shelf`, `.drive-dash`,
  `.drive-clock-slot` all carry `pointer-events: none`), so a new button needs
  `pointer-events: auto` on its own class — and on the road it also needs the
  shelf to out-rank the full-screen steering pad, which is drawn AFTER it and
  otherwise hit-tests first.
