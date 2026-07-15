// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// LEVEL 4 — THE RIFT. MOSQUE tore a hole in the world on Mars and ran; the
// hero walks in after him. A hallucinatory space between universes: no
// ground (the void tiles ARE the floor — the boots grip something that
// isn't there), gravity turned soft, black holes strewn across the road,
// asteroids streaking through, and history's missing wandering the noise.
// GROK OMEGA — ZAI's secret superintelligence — guards the deep end and
// spills the level's reveal; MOSQUE flees a second time at the far door.

import type { LevelDef } from "./types.ts";

export const THE_RIFT: LevelDef = {
  id: "the_rift",
  index: 4,
  name: "THE RIFT",
  // The between-level scene: walking into the tear MOSQUE left hanging on
  // Mars — the jump the intro's first page used to narrate, now shown.
  prelude: "rift_entry",
  music: "rift_drift",
  intro: [
    [
      "THERE'S NO FLOOR IN HERE.",
      "NO SKY. NO NORTH. MY BOOTS",
      "GRIP SOMETHING ANYWAY.",
    ],
    [
      "THE MARS TABLET SAID IT PLAIN:",
      "ADA IS THE TRIBUTE, HANDED OVER",
      "IN HERE. SHE CAME THROUGH THIS PLACE.",
    ],
    [
      "HER BEACON PINGS FROM",
      "EVERYWHERE AT ONCE. EVEN THE",
      "SIGNAL IS HALLUCINATING.",
    ],
    ["FIND THE FAR SIDE. CATCH", "THE COWARD. BRING HER HOME."],
  ],
  width: 3000,
  height: 1600,
  // Between-universe gravity: floatier than the moon (340) without turning
  // every hop into a minute of flight — jumps here are long, dreamy glides
  // that clear black holes and asteroids alike.
  gravity: 200,
  biome: "rift",
  // The void: star-flecked nothing underfoot, with nebula wisps clustering
  // where the hallucination pools.
  tiles: {
    ground: { common: "void_0", rare: "void_1", rareEvery: 17 },
    patch: { a: "nebula_0", b: "nebula_1", every: 8 },
  },
  foes: "ENTITIES",
  // THE MERCHANT, final venue — and the reveal: the hooded trader between
  // universes has been every shopkeeper the hero met. Every market he ever
  // ran fell through here eventually. Lines in docs/manuscript.md.
  merchant: {
    sprite: "merchant",
    greeting: [
      [
        "AH. YOU AGAIN. DON'T LOOK",
        "SO SURPRISED - EVERY MARKET",
        "I RAN FELL THROUGH HERE.",
      ],
      [
        "THE VENDING MACHINES. THE",
        "MOON. THE DOME. ALL ROADS",
        "LEAD HERE. COIN SPENDS ON ALL.",
      ],
      [
        "BRING ME RELICS, TRAVELER.",
        "TAKE WHAT YOU NEED.",
        "WE'RE BOTH FAR FROM HOME.",
      ],
    ],
    returnGreeting: ["YOU AGAIN. OF COURSE.", "ALL ROADS STILL LEAD HERE."],
  },
  playerSpawn: { x: 300, y: 800 },
  landmarks: [
    // The way in: the rift MOSQUE tore open on Mars, still hanging behind
    // the hero's shoulder.
    { kind: "rift", pos: { x: 170, y: 800 } },
    // The way out: the far door the tribute was carried through. The same
    // wound in space, at the other end of the road — MOSQUE flees through
    // it, and the story follows next level.
    { kind: "far_door", sprite: "rift", pos: { x: 2900, y: 800 } },
  ],
  objective: { type: "killBoss" },
  // The void's RARE & UNIQUE encounters (config RARE_MOBS): a stray comet
  // flock or a collapsed star on most runs, and — one run in five — THE
  // LAST PHOTON, of which there is exactly one.
  rareSpawns: {
    rare: ["stray_comet", "collapsed_star"],
    unique: ["the_last_photon"],
  },
  // The cow level's door: latent until THE SEVERED HAND (RASPUTIN's junk-
  // looking drop) is USED here — then a blast door tears open beside the
  // hero and steps through to THE BUNKER. Nothing in the game explains this.
  gates: [
    {
      id: "bunker_gate",
      to: "the_bunker",
      opensWith: "severed_hand",
      sprite: "bunker_gate",
    },
  ],
  // Black holes strewn along the road: each drags the grounded (into the core
  // is instant death), devours minions, and hoards loot dragged in from a
  // screen away onto its rim. Skirt them — a jump no longer clears the pull,
  // it only lightens it (you still drift in and hop lower over the horizon),
  // so the safe line is around, not over. Dashing in for the rim loot is a
  // real gamble: get stuck and the hole swallows you.
  wells: [
    { pos: { x: 700, y: 500 } },
    { pos: { x: 900, y: 1150 } },
    { pos: { x: 1400, y: 750 } },
    { pos: { x: 1750, y: 300 } },
    { pos: { x: 1900, y: 1250 } },
    { pos: { x: 2350, y: 950 } },
    { pos: { x: 2600, y: 450 } },
  ],
  // The rock rain: every few seconds an asteroid streaks across the hero's
  // patch of nothing. Dodge with the feet or the jump — each strike takes a
  // difficulty-scaled bite of his health (20%→75% up the ladder). The first
  // one to land pauses for his "watch out for these" read.
  asteroids: { everyMs: [2800, 5200], struckThought: "rift_asteroid" },
  spawns: [
    // The void wakes up shallow: voidlings thick around the entry rift,
    // jellies and unravelers deeper in, gravitons bending the back half.
    { enemy: "voidling", count: 22, band: [0, 0.3] },
    { enemy: "star_jelly", count: 8, band: [0.25, 0.6] },
    { enemy: "unraveler", count: 10, band: [0.45, 0.85] },
    { enemy: "graviton", count: 5, band: [0.5, 1.0] },
    // MOSQUE first: he anchors the difficulty axis at the far door (bands
    // scale from the spawn toward the first listed boss).
    { enemy: "elon_mosque_rift", at: { x: 2850, y: 800 } },
    { enemy: "grok_omega", at: { x: 2450, y: 780 } },
    // History's missing, pinned along the road so the rift's story unspools
    // in walking order: the escape artist's welcome, the physics, Ada's
    // trail, the King's advice, the tribute road's doorman.
    { enemy: "harry_houdini", at: { x: 650, y: 900 } },
    { enemy: "nikola_tesla", at: { x: 950, y: 650 } },
    { enemy: "amelia_earhart", at: { x: 1500, y: 1050 } },
    { enemy: "the_king", at: { x: 1800, y: 850 } },
    { enemy: "grigori_rasputin", at: { x: 2150, y: 700 } },
    // Folklore's missing: LUCKY guards his pot off the main road — a detour
    // reward. Spare him for the magic-find aura, or kill him for the clover.
    { enemy: "lucky", at: { x: 1150, y: 1280 } },
  ],
  // Knots of the void condensing along the road, still until the hero drifts
  // near, then unfolding onto him: voidlings up front, jellies mid-rift, the
  // unravelers and a graviton bending the deep stretch before the boss.
  packs: [
    { at: { x: 800, y: 760 }, members: [{ enemy: "voidling", count: 6 }] },
    {
      at: { x: 1400, y: 980 },
      members: [
        { enemy: "voidling", count: 4 },
        { enemy: "star_jelly", count: 2 },
      ],
    },
    {
      at: { x: 2050, y: 660 },
      members: [
        { enemy: "unraveler", count: 3 },
        { enemy: "graviton", count: 2 },
      ],
    },
  ],
  // The rift pours for ~5.7 minutes, a touch over Mars — this is level 4.
  waves: {
    rampDurationMs: 340_000,
    maxAlive: 230,
    minAlive: 24,
    moveSpawnEvery: 58,
    budget: [
      { enemy: "voidling", count: 500, window: [0, 0.5] },
      { enemy: "star_jelly", count: 300, window: [0.25, 0.75] },
      { enemy: "unraveler", count: 280, window: [0.5, 0.95] },
      { enemy: "graviton", count: 70, window: [0.4, 1] },
    ],
  },
  placedItems: [
    // ADA'S TRAIL (4/5): a scrap of her zipper-fixed jacket (the prelude
    // callback) snagged on a shard, wrapped around a lizard-god scale.
    { kind: "story", defId: "ada_jacket", pos: { x: 1500, y: 500 } },
    // The burnt ZAI probe — the reveal's paper trail — parked inside a black
    // hole's pull, so the proof costs a dip toward the horizon. The wells
    // drag these onto their rims: loot ON the event horizon.
    { kind: "story", defId: "zai_probe", pos: { x: 1900, y: 1180 } },
    { kind: "xp", pos: { x: 2380, y: 990 } },
    { kind: "xp", pos: { x: 740, y: 540 } },
    { kind: "medkit", pos: { x: 1440, y: 790 } },
  ],
  obstacles: [
    // Crystallized moments — shards of somewhere else, frozen mid-fall.
    // Solid: sight, shots and blasts stop at them.
    { kind: "rift_shard", count: 16, radius: 9, jumpable: false },
    // Drifting junk from a thousand universes: hoppable cover.
    { kind: "space_junk", count: 14, radius: 7, jumpable: true },
  ],
  decor: [
    { kind: "stardust", count: 26 },
    { kind: "floating_rock", count: 16 },
    // Somebody's living room is missing its television. It floats here now,
    // still tuned to WEBFLIX.
    { kind: "lost_tv", count: 6 },
  ],
  decorClearance: 80,
  firstSightThoughts: [
    // The first voidling in view doubles as the hero's arrival read: he is
    // standing on nothing, and the nothing holds.
    { enemy: "voidling", thought: "rift_arrival" },
  ],
  firstKillThoughts: [
    // The first graviton down: space here bends around a grudge.
    { enemy: "graviton", thought: "rift_graviton" },
  ],
  loot: {
    // The historic pool: all of history falls through the rift — a Roman
    // blade, an English warbow, powder arms, and things history never had.
    // Introduced at level requirements 15 → 23, the base ladder's top; the
    // rift is also the one MAGICAL level, so the fantasy gear (clover, orb,
    // grimoire, ring, dragonscale) drops only here.
    weaponPool: [
      "gladius",
      "longbow",
      "blunderbuss",
      "executioners_axe",
      "sorcerers_staff",
      "ember_wand",
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
    ],
    // History's armory, leaning medieval — legion sandals to the great
    // helm (levelReqs 15 → 22) — plus the fantasy charms only the rift rains.
    gearPool: [
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
      "stardust_charm",
      // (The LUCKY CLOVER is LUCKY's signature drop now — kill him for it,
      // or spare him and take the magic-find aura instead.)
      "crystal_orb",
      "grimoire",
      "enchanted_ring",
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
    ],
    abilityPool: ["fire_orbs", "storm_cell", "stasis_field", "item_magnet"],
    // Level-locked world drops (see config WORLD_DROP): the Rift is a tear in
    // history, so it coughs up two relics from Earth's past — EXCALIBUR (the
    // once-and-future blade) and THE TRINITY SHARD (trinitite glass). Farmed on
    // boss runs of the Rift.
    worldUniques: {
      // Bottom tier shares one merged relic batch across the three parallel
      // starting lanes (the former easy + medium drops; the old hard rung
      // carried none here); odds self-select as the hero levels through.
      easy: ["excalibur", "the_trinity_shard", "wishbane", "gorgonscale"],
      medium: ["excalibur", "the_trinity_shard", "wishbane", "gorgonscale"],
      hard: ["excalibur", "the_trinity_shard", "wishbane", "gorgonscale"],
      // GRAVEMAKER (the burying maul) and the nightmare rung's other two
      // LEGENDARIES: THE RECKONING (the cursed blade that answers every blow
      // taken with lightning) and SUNWREATH (the dead star's burning crown).
      nightmare: ["gravemaker"],
      // The JESUS rung's rift haul — the void-quenched claymore, the storm
      // door, star-struck plate, and two LEGENDARIES: STARFALL (kills pull
      // the sky down) and EMBERHEART (the burning heart, forever fire for
      // any build).
      jesus: [
        "nightfall",
        "maelstrom",
        "starforge_plate",
        "the_still_point",
        "the_fixed_star",
        "the_far_shore",
      ],
    },
    // Level a normal run reaches per rung (`leveling-curve.mjs --by-level`) —
    // past it golden arrows go cold so a Rift replay can't over-level.
    arrowCapByDifficulty: {
      easy: 24,
      medium: 24,
      hard: 24,
      nightmare: 45,
      jesus: 58,
    },
    // The VOID WAND arrives early at a kill discovered in play — the level's
    // signature caster, same cadence as Mars's katana.
    earlyDrops: [{ atKills: [35, 90], weapon: "void_wand" }],
  },
};
