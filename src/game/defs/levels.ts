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
  /** What the HUD calls this level's hostiles ("GHOSTS", "STAFF"). */
  foes: string;
  /**
   * Cutscene played before the intro text box (key into CUTSCENE_DEFS).
   * Tap advances a beat; the SKIP button ends it — a rerun costs one tap.
   */
  prelude?: string;
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
  /**
   * Deliberate architecture: each segment is expanded into a chain of solid
   * circles from `from` to `to` at level creation, so a straight run of
   * `wall` obstacles reads (and collides) as one wall. Leave door-sized gaps
   * between segments — walls skip the scatter clearance rules on purpose.
   */
  walls?: {
    kind: string;
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
 * LEVEL 1 — SPACEZ HQ. Ada's trail points off-planet and our hero builds
 * spaceships for a living — but the interplanetary drive needs the one
 * ingredient SpaceZ keeps in its cleanroom, and the night shift is not
 * letting it leave the building. Office rooms and lab corridors are carved
 * by solid walls with door gaps; MUSKRAT, the mutant rat who ATE the
 * ingredient, nests under the prototype rocket on the far side.
 */
const SPACEZ_HQ: LevelDef = {
  id: "spacez_hq",
  index: 1,
  name: "SPACEZ HQ",
  prelude: "prelude",
  intro: [
    "ADA WENT OUT FOR CHIPS AND SODA.",
    "SHE NEVER CAME BACK.",
    "",
    "HER JACKET'S TRACKING BEACON POINTS",
    "STRAIGHT OFF-PLANET. FINE. I BUILD",
    "SPACESHIPS FOR A LIVING.",
    "",
    "BUT AN INTERPLANETARY DRIVE NEEDS",
    "THE INGREDIENT SPACEZ KEEPS IN ITS",
    "CLEANROOM - AND SECURITY SAYS NO.",
    "",
    "THEN THE LAB RAT THAT ATE IT SAYS",
    "SQUEAK. WE DO THIS THE HARD WAY.",
  ],
  width: 2000,
  height: 1200,
  // Story says earth, but 2000 px/s² makes hops useless (peak z ≈ 14 px vs
  // the 14 px clear height). 800 keeps desks and crates hoppable (peak
  // z ≈ 36 px) while landing far snappier than the moon's 340 float.
  gravity: 800,
  biome: "spacez",
  foes: "STAFF",
  playerSpawn: { x: 220, y: 620 },
  landmarks: [
    { kind: "entrance", pos: { x: 84, y: 620 } },
    { kind: "rocket", pos: { x: 1830, y: 520 } },
  ],
  objective: { type: "killBoss" },
  spawns: [
    { enemy: "intern", count: 10, band: [0.05, 0.4] },
    { enemy: "scientist", count: 8, band: [0.3, 0.65] },
    { enemy: "engineer", count: 6, band: [0.45, 0.8] },
    { enemy: "guard", count: 6, band: [0.55, 0.95] },
    { enemy: "hazmat", count: 4, band: [0.7, 1.05] },
    // The four staffers who know too much, pinned along the route so the
    // plot unspools in walking order: launches → Ada → the vault → the
    // Armstrong tease. Each rushes into view and talks before it fights.
    { enemy: "night_manager", at: { x: 560, y: 370 } },
    { enemy: "security_chief", at: { x: 1050, y: 700 } },
    { enemy: "head_scientist", at: { x: 1270, y: 400 } },
    { enemy: "janitor", at: { x: 900, y: 1000 } },
    { enemy: "muskrat", at: { x: 1730, y: 620 } },
  ],
  // The night shift floods in over ~4.5 minutes — a slightly gentler total
  // than the moon's haunting, this being the first level.
  waves: {
    rampDurationMs: 280_000,
    maxAlive: 200,
    minAlive: 16,
    moveSpawnEvery: 60,
    budget: [
      { enemy: "intern", count: 380, window: [0, 0.5] },
      { enemy: "scientist", count: 300, window: [0.2, 0.7] },
      { enemy: "engineer", count: 200, window: [0.4, 0.85] },
      { enemy: "guard", count: 150, window: [0.55, 0.95] },
      { enemy: "hazmat", count: 90, window: [0.7, 1] },
    ],
  },
  // Three wall lines carve the floor into lobby → labs → cleanroom, each
  // with door gaps the horde must funnel through. Server racks and vending
  // machines block outright; desks and crates are the player's hop-overs.
  walls: [
    // Lobby wall, two doorways.
    {
      kind: "wall",
      from: { x: 650, y: 8 },
      to: { x: 650, y: 300 },
      radius: 8,
      jumpable: false,
    },
    {
      kind: "wall",
      from: { x: 650, y: 430 },
      to: { x: 650, y: 760 },
      radius: 8,
      jumpable: false,
    },
    {
      kind: "wall",
      from: { x: 650, y: 890 },
      to: { x: 650, y: 1192 },
      radius: 8,
      jumpable: false,
    },
    // Mid-floor divider between the north lab and the south offices.
    {
      kind: "wall",
      from: { x: 650, y: 600 },
      to: { x: 980, y: 600 },
      radius: 8,
      jumpable: false,
    },
    {
      kind: "wall",
      from: { x: 1110, y: 600 },
      to: { x: 1350, y: 600 },
      radius: 8,
      jumpable: false,
    },
    // Cleanroom wall, two doorways guarding the boss wing.
    {
      kind: "wall",
      from: { x: 1350, y: 8 },
      to: { x: 1350, y: 340 },
      radius: 8,
      jumpable: false,
    },
    {
      kind: "wall",
      from: { x: 1350, y: 470 },
      to: { x: 1350, y: 820 },
      radius: 8,
      jumpable: false,
    },
    {
      kind: "wall",
      from: { x: 1350, y: 950 },
      to: { x: 1350, y: 1192 },
      radius: 8,
      jumpable: false,
    },
    // Supply bay B: the NW-corner storage room the NIGHT MANAGER's keycard
    // opens. Map edges close two sides; these walls close the rest, with
    // the locked door as the only way in.
    {
      kind: "wall",
      from: { x: 310, y: 8 },
      to: { x: 310, y: 186 },
      radius: 8,
      jumpable: false,
    },
    {
      kind: "wall",
      from: { x: 8, y: 180 },
      to: { x: 236, y: 180 },
      radius: 8,
      jumpable: false,
    },
    // The cleanroom vault: SE corner of the boss wing, DR. NOVA's red
    // keycard opens it. The anti-grav unit waits inside.
    {
      kind: "wall",
      from: { x: 1750, y: 1036 },
      to: { x: 1750, y: 1192 },
      radius: 8,
      jumpable: false,
    },
    {
      kind: "wall",
      from: { x: 1756, y: 1030 },
      to: { x: 1926, y: 1030 },
      radius: 8,
      jumpable: false,
    },
  ],
  doors: [
    {
      id: "storage",
      from: { x: 244, y: 180 },
      to: { x: 304, y: 180 },
      radius: 8,
    },
    {
      id: "vault",
      from: { x: 1932, y: 1030 },
      to: { x: 1992, y: 1030 },
      radius: 8,
    },
  ],
  placedItems: [
    // Supply bay B — spare parts for a ship-builder: tools and kits.
    { kind: "equipment", defId: "wrench", pos: { x: 100, y: 80 } },
    { kind: "repair", pos: { x: 150, y: 60 } },
    { kind: "repair", pos: { x: 190, y: 100 } },
    { kind: "medkit", pos: { x: 245, y: 80 } },
    // The vault — the alien anti-grav unit the whole drive is built around.
    { kind: "story", defId: "antigrav_unit", pos: { x: 1870, y: 1120 } },
    { kind: "xp", pos: { x: 1820, y: 1100 } },
    { kind: "xp", pos: { x: 1920, y: 1100 } },
  ],
  obstacles: [
    { kind: "server", count: 16, radius: 9, jumpable: false },
    { kind: "vending", count: 8, radius: 8, jumpable: false },
    { kind: "desk", count: 18, radius: 8, jumpable: true },
    { kind: "crate", count: 22, radius: 7, jumpable: true },
  ],
  decor: [
    { kind: "papers", count: 24 },
    { kind: "cable", count: 16 },
    { kind: "stain", count: 12 },
    { kind: "plant", count: 10 },
  ],
  decorClearance: 70,
  loot: {
    weaponPool: [
      "stapler",
      "keyboard",
      "mop",
      "taser",
      "laser_pointer",
      "beaker",
      "fire_extinguisher",
      "pistol",
    ],
    gearPool: ["lab_coat", "id_badge"],
    abilityPool: ["storm_cell", "stasis_field", "item_magnet"],
    tierChances: { magic: 0.18 },
    allClearWeapon: "golden_stapler",
    // The SECURITY BATON arrives within the first eighty kills — the run's
    // guaranteed melee spine before the crowd thickens.
    earlyWeapon: { defId: "security_baton", minKills: 30, maxKills: 80 },
  },
};

/**
 * LEVEL 2 — THE MOON. Ada's beacon dies near the old flag: ghosts thicken
 * with distance from the landing site, and ARMSTRONG haunts the far side.
 */
const MOON: LevelDef = {
  id: "moon",
  index: 2,
  name: "THE MOON",
  intro: [
    "ADA WENT OUT FOR CHIPS AND SODA.",
    "SHE NEVER CAME BACK.",
    "",
    "THE TRACKING BEACON I SEWED INTO HER",
    "JACKET POINTS AT THE MOON. THE DRIVE",
    "INGREDIENT CAME OUT OF THE RAT. THE",
    "SHIP FLEW. HERE WE ARE.",
    "",
    "THE SIGNAL DIES NEAR THE OLD FLAG.",
    "SOMETHING UP HERE IS NOT DEAD ENOUGH.",
  ],
  width: 2400,
  height: 1600,
  gravity: 340,
  biome: "moon",
  foes: "GHOSTS",
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
    // Four ghosts with unfinished business, pinned along the walk to the
    // flag: the grave under the dust, the moonbase, the clone, and Ada's
    // trail — each rushes in, talks, then joins the haunting.
    { enemy: "apollo_ghost", at: { x: 700, y: 1100 } },
    { enemy: "prospector", at: { x: 1150, y: 850 } },
    { enemy: "quarantine_medic", at: { x: 1600, y: 550 } },
    { enemy: "cartographer", at: { x: 1880, y: 520 } },
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
  // Standing stone: ridge walls of moonrock strewn along the walk to the
  // flag. Solid to the living — bullets and boots stop at them — but the
  // haunting drifts straight through (every moon mob phases), which is
  // exactly the horror: stone that shelters you from nothing dead.
  walls: [
    // West ridge, above the landing site.
    {
      kind: "boulder",
      from: { x: 280, y: 480 },
      to: { x: 520, y: 400 },
      radius: 13,
      jumpable: false,
    },
    // Mid-field ridge between the landing site and the moonbase trail.
    {
      kind: "boulder",
      from: { x: 620, y: 700 },
      to: { x: 920, y: 640 },
      radius: 13,
      jumpable: false,
    },
    // Southern ridge below the trail's midpoint.
    {
      kind: "boulder",
      from: { x: 1250, y: 1250 },
      to: { x: 1550, y: 1340 },
      radius: 13,
      jumpable: false,
    },
    // Northern ridge on the high route.
    {
      kind: "boulder",
      from: { x: 1180, y: 300 },
      to: { x: 1440, y: 230 },
      radius: 13,
      jumpable: false,
    },
    // East ridge on the approach to the flag.
    {
      kind: "boulder",
      from: { x: 1780, y: 820 },
      to: { x: 2060, y: 920 },
      radius: 13,
      jumpable: false,
    },
  ],
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
  spacez_hq: SPACEZ_HQ,
  moon: MOON,
};

/** Story order of the levels shipped so far. */
export const LEVEL_ORDER: string[] = ["spacez_hq", "moon"];

/** Look up a level def; throws on a broken id so bugs surface loudly. */
export function levelDef(levelId: string): LevelDef {
  const def = LEVELS[levelId];
  if (!def) throw new Error(`unknown level "${levelId}"`);
  return def;
}
