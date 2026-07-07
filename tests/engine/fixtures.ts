// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Synthetic content fixtures for the ENGINE test suites. These are plain-id
// defs (`test_level`, `test_minion`, …) registered via the engine's
// `registerDefs` hook so the engine-rule tests exercise the simulation
// WITHOUT depending on this game's shipped catalogs. Deleting every entry
// from `src/game/defs/*` (a sequel stripping content) leaves these suites
// green, because they run on these fixtures instead.
//
// The numbers deliberately MIRROR the shipped `moon`/`ghost`/`blaster`/…
// tuning the suites were originally calibrated against, so the assertions
// hold unchanged — only the ids are synthetic. `installFixtures()` registers
// them; call it once at module load from the engine test helper.
//
// NOTE: the id `blaster` is intentional — `create.ts` mints it as the
// starting sidearm and `items.ts` falls back to it when a weapon breaks, so
// the fixture keeps that one shared id (the rest are `test_*`).

import {
  registerDefs,
  type AbilityDef,
  type CutsceneDef,
  type DifficultyDef,
  type EnemyDef,
  type GearDef,
  type LevelDef,
  type StoryItemDef,
  type WeaponDef,
} from "@game/core";

export const FIX_ENEMIES: Record<string, EnemyDef> = {
  // Fodder — the horde's front rank (mirrors `wisp`).
  test_fodder: {
    id: "test_fodder",
    name: "TEST FODDER",
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
  // A NON-phasing minion for wall / line-of-sight tests (mirrors `guard`).
  test_stalker: {
    id: "test_stalker",
    name: "TEST STALKER",
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
  // The objective boss (mirrors `armstrong`): far post, aggro + leash radii,
  // dialogue + last words, a guaranteed drop.
  test_boss: {
    id: "test_boss",
    name: "TEST BOSS",
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
      xpArrows: 2,
      repairs: 1,
      medkits: 2,
      tierBonus: 0.35,
    },
  },
};

export const FIX_WEAPONS: Record<string, WeaponDef> = {
  // Shared id: the engine mints `blaster` as the starting sidearm.
  blaster: {
    id: "blaster",
    name: "BLASTER",
    class: "ranged",
    damage: 8,
    cooldownMs: 650,
    range: 260,
    durability: 150,
    projectile: { speed: 420, radius: 3, lifetimeMs: 900, sprite: "bolt" },
    icon: "icon_blaster",
  },
  // A clear early melee upgrade (mirrors `wrench`): damage 22.
  test_wrench: {
    id: "test_wrench",
    name: "TEST WRENCH",
    class: "melee",
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
    damage: 7,
    cooldownMs: 400,
    range: 230,
    durability: 200,
    projectile: { speed: 400, radius: 3, lifetimeMs: 800, sprite: "bolt" },
    icon: "icon_pistol",
  },
};

export const FIX_GEAR: Record<string, GearDef> = {
  test_suit: {
    id: "test_suit",
    name: "TEST SUIT",
    slot: "suit",
    bonuses: { maxHp: 20 },
    icon: "icon_suit",
  },
  test_charm: {
    id: "test_charm",
    name: "TEST CHARM",
    slot: "charm",
    bonuses: { critChance: 0.03 },
    icon: "icon_charm",
  },
};

export const FIX_ABILITIES: Record<string, AbilityDef> = {
  test_orbit: {
    id: "test_orbit",
    name: "TEST ORBIT",
    kind: "orbit",
    durationMs: 12_000,
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
    kind: "storm",
    durationMs: 10_000,
    icon: "icon_storm",
    storm: { intervalMs: 450, damage: 25, range: 220 },
  },
  test_stasis: {
    id: "test_stasis",
    name: "TEST STASIS",
    kind: "stasis",
    durationMs: 9_000,
    icon: "icon_stasis",
    stasis: { radius: 130, slowFactor: 0.3 },
  },
  test_nuke: {
    id: "test_nuke",
    name: "TEST NUKE",
    kind: "nuke",
    durationMs: 0,
    icon: "icon_nuke",
    nuke: { radius: 240 },
  },
  test_magnet: {
    id: "test_magnet",
    name: "TEST MAGNET",
    kind: "magnet",
    durationMs: 12_000,
    icon: "icon_magnet",
    magnet: { radius: 80, radiusPerInt: 8, pullSpeed: 200 },
  },
};

// The difficulty ladder mirrors the shipped values exactly (difficulty tests
// assert specific multipliers like jesus ×2.6 and the epic/legendary unlocks).
export const FIX_DIFFICULTIES: Record<string, DifficultyDef> = {
  easy: {
    id: "easy",
    index: 1,
    name: "EASY",
    tagline: "TEST EASY",
    color: "#7ef0c8",
    mobCountMult: 0.7,
    mobHpMult: 0.8,
    aliveMult: 0.7,
    dropChanceBonus: 0,
    tierChanceBonus: {},
  },
  medium: {
    id: "medium",
    index: 2,
    name: "MEDIUM",
    tagline: "TEST MEDIUM",
    color: "#4da6ff",
    mobCountMult: 1,
    mobHpMult: 1,
    aliveMult: 1,
    dropChanceBonus: 0,
    tierChanceBonus: {},
  },
  hard: {
    id: "hard",
    index: 3,
    name: "HARD",
    tagline: "TEST HARD",
    color: "#ffd75e",
    mobCountMult: 1.4,
    mobHpMult: 1.35,
    aliveMult: 1.3,
    dropChanceBonus: 0.03,
    tierChanceBonus: { magic: 0.1, epic: 0.06 },
  },
  nightmare: {
    id: "nightmare",
    index: 4,
    name: "NIGHTMARE",
    tagline: "TEST NIGHTMARE",
    color: "#ff8c42",
    mobCountMult: 1.9,
    mobHpMult: 1.75,
    aliveMult: 1.65,
    dropChanceBonus: 0.06,
    tierChanceBonus: { magic: 0.18, epic: 0.14, legendary: 0.04 },
  },
  jesus: {
    id: "jesus",
    index: 5,
    name: "JESUS CHRIST!",
    tagline: "TEST JESUS",
    color: "#d83a3a",
    mobCountMult: 2.6,
    mobHpMult: 2.25,
    aliveMult: 2.1,
    dropChanceBonus: 0.1,
    tierChanceBonus: { magic: 0.26, epic: 0.22, legendary: 0.09 },
  },
};

export const FIX_STORY_ITEMS: Record<string, StoryItemDef> = {
  test_key: {
    id: "test_key",
    name: "TEST KEY",
    icon: "icon_key",
    lore: [["A TEST KEY."]],
    unlocks: "test_door",
  },
};

// A level mirroring `moon`'s geometry/tuning with synthetic ids: banded +
// pinned spawns, a wave budget over 1000, walls, jumpable + solid obstacles,
// a magic-capped loot table with an early weapon and an ability pool.
export const FIX_LEVEL: LevelDef = {
  id: "test_level",
  index: 1,
  name: "TEST LEVEL",
  intro: ["TEST INTRO LINE."],
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
    gearPool: ["test_suit", "test_charm"],
    abilityPool: ["test_orbit", "test_storm", "test_stasis", "test_magnet"],
    tierChances: { magic: 0.2 },
    earlyWeapon: { defId: "test_hammer", minKills: 40, maxKills: 100 },
  },
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

let installed = false;

/** Register the synthetic fixtures as the engine's active catalogs. Idempotent
 * (per test-file module isolation, this runs once per file). */
export function installFixtures(): void {
  if (installed) return;
  registerDefs({
    levels: {
      test_level: FIX_LEVEL,
      test_prelude_level: FIX_PRELUDE_LEVEL,
      test_gated_level: FIX_GATED_LEVEL,
    },
    enemies: FIX_ENEMIES,
    weapons: FIX_WEAPONS,
    gear: FIX_GEAR,
    abilities: FIX_ABILITIES,
    difficulties: FIX_DIFFICULTIES,
    storyItems: FIX_STORY_ITEMS,
    cutscenes: { test_prelude: FIX_CUTSCENE },
  });
  installed = true;
}
