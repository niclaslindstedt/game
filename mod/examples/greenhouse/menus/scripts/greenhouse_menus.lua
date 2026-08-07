-- SPDX-License-Identifier: CC0-1.0
-- WHEN OUR WINDOW GOES UP, AND WHAT IT SAYS.
--
-- A menu script is called exactly as a HUD script is — `f(state)`, with the
-- bindings grouped by prefix: `state.hud` is the run, `state.ui` is the app's
-- view state, `state.menu` is what the windows are doing. `mod/catalog.json`
-- lists every binding there is, with its type.
--
-- The VM is the game's own: no io, no os, no clock, no randomness, and a step
-- budget. A judgement is a FORMULA — called when the values publish, on a real
-- change, never per frame. Which is exactly why a `when:` is a fine place to
-- ask "has the fight turned" and a terrible place to ask "where is everybody".

local M = {}

--- The vault has woken up: a crowd still standing, and the hero into it deep
--- enough to be hurt. Answered on the EDGE — the modal goes up the publish
--- this turns true, and `once: true` in the window means it is said one time
--- per run.
function M.vault_is_hot(state)
  return state.hud.enemiesLeft >= 12 and state.hud.hpFrac < 0.5
end

--- The warning's own line. A sentence built out of a read is a judgement, so
--- it lives here rather than being woven into the YAML.
function M.warning_line(state)
  return state.hud.enemiesLeft .. " STILL GROWING - GET TO THE DOOR"
end

--- The pause row's label, which counts too.
---
--- THE GLYPH IS CHECKED FOR A LINE YOU WROTE AND NOT FOR ONE YOU RETURN: the
--- compiler reads the YAML, not the Lua, so a character the pixel font cannot
--- draw comes out of here as a question mark with every check green. The font's
--- whole set is `glyphs` in `mod/catalog.json` — this uses `!`, which is in it,
--- because `*` is not.
function M.report_label(state)
  if state.hud.enemiesLeft > 0 then
    return "! VAULT REPORT (" .. state.hud.enemiesLeft .. ")"
  end
  return "! VAULT REPORT"
end

return M
