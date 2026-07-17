// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The autopilot: strategies that turn the live GameState into per-tick
// GameInput — the same hold-to-steer/tap-to-jump input a human produces, so
// a bot slots in anywhere a player does. Today it drives the headless engine
// tests and the app's `?bot=` autoplay mode (see the playtest skill); the
// same interface is the seed for an AI-controlled second player later.
//
// Bots are PURE consumers of the state: they never mutate it and never draw
// from state.rng, so a botted run is exactly as deterministic as a recorded
// human run with the same seed.

import { clamp, distance } from "@game/lib/vec.ts";
import type { Vec2 } from "@game/lib/vec.ts";
import { BUILD_ROTATION, STAT_BUILDS } from "./builds.ts";
import type { StatBuild } from "./builds.ts";
import { PLAYER } from "./config.ts";
import { nextPathWaypoint, onPathLevel, pathWalked } from "./path.ts";
import { blockedByObstacle, insideObstacle } from "./obstacles.ts";
import { enemyDef } from "./defs/enemies/index.ts";
import { levelDef } from "./defs/levels/index.ts";
import { weaponDef } from "./defs/equipment.ts";
import { spellDef } from "./defs/spells.ts";
import {
  bestMedkitTier,
  equipmentMaxDurability,
  heroSpellStat,
  isSpellAvailable,
  isWeaponBroken,
  REQ_STAT,
} from "./items.ts";
import type {
  Enemy,
  GameInput,
  GameState,
  Item,
  StatName,
  WeaponClass,
} from "./types.ts";

export type BotStrategy =
  | "idle"
  | "rush"
  | "kite"
  | "boss"
  | "survivor"
  // The three POSTURES — the horde-survival read at three aggression levels.
  // `balanced` is exactly the old `survivor` (kept as an alias); `aggro` trades
  // safety for kills (closes and holds tight, tolerates more bodies before it
  // punches out); `flee` trades kills for safety (holds far, disengages early,
  // widens the gap on every edge tick).
  | "aggro"
  | "flee"
  | "balanced";

/** Every strategy, for UIs and harnesses that validate a requested name. */
export const BOT_STRATEGIES: BotStrategy[] = [
  "idle",
  "rush",
  "kite",
  "boss",
  "survivor",
  "aggro",
  "flee",
  "balanced",
];

/** The three POSTURES a `simulate` matrix sweeps ("all strategies"): the
 * playstyle axis, orthogonal to the weapon-lane {@link BotProfile}. */
export const BOT_POSTURES: BotStrategy[] = ["aggro", "balanced", "flee"];

/**
 * A bot's COMBAT PROFILE: the stat-distribution build it spends level-up points
 * on, orthogonal to the positioning {@link BotStrategy}. A fixed {@link StatBuild}
 * (`melee`/`ranged`/`magic`) steers allocation into that weapon lane's
 * attributes so the stat-aware auto-equip (`weaponScore`) naturally prefers that
 * class of weapon — a `magic` bot ends up casting, a `melee` bot swinging —
 * without the bot ever touching equipment directly; `balanced` spreads the
 * points across every stat and lets the auto-equip pick emergently. `auto` (the
 * default) keeps the old emergent behavior: the lane is whichever class the hero
 * has invested the most in, falling back to the held weapon.
 */
export type BotProfile = StatBuild | "auto";

/** Every profile, for UIs and harnesses that validate a requested name. The
 * four fixed profiles are the {@link StatBuild} distributions; `auto` keeps the
 * emergent (whichever lane the hero has invested most in) behaviour. */
export const BOT_PROFILES: BotProfile[] = ["auto", ...STAT_BUILDS];

/**
 * A bot instance: the positioning `strategy` and the weapon-lane `profile`.
 * Per-bot memory (wander targets, reaction delays, a second player's
 * personality) hangs off this later.
 */
export type Bot = {
  strategy: BotStrategy;
  profile: BotProfile;
  /**
   * Anti-wedge memory for the {@link unstuckInput} stall detector. Mutated by
   * `botAct` each tick — it lives on the BOT, never on `GameState`, so a botted
   * run stays exactly as deterministic as a recorded human one (same seed +
   * fresh bot → same memory evolution). Lazily created on the first tick.
   */
  nav?: {
    /** Hero position at the last progress check. */
    lastPos: Vec2;
    /** `state.stats.timeMs` at the last progress check. */
    lastTimeMs: number;
    /** How long (ms) the hero has been all-but-frozen while unable to fight. */
    stuckMs: number;
    /** True while COMMITTED to the escape sweep — held (with hysteresis) until he
     * has physically moved clear of the wedge, so a full sweep can round a wall
     * instead of aborting the instant he twitches and flees back in. */
    escaping: boolean;
    /** `timeMs` the current escape began (drives which heading is swept). */
    escapeStartMs: number;
    /** Where the escape began — the exit baseline (moved far enough → free). */
    escapeStartPos: Vec2;
  };
};

export function createBot(
  strategy: BotStrategy,
  profile: BotProfile = "auto",
): Bot {
  return { strategy, profile };
}

/** "Local pack" radius the survivor reasons about (threat, escape, powerups). */
const THREAT_RADIUS = 320;
/** A foe this close is about to bite — hop to dodge its blow (airborne is
 * untouchable above JUMP.dodgeHeight, see step.ts). */
const CONTACT_DODGE_RADIUS = 46;
/** The standoff the survivor HOLDS from the nearest body — just beyond a foe's
 * ~34px grasp. He hugs the pack's edge at this range (not fleeing to the far
 * corner), so the auto-weapon keeps mowing the front line while he stays out of
 * reach. A melee loadout can't reach this far, so it holds at its own range
 * instead and gives ground on foot (it can't swing mid-air, so it doesn't hop
 * to dodge in the DPS phase — only to ESCAPE an encirclement). */
const GRASP_STANDOFF = 72;

/** How hard the intended-path heading biases the survivor's retreat bearing (a
 * fraction of the unit away-from-pack vector). High enough that backing off the
 * pack drifts the hero down the corridor toward the next waypoint, low enough
 * that dodging the horde still wins when the waypoint lies straight through it. */
const PATH_RETREAT_BIAS = 0.9;

/** On a path level, how close (world px) the hero must be to the boss to LOCK
 * onto it and fight it down rather than kite its adds — a boss-room-sized ring,
 * so he commits the moment he's in the arena even if a straggler waypoint went
 * untagged. */
const BOSS_LOCK_RANGE = 300;

/** A spawn point still owing mobs within this range keeps the hero CLEARING this
 * patch before the path lets him advance (the level's "clear the area, then move
 * on" contract) — so he levels up on the way instead of rushing under-levelled. */
const SPAWNER_CLEAR_RANGE = 540;
/** Enemies within this ring count toward being SURROUNDED. */
const SURROUND_RADIUS = 150;
/** This many foes packed inside SURROUND_RADIUS = punch out through the gap. */
const SURROUND_COUNT = 5;
/** Below this fraction of HP the survivor disengages — heal and break contact
 * rather than trade into a horde that can burst him down. */
const FLEE_HP_FRAC = 0.4;
/** Bots pop a medkit once health falls below this fraction of the bar. */
const HEAL_HP_FRAC = 0.55;
/** Top up stamina when the pool dips below this AND a threat is near — a winded
 * hero (empty pool) is capped to a jog and gets run down. */
const STAMINA_TOPUP_FRAC = 0.3;
/** Spend a powerup once this many foes are packed close — a nuke/stasis/storm
 * all pay off most against a crowd, so time them for the crowd. */
const POWERUP_PACK = 5;
/** …or once abilities pile up this deep, so a hoard never goes to waste. */
const POWERUP_HOARD = 2;
/** How far the escape steer aims down the openest lane. */
const ESCAPE_DISTANCE = 340;
/** How near a pickup must be to be worth a detour. */
const ITEM_REACH = 240;

/** The three survival POSTURES and how each weights safety against kills. The
 * `balanced` row reproduces the classic survivor exactly (the shared constants
 * above are its values), so a run tagged `survivor`/`balanced` is unchanged;
 * `aggro` and `flee` scale off those anchors. */
type Posture = "aggro" | "balanced" | "flee";
const POSTURE_TUNING: Record<
  Posture,
  {
    /** Scales the hold distance from the nearest body (>1 backs off further). */
    standoffMul: number;
    /** HP fraction below which the hero breaks contact to heal/reset. */
    fleeHp: number;
    /** Packed-foe count that (with encirclement) triggers a punch-out. */
    surround: number;
    /** How far along the open lane the hero drifts on a safe edge tick. */
    edgeDrift: number;
  }
> = {
  // Trades safety for kills: fights up close, tolerates a denser ring before it
  // bails, and on a safe edge presses the nearest foe instead of drifting out.
  aggro: { standoffMul: 0.65, fleeHp: 0.28, surround: 7, edgeDrift: 40 },
  // The classic survivor — the shared anchors, unchanged.
  balanced: {
    standoffMul: 1,
    fleeHp: FLEE_HP_FRAC,
    surround: SURROUND_COUNT,
    edgeDrift: 40,
  },
  // Trades kills for safety: holds well out of reach, disengages early, and
  // widens the gap hard on every edge tick.
  flee: { standoffMul: 1.7, fleeHp: 0.6, surround: 4, edgeDrift: 90 },
};

const idleInput = (): GameInput => ({
  steering: false,
  target: { x: 0, y: 0 },
  jump: false,
});

/** Decide this tick's input. Pure — reads the state, never mutates it. */
export function botAct(bot: Bot, state: GameState): GameInput {
  if (bot.strategy === "idle" || state.enemies.length === 0) {
    return idleInput();
  }
  const decided = ((): GameInput => {
    // With only untouchable apparitions left on the board there is no foe
    // to fight — push for the objective instead of chasing a hallucination.
    const foe = nearestEnemy(state);
    // DISARMED (the scripted opening strike hasn't put the weapon in his hand
    // yet): close on the nearest foe so the vanguard's contact fires the strike
    // and arms him. Path-marching off toward the objective would strand him
    // unarmed for the whole run — the weapon only comes from that first strike.
    if (state.player.disarmed) {
      return foe ? steer(state, foe.pos) : idleInput();
    }
    // LAST-RESORT UNSTUCK: if he's made no progress for a while and has nothing
    // he can reach to fight, the strategy has wedged him — override it with the
    // deterministic escape sweep until he's moving again. (Also keeps the
    // progress bookkeeping, so it must run before every strategy branch.)
    const escape = unstuckInput(bot, state);
    if (escape) return escape;
    // Dodge a telegraphed set-piece move (a rushing charge, a ground slam) the
    // instant one threatens — stepping off the line beats whatever the strategy
    // below would do, so the hero doesn't eat a boss's rush while planted on it.
    const dodge = dodgeTelegraph(state);
    if (dodge) return dodge;
    switch (bot.strategy) {
      case "rush":
        return foe ? steer(state, foe.pos) : pushBoss(state);
      case "kite": {
        if (!foe) return pushBoss(state);
        // Hold inside weapon range, outside the pack's grasp.
        const range = weaponDef(state.player.equipment.weapon.defId).range;
        return steer(state, holdOff(state, foe.pos, range * 0.7));
      }
      case "boss":
        return pushBoss(state);
      case "aggro":
        return survive(state, "aggro");
      case "flee":
        return survive(state, "flee");
      case "survivor":
      case "balanced":
        return survive(state, "balanced");
      default:
        return idleInput();
    }
  })();
  const player = state.player;
  // POWERUPS, timed for effect: spend when a crowd is packed close (a nuke,
  // stasis, or storm all pay off most against many bodies), or once abilities
  // pile up so a hoard never goes to waste. A slot still counting down a
  // running power isn't spendable, so gate on the BANKED (not-yet-running) ones.
  const running = player.abilities.filter((a) => a.slot !== undefined).length;
  const banked = player.heldAbilities.length - running;
  const packedClose = threatsWithin(state, SURROUND_RADIUS).length;
  decided.useItem =
    banked > 0 &&
    (packedClose >= POWERUP_PACK ||
      player.heldAbilities.length >= POWERUP_HOARD);
  // Heal below the threshold (biggest-heal-first — consumeMedkit no-ops at full
  // so a mistap is free). Refill stamina when the pool bottoms out, or dips low
  // with a threat near — a winded hero is capped to a jog and gets run down.
  decided.useMedkit =
    player.hp < player.maxHp * HEAL_HP_FRAC && bestMedkitTier(state) >= 0;
  const threatNear = threatsWithin(state, THREAT_RADIUS).length > 0;
  decided.useStaminaPotion =
    player.staminaPotions > 0 &&
    (player.stamina <= 0 ||
      (threatNear && player.stamina < player.maxStamina * STAMINA_TOPUP_FRAC));
  // Spend a repair kit once a weapon has actually broken out of the hand (a
  // durability-0 spare sits in the bag) or the held blade is nearly spent — it
  // mends the whole kit and restores the shed weapon (useRepairKit no-ops with
  // nothing to mend, so a mistap is free).
  decided.useRepairKit = player.repairKits > 0 && needsRepair(state);
  // CLASS play: drink a mana potion when the pool runs low, and fire the best
  // castable power at the fight — a heal when hurt, an AOE into a crowd, a bolt
  // at a lone foe, a buff under pressure, a ward/slow to control. Only a hero
  // with a CLASS (a dominant STR/DEX/INT that unlocks a spell list) casts. The
  // spell bar is filled by the harness/app; the bot reads it and stays pure
  // (input only, no state mutation).
  if (heroSpellStat(state) !== null) {
    decided.useManaPotion =
      player.manaPotions > 0 && player.mana < player.maxMana * MANA_TOPUP_FRAC;
    const slot = pickSpellToCast(state, threatNear);
    if (slot >= 0) {
      decided.castSpell = true;
      decided.castSpellIndex = slot;
    }
  }
  return decided;
}

/** Drink a mana potion once the pool dips below this fraction of its max. */
const MANA_TOPUP_FRAC = 0.25;

/**
 * The spell-bar slot the bot should cast this tick, or -1 for none. Scores each
 * castable slot (unlocked, off cooldown, affordable) by how well its school
 * fits the moment — a heal when hurt outranks everything, then an AOE into a
 * packed crowd, then a lone-target bolt, then a defensive ward/slow under
 * pressure — and returns the best. Pure: reads state only.
 */
function pickSpellToCast(state: GameState, threatNear: boolean): number {
  const p = state.player;
  const hurt = p.hp < p.maxHp * HEAL_HP_FRAC;
  const buffed = p.buffMs > 0;
  let best = -1;
  let bestScore = 0;
  for (let i = 0; i < p.spellSlots.length; i++) {
    const id = p.spellSlots[i];
    if (!id) continue;
    const def = spellDef(id);
    if (!isSpellAvailable(state, def)) continue;
    if ((p.spellCooldowns[id] ?? 0) > 0) continue;
    if (p.mana < def.manaCost) continue;
    const e = def.effect;
    // Only cast where the power would actually connect — an attack bolt needs a
    // foe in RANGE, an AOE/rain/slow needs a crowd in reach — so the bot never
    // spams a whiffing cast (a wasted nova, a targetless fizzle).
    let score = 0;
    if (e.kind === "heal") score = hurt ? 5 : 0;
    else if (e.kind === "nova") {
      const n = foesWithin(state, e.radius);
      score = n >= 2 ? 4 : n >= 1 ? 2 : 0;
    } else if (e.kind === "rain") {
      const n = foesWithin(state, e.castRange);
      score = n >= 2 ? 4 : n >= 1 ? 2 : 0;
    } else if (e.kind === "bolt")
      score = foesWithin(state, e.range) >= 1 ? 3 : 0;
    else if (e.kind === "slow")
      score = foesWithin(state, e.radius) >= 3 ? 3 : 0;
    else if (e.kind === "shield") score = hurt || threatNear ? 2 : 0;
    // A self-buff: pop it when there's a fight on and one isn't already running,
    // so the amp isn't wasted on an empty field or double-cast.
    else if (e.kind === "buff")
      score = !buffed && foesWithin(state, 260) >= 1 ? 3 : 0;
    if (score > bestScore) {
      bestScore = score;
      best = i;
    }
  }
  return best;
}

/** Count of live, targetable foes within `radius` of the hero (bot heuristics). */
function foesWithin(state: GameState, radius: number): number {
  let n = 0;
  for (const enemy of state.enemies) {
    if (enemyDef(enemy.defId).apparition) continue;
    if (distance(state.player.pos, enemy.pos) <= radius) n++;
  }
  return n;
}

/** Below this fraction of its max durability the held weapon is "nearly spent"
 * — worth a repair before it breaks mid-fight. */
const REPAIR_DURABILITY_FRAC = 0.2;

/** Is there anything a repair kit would meaningfully mend right now — a broken
 * weapon shed into the bag, or a held weapon worn down near breaking? */
function needsRepair(state: GameState): boolean {
  const bagBroken = state.player.inventory.some(
    (cell) => cell !== null && isWeaponBroken(cell),
  );
  if (bagBroken) return true;
  const weapon = state.player.equipment.weapon;
  if (weapon.durability === undefined) return false; // unbreakable sidearm
  const max = equipmentMaxDurability(weapon);
  return max > 0 && weapon.durability <= max * REPAIR_DURABILITY_FRAC;
}

/**
 * Which stat the bot spends its next point on. The rotation each build walks —
 * the lane-biased builds and the balanced spread — lives in the shared
 * {@link BUILD_ROTATION} catalog (src/game/builds.ts), so the autopilot and the
 * analytic paper sim spend points the same way from one definition. A fixed
 * profile (`melee`/`ranged`/`magic`/`balanced`) walks that build's rotation
 * outright; `auto` walks the EMERGENT lane's rotation (see {@link botLane}).
 *
 * Keyed off total points already spent (not the level), so each individual
 * point rotates through the cycle rather than a whole level-up dumping into one
 * stat. Called whenever `pendingStatPoints > 0`.
 */
export function botAllocate(bot: Bot, state: GameState): StatName {
  const build =
    bot.profile === "auto"
      ? BUILD_ROTATION[botLane(state)]
      : BUILD_ROTATION[bot.profile];
  const spent = Object.values(state.player.spentStats).reduce(
    (a, b) => a + b,
    0,
  );
  return build[spent % build.length]!;
}

/**
 * The weapon class the EMERGENT (`auto`) profile has committed to: the class
 * whose REQUIRED attribute the hero has poured the most CHOSEN points into, with
 * a tie (a brand-new hero with nothing invested included) falling back to the
 * class of the weapon in hand — so the first allocations follow the difficulty's
 * starter and every one after reinforces the deepest lane. The fixed profiles
 * (`melee`/`ranged`/`magic`/`balanced`) bypass this and index
 * {@link BUILD_ROTATION} directly, so the whole build — stat allocation, and
 * through the stat-aware auto-equip the weapon itself — bends that way from
 * level 1.
 */
function botLane(state: GameState): WeaponClass {
  const stats = state.player.stats;
  const held = weaponDef(state.player.equipment.weapon.defId).class;
  let lane = held;
  let best = stats[REQ_STAT[held]];
  for (const c of ["melee", "ranged", "magic"] as const) {
    if (stats[REQ_STAT[c]] > best) {
      best = stats[REQ_STAT[c]];
      lane = c;
    }
  }
  return lane;
}

// ---- Strategy bodies -------------------------------------------------------

/**
 * Beeline for the boss (or his landmark), then hold at the equipped weapon's
 * reach and fight him from there. Deriving the hold distance from the weapon
 * (rather than a fixed 180) is what lets a MELEE loadout — the default crude
 * sword included — actually close to swinging range instead of kiting a boss
 * it can never touch; a ranged loadout still keeps its distance.
 */
function pushBoss(state: GameState, jumpTravel = false): GameInput {
  const jump = jumpTravel && state.player.z === 0;
  // Follow the level's intended path first: steer STRAIGHT to the next waypoint
  // (no weapon-range hold-off — a waypoint is a travel node to walk onto, not a
  // foe to fight) so the runner rounds the walls instead of beelining the boss
  // through them. `advancePath` retires each node as he reaches it; once the
  // path is walked, `nextPathWaypoint` is null and he closes on the boss below.
  const waypoint = travelWaypoint(state);
  if (waypoint) return navSteer(state, waypoint, jump);
  const boss = state.enemies.find((e) => enemyDef(e.defId).role === "boss");
  const target = boss?.pos ?? furthestLandmark(state);
  if (!target) return idleInput();
  const d = distance(state.player.pos, target);
  const hold = weaponDef(state.player.equipment.weapon.defId).range * 0.7;
  if (d > hold + 60) return navSteer(state, target, jump);
  return steer(state, holdOff(state, target, hold), jump);
}

/**
 * Competent horde survival — the read the JESUS floors actually need. In
 * priority order:
 *   1. Nothing near → scoop a nearby pickup, else push the objective.
 *   2. Bleeding or hemmed in (low HP, or a pack pressing close) → BREAK CONTACT:
 *      punch down the openest lane out of the crowd while HOPPING the whole way,
 *      so the untouchable airborne frames carry him clean over the bodies.
 *   3. Otherwise HUG THE PACK'S EDGE: hold just outside the nearest body's grasp
 *      so the auto-weapon mows the front line while he stays out of reach —
 *      orbiting the edge, backing off exactly as the pack closes, NOT fleeing to
 *      the far corner (a ranged loadout holds at the grasp standoff; a melee one
 *      holds at its own range and leans on the hop).
 * Advancing on the boss is folded into the edge-hug: when the field near the
 * hero is thin he drifts toward the objective, so he clears without ever
 * standing still in the flood.
 */
function survive(state: GameState, posture: Posture): GameInput {
  const player = state.player;
  const tune = POSTURE_TUNING[posture];
  const near = threatsWithin(state, THREAT_RADIUS);

  // A spawn point still owing mobs nearby means this patch ISN'T cleared yet —
  // the hero holds and drains it before the path lets him move on (the "stick
  // around until no spawn points in aggro range" clear rule), so he levels up on
  // the way instead of rushing to the boss under-levelled. Null on wave levels.
  const spawner = activeSpawnerNear(state);

  // 1. Breathing room: grab a pickup within reach; else, if a spawn point here
  //    is still emitting, close on it to trip/drain the rest; else advance.
  if (near.length === 0) {
    const item = nearestItem(state);
    if (item && distance(player.pos, item.pos) < ITEM_REACH) {
      return steer(state, item.pos);
    }
    if (spawner) return navSteer(state, spawner, true);
    return pushBoss(state, true);
  }

  const grounded = player.z === 0;
  const nearest = near[0]!; // threatsWithin returns nearest-first
  const nearestD = distance(player.pos, nearest.pos);

  // 2. Emergency — only when there's no clean way to just back off: low on HP,
  //    or ENCIRCLED (a tight pack AND the retreat lane behind him is blocked, so
  //    edge-hugging can't open the gap). Then punch out, HOPPING THE WHOLE WAY:
  //    every airborne frame above JUMP.dodgeHeight is untouchable, so continuous
  //    jumps carry the hero clean OVER the bodies to open ground. A dense pack
  //    on ONE side isn't an emergency — that's the edge he hugs (step 3). The
  //    posture sets the trip wires: `flee` bails early and at a looser ring,
  //    `aggro` holds on through a low bar and a denser ring.
  const packed = near.filter(
    (e) => distance(e.pos, player.pos) < SURROUND_RADIUS,
  );
  const lowHp = player.hp < player.maxHp * tune.fleeHp;
  // BOSS LOCK. On a path level, once the boss is awake, the whole route is
  // walked, or the hero has closed to within `BOSS_LOCK_RANGE`, lock onto the
  // BOSS and fight it down. Deliberately the boss ONLY — the elites along the
  // way are marched PAST (they are optional; stopping to finish each one bogs
  // the hero in the wave grind and he never reaches the boss). Committing is
  // safe: the horde crawls during a set-piece fight (`mobPursuitNearElite`, 10%
  // on easy), so he can plant and DPS rather than kite.
  const bossEnemy = state.enemies.find(
    (e) => enemyDef(e.defId).role === "boss",
  );
  const lockTarget =
    onPathLevel(state) &&
    bossEnemy !== undefined &&
    (bossEnemy.awake === true ||
      pathWalked(state) ||
      distance(player.pos, bossEnemy.pos) < BOSS_LOCK_RANGE)
      ? bossEnemy
      : undefined;
  // Emergency bail: low on HP (heal), or ENCIRCLED with no clean lane out. A
  // hero locked on the boss does NOT bail on encirclement — the crawling horde
  // always rings him, so fleeing every ring would forfeit the kill; he holds and
  // only breaks to HEAL when actually bleeding, then re-commits.
  if (
    lowHp ||
    (!lockTarget &&
      packed.length >= tune.surround &&
      isEncircled(state, packed))
  ) {
    // A medkit within reach is worth the detour when we're bleeding.
    if (lowHp) {
      const item = nearestItem(state);
      if (
        item &&
        item.kind === "medkit" &&
        distance(player.pos, item.pos) < ITEM_REACH
      ) {
        return steer(state, item.pos, grounded);
      }
    }
    return navSteer(state, bestEscapeTarget(state, near), grounded);
  }

  // 2.4. Fight the locked set piece down — hold at weapon range and press it,
  //    hopping through contact with a ranged loadout — instead of kiting past.
  if (lockTarget) {
    const w = weaponDef(player.equipment.weapon.defId);
    const lockHop =
      w.projectile !== undefined && grounded && nearestD < CONTACT_DODGE_RADIUS;
    return steer(state, holdOff(state, lockTarget.pos, w.range * 0.7), lockHop);
  }

  // 2.5. MARCH THE INTENDED PATH — but NOT while a spawn point here is still
  //    owing mobs (`spawner`): the hero holds and clears this patch first, so he
  //    levels on the way rather than rushing to the boss under-levelled. With the
  //    patch clear (or on a wave level), push toward the next waypoint and let
  //    the auto-weapon carve through the front line instead of standing to trade
  //    blows with the endless wave (a walled level never clears from a
  //    standstill). A ranged/magic loadout HOPS through contact; a melee one
  //    marches on foot so it can keep swinging. Falls through to the edge-hug
  //    once the path is walked or on a level that authors none.
  const marchTo = spawner ? null : travelWaypoint(state);
  if (marchTo) {
    const canHop =
      weaponDef(player.equipment.weapon.defId).projectile !== undefined;
    const hopMarch = canHop && grounded && nearestD < CONTACT_DODGE_RADIUS;
    return navSteer(state, marchTo, hopMarch);
  }

  // 3. HUG THE PACK'S EDGE. Stay just outside the nearest body's grasp so the
  //    auto-weapon mows the front line while the hero keeps out of reach —
  //    orbiting the edge, backing off toward the OPEN side (away from the pack's
  //    mass), not fleeing to the far corner. `away` points away from the local
  //    pack, closeness-weighted so the nearest bodies set the bearing and a gap
  //    in the ring pulls him toward it. Pressed (a foe inside the standoff) →
  //    give ground hard; safe on the edge → drift out just enough to hold the
  //    gap; field thin → close on the boss to finish the map. A melee loadout
  //    can't reach the grasp standoff, so it holds at its own range; a RANGED
  //    hero hops the contact away (it fires from the air), but a melee hero
  //    can't swing mid-air, so it gives ground on foot instead of hopping.
  const weapon = weaponDef(player.equipment.weapon.defId);
  const range = weapon.range;
  const baseStandoff =
    range >= GRASP_STANDOFF ? GRASP_STANDOFF : Math.max(40, range * 0.9);
  // The posture scales the hold: `flee` backs off well beyond grasp, `aggro`
  // hugs in tight so the front line stays in weapon reach.
  const standoff = baseStandoff * tune.standoffMul;
  const away = awayFromPack(state, near, waypointHeading(state));
  // A melee hero can't swing mid-air — the blade is stayed above
  // JUMP.dodgeHeight (see stepWeapon) — so hopping to dodge contact in the
  // DPS-hugging phase would only forfeit his swings; he gives ground on FOOT
  // instead. Ranged/magic fire from the air, so they still hop the bite away —
  // and `flee` hops at the first sign of a body, milking the untouchable frames.
  const canHopAndFight = weapon.projectile !== undefined;
  const hop =
    canHopAndFight &&
    grounded &&
    (nearestD < CONTACT_DODGE_RADIUS ||
      packed.length >= 3 ||
      (posture === "flee" && near.length > 0));
  if (nearestD < standoff) {
    // Pressed inside the standoff → give ground toward the open side, fast.
    return steer(
      state,
      { x: player.pos.x + away.x * 150, y: player.pos.y + away.y * 150 },
      hop,
    );
  }
  if (packed.length <= 1) {
    // Field near him is thin → advance the map. Follow the intended path when
    // there's a waypoint left (steer straight onto it, so the drift-while-
    // fighting still rounds the walls); otherwise close on the boss, stopping at
    // the posture's standoff (aggro presses closest, flee farthest).
    const waypoint = travelWaypoint(state);
    return waypoint
      ? navSteer(state, waypoint, hop)
      : steer(
          state,
          holdOff(state, bossPos(state) ?? nearest.pos, standoff),
          hop,
        );
  }
  if (posture === "aggro") {
    // Keep the pressure on — hold at fighting range of the nearest body rather
    // than drifting off the pack, so the auto-weapon never falls idle.
    return steer(state, holdOff(state, nearest.pos, standoff), hop);
  }
  // Safe on the edge → drift out along the open lane to keep the gap open as the
  // pack chases (flee widens it hard; balanced just holds it).
  return steer(
    state,
    {
      x: player.pos.x + away.x * tune.edgeDrift,
      y: player.pos.y + away.y * tune.edgeDrift,
    },
    hop,
  );
}

/**
 * A dodge input when a set-piece's TELEGRAPHED move (mechanics.ts) is about to
 * land on the hero — else null. Every dangerous move roots the mob for a
 * readable windup, so a competent player (and the bot) reads it and gets clear:
 *   • SLAM — an AoE around the mob: step straight out of its `radius` ring.
 *   • CHARGE — a dash down a locked bearing at the hero: sidestep PERPENDICULAR
 *     off the dash line (handled during the windup AND while the dash is in
 *     flight). Standing planted on a rushing boss and eating the hit is what
 *     kept the finisher from ever landing. Highest priority in `botAct`.
 */
function dodgeTelegraph(state: GameState): GameInput | null {
  const player = state.player;
  const grounded = player.z === 0;
  for (const e of state.enemies) {
    const mech = e.mech;
    if (!mech) continue;
    const def = enemyDef(e.defId);
    const slamR = def.mechanics?.slam?.radius;
    if (mech.telegraph?.kind === "slam" && slamR !== undefined) {
      const dx = player.pos.x - e.pos.x;
      const dy = player.pos.y - e.pos.y;
      const d = Math.hypot(dx, dy) || 1;
      if (d < slamR + 28) {
        return steer(
          state,
          {
            x: player.pos.x + (dx / d) * 140,
            y: player.pos.y + (dy / d) * 140,
          },
          grounded,
        );
      }
    }
    // A charge's locked bearing — from the windup telegraph, or the live dash.
    const dir =
      mech.telegraph?.kind === "charge"
        ? mech.telegraph.dir
        : mech.dashMs && mech.dashMs > 0
          ? mech.dashDir
          : undefined;
    if (dir) {
      const tx = player.pos.x - e.pos.x;
      const ty = player.pos.y - e.pos.y;
      const along = tx * dir.x + ty * dir.y; // hero's projection onto the dash
      if (along > -20) {
        const perpX = tx - dir.x * along;
        const perpY = ty - dir.y * along;
        if (Math.hypot(perpX, perpY) < 46) {
          // On the dash line — step to whichever side he's already leaning.
          let px = -dir.y;
          let py = dir.x;
          if (perpX * px + perpY * py < 0) {
            px = -px;
            py = -py;
          }
          return steer(
            state,
            { x: player.pos.x + px * 150, y: player.pos.y + py * 150 },
            grounded,
          );
        }
      }
    }
  }
  return null;
}

/** A unit vector pointing away from the local pack, weighted so the NEAREST
 * bodies dominate the bearing (and a gap in a ring pulls the hero toward it).
 * When `prefer` is given (a unit heading toward the intended-path waypoint) the
 * retreat is BIASED toward it, so backing off the pack also walks the hero down
 * the corridor — yet `away` stays dominant, so a waypoint that lies through the
 * pack never drags him INTO it. */
function awayFromPack(
  state: GameState,
  near: Enemy[],
  prefer?: Vec2 | null,
): Vec2 {
  const pos = state.player.pos;
  let ax = 0;
  let ay = 0;
  for (const e of near) {
    const dx = pos.x - e.pos.x;
    const dy = pos.y - e.pos.y;
    const d = Math.hypot(dx, dy) || 1;
    ax += dx / (d * d); // 1/d direction × 1/d weight = nearer foes weigh more
    ay += dy / (d * d);
  }
  const m = Math.hypot(ax, ay);
  const away = m < 1e-6 ? (prefer ?? { x: 1, y: 0 }) : { x: ax / m, y: ay / m };
  if (!prefer) return away;
  const bx = away.x + prefer.x * PATH_RETREAT_BIAS;
  const by = away.y + prefer.y * PATH_RETREAT_BIAS;
  const bm = Math.hypot(bx, by) || 1;
  return { x: bx / bm, y: by / bm };
}

/** A unit heading from the hero toward the next intended-path waypoint, or null
 * when the level has no path (or the hero has walked it all). */
function waypointHeading(state: GameState): Vec2 | null {
  const wp = nextPathWaypoint(state);
  if (!wp) return null;
  const dx = wp.x - state.player.pos.x;
  const dy = wp.y - state.player.pos.y;
  const d = Math.hypot(dx, dy) || 1;
  return { x: dx / d, y: dy / d };
}

/** Non-apparition enemies within `radius`, nearest first. */
function threatsWithin(state: GameState, radius: number): Enemy[] {
  return state.enemies
    .filter(
      (e) =>
        !enemyDef(e.defId).apparition &&
        distance(e.pos, state.player.pos) < radius,
    )
    .sort(
      (a, b) =>
        distance(a.pos, state.player.pos) - distance(b.pos, state.player.pos),
    );
}

/** The current boss's position, if one is on the field. */
function bossPos(state: GameState): Vec2 | undefined {
  return state.enemies.find((e) => enemyDef(e.defId).role === "boss")?.pos;
}

/** The anchor of the nearest spawn point that still owes mobs (dormant or
 * mid-drip) within `SPAWNER_CLEAR_RANGE` of the hero, or null — the patch the
 * bot holds and clears before the path lets it advance. Null on levels that
 * author no spawners (inherently gating this behavior to spawner levels). */
function activeSpawnerNear(state: GameState): Vec2 | null {
  let best: Vec2 | null = null;
  let bestD = SPAWNER_CLEAR_RANGE;
  for (const spawner of state.spawners) {
    // Only a point that is ACTIVELY emitting holds the hero — a dormant one
    // lying ahead must not, or the next point would always pin him short of it
    // and he would never advance. It arms (→ active) as he walks into range,
    // and once it has emitted its queue (→ drained) he moves on, mopping up the
    // chasers as he goes.
    if (spawner.status !== "active" || spawner.queue.length === 0) continue;
    const d = distance(state.player.pos, spawner.at);
    if (d < bestD) {
      best = spawner.at;
      bestD = d;
    }
  }
  return best;
}

/**
 * True when simply backing off the pack won't open a gap — foes hem the hero in
 * on the RETREAT side too (behind the direction away from the pack's centroid),
 * so he must punch through rather than hug the edge. A dense pack on ONE side
 * only is NOT encircled: he can just back off along the open lane.
 */
function isEncircled(state: GameState, packed: Enemy[]): boolean {
  const pos = state.player.pos;
  const cx = packed.reduce((s, e) => s + e.pos.x, 0) / packed.length;
  const cy = packed.reduce((s, e) => s + e.pos.y, 0) / packed.length;
  let rx = pos.x - cx;
  let ry = pos.y - cy;
  const rd = Math.hypot(rx, ry);
  if (rd < 1) return true; // centroid on top of him → bodies all around
  rx /= rd;
  ry /= rd;
  // A packed foe within ~60° of the retreat direction blocks the way out.
  return packed.some((e) => {
    const ex = e.pos.x - pos.x;
    const ey = e.pos.y - pos.y;
    const d = Math.hypot(ex, ey) || 1;
    return (ex / d) * rx + (ey / d) * ry > 0.5;
  });
}

/**
 * Trace the best path OUT of a pack: sample directions around the hero and pick
 * the openest — the one with the least enemy pressure ahead and clear ground to
 * run into. Closer and more head-on foes weigh heavier; a lane that runs into a
 * wall or off the map is penalised, so the hero punches through the gap in the
 * ring instead of backing himself into a corner. Deterministic (fixed sample).
 */
function bestEscapeTarget(state: GameState, near: Enemy[]): Vec2 {
  const pos = state.player.pos;
  const SAMPLES = 16;
  let best = { x: pos.x, y: pos.y };
  let bestScore = Infinity;
  for (let i = 0; i < SAMPLES; i++) {
    const angle = (i / SAMPLES) * Math.PI * 2;
    const dir = { x: Math.cos(angle), y: Math.sin(angle) };
    let score = 0;
    for (const e of near) {
      const ex = e.pos.x - pos.x;
      const ey = e.pos.y - pos.y;
      const d = Math.hypot(ex, ey) || 1;
      // How much this foe blocks THIS lane: 1 dead ahead, 0 to the side/behind.
      const ahead = (ex / d) * dir.x + (ey / d) * dir.y;
      if (ahead <= 0) continue; // a foe behind us doesn't block the way ahead
      score += (ahead * ahead * THREAT_RADIUS) / d; // nearer + more head-on = worse
    }
    // Penalise a lane that runs into the level edge — no room to flee there.
    const tx = pos.x + dir.x * ESCAPE_DISTANCE;
    const ty = pos.y + dir.y * ESCAPE_DISTANCE;
    const margin = Math.min(
      tx,
      state.level.width - tx,
      ty,
      state.level.height - ty,
    );
    if (margin < 0)
      score += 1000; // off the map
    else if (margin < 80) score += (80 - margin) * 4; // hugging a wall
    if (score < bestScore) {
      bestScore = score;
      best = { x: tx, y: ty };
    }
  }
  return best;
}

// ---- Geometry helpers ------------------------------------------------------

/** Steering input toward a world position (clamped inside the level). */
function steer(state: GameState, target: Vec2, jump = false): GameInput {
  return {
    steering: true,
    target: {
      x: clamp(target.x, 20, state.level.width - 20),
      y: clamp(target.y, 20, state.level.height - 20),
    },
    jump,
  };
}

/** How far ahead the wall-avoidance probe casts a candidate heading. */
const NAV_LOOKAHEAD = 140;
/** Candidate heading deflections (radians) fanned out from the straight bearing,
 * nearest-to-straight first so the hero deflects as little as the wall demands. */
const NAV_DEFLECTIONS = [
  0,
  0.6,
  -0.6,
  1.15,
  -1.15,
  1.7,
  -1.7,
  2.3,
  -2.3,
  Math.PI,
];

/**
 * A no-pathfinding runner's LOCAL wall avoidance: turn a raw nav goal into a
 * steering sub-target the hero can actually walk to without wedging on a shelf.
 * If his body can sweep straight to the goal, aim straight; otherwise fan
 * candidate headings out from the direct bearing and pick the openest one that
 * still makes progress — so a shelf between him and the next waypoint gets
 * ROUNDED instead of pressed into. This is what unsticks a hero the horde has
 * shoved off the corridor into a wall pocket (straight-line steering there just
 * grinds him into the wall forever). Only for TRAVEL goals (path/boss/escape),
 * never for the fight hold-offs. Falls back to the raw goal when nothing is
 * clear (better to nudge than freeze).
 */
function navTarget(state: GameState, goal: Vec2): Vec2 {
  // Wall avoidance is a MAZE tactic — it's for the authored-path levels whose
  // corridors a straight steer would wedge on. On an open map (no path) the
  // engine's wall-slide already carries a straight steer past the odd ridge, and
  // deflecting there only wanders, so keep the old behaviour.
  if (!onPathLevel(state)) return goal;
  const from = state.player.pos;
  const r = PLAYER.radius;
  // A clear body-width sweep straight to the goal → just go.
  if (!blockedByObstacle(state, from, goal, r)) return goal;
  const dx = goal.x - from.x;
  const dy = goal.y - from.y;
  const dist = Math.hypot(dx, dy) || 1;
  const probe = Math.min(dist, NAV_LOOKAHEAD);
  const base = Math.atan2(dy, dx);
  let best: Vec2 | null = null;
  let bestScore = -Infinity;
  for (const off of NAV_DEFLECTIONS) {
    const a = base + off;
    const p = {
      x: clamp(from.x + Math.cos(a) * probe, 20, state.level.width - 20),
      y: clamp(from.y + Math.sin(a) * probe, 20, state.level.height - 20),
    };
    if (insideObstacle(state, p, r)) continue;
    if (blockedByObstacle(state, from, p, r)) continue;
    // Prefer a step that (a) can then SEE the goal (rounds the corner) and (b)
    // ends closer to it, penalising a bigger turn so we deflect minimally.
    const nd = Math.hypot(goal.x - p.x, goal.y - p.y);
    const sees = blockedByObstacle(state, p, goal, r) ? 0 : 1000;
    const score = sees - nd - Math.abs(off) * 40;
    if (score > bestScore) {
      bestScore = score;
      best = p;
    }
  }
  return best ?? goal;
}

/** Steer toward a TRAVEL goal with local wall avoidance (see {@link navTarget}) —
 * the movement equivalent of {@link steer} for path/boss/escape headings. */
function navSteer(state: GameState, goal: Vec2, jump = false): GameInput {
  return steer(state, navTarget(state, goal), jump);
}

/**
 * The travel waypoint the survivor heads for — a corridor-aware upgrade of
 * {@link nextPathWaypoint} that keeps a no-pathfinding runner ON the authored
 * route. Normally it STRING-PULLS forward: the furthest-ahead node the hero can
 * currently SEE (walls naturally cap that to his straightaway, so he never skips
 * an uncleared aisle), so a slightly-off drift still cuts the corner cleanly.
 * When the horde has shoved him clean off the corridor with NO node in sight, it
 * aims for the NEAREST node to climb back on (navTarget then deflects him around
 * the wall), which is what breaks a wall-pocket wedge. Null when no path / walked.
 */
function travelWaypoint(state: GameState): Vec2 | null {
  const wp = nextPathWaypoint(state);
  if (!wp) return null;
  const path = levelDef(state.level.id).path;
  if (!path || path.length === 0) return wp;
  const from = state.player.pos;
  const r = PLAYER.radius;
  // Furthest visible node at/after current progress → head straight for it.
  for (let i = path.length - 1; i >= state.pathIndex; i--) {
    if (!blockedByObstacle(state, from, path[i] as Vec2, r))
      return path[i] as Vec2;
  }
  // Nothing ahead in sight (shoved into a pocket) → nearest node, to rejoin.
  let best = wp;
  let bestD = Infinity;
  for (const node of path) {
    const d = distance(from, node);
    if (d < bestD) {
      bestD = d;
      best = node;
    }
  }
  return best;
}

// === ANTI-WEDGE UNSTUCK ===
// A deterministic escape hatch for the LAST-RESORT wedge the smart nav can't
// think its way out of: the hero pinned in a concave wall pocket, or locked in
// perpetual flee at low HP with no medkit and nothing he can reach to fight, or
// oscillating on the spot. When he has made no PROGRESS for a while AND has no
// foe he could actually hit, the strategy has clearly failed — so we override it
// with a blind, deterministic sweep: drive a fixed heading for a burst, and if
// still stuck rotate the heading (goalward first, then fanning ± around it, out
// to a full circle). One of those headings is always open (short of being walled
// in on all sides), so this dislodges him from anything and hands control back
// to the normal nav the instant he's moving again.

/** Re-measure movement on this cadence (ms) — coarser than a tick so per-frame
 * jitter doesn't read as movement. */
const UNSTUCK_CHECK_MS = 400;
/** Physically moving less than this (world px) over a check window counts as
 * FROZEN. A full-speed hero clears far more per window, so only a genuine pin
 * (wall pocket, flee-lock at low HP with nothing reachable) trips it. */
const UNSTUCK_MIN_DISP = 34;
/** Frozen this long (with nothing to fight) → last-resort escape sweep. Kept
 * long so the escape is RARE — the smart nav owns ordinary threading; this only
 * breaks a true wedge the strategy can't think its way out of. */
const UNSTUCK_TRIGGER_MS = 2400;
/** Hold each swept heading this long before rotating to the next. */
const UNSTUCK_BURST_MS = 600;
/** How far ahead the escape steer aims along the swept heading. */
const UNSTUCK_REACH = 240;
/** Once escaping, keep committing until the hero has physically moved THIS far
 * from where the wedge began — the hysteresis that lets a full sweep round a
 * wall instead of aborting the instant he twitches and the flee drags him back. */
const UNSTUCK_EXIT_DIST = 160;

/** Is there a foe the hero could actually strike right now — in weapon range with
 * a clear line? While there is, standing still is FIGHTING, not being wedged, so
 * the stall detector holds off (a boss/pack brawl never trips the unstuck). */
function hasReachableFoe(state: GameState): boolean {
  const range = weaponDef(state.player.equipment.weapon.defId).range;
  const r = PLAYER.radius;
  for (const enemy of state.enemies) {
    if (enemyDef(enemy.defId).apparition) continue;
    if (distance(state.player.pos, enemy.pos) > range) continue;
    if (!blockedByObstacle(state, state.player.pos, enemy.pos, r)) return true;
  }
  return false;
}

/**
 * The deterministic anti-wedge override (see the block comment above), or null
 * when the hero is making progress or legitimately fighting. Also OWNS the
 * progress bookkeeping on `bot.nav`, so it must run every tick. Deterministic:
 * the swept heading is a pure function of how long he's been stuck and where the
 * objective lies — no RNG, no wall clock.
 */
function unstuckInput(bot: Bot, state: GameState): GameInput | null {
  // Same as the wall avoidance: the deterministic escape is a MAZE last-resort
  // (path levels). Open maps never wedged the old bot, so leave them untouched.
  if (!onPathLevel(state)) return null;
  const p = state.player.pos;
  const now = state.stats.timeMs;
  if (!bot.nav) {
    bot.nav = {
      lastPos: { x: p.x, y: p.y },
      lastTimeMs: now,
      stuckMs: 0,
      escaping: false,
      escapeStartMs: 0,
      escapeStartPos: { x: p.x, y: p.y },
    };
    return null;
  }
  const nav = bot.nav;
  const elapsed = now - nav.lastTimeMs;
  if (elapsed >= UNSTUCK_CHECK_MS) {
    // FROZEN = barely moved this window AND nothing he could reach to fight (a
    // patch brawl legitimately holds him in place, so it never reads as wedged).
    const moved = distance(p, nav.lastPos);
    if (moved >= UNSTUCK_MIN_DISP || hasReachableFoe(state)) nav.stuckMs = 0;
    else nav.stuckMs += elapsed;
    nav.lastPos = { x: p.x, y: p.y };
    nav.lastTimeMs = now;
  }

  // Enter the escape only once genuinely frozen; stay committed (hysteresis)
  // until he's physically clear of the wedge, so a full sweep can round a wall
  // instead of aborting the moment he twitches and the flee drags him back in.
  if (!nav.escaping) {
    if (nav.stuckMs < UNSTUCK_TRIGGER_MS) return null;
    nav.escaping = true;
    nav.escapeStartMs = now;
    nav.escapeStartPos = { x: p.x, y: p.y };
  } else if (
    hasReachableFoe(state) ||
    distance(p, nav.escapeStartPos) >= UNSTUCK_EXIT_DIST
  ) {
    // Moved clear of the wedge, or reached something to fight → hand back.
    nav.escaping = false;
    nav.stuckMs = 0;
    return null;
  }

  // The travel goal orients the escape sweep (goalward heading first).
  const goal =
    travelWaypoint(state) ?? bossPos(state) ?? furthestLandmark(state);

  // Sweep a heading that rotates as the escape persists: goalward first, then ±
  // around it (±45, ±90, ±135), out to a full turn — deterministic, so a botted
  // run stays reproducible. A full turn without breaking free just keeps sweeping.
  const phase = Math.floor((now - nav.escapeStartMs) / UNSTUCK_BURST_MS) % 8;
  const heading = goal ?? { ...state.playerSpawn };
  const base = Math.atan2(heading.y - p.y, heading.x - p.x);
  const step = Math.ceil(phase / 2) * (Math.PI / 4);
  const angle = base + (phase % 2 === 0 ? step : -step);
  const target = {
    x: p.x + Math.cos(angle) * UNSTUCK_REACH,
    y: p.y + Math.sin(angle) * UNSTUCK_REACH,
  };
  // Hop along the way: airborne clears low hop-obstacles and buys untouchable
  // frames if the wedge was a body pinning him.
  return steer(state, target, state.player.z === 0);
}

/** The point `dist` away from `from`, on the player's side of it. */
function holdOff(state: GameState, from: Vec2, dist: number): Vec2 {
  const dx = state.player.pos.x - from.x;
  const dy = state.player.pos.y - from.y;
  const d = Math.hypot(dx, dy) || 1;
  return { x: from.x + (dx / d) * dist, y: from.y + (dy / d) * dist };
}

function nearestEnemy(state: GameState): Enemy | undefined {
  let best: Enemy | undefined;
  let bestD = Infinity;
  for (const enemy of state.enemies) {
    // Apparitions are untouchable scenery — a bot never fights or flees one.
    if (enemyDef(enemy.defId).apparition) continue;
    const d = distance(enemy.pos, state.player.pos);
    if (d < bestD) {
      best = enemy;
      bestD = d;
    }
  }
  return best;
}

function nearestItem(state: GameState): Item | undefined {
  let best: Item | undefined;
  let bestD = Infinity;
  for (const item of state.items) {
    const d = distance(item.pos, state.player.pos);
    if (d < bestD) {
      best = item;
      bestD = d;
    }
  }
  return best;
}

/** The landmark furthest from the player spawn — the objective's marker. */
function furthestLandmark(state: GameState): Vec2 | undefined {
  let best: Vec2 | undefined;
  let bestD = -1;
  for (const landmark of state.landmarks) {
    const d = distance(landmark.pos, state.playerSpawn);
    if (d > bestD) {
      best = landmark.pos;
      bestD = d;
    }
  }
  return best;
}
