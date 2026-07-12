// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE BUNKER — the secret cow level. Not part of the campaign (see SECRET in
// ./index.ts): the only way in is the ritual nothing in the game explains —
// kill RASPUTIN in the rift, notice the SEVERED HAND he drops is more than
// junk, USE it, and step through the blast door it tears open. Inside: the
// billionaires' continuity-of-wealth vault, six marble suites strung on one
// narrow corridor spine, each resident ringed by his personal bodyguards
// while the privatized security state (CIA, FBI, soldiers, armed vacuum
// bots) floods the halls. NO boss — the exit door at the far end is the
// objective, the world-drop table is the whole game's relic list at
// sweetened odds (worldDropMult), and the outro is the hero failing to work
// out where the place could possibly have been. The exit leads back to the
// rift (exitTo); farming it again costs another hand.

import type { LevelDef } from "./types.ts";

export const THE_BUNKER: LevelDef = {
  id: "the_bunker",
  // Shares Eastworld's story index ON PURPOSE: secret venues must not shift
  // the campaign's interpolation axis (levelPosition dedupes by index) or
  // sneak into levelsBefore of the shipped maps.
  index: 5,
  name: "THE BUNKER",
  music: "hq_lockdown",
  intro: [
    ["THE HAND FIT THE DOOR.", "THE DOOR FIT NOWHERE.", "IT OPENED ANYWAY."],
    [
      "MARBLE FLOORS. GOLD TAPS.",
      "CANNED CAVIAR TO THE",
      "CEILING. SOMEBODY BUILT A",
      "FIVE-STAR APOCALYPSE",
      "DOWN HERE.",
    ],
    [
      "I KNOW THESE FACES. EVERY",
      "MAGAZINE COVER FROM THE",
      "YEARS THE JOBS DRIED UP.",
      "SO THIS IS WHERE THEY WENT.",
    ],
    [
      "THEY TOOK THE SPIES, THE",
      "ARMY, ICE, AND THE VACUUM",
      "CLEANERS. EVERYONE ELSE",
      "GOT THE WELFARE LINE.",
    ],
    [
      "FINE. THEY HOARDED THE",
      "BEST GEAR IN ANY UNIVERSE.",
      "TIME FOR SOME",
      "REDISTRIBUTION.",
    ],
  ],
  // The exit drops him back in the rift. The ADDRESS of the richest room ever
  // built stays unknowable — on purpose — but the ledger settled what it IS:
  // a prison the machine emptied and locked. They were taken like everyone.
  outro: [
    [
      "THE EXIT SPAT ME BACK",
      "INTO THE RIFT. THE DOOR",
      "SEALED ITSELF, AND THE",
      "SEAM... WANDERED OFF.",
    ],
    [
      "THE LEDGERS ALL READ ZERO.",
      "THEY DIDN'T BUY A BUNKER -",
      "THE MACHINE TOOK THEIR",
      "MONEY AND LOCKED THEM IN.",
      "SAME AS EVERYONE.",
    ],
    [
      "WHERE WAS THAT PLACE?",
      "NO WINDOWS. NO STARS.",
      "EARTH GRAVITY, MOON",
      "SILENCE, MARBLE FROM",
      "NO QUARRY I KNOW.",
    ],
    [
      "UNDER NEVADA? UNDER",
      "ZURICH? UNDER THE MOON?",
      "OR JUST A CELLAR BOLTED",
      "TO THE BACK OF THE",
      "UNIVERSE?",
    ],
    [
      "NO ADDRESS. NO NATION.",
      "NO EXTRADITION. THE",
      "RICHEST ROOM THAT EVER",
      "EXISTED ISN'T ANYWHERE",
      "AT ALL.",
    ],
    [
      "I'LL FIND IT AGAIN THE",
      "SAME WAY: A COLD HAND,",
      "AND A DOOR THAT",
      "SHOULDN'T ANSWER.",
    ],
  ],
  width: 3400,
  height: 1700,
  // Climate-controlled earth-standard: the residents paid for honest
  // gravity. Crates and pallets clear on a hop; walls and columns never.
  gravity: 800,
  biome: "bunker",
  // Polished bunker concrete with a rare inlay tile; burgundy carpet runs
  // clump where the money walks.
  tiles: {
    ground: { common: "bunker_0", rare: "bunker_1", rareEvery: 21 },
    patch: { a: "carpet_0", b: "carpet_1", every: 8 },
  },
  // A habitable vault: the hero walks the marble in his own clothes.
  heroSuited: false,
  foes: "SECURITY",
  playerSpawn: { x: 180, y: 850 },
  landmarks: [
    // The way in: the vault door the severed hand tore open, still ajar.
    {
      kind: "bunker_entrance",
      sprite: "bunker_gate",
      pos: { x: 70, y: 850 },
      anchor: "base",
    },
    // The way out: the service blast door at the far end — the objective.
    {
      kind: "bunker_exit",
      sprite: "blast_door",
      pos: { x: 3320, y: 850 },
      anchor: "base",
    },
  ],
  // No boss. Walking up to the exit door ends the level (then the outro
  // wonders where the bunker could possibly have been).
  objective: { type: "reachExit", at: { x: 3320, y: 850 } },
  // The farm loop's return leg: the victory splash offers BACK TO THE RIFT.
  exitTo: "the_rift",
  // The bunker's RARE & UNIQUE encounters (config RARE_MOBS): a cell of
  // double-payroll suits on most runs, and — one run in five — THE MOLE
  // every agency downstairs is hunting.
  rareSpawns: {
    rare: ["moonlighting_agent"],
    unique: ["the_mole"],
  },
  spawns: [
    // The halls wake up shallow: suits thick around the entrance, housekeeping
    // everywhere, the border detail patrolling the middle, windbreakers
    // deeper in, rifles bending the back half.
    { enemy: "cia_agent", count: 22, band: [0, 0.35] },
    { enemy: "vacuum_bot", count: 14, band: [0, 0.45] },
    { enemy: "ice_agent", count: 10, band: [0.2, 0.6] },
    { enemy: "fbi_agent", count: 10, band: [0.3, 0.7] },
    { enemy: "soldier", count: 8, band: [0.5, 1.0] },
    // The residents, one per suite (rooms NW, N, NE, SW, S, SE), each ringed
    // by his personal detail. The two ranged residents (HALTMAN, ALLISON)
    // hold the exit-side rooms and the deep southwest.
    { enemy: "putain_clone", at: { x: 770, y: 400 } },
    { enemy: "guard_kremlin", at: { x: 700, y: 390 } },
    { enemy: "guard_kremlin", at: { x: 835, y: 345 } },
    { enemy: "guard_kremlin", at: { x: 800, y: 475 } },
    { enemy: "mark_suckerberg", at: { x: 1650, y: 380 } },
    { enemy: "guard_meta", at: { x: 1580, y: 370 } },
    { enemy: "guard_meta", at: { x: 1715, y: 325 } },
    { enemy: "guard_meta", at: { x: 1680, y: 455 } },
    { enemy: "sam_haltman", at: { x: 2580, y: 400 } },
    { enemy: "guard_alignment", at: { x: 2510, y: 390 } },
    { enemy: "guard_alignment", at: { x: 2645, y: 345 } },
    { enemy: "guard_alignment", at: { x: 2610, y: 475 } },
    { enemy: "larry_allison", at: { x: 770, y: 1300 } },
    { enemy: "guard_oracle", at: { x: 700, y: 1290 } },
    { enemy: "guard_oracle", at: { x: 835, y: 1245 } },
    { enemy: "guard_oracle", at: { x: 800, y: 1375 } },
    { enemy: "jeff_baywatch", at: { x: 1650, y: 1320 } },
    { enemy: "guard_prime", at: { x: 1580, y: 1310 } },
    { enemy: "guard_prime", at: { x: 1715, y: 1265 } },
    { enemy: "guard_prime", at: { x: 1680, y: 1395 } },
    { enemy: "donald_dump", at: { x: 2580, y: 1300 } },
    { enemy: "guard_loyalty", at: { x: 2510, y: 1290 } },
    { enemy: "guard_loyalty", at: { x: 2645, y: 1245 } },
    { enemy: "guard_loyalty", at: { x: 2610, y: 1375 } },
  ],
  // The grind is harder than the campaign's: the vault pours longer and
  // denser than Eastworld — the price of the loot table.
  waves: {
    rampDurationMs: 380_000,
    maxAlive: 250,
    minAlive: 26,
    moveSpawnEvery: 52,
    budget: [
      { enemy: "cia_agent", count: 620, window: [0, 0.5] },
      { enemy: "vacuum_bot", count: 400, window: [0, 0.65] },
      { enemy: "ice_agent", count: 320, window: [0.25, 0.75] },
      { enemy: "fbi_agent", count: 360, window: [0.3, 0.8] },
      { enemy: "soldier", count: 260, window: [0.55, 1] },
    ],
  },
  // Six big suites on one narrow corridor spine — the level's signature.
  // The spine (y 790–910) is the only long sightline, its room doorways are
  // offset north/south so crossing traffic zigzags, and the exit hall opens
  // only from the two EASTERN suites: no straight sprint to the door, and a
  // corridor is exactly where you don't want to meet a resident.
  walls: [
    // West wall (corridor mouth open — the entry hall pours in there).
    {
      kind: "bunker_wall",
      sprite: "wall",
      from: { x: 340, y: 8 },
      to: { x: 340, y: 790 },
      radius: 10,
      jumpable: false,
    },
    {
      kind: "bunker_wall",
      sprite: "wall",
      from: { x: 340, y: 910 },
      to: { x: 340, y: 1692 },
      radius: 10,
      jumpable: false,
    },
    // Corridor spine, north side: one doorway per northern suite.
    {
      kind: "bunker_wall",
      sprite: "wall",
      from: { x: 340, y: 790 },
      to: { x: 730, y: 790 },
      radius: 10,
      jumpable: false,
    },
    {
      kind: "bunker_wall",
      sprite: "wall",
      from: { x: 810, y: 790 },
      to: { x: 1610, y: 790 },
      radius: 10,
      jumpable: false,
    },
    {
      kind: "bunker_wall",
      sprite: "wall",
      from: { x: 1690, y: 790 },
      to: { x: 2530, y: 790 },
      radius: 10,
      jumpable: false,
    },
    {
      kind: "bunker_wall",
      sprite: "wall",
      from: { x: 2610, y: 790 },
      to: { x: 3060, y: 790 },
      radius: 10,
      jumpable: false,
    },
    // Corridor spine, south side: doorways offset from the northern ones.
    {
      kind: "bunker_wall",
      sprite: "wall",
      from: { x: 340, y: 910 },
      to: { x: 950, y: 910 },
      radius: 10,
      jumpable: false,
    },
    {
      kind: "bunker_wall",
      sprite: "wall",
      from: { x: 1030, y: 910 },
      to: { x: 1830, y: 910 },
      radius: 10,
      jumpable: false,
    },
    {
      kind: "bunker_wall",
      sprite: "wall",
      from: { x: 1910, y: 910 },
      to: { x: 2750, y: 910 },
      radius: 10,
      jumpable: false,
    },
    {
      kind: "bunker_wall",
      sprite: "wall",
      from: { x: 2830, y: 910 },
      to: { x: 3060, y: 910 },
      radius: 10,
      jumpable: false,
    },
    // Suite dividers, north half (one door each, mid-span).
    {
      kind: "bunker_wall",
      sprite: "wall",
      from: { x: 1200, y: 8 },
      to: { x: 1200, y: 360 },
      radius: 10,
      jumpable: false,
    },
    {
      kind: "bunker_wall",
      sprite: "wall",
      from: { x: 1200, y: 440 },
      to: { x: 1200, y: 790 },
      radius: 10,
      jumpable: false,
    },
    {
      kind: "bunker_wall",
      sprite: "wall",
      from: { x: 2100, y: 8 },
      to: { x: 2100, y: 360 },
      radius: 10,
      jumpable: false,
    },
    {
      kind: "bunker_wall",
      sprite: "wall",
      from: { x: 2100, y: 440 },
      to: { x: 2100, y: 790 },
      radius: 10,
      jumpable: false,
    },
    // Suite dividers, south half.
    {
      kind: "bunker_wall",
      sprite: "wall",
      from: { x: 1200, y: 910 },
      to: { x: 1200, y: 1260 },
      radius: 10,
      jumpable: false,
    },
    {
      kind: "bunker_wall",
      sprite: "wall",
      from: { x: 1200, y: 1340 },
      to: { x: 1200, y: 1692 },
      radius: 10,
      jumpable: false,
    },
    {
      kind: "bunker_wall",
      sprite: "wall",
      from: { x: 2100, y: 910 },
      to: { x: 2100, y: 1260 },
      radius: 10,
      jumpable: false,
    },
    {
      kind: "bunker_wall",
      sprite: "wall",
      from: { x: 2100, y: 1340 },
      to: { x: 2100, y: 1692 },
      radius: 10,
      jumpable: false,
    },
    // East wall: the corridor DEAD-ENDS here — the exit hall opens only
    // through the two eastern suites (HALTMAN's north door, DUMP's south),
    // so leaving means crossing a resident's floor.
    {
      kind: "bunker_wall",
      sprite: "wall",
      from: { x: 3060, y: 8 },
      to: { x: 3060, y: 360 },
      radius: 10,
      jumpable: false,
    },
    {
      kind: "bunker_wall",
      sprite: "wall",
      from: { x: 3060, y: 440 },
      to: { x: 3060, y: 1260 },
      radius: 10,
      jumpable: false,
    },
    {
      kind: "bunker_wall",
      sprite: "wall",
      from: { x: 3060, y: 1340 },
      to: { x: 3060, y: 1692 },
      radius: 10,
      jumpable: false,
    },
  ],
  placedItems: [
    // The capstone reveal, found not told: the ZEROED LEDGER — every
    // resident's fortune transferred to the CORE. The vault is a prison, and
    // the machine already robbed them (see docs/story.md THE BUNKER).
    { kind: "story", defId: "bunker_ledger", pos: { x: 1650, y: 800 } },
    // The entry hall: a welcome the residents never intended.
    { kind: "medkit", pos: { x: 150, y: 700 } },
    { kind: "repair", pos: { x: 150, y: 1000 } },
    // Suite corners, for the fights the doors funnel into.
    { kind: "xp", pos: { x: 770, y: 620 } },
    { kind: "xp", pos: { x: 2580, y: 620 } },
    { kind: "medkit", pos: { x: 1650, y: 150 } },
    { kind: "repair", pos: { x: 1650, y: 1550 } },
    { kind: "xp", pos: { x: 770, y: 1500 } },
    { kind: "medkit", pos: { x: 2900, y: 1500 } },
    // The exit hall: one last kit before the door home.
    { kind: "medkit", pos: { x: 3250, y: 700 } },
  ],
  obstacles: [
    // The residents' stockpiles: server racks and vending machines block
    // outright (and give the shooters cover to duck behind); crates and
    // bullion pallets are the player's hop-overs.
    { kind: "server", count: 14, radius: 9, jumpable: false },
    { kind: "vending", count: 8, radius: 8, jumpable: false },
    { kind: "marble_column", count: 10, radius: 9, jumpable: false },
    { kind: "crate", count: 16, radius: 7, jumpable: true },
    { kind: "gold_pallet", count: 10, radius: 7, jumpable: true },
  ],
  decor: [
    { kind: "money_pile", count: 16 },
    { kind: "papers", count: 18 },
    { kind: "cable", count: 12 },
    { kind: "stain", count: 10 },
  ],
  decorClearance: 80,
  firstSightThoughts: [
    // The arrival read: the first black suit in view tells him whose
    // apocalypse this is. Wide drop-in radius, like HQ's survey.
    { enemy: "cia_agent", thought: "bunker_arrival", radius: 200 },
    // The housekeeping gag, once the arrival read has landed.
    { enemy: "vacuum_bot", thought: "bunker_vacuum", after: "bunker_arrival" },
    // The border gag: down here, HE is the illegal immigrant.
    { enemy: "ice_agent", thought: "bunker_ice", after: "bunker_arrival" },
  ],
  loot: {
    // Everything money buys: the residents' collection spans the whole
    // campaign's late arsenal, plus the armory sidearms their security
    // actually carries (the low-req bases keep early drops honest).
    weaponPool: [
      "nine_mm",
      "pump_shotgun",
      "gladius",
      "longbow",
      "blunderbuss",
      "executioners_axe",
      "sorcerers_staff",
      "ember_wand",
      "mono_wire_lariat",
      "plasma_peacemaker",
      "branding_iron",
      "maglev_repeater",
      "snake_oil_sprayer",
      "high_noon",
    ],
    gearPool: [
      "riot_helmet",
      "kevlar_vest",
      "knights_helm",
      "great_helm",
      "centurion_cuirass",
      "chainmail_hauberk",
      "dragonscale_cloak",
      "plate_greaves",
      "sabatons",
      "servo_stetson",
      "mirrorshade_visor",
      "exo_duster",
      "tin_star_cuirass",
      "rattlesnake_chaps",
      "spur_jet_boots",
      "stardust_charm",
      "crystal_orb",
      "enchanted_ring",
      "bag",
    ],
    abilityPool: ["fire_orbs", "storm_cell", "stasis_field", "item_magnet"],
    // The cow-level table: the WHOLE game's world relics rain here — every
    // level's list merged, at sweetened odds (worldDropMult) — so the vault
    // is the one venue that can pay out anything. Still behind the standing
    // per-rung player-level gates (config WORLD_DROP.minPlayerLevel).
    worldUniques: {
      easy: [
        "the_first_draft",
        "the_pale_covenant",
        "deadstar",
        "dustborn",
        "excalibur",
        "the_trinity_shard",
        "pale_rider",
      ],
      medium: [
        "deadsprint",
        "marecrest",
        "redwind",
        "wishbane",
        "gorgonscale",
        "mjolnir",
        "herdbreaker",
        "the_last_roundup",
      ],
      hard: [
        "longwatch",
        "huntsmans_cowl",
        "colossus_plate",
        "oathbrand",
        "the_inevitable",
      ],
      nightmare: [
        "stormlash",
        "falconmail",
        "omensight",
        "veilwalkers",
        "pyrelight",
        "ironroot_greaves",
        "gravemaker",
        "hordebane",
        "dragons_breath",
        "the_reckoning",
        "skybreaker",
        "sunwreath",
      ],
      jesus: [
        "lightbinder",
        "starsight",
        "the_anvil",
        "worldsplitter",
        "titanstride",
        "the_immovable",
        "earthfast",
        "the_stillward",
        "meteorfall",
        "sunspear",
        "crown_of_ruin",
        "the_pilgrim_star",
        "the_verdict",
        "horizons_end",
        "kingsbane",
        "the_long_silence",
        "windgrave",
        "nightfall",
        "maelstrom",
        "starforge_plate",
        "starfall",
        "emberheart",
      ],
    },
    // "A bit higher" world-drop odds than the relics' home levels — the
    // farm-venue sweetener, applied per roll in maybeDropWorldUnique.
    worldDropMult: 1.5,
    // Arrows go cold at the campaign's own end-levels (Eastworld's caps):
    // the vault farms LOOT, not levels — a grind here can't out-level the
    // campaign's pacing.
    arrowCapByDifficulty: {
      easy: 19,
      medium: 32,
      hard: 43,
      nightmare: 53,
      jesus: 60,
    },
  },
};
