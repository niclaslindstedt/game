-- SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
-- THE RAIN: whether a monster drops anything, and how rare it is when it does.
--
-- The engine still owns the SEQUENCE — it walks the rarity tiers best-first and
-- spends the run's own seeded draws in a fixed order, because a run played from
-- a seed has to be reproducible and a mod must not be able to make it otherwise.
-- What this file owns is what each of those draws is measured AGAINST.
--
-- That split matters if you are editing this: adding or removing a `math`
-- operation here changes nothing about determinism, but the engine will call
-- `tier_chance` exactly once per tier per drop whatever you write, so there is
-- no way to "roll again" from in here. To change the number of draws, change
-- the item catalog (`content/item_rarity.yaml`) instead.
--
-- Reads `game.config.loot` (engine/game/config/loot.ts, whose numbers come from
-- `content/item_rarity.yaml`), `game.config.stats` and `game.balance`.

local LOOT = game.config.loot
local STATS = game.config.stats

local M = {}

--- Which tiers are the hand-authored CHASE. Their odds come from their own
--- base and slope alone — the generic per-kill sweeteners lift the ROLLED tiers
--- (magic/rare) and must never rain named items.
local NAMED = { unique = true, legendary = true, artifact = true }

--- How MAGIC FIND multiplies a tier's odds.
--
-- Linear on `magic` (the cheap tier — more MF is straightforwardly more magic
-- items), and SATURATING on the rarer ones: `cap * mf / (cap + mf)` approaches
-- `cap` however much MF is stacked, which is what stops a magic-find build from
-- turning legendaries into the common case.
function M.magic_find_factor(tier, mf)
  if mf <= 0 then return 1 end
  local cap = LOOT.mfSaturation[tier]
  if cap == nil then return 1 + mf end
  return 1 + (cap * mf) / (cap + mf)
end

--- The chance a rank-and-file monster drops ANYTHING.
--
-- `difficulty_bonus` is the rung's own `dropChanceBonus`; `luck` is the
-- killer's effective LUCK, already resolved through gear and the diminishing
-- curve. The developer drop-rate knob scales the whole thing — base, difficulty
-- and luck alike — so the rain thickens uniformly.
function M.drop_chance(difficulty_bonus, luck)
  return (LOOT.dropChance + difficulty_bonus + luck * STATS.dropChancePerLuck)
    * game.balance.dropRate
end

--- The D2-style RARITY ROLL: what `tier`'s chance is for this particular kill.
--
-- Returns 0 to mean "do not offer this tier at all", which the engine reads as
-- skipping the draw entirely — no rng is spent, so seeded runs do not shift.
--
-- `ctx` carries everything that changes per kill:
--   depth             how far the kill's loot level sits over the tier's own
--                     unlock level (D2's `ilvl - qlvl` term)
--   difficulty_bonus  the rung's `tierChanceBonus` for this tier
--   role_bonus        the elite/boss set-piece bonus on the rarest tiers
--   tier_bonus        the generic per-kill sweetener (mob level, all-clear
--                     trophy, a mob's own dropProfile)
--   named_mult        the farm-venue multiplier on the chase tiers
--   plain_minion      true for rank-and-file with no rarity of its own
--   mf                the killer's magic find
--   over_cap_mult     the past-the-level-cap rampage multiplier on chase tiers
--
-- The shape to keep in mind while editing: a tier's chance is its base plus a
-- slope per level of DEPTH, so a deeper kill rolls rarer tiers more often. A
-- PLAIN minion suffers the named-tier penalty, so trash can still surprise but
-- the special fights own the chase gear.
function M.tier_chance(tier, ctx)
  local named = NAMED[tier] == true

  local base = LOOT.rarityBase[tier]
    + LOOT.raritySlope[tier] * ctx.depth
    + ctx.difficulty_bonus
    + ctx.role_bonus

  if named then
    base = base * ctx.named_mult
    if ctx.plain_minion then base = base * LOOT.minionNamedMult end
  else
    base = base + ctx.tier_bonus
  end

  if base <= 0 then return 0 end

  local chance = base
    * M.magic_find_factor(tier, ctx.mf)
    * game.balance.gearQuality
  if named then chance = chance * ctx.over_cap_mult end

  return math.min(LOOT.rarityChanceMax, chance)
end

return M
