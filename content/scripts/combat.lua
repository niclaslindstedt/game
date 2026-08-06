-- SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
-- WHAT A BLOW IS WORTH: the hero's side (per-hit weapon damage) and the
-- monster's side (how much of a physical blow its armor eats).
--
-- These two together are the whole damage economy. Raising `weapon_damage` and
-- leaving `mob_armor_reduction` alone makes the game a power fantasy; raising
-- both keeps hits-to-kill where it was and only changes how the numbers read.
--
-- Copy this file into your mod's `scripts/` folder to take it over. Reads
-- `game.config.stats`, `game.config.mob_armor`, `game.config.leveling` and
-- `game.balance`.

local STATS = game.config.stats
local MOB_ARMOR = game.config.mob_armor
local LEVELING = game.config.leveling

local M = {}

--- A weapon instance's per-hit damage for its wielder, before the crit roll and
--- before the per-blow variance band.
--
-- THE CATALOG NUMBER IS THE TRUE NUMBER. A weapon's authored damage is what it
-- deals: there is no global damper and no balance knob between the def and the
-- blow. Exactly four things move it, and a player can read all of them off the
-- item card:
--
--   ctx.base         the weapon def's authored damage
--   ctx.stat         the wielder's effective governing stat (STR for melee,
--                    DEX for ranged, INT for magic) — already resolved through
--                    gear and the diminishing-returns curve
--   ctx.damage_pct   the sum of the instance's own `damagePct` affixes
--   ctx.enhanced     1 + the instance's ENHANCED DAMAGE roll (a magic-or-better
--                    weapon's +X% band, drawn at mint and frozen for life)
--   ctx.quality      the MAKE quality multiplier this copy rolled — a CRUDE
--                    pipe swings soft, a PERFECT one over its catalog weight
--   ctx.surge        a running REACTOR SURGE powerup, else 1
--
-- `ctx.damage_stat` names which stat it is, because STRENGTH scales physical
-- weapons harder than INTELLIGENCE scales magic ones — a bruiser's damage is
-- their one payoff, while a mage's INT is already buying reach, cleave, cadence
-- and crit.
--
-- If the game should push back harder, the honest place is the MOB side below,
-- not a damper here.
function M.weapon_damage(ctx)
  local per_point = STATS.damageBonusPerPoint[ctx.damage_stat] or 0
  local multiplier = 1 + ctx.stat * per_point + ctx.damage_pct
  return ctx.base * multiplier * ctx.enhanced * ctx.quality * ctx.surge
end

--- The fraction of a PHYSICAL blow a monster of `mob_level` shrugs off.
--
-- A linear ramp from ~0 at level 1 to `maxLevelReduction` at the level cap, so
-- armor keeps pace with hp and damage instead of fading out, PLUS the
-- difficulty's own flat bonus — which is how JESUS ends up markedly spongier at
-- the cap than EASY does. Capped below full immunity.
--
-- Keyed to the MOB's level, so a difficulty's mob-level ceiling also caps its
-- armor. The attacker's ARMOR PIERCING is subtracted by the engine afterwards,
-- and MAGIC weapons bypass this entirely — which is the whole reason the
-- physical lanes have piercing at all.
function M.mob_armor_reduction(mob_level, difficulty_bonus)
  local span = LEVELING.maxLevel - 1
  local t = (math.max(1, mob_level) - 1) / span
  if t < 0 then t = 0 elseif t > 1 then t = 1 end
  local ramp = MOB_ARMOR.maxLevelReduction * t
  local reduction = (ramp + difficulty_bonus) * game.balance.mobArmor
  return math.max(0, math.min(MOB_ARMOR.maxReduction, reduction))
end

return M
