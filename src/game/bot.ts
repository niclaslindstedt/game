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
import { MANA } from "./config.ts";
import { enemyDef } from "./defs/enemies/index.ts";
import { weaponDef } from "./defs/equipment.ts";
import { isSpellUnlocked, spellDef } from "./defs/spells.ts";
import {
  bestMedkitTier,
  effectiveStat,
  equipmentMaxDurability,
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
  // CASTER play: drink a mana potion when the pool runs low, and fire the best
  // castable spell at the fight — a heal when hurt, an AOE into a crowd, a bolt
  // at a lone foe, a ward/slow under pressure. Only a hero with an INT-sized
  // pool (past MANA.base) casts. The spell bar is filled by the harness/app;
  // the bot reads it and stays pure (input only, no state mutation).
  if (player.maxMana > MANA.base) {
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
  const effInt = effectiveStat(state, "intelligence");
  const hurt = p.hp < p.maxHp * HEAL_HP_FRAC;
  let best = -1;
  let bestScore = 0;
  for (let i = 0; i < p.spellSlots.length; i++) {
    const id = p.spellSlots[i];
    if (!id) continue;
    const def = spellDef(id);
    if (!isSpellUnlocked(def, effInt)) continue;
    if ((p.spellCooldowns[id] ?? 0) > 0) continue;
    if (p.mana < def.manaCost) continue;
    const e = def.effect;
    // Only cast where the spell would actually connect — an attack bolt needs a
    // foe in RANGE, an AOE/slow needs a crowd in RADIUS — so the bot never
    // spams a whiffing cast (a wasted nova, a targetless fizzle).
    let score = 0;
    if (e.kind === "heal") score = hurt ? 5 : 0;
    else if (e.kind === "nova") {
      const n = foesWithin(state, e.radius);
      score = n >= 2 ? 4 : n >= 1 ? 2 : 0;
    } else if (e.kind === "bolt")
      score = foesWithin(state, e.range) >= 1 ? 3 : 0;
    else if (e.kind === "slow")
      score = foesWithin(state, e.radius) >= 3 ? 3 : 0;
    else if (e.kind === "shield") score = hurt || threatNear ? 2 : 0;
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
  const boss = state.enemies.find((e) => enemyDef(e.defId).role === "boss");
  const target = boss?.pos ?? furthestLandmark(state);
  if (!target) return idleInput();
  const d = distance(state.player.pos, target);
  const jump = jumpTravel && state.player.z === 0;
  const hold = weaponDef(state.player.equipment.weapon.defId).range * 0.7;
  if (d > hold + 60) return steer(state, target, jump);
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

  // 1. Breathing room: grab a pickup within reach, else advance on the boss.
  if (near.length === 0) {
    const item = nearestItem(state);
    if (item && distance(player.pos, item.pos) < ITEM_REACH) {
      return steer(state, item.pos);
    }
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
  if (lowHp || (packed.length >= tune.surround && isEncircled(state, packed))) {
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
    return steer(state, bestEscapeTarget(state, near), grounded);
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
  const away = awayFromPack(state, near);
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
    // Field near him is thin → close on the boss to actually clear the map,
    // stopping at the posture's standoff (aggro presses closest, flee farthest).
    return steer(
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

/** A unit vector pointing away from the local pack, weighted so the NEAREST
 * bodies dominate the bearing (and a gap in a ring pulls the hero toward it). */
function awayFromPack(state: GameState, near: Enemy[]): Vec2 {
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
  if (m < 1e-6) return { x: 1, y: 0 }; // dead-symmetric ring → any way out
  return { x: ax / m, y: ay / m };
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
