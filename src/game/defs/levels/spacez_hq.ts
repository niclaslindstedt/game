// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// LEVEL 1 — SPACEZ HQ. Ada's trail points off-planet and our hero builds
// spaceships for a living — but his garage ship's engine needs the one
// part SpaceZ keeps in its cleanroom, and the night shift is not
// letting it leave the building. Office rooms and lab corridors are carved
// by solid walls with door gaps; MUSKRAT, the mutant rat who ATE the
// part, nests under the prototype rocket on the far side.

import type { LevelDef } from "./types.ts";

export const SPACEZ_HQ: LevelDef = {
  id: "spacez_hq",
  index: 1,
  name: "SPACEZ HQ",
  prelude: "prelude",
  music: "hq_lockdown",
  intro: [
    [
      "ADA WENT OUT FOR CHIPS AND",
      "SODA TWO HOURS AGO.",
      "SHE NEVER CAME BACK.",
    ],
    [
      "THE TRACKER I SEWED INTO HER",
      "JACKET JUST PINGED - FROM",
      "SPACE. SOMEONE IS TAKING HER",
      "OFF THE PLANET.",
    ],
    [
      "TO FOLLOW HER I NEED A SHIP.",
      "I'VE BEEN BUILDING ONE IN THE",
      "GARAGE FOR YEARS. IT'S ALMOST",
      "DONE.",
    ],
    [
      "ALMOST. THE ENGINE STILL NEEDS",
      "ONE PART I COULD NEVER GET.",
      "SPACEZ KEEPS IT IN THEIR",
      "CLEANROOM VAULT.",
    ],
    [
      "I KNOW, BECAUSE I WORKED",
      "THERE. I BUILT THEIR ENGINES -",
      "UNTIL AN AI LEARNED MY JOB AND",
      "THEY WALKED ME OUT THE DOOR.",
    ],
    [
      "THE WHOLE BLOCK LOST ITS JOBS",
      "THE SAME WAY. NOW WE ALL LIVE",
      "ON WELFARE AND MOVIE NIGHTS.",
    ],
    ["THEY NEVER CHANGED THE LOCKS.", "EVERY DOOR STILL KNOWS MY HAND."],
    ["SO TONIGHT I TAKE THE PART,", "FINISH THE SHIP, AND GO GET", "ADA BACK."],
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
  // THE MERCHANT, venue one: the vending-machine restocker, still on his
  // round in the middle of the lockdown. (Ada was last seen at the vending
  // machines — this is his floor.) Lines in docs/manuscript.md.
  merchant: {
    sprite: "merchant_vendor",
    greeting: [
      [
        "EASY, FRIEND. I'M NOT STAFF.",
        "I STOCK THE VENDING MACHINES.",
        "SOMEBODY HAS TO, EVEN TONIGHT.",
      ],
      [
        "A LOCKDOWN IS A SELLER'S MARKET.",
        "I'LL BUY WHAT WEIGHS YOU DOWN",
        "AND SELL WHAT KEEPS YOU UPRIGHT.",
      ],
    ],
  },
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
    { enemy: "engineer", count: 5, band: [0.45, 0.8] },
    { enemy: "guard", count: 4, band: [0.55, 0.95] },
    { enemy: "hazmat", count: 3, band: [0.7, 1.05] },
    // OPTIMUSK units patrol the deep floor: a handful of tanks seeded through
    // the labs and cleanroom approach, replacing some of the human muscle.
    { enemy: "optimusk", count: 4, band: [0.5, 1.0] },
    // The five staffers who know too much, pinned along the route so the
    // plot unspools in walking order: launches → the old friend → Ada → the
    // vault → the Armstrong tease. Each rushes into view and talks before it
    // fights. THE ARCHITECT nests in the north lab, between the lobby door and
    // the deeper rooms, so the hero meets his brainwashed bench partner early.
    { enemy: "night_manager", at: { x: 560, y: 370 } },
    { enemy: "architect", at: { x: 950, y: 240 } },
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
      { enemy: "guard", count: 110, window: [0.55, 0.95] },
      { enemy: "hazmat", count: 70, window: [0.7, 1] },
      // The robot reinforcements ramp in with the back half of the shift —
      // fewer bodies than the staff lines, but each one is a wall that hits.
      { enemy: "optimusk", count: 55, window: [0.55, 1] },
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
    // The AI CORE: NE corner of the boss wing, where the superintelligence THE
    // ARCHITECT built hums to itself. Only his CORE KEYCARD opens it. Map
    // edges close the top and right; these walls close the left and bottom,
    // with the locked door as the only way in.
    {
      kind: "wall",
      from: { x: 1770, y: 8 },
      to: { x: 1770, y: 186 },
      radius: 8,
      jumpable: false,
    },
    {
      kind: "wall",
      from: { x: 1834, y: 180 },
      to: { x: 1994, y: 180 },
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
    {
      id: "core",
      from: { x: 1776, y: 180 },
      to: { x: 1830, y: 180 },
      radius: 8,
    },
  ],
  placedItems: [
    // Supply bay B — the armory cage: the building's big gun and its kits.
    { kind: "equipment", defId: "pump_shotgun", pos: { x: 100, y: 80 } },
    { kind: "repair", pos: { x: 150, y: 60 } },
    { kind: "repair", pos: { x: 190, y: 100 } },
    { kind: "medkit", pos: { x: 245, y: 80 } },
    // The vault — the alien anti-grav unit the whole drive is built around.
    { kind: "story", defId: "antigrav_unit", pos: { x: 1870, y: 1120 } },
    { kind: "xp", pos: { x: 1820, y: 1100 } },
    { kind: "xp", pos: { x: 1920, y: 1100 } },
    // The AI CORE — the superintelligence's own logs, and the plot payoff for
    // spending THE ARCHITECT's keycard.
    { kind: "story", defId: "core_log", pos: { x: 1885, y: 90 } },
    { kind: "xp", pos: { x: 1810, y: 60 } },
    { kind: "medkit", pos: { x: 1960, y: 60 } },
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
  // The first staffer he SEES stops him cold: the whole building is manned
  // at midnight. Pinned to sighting an intern because the opening ring is
  // packed with them — it fires the moment one is on screen, before a single
  // blow lands. An arrival beat, not a kill beat. `radius` is WIDE (a full
  // view, well past the packed opening ring at ~150 px out) so it fires on the
  // drop-in tick rather than waiting for an intern to crawl to the tight 96 px
  // default — that wait let the scripted vanguard reach the hero and sit glued
  // before his opening read ever played (see `openingStrike`, which holds the
  // rush until this beat lands). Deeper in, the first OPTIMUSK he sees is
  // personal: he helped build the first one, and the line took everyone's jobs
  // — his included.
  firstSightThoughts: [
    { enemy: "intern", thought: "spacez_staff", radius: 200 },
    { enemy: "optimusk", thought: "spacez_optimusk" },
  ],
  // The sword is holstered at the drop: the hero walks in like it's still his
  // old job, not a fight. The `after` gate holds the whole beat until the "look
  // at this place" sighting has played — and that hold now governs the
  // vanguard's MOVEMENT too (step.ts `moveEnemy`): it waits at its post through
  // the opening read, THEN breaks from the slow rank and sprints him down. So
  // the scene always reads in order — monologue first, then the lone scientist
  // rushing in — instead of a rusher that reaches the hero before he has looked
  // around and sits glued while the gate is shut. Reaching him is what draws
  // the weapon: the soft hit fires `spacez_armed` ("good thing I came armed")
  // and turns the auto-attack on. `radius` is a CONTACT gap (center-to-center):
  // the vanguard's radius (8) + the hero's (10) put it at ~18px when it parks
  // right up against him, so 22 fires the beat the instant it touches — the
  // swing lands with the scientist on top of the hero, not half a screen away.
  // It can afford to be a touch and not a distant proximity read because the
  // rusher outruns the hero (rushSpeed 72 > PLAYER.speed 56), so kiting it can't
  // stall the beat. Placed a short sprint ahead in the open lobby so it reaches
  // him fast and in clear view once it does break loose.
  openingStrike: {
    enemy: "vanguard_scientist",
    at: { x: 400, y: 620 },
    thought: "spacez_armed",
    after: "spacez_staff",
    radius: 22,
  },
  loot: {
    // The base ladder's first five: earthly weapons an American space company
    // keeps around — a shipping desk's knife, a drawer 9mm, the guards' baton,
    // a lab prototype, the armory's pump gun — introduced at stepped level
    // requirements (1 → 5).
    weaponPool: [
      "box_cutter",
      "security_baton",
      "nine_mm",
      "prototype_laser",
      "microwave_emitter",
      "pump_shotgun",
    ],
    // The campus wardrobe: office cotton up to the armory's riot kit,
    // introduced at levelReqs 1 → 5 alongside the weapons.
    gearPool: [
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
      "id_badge",
      "bag",
    ],
    abilityPool: ["storm_cell", "stasis_field", "item_magnet"],
    // Level-locked world drop (see config WORLD_DROP): THE FIRST DRAFT, the
    // prototype-GROK neural crown, farmable only by returning for boss runs.
    worldUniques: { easy: ["the_first_draft"], medium: ["deadsprint"] },
    // The level a normal run of the campaign's OPENING map leaves the hero at
    // per rung (from `leveling-curve.mjs --by-level`) — past it golden arrows
    // go cold, so a replay of the tutorial floor can't over-level him.
    arrowCapByDifficulty: {
      easy: 5,
      medium: 21,
      hard: 34,
      nightmare: 45,
      jesus: 54,
    },
    allClearWeapon: "golden_stapler",
    // The opening loot loop, on a schedule the rain can't promise: the
    // SECURITY BATON drops on the second kill — a real weapon in hand before
    // the first level-up, so the opening stat choice is informed by it — then
    // a STORM CELL powerup and a golden XP arrow, all inside the first minute.
    // Every new run learns "kills drop upgrades" in its opening seconds.
    earlyDrops: [
      { atKills: 2, weapon: "security_baton" },
      { atKills: 5, ability: "storm_cell" },
      { atKills: 8, item: "xp" },
    ],
  },
};
