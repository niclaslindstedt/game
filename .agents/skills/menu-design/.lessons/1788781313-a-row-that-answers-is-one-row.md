---
title: A row that must ANSWER a press is ONE row with a scripted label AND a scripted colour — never several gated rows
date: 2026-09-07
scope: content/menus/, content/hud/
concepts: [menus, hud, lua-scripts, press, actions, bindings, gating]
---

A button whose press has an outcome the player must be told (the pause menu's
save warning: `! SAVE FAILED - RETRY` → `▲ GAME SAVED`) is several MOODS of one
row, not several rows with `visible:` gates. Both halves are authorable as
judgements — `text: { script: file.fn }` and `color: { script: file.fn }`
(`checkColor` in `hud-schema.mjs` accepts either a `#hex` or a script) — so the
whole thing is one `content/menus/` row plus two Lua functions. Separate gated
rows would let a mod replace one mood and not the others, and the player would
meet two different buttons in the same place.

Three mechanics to get right:

- **A `visible:` takes a FLAG ONLY** — `checkCondition` refuses a text or
  number binding outright. A text binding carrying the mood needs a flag beside
  it to gate on, which is the house pattern already (`menu.cleanSlates` +
  `menu.hasCleanSlate`).
- **The vocabulary is `scripts/asset-tools/hud-schema.mjs`, not
  `ingame-menu-schema.mjs`** — a new ACTION goes in `HUD_ACTIONS` and a new
  binding in `HUD_BINDINGS`, answered app-side in `menus/bindings.ts`
  (`MenuUiState`) and in the `HudActions` table the screen's hook returns.
  `tests/content/ingame_menu_catalog_test.ts` pins both pairs, and `make
  mod-catalog` goes in the same commit.
- **A mood that comes from the RUN, not from the press, cannot live in a ref.**
  The `react-hooks/refs` rule refuses a `ref.current` read during render, and it
  is right: a fact the menu must re-render on belongs in state, fed by a
  callback that fires on the TRANSITION only.

The pixel font has no tick — `▲` and `!` are in the glyph set, `✓` is not — so
a confirmation carries in the words and the colour, and a label is worth
asserting against `GLYPHS` (a missing cell draws `?`, not a gap).
