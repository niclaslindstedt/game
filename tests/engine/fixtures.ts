// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// oss-spec:allow-large-file: synthetic fixture catalogue for the engine test suites — one coherent set of registered defs
// Synthetic content fixtures for the ENGINE test suites. These are plain-id
// defs (`test_level`, `test_minion`, …) registered via the engine's
// `registerDefs` hook so the engine-rule tests exercise the simulation
// WITHOUT depending on this game's shipped catalogs. Deleting every entry
// from `engine/game/defs/*` (a sequel stripping content) leaves these suites
// green, because they run on these fixtures instead.
//
// The numbers deliberately MIRROR the shipped `moon`/`ghost`/`blaster`/…
// tuning the suites were originally calibrated against, so the assertions
// hold unchanged — only the ids are synthetic. `installFixtures()` registers
// them; call it once at module load from the engine test helper.
//
// NOTE: the id `fists` is intentional — it is the EMPTY HAND the engine leaves
// a hero with when a weapon breaks (or is taken off) with an empty bag, so the
// fixture ladder has to carry that one shared id. `blaster` below is NOT
// shared any more: it is simply this ladder's synthetic ranged weapon, and its
// numbers were always its own.
// `crude_sword` is simply this ladder's default (medium) starting weapon —
// the engine itself no longer hardcodes any starting-weapon id (the
// difficulty def carries it).

import {
  registerDefs,
  type AbilityDef,
  type CompanionDef,
  type CutsceneDef,
  type DifficultyDef,
  type EnemyDef,
  type GearDef,
  type LevelDef,
  type StoryItemDef,
  type UniqueDef,
  type WeaponDef,
} from "@game/core";

export const FIX_ENEMIES: Record<string, EnemyDef> = {
  // Fodder — the horde's front rank (mirrors `wisp`).
  test_fodder: {
    id: "test_fodder",
    name: "TEST FODDER",
    lore: "A synthetic fixture monster standing in for the horde's front rank — the thinnest thing the engine suites are asked to kill.",
    role: "minion",
    sprite: "test_fodder",
    gore: "ecto",
    phasing: true,
    hp: 10,
    speed: 13,
    radius: 8,
    contactDamage: 6,
    critChance: 0.1,
    contactCooldownMs: 700,
    ai: { aggroRadius: 900 },
  },
  // The default minion — matches `makeEnemy`'s hp/damage (mirrors `ghost`).
  test_minion: {
    id: "test_minion",
    name: "TEST MINION",
    lore: "A synthetic fixture monster at the engine's default minion tuning: the body every rule about the rank and file is measured against.",
    role: "minion",
    sprite: "test_minion",
    gore: "ecto",
    phasing: true,
    hp: 45,
    speed: 16,
    radius: 9,
    contactDamage: 12,
    critChance: 0.1,
    contactCooldownMs: 700,
    ai: { aggroRadius: 950 },
  },
  // A heavier minion for band-ordering (mirrors `wraith`).
  test_brute: {
    id: "test_brute",
    name: "TEST BRUTE",
    lore: "A synthetic fixture monster heavy enough to sort behind the minion in a band, and no heavier.",
    role: "minion",
    sprite: "test_brute",
    gore: "ecto",
    phasing: true,
    hp: 90,
    speed: 22,
    radius: 9,
    contactDamage: 20,
    critChance: 0.12,
    contactCooldownMs: 700,
    ai: { aggroRadius: 1000 },
  },
  // A RARE special mob (config RARE_MOBS): authored at `test_minion` numbers
  // so the rarity multipliers are measurable against it; a pack mob.
  test_rare: {
    id: "test_rare",
    name: "TEST RARE",
    lore: "A synthetic fixture monster authored at plain minion numbers so the RARE tier's multipliers are measurable against it. It travels in a pack.",
    role: "minion",
    rarity: "rare",
    pack: [2, 4],
    sprite: "test_rare",
    gore: "ecto",
    phasing: true,
    hp: 45,
    speed: 16,
    radius: 9,
    contactDamage: 12,
    critChance: 0.1,
    contactCooldownMs: 700,
    ai: { aggroRadius: 950 },
  },
  // A UNIQUE special mob — `pack` deliberately set so the "uniques are always
  // solo" rule is what the suite proves ignores it.
  test_unique_mob: {
    id: "test_unique_mob",
    name: "TEST UNIQUE",
    lore: "A synthetic fixture monster carrying both the UNIQUE tier and a pack size, so the suites can prove that one of a kind means one.",
    role: "minion",
    rarity: "unique",
    pack: [3, 5],
    sprite: "test_unique_mob",
    gore: "ecto",
    phasing: true,
    hp: 45,
    speed: 16,
    radius: 9,
    contactDamage: 12,
    critChance: 0.1,
    contactCooldownMs: 700,
    ai: { aggroRadius: 950 },
  },
  // A NON-phasing minion for wall / line-of-sight tests (mirrors `guard`).
  test_stalker: {
    id: "test_stalker",
    name: "TEST STALKER",
    lore: "A synthetic fixture monster with no gore family and nothing else remarkable — the plain body a hunt is timed against.",
    role: "minion",
    sprite: "test_stalker",
    hp: 80,
    speed: 26,
    radius: 9,
    contactDamage: 18,
    critChance: 0.12,
    contactCooldownMs: 700,
    ai: { aggroRadius: 1000 },
  },
  // A WORKING minion (mirrors the GOODCO staff): non-phasing, a modest aggro
  // radius, and the dormant "at work" stroll (`ai.idle: "work"`, config
  // ENEMY_AI.work) — it potters around its `home` until woken.
  test_worker: {
    id: "test_worker",
    name: "TEST WORKER",
    lore: "A synthetic fixture monster that potters around its post until something wakes it, standing in for a staffed venue's day shift.",
    role: "minion",
    sprite: "test_worker",
    hp: 30,
    speed: 16,
    radius: 8,
    contactDamage: 10,
    critChance: 0.1,
    contactCooldownMs: 700,
    ai: { aggroRadius: 300, idle: "work" },
  },
  // The objective boss (mirrors `the_flagbearer`): far post, aggro + leash radii,
  // dialogue + last words, a guaranteed drop.
  test_boss: {
    id: "test_boss",
    name: "TEST BOSS",
    lore: "A synthetic fixture boss: a leashed guardian with a scene, a dying gasp and a pinned estate, standing in for every set piece the engine ships.",
    role: "boss",
    sprite: "test_boss",
    gore: "ecto",
    phasing: true,
    hp: 550,
    speed: 40,
    radius: 20,
    contactDamage: 30,
    critChance: 0.15,
    contactCooldownMs: 900,
    dialogue: [["TEST BOSS LINE ONE."], ["TEST BOSS LINE TWO."]],
    lastWords: ["TEST...", "BOSS..."],
    ai: { aggroRadius: 280, leashRadius: 460 },
    loot: {
      items: ["test_hammer"],
      weapons: 0,
      gear: 1,
      xpScrolls: 2,
      repairs: 1,
      medkits: 2,
      tierBonus: 0.35,
    },
  },
  // A NIMBLE minion for accuracy tests: a high `dodgeChance` so the player's
  // weapon blow is sidestepped unless DEXTERITY (hit rate) trims it away.
  test_dodger: {
    id: "test_dodger",
    name: "TEST DODGER",
    lore: "A synthetic fixture monster nimble enough to slip a blow, so the accuracy rules have something that answers back.",
    role: "minion",
    sprite: "test_dodger",
    gore: "ecto",
    phasing: true,
    hp: 45,
    speed: 16,
    radius: 9,
    contactDamage: 12,
    critChance: 0.1,
    dodgeChance: 0.9,
    contactCooldownMs: 700,
    ai: { aggroRadius: 950 },
  },
  // A plain fightable ELITE (no dialogue, no flee): the mid-boss shape the
  // map-marker and power-scale rules pin down without a scene in the way.
  test_elite: {
    id: "test_elite",
    name: "TEST ELITE",
    lore: "A synthetic fixture elite: it sleeps at its post, rushes into view, and pays a named monster's drops.",
    role: "elite",
    sprite: "test_elite",
    gore: "ecto",
    phasing: true,
    hp: 150,
    speed: 24,
    radius: 11,
    contactDamage: 18,
    critChance: 0.12,
    contactCooldownMs: 800,
    ai: { aggroRadius: 260, rushSpeed: 90 },
    loot: {
      items: [],
      weapons: 1,
      gear: 0,
      xpScrolls: 1,
      repairs: 0,
      medkits: 1,
      tierBonus: 0.2,
    },
  },
  // A TWO-WAY speaker (mirrors the shipped elites/bosses): its arrival scene
  // interleaves a `{ hero: [...] }` reply page — the hero talking back — with
  // its own pages (see EnemyDef DialoguePage).
  test_talker: {
    id: "test_talker",
    name: "TEST TALKER",
    lore: "A synthetic fixture elite whose whole purpose is its arrival scene — the dialogue rules need somebody to talk.",
    role: "elite",
    sprite: "test_talker",
    gore: "ecto",
    phasing: true,
    hp: 150,
    speed: 24,
    radius: 11,
    contactDamage: 18,
    critChance: 0.12,
    contactCooldownMs: 800,
    dialogue: [
      ["TEST TALKER LINE ONE."],
      { hero: ["TEST HERO REPLY."] },
      ["TEST TALKER LINE TWO."],
    ],
    ai: { aggroRadius: 260, rushSpeed: 90 },
  },
  // A dialogue-only APPARITION (mirrors the rift's historic residents): an
  // elite-role speaker nothing can hit — it rushes in, delivers its scene,
  // then walks off and dissolves (config APPARITION.lingerMs).
  // A NEUTRAL body — somebody who is simply not fighting anybody (see
  // disposition.ts `inert`). The staff lot's whole cast is this kind: the
  // guards who are already there and the people arriving for a shift, none of
  // whom the hero may hit and none of whom will hit him.
  test_bystander: {
    id: "test_bystander",
    name: "TEST BYSTANDER",
    lore: "A synthetic fixture bystander: a person going about their evening, who is not in the fight and cannot be talked into one.",
    role: "minion",
    sprite: "test_bystander",
    disposition: "neutral",
    hp: 30,
    speed: 20,
    radius: 8,
    contactDamage: 0,
    critChance: 0,
    contactCooldownMs: 700,
    ai: { aggroRadius: 300, idle: "work" },
  },
  test_apparition: {
    id: "test_apparition",
    name: "TEST APPARITION",
    lore: "A synthetic fixture apparition: it comes to say its piece and cannot be touched, hurt or counted while it does.",
    role: "elite",
    sprite: "test_apparition",
    apparition: true,
    phasing: true,
    hp: 60,
    speed: 20,
    radius: 9,
    contactDamage: 0,
    critChance: 0,
    contactCooldownMs: 700,
    dialogue: [["TEST APPARITION LINE ONE."], ["TEST APPARITION LINE TWO."]],
    ai: { aggroRadius: 250, rushSpeed: 110 },
  },
  // A FLEEING unique (mirrors a boss like the shipped THE FOUNDER): beaten to
  // 0 hp it escapes through a rift instead of dying — `flees` books a
  // `bossFled` (never a kill) and leaves the named landmark behind.
  test_coward: {
    id: "test_coward",
    name: "TEST COWARD",
    lore: "A synthetic fixture boss that leaves the board instead of dying, so the flight rules have somebody to run.",
    role: "boss",
    sprite: "test_coward",
    hp: 100,
    speed: 30,
    radius: 14,
    contactDamage: 20,
    critChance: 0.1,
    contactCooldownMs: 900,
    lastWords: ["NOT THE FACE...", "GOODBYE..."],
    flees: { landmark: "test_rift" },
    ai: { aggroRadius: 280, leashRadius: 460 },
    loot: {
      items: ["test_hammer"],
      weapons: 0,
      gear: 0,
      xpScrolls: 1,
      repairs: 0,
      medkits: 1,
      tierBonus: 0,
    },
  },
  // A THRESHOLD-FLEE unique (mirrors THE FOUNDER's `belowHpFrac`): the coward
  // bolts the instant his health crosses 75% of maxHp instead of grinding to 0,
  // so the fight resolves early. Set high so the test reads unambiguously — a
  // plain flee-at-0 would have to eat the whole 100 hp bar.
  test_coward_early: {
    id: "test_coward_early",
    name: "TEST EARLY COWARD",
    lore: "A synthetic fixture boss that bolts well before its last pixel, so the early-flight threshold has somebody to bolt.",
    role: "boss",
    sprite: "test_coward",
    hp: 100,
    speed: 30,
    radius: 14,
    contactDamage: 20,
    critChance: 0.1,
    contactCooldownMs: 900,
    lastWords: ["NOT THE FACE...", "GOODBYE..."],
    flees: { landmark: "test_rift", belowHpFrac: 0.75 },
    ai: { aggroRadius: 280, leashRadius: 460 },
    loot: {
      items: ["test_hammer"],
      weapons: 0,
      gear: 0,
      xpScrolls: 1,
      repairs: 0,
      medkits: 1,
      tierBonus: 0,
    },
  },
  // HELLBORN (config HELLGATES) — what a rampage-only hellgate lets through.
  // Elite-sized minions whose drops climb with the rampage instead of thinning.
  test_hellborn: {
    id: "test_hellborn",
    name: "TEST HELLBORN",
    lore: "A synthetic fixture hellborn: elite weight on a minion's role, reaching the board through a gate rather than a spawn.",
    role: "minion",
    hellborn: true,
    sprite: "test_hellborn",
    gore: "ecto",
    levelBonus: 2,
    hp: 320,
    speed: 13,
    radius: 15,
    contactDamage: 42,
    critChance: 0.14,
    contactCooldownMs: 800,
    ai: { aggroRadius: 460 },
  },
  // The worse crop a hellgate's JESUS-gated member line fields.
  test_hellborn_worse: {
    id: "test_hellborn_worse",
    name: "TEST HELLBORN WORSE",
    lore: "A synthetic fixture hellborn a rung worse than the first, so the gate's difficulty gate has two lines to choose between.",
    role: "minion",
    hellborn: true,
    sprite: "test_hellborn_worse",
    gore: "ecto",
    levelBonus: 3,
    hp: 480,
    speed: 17,
    radius: 16,
    contactDamage: 52,
    critChance: 0.18,
    contactCooldownMs: 700,
    ai: { aggroRadius: 520 },
  },
};

// A SHOOTER elite (mirrors the Boot Hill TRUST ME BRO controllers): fires hostile
// projectiles at the player and hides behind obstacles between shots. No
// dialogue, so it never rushes — the ranged suite gets the pure behavior.
FIX_ENEMIES.test_gunner = {
  id: "test_gunner",
  name: "TEST GUNNER",
  lore: "A synthetic fixture elite that shoots and hides behind whatever is nearest, so the ranged behaviour is exercised without a scene in front of it.",
  role: "elite",
  sprite: "test_gunner",
  hp: 150,
  speed: 30,
  radius: 10,
  contactDamage: 15,
  critChance: 0.1,
  contactCooldownMs: 700,
  ai: { aggroRadius: 400, rushSpeed: 90 },
  ranged: {
    damage: 20,
    cooldownMs: 1500,
    range: 220,
    projectile: { speed: 200, radius: 4, lifetimeMs: 2000, sprite: "bolt" },
    takesCover: true,
  },
};

// A GUARDED boss (mirrors THE BRO SUPERCORE): it cannot be hurt while its
// named guardian lives (`shieldedBy`), and it shoots — a stationary turret.
FIX_ENEMIES.test_shielded_boss = {
  id: "test_shielded_boss",
  name: "TEST SHIELDED BOSS",
  lore: "A synthetic fixture boss that cannot be touched while its guardian stands — a stationary turret with a shield in front of it.",
  role: "boss",
  sprite: "test_shielded_boss",
  hp: 500,
  speed: 0,
  radius: 20,
  contactDamage: 30,
  critChance: 0.1,
  contactCooldownMs: 900,
  shieldedBy: ["test_guard"],
  ai: { aggroRadius: 300, leashRadius: 460 },
  ranged: {
    damage: 25,
    cooldownMs: 2000,
    range: 260,
    projectile: { speed: 150, radius: 5, lifetimeMs: 2500, sprite: "bolt" },
  },
};

// The guardian whose life holds the boss's shield up.
FIX_ENEMIES.test_guard = {
  id: "test_guard",
  name: "TEST GUARD",
  lore: "A synthetic fixture monster whose only job is to be alive, and therefore to be the reason a boss cannot be hurt yet.",
  role: "minion",
  sprite: "test_guard",
  hp: 60,
  speed: 20,
  radius: 9,
  contactDamage: 12,
  critChance: 0.1,
  contactCooldownMs: 700,
  ai: { aggroRadius: 950 },
};

// A SPAREABLE unique (mirrors the rift's historic residents): beaten to 0 hp
// it kneels for the SPARE-or-KILL verdict — spared it joins the party as
// `test_companion`, killed it pays its pinned loot and gasps its last words.
FIX_ENEMIES.test_spareable = {
  id: "test_spareable",
  name: "TEST SPAREABLE",
  lore: "A synthetic fixture elite that kneels at zero instead of dying, so the SPARE-or-KILL verdict has somebody to kneel.",
  role: "elite",
  sprite: "test_spareable",
  gore: "ecto",
  phasing: true,
  hp: 150,
  speed: 24,
  radius: 11,
  contactDamage: 18,
  critChance: 0.12,
  contactCooldownMs: 800,
  lastWords: ["TEST...", "SPARED NOT..."],
  spareable: { companion: "test_companion" },
  ai: { aggroRadius: 260, rushSpeed: 90 },
  loot: {
    items: ["test_hammer"],
    storyItems: ["test_key"],
    weapons: 0,
    gear: 0,
    xpScrolls: 1,
    repairs: 0,
    medkits: 1,
    tierBonus: 0.2,
  },
};

/** The companion the fixture spareable becomes: a melee fighter with a
 * magic-find aura, a joining scene, and kill-quote banter — one def that
 * exercises every companion rule. */
export const FIX_COMPANIONS: Record<string, CompanionDef> = {
  test_companion: {
    id: "test_companion",
    name: "TEST COMPANION",
    sprite: "test_companion",
    hp: 150,
    speed: 52,
    radius: 11,
    weapon: "test_wrench",
    aura: { magicFind: 0.5 },
    // A luck-swelling power: the aura grows +0.25 every 2 levels (rank 0 at
    // level 1 leaves the base 0.5 untouched, so aura-at-recruit tests hold).
    power: {
      name: "TEST LUCK",
      blurb: "AURA SWELLS EACH RANK",
      everyLevels: 2,
      magicFindPerRank: 0.25,
    },
    joinWords: [["TEST JOIN LINE."]],
    killQuotes: ["TEST QUOTE."],
  },
  // A ranged companion whose signature POWER grows its volley: +1 pellet and
  // +1 chain arc every 2 levels, onto a plain single-shot pistol (so the test
  // sees the power ADD both from nothing).
  test_gunner: {
    id: "test_gunner",
    name: "TEST GUNNER",
    sprite: "test_companion",
    hp: 150,
    speed: 52,
    radius: 11,
    weapon: "test_pistol",
    power: {
      name: "TEST VOLLEY",
      blurb: "MORE PELLETS AND ARCS EACH RANK",
      everyLevels: 2,
      pelletsPerRank: 1,
      chainPerRank: 1,
    },
    killQuotes: ["TEST GUNNER QUOTE."],
  },
  // A companion with a FROST NOVA — the pulse that damages AND chills the
  // horde around it (see `companionNova`). Numbers picked round for the suite.
  test_frost: {
    id: "test_frost",
    name: "TEST FROST",
    sprite: "test_frost",
    hp: 150,
    speed: 52,
    radius: 11,
    weapon: "test_wrench",
    nova: {
      everyMs: 2000,
      radius: 60,
      damage: 30,
      chillMs: 1500,
      chillFactor: 0.5,
    },
    // A deepening-frost power: +10 radius, +8 bite every 3 levels (rank 0 at
    // recruit level 1 leaves the base ring untouched, so the nova suite holds).
    power: {
      name: "TEST FROST GROWTH",
      blurb: "WIDER, HARDER NOVA EACH RANK",
      everyLevels: 3,
      novaRadiusPerRank: 10,
      novaDamagePerRank: 8,
    },
    killQuotes: ["TEST FROST QUOTE."],
  },
};

export const FIX_WEAPONS: Record<string, WeaponDef> = {
  // The fixture ladder's default (medium) STARTING weapon — a breakable melee
  // blade the default-difficulty suites were calibrated on. Mirrors the old
  // shipped starter: melee, damage 20, finite durability.
  crude_sword: {
    id: "crude_sword",
    name: "CRUDE SWORD",
    class: "melee",
    levelReq: 1,
    damage: 20,
    cooldownMs: 600,
    range: 44,
    // A narrow single-target arc (the field that used to cap the cleave is
    // gone — INTELLIGENCE owns the count now; shape is the weapon's say).
    sweepDeg: 70,
    durability: 120,
    icon: "icon_medieval_sword",
  },
  // An EXECUTIONER: a rigid, short-reach melee tool that takes a body instead
  // of damaging it, and whose durability is a BODY COUNT (items/execute.ts).
  // Deliberately a fixture rather than the shipped chainsaw so the engine rule
  // survives that weapon being retired. Five teeth, so a break is quick to
  // drive; `damage` is the on-budget figure only a BOSS ever sees.
  test_executioner: {
    id: "test_executioner",
    name: "TEST EXECUTIONER",
    class: "melee",
    levelReq: 1,
    damage: 20,
    cooldownMs: 450,
    range: 30,
    sweepDeg: 180,
    rigid: true,
    edge: "shred",
    execute: { bars: 6 },
    durability: 5,
    icon: "icon_medieval_sword",
  },
  // A BURNER: a melee weapon made of FIRE, so every body it drops is burned up
  // where it stood rather than thrown as a corpse (items/burn.ts). Deliberately
  // a fixture rather than the shipped flamethrower so the engine rule survives
  // that weapon being retired; the numbers are a plain on-budget blade's,
  // because `burn` must change NOTHING about the simulation and a fixture that
  // varied them too would hide a regression that did.
  test_burner: {
    id: "test_burner",
    name: "TEST BURNER",
    class: "melee",
    levelReq: 1,
    damage: 20,
    cooldownMs: 450,
    range: 60,
    sweepDeg: 90,
    rigid: true,
    edge: "blunt",
    burn: true,
    durability: 20,
    icon: "icon_medieval_sword",
  },
  // SHARED ID: the empty hand the engine leaves in a hero's weapon slot when
  // there is nothing else to hold (`bareHands` in items/hands.ts). It mirrors
  // the shipped built-in — melee, no durability, no ammo, no icon — because
  // suites assert on the state of being unarmed, not on its numbers.
  fists: {
    id: "fists",
    name: "BARE HANDS",
    class: "melee",
    edge: "blunt",
    levelReq: 1,
    damage: 8,
    cooldownMs: 600,
    range: 20,
    sweepDeg: 45,
    motion: "punch",
  },
  // This ladder's synthetic ranged weapon. It carries no engine meaning at all
  // (the fallback is `fists` above); on the moon it is a scavengeable drop.
  blaster: {
    id: "blaster",
    name: "BLASTER",
    class: "ranged",
    levelReq: 1,
    damage: 8,
    cooldownMs: 650,
    range: 260,
    durability: 150,
    projectile: { speed: 420, radius: 3, lifetimeMs: 900, sprite: "bolt" },
    icon: "icon_blaster",
  },
  // A TWO-HANDED blade: it claims the second arm, so no shield and no bag ride
  // with it. Deliberately the strongest fixture melee weapon, because that is
  // what a two-hander buys with the arm it costs.
  test_greatsword: {
    id: "test_greatsword",
    name: "TEST GREATSWORD",
    class: "melee",
    levelReq: 1,
    twoHanded: true,
    damage: 40,
    cooldownMs: 900,
    range: 52,
    sweepDeg: 150,
    durability: 120,
    icon: "icon_medieval_sword",
  },
  // A clear early melee upgrade (mirrors `wrench`): damage 22.
  test_wrench: {
    id: "test_wrench",
    name: "TEST WRENCH",
    class: "melee",
    levelReq: 1,
    damage: 22,
    cooldownMs: 420,
    range: 42,
    durability: 160,
    icon: "icon_wrench",
  },
  // A reach weapon with a narrow thrust cone and long range (mirrors `mop`):
  // the spear shape for melee-AoE tests.
  test_spear: {
    id: "test_spear",
    name: "TEST SPEAR",
    class: "melee",
    levelReq: 1,
    damage: 11,
    cooldownMs: 260,
    range: 90,
    sweepDeg: 40,
    durability: 160,
    icon: "icon_mop",
  },
  // Durability + DPS ladder for durability tests (mirror pipe/hammer/wand/pistol).
  test_pipe: {
    id: "test_pipe",
    name: "TEST PIPE",
    class: "melee",
    // Merchant-scales material: metal melts down for double (economy tests).
    material: "metal",
    levelReq: 1,
    damage: 16,
    cooldownMs: 320,
    range: 40,
    durability: 180,
    icon: "icon_pipe",
  },
  test_hammer: {
    id: "test_hammer",
    name: "TEST HAMMER",
    class: "melee",
    levelReq: 1,
    damage: 34,
    cooldownMs: 640,
    range: 44,
    durability: 120,
    icon: "icon_hammer",
  },
  test_wand: {
    id: "test_wand",
    name: "TEST WAND",
    class: "magic",
    levelReq: 1,
    damage: 15,
    cooldownMs: 500,
    range: 300,
    durability: 160,
    projectile: { speed: 320, radius: 4, lifetimeMs: 1300, sprite: "spark" },
    icon: "icon_wand",
  },
  test_pistol: {
    id: "test_pistol",
    name: "TEST PISTOL",
    class: "ranged",
    levelReq: 1,
    damage: 7,
    cooldownMs: 400,
    range: 230,
    durability: 200,
    projectile: { speed: 400, radius: 3, lifetimeMs: 800, sprite: "bolt" },
    icon: "icon_pistol",
  },
  // A hard-hitting single-target sidearm — the RELIABLE ranged baseline the
  // spread-weapon auto-equip test measures against (mirrors a service revolver).
  test_revolver: {
    id: "test_revolver",
    name: "TEST REVOLVER",
    class: "ranged",
    levelReq: 1,
    damage: 24,
    cooldownMs: 500,
    range: 240,
    durability: 180,
    projectile: { speed: 440, radius: 3, lifetimeMs: 900, sprite: "bolt" },
    icon: "icon_pistol",
  },
  // A spread pellet gun (mirrors the pump shotgun): its damage budget rides on
  // FOUR pellets, so its per-hit damage is a quarter of a single-target's —
  // fearsome in a packed crowd, feeble against one foe. Its budget-authored
  // effective DPS TIES (even slightly beats) test_revolver's, so under the old
  // full-pellet-credit scoring auto-equip swapped the revolver away for it; the
  // realization discount (WEAPON.aoeRealization) is what now holds the slot.
  test_scattergun: {
    id: "test_scattergun",
    name: "TEST SCATTERGUN",
    class: "ranged",
    levelReq: 1,
    damage: 13,
    cooldownMs: 950,
    range: 160,
    durability: 140,
    projectile: {
      speed: 380,
      radius: 3,
      lifetimeMs: 420,
      sprite: "pellet",
      count: 4,
      spreadDeg: 24,
    },
    icon: "icon_pistol",
  },
  // THE AMMUNITION FIXTURE — the one ranged weapon in this catalog that plays
  // by the SHIPPED ranged rule: it eats a kind and carries no durability at
  // all, so a shot spends a round and a dry pouch stops it dead
  // (tests/engine/ammo_test.ts).
  //
  // Its neighbours above deliberately do NOT, and that is not an oversight. The
  // engine treats `ammo` and `durability` as independent facts about a def —
  // it is the ITEM SCHEMA that makes them an either/or for shipped content
  // (`tests/content/ammo_content_test.ts` holds that end) — so keeping the
  // older ranged fixtures on durability lets the WEAR suites go on asserting
  // wear rules through a ranged weapon, exactly as they always have, while this
  // one carries the ammunition rules. Two fixtures, two rules, no suite
  // rewritten to accommodate the other.
  test_carbine: {
    id: "test_carbine",
    name: "TEST CARBINE",
    class: "ranged",
    levelReq: 1,
    damage: 12,
    cooldownMs: 400,
    range: 240,
    ammo: "bullets",
    projectile: { speed: 420, radius: 3, lifetimeMs: 900, sprite: "bolt" },
    icon: "icon_pistol",
  },
  // A rapid spread caster that SEPARATES the pocket pick's two contexts: its
  // crowd-credited rank (weaponScore: 4 pellets damped to 2.5 targets ×
  // ~33 dps/target ≈ 83) beats test_revolver's (~48), while its per-target
  // DPS stays well below the revolver's — so the crowd context picks it and
  // the boss (single-target) context picks the revolver.
  test_hailgun: {
    id: "test_hailgun",
    name: "TEST HAILGUN",
    class: "ranged",
    levelReq: 1,
    damage: 10,
    cooldownMs: 300,
    range: 220,
    durability: 200,
    projectile: {
      speed: 380,
      radius: 3,
      lifetimeMs: 500,
      sprite: "pellet",
      count: 4,
      spreadDeg: 24,
    },
    icon: "icon_pistol",
  },
};

export const FIX_GEAR: Record<string, GearDef> = {
  // The four-slot armor wardrobe: one piece per body slot so the armor rules
  // (summed reduction, per-hit wear, inactive-at-zero, repair) have a full
  // set to exercise. The vest keeps the old test suit's +20 maxHp so the
  // "gear grants life" assertions carry over unchanged.
  test_helmet: {
    id: "test_helmet",
    name: "TEST HELMET",
    slot: "head",
    bonuses: {},
    armor: 10,
    durability: 80,
    icon: "icon_hard_hat",
  },
  test_vest: {
    id: "test_vest",
    name: "TEST VEST",
    slot: "chest",
    bonuses: { maxHp: 20 },
    armor: 16,
    durability: 90,
    icon: "icon_kevlar_vest",
  },
  test_greaves: {
    id: "test_greaves",
    name: "TEST GREAVES",
    slot: "legs",
    bonuses: {},
    armor: 10,
    durability: 80,
    icon: "icon_cargo_pants",
  },
  test_boots: {
    id: "test_boots",
    name: "TEST BOOTS",
    slot: "feet",
    bonuses: {},
    armor: 8,
    durability: 80,
    icon: "icon_leather_boots",
  },
  // A REVIVE item (`GearDef.revive`): the engine's stand-in for a bottle of
  // SMELLING SALTS, so the companion-waking rules can be exercised without
  // naming the shipped `smelling_salts`. Zero stats, like the real one — its
  // whole worth is the verb it carries.
  test_salts: {
    id: "test_salts",
    name: "TEST SALTS",
    slot: "trinket",
    bonuses: {},
    revive: true,
    icon: "icon_smelling_salts",
  },
  // An IDENTIFY item (`GearDef.identify`): the engine's stand-in for the ITEM
  // LOOKUP TICKET, so the identification rules run without naming the shipped
  // `lookup_ticket`. The stack cap is deliberately SMALL (3, not the shipped
  // 20) so the merge/overflow rules are cheap to prove.
  test_ticket: {
    id: "test_ticket",
    name: "TEST TICKET",
    slot: "trinket",
    bonuses: {},
    identify: true,
    stack: 3,
    icon: "icon_charm",
  },
  // A carried TRINKET (the old charm): it is never worn — its bonus pays out
  // from the bag, so the engine's carried-contribution rule has a
  // content-agnostic piece to exercise.
  test_charm: {
    id: "test_charm",
    name: "TEST CHARM",
    slot: "trinket",
    // Merchant-scales material: precious fetches four times (economy tests).
    material: "precious",
    bonuses: { critChance: 0.03 },
    icon: "icon_charm",
  },
  // A passive trinket (mirrors the shipped `passage_chip`): its `+1 INT`
  // applies while merely carried in the bag, so the engine's passive-stat
  // rule has a content-agnostic piece to exercise.
  test_chip: {
    id: "test_chip",
    name: "TEST CHIP",
    slot: "trinket",
    bonuses: {},
    passive: { intelligence: 1 },
    icon: "icon_charm",
  },
  // A travel-gate KEY (mirrors the shipped severed hand): a zero-stat trinket
  // whose only worth is the gate it tears open when USED on its home level
  // (see FIX_GATE_LEVEL / spendGateKey). The scrap sweep must spare it.
  test_gate_key: {
    id: "test_gate_key",
    name: "TEST GATE KEY",
    slot: "trinket",
    bonuses: {},
    icon: "icon_charm",
  },
  // A worn RING (mirrors the shipped `signet_ring`): the hero has TWO ring
  // fingers and this one kind fills either, so the slot-targeting rules have a
  // content-agnostic piece to exercise. Its `bonuses.stats` is what jewellery
  // is for — a base that grants an attribute outright.
  test_ring: {
    id: "test_ring",
    name: "TEST RING",
    slot: "ring",
    material: "precious",
    bonuses: { stats: { luck: 1 } },
    icon: "icon_signet_ring",
  },
  // A stronger ring, so a two-finger loadout has an ordering to displace: the
  // weaker of the two worn rings is the one an upgrade must replace.
  test_ring_greater: {
    id: "test_ring_greater",
    name: "TEST GREATER RING",
    slot: "ring",
    material: "precious",
    bonuses: { maxHp: 20, stats: { luck: 3 } },
    icon: "icon_vacuum_weld",
  },
  // A worn AMULET (mirrors the shipped `dog_tags`): the neck slot, one only.
  // Deliberately BONUS-FREE, so a suite that hangs an affix on it measures
  // that affix and nothing else.
  test_amulet: {
    id: "test_amulet",
    name: "TEST AMULET",
    slot: "amulet",
    material: "precious",
    bonuses: {},
    icon: "icon_dog_tags",
  },
  // A NIGHTMARE-gated base: the per-base difficulty drop gate the shipped
  // rings and amulets ride (`GearDef.minDifficulty`).
  test_deep_ring: {
    id: "test_deep_ring",
    name: "TEST DEEP RING",
    slot: "ring",
    minDifficulty: "nightmare",
    bonuses: {},
    icon: "icon_singularity_ring",
  },
  // A worn BAG (mirrors the shipped `bag`): +2 carry cells while equipped in
  // the bag slot, so the engine's bag-capacity rule has a content-agnostic
  // piece to exercise.
  test_bag: {
    id: "test_bag",
    name: "TEST BAG",
    slot: "bag",
    bonuses: {},
    bagSlots: 2,
    icon: "icon_bag",
  },
  // A roomier bag for the "bigger bag wins the slot" auto-equip test.
  test_big_bag: {
    id: "test_big_bag",
    name: "TEST BIG BAG",
    slot: "bag",
    bonuses: {},
    bagSlots: 5,
    icon: "icon_bag",
  },
  // A SHIELD — the other thing the second arm holds. Carries armor (so the
  // shield's own STRENGTH floor derives) and no cells, which is the whole
  // trade the offhand slot exists to pose.
  test_shield: {
    id: "test_shield",
    name: "TEST SHIELD",
    slot: "shield",
    levelReq: 1,
    bonuses: {},
    armor: 12,
    armorType: "leather",
    durability: 70,
    icon: "icon_slot_offhand",
  },
  // A heavy shield whose MAIL material lifts the STRENGTH gate well past what a
  // light build banks — the piece the "shields are a melee lane" rule needs.
  test_heavy_shield: {
    id: "test_heavy_shield",
    name: "TEST HEAVY SHIELD",
    slot: "shield",
    levelReq: 20,
    bonuses: {},
    armor: 40,
    armorType: "mail",
    durability: 70,
    icon: "icon_slot_offhand",
  },
};

export const FIX_ABILITIES: Record<string, AbilityDef> = {
  // Shared id, like `blaster`: the loot rain hardcodes a `screen_nuke` slice
  // (LOOT.nukeShare and the crowd-bomb mercy drop both mint this id), so the
  // fixture catalog must carry it or a long headless run crashes the moment
  // the slice hits. Mirrors the shipped nuke's numbers.
  screen_nuke: {
    id: "screen_nuke",
    name: "SCREEN NUKE",
    lore: "A synthetic fixture power mirroring the shipped bomb, so a headless run that hits the loot rain's nuke slice has something to mint.",
    kind: "nuke",
    durationMs: 0,
    uniqueHeld: true,
    icon: "icon_nuke",
    nuke: { radius: 240 },
  },
  test_orbit: {
    id: "test_orbit",
    name: "TEST ORBIT",
    lore: "A synthetic fixture power: orbs on a ring, the shape every orbit rule is measured against.",
    kind: "orbit",
    durationMs: 12_000,
    stackable: true,
    icon: "icon_orbit",
    orbit: {
      count: 3,
      radius: 38,
      angularSpeed: 3.2,
      damage: 14,
      hitCooldownMs: 140,
      orbRadius: 8,
      sprite: "fireball",
    },
  },
  test_storm: {
    id: "test_storm",
    name: "TEST STORM",
    lore: "A synthetic fixture power: bolts on an interval, the shape every storm rule is measured against.",
    kind: "storm",
    durationMs: 10_000,
    stackable: true,
    icon: "icon_storm",
    storm: { intervalMs: 450, damage: 25, range: 220 },
  },
  test_stasis: {
    id: "test_stasis",
    name: "TEST STASIS",
    lore: "A synthetic fixture power: a slowing field, the shape every stasis rule is measured against.",
    kind: "stasis",
    durationMs: 9_000,
    icon: "icon_stasis",
    stasis: { radius: 130, slowFactor: 0.3 },
  },
  test_nuke: {
    id: "test_nuke",
    name: "TEST NUKE",
    lore: "A synthetic fixture power: a screen-clearing blast, for the rules about spending one.",
    kind: "nuke",
    durationMs: 0,
    uniqueHeld: true, // mirrors the shipped nuke: one bomb docked at a time
    icon: "icon_nuke",
    nuke: { radius: 240 },
  },
  test_magnet: {
    id: "test_magnet",
    name: "TEST MAGNET",
    lore: "A synthetic fixture power: a pull on loose loot, the shape every magnet rule is measured against.",
    kind: "magnet",
    durationMs: 12_000,
    icon: "icon_magnet",
    magnet: { radius: 80, radiusPerInt: 8, pullSpeed: 200 },
  },
  // One fixture per CAMPAIGN POWER kind (the two-per-map powers — see
  // content/powerups.yaml). Synthetic numbers, deliberately round, so a rule
  // test asserts the RULE rather than a shipped balance figure.
  test_trail: {
    id: "test_trail",
    name: "TEST TRAIL",
    lore: "A synthetic fixture power: a burning wake, the shape every trail rule is measured against.",
    kind: "trail",
    durationMs: 10_000,
    stackable: true,
    icon: "icon_trail",
    trail: { dropMs: 100, patchMs: 2000, radius: 20, damage: 10, tickMs: 200 },
  },
  test_barrier: {
    id: "test_barrier",
    name: "TEST BARRIER",
    lore: "A synthetic fixture power: a shell with a damage pool, the shape every barrier rule is measured against.",
    kind: "barrier",
    durationMs: 14_000,
    icon: "icon_barrier",
    barrier: { poolFrac: 0.5 },
  },
  test_rain: {
    id: "test_rain",
    name: "TEST RAIN",
    lore: "A synthetic fixture power: impacts falling around the hero, the shape every rain rule is measured against.",
    kind: "rain",
    durationMs: 9_000,
    stackable: true,
    icon: "icon_rain",
    rain: { intervalMs: 500, count: 2, radius: 40, damage: 30, range: 200 },
  },
  test_phase: {
    id: "test_phase",
    name: "TEST PHASE",
    lore: "A synthetic fixture power: a spell of being untouchable, the shape every phase rule is measured against.",
    kind: "phase",
    durationMs: 5_000,
    icon: "icon_phase",
    phase: { speedMult: 1.5 },
  },
  test_well: {
    id: "test_well",
    name: "TEST WELL",
    lore: "A synthetic fixture power: a roaming grinding core, the shape every well rule is measured against.",
    kind: "well",
    durationMs: 6_000,
    icon: "icon_well",
    well: { radius: 90, damage: 20, tickMs: 200, pull: 60, chase: 0 },
  },
  test_cyclone: {
    id: "test_cyclone",
    name: "TEST CYCLONE",
    lore: "A synthetic fixture power: a well that ROAMS rather than holding its ground, so the suites can tell the two apart.",
    kind: "well",
    durationMs: 6_000,
    icon: "icon_well",
    well: { radius: 40, damage: 10, tickMs: 200, pull: 20, chase: 100 },
  },
  test_surge: {
    id: "test_surge",
    name: "TEST SURGE",
    lore: "A synthetic fixture power: the hero's own weapon run hot, the shape every surge rule is measured against.",
    kind: "surge",
    durationMs: 8_000,
    icon: "icon_surge",
    surge: { damageMult: 2, cooldownMult: 0.5 },
  },
  test_pulse: {
    id: "test_pulse",
    name: "TEST PULSE",
    lore: "A synthetic fixture power: a wave washing out of the hero, the shape every pulse rule is measured against.",
    kind: "pulse",
    durationMs: 9_000,
    stackable: true,
    icon: "icon_pulse",
    pulse: { intervalMs: 800, radius: 120, damage: 25, push: 50 },
  },
  test_volley: {
    id: "test_volley",
    name: "TEST VOLLEY",
    lore: "A synthetic fixture power: shots loosing themselves at the nearest foe, the shape every volley rule is measured against.",
    kind: "volley",
    durationMs: 10_000,
    stackable: true,
    icon: "icon_volley",
    volley: {
      intervalMs: 500,
      count: 2,
      spread: 0.3,
      speed: 300,
      radius: 5,
      damage: 25,
      lifetimeMs: 1200,
      sprite: "bolt",
      range: 240,
    },
  },
  test_turret: {
    id: "test_turret",
    name: "TEST TURRET",
    lore: "A synthetic fixture power: guns planted on the ground, the shape every turret rule is measured against.",
    kind: "turret",
    durationMs: 12_000,
    icon: "icon_turret",
    turret: {
      count: 4,
      radius: 44,
      intervalMs: 400,
      damage: 15,
      range: 200,
      speed: 300,
      projectileRadius: 4,
      sprite: "bolt",
    },
  },
  test_ward: {
    id: "test_ward",
    name: "TEST WARD",
    lore: "A synthetic fixture power: a floor under the hero's health, the shape every ward rule is measured against.",
    kind: "ward",
    durationMs: 7_000,
    uniqueHeld: true,
    icon: "icon_ward",
    ward: { floor: 1 },
  },
};

// The difficulty ladder mirrors the shipped SHAPE (counts flat-ish, toughness
// via the relative mobLevelOffset, leaner medkits/armor/powerups and a faster
// stamina burn up the rungs, richer tiers as the reward) with fixture weapon
// ids: MEDIUM starts with the fixture `crude_sword` so the default-difficulty
// suites stay put, and EASY starts with `test_wand` so the per-difficulty
// starting-weapon rule has a distinct id to assert on.
export const FIX_DIFFICULTIES: Record<string, DifficultyDef> = {
  easy: {
    id: "easy",
    index: 1,
    name: "EASY",
    tagline: "TEST EASY",
    color: "#7ef0c8",
    startingWeapon: "test_wand",
    startingStats: { stamina: 1, strength: 1, dexterity: 1, intelligence: 1 },
    mobCountMult: 0.9,
    mobHpMult: 1,
    mobLevelOffset: -3,
    // THE CACHE this rung pays (`DifficultyDef.cache`). A three-rung ladder in
    // the same shape as the shipped five, so the engine suite can exercise the
    // GROWTH — a deeper rung replaces the chest, a gentler one is a no-op —
    // without naming a shipped difficulty's numbers.
    cache: {
      name: "TEST BOX",
      slots: 8,
      sprite: "keepsake_box",
      line: "A TEST BOX APPEARED.",
    },
    aliveMult: 0.9,
    activeSpawnerCap: 2,
    spawnerRespawnMult: 1.6,
    mobPursuitNearElite: 0.1,
    menaceMult: 0.05,
    menaceDecayMult: 1.5,
    menaceEffectMult: 0.5,
    menaceStageCap: 3,
    dropChanceBonus: 0,
    medkitDropMult: 1.05,
    armorDropMult: 1.05,
    powerupDropMult: 1.05,
    scrollDropMult: 1,
    mercy: {
      crowdBombChanceMax: 0.05,
      medkitBonus: 2,
      armorBonus: 0.5,
      repairBonus: 2,
      staminaDrinkChanceMax: 0.15,
    },
    lootIlvlBonus: 0,
    tierChanceBonus: {},
    staminaDrainMult: 0.95,
    staminaRefillSec: 5,
    staminaEmptyLockSec: 1.5,
    playerDodgeMult: 1.3,
    playerMissMult: 0.5,
    enemyDodgeMult: 0.5,
    asteroidDamageFrac: 0.2,
    sandstormDamageFrac: 0.1,
    stampedeDamageFrac: 0.1,
    stampedeTelegraphMult: 1.5,
    drive: {
      pedestrianMassMult: 0.6,
      trafficMassMult: 0.7,
      trafficDensity: 1,
      // The whole dial: the engine suites measure the road's physics, not the
      // ladder's throttle, so a fixture rung never caps the wagon.
      topSpeedMph: 174,
    },
  },
  medium: {
    id: "medium",
    index: 2,
    name: "MEDIUM",
    tagline: "TEST MEDIUM",
    color: "#4da6ff",
    startingWeapon: "crude_sword",
    startingStats: {},
    mobCountMult: 1,
    mobHpMult: 1,
    mobLevelOffset: -2,
    // THE CACHE this rung pays (`DifficultyDef.cache`). A three-rung ladder in
    // the same shape as the shipped five, so the engine suite can exercise the
    // GROWTH — a deeper rung replaces the chest, a gentler one is a no-op —
    // without naming a shipped difficulty's numbers.
    cache: {
      name: "TEST CHEST",
      slots: 16,
      sprite: "antique_chest",
      line: "A TEST CHEST APPEARED.",
    },
    aliveMult: 1,
    activeSpawnerCap: 3,
    spawnerRespawnMult: 1.0,
    mobPursuitNearElite: 0.5,
    menaceMult: 0.7,
    menaceDecayMult: 1,
    menaceEffectMult: 1,
    menaceStageCap: 5,
    dropChanceBonus: 0,
    medkitDropMult: 1,
    armorDropMult: 1,
    powerupDropMult: 1,
    scrollDropMult: 1,
    mercy: {
      crowdBombChanceMax: 0.03,
      medkitBonus: 1.3,
      armorBonus: 0.35,
      repairBonus: 1.3,
      staminaDrinkChanceMax: 0.1,
    },
    lootIlvlBonus: 0,
    tierChanceBonus: {},
    staminaDrainMult: 1,
    staminaRefillSec: 5.6,
    staminaEmptyLockSec: 2,
    playerDodgeMult: 1,
    playerMissMult: 1,
    enemyDodgeMult: 1,
    asteroidDamageFrac: 0.3,
    sandstormDamageFrac: 0.15,
    stampedeDamageFrac: 0.15,
    stampedeTelegraphMult: 1.3,
    drive: {
      pedestrianMassMult: 1,
      trafficMassMult: 1,
      trafficDensity: 1,
      // The whole dial: the engine suites measure the road's physics, not the
      // ladder's throttle, so a fixture rung never caps the wagon.
      topSpeedMph: 174,
    },
  },
  hard: {
    id: "hard",
    index: 3,
    name: "HARD",
    tagline: "TEST HARD",
    color: "#ffd75e",
    startingWeapon: "crude_sword",
    startingStats: {},
    mobCountMult: 1.1,
    mobHpMult: 1,
    mobLevelOffset: -1,
    // THE CACHE this rung pays (`DifficultyDef.cache`). A three-rung ladder in
    // the same shape as the shipped five, so the engine suite can exercise the
    // GROWTH — a deeper rung replaces the chest, a gentler one is a no-op —
    // without naming a shipped difficulty's numbers.
    cache: {
      name: "TEST TRUNK",
      slots: 24,
      sprite: "steamer_trunk",
      line: "A TEST TRUNK APPEARED.",
    },
    aliveMult: 1.1,
    activeSpawnerCap: 4,
    spawnerRespawnMult: 0.8,
    menaceMult: 1.5,
    menaceDecayMult: 0.85,
    menaceEffectMult: 1.15,
    menaceStageCap: 10,
    dropChanceBonus: 0.03,
    medkitDropMult: 0.95,
    armorDropMult: 0.95,
    powerupDropMult: 0.95,
    scrollDropMult: 0.7,
    mercy: {
      crowdBombChanceMax: 0,
      medkitBonus: 0,
      armorBonus: 0,
      repairBonus: 0,
      staminaDrinkChanceMax: 0,
    },
    lootIlvlBonus: 1,
    tierChanceBonus: { magic: 0.1, unique: 0.06, legendary: 0.01 },
    staminaDrainMult: 1.05,
    staminaRefillSec: 6.6,
    staminaEmptyLockSec: 2.6,
    playerDodgeMult: 0.9,
    playerMissMult: 1.1,
    enemyDodgeMult: 1.1,
    asteroidDamageFrac: 0.4,
    sandstormDamageFrac: 0.2,
    stampedeDamageFrac: 0.2,
    stampedeTelegraphMult: 1.0,
    drive: {
      pedestrianMassMult: 1.4,
      trafficMassMult: 1.7,
      trafficDensity: 1,
      // The whole dial: the engine suites measure the road's physics, not the
      // ladder's throttle, so a fixture rung never caps the wagon.
      topSpeedMph: 174,
    },
  },
  nightmare: {
    id: "nightmare",
    index: 4,
    name: "NIGHTMARE",
    tagline: "TEST NIGHTMARE",
    color: "#ff8c42",
    startingWeapon: "crude_sword",
    startingStats: {},
    mobCountMult: 1.2,
    mobHpMult: 1,
    mobLevelOffset: 0,
    aliveMult: 1.2,
    activeSpawnerCap: 5,
    spawnerRespawnMult: 0.6,
    menaceMult: 3.0,
    menaceDecayMult: 0.7,
    menaceEffectMult: 1.3,
    menaceStageCap: 100,
    dropChanceBonus: 0.06,
    medkitDropMult: 0.9,
    armorDropMult: 0.9,
    powerupDropMult: 0.9,
    scrollDropMult: 0.4,
    mercy: {
      crowdBombChanceMax: 0,
      medkitBonus: 0,
      armorBonus: 0,
      repairBonus: 0,
      staminaDrinkChanceMax: 0,
    },
    lootIlvlBonus: 2,
    tierChanceBonus: { magic: 0.18, unique: 0.14, legendary: 0.05 },
    staminaDrainMult: 1.1,
    staminaRefillSec: 8,
    staminaEmptyLockSec: 3.4,
    playerDodgeMult: 0.8,
    playerMissMult: 1.25,
    enemyDodgeMult: 1.25,
    asteroidDamageFrac: 0.5,
    sandstormDamageFrac: 0.28,
    stampedeDamageFrac: 0.3,
    stampedeTelegraphMult: 0.7,
    drive: {
      pedestrianMassMult: 1.9,
      trafficMassMult: 2.8,
      trafficDensity: 1,
      // The whole dial: the engine suites measure the road's physics, not the
      // ladder's throttle, so a fixture rung never caps the wagon.
      topSpeedMph: 174,
    },
  },
  jesus: {
    id: "jesus",
    index: 5,
    name: "JESUS CHRIST!",
    tagline: "TEST JESUS",
    color: "#d83a3a",
    startingWeapon: "crude_sword",
    startingStats: {},
    mobCountMult: 1.8,
    mobHpMult: 1,
    mobLevelOffset: 2,
    aliveMult: 1.8,
    spawnerRespawnMult: 0.45,
    menaceMult: 7.0,
    menaceDecayMult: 0.5,
    menaceEffectMult: 1.5,
    // No `menaceStageCap`: JESUS stays uncapped, mirroring the shipped ladder.
    dropChanceBonus: 0.1,
    medkitDropMult: 0.77,
    armorDropMult: 0.77,
    powerupDropMult: 0.77,
    scrollDropMult: 0,
    mercy: {
      crowdBombChanceMax: 0,
      medkitBonus: 0,
      armorBonus: 0,
      repairBonus: 0,
      staminaDrinkChanceMax: 0,
    },
    lootIlvlBonus: 4,
    tierChanceBonus: { magic: 0.26, unique: 0.22, legendary: 0.12 },
    staminaDrainMult: 1.1,
    staminaRefillSec: 10,
    staminaEmptyLockSec: 4.5,
    playerDodgeMult: 0.7,
    playerMissMult: 1.4,
    enemyDodgeMult: 1.4,
    asteroidDamageFrac: 0.75,
    sandstormDamageFrac: 0.4,
    stampedeDamageFrac: 0.4,
    stampedeTelegraphMult: 0.4,
    drive: {
      pedestrianMassMult: 2.5,
      trafficMassMult: 4.5,
      trafficDensity: 1,
      // The whole dial: the engine suites measure the road's physics, not the
      // ladder's throttle, so a fixture rung never caps the wagon.
      topSpeedMph: 174,
    },
  },
};

export const FIX_STORY_ITEMS: Record<string, StoryItemDef> = {
  // An EVA-suit plot piece (mirrors the shipped space suit): picking it up
  // dresses the hero as the astronaut for the rest of the run.
  test_eva: {
    id: "test_eva",
    name: "TEST EVA SUIT",
    icon: "icon_suit",
    suitsHero: true,
    lore: [["A TEST EVA SUIT."]],
  },
  test_key: {
    id: "test_key",
    name: "TEST KEY",
    icon: "icon_key",
    lore: [["A TEST KEY."]],
    unlocks: "test_door",
  },
  // A SECOND key, for the half of the rule that matters most: a door opens for
  // ITS key and for no other.
  test_key_2: {
    id: "test_key_2",
    name: "TEST VAULT KEY",
    icon: "icon_key",
    lore: [["ANOTHER TEST KEY."]],
    unlocks: "test_vault",
  },
};

// A level mirroring `moon`'s geometry/tuning with synthetic ids: banded +
// pinned spawns, a wave budget over 1000, walls, jumpable + solid obstacles,
// a magic-capped loot table with an early weapon and an ability pool.
export const FIX_LEVEL: LevelDef = {
  id: "test_level",
  index: 1,
  name: "TEST LEVEL",
  intro: [["TEST INTRO LINE."]],
  width: 2400,
  height: 1600,
  gravity: 340,
  biome: "test",
  tiles: {
    ground: { common: "moon_0", rare: "moon_1", rareEvery: 23 },
    patch: { a: "gravel_0", b: "gravel_1", every: 7 },
  },
  foes: "FOES",
  playerSpawn: { x: 340, y: 1320 },
  landmarks: [
    { kind: "lander", pos: { x: 280, y: 1320 } },
    { kind: "flag", pos: { x: 2130, y: 260 }, anchor: "base" },
  ],
  objective: { type: "killBoss" },
  spawns: [
    { enemy: "test_fodder", count: 8, band: [0.05, 0.45] },
    { enemy: "test_minion", count: 6, band: [0.4, 0.8] },
    { enemy: "test_brute", count: 4, band: [0.75, 1.05] },
    { enemy: "test_boss", at: { x: 2130, y: 260 } },
  ],
  waves: {
    rampDurationMs: 300_000,
    maxAlive: 220,
    minAlive: 20,
    moveSpawnEvery: 64,
    budget: [
      { enemy: "test_fodder", count: 500, window: [0, 0.55] },
      { enemy: "test_minion", count: 400, window: [0.3, 0.85] },
      { enemy: "test_brute", count: 300, window: [0.55, 1] },
    ],
  },
  walls: [
    {
      kind: "test_wall",
      from: { x: 280, y: 480 },
      to: { x: 520, y: 400 },
      radius: 13,
      jumpable: false,
    },
    {
      kind: "test_wall",
      from: { x: 620, y: 700 },
      to: { x: 920, y: 640 },
      radius: 13,
      jumpable: false,
    },
  ],
  obstacles: [
    { kind: "test_block", count: 26, radius: 13, jumpable: false },
    { kind: "test_rock", count: 44, radius: 8, jumpable: true },
  ],
  decor: [{ kind: "test_decor", count: 22 }],
  decorClearance: 80,
  loot: {
    weaponPool: ["blaster", "test_pistol", "test_wand", "test_wrench"],
    gearPool: ["test_vest", "test_charm"],
    abilityPool: ["test_orbit", "test_storm", "test_stasis", "test_magnet"],
    // A low EASY cap so the golden-arrow COLD rule is exercisable on a
    // fixture; the default-difficulty (MEDIUM) suites leave it unset so their
    // arrows stay hot at every level they test.
    intendedLevelByDifficulty: { easy: 3 },
    earlyDrops: [
      { atKills: 2, weapon: "test_hammer" },
      { atKills: 5, ability: "test_storm" },
      { atKills: 8, item: "xp" },
    ],
  },
};

// A LOCKED-DOOR level: the reference level with two keyed doors across it.
//
// It is a FIXTURE rather than a shipped map because the shipped campaign carves
// its geometry per run (see `game/mapgen/`) and a carve emits no doors — the
// engine rule (a chain that stands until its own key is carried through it) is
// nonetheless a real one, and this is what keeps it honest.
export const FIX_DOOR_LEVEL: LevelDef = {
  ...FIX_LEVEL,
  id: "test_door_level",
  doors: [
    {
      id: "test_door",
      from: { x: 900, y: 1100 },
      to: { x: 1100, y: 1100 },
      radius: 13,
    },
    {
      id: "test_vault",
      from: { x: 1500, y: 700 },
      to: { x: 1700, y: 700 },
      radius: 13,
    },
    // AN INTERIOR DOOR: no key, no roll-up — it slides aside for anybody who
    // walks up to it, hero or staff, and leaves its leaves standing in the
    // jambs. The generated interiors hang one of these in every doorway
    // (`MapArea.doors`), which is what makes the rest of this suite matter: a
    // door only the hero could open would leave the whole night shift stuck.
    {
      id: "test_office_door",
      from: { x: 900, y: 500 },
      to: { x: 1100, y: 500 },
      radius: 13,
      sprite: "test_office_door",
      openSprite: "test_office_door_open",
      opens: "approach",
    },
  ],
};

// A PATH level: the reference level plus an authored INTENDED PATH (spawn →
// the boss flag) for the guidance-arrow and wall-trace navigation rules — the
// fixture where `onPathLevel` is true, so the maze-only nav (the guidance-
// arrow march, the navTarget deflection/wall-end sense, the unstuck escape)
// is exercisable. Waypoints thread the reference level's open middle.
export const FIX_PATH_LEVEL: LevelDef = {
  ...FIX_LEVEL,
  id: "test_path_level",
  path: [
    { x: 800, y: 1100 },
    { x: 1300, y: 780 },
    { x: 1800, y: 480 },
    { x: 2130, y: 260 },
  ],
};

// A level carrying RARE & UNIQUE encounter candidates (`rareSpawns`) for the
// special-mob rules; everything else is the reference level.
export const FIX_RARE_LEVEL: LevelDef = {
  ...FIX_LEVEL,
  id: "test_rare_level",
  rareSpawns: {
    rare: ["test_rare"],
    unique: ["test_unique_mob"],
  },
};

// A level whose wandering merchant has a full persona — look, name, and a
// meeting scene — for the discovery-dialogue rules. (The reference FIX_LEVEL
// keeps the default silent merchant so no other suite trips a greeting.)
export const FIX_MERCHANT_LEVEL: LevelDef = {
  ...FIX_LEVEL,
  id: "test_merchant_level",
  merchant: {
    sprite: "merchant_test",
    name: "TEST MERCHANT",
    greeting: [["TEST MERCHANT LINE ONE."], ["TEST MERCHANT LINE TWO."]],
    returnGreeting: ["TEST WELCOME BACK."],
  },
};

// A HUB level — the objective that never clears (`hub`), a merchant PARKED at
// his authored counter, no horde at all, and a standing travel door. The
// synthetic twin of the garage, for the engine rules a home base rests on.
export const FIX_HUB_LEVEL: LevelDef = (() => {
  const base: LevelDef = {
    ...FIX_LEVEL,
    id: "test_hub_level",
    objective: { type: "hub" },
    spawns: [],
    obstacles: [],
    decor: [],
    merchant: {
      parked: true,
    },
    merchantSpawns: [{ x: 600, y: 400 }],
    travelDoors: [
      { id: "test_hub_door", name: "TEST DOOR", to: ["test_level_2"] },
      // The car IS a travel door (the drive-out books `carDeparted` with
      // this door's destination) — id must be the landmark kind, like the
      // garage's own.
      { id: "car", name: "TEST CAR", to: ["test_level_2"] },
    ],
    landmarks: [
      {
        kind: "test_hub_door",
        sprite: "test_hub_door",
        anchor: "base",
        pos: { x: 900, y: 400 },
      },
      // The parked machines: `car` and `rocket` are ENGINE landmark kinds —
      // createGame mints a Vehicle for each (engine/game/vehicles.ts).
      { kind: "car", anchor: "base", pos: { x: 700, y: 500 } },
      { kind: "rocket", anchor: "base", pos: { x: 1100, y: 300 } },
      // THE CACHE's spot (engine/game/cache.ts) — `cache` is an ENGINE landmark
      // kind like the two above: the carve reserves the ground and the RUN
      // decides whether the chest stands in it. A hub is the only venue that
      // has one, exactly as the shipped garage is.
      { kind: "cache", anchor: "base", pos: { x: 500, y: 300 } },
    ],
  };
  delete base.waves;
  return base;
})();

// THE GARAGE twin: the hub with its bay door hung — an APPROACH door east of
// the parked car (it slides open for anybody who walks or drives near, no
// key; the driven car's departure books at its OPEN threshold, never by
// radial distance) — and the whole floor `revealed` (no fog of war, ever).
export const FIX_GARAGE_LEVEL: LevelDef = {
  ...FIX_HUB_LEVEL,
  id: "test_garage_level",
  revealed: true,
  doors: [
    {
      id: "test_garage_door",
      from: { x: 800, y: 440 },
      to: { x: 800, y: 560 },
      radius: 8,
      sprite: "test_garage_door",
      opens: "approach",
      // A roll-up, which is now said outright rather than inferred from the
      // lock: `approach` is about WHO opens it and `rollUp` about HOW, so a
      // building's interior doors can open for anybody who walks up without
      // every one of them sounding like a loading bay.
      rollUp: true,
    },
  ],
};

// THE GARAGE WITH A ROAD OUT — the same hub, its bay door hung exactly where
// the twin above hangs one, plus the strip of public tarmac a driven car is
// really gone at (`driveOut`). It is the SUPERSET on purpose: the point of the
// road is that it OUTRANKS the door it stands beyond, so a fixture that dropped
// the door could not prove the ordering at all. The strip runs north-south well
// east of the threshold (car parks at x 700, door at x 800, road from x 1000),
// so the bumper crosses the doorway a long moment before it reaches tarmac.
export const FIX_ROAD_LEVEL: LevelDef = {
  ...FIX_GARAGE_LEVEL,
  id: "test_road_level",
  driveOut: [
    { shape: "rect", rect: { x: 1000, y: 0, width: 120, height: 1600 } },
  ],
};

// THE GARAGE WITH A DEALER ON ITS ROAD — the road hub again, but its trader
// WORKS THE STRIP instead of standing at a counter (`merchant.beat`), and the
// beat is the very tarmac the departing car drives down. The synthetic twin of
// the shipped hub: it is the one arrangement in which the trader walks, can be
// hailed to a stop, and can be run over.
export const FIX_BEAT_LEVEL: LevelDef = {
  ...FIX_ROAD_LEVEL,
  id: "test_beat_level",
  merchant: { beat: true, line: "TEST LINE" },
  // He starts on his own strip, like the carve puts him.
  merchantSpawns: [{ x: 1060, y: 800 }],
  merchantBeat: [
    { shape: "rect", rect: { x: 1000, y: 0, width: 120, height: 1600 } },
  ],
};

// A level standing under a SKY, with two lamps on it — the synthetic twin of
// the garage's night (`engine/game/daylight.ts`). Everything else in the catalog
// deliberately has no `sky` at all, which is what proves the default: a venue
// that never opted in is never dimmed, whatever `daylight` a run carries.
export const FIX_SKY_LEVEL: LevelDef = {
  ...FIX_LEVEL,
  id: "test_sky_level",
  sky: "earth",
  lights: [
    { pos: { x: 700, y: 500 }, radius: 120 },
    {
      pos: { x: 900, y: 400 },
      radius: 80,
      color: "150, 216, 255",
      intensity: 0.7,
      flicker: 0.3,
    },
  ],
};

// A SECOND-CHAPTER level (index 2) for the seasoned-arrival rules: starting
// here must derive the player's level from test_level's roster and hand over
// its kit (see engine/game/arrival.ts). Geometry is the reference level's.
export const FIX_LEVEL_2: LevelDef = {
  ...FIX_LEVEL,
  id: "test_level_2",
  index: 2,
};

// A level with difficulty-gated content: a placed spawn line and a wave
// budget line that only appear from HARD up (`minDifficulty`). Used to test
// that create.ts and the wave spawner honor the gate.
export const FIX_GATED_LEVEL: LevelDef = {
  ...FIX_LEVEL,
  id: "test_gated_level",
  spawns: [
    ...FIX_LEVEL.spawns,
    // Five extra brutes reserved for HARD and above.
    { enemy: "test_brute", count: 5, band: [0.4, 0.8], minDifficulty: "hard" },
  ],
  waves: {
    ...FIX_LEVEL.waves!,
    budget: [
      ...FIX_LEVEL.waves!.budget,
      // A wraith surge that only the harder rungs face.
      {
        enemy: "test_brute",
        count: 200,
        window: [0.4, 0.9],
        minDifficulty: "hard",
      },
    ],
  },
};

/**
 * A bare hazard arena: the reference level with no waves, no obstacles and
 * only the parked far-away boss, so hazard suites keep surgical control of
 * the stage. `extra` layers the hazard (wells, asteroids, an apparition)
 * onto it.
 */
function hazardLevel(id: string, extra: Partial<LevelDef>): LevelDef {
  const base: LevelDef = {
    ...FIX_LEVEL,
    id,
    spawns: [{ enemy: "test_boss", at: { x: 2130, y: 260 } }],
    obstacles: [],
    decor: [],
    // Clone the loot table before pruning it, or the delete below would
    // reach through the shared reference into FIX_LEVEL itself.
    loot: { ...FIX_LEVEL.loot },
  };
  delete base.waves;
  delete base.loot.earlyDrops;
  return { ...base, ...extra };
}

// A level with one black hole parked mid-field (config-default numbers).
export const FIX_WELL_LEVEL: LevelDef = hazardLevel("test_well_level", {
  wells: [{ pos: { x: 1200, y: 800 } }],
});

// A level with the asteroid rain on, at a fixed cadence for determinism.
export const FIX_ASTEROID_LEVEL: LevelDef = hazardLevel("test_asteroid_level", {
  asteroids: { everyMs: [800, 800], craterSprites: ["crater_small"] },
});

// A level with rolling hay balls on, at a fixed cadence for determinism.
export const FIX_HAYBALL_LEVEL: LevelDef = hazardLevel("test_hayball_level", {
  hayBalls: { everyMs: [800, 800] },
});

// A level with sand storms on, at a fixed cadence for determinism.
export const FIX_SANDSTORM_LEVEL: LevelDef = hazardLevel(
  "test_sandstorm_level",
  { sandstorms: { everyMs: [800, 800] } },
);

// A level with employee stampedes on, at a fixed cadence for determinism.
export const FIX_STAMPEDE_LEVEL: LevelDef = hazardLevel("test_stampede_level", {
  stampedes: { everyMs: [800, 800] },
});

// A STAFF LOT with an entrance in it (`LevelDef.arrivals`, engine/game/arrivals.ts).
//
// It is a FIXTURE for the same reason the locked-door level is: the shipped
// venue carves its lot and its doorway fresh every run, and the ENGINE rule —
// a car rolls in, somebody gets out, walks to a keyed door and opens it — is a
// rule about any level that turns the beat on. So the geometry is hand-drawn
// here: a rectangle of tarmac along the map's western edge, and a single
// `entrance` door across the wall at its eastern side, with the hero landing on
// the lot in front of it.
//
// The door carries NO `opens`, which makes it a KEY door — and nothing in this
// ladder unlocks `entrance`, which is precisely the shipped arrangement: the
// only thing that ever opens it is somebody badging in.
export const FIX_ARRIVALS_LEVEL: LevelDef = hazardLevel("test_arrivals_level", {
  playerSpawn: { x: 400, y: 800 },
  arrivalLot: [
    { shape: "rect", rect: { x: 0, y: 600, width: 700, height: 400 } },
  ],
  doors: [
    {
      id: "entrance",
      from: { x: 700, y: 740 },
      to: { x: 700, y: 860 },
      radius: 10,
    },
  ],
  arrivals: {
    staff: ["test_bystander"],
    guards: { enemy: "test_bystander", count: 2 },
    firstMs: 1000,
    everyMs: [4000, 4000],
    maxCars: 2,
  },
});

// A level with a dialogue-only apparition parked ahead of the spawn.
export const FIX_APPARITION_LEVEL: LevelDef = hazardLevel(
  "test_apparition_level",
  {
    spawns: [
      { enemy: "test_apparition", at: { x: 700, y: 1320 } },
      { enemy: "test_boss", at: { x: 2130, y: 260 } },
    ],
  },
);

// A level with an OUTRO epilogue (mirrors Boot Hill): killing the boss arms
// the victory quake, and the countdown ends in the `outro` phase instead of
// the splash. Bare arena so the kill is surgical.
export const FIX_OUTRO_LEVEL: LevelDef = hazardLevel("test_outro_level", {
  outro: [["TEST OUTRO PAGE ONE."], ["TEST OUTRO PAGE TWO."]],
});

// A shooter arena: a gunner elite and a shielded, shooting boss with its
// guard — the ranged/cover/shield suites' stage. No waves, no obstacles
// (suites that need cover push a rock in by hand).
export const FIX_RANGED_LEVEL: LevelDef = hazardLevel("test_ranged_level", {
  spawns: [
    { enemy: "test_gunner", at: { x: 1200, y: 800 } },
    { enemy: "test_shielded_boss", at: { x: 2130, y: 260 } },
  ],
});

// A fixture UNIQUE for the merchant-stall rules (mirrors the Boot Hill
// THE STRONGMAN stall): a plain trinket relic the stall may roll into stock.
export const FIX_UNIQUES: Record<string, UniqueDef> = {
  test_relic: {
    id: "test_relic",
    name: "TEST RELIC",
    base: "test_charm",
    slot: "trinket",
    ilvl: 1,
    bonuses: [],
    lore: "A TEST RELIC.",
  },
  // A deliberately OVER-AUTHORED relic: scaling percentages far past the
  // engine ceiling (UNIQUE.scalingPctCap) beside an exempt damagePct — the
  // mint-clamp suite verifies statPct/maxHpPct clamp and damagePct doesn't.
  test_greedy_relic: {
    id: "test_greedy_relic",
    name: "TEST GREEDY RELIC",
    base: "test_charm",
    slot: "trinket",
    ilvl: 1,
    bonuses: [
      { kind: "statPct", stat: "strength", value: 0.5 },
      { kind: "maxHpPct", value: 0.4 },
      { kind: "damagePct", value: 0.3 },
    ],
    lore: "IT PROMISES TOO MUCH.",
  },
};

// A merchant level whose stall lists the fixture relic (rolled at the
// standing unique odds when the stall stocks — see rollStock). No greeting,
// so discovery leaves the run playing and the shop opens without a scene.
export const FIX_STALL_LEVEL: LevelDef = {
  ...FIX_MERCHANT_LEVEL,
  id: "test_stall_level",
  merchant: {
    sprite: "merchant_test",
    name: "TEST STALL MERCHANT",
    stockUniques: ["test_relic"],
  },
};

// A level with a LATENT travel gate (mirrors the rift's bunker door): using
// `test_gate_key` here tears the gate open beside the hero; stepping into it
// books a one-shot `gateEntered` the app answers with the actual travel.
export const FIX_GATE_LEVEL: LevelDef = hazardLevel("test_gate_level", {
  gates: [
    { id: "test_gate", to: "test_exit_level", opensWith: "test_gate_key" },
  ],
});

// A BOSSLESS farm level (mirrors the bunker): the objective is REACHING the
// exit door, the outro is its closing monologue, and `exitTo` names the
// return leg the victory splash offers. No boss anywhere on the roster.
export const FIX_EXIT_LEVEL: LevelDef = (() => {
  const level = hazardLevel("test_exit_level", {
    objective: { type: "reachExit", at: { x: 2130, y: 260 } },
    outro: [["TEST EXIT OUTRO."]],
    exitTo: "test_gate_level",
    spawns: [{ enemy: "test_minion", count: 2, band: [0.4, 0.8] }],
    loot: { ...FIX_LEVEL.loot, namedDropMult: 2 },
  });
  delete level.loot.earlyDrops;
  return level;
})();

// A prelude scene for the cutscene-in-a-run tests: a timed beat, then a text
// beat the sim parks on, an actor that exits (and never returns), and a
// closing caption.
export const FIX_CUTSCENE: CutsceneDef = {
  id: "test_prelude",
  stage: {
    width: 200,
    height: 120,
    backdrop: "test",
    props: [],
  },
  actors: [
    { id: "hero", name: "ME", sprite: "hero", at: { x: 60, y: 100 } },
    { id: "ada", name: "ADA", sprite: "ada", at: { x: 120, y: 100 } },
  ],
  beats: [
    { kind: "wait", ms: 100 },
    { kind: "caption", text: ["TEST CAPTION."] },
    { kind: "say", actor: "hero", text: ["STAY."] },
    { kind: "exit", actor: "ada" },
    // The door shutting behind her — a `sound` beat, so the run's forwarding of
    // a scene's noise into a `cutsceneSound` event has something to forward.
    { kind: "sound", sound: "test_door" },
    { kind: "caption", text: ["GONE."] },
  ],
};

// A level that opens on the prelude scene (for the cutscene-phase tests);
// otherwise identical to the reference level.
export const FIX_PRELUDE_LEVEL: LevelDef = {
  ...FIX_LEVEL,
  id: "test_prelude_level",
  prelude: "test_prelude",
};

// The reference level under a CLEAR-ALL objective (for the spawner's
// straggler rule: the endless post-budget trickle must stay OFF here, or the
// level could never be cleared).
export const FIX_CLEARALL_LEVEL: LevelDef = {
  ...FIX_LEVEL,
  id: "test_clearall_level",
  objective: { type: "clearAll" },
};

// A level built from PLACED PACKS (`LevelDef.packs`) instead of the wave
// horde: two dormant clusters at known spots, NO ambient waves, and NO placed
// spawns, under a `clearAll` objective — so the pack wake/clear rules and the
// clearAll gating (dormant members count as unspawned foes) can be driven in
// isolation. The near pack (scalar count, auto-scaled) wakes with a short
// walk; the far pack (a per-difficulty record + a scalar line, a tighter
// trigger) stays asleep until the player crosses the map.
export const FIX_PACK_LEVEL: LevelDef = {
  ...FIX_LEVEL,
  id: "test_pack_level",
  objective: { type: "clearAll" },
  spawns: [],
  waves: undefined,
  packs: [
    {
      at: { x: 700, y: 1320 },
      members: [{ enemy: "test_fodder", count: 3 }],
    },
    {
      at: { x: 2000, y: 300 },
      triggerRadius: 200,
      spawnRadius: 80,
      members: [
        { enemy: "test_minion", count: { easy: 1, hard: 4 } },
        { enemy: "test_brute", count: 2 },
      ],
    },
  ],
};

// A per-difficulty VARIANT of the prelude (`<id>_<difficulty>`), as the
// shipped game uses to hang the run's actual starting weapon on the wall:
// starting `test_prelude_level` on JESUS must resolve to this scene
// (cutsceneVariant), every other rung to the base `test_prelude`.
export const FIX_CUTSCENE_JESUS: CutsceneDef = {
  ...FIX_CUTSCENE,
  id: "test_prelude_jesus",
  beats: [{ kind: "caption", text: ["JESUS VARIANT."] }],
};

// A short second scene for the chained-prelude tests (`LevelDef.prelude`
// as a list): one caption, so tests can tell exactly when the chain rolled
// from `test_prelude` into this one.
export const FIX_CUTSCENE_2: CutsceneDef = {
  id: "test_prelude_2",
  stage: { width: 200, height: 120, backdrop: "test", props: [] },
  actors: [{ id: "hero", name: "ME", sprite: "hero", at: { x: 60, y: 100 } }],
  beats: [{ kind: "caption", text: ["SECOND SCENE."] }],
};

// A level whose prelude is a CHAIN of scenes played back-to-back — the
// shipped game's launch-then-flight openings.
export const FIX_CHAIN_LEVEL: LevelDef = {
  ...FIX_LEVEL,
  id: "test_chain_level",
  prelude: ["test_prelude", "test_prelude_2"],
};

// A level with a placed SPAREABLE unique — used to prove its enemy twin is
// held off the board while its companion rides the party (create.ts).
export const FIX_RECRUIT_LEVEL: LevelDef = {
  ...FIX_LEVEL,
  id: "test_recruit_level",
  spawns: [
    ...FIX_LEVEL.spawns,
    { enemy: "test_spareable", at: { x: 600, y: 300 } },
  ],
};

// A level exercising the DESIGN ZONE systems (engine/game/zones.ts): a safe
// circle near the spawn (no spawns + repel), a quiet rectangular dead area
// mid-field holding a chest, a tempo curve, and two merchant spawn points.
// Geometry is otherwise the reference level's.
export const FIX_ZONE_LEVEL: LevelDef = {
  ...FIX_LEVEL,
  id: "test_zone_level",
  safeZones: [{ shape: "circle", pos: { x: 340, y: 1320 }, radius: 150 }],
  quietZones: [
    { shape: "rect", rect: { x: 1400, y: 1000, width: 300, height: 300 } },
  ],
  chests: [{ at: { x: 1550, y: 1150 } }],
  merchantSpawns: [
    { x: 520, y: 1180 },
    { x: 1820, y: 420 },
  ],
  tempo: [
    { at: 0, intensity: 0.4 },
    { at: 0.5, intensity: 1.6 },
    { at: 1, intensity: 1 },
  ],
};

/** A level whose horde is SPAWN POINTS (spawners.ts), not a wave: one point near
 * the spawn plus a chained follow-up, so the spawner_test can watch a point arm,
 * drip its queue, drain, and hand off to its chain. Waves off, banded spawns
 * off — just the boss and the two points. */
export const FIX_SPAWNER_LEVEL: LevelDef = {
  ...FIX_LEVEL,
  id: "test_spawner_level",
  spawns: [{ enemy: "test_boss", at: { x: 2130, y: 260 } }],
  waves: undefined,
  spawners: [
    {
      id: "s1",
      at: { x: 520, y: 1320 },
      triggerRadius: 400,
      perEmit: 2,
      intervalMs: 100,
      // A tiny base so the resolved post-kill respawn delay floors at
      // SPAWNERS.respawnDelayMin (250ms) — predictable regardless of the
      // difficulty/boss/map factors the spawner_test doesn't want to reason about.
      respawnDelayMs: 50,
      members: [{ enemy: "test_fodder", count: 6 }],
    },
    {
      id: "s2",
      after: "s1",
      afterDelayMs: 500,
      at: { x: 560, y: 1320 },
      triggerRadius: 400,
      perEmit: 2,
      intervalMs: 100,
      respawnDelayMs: 50,
      members: [{ enemy: "test_minion", count: 4 }],
    },
  ],
};

/** A level with FOUR independent spawn points strung along one open row (no
 * walls, no obstacles, no chains) at rising distance from the player spawn —
 * so the simultaneous-active cap + closest-first arming (and the line-of-sight
 * gate, injected in-test) can be driven in isolation. Each point holds a long
 * fodder queue behind a small alive cap, so an armed point STAYS active (its
 * queue never empties while the hero idles) and the cap is observable. */
/** A level with ONE ordinary spawn point and ONE HELLGATE (config HELLGATES) at
 * the same spot, so the hellgate suite can watch the gate stay shut through a
 * calm run, tear open when the rampage crosses its `openStage`, escalate with
 * the meter, re-queue instead of draining, and shut again when the meter cools.
 * The gate's JESUS-gated second member line is what proves per-member difficulty
 * gating. Walls and obstacles are cleared so line of sight is never the reason a
 * point does or doesn't arm. */
export const FIX_HELLGATE_LEVEL: LevelDef = {
  ...FIX_LEVEL,
  id: "test_hellgate_level",
  spawns: [{ enemy: "test_boss", at: { x: 2130, y: 260 } }],
  waves: undefined,
  obstacles: [],
  walls: [],
  decor: [],
  spawners: [
    {
      id: "ordinary",
      at: { x: 520, y: 1320 },
      triggerRadius: 400,
      perEmit: 2,
      intervalMs: 100,
      respawnDelayMs: 50,
      members: [{ enemy: "test_fodder", count: 6 }],
    },
    {
      id: "gate",
      at: { x: 560, y: 1320 },
      hellgate: true,
      minDifficulty: "nightmare",
      members: [
        { enemy: "test_hellborn", count: 6 },
        { enemy: "test_hellborn_worse", count: 4, minDifficulty: "jesus" },
      ],
    },
  ],
};

export const FIX_SPAWNER_CAP_LEVEL: LevelDef = {
  ...FIX_LEVEL,
  id: "test_spawner_cap_level",
  spawns: [{ enemy: "test_boss", at: { x: 2130, y: 260 } }],
  waves: undefined,
  obstacles: [],
  walls: [],
  decor: [],
  spawners: [
    // Distances from the {340,1320} player spawn: 100, 300, 500, 700.
    {
      id: "near",
      at: { x: 440, y: 1320 },
      triggerRadius: 900,
      perEmit: 2,
      intervalMs: 100,
      maxAlive: 3,
      members: [{ enemy: "test_fodder", count: 20 }],
    },
    {
      id: "mid",
      at: { x: 640, y: 1320 },
      triggerRadius: 900,
      perEmit: 2,
      intervalMs: 100,
      maxAlive: 3,
      members: [{ enemy: "test_fodder", count: 20 }],
    },
    {
      id: "far",
      at: { x: 840, y: 1320 },
      triggerRadius: 900,
      perEmit: 2,
      intervalMs: 100,
      maxAlive: 3,
      members: [{ enemy: "test_fodder", count: 20 }],
    },
    {
      id: "farthest",
      at: { x: 1040, y: 1320 },
      triggerRadius: 900,
      perEmit: 2,
      intervalMs: 100,
      maxAlive: 3,
      members: [{ enemy: "test_fodder", count: 20 }],
    },
  ],
};

/** Two BOSSLESS spawn-point levels at opposite ends of the fixture campaign
 * (index 1 = first map, index 2 = last), each a single point authoring the SAME
 * base respawn delay. With no boss (bossMult = 1), a fixed difficulty, and a
 * fixed base, the ONLY factor that differs is CAMPAIGN PROGRESS — so the
 * spawner_test can prove a later map refills faster than an earlier one. They
 * reuse the existing index values (1, 2), so `levelPosition`'s total is
 * unchanged and the XP-cap suite is undisturbed. */
export const FIX_SPAWNER_EARLY_LEVEL: LevelDef = {
  ...FIX_LEVEL,
  id: "test_spawner_early_level",
  index: 1,
  spawns: [],
  waves: undefined,
  spawners: [
    {
      id: "s",
      at: { x: 520, y: 1320 },
      respawnDelayMs: 1000,
      members: [{ enemy: "test_fodder", count: 4 }],
    },
  ],
};

export const FIX_SPAWNER_LATE_LEVEL: LevelDef = {
  ...FIX_SPAWNER_EARLY_LEVEL,
  id: "test_spawner_late_level",
  index: 2,
};

/** A PATROL + ALARM arena: open floor, one pinned `test_worker` walking a
 * straight beat near the player spawn and wired (`alarms`) to a spawn point
 * far outside its own trigger range — so the patrol/alarm suite can watch the
 * route walked, the sentry wake, the far point activate and pour during the
 * alarm window, then fall back dormant. */
export const FIX_ALARM_LEVEL: LevelDef = {
  ...FIX_LEVEL,
  id: "test_alarm_level",
  waves: undefined,
  obstacles: [],
  walls: [],
  decor: [],
  spawns: [
    { enemy: "test_boss", at: { x: 2130, y: 260 } },
    {
      enemy: "test_worker",
      at: { x: 700, y: 1100 },
      patrol: [{ x: 700, y: 1500 }],
      alarms: "far",
    },
  ],
  spawners: [
    // A long queue behind a small alive cap, so the alarm window emits a
    // bounded squad and the point still holds mobs when the window lapses —
    // making the fall-back-to-dormant observable.
    {
      id: "far",
      at: { x: 2000, y: 1320 },
      triggerRadius: 300,
      perEmit: 2,
      intervalMs: 100,
      maxAlive: 6,
      members: [{ enemy: "test_fodder", count: 40 }],
    },
  ],
};

let installed = false;

/** Register the synthetic fixtures as the engine's active catalogs. Idempotent
 * (per test-file module isolation, this runs once per file); pass `force` to
 * re-install after a suite swapped in a custom catalog via registerDefs. */
export function installFixtures(force = false): void {
  if (installed && !force) return;
  registerDefs({
    levels: {
      test_level: FIX_LEVEL,
      test_level_2: FIX_LEVEL_2,
      test_sky_level: FIX_SKY_LEVEL,
      test_path_level: FIX_PATH_LEVEL,
      test_door_level: FIX_DOOR_LEVEL,
      test_rare_level: FIX_RARE_LEVEL,
      test_merchant_level: FIX_MERCHANT_LEVEL,
      test_hub_level: FIX_HUB_LEVEL,
      test_garage_level: FIX_GARAGE_LEVEL,
      test_road_level: FIX_ROAD_LEVEL,
      test_beat_level: FIX_BEAT_LEVEL,
      test_prelude_level: FIX_PRELUDE_LEVEL,
      test_chain_level: FIX_CHAIN_LEVEL,
      test_clearall_level: FIX_CLEARALL_LEVEL,
      test_pack_level: FIX_PACK_LEVEL,
      test_gated_level: FIX_GATED_LEVEL,
      test_well_level: FIX_WELL_LEVEL,
      test_asteroid_level: FIX_ASTEROID_LEVEL,
      test_hayball_level: FIX_HAYBALL_LEVEL,
      test_sandstorm_level: FIX_SANDSTORM_LEVEL,
      test_stampede_level: FIX_STAMPEDE_LEVEL,
      test_apparition_level: FIX_APPARITION_LEVEL,
      test_outro_level: FIX_OUTRO_LEVEL,
      test_ranged_level: FIX_RANGED_LEVEL,
      test_stall_level: FIX_STALL_LEVEL,
      test_gate_level: FIX_GATE_LEVEL,
      test_exit_level: FIX_EXIT_LEVEL,
      test_recruit_level: FIX_RECRUIT_LEVEL,
      test_zone_level: FIX_ZONE_LEVEL,
      test_spawner_level: FIX_SPAWNER_LEVEL,
      test_hellgate_level: FIX_HELLGATE_LEVEL,
      test_spawner_cap_level: FIX_SPAWNER_CAP_LEVEL,
      test_spawner_early_level: FIX_SPAWNER_EARLY_LEVEL,
      test_spawner_late_level: FIX_SPAWNER_LATE_LEVEL,
      test_alarm_level: FIX_ALARM_LEVEL,
      test_arrivals_level: FIX_ARRIVALS_LEVEL,
    },
    uniques: FIX_UNIQUES,
    enemies: FIX_ENEMIES,
    companions: FIX_COMPANIONS,
    weapons: FIX_WEAPONS,
    gear: FIX_GEAR,
    abilities: FIX_ABILITIES,
    difficulties: FIX_DIFFICULTIES,
    storyItems: FIX_STORY_ITEMS,
    cutscenes: {
      test_prelude: FIX_CUTSCENE,
      test_prelude_jesus: FIX_CUTSCENE_JESUS,
      test_prelude_2: FIX_CUTSCENE_2,
    },
  });
  installed = true;
}
