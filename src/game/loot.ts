// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Kill resolution and the loot rain: `hitEnemy` applies player damage and,
// on a kill, pays out XP and rolls drops. Regular monsters draw from the
// level's loot table (with the pity rule and the all-clear trophy); bosses
// and elites pay their def's guaranteed drops — equipment, story items, the
// lot. Extracted from step.ts so the simulation step stays readable.

import { clamp, direction, distance, type Vec2 } from "@game/lib/vec.ts";
import { companionMaxHp, companionXpToLevelUp } from "./companion-stats.ts";
import {
  ACCURACY,
  COMPANIONS,
  ENEMY_AI,
  KNOCKBACK,
  LEVELING,
  LOOT,
  MEDKIT,
  MENACE,
  MERCY,
  RARE_MOBS,
  RUN,
  STATS,
  UNIQUE,
  WORLD_DROP,
} from "./config.ts";
import { abilityDef } from "./defs/abilities.ts";
import { companionDef } from "./defs/companions.ts";
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
import {
  levelStatGains,
  mobLevelXp,
  statPointsAt,
  xpCapMultiplier,
  xpLevelCap,
  xpToLevelUp,
} from "./leveling.ts";
import { addMapMarker } from "./map.ts";
import { resolveObstacles } from "./obstacles.ts";
import {
  bankOverkill,
  currentMobLevel,
  maybePowerScale,
  mobLevelTierBonus,
  overkillEfficiency,
} from "./menace.ts";
import { equippedProcs } from "./spells.ts";
import {
  maybeCapThought,
  maybeFirstKillThought,
  startDeathWords,
} from "./story.ts";
import { BALANCE } from "./tuning.ts";
import type {
  Enemy,
  GameState,
  ProcTrigger,
  Tier,
  WeaponClass,
} from "./types.ts";

/** Monsters still owed by the wave budget but not yet streamed in. Each line
 * clamps at zero so an over-counted line (tests exhaust budgets by maxing
 * `waveSpawned`) can never drag the total negative and trip the pity rule.
 * Deliberately does NOT count DORMANT PACK members — the loot pity's
 * "remaining" reads this as monsters about to be killed here and now, and a
 * far-off cluster the hero may never reach must not suppress the pity drops.
 * A `clearAll` level gates on packs separately (see `packsCleared`). */
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

/** Every placed pack wiped out (or the level has none) — the `clearAll`
 * objective's pack gate. A dormant or still-fighting pack keeps the level
 * open, so the map can't be won until each cluster has been reached and
 * cleared. */
export function packsCleared(state: GameState): boolean {
  return state.packs.every((pack) => pack.status === "cleared");
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
 * Fly the freshest drop in on an ANGEL: mark it airborne (uncollectable, and
 * magnet-proof) for `MERCY.angelDeliverMs` so the guardian can swoop it down to
 * `at` before releasing it, and emit the one-shot `mercyDrop` cue the app plays
 * the chime off. The engine names no angel — it just sets the timer the renderer
 * dramatizes (see `stepItems`, `render.ts`). No-op if nothing was just pushed.
 */
function flyInByAngel(state: GameState, at: Vec2): void {
  const item = state.items[state.items.length - 1];
  if (item) item.deliverMs = MERCY.angelDeliverMs;
  state.events.push({ type: "mercyDrop", pos: { ...at } });
}

/**
 * Which MEDKIT tier this kill pays (an index into `MEDKIT.tiers`): the
 * deepest tier the current monster level has unlocked most of the time, the
 * one under it sometimes (3:1 — the affix-bracket idiom), so a deep campaign
 * drops SUPERIOR kits with the odd plain one mixed in and the opening only
 * ever finds LIGHT kits. D2's potion rule: bigger areas, bigger potions.
 */
export function rollMedkitTier(state: GameState): number {
  const mlvl = currentMobLevel(state);
  let top = 0;
  for (let i = 0; i < MEDKIT.tiers.length; i++) {
    if ((MEDKIT.tiers[i] as { minMlvl: number }).minMlvl <= mlvl) top = i;
  }
  if (top === 0) return 0;
  return state.rng() < 0.25 ? top - 1 : top;
}

/**
 * The per-kill chance a PACKED FIELD coughs up a screen-nuke — the
 * bomb-in-a-swarm bailout (a MERCY DROP). Zero until the on-screen crowd
 * passes `MERCY.crowdBombThreshold`, then ramps linearly to the difficulty's
 * `mercy.crowdBombChanceMax` at `MERCY.crowdBombFull`. The cap TAPERS down
 * the ladder (easy 5% … nightmare 0.5%, zero on JESUS). Tune the ramp shape
 * in the `MERCY` config and the per-rung strength on the ladder.
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
 * at `MERCY.staminaEmptyDrinkRampMs`. The cap tapers down the ladder (easy
 * 15% … zero on JESUS). The ramp resets the moment any
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
 * Shove a struck mob straight back from the hero (config `KNOCKBACK`). Only
 * MELEE and RANGED weapon blows push — magic hits don't (its crowd control is
 * the cleave and the crit blob). The displacement is flat, scaled by the mob's
 * role (heavier set pieces plant their feet) and the developer BALANCE knob;
 * the moved body is clamped back onto the map and pushed clear of any obstacle
 * it lands inside, so a shove can never park a mob in a wall or off the level.
 * Caller gates to the hero's own weapon blows (`rollAccuracy`) on survivors.
 */
function applyKnockback(
  state: GameState,
  enemy: Enemy,
  weaponClass?: WeaponClass,
): void {
  if (weaponClass !== "melee" && weaponClass !== "ranged") return;
  const def = enemyDef(enemy.defId);
  const scale = KNOCKBACK.roleScale[def.role] * BALANCE.knockback;
  if (scale <= 0) return;
  const dir = direction(state.player.pos, enemy.pos);
  if (dir.x === 0 && dir.y === 0) return; // sitting on the hero: no bearing
  const push = KNOCKBACK.distance * scale;
  enemy.pos.x = clamp(
    enemy.pos.x + dir.x * push,
    def.radius,
    state.level.width - def.radius,
  );
  enemy.pos.y = clamp(
    enemy.pos.y + dir.y * push,
    def.radius,
    state.level.height - def.radius,
  );
  resolveObstacles(state, enemy.pos, def.radius);
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
    /** The blow is not the hero's own weapon — a POWERUP (the screen-nuke bomb,
     * the fire orbs, the storm cell) or a COMPANION's attack. Its damage and
     * kill are still booked into the run stats, but kept OUT of the menace
     * meter: the exempt counters below catch the damage, and `killEnemy` skips
     * the overkill jolt and evolution ratchet. Menace answers an overpowered
     * HERO — a bomb clearing the screen, or a party carrying the fight, is not
     * the hero out-fighting the horde by hand and must not escalate it. */
    noMenace?: boolean;
    /** The COMPANION (`Companion.id`) whose attack this is: a kill by this blow
     * credits its XP to that companion so it earns its OWN levels
     * (`creditCompanionKill`). Undefined for the hero and for powerups. */
    companionId?: number;
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
  // Powerup damage is booked for the run stats but held back from the menace
  // meter — step() subtracts this slice from what tickMenace reads.
  if (opts?.noMenace) state.menaceExemptDamage += damage;

  // THE MAGIC CRIT BLOB (config `MAGIC_CRIT`): the hero's OWN direct magic
  // weapon crit bursts a small arcane splash around the struck foe. Gated on
  // `rollAccuracy` — the same flag that marks his own weapon blows (never a
  // chain leap, a proc, a conjured power, or a companion's shot), so the
  // blob's own splash (which omits it) can't blob again. Queued whether the
  // victim lived or died; `stepMagicCritBlobs` sizes and resolves it after
  // the attack pass so it never splices the enemy list mid-loop.
  if (crit && weaponClass === "magic" && opts?.rollAccuracy) {
    state.pendingCritBlobs.push({
      pos: { ...enemy.pos },
      blowDamage: baseDamage,
      victimId: enemy.id,
    });
  }

  // PROCS (the `proc` affix, legendary territory) ride the hero's OWN weapon
  // blows: `rollAccuracy` is set by exactly those paths (melee sweep, his own
  // projectiles) — never by companions or conjured powers — so it doubles as
  // the proc gate, and a proc's own hits can never proc again. ON-HIT procs
  // roll on every landed blow, killing ones included; ON-KILL procs roll
  // where the kill actually books (below). Resolution is deferred to
  // `stepProcs` (step.ts) so a nova never splices the enemy list under the
  // sweep that triggered it.
  if (opts?.rollAccuracy) queueWeaponProcs(state, enemy, "hit");

  if (enemy.hp > 0) {
    // KNOCKBACK (config `KNOCKBACK`): the hero's own melee/ranged blow shoves
    // the surviving mob back — never a killing blow (the corpse launch owns
    // that) nor a magic hit, a companion's, a proc's, or a conjured power's.
    if (opts?.rollAccuracy) applyKnockback(state, enemy, weaponClass);
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
    // A rout is a won fight: the hero's killing blow fires its ON-KILL procs
    // like any kill.
    if (opts?.rollAccuracy) queueWeaponProcs(state, enemy, "kill");
    // The overkill toll applies to a routed foe like any kill: a blow far
    // beyond its full health collects only its share of the xp.
    grantXp(
      state,
      Math.max(
        1,
        Math.round(
          enemyKillXp(state, def, enemy) *
            overkillEfficiency(damage, enemy.maxHp),
        ),
      ),
    );
    if (def.loot) dropGuaranteedLoot(state, def, enemy.pos, enemy.mlvl);
    startDeathWords(state, enemy.defId);
    return;
  }

  // The blow kills: the hero's own weapon kills fire their ON-KILL procs
  // (a spared kneel above is not a kill; a companion's blow never queues).
  if (opts?.rollAccuracy) queueWeaponProcs(state, enemy, "kill");

  killEnemy(state, enemy, damage, crit, crit ? opts?.damageRoll : undefined, {
    noNukeDrop: opts?.noNukeDrop,
    noMenace: opts?.noMenace,
    companionId: opts?.companionId,
  });
}

/**
 * Roll every equipped PROC that fires on `trigger` and queue the winners for
 * `stepProcs` (step.ts) to resolve after the combat passes. The equipped-proc
 * check comes BEFORE any rng draw, so a loadout without procs consumes no
 * rng and the seeded drop/combat streams never shift.
 */
function queueWeaponProcs(
  state: GameState,
  enemy: Enemy,
  trigger: ProcTrigger,
): void {
  const procs = equippedProcs(state, trigger);
  for (const proc of procs) {
    if (state.rng() >= proc.chance) continue;
    state.pendingProcs.push({
      spell: proc.spell,
      rank: proc.rank,
      pos: { ...enemy.pos },
      enemyId: enemy.id,
    });
  }
}

/**
 * The D2 "cast when struck": roll every equipped `trigger: "struck"` proc
 * when an ENEMY blow actually lands on the hero (post-dodge — a sidestepped
 * swing casts nothing) and queue the winners for `stepProcs`. Called from
 * the enemy-sourced damage paths — contact (step.ts), mechanic blows
 * (mechanics.ts), hostile shots (ranged.ts); impartial hazards never
 * retaliate. A BOLT grounds in `attacker` (or the nearest foe when a shot's
 * shooter is unknown); a NOVA bursts around the HERO. Same no-rng-without-
 * procs guarantee as the weapon triggers.
 */
export function queueStruckProcs(state: GameState, attacker?: Enemy): void {
  const procs = equippedProcs(state, "struck");
  for (const proc of procs) {
    if (state.rng() >= proc.chance) continue;
    state.pendingProcs.push({
      spell: proc.spell,
      rank: proc.rank,
      pos: { ...state.player.pos },
      enemyId: attacker?.id,
    });
  }
}

/**
 * The base XP a kill of `enemy` pays, BEFORE the overkill toll — the single
 * place the reward rules live, so every death path (a normal kill, a routed
 * boss, a companion's finishing blow) reads the same figure. ELITES and BOSSES
 * pay a SHARE OF THE HERO'S CURRENT LEVEL BAR (`xpToLevelUp(player.level)` ×
 * the def's `xpBarShare` or the role default LEVELING.eliteXpBarShare /
 * bossXpBarShare), so a set-piece kill lurches the bar the same noticeable
 * amount on every map and difficulty. The rank and file pay a MONSTER-LEVEL
 * reward (`mobLevelXp` — proportional to the mob's level, NOT its hp), so a
 * tank and a squishy of the same level pay alike and an evolved (extra-hp)
 * minion is no richer; a RARE/UNIQUE mob multiplies that by its `xpMult`
 * (config RARE_MOBS), a fat single payout for the special find. A def's flat
 * `xp` override, when set, wins outright.
 */
export function enemyKillXp(
  state: GameState,
  def: EnemyDef,
  enemy: Enemy,
): number {
  if (def.xp != null) return def.xp;
  if (def.role !== "minion") {
    const share =
      def.xpBarShare ??
      (def.role === "boss"
        ? LEVELING.bossXpBarShare
        : LEVELING.eliteXpBarShare);
    return share * xpToLevelUp(state.player.level, state.difficulty);
  }
  const rarity = def.rarity ? RARE_MOBS.tuning[def.rarity] : undefined;
  return mobLevelXp(enemy.mlvl, state.player.level) * (rarity?.xpMult ?? 1);
}

/**
 * Credit a COMPANION's finishing blow: the kill's base XP (`enemyKillXp` — the
 * same figure the hero would earn, so an elite lurches the bar) banks toward
 * the companion's OWN level, and each threshold crossed levels it up, re-scales
 * its hp to the new level (topped to full, the ding's heal), and floats a
 * `companionLeveledUp` cue. A downed companion earns nothing (it isn't the one
 * fighting). Companion XP is NOT run through the per-map soft cap — the party
 * levels forever, by design. No-op if the id isn't in the party (it left, or
 * was a stale tag).
 */
function creditCompanionKill(
  state: GameState,
  companionId: number,
  def: EnemyDef,
  enemy: Enemy,
): void {
  const companion = state.companions.find((c) => c.id === companionId);
  if (!companion || companion.downedMs !== undefined) return;
  companion.xp += Math.max(1, Math.round(enemyKillXp(state, def, enemy)));
  let leveled = false;
  while (
    companion.level < COMPANIONS.maxLevel &&
    companion.xp >= companion.xpToNext
  ) {
    companion.xp -= companion.xpToNext;
    companion.level++;
    companion.xpToNext = companionXpToLevelUp(companion.level);
    leveled = true;
  }
  if (leveled) {
    companion.maxHp = companionMaxHp(
      companionDef(companion.defId),
      companion.level,
    );
    // A ding is the heal, exactly as the hero's is.
    companion.hp = companion.maxHp;
    state.events.push({
      type: "companionLeveledUp",
      defId: companion.defId,
      level: companion.level,
      pos: { ...companion.pos },
    });
  }
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
 * (see `hitEnemy`). `opts.noMenace` marks a powerup kill (nuke/orbs/storm):
 * it books the kill for the run but skips the overkill jolt/ratchet and is
 * netted out of the menace kill-rate heat (see `hitEnemy`).
 */
export function killEnemy(
  state: GameState,
  enemy: Enemy,
  damage: number,
  crit: boolean,
  critPower?: number,
  opts?: { noNukeDrop?: boolean; noMenace?: boolean; companionId?: number },
): void {
  const def = enemyDef(enemy.defId);
  const index = state.enemies.indexOf(enemy);
  if (index >= 0) state.enemies.splice(index, 1);

  // A COMPANION's finishing blow earns IT the kill's XP (its own leveling —
  // decoupled from the hero, and persisted across the whole save via the
  // loadout). Done before the hero's own bookkeeping below; it never touches
  // the hero's bar.
  if (opts?.companionId !== undefined) {
    creditCompanionKill(state, opts.companionId, def, enemy);
  }

  state.stats.kills++;
  // Refresh the combat-clock tail: this kill proves a fight is live, so the
  // farm-proof survival clock keeps ticking for RUN.combatGraceMs even if this
  // was the last foe standing (see step.ts).
  state.combatGraceMs = RUN.combatGraceMs;
  // A powerup kill (nuke/orbs/storm) counts for the run but not for the menace
  // kill-rate heat — step() nets it out of what tickMenace reads.
  if (opts?.noMenace) state.menaceExemptKills++;
  // A minion the HERO felled feeds the clearance gate (see tickMenace): the
  // kill side of "is the horde thinning or filling?". Powerup kills are exempt,
  // exactly as they are from the kill-rate heat, so a bomb never opens the gate.
  else if (def.role === "minion") state.pendingMinionKills++;
  // The kill's XP reward, resolved once so the same figure both credits the
  // hero (grantXp below) and rides the event out to the app, which floats it
  // off the corpse as rising blue combat text (WoW's "+42" xp popup). The
  // OVERKILL TOLL scales it down first: a killing blow at 2× the mob's full
  // health pays half, at 3× a third (`overkillEfficiency`) — one-shotting a
  // horde far beneath you levels slowly, by design. The same efficiency cuts
  // the drop roll below, so trivial farming pays out neither xp nor loot.
  const efficiency = overkillEfficiency(damage, enemy.maxHp);
  const xpGain = Math.max(
    1,
    Math.round(enemyKillXp(state, def, enemy) * efficiency),
  );
  state.events.push({
    type: "enemyKilled",
    pos: { ...enemy.pos },
    defId: enemy.defId,
    damage,
    maxHp: enemy.maxHp,
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
  // one that could have dropped it several times over is. The victim's own
  // evolution stage rides along to feed the RATCHET: one-shotting the current
  // crop is what forces the next stage. The meter also heats continuously from
  // the player's rolling output (see tickMenace). A POWERUP kill is exempt: a
  // bomb or ability wiping the screen must not jolt, lure, or ratchet — the
  // escalation answers the hero's OWN power, not a consumable.
  if (!opts?.noMenace) bankOverkill(state, damage, enemy.maxHp, enemy.evo ?? 0);

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
      efficiency,
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
    // Remember where it fell: if the player chooses to STAY on the cleared
    // field (the victory menu), this becomes the corpse they tap to re-open
    // the menu and finally move on (see step.ts / render).
    state.bossCorpse = { pos: { ...enemy.pos }, sprite: def.sprite };
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
  // The recurring cap-farm mutter: if the hero has out-levelled this map, every
  // so often he grumbles that the fights are pathetic and he should hurry to
  // find Ada. Repeats on a cooldown (see maybeCapThought); yields if the pinned
  // beat above already put a scene up.
  maybeCapThought(state);
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
 * mob's menace evolution stage: an evolved (malice) kill pays MORE xp (its
 * extra hp) but rolls a WORSE tier when it drops — a rampage is a leveling
 * faucet, not a loot farm. A tougher mob's `dropProfile` sweetens its rolls
 * by a fixed amount, so a heavy hitter is worth the effort of dropping.
 * `noNukeDrop` marks a kill dealt by a screen-nuke blast: bombs never pay out
 * more bombs, so both screen-nuke slices sit out (skipped before their rng
 * draw, like a zero chance) and the rest of the rain rolls as usual.
 * `efficiency` is the killing blow's overkill toll (`overkillEfficiency`):
 * it scales the whole drop chance, so one-shot farming starves the rain too.
 */
function dropMinionLoot(
  state: GameState,
  def: EnemyDef,
  at: Vec2,
  evo = 0,
  mlvl = 1,
  noNukeDrop = false,
  efficiency = 1,
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
    flyInByAngel(state, at);
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
    flyInByAngel(state, at);
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

  // An evolved (malice) mob finds WORSE gear: each evolution stage SUBTRACTS
  // from its drop's tier roll, so the magic/rare odds thin out as the horde
  // toughens — its reward is the extra xp its extra hp pays, not loot. A
  // tougher mob's own drop profile still sweetens its rolls, and the player's
  // LEVEL keeps sweetening the tier (see mobLevelScale), so ordinary kills
  // stay rewarding; only the rampage-evolved crop pays out lean.
  const evoTierPenalty = Math.max(0, evo) * MENACE.tierPenaltyPerStage;
  const dropBonus = def.dropProfile?.dropBonus ?? 0;
  // A RARE/UNIQUE mob's tier (config RARE_MOBS): its kill sweetens every
  // payout's tier roll, and — below — multiplies the drop chance itself into
  // MULTIPLE payouts, so the special find erupts in loot.
  const rarity = def.rarity ? RARE_MOBS.tuning[def.rarity] : undefined;
  const tierBonus =
    (def.dropProfile?.tierBonus ?? 0) +
    (rarity?.tierBonus ?? 0) +
    mobLevelTierBonus(state) -
    evoTierPenalty;

  // The overkill toll: the whole per-kill drop chance scales by the killing
  // blow's efficiency, so a mob one-shot for triple its health surrenders a
  // third of its usual odds — the loot mirror of the xp rule in killEnemy.
  // A rare/unique mob multiplies the same chance by its `dropMult` (20×/100×
  // the rank and file) and pays it out in WHOLE payouts, tierDrops-style:
  // each full 1.0 of the product is a guaranteed run of the drop ladder and
  // the remainder the chance of one more, capped so LUCK stacking can't
  // carpet the field. The rng draw order for an ordinary mob is unchanged.
  const baseChance = (dropChance(state) + dropBonus) * efficiency;
  let payouts = 1;
  if (rarity) {
    const total = Math.min(
      baseChance * rarity.dropMult,
      RARE_MOBS.maxDropRolls,
    );
    payouts = Math.floor(total);
    if (state.rng() < total - payouts) payouts++;
    if (forced) payouts = Math.max(1, payouts);
    if (payouts === 0) return;
  } else if (!forced && state.rng() >= baseChance) {
    return;
  }

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
  const repairShare =
    LOOT.repairShare * BALANCE.repairDrops * (1 + repairBoost);
  // Each payout runs the ladder once. An ordinary mob pays exactly one (the
  // pre-restructure body verbatim); a rare/unique mob's burst loops, each
  // payout scattered around the corpse so the pile reads as separate finds.
  for (let payout = 0; payout < payouts; payout++) {
    const pos =
      payouts > 1
        ? {
            x: clamp(
              at.x + (state.rng() - 0.5) * 60,
              16,
              state.level.width - 16,
            ),
            y: clamp(
              at.y + (state.rng() - 0.5) * 60,
              16,
              state.level.height - 16,
            ),
          }
        : { ...at };
    // The pity rule only claims the FIRST payout of a burst.
    const forcedNow = forced && payout === 0;
    // The rare slice first, so tuning the ladder below never dilutes it. A
    // nuke's own kills skip it (`noNukeDrop`, short-circuited before the draw):
    // the blast that cleared the field can't hand back the bomb that caused it.
    // The ONE NUKE rule gates it too (`canDropNuke`): no second bomb rolls while
    // one already waits on screen or sits in the dock.
    const nuked =
      !forcedNow &&
      !noNukeDrop &&
      canDropNuke(state) &&
      state.rng() < LOOT.nukeShare;
    const roll = state.rng();
    if (nuked) {
      // Sweeps away any stale off-screen bomb before minting the fresh one.
      dropScreenNuke(state, pos);
      continue;
    }
    // Whatever falls past the ladder's tail (the arrow slice a hard rung trims
    // away) yields nothing — so guard the drop event on an item actually landing.
    const itemsBefore = state.items.length;
    if (forcedNow || roll < equipmentShare) {
      state.minionEquipmentDrops++;
      state.items.push({
        id: state.nextId++,
        kind: "equipment",
        pos,
        // A RARE/UNIQUE mob's payouts share the elite named-tier bonus and
        // skip the plain-minion penalty (see `rollTier`); plain trash rolls
        // named tiers at a fraction of the odds.
        equipment: rollEquipment(state, {
          tierBonus,
          mlvl,
          mobRarity: def.rarity,
        }),
      });
    } else if (roll < equipmentShare + abilityShare) {
      state.items.push({
        id: state.nextId++,
        kind: "ability",
        pos,
        defId: abilities[Math.floor(state.rng() * abilities.length)] as string,
      });
    } else if (roll < equipmentShare + abilityShare + medkitShare) {
      state.items.push({
        id: state.nextId++,
        kind: "medkit",
        pos,
        tier: rollMedkitTier(state),
      });
      // A medkit that fell because low health WIDENED its slice is a mercy rope,
      // not the ordinary rain — fly it in on the angel (a healthy hero's boost is
      // zero, so his medkits land the mundane way).
      if (medkitBoost > 0) flyInByAngel(state, pos);
    } else if (
      roll <
      equipmentShare + abilityShare + medkitShare + repairShare
    ) {
      state.items.push({ id: state.nextId++, kind: "repair", pos });
      // Likewise a repair kit widened in by a near-broken weapon (see repairBoost).
      if (repairBoost > 0) flyInByAngel(state, pos);
    } else if (
      roll <
      equipmentShare +
        abilityShare +
        medkitShare +
        repairShare +
        LOOT.drinkShare
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
  const loot = levelDef(state.level.id).loot;
  const ids = loot.worldUniques?.[state.difficulty];
  if (!ids || ids.length === 0) return;
  // The return-farm gate holds back only MINIONS: their trash relics stay shut
  // until the hero out-levels a first pass of the rung. ELITES and BOSSES drop
  // relics DURING the normal campaign (the explicit set-piece boost). Checked
  // BEFORE any rng draw, so a gated minion kill leaves the seeded stream
  // untouched — as do levels without a table (fixtures) and under-level runs.
  if (def.role === "minion") {
    const gate = WORLD_DROP.minPlayerLevel[state.difficulty];
    if (gate === undefined || state.player.level < gate) return;
  }
  // `namedDropMult` is the farm-venue sweetener: a dedicated grind venue (the
  // bunker) pays better per kill than the relics' home levels (default 1). It
  // lifts the global legendary/artifact roll too (see `rollTier`).
  const chance =
    WORLD_DROP.chanceByRole[def.role] *
    BALANCE.uniqueDrops *
    (loot.namedDropMult ?? 1);
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
    // Campaign-gated drop (the bunker key): stays latent until the run has the
    // required level cleared. A first pass reaches the Rift before Eastworld,
    // so the hand only drops on a post-campaign Rift replay.
    if (spec.requiresClear && !state.clearedLevels.includes(spec.requiresClear))
      continue;
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
  // The tier gate keys off the offset-stripped LOOT LEVEL, like every other
  // loot gate (the offset-strip: a difficulty's mobLevelOffset never decides
  // which tier a kill may pay — the hero's earned level does).
  const lootLevel = Math.max(
    1,
    mlvl - difficultyDef(state.difficulty).mobLevelOffset,
  );
  for (const [tier, chance] of Object.entries(loot.tierDrops ?? {}) as [
    Exclude<Tier, "regular">,
    number,
  ][]) {
    if (lootLevel < LOOT.tierUnlockMlvl[tier]) continue;
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
        // Elites/bosses get the set-piece rarity bonus AND are eligible to
        // fold a named unique into these random drops (see `rollTier`).
        role: def.role,
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
    state.items.push({
      id: state.nextId++,
      kind: "medkit",
      pos: scatter(),
      tier: rollMedkitTier(state),
    });
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
  // The PER-MAP SOFT CAP (config XP_CAP): every grant on this map diminishes as
  // the hero closes on the (level × difficulty) cap and, a couple of levels
  // past it, decays to the never-zero ~1/100 floor trickle, so re-running an
  // outgrown map farms loot and only crawls XP — no hard wall, just a glacial
  // pace. Applied at the same one door as the dev knob — kills, arrows, and
  // scripted awards all obey.
  amount = Math.round(
    amount *
      xpCapMultiplier(
        state.player.level,
        xpLevelCap(state.level.id, state.difficulty),
      ),
  );
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
    player.xpToNext = xpToLevelUp(player.level, state.difficulty);
    player.pendingStatPoints += statPointsAt(player.level);
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
