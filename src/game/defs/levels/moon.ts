// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// LEVEL 2 — THE MOON. Ada's beacon dies near the old flag: ghosts thicken
// with distance from the landing site, and ARMSTRONG haunts the far side.

import type { LevelDef } from "./types.ts";

export const MOON: LevelDef = {
  id: "moon",
  index: 2,
  name: "THE MOON",
  // The between-level scenes: the garage liftoff, then the flight out —
  // the launch the intro monologue used to narrate, now shown.
  prelude: ["launch", "voyage_moon"],
  music: "regolith_ride",
  intro: [
    [
      "ADA'S TRACKER WENT QUIET",
      "SOMEWHERE NEAR THE OLD APOLLO",
      "FLAG. THAT'S WHERE I'M HEADED.",
    ],
    [
      "AND SOMETHING IS MOVING OUT",
      "THERE IN THE DUST. THIS PLACE",
      "IS SUPPOSED TO BE EMPTY.",
    ],
    [
      "I KNOW THIS LANDING SITE FROM",
      "THE OLD MISSION CHARTS. EVERY",
      "CRATER. THE FASTEST LINE RUNS",
      "STRAIGHT TO THAT FLAG.",
    ],
    ["KEEP MOVING. I'M COMING, ADA."],
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
  // THE MERCHANT, venue two: a trader off the secret salvage runs, in a
  // patched 70s suit — the moonward launches had room for his stock, never
  // his return ticket. Lines in docs/manuscript.md.
  merchant: {
    sprite: "merchant_moon",
    greeting: [
      [
        "YOU'RE SOLID. THAT'S NEW.",
        "I CAME UP WITH THE '76 SALVAGE",
        "RUN. MISSED THE RIDE HOME.",
      ],
      [
        "THE GHOSTS DON'T CARRY COIN,",
        "SO YOU'RE MY WHOLE MARKET NOW.",
        "SELL ME SCRAP. BUY WHAT WORKS.",
      ],
    ],
  },
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
    // OPTIMUSK — SpaceZ shipped the night-shift robots up here to garrison the
    // moon. Solid metal, so unlike the haunting they respect the rock and the
    // craters: hunt them through the terrain, not around it.
    { enemy: "optimusk", count: 6, band: [0.3, 0.95] },
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
      // A steady trickle of robots laced through the back half of the haunting
      // — a heavy that forces the terrain to matter, not a second flood.
      { enemy: "optimusk", count: 30, window: [0.45, 1] },
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
  obstacles: [
    // MOONROCK — solid slabs of stone in 1×1, 1×2 and 2×2 footprints. They
    // wall off sight, shots, AND a nuke's blast: a living thing behind one is
    // hidden and safe. The haunting phases straight through them; SpaceZ's
    // robots do not, so the rock is cover against the metal, never the dead.
    {
      kind: "moonrock",
      count: 30,
      radius: 8,
      jumpable: false,
      rockSizes: [
        [1, 1],
        [1, 1],
        [1, 2],
        [2, 2],
      ],
      cell: 16,
    },
    // CRATERS — pits punched in the regolith. You can't cross one on foot, but
    // a jump clears it (come up short and you land on the near lip), and shots
    // fly straight across. Grounded robots pile up at the rim; ghosts drift
    // over. Jumpable so the player treats them as gaps, not walls.
    {
      kind: "crater",
      sprite: "crater_small",
      count: 14,
      radius: 7,
      jumpable: true,
    },
    {
      kind: "crater",
      sprite: "crater_big",
      count: 8,
      radius: 12,
      jumpable: true,
    },
  ],
  decor: [{ kind: "rocks", count: 20 }],
  decorClearance: 80,
  // The haunting reads in two beats: SEEING the first wisp proves the dust
  // walks (somebody lied about the moon), and DOWNING one closes the read —
  // they can fall. The kill beat's `after` gate keeps that order even when a
  // carried-over ranged weapon snipes the first wisp from beyond sight range.
  // The first SpaceZ robot he kills stays its own beat — the night shift
  // followed the trail all the way to the moon.
  firstSightThoughts: [{ enemy: "wisp", thought: "moon_wisp_sight" }],
  firstKillThoughts: [
    { enemy: "wisp", thought: "moon_wisp_kill", after: "moon_wisp_sight" },
    { enemy: "optimusk", thought: "moon_optimusk" },
  ],
  loot: {
    // The 70s pool: hardware the space race ferried up — lander tools, a
    // survival-kit revolver, surplus arms, one atomic-age prototype.
    // Introduced at level requirements 5 → 10, so the pool unfolds across
    // the run; the global tier gates (magic at mlvl 5, rare at 10) mean the
    // moon is where blues become routine and the first yellows land.
    weaponPool: [
      "lunar_wrench",
      "service_revolver",
      "geology_hammer",
      "surplus_carbine",
      "retro_raygun",
      "pulsar_rod",
      // …plus every earlier stage's arsenal (the bunker idiom): later maps
      // keep dropping earlier bases, so every revisit rung finds live bases
      // in its drop window and the grade ladder unfolds without holes.
      "box_cutter",
      "security_baton",
      "nine_mm",
      "prototype_laser",
      "microwave_emitter",
      "pump_shotgun",
    ],
    // The 70s kit lockers: mission cotton to the gold Apollo visor,
    // introduced at levelReqs 5 → 9 alongside the weapons.
    gearPool: [
      "mission_cap",
      "apollo_visor",
      "flight_jacket",
      "micrometeoroid_vest",
      "thermal_leggings",
      "pressure_trousers",
      "lunar_overshoes",
      "moon_boots",
      "moon_charm",
      "bag",
      // …plus every earlier stage's arsenal (the bunker idiom): later maps
      // keep dropping earlier bases, so every revisit rung finds live bases
      // in its drop window and the grade ladder unfolds without holes.
      "baseball_cap",
      "hard_hat",
      "welding_mask",
      "riot_helmet",
      "lab_coat",
      "coveralls",
      "kevlar_vest",
      "cargo_pants",
      "padded_work_pants",
      "sneakers",
      "steel_toe_boots",
    ],
    abilityPool: ["fire_orbs", "storm_cell", "stasis_field", "item_magnet"],
    // Level-locked world drops (see config WORLD_DROP): THE PALE COVENANT, the
    // last moonwalker's vacuum-sealed plate, and DEADSTAR, the pulsar-rod
    // relic that gives the easy rung its magic build — farmed on Moon boss runs.
    worldUniques: {
      easy: ["the_pale_covenant", "deadstar"],
      medium: ["marecrest"],
      // HUNTSMAN'S COWL — the moon-huntress's visor (the hard rung's
      // ranged-lean head piece).
      hard: ["huntsmans_cowl"],
    },
    // Level a normal run reaches per rung (`leveling-curve.mjs --by-level`) —
    // past it golden arrows go cold so a Moon replay can't over-level.
    arrowCapByDifficulty: {
      easy: 8,
      medium: 23,
      hard: 36,
      nightmare: 46,
      jesus: 55,
    },
    // MOON'S BLADE arrives early — at a kill rolled in the first hundred,
    // discovered in play — so the run's signature weapon shapes the run
    // instead of capping it.
    earlyDrops: [{ atKills: [40, 100], weapon: "moons_blade" }],
  },
};
