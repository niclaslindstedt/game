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

--- The SAVE warning's label. The row is only on screen at all when saving has
--- something to say (`menu.saveAlert`), and this is which of the two things:
--- storage is refusing the run, or a retry just landed.
---
--- A judgement rather than two rows, because they are one row in two moods —
--- the alarm and its all-clear. Split, a mod could replace one and not the
--- other, and the player would meet two different buttons in the same place.
---
--- The alarm says what to DO as well as what is wrong: a red line reading only
--- SAVE FAILED is a thing to feel bad about rather than a thing to press. The
--- pixel font has no tick, so the all-clear is carried by the words and by the
--- colour below rather than by a glyph it would draw as a question mark.
function M.save_label(state)
  if state.menu.saveState == "saved" then
    return "▲ GAME SAVED"
  end
  return "! SAVE FAILED - RETRY"
end

--- …and its colour. The alarm is the one that has to carry at a glance: a
--- player whose run has stopped reaching storage has until they close the app
--- to notice.
function M.save_color(state)
  if state.menu.saveState == "saved" then
    return "#7ef0c8"
  end
  return "#e06a6a"
end

return M
