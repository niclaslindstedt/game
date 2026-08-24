-- SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
-- MISSION CONTROL'S JUDGEMENTS — what the flight's launch-feed HUD says, and
-- when it changes its tone.
--
-- The flight minigame's HUD is authored in `hud/elements/rocket_*.yaml` — the
-- velocity and altitude dials, the hull dial, the attitude indicator, the T+
-- clock and the mission timeline — and everything on them that is a JUDGEMENT
-- rather than a plain read lives here: where the lean stops being flying and
-- starts being falling, when the hull dial starts talking about the trip
-- instead of the paintwork, which stations of the timeline are lit.
--
-- Called as `f(state)`, like every HUD script. The flight's own half is
-- `state.rocket`:
--
--   mph           how fast, pegged at the dial's 25 020 (escape velocity)
--   speedFrac     0..1 of the dial — the velocity arc
--   altitude      miles of climb on the ascent, px of drop left on the landing
--   altFrac       0..1 of the same, whichever half is flying
--   hullFrac      what is left of the skin, 1 → 0
--   hullPercent   …as a whole number
--   failing       one real hit from the end
--   leanPortFrac  the lean, split into its two shoulders — each 0..1 of the
--   leanStarFrac  FLIP, so full is the explosion
--   leanFrac      the worse shoulder, for the ladder here
--   warn          past the engine's own warning line right now
--   clock         the mission clock, formatted (`T+m:ss`)
--   clockMs       …raw, for a judgement about it
--   clockStarted  the hand-over has happened: there is a clock at all
--   dashLive      the console is up
--   phase         ASCENT or THE DROP, as a caption prints it
--   landing       …the same, as a flag a rule can read
--   trash         bags riding the hull right now
--   boost         the boosters are open
--   progress      the mission timeline's staged marker, 0..1
--   shellClear    out of the junk — the sky above is clean
--   paused        the sky is stopped behind the pause card
--
-- WHY THIS IS THE INTERESTING FILE FOR A MOD, same as the road's: a total
-- conversion's flight can be a crop duster with a fuel gauge and a field, or a
-- submarine with a depth dial and a hull that groans — all of it this file
-- plus the elements, no code.

local M = {}

local CALM = "#e8e4d8"
local COOL = "#7ef0c8"
local CYAN = "#8ccdd7"
local WARN = "#ffb14a"
local ALARM = "#e8635a"
local DIM = "#4c5568"
local GOLD = "#ffd75e"

--- Where the LEAN stops being a correction and starts being an emergency, as
-- fractions of the flip. The engine's own warning line sits at ~0.64 of the
-- flip (`FLIGHT.ascent.warnRad / flipRad`); the amber below arrives EARLIER,
-- because the indicator is the one instrument the player flies off and a
-- warning that fires with the engine's alarm is a warning nobody had time to
-- act on.
local LEAN_WARN_FRAC = 0.4
local LEAN_ALARM_FRAC = 0.64

--- …and where the HULL dial changes tone: above the first bite it is
-- paintwork, past half it is a problem, and `failing` (one real hit from the
-- end) is the engine's own word for the rest.
local HULL_WARN_FRAC = 0.66

function M.speed_color(state)
  if state.rocket.speedFrac >= 0.98 then
    return GOLD
  end
  return CALM
end

--- The throttle lamp: lit while the boosters are open, dark while they idle.
function M.burn_label(state)
  if state.rocket.boost then
    return "BURN"
  end
  return "IDLE"
end

function M.burn_color(state)
  if state.rocket.boost then
    return WARN
  end
  return DIM
end

function M.alt_color(state)
  -- The drop's last stretch is the dial's whole job: it warms as the ground
  -- arrives, which is the one moment this face is glanced at.
  if state.rocket.landing and state.rocket.altFrac <= 0.2 then
    return WARN
  end
  if state.rocket.shellClear then
    return COOL
  end
  return CALM
end

function M.alt_unit(state)
  if state.rocket.landing then
    return "FT"
  end
  return "MI"
end

function M.hull_color(state)
  if state.rocket.failing then
    return ALARM
  elseif state.rocket.hullFrac < HULL_WARN_FRAC then
    return WARN
  end
  return COOL
end

function M.hull_label(state)
  if state.rocket.failing then
    return "ONE MORE HIT"
  elseif state.rocket.hullFrac < HULL_WARN_FRAC then
    return "HOLED"
  end
  return "INTACT"
end

function M.lean_color(state)
  if state.rocket.leanFrac >= LEAN_ALARM_FRAC then
    return ALARM
  elseif state.rocket.leanFrac >= LEAN_WARN_FRAC then
    return WARN
  end
  return CALM
end

function M.lean_label(state)
  if state.rocket.leanFrac >= LEAN_ALARM_FRAC then
    return "SHE'S GOING OVER"
  end
  return "BALANCE"
end

function M.clock_label(state)
  if state.rocket.paused then
    return "HOLD"
  end
  return "MISSION"
end

function M.clock_color(state)
  if state.rocket.paused then
    return DIM
  end
  return CALM
end

function M.trash_label(state)
  return "TRASH " .. state.rocket.trash
end

--- The timeline's stations, each lit as the marker reaches its fifth. The
-- thresholds are the STAGING's (`rocket.progress` maps each leg onto its own
-- fifth — dials.ts), so these numbers are positions on the strip, not
-- altitudes.
local function station(state, at)
  if state.rocket.progress >= at then
    return GOLD
  end
  return DIM
end

function M.evt_liftoff_color(state)
  return station(state, 0)
end

function M.evt_shell_color(state)
  return station(state, 0.2)
end

function M.evt_clear_color(state)
  -- ALL CLEAR is the trip's one moment of relief and gets the one colour the
  -- strip otherwise never uses.
  if state.rocket.shellClear then
    return COOL
  end
  return DIM
end

function M.evt_orbit_color(state)
  return station(state, 0.6)
end

function M.evt_drop_color(state)
  return station(state, 0.8)
end

function M.evt_down_color(state)
  return station(state, 1)
end

return M
