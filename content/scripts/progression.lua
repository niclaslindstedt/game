-- SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
-- HOW A CHARACTER GROWS. Four rules: what a level costs, what a kill pays,
-- what an outgrown map still pays, and how far a pile of stat points actually
-- gets you.
--
-- This file IS the game's leveling rule — there is no TypeScript copy of it
-- underneath. Copy it into your mod's `scripts/` folder, change a number, and
-- your run levels differently. Everything you can read is listed in
-- `docs/scripting.md`; the two you will want here are:
--
--   game.config.leveling   the tuning table (engine/game/config/leveling.ts)
--   game.balance           the DEVELOPER -> BALANCE knobs, live
--
-- The engine passes the values that change per call and reads the rest from
-- the config, so a mod that only wants different NUMBERS can often edit
-- `content/leveling.yaml` instead and leave this file alone.

local L = game.config.leveling
local XP_CAP = game.config.xp_cap
local STATS = game.config.stats

local M = {}

--- The XP that crossing OUT of `level` costs.
--
-- The curve itself is DATA: `content/leveling.yaml` authors a raw figure for
-- every level, and the engine hands it in as `curve_xp`. Two things apply on
-- top, because neither is a per-level fact of the shared curve:
--   * the ENDGAME WALL past `endgameSteepenFrom`, compounding per level,
--   * the per-TIER cost step, so a level on JESUS costs more than one on EASY.
--
-- `tier` is the difficulty's rung above the three bottom lanes (easy/medium/
-- hard share tier 0, nightmare 1, jesus 2), already floored at 0 by the engine.
function M.xp_to_level_up(level, curve_xp, tier)
  local l = math.max(1, level)

  local steepen = 1
  local over = l - L.endgameSteepenFrom
  if over > 0 then
    local rate = math.max(0, L.endgameSteepenRate * game.balance.endgameSteepen)
    steepen = (1 + rate) ^ over
  end

  local tier_cost = 1
  if tier > 0 then
    local step = math.max(0, L.tierLevelCostStep * game.balance.levelingSlowdown)
    tier_cost = (1 + step) ^ tier
  end

  -- `%.0f`-style rounding, matching the engine's Math.round: .5 goes up.
  return math.floor(curve_xp * steepen * tier_cost + 0.5)
end

--- The level-difference multiplier on a kill's XP (WoW's rule).
--
-- A mob ABOVE the hero pays a bonus per level, capped; a mob BELOW pays a
-- penalty per level, down to ZERO for the "grey" mob a full
-- `1 / xpBelowPlayerPerLevel` levels under. A mob AT the hero's level is
-- neutral, which is what keeps the reference minion (the unit the whole
-- kills-per-level curve is authored against) untouched.
local function level_diff_mult(mob_level, hero_level)
  local diff = math.max(1, mob_level) - math.max(1, hero_level)
  local rest = math.max(0, game.balance.restXp)
  if diff >= 0 then
    return math.min(L.xpAboveMaxMult, 1 + diff * L.xpAbovePlayerPerLevel * rest)
  end
  return math.max(0, 1 + diff * L.xpBelowPlayerPerLevel * rest)
end

--- What ONE kill of a monster of `mob_level` pays a hero of `hero_level`.
--
-- A function of the mob's LEVEL ONLY, never its hp: a bullet-sponge tank and a
-- squishy of the same level pay the same, and an evolved (extra-hp) minion pays
-- no more than a plain one. A reference minion's hp, compounding per level and
-- priced at `xpPerHp`, sets the scale.
--
-- The compounding base is CLAMPED a few levels above the hero, so a far-above
-- mob pays a bounded premium instead of a compounding windfall — that clamp is
-- what stops cross-level kills from power-levelling a character.
function M.mob_xp(mob_level, hero_level)
  local base_level = math.min(
    math.max(1, mob_level),
    math.max(1, hero_level) + L.xpAboveClampLevels
  )
  return L.refMobHp
    * (1 + L.mobXpGrowthPerLevel) ^ (base_level - 1)
    * L.xpPerHp
    * level_diff_mult(mob_level, hero_level)
end

--- How much of an XP grant a hero of `level` still collects against a map's
--- SOFT `cap`.
--
-- Full value until `fadeLevels` under the cap, then a reverse-exponential
-- taper, bottoming out at a never-zero trickle. The cap is a SLOPE, not a wall:
-- an outgrown map still rains loot and still creeps forward, it just stops
-- levelling anybody at pace.
function M.xp_cap_multiplier(level, cap)
  local over = level - (cap - XP_CAP.fadeLevels)
  if over <= 0 then return 1 end
  return math.max(XP_CAP.floor, XP_CAP.softCapDecay ^ over)
end

--- DIMINISHING RETURNS on stat points — the one curve every effective-stat
--- read runs through.
--
-- LINEAR up to `cap` (so a full spec realizes its raw value and one stat can
-- dominate), then each raw point past it pays less. That over-cap region is
-- where GEAR lands, which is why an endgame loadout is felt but never gets the
-- undiminished value chosen points do.
--
-- `cap` is the level-scaled ceiling the engine computes from the chosen-point
-- budget; it rises with level toward `statHardCap`.
function M.stat_diminish(points, cap)
  if points <= cap then return points end
  local over = points - cap
  return cap + over / (1 + STATS.statTaper * over)
end

return M
