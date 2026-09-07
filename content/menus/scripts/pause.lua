-- SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
--
-- THE PAUSE MENU'S JUDGEMENTS.
--
-- The same seam the HUD's scripts are and the same rule: a READ is a binding
-- (`menu.cleanSlates` is a number the app publishes), and a DECISION is here.
-- Whether a row says THE BIBLE or THE BIBLE (2) is a decision — it depends on
-- the number — and a line that had to be assembled in TypeScript would be a
-- line no mod could rewrite.
--
-- A script is a FORMULA, never a frame: this is called when the menu resolves,
-- which happens when the HUD snapshot publishes, not sixty times a second.

local M = {}

--- The clean-slate row's label — the count only when there is more than one of
--- them, because "(1)" is noise on a row that already says what it is.
---
--- The cross is a `+`: the pixel font has no dagger, and a glyph it cannot draw
--- comes out as a question mark.
function M.bible_label(state)
  local charges = state.menu.cleanSlates or 0
  if charges > 1 then
    return "+ THE BIBLE (" .. charges .. ")"
  end
  return "+ THE BIBLE"
end

--- The SAVE GAME row's label — what the last press did, for as long as the app
--- keeps saying so (`menu.saveState`, cleared a few seconds after a press).
---
--- A judgement rather than three rows, because all three are the same row in
--- three moods: it offers, it confirms, or it admits. Splitting them would let
--- a mod replace one mood and not the others.
---
--- The pixel font has no tick, so the confirmation is carried by the words and
--- by the colour below rather than by a glyph it would draw as a question mark.
function M.save_label(state)
  local saved = state.menu.saveState
  if saved == "saved" then
    return "▲ GAME SAVED"
  elseif saved == "failed" then
    return "! COULD NOT SAVE"
  end
  return "▲ SAVE GAME"
end

--- …and its colour, on the same three moods. The failure is the one that has to
--- carry at a glance: a player who is about to close the app on a save that did
--- not happen has seconds to notice.
function M.save_color(state)
  local saved = state.menu.saveState
  if saved == "saved" then
    return "#7ef0c8"
  elseif saved == "failed" then
    return "#e06a6a"
  end
  return "#9aa3ad"
end

return M
