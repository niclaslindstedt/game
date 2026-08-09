-- SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
-- THE ROAD'S DIALS — what the wagon's dashboard says, and when it says it.
--
-- The drive minigame's HUD is authored in `hud/elements/drive_*.yaml` — a
-- SPEEDOMETER with the tachometer drawn inside it, the GEARBOX, and the
-- DAMAGEOMETER — and everything on them that is a JUDGEMENT rather than a plain
-- read lives here: where the rev counter goes red, what the gate says when the
-- car is not going anywhere, what colour a wagon this far gone is drawn in.
--
-- Called as `f(state)`, exactly like every other HUD script. The road's own
-- half is `state.drive`:
--
--   mph          how fast, whole miles an hour
--   topSpeedMph  …and the wagon's own top end, for a dial that prints its last
--                number
--   speedFrac    0..1 of that top speed — the speedometer's arc
--   gear         the engine's own reading, counting from zero
--   gearLabel    …the same, counting from one, which is what a dial shows
--   gearCount    how many gears there are — the gate the gearbox draws
--   rev          0..1 of the way up THIS gear: 0 at the shift in, 1 at the
--                shift out
--   rpm          what the crank is actually turning at
--   shiftUpRpm   …where the box lets go of it and changes up
--   redlineRpm   …and where it would stop being asked to — a limit the box
--                never takes it near, and the tacho's last number
--   rpmFrac      rpm over the redline — the tachometer's arc
--   shiftFrac    rpm over the SHIFT POINT — 1 is the upshift, and the only
--                thing on this dial worth a warning
--   reversing    the wagon is going backwards
--   bodies       how many people the trip has cost so far
--   clock        the stopwatch, already formatted (`m:ss.t`)
--   clockMs      …and the same as a raw number, for a judgement about it
--   clockRunning the clock is still counting: the car is in the town
--   clockStarted the town has been reached at all — whether there is a clock
--   wear         0..1 of the wagon's ruin
--   wearPercent  …the same as a whole number, for a readout
--   failing      past the point where the next real hit ends the trip
--   paused       the road is stopped behind the pause card
--
-- `state.hud` and `state.ui` are there too, and are empty on this surface — a
-- drive has no hero, no bag and no horde.
--
-- THE GEARBOX SHIFTS ITSELF and nothing here can stop it: the box changes up at
-- exactly the revs that would pass its SHIFT POINT, which on this wagon is a
-- good thousand short of the redline. So the needle spends the whole trip in
-- the bottom two thirds of the dial and the red paint at the end of the face is
-- never reached — which is what a tachometer in a working car does, and what
-- this file used to get wrong by treating the two numbers as one.
--
-- What this file decides is what the ARC is coloured as it climbs, which is why
-- a mod can make the wagon feel highly strung or long-legged without touching a
-- line of code.
--
-- WHY THIS IS THE INTERESTING FILE FOR A MOD. The road is where a total
-- conversion's own voice shows most cheaply: a rally has a stage clock and a
-- pace note, a delivery run has an order slip and a tip counter, a hearse has a
-- body count it is not proud of. All three are this file plus a couple of
-- elements — no code, and no new sprite unless the mod wants one.

local M = {}

local CALM = "#e8e4d8"
local COOL = "#7ef0c8"
local WARN = "#ffb14a"
local ALARM = "#e8635a"
local FRESH = "#ff9d4a"
local GOLD = "#ffd75e"

--- WHERE THE TACHOMETER WARMS UP — the last stretch before the box changes up,
-- as a fraction of the SHIFT POINT rather than of the redline.
--
-- Not at the shift itself: a warning that arrives at the same instant as the
-- upshift is a warning nobody has time to read. Six sevenths gives the needle a
-- moment of amber first, which is what makes the upshift read as something the
-- car did on purpose.
--
-- IT CANNOT BE MEASURED OFF THE REDLINE, which is what it used to be. The box
-- lets go at nine tenths of the face, so a ladder hung off `rpmFrac` would only
-- ever fire in the last moments before a shift and the dial would say nothing
-- for the whole of every gear.
local SHIFT_WARN_FRAC = 0.86

--- …and where the crank is genuinely past what the engine has. The paint on the
-- face opens here too (`hud/elements/drive_speedo.yaml`), so the colour and the
-- printed band are the same line rather than two numbers somebody has to keep
-- in step. On an undamaged wagon the needle never arrives: there is no gear
-- above fifth, and fifth runs out of road speed against the air about five
-- hundred revs short of it.
local REDLINE_FRAC = 0.94

--- …and where the DAMAGE dial stops being a scratch. The wagon takes cosmetic
-- knocks the whole way down and a dial that alarms at the first one teaches the
-- player to ignore it, so the amber is halfway and the red is the engine's own
-- `failing` — the point where the trip is genuinely in doubt.
local BENT_FRAC = 0.5

--- THE SPEEDOMETER'S ARC AND ITS NUMBER. Calm almost all the way, warm at the
-- very top: the last tenth of this wagon's range is a place it does not enjoy
-- being, and the dial saying so is cheaper than a hint.
function M.speed_color(state)
  if state.drive.speedFrac >= 0.9 then
    return WARN
  end
  return CALM
end

--- THE TACHOMETER — the arc inside the speedometer, and the figure under it.
--
-- TWO DIFFERENT READINGS OF THE SAME CRANK, and mixing them up is the whole
-- trap. The red is the ENGINE's limit (`rpmFrac`, against the redline) and
-- ordinarily nothing takes the needle there; the amber is the GEARBOX's
-- (`shiftFrac`, against the shift point) and arrives a moment before every
-- upshift, which is the one thing a driver could act on if the wagon had a
-- lever.
function M.rpm_color(state)
  if state.drive.rpmFrac >= REDLINE_FRAC then
    return ALARM
  elseif state.drive.shiftFrac >= SHIFT_WARN_FRAC then
    return WARN
  end
  return COOL
end

--- …and what that figure reads. Whole hundreds, because the crank is quantised
-- to fifty and a dashboard that flickers its last digit is a dashboard nobody
-- can read at speed.
function M.rpm_label(state)
  local hundreds = math.floor(state.drive.rpm / 100 + 0.5) * 100
  return string.format("%d RPM", hundreds)
end

--- THE GEARBOX — which of the seven shift-gate pictures is on screen.
--
-- A PICTURE RATHER THAN A NUMBER, because a lever in a gate is a POSITION and a
-- position registers out of the corner of an eye, which is the only kind of
-- attention a gear readout is ever going to get at 100 mph with a crowd coming.
--
-- It is a JUDGEMENT and not a binding for the two answers that are not gears:
-- the wagon rolling backwards, and the wagon standing still with the engine
-- running. Neither is a rung of the box — the engine's own reading is the gear
-- the ratios would be in — so deciding when to show R and when to show N is
-- exactly the sort of call that belongs out here where a mod can change it.
--
-- A mod with a six-speed, a transfer box or a tiller draws its own gate sprites
-- and answers with their names; nothing in the app knows these seven.
function M.gear_sprite(state)
  if state.drive.reversing then
    return "gear_gate_r"
  elseif state.drive.mph == 0 then
    return "gear_gate_n"
  end
  return "gear_gate_" .. state.drive.gearLabel
end

--- THE STOPWATCH'S WORD, over the figure.
--
-- It is what CHANGES when the leg ends. Everything else on this screen goes on
-- saying the same thing all the way down the road; the clock stops, and the one
-- word above it is how a player mid-crowd finds out that the part they were
-- being scored on is behind them and the rest is the road showing off.
function M.clock_label(state)
  if state.drive.clockRunning then
    return "TIME"
  end
  return "FINISH"
end

--- …and the colour of the figure — the one genuine JUDGEMENT on this readout.
--
-- A clock is a format rather than an opinion, so the digits themselves are the
-- app's (`drive.clock`). What is an opinion is whether this is a GOOD time, and
-- the shipped answer is deliberately the smallest one that means anything: it
-- runs calm while it runs, and lands gold the moment it stops, because a leg
-- that reached the finish line at all is the thing worth congratulating on a
-- road laid down to stop you.
--
-- A conversion with a par to beat has everything it needs here: `clockMs` is the
-- raw figure, and a rally stage that turns amber approaching its own target time
-- is four lines in this function and not one line of code anywhere.
function M.clock_color(state)
  if not state.drive.clockRunning then
    return GOLD
  end
  return CALM
end

--- THE DAMAGEOMETER'S WORD. It says what it is measuring right up until that
-- stops being the useful thing to say.
function M.damage_label(state)
  if state.drive.failing then
    return "FAILING"
  end
  return "DAMAGE"
end

--- THE HIT YOU JUST TOOK — the colour of the slice the last second put on.
--
-- Bright, and deliberately not a rung of the ladder below: it is not saying how
-- bad the wagon is, it is saying THIS JUST HAPPENED, and it says it for a second
-- (`WEAR_HOT_MS`, drive-screen/dials.ts) before the calm arc glides up and takes
-- it back. A conversion that wants the road to feel less punishing can quiet it
-- down to the settled colour and the highlight simply stops existing.
function M.fresh_color(state)
  if state.drive.wear <= state.drive.wearSettled then
    return M.damage_color(state)
  end
  return FRESH
end

--- …and the colour of the arc, the figure and that word — one ladder, so the
-- whole dial changes together rather than arguing with itself.
function M.damage_color(state)
  if state.drive.failing then
    return ALARM
  elseif state.drive.wear >= BENT_FRAC then
    return WARN
  end
  return CALM
end

return M
