// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Kill resolution and the loot rain: `hitEnemy` applies player damage and,
// on a kill, pays out XP and rolls drops. Regular monsters draw from the
// level's loot table (with the pity rule and the all-clear trophy); bosses
// and elites pay their def's guaranteed drops — equipment, story items, the
// lot. Extracted from step.ts so the simulation step stays readable.

import { clamp, distance, type Vec2 } from "@game/lib/vec.ts";
import {
  ACCURACY,
  ENEMY_AI,
  LEVELING,
  LOOT,
  MENACE,
  MERCY,
  STATS,
  UNIQUE,
  WORLD_DROP,
} from "./config.ts";
import { abilityDef } from "./defs/abilities.ts";
import { difficultyDef, scaledMobCount } from "./defs/difficulties.ts";
import { enemyDef, type EnemyDef } from "./defs/enemies/index.ts";
import { levelDef } from "./defs/levels/index.ts";
import { uniqueDef } from "./defs/uniques.ts";
import {
  dropChance,
  enemyDodgeChance,
  lowDurabilityDesperation,
  lowHealthDesperation,
  mercyRescueWaiting,
  mintUnique,
  playerCritChance,
  playerMissChance,
  recomputeMaxHp,
  recomputeMaxStamina,
  rollEquipment,
  syncInventoryCapacity,
} from "./items.ts";
import { levelStatGains, xpToLevelUp } from "./leveling.ts";
import { addMapMarker } from "./map.ts";
import { bankOverkill, maybePowerScale, mobLevelTierBonus } from "./menace.ts";
import { maybeFirstKillThought, startDeathWords } from "./story.ts";
import { BALANCE } from "./tuning.ts";
import type { Enemy, GameState, Tier, WeaponClass } from "./types.ts";

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

/** Minions close enough to crowd the screen — the same `ENEMY_AI.nearRadius`
 * the spawner uses for "there's a pack on screen", so the crowd-bomb rescue
 * reads the field the player actually sees, not parked spawns across the map. */
function onScreenMinions(state: GameState): number {
  let count = 0;
  for (const enemy of state.enemies) {
    if (enemyDef(enemy.defId).role !== "minion") continue;
    if (distance(enemy.pos, state.player.pos) <= ENEMY_AI.nearRadius) count++;
  }
  return count;
}

/** True while a NUKE (any ability of `nuke` kind) sits in the powerup dock. */
function holdsNuke(state: GameState): boolean {
  return state.player.heldAbilities.some(
    (id) => abilityDef(id).kind === "nuke",
  );
}

/**
 * The ONE NUKE rule: whether a fresh screen-nuke may drop right now. A bomb is
 * barred while the hero already holds one in the powerup dock, and while an
 * un-collected bomb still lies ON screen (the `MERCY.rescueRadius` proxy, via
 * `mercyRescueWaiting`). A bomb that has drifted OFF screen does NOT bar the
 * drop: the mint sweeps it away and lets the fresh one fall (see
 * `dropScreenNuke`). Both loot paths — the crowd-bomb mercy roll and the rare
 * `LOOT.nukeShare` slice — gate on this, so at most one bomb is ever in play.
 */
export function canDropNuke(state: GameState): boolean {
  if (holdsNuke(state)) return false;
  return !mercyRescueWaiting(state, "bomb");
}

/**
 * Mint a fresh screen-nuke at `at`. First sweeps away any NUKE that has drifted
 * OFF screen — an un-collected bomb the hero walked away from — so the field
 * never carries two. The drop is gated by `canDropNuke`, which already bars a
 * fresh bomb while one waits ON screen or sits in the dock, so anything cleared
 * here is stale.
 */
function dropScreenNuke(state: GameState, at: Vec2): void {
  for (let i = state.items.length - 1; i >= 0; i--) {
    const item = state.items[i];
    if (item && item.kind === "ability" && item.defId === "screen_nuke") {
      state.items.splice(i, 1);
    }
  }
  state.items.push({
    id: state.nextId++,
    kind: "ability",
    pos: { ...at },
    defId: "screen_nuke",
  });
  state.events.push({ type: "itemDropped", pos: { ...at } });
}

/**
 * The per-kill chance a PACKED FIELD coughs up a screen-nuke — the
 * bomb-in-a-swarm bailout (a MERCY DROP). Zero until the on-screen crowd
 * passes `MERCY.crowdBombThreshold`, then ramps linearly to the difficulty's
 * `mercy.crowdBombChanceMax` at `MERCY.crowdBombFull`. Easy tops out at 5%,
 * medium 3%; hard and up cap it at zero, so this never fires there. Tune the
 * ramp shape in the `MERCY` config and the per-rung strength on the ladder.
 */
export function crowdBombChance(state: GameState): number {
  const max = difficultyDef(state.difficulty).mercy.crowdBombChanceMax;
  if (max <= 0) return 0;
  // The ONE NUKE rule: a bomb already in the dock, or an un-collected one still
  // waiting ON screen, holds the packed field's fire (see canDropNuke).
  if (!canDropNuke(state)) return 0;
  const { crowdBombThreshold: lo, crowdBombFull: hi } = MERCY;
  if (hi <= lo) return 0;
  const crowd = onScreenMinions(state);
  if (crowd <= lo) return 0;
  return max * Math.min(1, (crowd - lo) / (hi - lo));
}

/**
 * The per-kill chance a stranded hero's kill coughs up an ENERGY DRINK — the
 * empty-sprint bailout (a MERCY DROP). Zero unless the pool is BONE-DRY (exactly
 * empty, "not close to 0"), then ramps with TIME spent stranded: from zero the
 * instant stamina hits empty up to the difficulty's `mercy.staminaDrinkChanceMax`
 * at `MERCY.staminaEmptyDrinkRampMs`. Easy tops out at 15%, medium 10%; hard and
 * up cap it at zero, so this never fires there. The ramp resets the moment any
 * stamina returns (see `GameState.staminaEmptyMs`), so a hero who catches his
 * breath drops straight back to the baseline drink rain.
 */
export function staminaDrinkChance(state: GameState): number {
  const max = difficultyDef(state.difficulty).mercy.staminaDrinkChanceMax;
  if (max <= 0) return 0;
  // Only a bone-dry pool pulls a drink; a merely low reserve does not.
  if (state.player.stamina > 0) return 0;
  // One rope at a time: while an un-collected drink already waits in view,
  // the stranded hero is not thrown another (see mercyRescueWaiting).
  if (mercyRescueWaiting(state, "drink")) return 0;
  const ramp = MERCY.staminaEmptyDrinkRampMs;
  if (ramp <= 0) return max;
  return max * Math.min(1, state.staminaEmptyMs / ramp);
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
  opts?: {
    rollAccuracy?: boolean;
    /** The blow's crit-damage multiplier — weapon attacks pass their
     * cadence-weighted `weaponCritMult` (quick blades crit light, slow
     * heavy hitters crit hard); abilities omit it and use the global. */
    critMult?: number;
    /** Where this blow landed in the weapon's damage-variance band, in [0, 1]
     * (see `rollWeaponHit`). Rides out on the hit event as `critPower` so the
     * app can size a crit's popup by how strong it was. Omitted by sources with
     * no variance (abilities). */
    damageRoll?: number;
    /** The blow is a screen-nuke blast: a bomb's kills never chain into more
     * bombs, so the loot roll skips both screen-nuke slices (the crowd-bomb
     * mercy drop and the rare `LOOT.nukeShare` slice). */
    noNukeDrop?: boolean;
  },
): void {
  const def = enemyDef(enemy.defId);

  // Apparitions cannot be hit — every attack path already looks through
  // them, but this is the one funnel all damage flows through, so no future
  // caller can hurt one by accident.
  if (def.apparition) return;

  // A kneeling spareable awaiting its verdict is out of the fight: a
  // same-tick second pellet (or an orbiting orb) must not finish what the
  // choice overlay is about to ask about.
  if (state.choice !== null && state.choice.enemyId === enemy.id) return;

  // A GUARDED unique (`EnemyDef.shieldedBy`) cannot be hurt while any of its
  // named guardians still stands — every blow bounces with a "SHIELDED" cue
  // so the immunity reads as a rule. Kill the controllers, then the boss.
  if (
    def.shieldedBy &&
    def.shieldedBy.some((id) => state.enemies.some((e) => e.defId === id))
  ) {
    state.events.push({
      type: "enemyShielded",
      pos: { ...enemy.pos },
      defId: enemy.defId,
    });
    return;
  }

  // An elite or boss meets the player's power the instant the fight opens —
  // scale its hp before this blow lands so it can never be one-shot out of a
  // set piece by a leveled hero. Idempotent (latched by `powerScaled`).
  maybePowerScale(state, enemy);

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
  const damage = Math.round(
    baseDamage * (crit ? (opts?.critMult ?? STATS.critMultiplier) : 1),
  );
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
      critPower: crit ? opts?.damageRoll : undefined,
    });
    return;
  }

  // A SPAREABLE unique kneels at 0 hp instead of dying: the run pauses into
  // the `choice` phase and the killing blow is withheld until the verdict
  // (`resolveChoice` in companions.ts — spare recruits it, kill lands the
  // blow through `killEnemy` exactly as rolled here). The figure stays on
  // the board at 1 hp, untouchable via the pending-choice guard above. A
  // twin already in the party can't be re-recruited, so its double dies
  // like anything else.
  if (
    def.spareable &&
    state.choice === null &&
    !state.companions.some(
      (c) => c.defId === (def.spareable as { companion: string }).companion,
    )
  ) {
    enemy.hp = 1;
    state.choice = {
      enemyId: enemy.id,
      defId: enemy.defId,
      damage,
      crit,
      critPower: crit ? opts?.damageRoll : undefined,
    };
    state.phase = "choice";
    state.events.push({
      type: "spareOffered",
      defId: enemy.defId,
      pos: { ...enemy.pos },
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
    // The fight was won where it fled: the map remembers it like a kill.
    addMapMarker(
      state,
      def.role === "boss" ? "boss" : "elite",
      enemy.pos,
      enemy.defId,
    );
    grantXp(state, def.xp ?? Math.round(enemy.maxHp * LEVELING.xpPerHp));
    if (def.loot) dropGuaranteedLoot(state, def, enemy.pos, enemy.mlvl);
    startDeathWords(state, enemy.defId);
    return;
  }

  killEnemy(state, enemy, damage, crit, crit ? opts?.damageRoll : undefined, {
    noNukeDrop: opts?.noNukeDrop,
  });
}

/**
 * Book one enemy's death: off the board, kill counted, XP paid, loot rolled,
 * last words played. The tail of `hitEnemy`'s 0-hp path, extracted so the
 * SPARE-or-KILL verdict (`resolveChoice` in companions.ts) can land the
 * withheld killing blow through the exact same rails. Splicing is idempotent
 * — an enemy already off the board isn't removed twice. `critPower` is the
 * blow's damage-variance roll (only meaningful on a crit) — it rides out on
 * the `enemyKilled` event so the app can size the popup. `opts.noNukeDrop`
 * marks a screen-nuke kill, whose loot roll never pays out another nuke
 * (see `hitEnemy`).
 */
export function killEnemy(
  state: GameState,
  enemy: Enemy,
  damage: number,
  crit: boolean,
  critPower?: number,
  opts?: { noNukeDrop?: boolean },
): void {
  const def = enemyDef(enemy.defId);
  const index = state.enemies.indexOf(enemy);
  if (index >= 0) state.enemies.splice(index, 1);

  state.stats.kills++;
  // The kill's XP reward, resolved once so the same figure both credits the
  // hero (grantXp below) and rides the event out to the app, which floats it
  // off the corpse as rising blue combat text (WoW's "+42" xp popup).
  const xpGain = def.xp ?? Math.round(enemy.maxHp * LEVELING.xpPerHp);
  state.events.push({
    type: "enemyKilled",
    pos: { ...enemy.pos },
    defId: enemy.defId,
    damage,
    crit,
    critPower: crit ? critPower : undefined,
    xp: xpGain,
  });

  // A fallen elite or boss pins the level map where it went down.
  if (def.role !== "minion") {
    addMapMarker(state, def.role, enemy.pos, enemy.defId);
  }

  // An overpowered kill's answer: the OVERKILL — this blow's damage beyond the
  // mob's FULL health (damage − maxHp) — jolts the menace meter and lures the
  // nearby horde in. A blow that only finished a wounded mob isn't overkill;
  // one that could have dropped it several times over is. The meter also heats
  // continuously from the player's rolling output (see tickMenace).
  bankOverkill(state, damage, enemy.maxHp);

  grantXp(state, xpGain);

  // The level's scripted opening drops: hand over every schedule entry this
  // kill has reached, in author order — the guaranteed weapon → powerup → item
  // loop the probabilistic rain can't promise inside the first minute.
  dropEarlyDrops(state, enemy.pos);

  if (def.loot) {
    dropGuaranteedLoot(state, def, enemy.pos, enemy.mlvl);
  } else {
    dropMinionLoot(
      state,
      def,
      enemy.pos,
      enemy.evo ?? 0,
      enemy.mlvl,
      opts?.noNukeDrop ?? false,
    );
  }

  // Boss unique drops: the difficulty's authored uniques for this boss, each
  // rolled by how close the boss's mlvl runs to its ilvl (see the function).
  maybeDropBossUnique(state, def, enemy);

  // Level-locked world drops: this level's relics, rolled at role-scaled odds
  // on EVERY kill once the hero out-levels a first campaign pass (see function).
  maybeDropWorldUnique(state, def, enemy);

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
        // Scripted story drops arrive exactly as tuned — the make-quality
        // roll would let a BROKEN one undercut the opening the schedule
        // promises (HQ's baton on kill 2), so it is pinned to normal.
        equipment: rollEquipment(state, {
          defId: entry.weapon,
          quality: "normal",
        }),
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
 * `noNukeDrop` marks a kill dealt by a screen-nuke blast: bombs never pay out
 * more bombs, so both screen-nuke slices sit out (skipped before their rng
 * draw, like a zero chance) and the rest of the rain rolls as usual.
 */
function dropMinionLoot(
  state: GameState,
  def: EnemyDef,
  at: Vec2,
  evo = 0,
  mlvl = 1,
  noNukeDrop = false,
): void {
  // The crowd-pressure bailout: on the gentle rungs a packed field has a
  // rising chance, per kill, to drop a screen-nuke — the way out of a swarm.
  // Rolled ahead of the normal drop gate so the rescue isn't buried under it,
  // and it stands in for this kill's drop (a bomb instead of the usual rain).
  // `crowdBombChance` is zero unless the field is genuinely packed, so no roll
  // is even drawn on a normal kill (the RNG stream is untouched).
  const bombChance = noNukeDrop ? 0 : crowdBombChance(state);
  if (bombChance > 0 && state.rng() < bombChance) {
    dropScreenNuke(state, at);
    return;
  }

  // The empty-sprint bailout: a hero stranded with a bone-dry pool has a
  // rising chance, per kill, to be thrown an energy drink — the way back out
  // of a winded jog. Like the crowd bomb it is rolled ahead of the normal drop
  // gate so the rescue isn't buried under it, and it stands in for this kill's
  // drop. `staminaDrinkChance` is zero unless the pool is genuinely empty, so
  // no roll is drawn on a rested kill (the RNG stream is untouched).
  const drinkChance = staminaDrinkChance(state);
  if (drinkChance > 0 && state.rng() < drinkChance) {
    state.items.push({ id: state.nextId++, kind: "drink", pos: { ...at } });
    state.events.push({ type: "itemDropped", pos: { ...at } });
    return;
  }

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
        mlvl,
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
  // The developer knob widens (or thins) the equipment slice in place — the
  // ladder below is cumulative, so the lesser slices shift up and the arrow
  // tail absorbs the difference, exactly as authored-share tuning would.
  const equipmentShare = LOOT.equipmentShare * BALANCE.equipmentShare;
  // The difficulty leans on the drop ladder: medkits and powerups thin out a
  // few percent per rung (the equipment/repair slices stay as authored).
  const abilityShare =
    abilities.length > 0 ? LOOT.abilityShare * diff.powerupDropMult : 0;
  // The golden-arrow slice, thinned by the rung (zero on JESUS). Unlike the
  // slices above it this is the ladder's TAIL, not the leftover: whatever the
  // difficulty trims off it just doesn't drop, so free levels grow scarcer up
  // the rungs instead of the arrow rain quietly refilling the remainder.
  const arrowShare = LOOT.arrowShare * diff.arrowDropMult;
  // MERCY DROPS (gentle rungs only — the bonuses are zero from hard up): as the
  // hero's health drains, medkits and plated armor rain harder; as his weapon
  // nears breaking, repair kits do. Each boost scales the slice by
  // `1 + desperation * strength`, so it's a smooth lean-in, not a cliff. Full
  // health / full durability leaves the slices exactly as authored — and a
  // boost holds fire while the rescue it already threw waits un-collected in
  // view (mercyRescueWaiting), so a signal keeps at most one rope on the
  // ground however long the player sits on it.
  const medkitBoost = mercyRescueWaiting(state, "medkit")
    ? 0
    : lowHealthDesperation(state) * diff.mercy.medkitBonus;
  const medkitShare =
    LOOT.medkitShare * diff.medkitDropMult * (1 + medkitBoost);
  const repairBoost = mercyRescueWaiting(state, "repair")
    ? 0
    : lowDurabilityDesperation(state) * diff.mercy.repairBonus;
  const repairShare = LOOT.repairShare * (1 + repairBoost);
  // The rare slice first, so tuning the ladder below never dilutes it. A
  // nuke's own kills skip it (`noNukeDrop`, short-circuited before the draw):
  // the blast that cleared the field can't hand back the bomb that caused it.
  // The ONE NUKE rule gates it too (`canDropNuke`): no second bomb rolls while
  // one already waits on screen or sits in the dock.
  const nuked =
    !forced &&
    !noNukeDrop &&
    canDropNuke(state) &&
    state.rng() < LOOT.nukeShare;
  const roll = state.rng();
  if (nuked) {
    // Sweeps away any stale off-screen bomb before minting the fresh one.
    dropScreenNuke(state, pos);
    return;
  }
  // Whatever falls past the ladder's tail (the arrow slice a hard rung trims
  // away) yields nothing — so guard the drop event on an item actually landing.
  const itemsBefore = state.items.length;
  if (forced || roll < equipmentShare) {
    state.minionEquipmentDrops++;
    state.items.push({
      id: state.nextId++,
      kind: "equipment",
      pos,
      equipment: rollEquipment(state, { tierBonus, mlvl }),
    });
  } else if (roll < equipmentShare + abilityShare) {
    state.items.push({
      id: state.nextId++,
      kind: "ability",
      pos,
      defId: abilities[Math.floor(state.rng() * abilities.length)] as string,
    });
  } else if (roll < equipmentShare + abilityShare + medkitShare) {
    state.items.push({ id: state.nextId++, kind: "medkit", pos });
  } else if (roll < equipmentShare + abilityShare + medkitShare + repairShare) {
    state.items.push({ id: state.nextId++, kind: "repair", pos });
  } else if (
    roll <
    equipmentShare + abilityShare + medkitShare + repairShare + LOOT.drinkShare
  ) {
    // A plain energy drink in the ordinary rain — worth nothing to a rested
    // hero (it stays grounded until he's run himself winded), but the winded
    // one is far likelier to find one through the stamina-empty mercy roll above.
    state.items.push({ id: state.nextId++, kind: "drink", pos });
  } else if (
    roll <
    equipmentShare +
      abilityShare +
      medkitShare +
      repairShare +
      LOOT.drinkShare +
      arrowShare
  ) {
    // Golden XP arrows — the field's steady drip of levels (points to spend on
    // a build) rather than free healing. The slice shrinks up the rungs, so on
    // the hard difficulties this branch is reached less often and, on JESUS
    // (arrowShare 0), never — the tail below it drops nothing at all.
    state.items.push({ id: state.nextId++, kind: "xp", pos });
  }
  if (state.items.length > itemsBefore) {
    state.events.push({ type: "itemDropped", pos });
  }
}

/**
 * A boss's hand-authored UNIQUE drops for the current difficulty
 * (`EnemyDef.uniquesByDifficulty`, gated to the rung). Each listed unique rolls
 * independently at `UNIQUE.dropChance × mlvl/ilvl` (capped) — ~5% at the item's
 * home difficulty, a touch more off a deeper boss — and, on a hit, mints and
 * scatters onto the ground like any drop. NOT guaranteed: boss runs are the
 * endgame.
 */
/** Scatter one minted unique near `at` — the shared tail of every unique drop
 * (boss and world). Consumes exactly two rng draws (x, y scatter) plus whatever
 * `mintUnique` rolls, in that order — keep it stable so seeded drops don't drift. */
function pushUniqueDrop(state: GameState, id: string, at: Vec2): void {
  state.items.push({
    id: state.nextId++,
    kind: "equipment",
    pos: {
      x: clamp(at.x + (state.rng() - 0.5) * 90, 16, state.level.width - 16),
      y: clamp(at.y + (state.rng() - 0.5) * 90, 16, state.level.height - 16),
    },
    equipment: mintUnique(state, id),
  });
}

function maybeDropBossUnique(
  state: GameState,
  def: EnemyDef,
  enemy: Enemy,
): void {
  const ids = def.uniquesByDifficulty?.[state.difficulty];
  if (!ids) return;
  for (const id of ids) {
    const ilvl = Math.max(1, uniqueDef(id).ilvl);
    // The developer knob scales the capped chance (it may push past the cap —
    // that's the point of a farm-rate probe); the rng test tolerates > 1.
    const chance =
      Math.min(UNIQUE.dropChanceCap, UNIQUE.dropChance * (enemy.mlvl / ilvl)) *
      BALANCE.uniqueDrops;
    if (state.rng() >= chance) continue;
    pushUniqueDrop(state, id, enemy.pos);
  }
}

/** Level-locked world drops: any enemy on a level whose `loot.worldUniques`
 * lists relics for this difficulty rolls each one, at a chance set purely by the
 * enemy's ROLE (config WORLD_DROP) — a trash minion is a lottery ticket, the
 * boss a fat single kill, so boss runs are the efficient farm. Gated shut until
 * the hero passes `WORLD_DROP.minPlayerLevel[difficulty]` (above where a first
 * pass of THIS rung ends), so the relics can only be farmed by RETURNING once the
 * rung is beaten.
 * The gate is checked BEFORE any rng draw, so levels without a table — every
 * synthetic test fixture, and every under-level run — consume no rng and leave
 * the seeded drop stream untouched. */
function maybeDropWorldUnique(
  state: GameState,
  def: EnemyDef,
  enemy: Enemy,
): void {
  const ids = levelDef(state.level.id).loot.worldUniques?.[state.difficulty];
  if (!ids || ids.length === 0) return;
  // Per-rung gate; a rung with no gate entry fails closed (drops nothing), all
  // BEFORE any rng draw so the seeded stream is untouched on ungated runs.
  const gate = WORLD_DROP.minPlayerLevel[state.difficulty];
  if (gate === undefined || state.player.level < gate) return;
  const chance = WORLD_DROP.chanceByRole[def.role] * BALANCE.uniqueDrops;
  for (const id of ids) {
    if (state.rng() >= chance) continue;
    pushUniqueDrop(state, id, enemy.pos);
  }
}

/** Bosses and elites always pay out: their def pins the drops, scattered
 * around them — signature weapons, story items (keys, dossiers), per-tier
 * chance drops (`tierDrops`), and the usual consumables. `mlvl` is the
 * fallen mob's monster level — every equipment roll here inherits it. */
function dropGuaranteedLoot(
  state: GameState,
  def: EnemyDef,
  at: Vec2,
  mlvl = 1,
): void {
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
        mlvl,
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
  // GUARANTEED named uniques (`loot.uniqueItems` — UNIQUE_DEFS ids): story
  // payouts a kill always drops, minted like any unique find. Distinct from
  // `uniquesByDifficulty`, which is the chance-rolled endgame table.
  for (const id of loot.uniqueItems ?? []) {
    pushUniqueDrop(state, id, at);
  }
  // The per-tier chance payouts, and they may exceed 100%: each whole 1.0 is
  // a guaranteed drop of that tier, the remainder a chance of one more — a
  // boss at { magic: 1.5, rare: 0.5 } always pays a magic item, half the time
  // a second, and half the time a rare on top. The monster-level gates still
  // hold, so the same def only pays a tier its mlvl has unlocked — which is
  // why elites/bosses carry a `levelBonus` (they reach the gates first).
  for (const [tier, chance] of Object.entries(loot.tierDrops ?? {}) as [
    Exclude<Tier, "regular">,
    number,
  ][]) {
    if (mlvl < LOOT.tierUnlockMlvl[tier]) continue;
    let count = Math.floor(chance);
    if (state.rng() < chance - count) count++;
    for (let i = 0; i < count; i++) {
      state.items.push({
        id: state.nextId++,
        kind: "equipment",
        pos: scatter(),
        equipment: rollEquipment(state, { tier, mlvl }),
      });
    }
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
      equipment: rollEquipment(state, {
        slot,
        tierBonus: loot.tierBonus,
        mlvl,
      }),
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

/**
 * Award XP; each threshold crossed banks a stat point, lands the automatic
 * base-attribute gains, and arms the ding celebration — the stat chooser
 * only pauses the run once `levelUpFxMs` has burned down (see step()).
 */
export function grantXp(state: GameState, amount: number): void {
  // The developer XP knob scales every grant at the door — kills, golden
  // arrows, and scripted awards alike — so it purely paces leveling without
  // touching the curve (`xpToLevelUp`) the costs are stated in.
  amount = Math.round(amount * BALANCE.xpGain);
  const player = state.player;
  player.xp += amount;
  state.stats.xpGained += amount;
  let leveled = false;
  while (player.xp >= player.xpToNext) {
    // The Diablo-style cap: at max level XP stops banking levels. Pin the bar
    // full and keep the overflow out, so the hero fights on for cap-level gear
    // (the endgame) instead of a ding that will never come.
    if (player.level >= LEVELING.maxLevel) {
      player.xp = player.xpToNext;
      break;
    }
    player.xp -= player.xpToNext;
    player.level++;
    leveled = true;
    player.xpToNext = xpToLevelUp(player.level);
    player.pendingStatPoints += LEVELING.statPointsPerLevel;
    // The automatic base gains land with the level itself (they derive from
    // `player.level` — see leveling.ts), so re-derive everything they feed:
    // the hp/stamina pools (STAMINA) and the carry bag (STRENGTH).
    recomputeMaxHp(state);
    recomputeMaxStamina(state);
    syncInventoryCapacity(state);
    // A new level starts at full strength: the ding is also the heal, and it
    // tops off the sprint pool too.
    player.hp = player.maxHp;
    player.stamina = player.maxStamina;
    state.events.push({
      type: "levelUp",
      level: player.level,
      gains: levelStatGains(player.level),
    });
  }
  if (leveled) {
    // The chooser waits out the celebration: the golden burn wreathes the
    // hero and the fanfare rings for this long before the modal interrupts.
    state.levelUpFxMs = LEVELING.dingCelebrationMs;
  } else if (player.pendingStatPoints > 0 && state.levelUpFxMs <= 0) {
    state.phase = "levelup";
  }
}
