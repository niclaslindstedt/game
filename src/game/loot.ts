// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Kill resolution and the loot rain: `hitEnemy` applies player damage and,
// on a kill, pays out XP and rolls drops. Regular monsters draw from the
// level's loot table (with the pity rule and the all-clear trophy); bosses
// and elites pay their def's guaranteed drops — equipment, story items, the
// lot. Extracted from step.ts so the simulation step stays readable.

import { clamp, type Vec2 } from "@game/lib/vec.ts";
import { ACCURACY, LEVELING, LOOT, MENACE, STATS } from "./config.ts";
import { difficultyDef, scaledMobCount } from "./defs/difficulties.ts";
import { enemyDef, type EnemyDef } from "./defs/enemies/index.ts";
import { levelDef } from "./defs/levels/index.ts";
import {
  dropChance,
  enemyDodgeChance,
  playerCritChance,
  playerMissChance,
  rollEquipment,
} from "./items.ts";
import { bankOverkill, maybePowerScale, mobLevelTierBonus } from "./menace.ts";
import { maybeFirstKillThought, startDeathWords } from "./story.ts";
import type { Enemy, GameState, WeaponClass } from "./types.ts";

/** Monsters still owed by the wave budget but not yet streamed in. Each line
 * clamps at zero so an over-counted line (tests exhaust budgets by maxing
 * `waveSpawned`) can never drag the total negative and trip the pity rule. */
export function unspawnedMinions(state: GameState): number {
  const waves = levelDef(state.level.id).waves;
  if (!waves) return 0;
  return waves.budget.reduce(
    (sum, entry, i) =>
      sum +
      Math.max(
        0,
        scaledMobCount(entry.count, state.difficulty) -
          (state.waveSpawned[i] ?? 0),
      ),
    0,
  );
}

/**
 * Apply one player hit: roll the crit (the weapon class's CRIT stat plus a
 * marginal LUCK nudge), deal damage, and on a kill grant XP proportional to
 * max hp and roll loot. `weaponClass` names the blow that landed so the crit
 * uses the right stat (DEX for melee & ranged, INT for magic); it defaults to
 * the equipped weapon's class for hits that don't carry one (e.g. the nuke).
 * Bosses' and elites' guaranteed drops come from their def; the victory
 * countdown starts once the objective clears at the end of the step.
 *
 * `rollAccuracy` gates the miss/dodge roll: WEAPON attacks (melee swings,
 * ranged/magic shots) pass it, so DEXTERITY governs whether the blow lands;
 * conjured abilities (orbit, storm, nuke) omit it and always connect.
 */
export function hitEnemy(
  state: GameState,
  enemy: Enemy,
  baseDamage: number,
  weaponClass?: WeaponClass,
  opts?: { rollAccuracy?: boolean },
): void {
  // An elite or boss meets the player's power the instant the fight opens —
  // scale its hp before this blow lands so it can never be one-shot out of a
  // set piece by a leveled hero. Idempotent (latched by `powerScaled`).
  maybePowerScale(state, enemy);

  const def = enemyDef(enemy.defId);

  // A weapon blow can come to nothing two ways, both trimmed by DEXTERITY (the
  // hero's hit rate): the hero's own MISS, then — if it would have landed — the
  // foe's DODGE. Either spends the swing and deals nothing. Rolled only for
  // weapon attacks; abilities skip it (`rollAccuracy` unset) and always hit.
  if (opts?.rollAccuracy) {
    if (state.rng() < playerMissChance(state)) {
      state.events.push({
        type: "enemyMiss",
        pos: { ...enemy.pos },
        defId: enemy.defId,
      });
      return;
    }
    if (
      state.rng() <
      enemyDodgeChance(state, def.dodgeChance ?? ACCURACY.enemyDodge)
    ) {
      state.events.push({
        type: "enemyDodge",
        pos: { ...enemy.pos },
        defId: enemy.defId,
      });
      return;
    }
  }

  const crit = state.rng() < playerCritChance(state, weaponClass);
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

  state.enemies.splice(state.enemies.indexOf(enemy), 1);

  // A fleeing unique escapes at 0 hp instead of dying: no kill is booked and
  // no corpse hits the floor — it tears open its escape landmark on the spot,
  // pays its guaranteed drops in the scramble, and gasps its parting words
  // through the same death-scene box. XP still flows: the fight was won.
  if (def.flees) {
    state.landmarks.push({
      kind: def.flees.landmark,
      sprite: def.flees.landmark,
      anchor: "center",
      pos: { ...enemy.pos },
    });
    state.events.push({
      type: "bossFled",
      pos: { ...enemy.pos },
      defId: enemy.defId,
    });
    grantXp(state, def.xp ?? Math.round(enemy.maxHp * LEVELING.xpPerHp));
    if (def.loot) dropGuaranteedLoot(state, def, enemy.pos);
    startDeathWords(state, enemy.defId);
    return;
  }

  state.stats.kills++;
  state.events.push({
    type: "enemyKilled",
    pos: { ...enemy.pos },
    defId: enemy.defId,
    damage,
    crit,
  });

  // An overpowered kill's answer: the OVERKILL — this blow's damage beyond the
  // mob's FULL health (damage − maxHp) — jolts the menace meter and lures the
  // nearby horde in. A blow that only finished a wounded mob isn't overkill;
  // one that could have dropped it several times over is. The meter also heats
  // continuously from the player's rolling output (see tickMenace).
  bankOverkill(state, damage, enemy.maxHp);

  grantXp(state, def.xp ?? Math.round(enemy.maxHp * LEVELING.xpPerHp));

  // The level's scripted opening drops: hand over every schedule entry this
  // kill has reached, in author order — the guaranteed weapon → powerup → item
  // loop the probabilistic rain can't promise inside the first minute.
  dropEarlyDrops(state, enemy.pos);

  if (def.loot) {
    dropGuaranteedLoot(state, def, enemy.pos);
  } else {
    dropMinionLoot(state, def, enemy.pos, enemy.evo ?? 0);
  }

  if (def.role === "boss") {
    state.events.push({ type: "bossDefeated", pos: { ...enemy.pos } });
  }

  // A unique mob's send-off: reuse the dialogue box to gasp its last words
  // (elites and bosses). Comes after XP and drops so a level-up earned by
  // the killing blow simply waits its turn behind the death scene.
  startDeathWords(state, enemy.defId);

  // A story beat pinned to this kill: the first of its kind on this level
  // stops the run for the hero's own read on it (once per run).
  maybeFirstKillThought(
    state,
    def.id,
    levelDef(state.level.id).firstKillThoughts,
  );
}

/**
 * The scripted opening loot cadence: for each entry the latest kill count has
 * reached (in author order), hand over its guaranteed drop — a weapon, an
 * ability powerup, or a plain consumable/XP pickup — and advance the cursor.
 * Several entries owed by the same kill fan out so their pickups don't stack.
 */
function dropEarlyDrops(state: GameState, at: Vec2): void {
  const schedule = levelDef(state.level.id).loot.earlyDrops;
  if (!schedule) return;
  while (state.earlyDropCursor < schedule.length) {
    const i = state.earlyDropCursor;
    const entry = schedule[i];
    const atKills = state.earlyDropKills[i];
    if (!entry || atKills === undefined || state.stats.kills < atKills) break;
    state.earlyDropCursor++;
    const pos = {
      x: clamp(
        at.x + 12 + state.earlyDropCursor * 8,
        16,
        state.level.width - 16,
      ),
      y: at.y,
    };
    if ("weapon" in entry) {
      state.items.push({
        id: state.nextId++,
        kind: "equipment",
        pos,
        equipment: rollEquipment(state, { defId: entry.weapon }),
      });
    } else if ("ability" in entry) {
      state.items.push({
        id: state.nextId++,
        kind: "ability",
        pos,
        defId: entry.ability,
      });
    } else {
      state.items.push({ id: state.nextId++, kind: entry.item, pos });
    }
    state.events.push({ type: "itemDropped", pos: { ...pos } });
  }
}

/**
 * A dead regular monster's drop roll: LUCK widens the odds, the loot shares
 * split what falls between equipment, ability pickups, weapon upgrades, and
 * medkits — and a pity rule forces equipment whenever the monsters left
 * alive couldn't otherwise cover the level's guaranteed minimum. `evo` is the
 * mob's menace evolution stage: an evolved kill drops more often and rolls a
 * better tier when it does, so a rampaging player who toughens the horde is
 * paid back in gear. A tougher mob's `dropProfile` sweetens the same two
 * knobs by a fixed amount, so a heavy hitter is worth the effort of dropping.
 */
function dropMinionLoot(
  state: GameState,
  def: EnemyDef,
  at: Vec2,
  evo = 0,
): void {
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

  // An evolved mob is likelier to drop, and its equipment rolls a richer tier;
  // a tougher mob's own drop profile stacks the same bonuses on top. The
  // player's LEVEL sweetens the tier too, so a higher-level hero's kills yield
  // richer gear to match the sturdier horde they came off (see mobLevelScale).
  const evoDropBonus = Math.max(0, evo) * MENACE.dropBonusPerStage;
  const evoTierBonus = Math.max(0, evo) * MENACE.tierBonusPerStage;
  const profileDropBonus = def.dropProfile?.dropBonus ?? 0;
  const profileTierBonus = def.dropProfile?.tierBonus ?? 0;
  const dropBonus = evoDropBonus + profileDropBonus;
  const tierBonus = evoTierBonus + profileTierBonus + mobLevelTierBonus(state);

  if (!forced && state.rng() >= dropChance(state) + dropBonus) return;

  const pos = { ...at };
  const diff = difficultyDef(state.difficulty);
  const abilities = levelDef(state.level.id).loot.abilityPool;
  // The difficulty leans on the drop ladder: medkits and powerups thin out a
  // few percent per rung (the equipment/repair slices stay as authored).
  const abilityShare =
    abilities.length > 0 ? LOOT.abilityShare * diff.powerupDropMult : 0;
  const medkitShare = LOOT.medkitShare * diff.medkitDropMult;
  // The rare slice first, so tuning the ladder below never dilutes it.
  const nuked = !forced && state.rng() < LOOT.nukeShare;
  // The unique slice: the harder rungs' shot at one-of-a-kind gear, drawn
  // from the level's `uniquePool`. No level ships one yet, so the guard makes
  // this a clean no-op (not even a roll is drawn) until unique items exist.
  const uniques = levelDef(state.level.id).loot.uniquePool ?? [];
  const unique =
    !nuked &&
    !forced &&
    uniques.length > 0 &&
    diff.uniqueDropChance > 0 &&
    state.rng() < diff.uniqueDropChance;
  const roll = state.rng();
  if (nuked) {
    state.items.push({
      id: state.nextId++,
      kind: "ability",
      pos,
      defId: "screen_nuke",
    });
  } else if (unique) {
    state.items.push({
      id: state.nextId++,
      kind: "equipment",
      pos,
      equipment: rollEquipment(state, {
        defId: uniques[Math.floor(state.rng() * uniques.length)] as string,
        tierBonus,
      }),
    });
  } else if (forced || roll < LOOT.equipmentShare) {
    state.minionEquipmentDrops++;
    state.items.push({
      id: state.nextId++,
      kind: "equipment",
      pos,
      equipment: rollEquipment(state, { tierBonus }),
    });
  } else if (roll < LOOT.equipmentShare + abilityShare) {
    state.items.push({
      id: state.nextId++,
      kind: "ability",
      pos,
      defId: abilities[Math.floor(state.rng() * abilities.length)] as string,
    });
  } else if (roll < LOOT.equipmentShare + abilityShare + medkitShare) {
    state.items.push({ id: state.nextId++, kind: "medkit", pos });
  } else if (
    roll <
    LOOT.equipmentShare + abilityShare + medkitShare + LOOT.repairShare
  ) {
    state.items.push({ id: state.nextId++, kind: "repair", pos });
  } else {
    // The remainder are golden XP arrows — the field still rains pickups, but
    // they buy levels (points to spend on a build) rather than free healing.
    state.items.push({ id: state.nextId++, kind: "xp", pos });
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
    // A new level starts at full strength: the ding is also the heal, and it
    // tops off the sprint pool too.
    player.hp = player.maxHp;
    player.stamina = player.maxStamina;
    state.events.push({ type: "levelUp", level: player.level });
  }
  if (player.pendingStatPoints > 0) state.phase = "levelup";
}
