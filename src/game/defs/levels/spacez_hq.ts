// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// LEVEL 1 — SPACEZ HQ. Ada's trail points off-planet and our hero builds
// spaceships for a living — but the interplanetary drive needs the one
// ingredient SpaceZ keeps in its cleanroom, and the night shift is not
// letting it leave the building. Office rooms and lab corridors are carved
// by solid walls with door gaps; MUSKRAT, the mutant rat who ATE the
// ingredient, nests under the prototype rocket on the far side.

import type { LevelDef } from "./types.ts";

export const SPACEZ_HQ: LevelDef = {
  id: "spacez_hq",
  index: 1,
  name: "SPACEZ HQ",
  prelude: "prelude",
  music: "hq_lockdown",
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
  // Polished lab tiles with clustered floor vents; hazard variant is rare.
  tiles: {
    ground: { common: "lab_0", rare: "lab_1", rareEvery: 11 },
    patch: { a: "vent_0", b: "vent_1", every: 9 },
  },
  // Level 1 opens with the hero in his living-room clothes; the EVA suit is
  // loot here, not a given (an epic drop from the Chief of Security).
  heroSuited: false,
  foes: "STAFF",
  playerSpawn: { x: 220, y: 620 },
  landmarks: [
    { kind: "entrance", pos: { x: 84, y: 620 } },
    { kind: "rocket", pos: { x: 1830, y: 520 } },
  ],
  objective: { type: "killBoss" },
  spawns: [
    // A dense front rank clustered right around the spawn — the night shift is
    // already on top of the hero when the lockdown drops, so standing still is
    // a quick way to get swarmed. Interns pack the opening ring; scientists
    // fill in just behind them.
    { enemy: "intern", count: 22, band: [0, 0.22] },
    { enemy: "scientist", count: 14, band: [0.05, 0.35] },
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
    // Keep a thick field on screen from the first second — a sparse opening
    // let an idle player pick off the trickle for free; this holds ~24 near
    // the hero so the crowd has to be routed around, not ignored.
    minAlive: 24,
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
