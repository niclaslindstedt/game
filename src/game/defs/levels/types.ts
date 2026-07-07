// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The shape of one level. A level is pure data: geometry, gravity, biome, the
// story intro, landmark props, spawn bands, the objective, decor counts, and
// the loot table. `createGame(seed, levelId)` builds a run from an entry —
// shipping a new level means adding a file under this directory (registered in
// ./index.ts) plus its sprites, not touching the simulation. The per-level
// defs live one to a file; ./index.ts merges them.

import type { Difficulty, Tier, TileSpec } from "../../types.ts";
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
      /**
       * Difficulty-gated content: this line only appears from this rung of
       * the ladder up (see meetsMinDifficulty). Omitted = every difficulty.
       * This is how a difficulty-exclusive mob lives with the level that uses
       * it instead of in the difficulty catalog.
       */
      minDifficulty?: Difficulty;
    }
  | {
      enemy: string;
      /** Fixed position (bosses guarding a landmark). */
      at: Vec2;
      /** Difficulty gate — same rule as the banded form. */
      minDifficulty?: Difficulty;
    };

/** One line of a level's wave budget: `count` monsters streamed in over a
 * time window (fractions of `rampDurationMs`). Spawning eases in
 * quadratically, so each line starts as a trickle and ends as a flood. */
export type WaveBudget = {
  /** Key into ENEMY_DEFS. */
  enemy: string;
  count: number;
  window: [number, number];
  /**
   * Difficulty-gated content: this budget line only streams in from this
   * rung of the ladder up (see meetsMinDifficulty). Omitted = every
   * difficulty.
   */
  minDifficulty?: Difficulty;
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
  /** Downward acceleration in world px/s². Lower floats jumps higher. */
  gravity: number;
  /** Tileset/mood key for the renderer. */
  biome: string;
  /**
   * Music track id for this level (a key into the app's music registry, like
   * `biome` and `sprite` — the engine stays audio-free and never plays it).
   * Omitted = the app's default level theme.
   */
  music?: string;
  /** How the renderer paints this level's ground (sprite names + frequencies). */
  tiles: TileSpec;
  /**
   * Whether the hero already wears the EVA suit when the level opens. The
   * story starts him in plain clothes at SpaceZ HQ (`false`) — he only
   * becomes the astronaut once he loots the space suit — and every later
   * level picks up mid-mission with the suit on. Omitted = suited.
   */
  heroSuited?: boolean;
  /** What the HUD calls this level's hostiles ("GHOSTS", "STAFF"). */
  foes: string;
  /**
   * Cutscene played before the intro text box (key into CUTSCENE_DEFS).
   * Tap advances a beat; the SKIP button ends it — a rerun costs one tap.
   */
  prelude?: string;
  playerSpawn: Vec2;
  /**
   * Story props the renderer draws (and decor keeps clear of). `sprite`
   * defaults to `kind`; `anchor` defaults to `center` (`base` pins a standing
   * prop's foot to its pos).
   */
  landmarks: {
    kind: string;
    pos: Vec2;
    sprite?: string;
    anchor?: "base" | "center";
  }[];
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
    /** Sprite name; defaults to `kind`. */
    sprite?: string;
    count: number;
    radius: number;
    jumpable: boolean;
  }[];
  /**
   * Deliberate architecture: each segment is expanded into a chain of solid
   * circles from `from` to `to` at level creation, so a straight run of
   * `wall` obstacles reads (and collides) as one wall. Leave door-sized gaps
   * between segments — walls skip the scatter clearance rules on purpose.
   */
  walls?: {
    kind: string;
    /** Sprite name; defaults to `kind`. */
    sprite?: string;
    from: Vec2;
    to: Vec2;
    radius: number;
    jumpable: boolean;
  }[];
  /**
   * Locked doors: built exactly like walls (chains of solid `door_locked`
   * circles) but tracked in `state.doors` — carrying the story-item key
   * whose `unlocks` names the door's `id` up to it slides it open. Pair
   * each with wall segments that enclose the room it guards.
   */
  doors?: {
    id: string;
    from: Vec2;
    to: Vec2;
    radius: number;
  }[];
  /**
   * Hand-placed pickups (the loot inside locked rooms, plot pieces on
   * pedestals). Equipment is minted from its def id; story items key into
   * STORY_ITEM_DEFS.
   */
  placedItems?: (
    | { kind: "story" | "equipment"; defId: string; pos: Vec2 }
    | { kind: "medkit" | "xp" | "repair"; pos: Vec2 }
  )[];
  decor: { kind: string; sprite?: string; count: number }[];
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
     * A scripted opening loot cadence, authored in ascending `atKills` order.
     * Where the probabilistic drop rain can leave an unlucky player
     * empty-handed for the first minute, this hands over the weapon → powerup
     * → item loop on a schedule, so every run teaches the drop loop up front.
     * Author the first weapon before the first level-up (a handful of kills)
     * so the opening stat choice is informed by a weapon already in hand.
     */
    earlyDrops?: EarlyDrop[];
  };
};

/**
 * One entry in a level's scripted opening loot cadence (`loot.earlyDrops`):
 * a guaranteed drop handed over once the kill count reaches `atKills`. The
 * payload picks exactly one of a specific weapon, an ability powerup, or a
 * plain consumable/XP pickup.
 */
export type EarlyDrop = {
  /**
   * Kill count at or past which this entry drops. A number is an exact
   * threshold (deterministic onboarding); a `[min, max]` pair is rolled
   * uniformly at level creation, so the drop lands at a kill discovered in
   * play. Entries are authored in ascending order (by the low bound).
   */
  atKills: number | [number, number];
} & (
  | { weapon: string }
  | { ability: string }
  | { item: "medkit" | "repair" | "xp" }
);
