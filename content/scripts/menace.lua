-- SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
-- HOW HARD THE WORLD PUSHES BACK: how tough a monster is for its level, what
-- level the horde fields at all, and what an overpowered kill is worth.
--
-- These three are the shape of the difficulty curve. Change
-- `mob_hp_level_factor` and you have changed every mob in the game, the menace
-- meter's yardstick and every scaled ability along with it — they all read this
-- one function, so they move together.
--
-- Copy this file into your mod's `scripts/` folder to take it over. Its inputs
-- come from `game.config.menace`, `game.config.leveling` and `game.balance`.

local MENACE = game.config.menace

local M = {}

--- The hp multiplier a monster's own LEVEL buys it.
--
-- Compounding, so HITS-TO-KILL keeps rising as the hero's damage compounds —
-- a linear ramp would fall behind and let a levelled hero one-shot the horde.
-- Past `mobHpGrowthKnee` the rate eases to a fraction of itself, so the
-- uncapped endgame plateaus into a gentle climb instead of a wall of hundreds
-- of hits.
--
-- `mobHpBase` is the flat scale that rides every level alike — the mob-side
-- counterweight that lets weapons deal their catalog damage. It belongs here
-- rather than at any one spawn site, so the menace meter's reference healthbar
-- and ability scaling take it too and the meter stays stationary.
--
-- A mob BELOW level 1 (a relative-level deficit — a low-level hero on EASY)
-- scales DOWN through the negative exponent; the caller's `mobHpScaleFloor` is
-- the hard floor under that.
function M.mob_hp_level_factor(mob_level)
  local knee = MENACE.mobHpGrowthKnee
  local g = MENACE.mobHpGrowthPerLevel
  local base = MENACE.mobHpBase
  if mob_level <= knee then
    return base * g ^ (mob_level - 1)
  end
  local tail_g = 1 + (g - 1) * MENACE.mobHpGrowthTailFactor
  return base * g ^ (knee - 1) * tail_g ^ (mob_level - knee)
end

--- The MONSTER LEVEL the horde fields against a hero of `hero_level`.
--
-- The hero's level plus the difficulty's offset (EASY fields mobs under the
-- hero, JESUS above), HARD-CAPPED into the difficulty's own band when it
-- declares one — so a tier's mobs never scale past its ceiling (an
-- over-levelled farm meets stuck mobs) nor drop below its floor (a freshly
-- arrived hero meets mobs a touch above him).
--
-- `min`/`max` are the difficulty's band; the engine passes `nil` for an
-- uncapped rung. Elites and bosses add their own `levelBonus` on top, after
-- this, and may run past the ceiling.
--
-- This is also what the LOOT system reads to decide which bases may drop, which
-- rarity tiers are unlocked, and what level a dropped item carries — so raising
-- it raises the rain along with the difficulty.
function M.mob_level(hero_level, offset, min, max)
  local level = math.floor(hero_level + offset + 0.5)
  if min ~= nil then level = math.max(min, level) end
  if max ~= nil then level = math.min(max, level) end
  return math.max(1, level)
end

--- What a killing blow is worth, judged by OVERKILL.
--
-- A hit for exactly the victim's full health (or less) is worth full value; one
-- for twice its health pays HALF, three times a THIRD. Applied to the kill's XP
-- and to the minion drop-chance roll, so farming mobs a build one-shots several
-- times over is deliberately unrewarding — the answer to "too easy" is to move
-- up, not to keep mowing.
--
-- Return a flat 1 here and you have turned that off, which is a perfectly
-- reasonable thing for a mod to want.
function M.overkill_efficiency(damage, max_hp)
  if max_hp <= 0 or damage <= max_hp then return 1 end
  return max_hp / damage
end

return M
