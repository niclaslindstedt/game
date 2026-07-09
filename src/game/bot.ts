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
import type { Enemy, GameInput, GameState, Item, StatName } from "./types.ts";

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

/** How far the survivor pushes for the boss instead of farming the horde. */
const SURVIVOR_PUSH_LEVEL = 6;
/** "Local pack" radius the survivor flees the centroid of. */
const THREAT_RADIUS = 300;
/** Pickups worth a detour, and the breathing room required to take one. */
const ITEM_REACH = 240;
const ITEM_SAFETY = 60;

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
  // Bots pop ability pickups the moment they carry one — no tactical
  // hoarding, matching how these items auto-activated before banking. A slot
  // still counting down a running power isn't spendable, so only a banked
  // (not-yet-running) slot trips the input.
  const running = state.player.abilities.filter(
    (a) => a.slot !== undefined,
  ).length;
  decided.useItem = state.player.heldAbilities.length > running;
  return decided;
}

/**
 * The level-up build a bot spends its points on: alternate the starting
 * weapon's speed stat and STAMINA — horde play needs the faster attacks AND
 * the legs to keep kiting the pack. Called whenever `pendingStatPoints > 0`.
 */
export function botAllocate(bot: Bot, state: GameState): StatName {
  void bot; // strategy-specific builds can key off this later
  return state.player.level % 2 === 0 ? "dexterity" : "stamina";
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
 * Competent horde play: scoop pickups when there is breathing room, flee
 * the local pack's centroid (not just one ghost — the ring spawner punishes
 * tunnel vision), and once levelled, push for the boss before the flood
 * peaks, hopping over the pack in transit (airborne = untouchable).
 */
function survive(state: GameState): GameInput {
  if (state.player.level >= SURVIVOR_PUSH_LEVEL) return pushBoss(state, true);

  const enemy = nearestEnemy(state);
  if (!enemy) return pushBoss(state, true);
  const enemyDist = distance(state.player.pos, enemy.pos);
  const item = nearestItem(state);
  if (
    item &&
    distance(state.player.pos, item.pos) < ITEM_REACH &&
    enemyDist > ITEM_SAFETY
  ) {
    return steer(state, item.pos);
  }

  const pack = state.enemies.filter(
    (e) => distance(e.pos, state.player.pos) < THREAT_RADIUS,
  );
  if (pack.length === 0) return idleInput();
  const centroid = {
    x: pack.reduce((sum, e) => sum + e.pos.x, 0) / pack.length,
    y: pack.reduce((sum, e) => sum + e.pos.y, 0) / pack.length,
  };
  return steer(state, holdOff(state, centroid, 200));
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
