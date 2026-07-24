// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The talent EFFECT reads — the pure, state-in→number-out half of the passive
// talent system. Each combat read site (`combat-stats.ts`, `derived.ts`,
// `weapon-math.ts`) folds in one of these, summing `rank × slope` over the
// relevant talents. Kept in its own LEAF module (it imports only the catalog +
// types) so the read sites can pull an effect without dragging in the talent
// ECONOMY (`talents.ts`, which in turn needs `items/derived.ts` — importing the
// economy here would close a cycle).

import {
  talentDefs,
  talentsForTree,
  type TalentClass,
  type TalentEffect,
} from "./defs/talents/index.ts";
import type { GameState, WeaponClass } from "./types/index.ts";

/** The rank the hero owns in a talent (0 when untrained). */
export function talentRank(state: GameState, id: string): number {
  return state.player.talents[id] ?? 0;
}

/** Total ranks the hero has spent across `tree`'s talents. */
export function spentTalentRanks(state: GameState, tree: TalentClass): number {
  let sum = 0;
  for (const def of talentsForTree(tree)) sum += talentRank(state, def.id);
  return sum;
}

/** Sum `rank × def.effect[field]` over the active talents, optionally limited
 * to one tree. Cheap: the catalog is a handful of defs. */
function sumEffect(
  state: GameState,
  field: keyof TalentEffect,
  tree?: TalentClass,
): number {
  let total = 0;
  for (const def of Object.values(talentDefs())) {
    if (tree && def.tree !== tree) continue;
    const per = def.effect[field];
    if (per) total += talentRank(state, def.id) * per;
  }
  return total;
}

/** +crit chance from the tree that matches the weapon class (Executioner for
 * melee, Deadeye for ranged; magic has none). */
export function talentCritChanceBonus(
  state: GameState,
  weaponClass: WeaponClass,
): number {
  return sumEffect(state, "critChancePerRank", weaponClass);
}

/** +crit-damage multiplier from the weapon class's tree. */
export function talentCritDamageBonus(
  state: GameState,
  weaponClass: WeaponClass,
): number {
  return sumEffect(state, "critDamagePerRank", weaponClass);
}

/** Move-speed MULTIPLIER from Wind Runner (1 when untrained). */
export function talentSpeedMult(state: GameState): number {
  return 1 + sumEffect(state, "moveSpeedPerRank");
}

/** +dodge chance from Evasion. */
export function talentDodgeBonus(state: GameState): number {
  return sumEffect(state, "dodgePerRank");
}

/** +max-hp fraction from Bulwark. */
export function talentMaxHpPct(state: GameState): number {
  return sumEffect(state, "maxHpPerRank");
}

/** Flat incoming-damage reduction fraction — Ironhide (martial) + Mage Armor
 * (magic ward) combined, since both apply as one flat cut at the player-damage
 * choke point today. */
export function talentDamageReduction(state: GameState): number {
  return (
    sumEffect(state, "damageReductionPerRank") +
    sumEffect(state, "magicReductionPerRank")
  );
}

/** Weapon-damage MULTIPLIER from Berserker Rage: `1 + rank×slope × missing-hp
 * fraction`, so it peaks near death and is 1 at full hp (or untrained). */
export function talentBerserkMult(state: GameState): number {
  const per = sumEffect(state, "berserkPerRank");
  if (per <= 0) return 1;
  const player = state.player;
  const missing =
    player.maxHp > 0 ? Math.max(0, 1 - player.hp / player.maxHp) : 0;
  return 1 + per * missing;
}
