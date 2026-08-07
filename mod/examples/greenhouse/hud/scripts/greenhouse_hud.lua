-- SPDX-License-Identifier: CC0-1.0
-- THE VAULT'S TALLY — the judgements behind our one HUD element.
--
-- Every HUD script is called as `f(state)`, with the bindings grouped by their
-- prefix: `state.hud` is the run, `state.ui` is the app's view state, and
-- `state.drive` is the road's dials when the element is on that surface.
-- `mod/catalog.json` lists every binding there is, with its type.
--
-- The VM is the game's own: no io, no os, no clock, no randomness, and a step
-- budget. A judgement is a FORMULA — it is called when the HUD publishes, on a
-- real change, never per frame.

local M = {}

--- What the tally says.
function M.tally(state)
  return "CLEARED " .. state.hud.kills
end

--- Nothing to say before the first kill.
function M.worth_showing(state)
  return state.hud.kills > 0
end

--- Green while the vault is being worked through, gold once it is a haul.
function M.tally_color(state)
  if state.hud.kills >= 100 then
    return "#ffd75e"
  end
  return "#7ef0c8"
end

return M
