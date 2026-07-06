// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The level registry. A level is pure data: geometry, gravity, biome, the
// story intro, landmark props, spawn bands, the objective, decor counts, and
// the loot table. `createGame(seed, levelId)` builds a run from an entry —
// shipping level 1 (earth) or level 12 means adding an entry here plus its
// sprites, not touching the simulation.

import type { Tier } from "../types.ts";
import type { Vec2 } from "@game/lib/vec.ts";

/** A monster placement: banded by difficulty distance, or pinned to a spot. */
export type SpawnSpec =
  | {
      /** Key into ENEMY_DEFS. */
      enemy: string;
      count: number;
      /**
       * Distance band from the player spawn, as fractions of the spawn→
       * objective distance. Bigger fractions = further out = harder.
       */
      band: [number, number];
    }
  | {
      enemy: string;
      /** Fixed position (bosses guarding a landmark). */
      at: Vec2;
    };

/** One line of a level's wave budget: `count` monsters streamed in over a
 * time window (fractions of `rampDurationMs`). Spawning eases in
 * quadratically, so each line starts as a trickle and ends as a flood. */
export type WaveBudget = {
  /** Key into ENEMY_DEFS. */
  enemy: string;
  count: number;
  window: [number, number];
};

/** The continuous spawner that turns a level into a survivors-style horde. */
export type WaveSpec = {
  /** Time to full pressure; every window is a fraction of this. */
  rampDurationMs: number;
  /** Live-minion cap — spawning defers (never cancels) above it. */
  maxAlive: number;
  budget: WaveBudget[];
};

export type LevelDef = {
  /** Registry key. */
  id: string;
  /** Story order (1 = earth, 2 = the moon, …). */
  index: number;
  name: string;
  /** Intro text box: why the player arrived here. One entry per line. */
  intro: readonly string[];
  width: number;
  height: number;
  /** Downward acceleration in world px/s². Earth ≈ 2000, the moon ≈ 1/6. */
  gravity: number;
  /** Tileset/mood key for the renderer. */
  biome: string;
  playerSpawn: Vec2;
  /** Story props the renderer draws (and decor keeps clear of). */
  landmarks: { kind: string; pos: Vec2 }[];
  /**
   * What ends the level. `killBoss` also anchors the difficulty axis: bands
   * scale from the player spawn toward the boss.
   */
  objective: { type: "killBoss" } | { type: "clearAll" };
  /** Monsters placed at level creation — the "few on screen" at the start. */
  spawns: SpawnSpec[];
  /** The horde: thousands more streamed in around the player over time. */
  waves?: WaveSpec;
  decor: { kind: string; count: number }[];
  /** Keep decor at least this far from landmarks. */
  decorClearance: number;
  loot: {
    /** WEAPON_DEFS ids this level's drops draw from. */
    weaponPool: string[];
    /** GEAR_DEFS ids this level's drops draw from. */
    gearPool: string[];
    /**
     * Chance per tier that a drop rolls it (checked best-first; LUCK adds
     * to each). Omitted tiers cannot drop here — the moon caps at magic.
     */
    tierChances: Partial<Record<Tier, number>>;
    /**
     * Trophy weapon def dropped by the last regular monster standing —
     * clearing every mob on the level always earns it.
     */
    allClearWeapon?: string;
  };
};

/**
 * LEVEL 2 — THE MOON. The trail of Ada's kidnappers leads here first: ghosts
 * thicken with distance from the landing site, and ARMSTRONG haunts the old
 * flag on the far side. Level 1 (earth — the NASA heist) is a future entry.
 */
const MOON: LevelDef = {
  id: "moon",
  index: 2,
  name: "THE MOON",
  intro: [
    "ADA WENT OUT FOR A WALK AT MIDNIGHT",
    "AND NEVER CAME BACK.",
    "",
    "THE TRACKING BEACON I SEWED INTO HER",
    "JACKET POINTS AT THE MOON. I BUILD",
    "SPACESHIPS FOR A LIVING - SO I BUILT",
    "ONE FOR MYSELF.",
    "",
    "THE SIGNAL DIES NEAR THE OLD FLAG.",
    "SOMETHING UP HERE IS NOT DEAD ENOUGH.",
  ],
  width: 2400,
  height: 1600,
  gravity: 340,
  biome: "moon",
  playerSpawn: { x: 340, y: 1320 },
  landmarks: [
    { kind: "lander", pos: { x: 280, y: 1320 } },
    { kind: "flag", pos: { x: 2130, y: 260 } },
  ],
  objective: { type: "killBoss" },
  spawns: [
    { enemy: "wisp", count: 8, band: [0.05, 0.45] },
    { enemy: "ghost", count: 6, band: [0.4, 0.8] },
    { enemy: "wraith", count: 4, band: [0.75, 1.05] },
    { enemy: "armstrong", at: { x: 2130, y: 260 } },
  ],
  // The haunting proper: over five minutes the moon empties its graves.
  waves: {
    rampDurationMs: 300_000,
    maxAlive: 220,
    budget: [
      { enemy: "wisp", count: 500, window: [0, 0.55] },
      { enemy: "ghost", count: 400, window: [0.3, 0.85] },
      { enemy: "wraith", count: 300, window: [0.55, 1] },
    ],
  },
  decor: [
    { kind: "craterBig", count: 9 },
    { kind: "craterSmall", count: 16 },
    { kind: "rocks", count: 22 },
  ],
  decorClearance: 80,
  loot: {
    weaponPool: ["blaster", "wand", "wrench"],
    gearPool: ["suit_plating", "moon_charm"],
    tierChances: { magic: 0.2 },
    allClearWeapon: "moons_blade",
  },
};

export const LEVELS: Record<string, LevelDef> = {
  moon: MOON,
};

/** Story order of the levels shipped so far. */
export const LEVEL_ORDER: string[] = ["moon"];

/** Look up a level def; throws on a broken id so bugs surface loudly. */
export function levelDef(levelId: string): LevelDef {
  const def = LEVELS[levelId];
  if (!def) throw new Error(`unknown level "${levelId}"`);
  return def;
}
