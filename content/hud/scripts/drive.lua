-- SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
-- THE ROAD'S DIALS — what the wagon's dashboard says, and when it says it.
--
-- The drive minigame's HUD is authored in `hud/elements/drive_*.yaml`, and
-- everything on it that is a JUDGEMENT rather than a plain read lives here: what
-- the speed plate reads at this speed and gear, what the damage plate reads and
-- what colour it is, whether the roadkill tally is worth the space at all.
--
-- Called as `f(state)`, exactly like every other HUD script. The road's own
-- half is `state.drive`:
--
--   mph          how fast, whole miles an hour
--   gear         the engine's own reading, counting from zero
--   gearLabel    …the same, counting from one, which is what a dial shows
--   speedFrac    0..1 of the wagon's top speed
--   bodies       how many people the trip has cost so far
--   wear         0..1 of the wagon's ruin
--   wearPercent  …the same as a whole number, for a readout
--   failing      past the point where the next real hit ends the trip
--   paused       the road is stopped behind the pause card
--
-- `state.hud` and `state.ui` are there too, and are empty on this surface — a
-- drive has no hero, no bag and no horde.
--
-- WHY THIS IS THE INTERESTING FILE FOR A MOD. The road is where a total
-- conversion's own voice shows most cheaply: a rally has a stage clock and a
-- pace note, a delivery run has an order slip and a tip counter, a hearse has a
-- body count it is not proud of. All three are this file plus a couple of
-- elements — no code, and no new sprite unless the mod wants one.

local M = {}

local CALM = "#e8e4d8"
local ALARM = "#e8635a"

--- THE LEFT PLATE: speed, and the gear it is being made in.
--
-- The gear is the engine's own reading, the same one the sound is built from, so
-- what the player hears climbing and dropping is what the dial says. A readout,
-- not a control — the wagon shifts itself.
function M.speed_label(state)
  return state.drive.mph .. " MPH  GEAR " .. state.drive.gearLabel
end

--- THE RIGHT PLATE: what the trip has cost the wagon.
function M.damage_label(state)
  return "DAMAGE " .. state.drive.wearPercent .. "%"
end

--- …and when that plate turns red.
--
-- Not at any old scratch: the wagon takes cosmetic knocks the whole way down and
-- a dial that alarms at the first one teaches the player to ignore it. `failing`
-- is the point where the trip is genuinely in doubt.
function M.damage_color(state)
  if state.drive.failing then
    return ALARM
  end
  return CALM
end

return M
