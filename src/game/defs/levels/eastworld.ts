// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// LEVEL 5 — EASTWORLD. The rift's far side: a knockoff wild-west theme park
// built in Russia by VLADIMIR PUTAIN and STEVEN SEAGULL, run on robotics and
// intelligence licensed from ZAI — the reality PUTAIN retreated into to
// escape the one where he loses. A tight frontier town (large house
// obstacles + storefront wall rows squeeze the streets, so escaping the
// horde is hard), and a fenced CONTROL CENTER compound at the east end
// behind SEAGULL's keycard. EDWARD SNOW — the whistleblower whose leaked
// archive trained the SUPERCORE — watches the town from the water tower.
// ELON MOSQUE is cornered inside and finally
// DIES (trash loot and all); the finale is THE ZAI SUPERCORE, shielded by
// the three GROK controllers who shoot from behind the compound's rocks.
// Killing it quakes the whole park and plays the campaign's EPILOGUE (the
// `outro` — the world gets its jobs back, and Ada comes home).

import type { LevelDef } from "./types.ts";

export const EASTWORLD: LevelDef = {
  id: "eastworld",
  index: 5,
  name: "EASTWORLD",
  // The between-level scene: the rift's far door with Eastworld's daylight
  // leaking through — the hero steps out of the void and into a western.
  prelude: "rift_exit",
  // The galloping desert-western drive — written for red dust, at home on it.
  music: "red_dust",
  intro: [
    ["I STEPPED THROUGH THE", "RIFT'S FAR SIDE... AND", "LANDED IN A WESTERN."],
    [
      "DUST. SALOONS. A ROBOT",
      "TIPPED ITS HAT AT ME.",
      "ADA'S BEACON IS SCREAMING",
      "FROM THE BIG BUILDING EAST.",
    ],
    [
      "THE SIGN SAYS 'EASTWORLD'.",
      "THE FINE PRINT SAYS",
      "'POWERED BY ZAI'.",
      "OF COURSE IT IS. OF COURSE.",
    ],
    [
      "EVERY MACHINE HERE RUNS ON",
      "THE THING THAT TOOK MY JOB.",
      "TIME TO FILE A COMPLAINT.",
    ],
    ["HANG ON, ADA. I'M COMING.", "YEE-HAW, I GUESS."],
  ],
  // The campaign's EPILOGUE — played over black when the SUPERCORE falls
  // (the victory quake shakes the park through the loot-grab window first).
  outro: [
    [
      "THE SUPERCORE DIED, AND THE",
      "WHOLE PARK SHOOK LIKE IT",
      "MISSED A HEARTBEAT. EVERY",
      "HOST TOOK OFF ITS HAT AND",
      "SAT DOWN.",
    ],
    [
      "SHE WAS IN THE CONTROL ROOM,",
      "BEHIND GLASS, FURIOUS. FIRST",
      "THING SHE SAID: 'YOU TOOK",
      "YOUR TIME.' SECOND: 'NICE",
      "HAT.'",
    ],
    [
      "WE WALKED HOME THROUGH THE",
      "RIFT. BEHIND US, EASTWORLD",
      "RUSTED IN PEACE.",
    ],
    [
      "WITH THE CORE GONE, THE",
      "MACHINES STOPPED WORKING",
      "EVERYONE'S JOBS. PEOPLE GOT",
      "HIRED BACK. PAYCHECKS.",
      "RENT PAID.",
    ],
    [
      "THE WORLD TURNED INTO A",
      "PLACE WHERE PEOPLE HAD",
      "JOBS AND COULD AFFORD TO",
      "LIVE. AND ON FRIDAY -",
    ],
    [
      "MOVIE NIGHT. CHIPS AND",
      "SODA. SHE WENT OUT FOR",
      "THEM. I WENT WITH HER.",
    ],
  ],
  width: 3200,
  height: 1600,
  // Earth-standard-ish gravity for an earth-built park: hops are honest,
  // barrels and wagons clear, houses never.
  gravity: 700,
  biome: "eastworld",
  // Sun-baked hardpan with dry-scrub patches; the control-center compound
  // (the zone rect, east) runs on the same ZAI deck plating as the Mars base
  // — same fabricator, same floor.
  tiles: {
    ground: { common: "hardpan_0", rare: "hardpan_1", rareEvery: 15 },
    patch: { a: "scrub_0", b: "scrub_1", every: 8 },
    zones: [
      {
        rect: { x: 2500, y: 480, width: 700, height: 640 },
        ground: { common: "deck_0", rare: "deck_1", rareEvery: 13 },
      },
    ],
  },
  foes: "HOSTS",
  // A habitable theme park with breathable dust: the hero stows the EVA suit
  // and walks the west in his own clothes.
  heroSuited: false,
  // THE BARKEEP: the same impossible trader, polishing glasses for robots
  // that don't drink — and quietly fencing the park owner's estate
  // (`stockUniques`, priced so PUTAIN's own watches are the way to afford it).
  merchant: {
    sprite: "merchant_eastworld",
    name: "THE BARKEEP",
    greeting: [
      [
        "WELL HOWDY. MIND THE GLASSES -",
        "THE ROBOTS DON'T DRINK, BUT",
        "THEY TIP IN PARTS.",
      ],
      [
        "YES, IT'S ME. A MARKET FELL",
        "THROUGH A RIFT AND I FELL WITH",
        "IT. THE HAT IS NEW.",
      ],
      [
        "I'VE COME INTO SOME... ESTATE",
        "PIECES. THE OWNER'S OWN",
        "WARDROBE. PRICES ARE FIRM.",
        "BRING WATCHES.",
      ],
    ],
    stockUniques: [
      "putains_tracksuit",
      "the_kremlin_ushanka",
      "honorary_black_belt",
    ],
  },
  playerSpawn: { x: 300, y: 800 },
  landmarks: [
    // The way in: the rift's far side, still hanging behind the hero.
    { kind: "rift", pos: { x: 170, y: 800 } },
    // The park gate: EASTWORLD, spelled out over the road.
    { kind: "eastworld_gate", pos: { x: 840, y: 700 }, anchor: "base" },
    // The town water tower, leaking since opening day.
    { kind: "water_tower", pos: { x: 1500, y: 520 }, anchor: "base" },
    // The control center: the big building ADA's beacon points at. The
    // SUPERCORE guards its own doorstep inside the compound.
    { kind: "control_center", pos: { x: 2950, y: 620 }, anchor: "base" },
  ],
  objective: { type: "killBoss" },
  // The park's RARE & UNIQUE encounters (config RARE_MOBS): a haywire
  // welcome committee or a bootleg outlaw print on most runs, and — one run
  // in five — THE ONE-ARMED BANDIT, gilded in other people's coin.
  rareSpawns: {
    rare: ["haywire_greeter", "counterfeit_outlaw"],
    unique: ["one_armed_bandit"],
  },
  spawns: [
    // The park wakes up shallow: greeters thick around the gate, brawlers
    // and outlaws down main street, longhorns bending the back half.
    { enemy: "cowbot", count: 24, band: [0, 0.3] },
    { enemy: "saloon_brawler", count: 8, band: [0.25, 0.6] },
    { enemy: "tin_outlaw", count: 10, band: [0.45, 0.85] },
    { enemy: "longhorn", count: 5, band: [0.5, 1.0] },
    // THE SUPERCORE first: it anchors the difficulty axis at the control
    // center (bands scale from the spawn toward the first listed boss).
    { enemy: "zai_supercore", at: { x: 2900, y: 800 } },
    // The three controllers, spread across the compound's rock garden —
    // they hold the shield until all three are down.
    { enemy: "grok_alpha", at: { x: 2700, y: 640 } },
    { enemy: "grok_beta", at: { x: 2780, y: 960 } },
    { enemy: "grok_gamma", at: { x: 3020, y: 700 } },
    // MOSQUE, cornered in the compound with his customer. Nowhere to flee.
    { enemy: "elon_mosque_eastworld", at: { x: 2620, y: 900 } },
    // The celebrity staff, pinned along the road in walking order: the
    // co-founder guards the town's east end (and the compound keycard),
    // the owner holds the square, the actor is parked south of the road —
    // and the whistleblower watches it all from under the water tower,
    // the best sightline in town.
    { enemy: "steven_seagull", at: { x: 2340, y: 780 } },
    { enemy: "vladimir_putain", at: { x: 1700, y: 760 } },
    { enemy: "gerald_depardieu", at: { x: 1380, y: 1180 } },
    { enemy: "edward_snow", at: { x: 1560, y: 480 } },
  ],
  // The park pours for ~6 minutes, a notch over the rift — this is level 5.
  waves: {
    rampDurationMs: 360_000,
    maxAlive: 240,
    minAlive: 25,
    moveSpawnEvery: 56,
    budget: [
      { enemy: "cowbot", count: 560, window: [0, 0.5] },
      { enemy: "saloon_brawler", count: 320, window: [0.25, 0.75] },
      { enemy: "tin_outlaw", count: 300, window: [0.5, 0.95] },
      { enemy: "longhorn", count: 80, window: [0.4, 1] },
    ],
  },
  // The town: two storefront rows squeeze main street into a corridor (door
  // gaps are the alleys), and the control-center compound walls the east end
  // — its west gap is the locked door SEAGULL's pass opens.
  walls: [
    // Main street, north row (alley gaps between segments).
    {
      kind: "storefront",
      from: { x: 1010, y: 690 },
      to: { x: 1250, y: 690 },
      radius: 11,
      jumpable: false,
    },
    {
      kind: "storefront",
      from: { x: 1330, y: 690 },
      to: { x: 1580, y: 690 },
      radius: 11,
      jumpable: false,
    },
    {
      kind: "storefront",
      from: { x: 1660, y: 690 },
      to: { x: 1910, y: 690 },
      radius: 11,
      jumpable: false,
    },
    {
      kind: "storefront",
      from: { x: 1990, y: 690 },
      to: { x: 2230, y: 690 },
      radius: 11,
      jumpable: false,
    },
    // Main street, south row.
    {
      kind: "storefront",
      from: { x: 1050, y: 910 },
      to: { x: 1290, y: 910 },
      radius: 11,
      jumpable: false,
    },
    {
      kind: "storefront",
      from: { x: 1370, y: 910 },
      to: { x: 1620, y: 910 },
      radius: 11,
      jumpable: false,
    },
    {
      kind: "storefront",
      from: { x: 1700, y: 910 },
      to: { x: 1950, y: 910 },
      radius: 11,
      jumpable: false,
    },
    {
      kind: "storefront",
      from: { x: 2030, y: 910 },
      to: { x: 2270, y: 910 },
      radius: 11,
      jumpable: false,
    },
    // The compound fence: a box with one gap on the west side (the door).
    {
      kind: "compound_fence",
      from: { x: 2500, y: 500 },
      to: { x: 3120, y: 500 },
      radius: 10,
      jumpable: false,
    },
    {
      kind: "compound_fence",
      from: { x: 3120, y: 500 },
      to: { x: 3120, y: 1100 },
      radius: 10,
      jumpable: false,
    },
    {
      kind: "compound_fence",
      from: { x: 2500, y: 1100 },
      to: { x: 3120, y: 1100 },
      radius: 10,
      jumpable: false,
    },
    {
      kind: "compound_fence",
      from: { x: 2500, y: 500 },
      to: { x: 2500, y: 750 },
      radius: 10,
      jumpable: false,
    },
    {
      kind: "compound_fence",
      from: { x: 2500, y: 850 },
      to: { x: 2500, y: 1100 },
      radius: 10,
      jumpable: false,
    },
    // The controllers' rock garden: hand-placed cover inside the compound —
    // the rocks the GROKs duck behind between shots (and the player's own
    // cover against them; solid, so shots stop at them).
    {
      kind: "eastrock",
      from: { x: 2660, y: 730 },
      to: { x: 2680, y: 730 },
      radius: 10,
      jumpable: false,
    },
    {
      kind: "eastrock",
      from: { x: 2790, y: 860 },
      to: { x: 2810, y: 860 },
      radius: 10,
      jumpable: false,
    },
    {
      kind: "eastrock",
      from: { x: 2930, y: 950 },
      to: { x: 2950, y: 950 },
      radius: 10,
      jumpable: false,
    },
    {
      kind: "eastrock",
      from: { x: 3010, y: 620 },
      to: { x: 3030, y: 620 },
      radius: 10,
      jumpable: false,
    },
    {
      kind: "eastrock",
      from: { x: 2610, y: 560 },
      to: { x: 2630, y: 560 },
      radius: 10,
      jumpable: false,
    },
    {
      kind: "eastrock",
      from: { x: 2860, y: 680 },
      to: { x: 2880, y: 680 },
      radius: 10,
      jumpable: false,
    },
  ],
  // The control center's gate: SEAGULL's ALL-ACCESS PASS opens it.
  doors: [
    {
      id: "control",
      from: { x: 2500, y: 758 },
      to: { x: 2500, y: 842 },
      radius: 10,
    },
  ],
  placedItems: [
    // The park brochure by the gate — the arrival's paper trail.
    { kind: "story", defId: "park_brochure", pos: { x: 900, y: 840 } },
    // ADA'S TRAIL (5/5): a host she jammed dead with its own hat, out on main
    // street — sabotage from inside the control room (sets up "nice hat").
    { kind: "story", defId: "ada_host", pos: { x: 1500, y: 760 } },
    { kind: "repair", pos: { x: 1620, y: 800 } },
    { kind: "medkit", pos: { x: 1180, y: 1050 } },
    // Compound supplies, for the fight the door was locked around.
    { kind: "medkit", pos: { x: 2570, y: 620 } },
    { kind: "xp", pos: { x: 2640, y: 1040 } },
    { kind: "xp", pos: { x: 3060, y: 900 } },
  ],
  obstacles: [
    // The houses: building-sized footprints that make the town genuinely
    // TIGHT — the level's signature. Nothing hops a house; route around, or
    // get cornered against one.
    {
      kind: "house",
      count: 11,
      radius: 42,
      jumpable: false,
      rockSizes: [
        [4, 3],
        [3, 2],
        [5, 3],
      ],
      cell: 16,
    },
    // Desert boulders: solid cover (sight, shots and blasts stop at them).
    {
      kind: "eastrock",
      count: 9,
      radius: 9,
      jumpable: false,
      rockSizes: [
        [1, 1],
        [1, 2],
        [2, 2],
      ],
      cell: 16,
    },
    // Hoppable street furniture: barrels, wagons, and the park's fake cacti.
    { kind: "barrel", count: 14, radius: 6, jumpable: true },
    { kind: "wagon", count: 6, radius: 9, jumpable: true },
    { kind: "cactus", count: 12, radius: 6, jumpable: true },
  ],
  decor: [
    { kind: "tumbleweed", count: 22 },
    { kind: "cow_skull", count: 8 },
    { kind: "dry_shrub", count: 18 },
    { kind: "horseshoe", count: 6 },
  ],
  decorClearance: 80,
  firstSightThoughts: [
    // The first cowbot in view doubles as the arrival read: a town of
    // machines pretending it's 1880. Wide drop-in radius, like HQ's survey.
    { enemy: "cowbot", thought: "eastworld_arrival", radius: 200 },
  ],
  firstKillThoughts: [
    // The first host down: ZAI's brain in spurs — the job thread comes home.
    { enemy: "cowbot", thought: "eastworld_hosts", after: "eastworld_arrival" },
  ],
  loot: {
    // The control center's hybrid arsenal: frontier silhouettes off ZAI
    // fabricators, introduced at the normal band's top rungs (18 → 23).
    weaponPool: [
      "mono_wire_lariat",
      "plasma_peacemaker",
      "branding_iron",
      "maglev_repeater",
      "snake_oil_sprayer",
      "high_noon",
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
      "smart_pistol",
      "plasma_blade",
      "railgun",
      "arc_projector",
      "graviton_maw",
      "gravity_maul",
      "gladius",
      "longbow",
      "blunderbuss",
      "executioners_axe",
      "sorcerers_staff",
      "ember_wand",
    ],
    // The park wardrobe: cowboy silhouettes over printed shells (18 → 23),
    // plus the badge and the bag.
    gearPool: [
      "servo_stetson",
      "mirrorshade_visor",
      "exo_duster",
      "tin_star_cuirass",
      "rattlesnake_chaps",
      "spur_jet_boots",
      "sheriffs_badge",
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
      "viking_helm",
      "knights_helm",
      "great_helm",
      "centurion_cuirass",
      "chainmail_hauberk",
      "dragonscale_cloak",
      "chausses",
      "plate_greaves",
      "legionary_sandals",
      "sabatons",
    ],
    abilityPool: ["fire_orbs", "storm_cell", "stasis_field", "item_magnet"],
    // The PRAIRIE IRON arrives early at a kill discovered in play — the
    // level's signature revolver, same cadence as the rift's void wand.
    earlyDrops: [{ atKills: [30, 80], weapon: "prairie_iron" }],
    // The park's relics: PALE RIDER (the easy rung's ranged build) rides the
    // signature revolver; the medium rung fields BOTH melee choices — the
    // brand and the lariat — so the build isn't hostage to one legendary.
    worldUniques: {
      easy: ["pale_rider"],
      medium: ["herdbreaker", "the_last_roundup"],
      // OATHBRAND — the last honest lawman's monomolecular blade (the hard
      // rung's melee anchor).
      hard: ["oathbrand"],
      // HORDEBANE (the axe made for too many), DRAGON'S BREATH (the park's
      // monster-of-legend scattergun), and SKYBREAKER — the nightmare rung's
      // ranged LEGENDARY, tearing the sky with every landed round.
      nightmare: ["hordebane", "dragons_breath", "skybreaker"],
      // The JESUS rung's park haul — the ruling revolver, the horizon rifle,
      // and three LEGENDARIES: KINGSBANE (never misses, bursts on hit), THE
      // LONG SILENCE (kills detonate), WINDGRAVE (the wind's own spurs).
      jesus: [
        "the_verdict",
        "horizons_end",
        "kingsbane",
        "the_long_silence",
        "windgrave",
      ],
    },
    // Level a normal run reaches per rung (`leveling-curve.mjs --by-level`) —
    // the campaign's FINAL map, so these are each difficulty's end level; past
    // it golden arrows go cold so a replay can't over-level.
    arrowCapByDifficulty: {
      easy: 19,
      medium: 32,
      hard: 43,
      nightmare: 53,
      jesus: 60,
    },
  },
};
