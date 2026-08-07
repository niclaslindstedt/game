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

return M
