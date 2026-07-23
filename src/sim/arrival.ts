// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Sim-only arrival helpers: mint a REALISTIC mid/late-campaign hero to drop
// straight into a difficulty, and revive the immortal calibration hero away
// from the swarm so a spawn-camp loop never inflates the death count.
//
// The campaign is meant to be played through in ORDER — a hero reaches JESUS
// only after clearing the tiers below it, carrying his level and gear forward
// (easy/medium/hard → nightmare → JESUS). Measuring JESUS with a fresh level-1
// hero on a starter weapon is meaningless: the whole game scales to the hero's
// level (mobs spawn at `player level + offset`), so the real question is "does
// a LEVEL-50, nightmare-geared hero survive JESUS?" — not "does a naked rookie?"
//
// `synthesizeArrival` answers that by minting the hero the campaign implies:
// spun up to a target level, his stat points spent, and dressed in real
// rolled-and-affixed gear of a chosen tier drawn from a late level's loot pool.
// It runs the REAL loot roller (`rollEquipment`) against a scratch game, so the
// kit it produces is exactly what that tier actually drops — no hand-waved
// stand-in stats.

import { buildStatWeights } from "../game/builds.ts";
import type { StatBuild } from "../game/builds.ts";
import { createGame } from "../game/create.ts";
import { difficultyDef } from "../game/defs/difficulties.ts";
import { LEVEL_ORDER, levelDef } from "../game/defs/levels/index.ts";
import { enemyDef } from "../game/defs/enemies/index.ts";
import {
  addToInventory,
  autoEquipBest,
  inventoryCapacity,
  recomputeMaxHp,
  recomputeMaxStamina,
  rollEquipment,
} from "../game/items/index.ts";
import { statPointsAt, xpToLevelUp } from "../game/leveling.ts";
import { extractLoadout } from "../game/arrival.ts";
import { distance } from "@game/lib/vec.ts";
import type { Vec2 } from "@game/lib/vec.ts";
import type {
  Difficulty,
  GameState,
  Loadout,
  StatName,
  Tier,
} from "../game/types/index.ts";

export type SynthesizeArrivalOptions = {
  /** The tier the gear was EARNED on — the rung below the one being measured
   * (e.g. `nightmare` for a JESUS arrival). Sets the loot pool's mob level and
   * the make-quality context; the hero then walks this kit into the run. */
  difficulty: Difficulty;
  /** Hero level to arrive at — the campaign's intended entry level for the
   * measured rung (a rung's terminal `arrowCapByDifficulty`, ~50 for JESUS). */
  level: number;
  /** Which campaign level's loot pool to draw the kit from (default: the last
   * story level, whose pool is the deepest). */
  levelId?: string;
  /** Deterministic seed for the gear rolls. */
  seed?: number;
  /** Forced weapon tier — the hero's mainhand (default `rare`). */
  weaponTier?: Tier;
  /** Forced armor/charm tier (default `rare`). */
  gearTier?: Tier;
  /** The stat-distribution BUILD to spend the hero's points by (melee/ranged/
   * magic/balanced — see src/game/builds.ts). Omitted = the neutral four-combat
   * -stat round-robin, a generalist arrival. Set it so a `--start-level`
   * arrival hero represents the build being measured — his stats (and, through
   * the stat-aware auto-equip, his weapon) bend toward that lane. */
  build?: StatBuild;
};

/** How many pieces to roll when dressing the synthetic hero — a generous batch
 * so every slot the pool covers is filled and the best-of-each wins. */
const WEAPON_ROLLS = 8;
const GEAR_ROLLS = 40;

/** The stat points a synthetic hero spends: the four COMBAT stats, round-robin.
 * strength/dexterity/intelligence keep the weapon equip gates clear (so the
 * rolled late gear is wieldable); stamina buys the hp and legs to survive with
 * it. Speed/luck are left at base — a calibration hero, not a movement build. */
const ARRIVAL_STATS: readonly StatName[] = [
  "strength",
  "dexterity",
  "intelligence",
  "stamina",
];

/**
 * Mint a realistic mid/late-campaign hero to drop straight into a run: spun up
 * to `level`, stat points spent round-robin (the same order the app's
 * stand-in arrival uses), and dressed in REAL rolled gear of the requested
 * tier — the loot the rung below actually drops, run through the true roller.
 * Returns a `Loadout` ready to hand to `simulateCampaign`/`runLevel`.
 *
 * Deterministic per `(difficulty, level, levelId, seed, tiers)`.
 */
export function synthesizeArrival(opts: SynthesizeArrivalOptions): Loadout {
  const {
    difficulty,
    level,
    levelId = LEVEL_ORDER[LEVEL_ORDER.length - 1] as string,
    seed = 1,
    weaponTier = "rare",
    gearTier = "rare",
    build,
  } = opts;

  const target = Math.max(1, Math.round(level));
  const state = createGame(seed, levelId, difficulty);
  const player = state.player;

  // Spin the hero up to the target level and spend the banked stat points into
  // the FOUR combat stats (strength/dexterity/intelligence keep the equip gates
  // clear so late gear is actually wieldable; stamina buys hp and legs). A pure
  // round-robin over all six spreads too thin — the hero can't wield the rare
  // gear he's meant to be wearing. Assigned directly (like applyLoadout), so the
  // per-level chooser caps don't gate a stand-in build.
  player.level = target;
  player.xp = 0;
  player.xpToNext = xpToLevelUp(target, difficulty);
  let points = 0;
  for (let l = 2; l <= target; l++) points += statPointsAt(l);
  // A named BUILD spends the points by its weight ratio (highest-averages, the
  // same spend the analytic sim and autopilot use), so the arrival hero mirrors
  // the build being measured; with none, the neutral four-combat-stat round
  // robin stands in (a generalist who can wield the late gear).
  if (build) {
    const weights = buildStatWeights(build);
    const lane = (Object.keys(weights) as StatName[]).filter(
      (s) => (weights[s] ?? 0) > 0,
    );
    const spent: Partial<Record<StatName, number>> = {};
    for (let i = 0; i < points; i++) {
      let best = lane[0] as StatName;
      let bestScore = -Infinity;
      for (const stat of lane) {
        const score = (weights[stat] ?? 0) / ((spent[stat] ?? 0) + 1);
        if (score > bestScore) {
          bestScore = score;
          best = stat;
        }
      }
      spent[best] = (spent[best] ?? 0) + 1;
      player.stats[best]++;
      player.spentStats[best]++;
    }
  } else {
    const order = ARRIVAL_STATS;
    for (let i = 0; i < points; i++) {
      const stat = order[i % order.length] as StatName;
      player.stats[stat]++;
      player.spentStats[stat]++;
    }
  }
  recomputeMaxHp(state);
  recomputeMaxStamina(state);
  player.hp = player.maxHp;
  player.stamina = player.maxStamina;
  // The bag re-sizes to the carried STRENGTH — the fresh game sized it at level
  // 1, so grow it now or the rolls below have nowhere to land.
  player.inventory = new Array<null>(inventoryCapacity(state)).fill(null);

  // Roll a real kit off the loot pool at the requested tiers, at THIS hero's
  // horde level so the ilvls track him, then let the auto-equip wear the best
  // of each slot exactly as a picked-up drop would. Any piece he can't wield
  // (attribute gate) is simply left in the bag and cleared below.
  const mlvl = target + difficultyDef(difficulty).mobLevelOffset;
  const roll = (family: "weapon" | "gear", tier: Tier) => {
    const piece = rollEquipment(state, { slot: family, tier, mlvl });
    if (!addToInventory(state, piece)) {
      autoEquipBest(state); // bag full → wear the upgrades, free the cells
      addToInventory(state, piece);
    }
  };
  for (let i = 0; i < WEAPON_ROLLS; i++) roll("weapon", weaponTier);
  for (let i = 0; i < GEAR_ROLLS; i++) roll("gear", gearTier);
  autoEquipBest(state);

  // Arrive with the WORN kit only — a bag stuffed with dozens of spare rares
  // would hand the auto-shop a fortune and distort the run.
  player.inventory = player.inventory.map(() => null);

  return extractLoadout(state);
}

/**
 * Revive the immortal calibration hero AWAY from the swarm. The plain "stand up
 * at the spawn" revive spawn-camps him on the dense rungs — he reappears inside
 * the horde and dies again the same tick, booking hundreds of phantom deaths
 * that read as lethality when they're really one bad spot. Placing him at the
 * open point (of the spawn, the map's inset corners, and the landmarks) that is
 * FURTHEST from the nearest live foe models a checkpoint respawn: the death is
 * still booked once, but he gets a breath to move before the next blow.
 */
export function reviveHero(state: GameState): void {
  const player = state.player;
  player.hp = player.maxHp;
  player.stamina = player.maxStamina;
  const path = levelDef(state.level.id).path;
  if (path && path.length > 0) {
    // MAZE (path level): an arbitrary far corner can be walled off from the
    // route, stranding the no-pathfinding hero forever. Revive instead ON the
    // authored corridor — at the safest node AT OR BEHIND his furthest progress
    // (never skip him forward past the fight) — and resume the route from there,
    // so he's always somewhere he can actually navigate out of.
    const reached = Math.min(state.pathIndex, path.length - 1);
    let bestIdx = 0;
    let bestClear = -Infinity;
    for (let i = 0; i <= reached; i++) {
      const clear = nearestFoeDist(state, path[i] as Vec2);
      if (clear > bestClear) {
        bestClear = clear;
        bestIdx = i;
      }
    }
    player.pos = { ...(path[bestIdx] as Vec2) };
    state.pathIndex = bestIdx;
  } else {
    player.pos = safestPoint(state);
  }
  player.z = 0;
  state.phase = "playing";
}

/** Distance from `point` to the nearest live (non-apparition) foe, or +∞ when
 * the field is empty. */
function nearestFoeDist(state: GameState, point: Vec2): number {
  let nearest = Infinity;
  for (const enemy of state.enemies) {
    if (enemyDef(enemy.defId).apparition) continue;
    const d = distance(enemy.pos, point);
    if (d < nearest) nearest = d;
  }
  return nearest;
}

/** The candidate open point furthest from the nearest live (non-apparition)
 * foe — the spawn, the four inset corners, and every landmark. */
function safestPoint(state: GameState): Vec2 {
  const inset = 60;
  const candidates: Vec2[] = [
    { ...state.playerSpawn },
    { x: inset, y: inset },
    { x: state.level.width - inset, y: inset },
    { x: inset, y: state.level.height - inset },
    { x: state.level.width - inset, y: state.level.height - inset },
    ...state.landmarks.map((l) => ({ ...l.pos })),
  ];
  let best = candidates[0] as Vec2;
  let bestClearance = -Infinity;
  for (const point of candidates) {
    let nearest = Infinity;
    for (const enemy of state.enemies) {
      if (enemyDef(enemy.defId).apparition) continue;
      const d = distance(enemy.pos, point);
      if (d < nearest) nearest = d;
    }
    if (nearest > bestClearance) {
      bestClearance = nearest;
      best = point;
    }
  }
  return best;
}
