// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// LEVEL 3 — MARS. Armstrong pointed the way: SpaceZ wrote the moon off as a
// disaster and moved the whole operation here. Open red desert on the west —
// rovers working dust that's already full of tire tracks — hardens into the
// colony base on the east (a tile `zones` split at the dome wall): deck
// plating, servo robots, ZUCKERBORG's fembot line, and the billionaires who
// bought the lifeboat. ELON MOSQUE holds court at the far end; he doesn't
// die — he flees into a rift, and the rift stays.

import type { LevelDef } from "./types.ts";

export const MARS: LevelDef = {
  id: "mars",
  index: 3,
  name: "MARS",
  // The between-level scenes: ARMSTRONG's send-off at the landing site,
  // then the flight — the ghost-kept-his-word and tracker-ping pages the
  // intro used to narrate now play out on stage.
  prelude: ["moon_depart", "voyage_mars"],
  music: "red_dust",
  intro: [
    [
      "HE SAID THE MOON WAS SPACEZ'S BIG",
      "MISTAKE - THE COMPANY PACKED IT",
      "ALL INTO CRATES AND RAN. TO MARS.",
    ],
    [
      "I KNOW WHAT A SPACEZ COLONY LOOKS",
      "LIKE - I REBUILT THEIR LANDER ONCE.",
      "DOMES. ROBOTS. SECRETS.",
    ],
    [
      "SOMEBODY DOWN HERE TRADED MY",
      "GIRL AWAY LIKE CARGO.",
      "BAD TRADE. FOR THEM.",
    ],
  ],
  width: 2800,
  height: 1500,
  // Mars gravity sits between the moon's float and HQ's snap: hops clear the
  // rover fields without turning the base corridors into a trampoline.
  gravity: 520,
  biome: "mars",
  // Red regolith with oxide-gravel patches outside; the `zones` rect swaps
  // everything east of the dome wall to the base's deck plating (with the
  // HQ vent patches — same fabricator, same floor).
  tiles: {
    ground: { common: "mars_0", rare: "mars_1", rareEvery: 19 },
    patch: { a: "rust_0", b: "rust_1", every: 7 },
    zones: [
      {
        rect: { x: 1560, y: 0, width: 1240, height: 1500 },
        ground: { common: "deck_0", rare: "deck_1", rareEvery: 13 },
        patch: { a: "vent_0", b: "vent_1", every: 9 },
      },
    ],
  },
  foes: "MACHINES",
  // THE MERCHANT, venue three: the colony's commissary keeper, replaced by
  // the same AI that replaced everyone — he kept the scales. Lines in
  // docs/manuscript.md.
  merchant: {
    sprite: "merchant_mars",
    greeting: [
      [
        "A BREATHING CUSTOMER. AT LAST.",
        "I RAN THE COLONY COMMISSARY",
        "TILL THE AI RAN THE NUMBERS.",
      ],
      [
        "IT KEPT THE DOME. I KEPT THE",
        "SCALES. SELL ME WHAT THE",
        "MACHINES DROP - BUY WHAT HELPS.",
      ],
    ],
    returnGreeting: ["THE LIVE ONE RETURNS.", "SCALES ARE STILL HONEST."],
  },
  playerSpawn: { x: 300, y: 750 },
  landmarks: [
    // The hero's ship, parked where the run begins.
    { kind: "starship", pos: { x: 170, y: 750 } },
    // The colony's welcome: a billboard in the middle of nowhere.
    { kind: "billboard", pos: { x: 760, y: 480 }, anchor: "base" },
    // The lizard shrine inside the locked TERRARIUM room.
    { kind: "shrine", pos: { x: 2620, y: 1290 }, anchor: "base" },
  ],
  objective: { type: "killBoss" },
  // The colony's RARE & UNIQUE encounters (config RARE_MOBS): a bad batch
  // off the fembot line or the mission that "lost contact" on most runs,
  // and — one run in five — UNIT ZERO, the first robot SpaceZ ever printed.
  rareSpawns: {
    rare: ["misprinted_fembot", "derelict_rover"],
    unique: ["unit_zero"],
  },
  spawns: [
    // The dust is worked by rovers long before anything notices the hero:
    // scouts thick around the landing site, drill rigs deeper in.
    { enemy: "scout_rover", count: 20, band: [0, 0.3] },
    { enemy: "mining_rover", count: 5, band: [0.25, 0.6] },
    // Inside the dome the staff is metal: servo units on the floor, the
    // fembot line drifting the corridors nearer the boss wing.
    { enemy: "servo_bot", count: 12, band: [0.45, 0.85] },
    { enemy: "fembot", count: 8, band: [0.6, 1.0] },
    // The OPTIMUSK garrison came along from the moon — the same tin men,
    // now wearing colony dust.
    { enemy: "optimusk", count: 5, band: [0.4, 1.0] },
    // The four elites, pinned along the route so the colony's story unspools
    // in walking order: LARRY WEBPAGE indexing the dust outside, BUILD GATES
    // just inside the airlock, OPTIMUSK PRIME running its line from the
    // north chamber, PETER SEAL by his shrine — then the owner himself.
    { enemy: "larry_webpage", at: { x: 1100, y: 520 } },
    { enemy: "build_gates", at: { x: 1760, y: 920 } },
    { enemy: "optimusk_prime", at: { x: 1950, y: 380 } },
    { enemy: "peter_seal", at: { x: 2340, y: 1240 } },
    { enemy: "elon_mosque", at: { x: 2620, y: 700 } },
  ],
  // Work-crews scattered across the dust and the dome floor, dormant until the
  // hero closes on them: scout rovers out on the regolith, the metal staff
  // holding the corridors inside — the colony is swept chamber by chamber.
  packs: [
    { at: { x: 900, y: 650 }, members: [{ enemy: "scout_rover", count: 6 }] },
    {
      at: { x: 1450, y: 950 },
      members: [
        { enemy: "scout_rover", count: 4 },
        { enemy: "mining_rover", count: 2 },
      ],
    },
    {
      at: { x: 2050, y: 560 },
      members: [
        { enemy: "servo_bot", count: 4 },
        { enemy: "fembot", count: 3 },
      ],
    },
  ],
  // The colony wakes up over ~5.5 minutes: rovers first, then the base
  // empties its staff onto the floor, fembots and heavies riding the back
  // half. A touch over the moon's totals — this is level 3.
  waves: {
    rampDurationMs: 330_000,
    maxAlive: 220,
    minAlive: 22,
    moveSpawnEvery: 60,
    budget: [
      { enemy: "scout_rover", count: 450, window: [0, 0.5] },
      { enemy: "servo_bot", count: 350, window: [0.25, 0.75] },
      { enemy: "fembot", count: 250, window: [0.5, 0.95] },
      { enemy: "mining_rover", count: 60, window: [0.35, 1] },
      { enemy: "optimusk", count: 40, window: [0.55, 1] },
    ],
  },
  // The dome wall splits desert from base, with two airlock gaps the horde
  // must funnel through; interior dividers carve the base into chambers, and
  // the TERRARIUM sits locked in the SE corner behind PETER TEAL's keycard.
  walls: [
    // The dome wall, two airlocks.
    {
      kind: "wall",
      from: { x: 1560, y: 8 },
      to: { x: 1560, y: 560 },
      radius: 8,
      jumpable: false,
    },
    {
      kind: "wall",
      from: { x: 1560, y: 700 },
      to: { x: 1560, y: 1000 },
      radius: 8,
      jumpable: false,
    },
    {
      kind: "wall",
      from: { x: 1560, y: 1140 },
      to: { x: 1560, y: 1492 },
      radius: 8,
      jumpable: false,
    },
    // Interior divider between the front chambers and the boss wing.
    {
      kind: "wall",
      from: { x: 2150, y: 8 },
      to: { x: 2150, y: 600 },
      radius: 8,
      jumpable: false,
    },
    {
      kind: "wall",
      from: { x: 2150, y: 740 },
      to: { x: 2150, y: 1150 },
      radius: 8,
      jumpable: false,
    },
    {
      kind: "wall",
      from: { x: 2150, y: 1290 },
      to: { x: 2150, y: 1492 },
      radius: 8,
      jumpable: false,
    },
    // The TERRARIUM: SE corner, map edges close two sides; these walls close
    // the rest, with the locked door as the only way in.
    {
      kind: "wall",
      from: { x: 2450, y: 1160 },
      to: { x: 2450, y: 1492 },
      radius: 8,
      jumpable: false,
    },
    {
      kind: "wall",
      from: { x: 2456, y: 1160 },
      to: { x: 2724, y: 1160 },
      radius: 8,
      jumpable: false,
    },
  ],
  doors: [
    {
      id: "terrarium",
      from: { x: 2730, y: 1160 },
      to: { x: 2790, y: 1160 },
      radius: 8,
    },
  ],
  placedItems: [
    // ADA'S TRAIL (3/5): "I AM NOT CARGO" gouged inside a holding pod in the
    // base half — defiance, pays off the ENGAGEMENT REPORT.
    { kind: "story", defId: "ada_message", pos: { x: 1900, y: 700 } },
    // The TERRARIUM — the tithe-keepers' shrine room: the schedule that says
    // where Ada is headed, and offerings the lizards won't miss.
    { kind: "story", defId: "tribute_schedule", pos: { x: 2620, y: 1380 } },
    { kind: "xp", pos: { x: 2540, y: 1420 } },
    { kind: "xp", pos: { x: 2700, y: 1420 } },
    { kind: "medkit", pos: { x: 2620, y: 1440 } },
  ],
  obstacles: [
    // MARSROCK — the moon slabs' oxidized cousins: sight, shots and blasts
    // all stop at them, and no machine rolls through one.
    {
      kind: "marsrock",
      count: 26,
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
    // Craters — jumpable gaps, exactly like the moon's: shots fly across,
    // rovers pile up at the rim, the player hops them.
    {
      kind: "crater",
      sprite: "crater_red_small",
      count: 10,
      radius: 7,
      jumpable: true,
    },
    {
      kind: "crater",
      sprite: "crater_red_big",
      count: 6,
      radius: 12,
      jumpable: true,
    },
    // Supply crates: dropped everywhere the colony works, hoppable cover.
    { kind: "crate", count: 16, radius: 7, jumpable: true },
  ],
  decor: [
    { kind: "rocks", sprite: "red_rocks", count: 22 },
    // The dust is full of tire tracks — someone's been here for years.
    { kind: "tracks", count: 14 },
  ],
  decorClearance: 80,
  firstKillThoughts: [
    // The first rover: the colony predates the hero's arrival by years.
    { enemy: "scout_rover", thought: "mars_rover" },
    // The first fembot: the hero's read on... that.
    { enemy: "fembot", thought: "mars_fembot" },
  ],
  loot: {
    // The AI-forged pool: weapons the colony machines printed overnight —
    // self-aiming darts, plasma edges, rails, arcs, and a cube on a stick.
    // Introduced at level requirements 10 → 16; rares are properly in season
    // here (the mlvl-10 gate opened late on the moon).
    weaponPool: [
      "smart_pistol",
      "plasma_blade",
      "railgun",
      "arc_projector",
      "graviton_maw",
      "gravity_maul",
      // …plus every earlier stage's arsenal (the bunker idiom): later maps
      // keep dropping earlier bases, so every revisit rung finds live bases
      // in its drop window and the grade ladder unfolds without holes.
      "box_cutter",
      "security_baton",
      "nine_mm",
      "prototype_laser",
      "microwave_emitter",
      "pump_shotgun",
      "lunar_wrench",
      "service_revolver",
      "geology_hammer",
      "surplus_carbine",
      "retro_raygun",
      "pulsar_rod",
    ],
    // The colony printer's wardrobe: monocle to exoplate, introduced at
    // levelReqs 10 → 15 alongside the weapons.
    gearPool: [
      "targeting_monocle",
      "neural_visor",
      "printed_helm",
      "polymer_shell",
      "nanoweave_plate",
      "aegis_exoplate",
      "carbon_leggings",
      "servo_greaves",
      "gecko_soles",
      "mag_boots",
      "red_dust_charm",
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
      "mission_cap",
      "apollo_visor",
      "flight_jacket",
      "micrometeoroid_vest",
      "thermal_leggings",
      "pressure_trousers",
      "lunar_overshoes",
      "moon_boots",
    ],
    abilityPool: ["fire_orbs", "storm_cell", "stasis_field", "item_magnet"],
    // Level-locked world drop (see config WORLD_DROP): DUSTBORN, the light boots
    // that outrun the dust storms — farmed on boss runs of Mars.
    worldUniques: {
      // Bottom tier shares one merged relic batch across the three parallel
      // starting lanes (the former easy/medium/hard drops, incl. COLOSSUS
      // PLATE, terraformer plating); odds self-select as the hero levels.
      easy: ["dustborn", "redwind", "colossus_plate"],
      medium: ["dustborn", "redwind", "colossus_plate"],
      hard: ["dustborn", "redwind", "colossus_plate"],
      // PYRELIGHT (the forge-heart wand) and IRONROOT GREAVES (the planted
      // stance) — the nightmare rung's Mars relics.
      nightmare: ["pyrelight", "ironroot_greaves"],
      // The JESUS rung's Mars haul — the hill-thrower, noon sharpened to a
      // point, the ruin crown, and the wanderer's ring.
      jesus: [
        "meteorfall",
        "sunspear",
        "crown_of_ruin",
        "the_pilgrim_star",
        "the_bulwark",
        "the_ember_hour",
        "the_motherlode",
      ],
    },
    // Level a normal run reaches per rung (`leveling-curve.mjs --by-level`) —
    // past it golden arrows go cold so a Mars replay can't over-level.
    arrowCapByDifficulty: {
      easy: 18,
      medium: 18,
      hard: 18,
      nightmare: 42,
      jesus: 56,
    },
    // The CYBER KATANA arrives early at a kill discovered in play — the
    // run's signature blade, same cadence as the moon's blade.
    earlyDrops: [{ atKills: [40, 100], weapon: "cyber_katana" }],
  },
};
