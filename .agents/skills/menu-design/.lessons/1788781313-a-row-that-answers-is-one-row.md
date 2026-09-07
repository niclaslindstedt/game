---
title: A row that must ANSWER a press is ONE row with a scripted label AND a scripted colour — never three gated rows
date: 2026-09-07
scope: content/menus/, content/hud/
concepts: [menus, hud, lua-scripts, press, actions, bindings]
---

A button whose press has an outcome the player must be told (the pause menu's
SAVE GAME: offering → `GAME SAVED` → `COULD NOT SAVE`) is three MOODS of one
row, not three rows with `visible:` gates. Both halves are authorable as
judgements — `text: { script: file.fn }` and `color: { script: file.fn }`
(`checkColor` in `hud-schema.mjs` accepts either a `#hex` or a script) — so the
whole thing is one `content/menus/` row plus two Lua functions. Three gated
rows would let a mod replace one mood and not the others, and would need three
ids where the seam wants one.

The app publishes only the READ: a `menu.*` text binding holding `""` /
`"saved"` / `"failed"`. Which words and which colour that becomes is the
judgement, and lives in `content/menus/scripts/`.

Two mechanics to get right:

- **The vocabulary is `scripts/asset-tools/hud-schema.mjs`, not
  `ingame-menu-schema.mjs`** — a new ACTION goes in `HUD_ACTIONS` and a new
  binding in `HUD_BINDINGS`, answered app-side in `menus/bindings.ts`
  (`MenuUiState`) and in the `HudActions` table the screen's hook returns.
  `tests/content/ingame_menu_catalog_test.ts` pins both pairs, and `make
  mod-catalog` goes in the same commit.
- **The answer must LAPSE.** Hold it in the hook's own `useState` with a
  timeout; a latched one is still sitting there on the next pause, describing a
  press from twenty minutes ago.

The pixel font has no tick — `▲` and `!` are in the glyph set, `✓` is not — so
a confirmation carries in the words and the colour, and a label is worth
asserting against `GLYPHS` (a missing cell draws `?`, not a gap).
