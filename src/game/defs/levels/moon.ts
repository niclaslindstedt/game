// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// LEVEL 2 — THE MOON. Ada's beacon dies near the old flag: ghosts thicken
// with distance from the landing site, and ARMSTRONG haunts the far side.

import type { LevelDef } from "./types.ts";

export const MOON: LevelDef = {
  id: "moon",
  index: 2,
  name: "THE MOON",
  music: "regolith_ride",
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
  // Regolith with occasional pocks and clustered gravel patches.
  tiles: {
    ground: { common: "moon_0", rare: "moon_1", rareEvery: 23 },
    patch: { a: "gravel_0", b: "gravel_1", every: 7 },
  },
  foes: "GHOSTS",
  playerSpawn: { x: 340, y: 1320 },
  landmarks: [
    { kind: "lander", pos: { x: 280, y: 1320 } },
    // The flag stands on the dust — pin its foot to its pos.
    { kind: "flag", pos: { x: 2130, y: 260 }, anchor: "base" },
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
    { kind: "craterBig", sprite: "crater_big", count: 9 },
    { kind: "craterSmall", sprite: "crater_small", count: 16 },
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
    // The moon is where yellow rares start turning up: a slim base chance for
    // the rank-and-file ghosts, which the elites' and boss's tierBonus (and
    // LUCK) lift into a real reward. Level 1 stays rare-free.
    tierChances: { magic: 0.2, rare: 0.05 },
    // MOON'S BLADE arrives early — at a kill rolled in the first hundred,
    // discovered in play — so the run's signature weapon shapes the run
    // instead of capping it.
    earlyDrops: [{ atKills: [40, 100], weapon: "moons_blade" }],
  },
};
