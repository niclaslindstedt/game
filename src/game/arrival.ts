// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The seasoned arrival: a run that starts past the first level spawns the
// hero as if he really cleared the campaign so far. His level is DERIVED
// from the earlier levels' rosters — every spawn and wave-budget mob's XP
// yield (count × hp × xpPerHp), discounted by ARRIVAL.clearShare, fed
// through the same leveling curve grantXp walks — the banked stat points
// are auto-spent round-robin, and the previous level hands over its
// signature weapon, its issue gear, and a couple of its powerups. All
// deterministic data (no RNG, no saved state), so a fresh mid-campaign run
// arrives realistically equipped without any cross-run persistence.

import { ARRIVAL, LEVELING } from "./config.ts";
import { meetsMinDifficulty } from "./defs/difficulties.ts";
import { enemyDef } from "./defs/enemies/index.ts";
import { gearDef, weaponDef } from "./defs/equipment.ts";
import { levelsBefore, type LevelDef } from "./defs/levels/index.ts";
import {
  recomputeMaxHp,
  recomputeMaxStamina,
  refreshArmor,
  syncInventoryCapacity,
} from "./items.ts";
import type { GameState, StatName } from "./types.ts";

/** The XP a full clear of `def`'s roster pays at this run's difficulty:
 * every placed spawn and wave-budget mob at its catalog hp (base counts —
 * the derivation is a story baseline, not a difficulty simulation), with
 * difficulty-gated lines the cleared run never fielded left out. */
function rosterXp(def: LevelDef, difficulty: GameState["difficulty"]): number {
  const mobXp = (enemyId: string) => {
    const enemy = enemyDef(enemyId);
    return enemy.xp ?? Math.round(enemy.hp * LEVELING.xpPerHp);
  };
  let total = 0;
  for (const spawn of def.spawns) {
    if (!meetsMinDifficulty(difficulty, spawn.minDifficulty)) continue;
    total += mobXp(spawn.enemy) * ("count" in spawn ? spawn.count : 1);
  }
  for (const entry of def.waves?.budget ?? []) {
    if (!meetsMinDifficulty(difficulty, entry.minDifficulty)) continue;
    total += mobXp(entry.enemy) * entry.count;
  }
  return total;
}

/** The weapon a clear of `def` is assumed to leave in hand: its scripted
 * early-drop weapon (the run's signature blade), else its all-clear trophy,
 * else the hardest-hitting entry of its random pool. */
function signatureWeapon(def: LevelDef): string | undefined {
  for (const drop of def.loot.earlyDrops ?? []) {
    if ("weapon" in drop) return drop.weapon;
  }
  if (def.loot.allClearWeapon) return def.loot.allClearWeapon;
  return [...def.loot.weaponPool].sort(
    (a, b) => weaponDef(b).damage - weaponDef(a).damage,
  )[0];
}

/** The first entry of `def`'s gear pool worn in `slot`, if any. */
function issueGear(def: LevelDef, slot: "suit" | "charm"): string | undefined {
  return def.loot.gearPool.find((id) => gearDef(id).slot === slot);
}

/**
 * Season a freshly-created run for a mid-campaign start. A no-op on the
 * campaign opener (no levels before it) — the hero starts there exactly as
 * authored, crude sword and all. Called once from createGame.
 */
export function applyArrival(state: GameState): void {
  // The campaign so far is one level per story index (variants sharing an
  // index — fixture catalogs do this — count once, first registered wins).
  const byIndex = new Map<number, LevelDef>();
  for (const def of levelsBefore(state.level.id)) {
    if (!byIndex.has(def.index)) byIndex.set(def.index, def);
  }
  const cleared = [...byIndex.values()];
  if (cleared.length === 0) return;
  const player = state.player;

  // The derived level: the cleared rosters' XP through the real curve.
  let xp = Math.round(
    cleared.reduce((sum, def) => sum + rosterXp(def, state.difficulty), 0) *
      ARRIVAL.clearShare,
  );
  while (xp >= player.xpToNext) {
    xp -= player.xpToNext;
    player.level++;
    player.xpToNext = Math.round(
      LEVELING.baseXpToLevel * Math.pow(LEVELING.xpGrowth, player.level - 1),
    );
    player.pendingStatPoints += LEVELING.statPointsPerLevel;
  }
  player.xp = xp;

  // Spend the banked points the way a steady hand would: round-robin, so the
  // build arrives broad and the run's own level-ups pick the specialty.
  const order = ARRIVAL.statOrder as readonly StatName[];
  for (let i = 0; player.pendingStatPoints > 0; i++) {
    player.stats[order[i % order.length] as StatName]++;
    player.pendingStatPoints--;
  }

  // The previous level's parting kit: its signature weapon replaces the
  // crude sword, its issue gear is worn in, and a couple of its powerups
  // ride along in the hero's pockets.
  const previous = cleared[cleared.length - 1] as LevelDef;
  const weapon = signatureWeapon(previous);
  if (weapon) {
    player.equipment.weapon = {
      id: state.nextId++,
      defId: weapon,
      slot: "weapon",
      tier: "regular",
      affixes: [],
      durability: weaponDef(weapon).durability,
    };
  }
  const suit = issueGear(previous, "suit");
  if (suit) {
    player.equipment.suit = {
      id: state.nextId++,
      defId: suit,
      slot: "suit",
      tier: "regular",
      affixes: [],
    };
  }
  const charm = issueGear(previous, "charm");
  if (charm) {
    player.equipment.charm = {
      id: state.nextId++,
      defId: charm,
      slot: "charm",
      tier: "regular",
      affixes: [],
    };
  }
  player.heldAbilities = previous.loot.abilityPool.slice(
    0,
    ARRIVAL.heldAbilities,
  );

  // Re-derive the pools the stats and gear just grew, and arrive fresh:
  // full health, full sprint, plating fastened.
  recomputeMaxHp(state);
  recomputeMaxStamina(state);
  syncInventoryCapacity(state);
  refreshArmor(state);
  player.hp = player.maxHp;
  player.stamina = player.maxStamina;
}
