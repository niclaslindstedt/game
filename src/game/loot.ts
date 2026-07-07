// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Kill resolution and the loot rain: `hitEnemy` applies player damage and,
// on a kill, pays out XP and rolls drops. Regular monsters draw from the
// level's loot table (with the pity rule and the all-clear trophy); bosses
// and elites pay their def's guaranteed drops — equipment, story items, the
// lot. Extracted from step.ts so the simulation step stays readable.

import { clamp, type Vec2 } from "@game/lib/vec.ts";
import { LEVELING, LOOT, STATS } from "./config.ts";
import { scaledMobCount } from "./defs/difficulties.ts";
import { enemyDef, type EnemyDef } from "./defs/enemies.ts";
import { levelDef } from "./defs/levels.ts";
import { dropChance, playerCritChance, rollEquipment } from "./items.ts";
import { startDeathWords } from "./story.ts";
import type { Enemy, GameState } from "./types.ts";

/** Monsters still owed by the wave budget but not yet streamed in. */
export function unspawnedMinions(state: GameState): number {
  const waves = levelDef(state.level.id).waves;
  if (!waves) return 0;
  return waves.budget.reduce(
    (sum, entry, i) =>
      sum +
      scaledMobCount(entry.count, state.difficulty) -
      (state.waveSpawned[i] ?? 0),
    0,
  );
}

/**
 * Apply one player hit: roll the crit (LUCK), deal damage, and on a kill
 * grant XP proportional to max hp and roll loot. Bosses' and elites'
 * guaranteed drops come from their def; the victory countdown starts once
 * the objective clears at the end of the step.
 */
export function hitEnemy(
  state: GameState,
  enemy: Enemy,
  baseDamage: number,
): void {
  const crit = state.rng() < playerCritChance(state);
  const damage = Math.round(baseDamage * (crit ? STATS.critMultiplier : 1));
  enemy.hp -= damage;
  state.stats.damageDealt += damage;

  if (enemy.hp > 0) {
    // A critical hit flashes the victim (renderer blink; visual only).
    if (crit) enemy.critFlashMs = 300;
    state.events.push({
      type: "enemyHit",
      pos: { ...enemy.pos },
      crit,
      damage,
      defId: enemy.defId,
    });
    return;
  }

  const def = enemyDef(enemy.defId);
  state.enemies.splice(state.enemies.indexOf(enemy), 1);
  state.stats.kills++;
  state.events.push({
    type: "enemyKilled",
    pos: { ...enemy.pos },
    defId: enemy.defId,
    damage,
    crit,
  });

  grantXp(state, def.xp ?? Math.round(enemy.maxHp * LEVELING.xpPerHp));

  // The level's guaranteed early weapon: the rolled kill hands it over.
  const early = levelDef(state.level.id).loot.earlyWeapon;
  if (
    early &&
    state.earlyWeaponAtKills !== null &&
    state.stats.kills >= state.earlyWeaponAtKills
  ) {
    state.earlyWeaponAtKills = null;
    const pos = { x: enemy.pos.x + 12, y: enemy.pos.y };
    state.items.push({
      id: state.nextId++,
      kind: "equipment",
      pos,
      equipment: rollEquipment(state, { defId: early.defId }),
    });
    state.events.push({ type: "itemDropped", pos: { ...pos } });
  }

  if (def.loot) {
    dropGuaranteedLoot(state, def, enemy.pos);
  } else {
    dropMinionLoot(state, enemy.pos);
  }

  if (def.role === "boss") {
    state.events.push({ type: "bossDefeated", pos: { ...enemy.pos } });
  }

  // A unique mob's send-off: reuse the dialogue box to gasp its last words
  // (elites and bosses). Comes after XP and drops so a level-up earned by
  // the killing blow simply waits its turn behind the death scene.
  startDeathWords(state, enemy.defId);
}

/**
 * A dead regular monster's drop roll: LUCK widens the odds, the loot shares
 * split what falls between equipment, ability pickups, weapon upgrades, and
 * medkits — and a pity rule forces equipment whenever the monsters left
 * alive couldn't otherwise cover the level's guaranteed minimum.
 */
function dropMinionLoot(state: GameState, at: Vec2): void {
  const remaining =
    state.enemies.filter((e) => enemyDef(e.defId).role === "minion").length +
    unspawnedMinions(state);

  // The last regular monster standing surrenders the level's trophy weapon.
  const trophy = levelDef(state.level.id).loot.allClearWeapon;
  if (remaining === 0 && trophy) {
    const pos = { x: at.x + 12, y: at.y };
    state.items.push({
      id: state.nextId++,
      kind: "equipment",
      pos,
      equipment: rollEquipment(state, {
        defId: trophy,
        tierBonus: LOOT.allClearTierBonus,
      }),
    });
    state.events.push({ type: "itemDropped", pos: { ...pos } });
  }

  const owed = LOOT.minEquipmentPerLevel - state.minionEquipmentDrops;
  const forced = owed > remaining;

  if (!forced && state.rng() >= dropChance(state)) return;

  const pos = { ...at };
  const abilities = levelDef(state.level.id).loot.abilityPool;
  const abilityShare = abilities.length > 0 ? LOOT.abilityShare : 0;
  // The rare slice first, so tuning the ladder below never dilutes it.
  const nuked = !forced && state.rng() < LOOT.nukeShare;
  const roll = state.rng();
  if (nuked) {
    state.items.push({
      id: state.nextId++,
      kind: "ability",
      pos,
      defId: "screen_nuke",
    });
  } else if (forced || roll < LOOT.equipmentShare) {
    state.minionEquipmentDrops++;
    state.items.push({
      id: state.nextId++,
      kind: "equipment",
      pos,
      equipment: rollEquipment(state),
    });
  } else if (roll < LOOT.equipmentShare + abilityShare) {
    state.items.push({
      id: state.nextId++,
      kind: "ability",
      pos,
      defId: abilities[Math.floor(state.rng() * abilities.length)] as string,
    });
  } else if (roll < LOOT.equipmentShare + abilityShare + LOOT.xpArrowShare) {
    state.items.push({ id: state.nextId++, kind: "xp", pos });
  } else if (
    roll <
    LOOT.equipmentShare + abilityShare + LOOT.xpArrowShare + LOOT.repairShare
  ) {
    state.items.push({ id: state.nextId++, kind: "repair", pos });
  } else {
    state.items.push({ id: state.nextId++, kind: "medkit", pos });
  }
  state.events.push({ type: "itemDropped", pos });
}

/** Bosses and elites always pay out: their def pins the drops, scattered
 * around them — signature weapons, story items (keys, dossiers), and the
 * usual consumables. */
function dropGuaranteedLoot(state: GameState, def: EnemyDef, at: Vec2): void {
  const loot = def.loot;
  if (!loot) return;
  const scatter = (): Vec2 => ({
    x: clamp(at.x + (state.rng() - 0.5) * 90, 16, state.level.width - 16),
    y: clamp(at.y + (state.rng() - 0.5) * 90, 16, state.level.height - 16),
  });
  for (const entry of loot.items ?? []) {
    const spec = typeof entry === "string" ? { defId: entry } : entry;
    state.items.push({
      id: state.nextId++,
      kind: "equipment",
      pos: scatter(),
      equipment: rollEquipment(state, {
        defId: spec.defId,
        tier: spec.tier,
        tierBonus: loot.tierBonus,
      }),
    });
  }
  for (const defId of loot.storyItems ?? []) {
    state.items.push({
      id: state.nextId++,
      kind: "story",
      pos: scatter(),
      defId,
    });
  }
  const drops: ("weapon" | "gear")[] = [
    ...Array<"weapon">(loot.weapons).fill("weapon"),
    ...Array<"gear">(loot.gear).fill("gear"),
  ];
  for (const slot of drops) {
    state.items.push({
      id: state.nextId++,
      kind: "equipment",
      pos: scatter(),
      equipment: rollEquipment(state, { slot, tierBonus: loot.tierBonus }),
    });
  }
  for (let i = 0; i < loot.xpArrows; i++) {
    state.items.push({ id: state.nextId++, kind: "xp", pos: scatter() });
  }
  for (let i = 0; i < loot.repairs; i++) {
    state.items.push({ id: state.nextId++, kind: "repair", pos: scatter() });
  }
  for (let i = 0; i < loot.medkits; i++) {
    state.items.push({ id: state.nextId++, kind: "medkit", pos: scatter() });
  }
  state.events.push({ type: "itemDropped", pos: { ...at } });
}

/** Award XP; each threshold crossed banks a stat point and pauses the run. */
export function grantXp(state: GameState, amount: number): void {
  const player = state.player;
  player.xp += amount;
  state.stats.xpGained += amount;
  while (player.xp >= player.xpToNext) {
    player.xp -= player.xpToNext;
    player.level++;
    player.xpToNext = Math.round(
      LEVELING.baseXpToLevel * Math.pow(LEVELING.xpGrowth, player.level - 1),
    );
    player.pendingStatPoints += LEVELING.statPointsPerLevel;
    // A new level starts at full strength: the ding is also the heal.
    player.hp = player.maxHp;
    state.events.push({ type: "levelUp", level: player.level });
  }
  if (player.pendingStatPoints > 0) state.phase = "levelup";
}
