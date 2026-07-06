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
  /**
   * Live-minion floor: whenever fewer minions than this are alive (and the
   * budget isn't spent), spawns are pulled forward so the screen is never
   * quiet.
   */
  minAlive: number;
  /**
   * Every this-many world px the player walks pulls one extra spawn forward
   * — exploring stirs the horde awake.
   */
  moveSpawnEvery: number;
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
  /**
   * Solid features scattered at level creation. Nothing moves through one;
   * `jumpable` ones can be hopped over — monsters never jump, so low rocks
   * are walls to the horde and shortcuts to the player.
   */
  obstacles: {
    kind: string;
    count: number;
    radius: number;
    jumpable: boolean;
  }[];
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
    /** ABILITY_DEFS ids this level's drops draw from. */
    abilityPool: string[];
    /**
     * Trophy weapon def dropped by the last regular monster standing —
     * clearing every mob on the level always earns it.
     */
    allClearWeapon?: string;
    /**
     * A weapon guaranteed to drop early: at a kill count rolled uniformly in
     * [minKills, maxKills] at level creation, the dying monster surrenders
     * it.
     */
    earlyWeapon?: { defId: string; minKills: number; maxKills: number };
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
  // The floor keeps a dozen ghosts on screen from the first breath; walking
  // the moonscape stirs extras out of the regolith every 48 px.
  waves: {
    rampDurationMs: 300_000,
    maxAlive: 220,
    minAlive: 20,
    moveSpawnEvery: 64,
    budget: [
      { enemy: "wisp", count: 500, window: [0, 0.55] },
      { enemy: "ghost", count: 400, window: [0.3, 0.85] },
      { enemy: "wraith", count: 300, window: [0.55, 1] },
    ],
  },
  // Boulders wall off lanes outright; low rocks only stop what can't jump —
  // hopping a rock line the horde must flow around is the moon's core trick.
  obstacles: [
    { kind: "boulder", count: 26, radius: 13, jumpable: false },
    { kind: "rock", count: 44, radius: 8, jumpable: true },
  ],
  decor: [
    { kind: "craterBig", count: 9 },
    { kind: "craterSmall", count: 16 },
    { kind: "rocks", count: 22 },
  ],
  decorClearance: 80,
  loot: {
    weaponPool: [
      "blaster",
      "wand",
      "wrench",
      "pipe",
      "hammer",
      "pistol",
      "rifle",
      "star_wand",
      "void_wand",
    ],
    gearPool: ["suit_plating", "moon_charm"],
    abilityPool: ["fire_orbs", "storm_cell", "stasis_field", "item_magnet"],
    tierChances: { magic: 0.2 },
    // MOON'S BLADE arrives early — within the first hundred kills — so the
    // run's signature weapon shapes the run instead of capping it.
    earlyWeapon: { defId: "moons_blade", minKills: 40, maxKills: 100 },
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
