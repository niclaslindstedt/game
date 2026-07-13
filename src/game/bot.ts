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
import { enemyDef } from "./defs/enemies/index.ts";
import { weaponDef } from "./defs/equipment.ts";
import { bestMedkitTier, DAMAGE_STAT, REQ_STAT } from "./items.ts";
import type {
  Enemy,
  GameInput,
  GameState,
  Item,
  StatName,
  WeaponClass,
} from "./types.ts";

export type BotStrategy = "idle" | "rush" | "kite" | "boss" | "survivor";

/** Every strategy, for UIs and harnesses that validate a requested name. */
export const BOT_STRATEGIES: BotStrategy[] = [
  "idle",
  "rush",
  "kite",
  "boss",
  "survivor",
];

/**
 * A bot instance. Only the strategy today; per-bot memory (wander targets,
 * reaction delays, a second player's personality) hangs off this later.
 */
export type Bot = {
  strategy: BotStrategy;
};

export function createBot(strategy: BotStrategy): Bot {
  return { strategy };
}

/** "Local pack" radius the survivor reasons about (threat, escape, powerups). */
const THREAT_RADIUS = 320;
/** A foe this close is about to bite — hop to dodge its blow (airborne is
 * untouchable above JUMP.dodgeHeight, see step.ts). */
const CONTACT_DODGE_RADIUS = 46;
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
      case "survivor":
        return survive(state);
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
  return decided;
}

/**
 * The level-up build a bot spends its points on: a focused, WIELDABLE build
 * that commits to ONE lane instead of chasing whatever weapon happens to be in
 * hand. The lane is the class the hero has invested most in so far (ties and a
 * fresh, un-invested hero fall back to the held weapon's class), so once a bot
 * starts down a lane it deepens the same attribute rather than thrashing every
 * time auto-equip swaps its weapon. Half the points go into that lane's
 * REQUIRED attribute (`REQ_STAT`) so the bot keeps clearing the weapon stat
 * gates as they grow — ~50% comfortably clears the ~40% the requirement asks
 * for — the rest split between the lane's DAMAGE attribute (`DAMAGE_STAT`, so
 * its hits keep pace) and STAMINA for the legs to keep kiting the pack. Called
 * whenever `pendingStatPoints > 0`.
 */
export function botAllocate(bot: Bot, state: GameState): StatName {
  void bot; // strategy-specific builds can key off this later
  const lane = botLane(state);
  // A 4-beat cycle: two points into the lane's required attribute (the equip
  // gate), one into its damage attribute, one into STAMINA.
  switch (state.player.level % 4) {
    case 0:
    case 1:
      return REQ_STAT[lane];
    case 2:
      return DAMAGE_STAT[lane];
    default:
      return "stamina";
  }
}

/**
 * The weapon class a bot has committed to — the one whose REQUIRED attribute it
 * has already poured the most CHOSEN points into. A tie (including a brand-new
 * hero with nothing invested) falls back to the class of the weapon currently
 * in hand, so the very first allocations follow the difficulty's starter and
 * every one after that reinforces the deepest lane.
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
 *      punch down the openest lane out of the crowd, hopping to dodge any blow
 *      already in range (airborne is untouchable).
 *   3. Otherwise KITE: sit at the weapon's own reach from the nearest foe so
 *      the auto-weapon keeps firing while the hero backpedals — melee fights
 *      close, a ranged loadout holds far — and hop when a body crowds in.
 * Advancing on the boss is folded into the kite: when the field near the hero is
 * thin he drifts toward the objective, so he clears without ever standing still
 * in the flood.
 */
function survive(state: GameState): GameInput {
  const player = state.player;
  const near = threatsWithin(state, THREAT_RADIUS);

  // 1. Breathing room: grab a pickup within reach, else advance on the boss.
  if (near.length === 0) {
    const item = nearestItem(state);
    if (item && distance(player.pos, item.pos) < ITEM_REACH) {
      return steer(state, item.pos);
    }
    return pushBoss(state, true);
  }

  const nearest = near[0]!; // threatsWithin returns nearest-first
  const nearestD = distance(player.pos, nearest.pos);
  const dodge = nearestD < CONTACT_DODGE_RADIUS && player.z === 0;

  // 2. Emergency: low on HP, or a tight pack around him → punch out the gap.
  const packed = near.filter(
    (e) => distance(e.pos, player.pos) < SURROUND_RADIUS,
  );
  const lowHp = player.hp < player.maxHp * FLEE_HP_FRAC;
  if (lowHp || packed.length >= SURROUND_COUNT) {
    // A medkit within reach is worth the detour when we're bleeding.
    if (lowHp) {
      const item = nearestItem(state);
      if (
        item &&
        item.kind === "medkit" &&
        distance(player.pos, item.pos) < ITEM_REACH
      ) {
        return steer(state, item.pos, dodge);
      }
    }
    return steer(state, bestEscapeTarget(state, near), dodge);
  }

  // 3. Kite the nearest at the weapon's reach — close enough to keep firing,
  //    far enough to keep backpedaling. Bias the hold toward the boss when the
  //    local field is thin so the hero still advances to clear the map.
  const range = weaponDef(player.equipment.weapon.defId).range;
  const anchor =
    packed.length <= 1 ? (bossPos(state) ?? nearest.pos) : nearest.pos;
  return steer(
    state,
    holdOff(state, anchor, Math.max(48, range * 0.85)),
    dodge,
  );
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
