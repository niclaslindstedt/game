-- SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
-- THE HUD'S JUDGEMENTS — the handful of questions about the live run that are
-- not a plain read of it.
--
-- The split is deliberate and it is the same one the engine's own scripts obey
-- (docs/scripting.md): YAML says WHERE a thing is and WHAT it draws; a value it
-- draws is a BINDING; and anything that has to decide — what colour "nearly
-- out" is, whether a row is worth the space — is a function here.
--
-- Every function is called as `f(state)`, where `state` holds exactly the
-- bindings `scripts/asset-tools/hud-schema.mjs` lists, grouped by their prefix:
-- `state.hud.bagFree`, `state.ui.keyHints`, `state.drive.wear`. It is called
-- when the HUD SNAPSHOT PUBLISHES — on a real change, never per frame — so it
-- is a formula and not a draw call, exactly like a loot roll.
--
-- Copy this file into your mod's `hud/scripts/` folder to take it over, or add
-- one of your own beside it and point your elements at it.

local M = {}

-- The two ends of the readability ladder every count on the HUD uses: white
-- while there is any left, red at nothing. It is one sentence — "you have
-- none" — and it is worth saying in the same colour everywhere it is true.
local PLENTY = "#f4f4f4"
local EMPTY = "#d83a3a"

--- The free-cell count on the bag pouch: red when the bag is full.
function M.bag_color(state)
  if state.hud.bagFree == 0 then
    return EMPTY
  end
  return PLENTY
end

--- The rounds printed on the weapon slot: red when the pouch is dry.
function M.ammo_color(state)
  if state.hud.ammoCount == 0 then
    return EMPTY
  end
  return PLENTY
end

--- THE WEAPON GAUGE'S COLOUR — the ring around the held weapon, which is the
-- one question the ring exists for: how many more attacks does this thing have
-- in it. Ammunition for a ranged weapon, durability for anything else; both
-- arrive here as one fraction.
--
-- Teal is the ANSWER "never runs out" rather than a stage of the ladder — a
-- weapon with no gauge at all (an unbreakable unique, bare hands) reads full
-- and calm, and is never mistaken for one at 100% that is about to start
-- falling.
function M.gauge_color(state)
  if not state.hud.hasWeaponGauge then
    return "#7ef0c8"
  end
  local frac = state.hud.weaponGauge
  if frac < 0.25 then
    return EMPTY
  elseif frac < 0.5 then
    return "#ffb14a"
  end
  return "#c2ccd6"
end

--- Is the AMMUNITION COUNT worth printing on the slot? Only for a weapon that
-- eats any — a melee weapon's slot says what it has to say with the ring.
function M.show_ammo(state)
  return state.hud.hasAmmo
end

return M
