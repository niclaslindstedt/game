// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The ACHIEVEMENT catalog: every badge the game can award, with the condition
// each one reads off the lifetime totals (achievement-totals.ts). Content, not
// machinery — the fixed entries are this game's flavor, and the generated
// groups (one badge per mission, per difficulty, per hand-authored unique, per
// companion) derive from the live content registries so a sequel that rewrites
// the catalogs gets its roster of badges for free.
//
// Tiers reuse the oss-framework achievement ladder (beginner → expert) so the
// framework's point weights apply; the pixel UI (AchievementsScreen, the
// unlock toast) renders these defs directly — sprite-name icons, plain-string
// caps text — rather than the framework's DOM components, matching how the
// game re-skins every other framework surface.

import {
  COMPANION_DEFS,
  DIFFICULTY_ORDER,
  difficultyDef,
  equipmentIcon,
  LEVEL_ORDER,
  levelDef,
  UNIQUE_IDS,
  uniqueDef,
} from "@game/core";

import type { AchievementTier } from "@niclaslindstedt/oss-framework/achievements";

import {
  EQUIP_SLOTS,
  maxLevelRuns,
  type LifetimeTotals,
} from "./achievement-totals.ts";

/** Browser sections, in display order. */
export const ACHIEVEMENT_CATEGORIES = [
  "story",
  "combat",
  "loot",
  "gear",
  "arsenal",
  "party",
  "hero",
  "mastery",
] as const;
export type AchievementCategory = (typeof ACHIEVEMENT_CATEGORIES)[number];

export const CATEGORY_LABELS: Record<AchievementCategory, string> = {
  story: "STORY",
  combat: "COMBAT",
  loot: "LOOT",
  gear: "WARDROBE",
  arsenal: "ARSENAL",
  party: "PARTY",
  hero: "HERO",
  mastery: "MASTERY",
};

export type AchievementDef = {
  /** Stable ledger key — never rename a shipped id (unlocks key on it). */
  id: string;
  category: AchievementCategory;
  /** Badge title (pixel caps). */
  name: string;
  /** The condition, spelled out (pixel caps). */
  desc: string;
  /** Sprite-atlas name for the badge icon (any atlas sprite). */
  icon: string;
  /** Effort ladder — drives the point weight and the badge's frame color. */
  tier: AchievementTier;
  /** Progress meter for count ladders (have/goal); omit for one-shots. */
  progress?: (t: LifetimeTotals) => { have: number; goal: number };
  done: (t: LifetimeTotals) => boolean;
};

/** A counter ladder rung: `done` at `goal`, with a live progress meter. */
function counter(
  def: Omit<AchievementDef, "progress" | "done"> & {
    goal: number;
    read: (t: LifetimeTotals) => number;
  },
): AchievementDef {
  const { goal, read, ...rest } = def;
  return {
    ...rest,
    progress: (t) => ({ have: Math.min(read(t), goal), goal }),
    done: (t) => read(t) >= goal,
  };
}

/** One badge per campaign mission — clear it on any difficulty. */
function missionBadges(): AchievementDef[] {
  return LEVEL_ORDER.map((levelId, i) => {
    const level = levelDef(levelId);
    return {
      id: `clear_${levelId}`,
      category: "story" as const,
      name: level.name,
      desc: `CLEAR ${level.name} ON ANY DIFFICULTY`,
      icon: "map_story",
      tier: (i < 2 ? "beginner" : "intermediate") as AchievementTier,
      done: (t: LifetimeTotals) => t.levelClears.includes(levelId),
    };
  });
}

/** One badge per difficulty — beat the whole campaign on it. */
function difficultyBadges(): AchievementDef[] {
  const tiers: AchievementTier[] = [
    "intermediate",
    "intermediate",
    "pro",
    "expert",
    "expert",
  ];
  return DIFFICULTY_ORDER.map((difficulty, i) => {
    const def = difficultyDef(difficulty);
    return {
      id: `campaign_${difficulty}`,
      category: "story" as const,
      name: `${def.name} STREET CRED`,
      desc: `BEAT THE CAMPAIGN ON ${def.name}`,
      icon: "icon_trophy",
      tier: tiers[Math.min(i, tiers.length - 1)] ?? "expert",
      done: (t: LifetimeTotals) => t.difficultiesBeaten.includes(difficulty),
    };
  });
}

/** One badge per hand-authored unique — the trophy wall. */
function uniqueBadges(): AchievementDef[] {
  return UNIQUE_IDS.map((id) => {
    const u = uniqueDef(id);
    const tier: AchievementTier =
      u.ilvl <= 15 ? "intermediate" : u.ilvl <= 28 ? "pro" : "expert";
    return {
      id: `unique_${id}`,
      category: "arsenal" as const,
      name: u.name,
      desc: `FIND ${u.name}`,
      icon: equipmentIcon(u.base),
      tier,
      done: (t: LifetimeTotals) => t.uniquesFound.includes(id),
    };
  });
}

/** One badge per spareable legend — win them over. */
function companionBadges(): AchievementDef[] {
  return Object.values(COMPANION_DEFS).map((c) => ({
    id: `ally_${c.id}`,
    category: "party" as const,
    name: c.name,
    desc: `SPARE ${c.name} AND GAIN AN ALLY`,
    icon: equipmentIcon(c.weapon),
    tier: "pro" as AchievementTier,
    done: (t: LifetimeTotals) => t.companions.includes(c.id),
  }));
}

// Sized against the leveling model (scripts/leveling-curve.mjs): the climb
// to the level-99 cap runs ~25K kills, so the ladder keeps paying through
// the whole journey and two rungs beyond it for the post-cap farmers.
const KILL_LADDER: [string, string, number, AchievementTier][] = [
  ["kills_1", "FIRST BLOOD", 1, "beginner"],
  ["kills_100", "BODY COUNT", 100, "beginner"],
  ["kills_1000", "EXTERMINATOR", 1_000, "intermediate"],
  ["kills_5000", "ONE-PERSON ARMY", 5_000, "pro"],
  ["kills_10000", "APEX PREDATOR", 10_000, "expert"],
  ["kills_25000", "WALKING APOCALYPSE", 25_000, "expert"],
  ["kills_50000", "EXTINCTION EVENT", 50_000, "expert"],
  ["kills_100000", "DEATH INCARNATE", 100_000, "expert"],
];

const MAGIC_LADDER: [string, string, number, AchievementTier][] = [
  ["magic_10", "MAGIC TOUCH", 10, "beginner"],
  ["magic_25", "BLUE BLOOD", 25, "beginner"],
  ["magic_50", "ENCHANTED", 50, "intermediate"],
  ["magic_100", "MAGIC KINGDOM", 100, "pro"],
  ["magic_250", "DEEP BLUE", 250, "expert"],
];

const RARE_LADDER: [string, string, number, AchievementTier][] = [
  ["rare_10", "RARE TASTE", 10, "beginner"],
  ["rare_25", "RARE BREED", 25, "intermediate"],
  ["rare_50", "RARE FORM", 50, "pro"],
  ["rare_100", "RARITY EXPERT", 100, "expert"],
  ["rare_250", "GOLD STANDARD", 250, "expert"],
];

// Damage feats, grounded in the live balance model (see the weapon-system
// skill's calculators): with the looted-weapon damper at 0.5 and STR/INT
// worth 20%/12% per point, an early crit lands ~20-50, a mid-game crit
// ~250, a strong endgame crit ~1,500-2,000, and a god-roll (top base, fat
// damagePct affix, PERFECT make, top-of-band crit) peaks ~5-6K on one
// target. One STRIKE's total (a nuke billing each victim's remaining hp,
// an INT-cleave sweep, a pierce volley) starts ~150 on an early screen
// wipe and reaches 25-50K nuking a dense endgame horde.
const SINGLE_HIT_LADDER: [string, string, number, AchievementTier][] = [
  ["single_50", "HEAVY HITTER", 50, "beginner"],
  ["single_250", "HAYMAKER", 250, "intermediate"],
  ["single_1000", "EXECUTIONER", 1_000, "pro"],
  ["single_5000", "GODHAND", 5_000, "expert"],
];

// Lifetime damage: the same kill model integrated over the whole climb —
// ~25K kills at a journey-average ~225 scaled hp each puts the road to 99
// at roughly 5-7M damage dealt, so 10M is the "finished the climb and kept
// swinging" rung and 50M the long post-cap farm.
const TOTAL_DAMAGE_LADDER: [string, string, number, AchievementTier][] = [
  ["damage_10k", "PAIN DEALER", 10_000, "beginner"],
  ["damage_100k", "HURT LOCKER", 100_000, "intermediate"],
  ["damage_1m", "FORCE OF NATURE", 1_000_000, "pro"],
  ["damage_10m", "NATURAL DISASTER", 10_000_000, "expert"],
  ["damage_50m", "PLANET CRACKER", 50_000_000, "expert"],
];

const BURST_LADDER: [string, string, number, AchievementTier][] = [
  ["burst_100", "BLAST RADIUS", 100, "beginner"],
  ["burst_1000", "CROWD CONTROL", 1_000, "intermediate"],
  ["burst_5000", "SHOCK AND AWE", 5_000, "pro"],
  ["burst_25000", "CATACLYSM", 25_000, "expert"],
];

/** The first-equip badge per slot: name, condition copy, and icon. */
const SLOT_BADGES: Record<
  (typeof EQUIP_SLOTS)[number],
  { name: string; desc: string; icon: string }
> = {
  weapon: {
    name: "ARMED AND DANGEROUS",
    desc: "EQUIP A LOOTED WEAPON",
    icon: "icon_machete",
  },
  head: { name: "HARD HEADED", desc: "EQUIP A HELMET", icon: "icon_hard_hat" },
  chest: {
    name: "SUIT UP",
    desc: "EQUIP A CHEST PIECE",
    icon: "icon_kevlar_vest",
  },
  legs: { name: "LEG DAY", desc: "EQUIP LEG ARMOR", icon: "icon_jeans" },
  feet: {
    name: "BEST FOOT FORWARD",
    desc: "EQUIP FOOTWEAR",
    icon: "icon_leather_boots",
  },
  charm: { name: "CHARMED", desc: "EQUIP A CHARM", icon: "icon_charm" },
  bag: { name: "PACK MULE", desc: "EQUIP A BAG", icon: "icon_bag" },
};

const UNIQUE_LADDER: [string, string, number, AchievementTier][] = [
  ["uniques_1", "ONE OF A KIND", 1, "beginner"],
  ["uniques_5", "COLLECTOR", 5, "intermediate"],
  ["uniques_10", "CURATOR", 10, "pro"],
  ["uniques_25", "MUSEUM GRADE", 25, "expert"],
  ["uniques_50", "LIVING MUSEUM", 50, "expert"],
];

/** The full catalog, browser order: fixed entries + generated groups. */
export const ACHIEVEMENTS: AchievementDef[] = [
  // ---- STORY: the campaign, difficulty ladder, lore, the merchant.
  ...missionBadges(),
  ...difficultyBadges(),
  counter({
    id: "story_1",
    category: "story",
    name: "LORE HOUND",
    desc: "COLLECT A STORY ITEM",
    icon: "icon_dossier",
    tier: "beginner",
    goal: 1,
    read: (t) => t.storyItems.length,
  }),
  counter({
    id: "story_10",
    category: "story",
    name: "ARCHIVIST",
    desc: "COLLECT 10 STORY ITEMS",
    icon: "icon_dossier",
    tier: "pro",
    goal: 10,
    read: (t) => t.storyItems.length,
  }),
  {
    id: "merchant_met",
    category: "story",
    name: "WINDOW SHOPPER",
    desc: "DISCOVER THE WANDERING MERCHANT",
    icon: "icon_coins",
    tier: "beginner",
    done: (t) => t.merchantsMet >= 1,
  },

  // ---- COMBAT: the kill grind, elites, bosses, and battle feats.
  ...KILL_LADDER.map(([id, name, goal, tier]) =>
    counter({
      id,
      category: "combat",
      name,
      desc: `KILL ${goal.toLocaleString("en-US")} ${goal === 1 ? "MOB" : "MOBS"}`,
      icon: "icon_skull",
      tier,
      goal,
      read: (t) => t.kills,
    }),
  ),
  counter({
    id: "elites_5",
    category: "combat",
    name: "ELITE HUNTER",
    desc: "KILL 5 ELITE MOBS",
    icon: "map_elite",
    tier: "beginner",
    goal: 5,
    read: (t) => t.eliteKills,
  }),
  counter({
    id: "elites_25",
    category: "combat",
    name: "ELITE SLAYER",
    desc: "KILL 25 ELITE MOBS",
    icon: "map_elite",
    tier: "intermediate",
    goal: 25,
    read: (t) => t.eliteKills,
  }),
  counter({
    id: "elites_100",
    category: "combat",
    name: "ELITE REAPER",
    desc: "KILL 100 ELITE MOBS",
    icon: "map_elite",
    tier: "pro",
    goal: 100,
    read: (t) => t.eliteKills,
  }),
  counter({
    id: "elites_500",
    category: "combat",
    name: "LEGEND ERASER",
    desc: "KILL 500 ELITE MOBS",
    icon: "map_elite",
    tier: "expert",
    goal: 500,
    read: (t) => t.eliteKills,
  }),
  counter({
    id: "bosses_1",
    category: "combat",
    name: "GIANT KILLER",
    desc: "DEFEAT A BOSS",
    icon: "icon_crown",
    tier: "beginner",
    goal: 1,
    read: (t) => t.bossKills,
  }),
  counter({
    id: "bosses_10",
    category: "combat",
    name: "TYRANT'S BANE",
    desc: "DEFEAT 10 BOSSES",
    icon: "icon_crown",
    tier: "intermediate",
    goal: 10,
    read: (t) => t.bossKills,
  }),
  counter({
    id: "bosses_50",
    category: "combat",
    name: "KINGSLAYER",
    desc: "DEFEAT 50 BOSSES",
    icon: "icon_crown",
    tier: "expert",
    goal: 50,
    read: (t) => t.bossKills,
  }),
  counter({
    id: "bosses_250",
    category: "combat",
    name: "REGICIDE ROUTINE",
    desc: "DEFEAT 250 BOSSES",
    icon: "icon_crown",
    tier: "expert",
    goal: 250,
    read: (t) => t.bossKills,
  }),
  {
    id: "boss_fled",
    category: "combat",
    name: "SLIPPERY DEVIL",
    desc: "WATCH A BOSS ESCAPE THROUGH A RIFT",
    icon: "rift",
    tier: "beginner",
    done: (t) => t.bossFlees >= 1,
  },
  {
    id: "nuke_1",
    category: "combat",
    name: "SCORCHED EARTH",
    desc: "SET OFF A NUKE",
    icon: "icon_nuke",
    tier: "beginner",
    done: (t) => t.nukes >= 1,
  },
  {
    id: "menace_max",
    category: "combat",
    name: "PUBLIC ENEMY NO. 1",
    desc: "REACH RAMPAGE STAGE 10",
    icon: "icon_storm",
    tier: "pro",
    // The evolution ratchet uncapped the stage — 10 (the old full gauge) stays
    // the badge's bar, now a fixed rung on an endless ladder.
    done: (t) => t.maxMenace >= 10,
  },
  {
    id: "death_1",
    category: "combat",
    name: "OCCUPATIONAL HAZARD",
    desc: "DIE. IT HAPPENS",
    icon: "medkit",
    tier: "beginner",
    done: (t) => t.deaths >= 1,
  },
  {
    id: "untouchable",
    category: "combat",
    name: "UNTOUCHABLE",
    desc: "CLEAR A MISSION WITHOUT TAKING DAMAGE",
    icon: "icon_aegis_plate",
    tier: "expert",
    done: (t) => t.untouchableClears >= 1,
  },
  {
    id: "speedrun",
    category: "combat",
    name: "SPEEDRUNNER",
    desc: "CLEAR A MISSION IN UNDER 5 MINUTES",
    icon: "icon_stopwatch",
    tier: "pro",
    done: (t) => t.speedClears >= 1,
  },
  ...SINGLE_HIT_LADDER.map(([id, name, goal, tier]) =>
    counter({
      id,
      category: "combat",
      name,
      desc: `HIT ONE ENEMY FOR ${goal.toLocaleString("en-US")} DAMAGE`,
      icon: "bolt",
      tier,
      goal,
      read: (t) => t.maxSingleHit,
    }),
  ),
  ...TOTAL_DAMAGE_LADDER.map(([id, name, goal, tier]) =>
    counter({
      id,
      category: "combat",
      name,
      desc: `DEAL ${goal.toLocaleString("en-US")} TOTAL DAMAGE`,
      icon: "icon_swords",
      tier,
      goal,
      read: (t) => t.totalDamage,
    }),
  ),
  ...BURST_LADDER.map(([id, name, goal, tier]) =>
    counter({
      id,
      category: "combat",
      name,
      desc: `DEAL ${goal.toLocaleString("en-US")} DAMAGE IN ONE STRIKE`,
      icon: "fireball",
      tier,
      goal,
      read: (t) => t.maxBurstDamage,
    }),
  ),

  // ---- LOOT: rarity ladders and the collection meta.
  ...MAGIC_LADDER.map(([id, name, goal, tier]) =>
    counter({
      id,
      category: "loot",
      name,
      desc: `FIND ${goal} MAGIC ITEMS`,
      icon: "icon_charm",
      tier,
      goal,
      read: (t) => t.magicFound,
    }),
  ),
  ...RARE_LADDER.map(([id, name, goal, tier]) =>
    counter({
      id,
      category: "loot",
      name,
      desc: `FIND ${goal} RARE ITEMS`,
      icon: "icon_enchanted_ring",
      tier,
      goal,
      read: (t) => t.rareFound,
    }),
  ),
  ...UNIQUE_LADDER.map(([id, name, goal, tier]) =>
    counter({
      id,
      category: "loot",
      name,
      desc: `FIND ${goal} UNIQUE ${goal === 1 ? "ITEM" : "ITEMS"}`,
      icon: "icon_crystal_orb",
      tier,
      goal,
      read: (t) => t.uniqueFound,
    }),
  ),
  {
    id: "legendary_1",
    category: "loot",
    name: "THE STUFF OF LEGENDS",
    desc: "FIND A LEGENDARY ITEM",
    icon: "icon_golden_stapler",
    tier: "expert",
    done: (t) => t.legendaryFound >= 1,
  },
  counter({
    id: "uniques_all",
    category: "loot",
    name: "COMPLETIONIST",
    desc: "FIND EVERY UNIQUE ITEM",
    icon: "icon_bag",
    tier: "expert",
    goal: UNIQUE_IDS.length,
    read: (t) => t.uniquesFound.length,
  }),

  // ---- WARDROBE: dressing the hero, slot by slot, then head to toe.
  ...EQUIP_SLOTS.map((slot) => ({
    id: `equip_${slot}`,
    category: "gear" as const,
    name: SLOT_BADGES[slot].name,
    desc: SLOT_BADGES[slot].desc,
    icon: SLOT_BADGES[slot].icon,
    tier: "beginner" as AchievementTier,
    done: (t: LifetimeTotals) => t.slotsWorn.includes(slot),
  })),
  counter({
    id: "outfit_full",
    category: "gear",
    name: "FULL KIT",
    desc: "FILL EVERY EQUIPMENT SLOT AT ONCE",
    icon: "icon_suit",
    tier: "intermediate",
    goal: EQUIP_SLOTS.length,
    read: (t) => (t.outfitRank >= 0 ? EQUIP_SLOTS.length : t.slotsWorn.length),
  }),
  {
    id: "outfit_magic",
    category: "gear",
    name: "DRESSED TO KILL",
    desc: "WEAR A FULL OUTFIT, ALL MAGIC OR BETTER",
    icon: "icon_chainmail",
    tier: "pro",
    done: (t) => t.outfitRank >= 1,
  },
  {
    id: "outfit_rare",
    category: "gear",
    name: "HIGH FASHION",
    desc: "WEAR A FULL OUTFIT, ALL RARE OR BETTER",
    icon: "icon_cuirass",
    tier: "expert",
    done: (t) => t.outfitRank >= 2,
  },
  {
    id: "outfit_unique",
    category: "gear",
    name: "MYTHIC WARDROBE",
    desc: "WEAR A FULL OUTFIT, ALL UNIQUE OR LEGENDARY",
    icon: "icon_dragonscale_cloak",
    tier: "expert",
    done: (t) => t.outfitRank >= 3,
  },

  // ---- ARSENAL: one trophy per hand-authored unique.
  ...uniqueBadges(),

  // ---- PARTY: the spared legends.
  {
    id: "ally_first",
    category: "party",
    name: "FIRST FRIEND",
    desc: "RECRUIT A COMPANION",
    icon: "icon_clover",
    tier: "intermediate",
    done: (t) => t.companions.length >= 1,
  },
  ...companionBadges(),
  counter({
    id: "ally_all",
    category: "party",
    name: "THE FULL PARTY",
    desc: "RECRUIT EVERY COMPANION",
    icon: "flag",
    tier: "expert",
    goal: Object.keys(COMPANION_DEFS).length,
    read: (t) => t.companions.length,
  }),

  // ---- HERO: the level climb (cap 99 — see LEVELING.maxLevel).
  counter({
    id: "level_10",
    category: "hero",
    name: "DOUBLE DIGITS",
    desc: "REACH LEVEL 10",
    icon: "icon_medal",
    tier: "beginner",
    goal: 10,
    read: (t) => t.heroLevel,
  }),
  counter({
    id: "level_25",
    category: "hero",
    name: "SEASONED",
    desc: "REACH LEVEL 25",
    icon: "icon_medal",
    tier: "intermediate",
    goal: 25,
    read: (t) => t.heroLevel,
  }),
  counter({
    id: "level_50",
    category: "hero",
    name: "VETERAN",
    desc: "REACH LEVEL 50",
    icon: "icon_medal",
    tier: "pro",
    goal: 50,
    read: (t) => t.heroLevel,
  }),
  counter({
    id: "level_75",
    category: "hero",
    name: "WAR MACHINE",
    desc: "REACH LEVEL 75",
    icon: "icon_medal",
    tier: "expert",
    goal: 75,
    read: (t) => t.heroLevel,
  }),
  counter({
    id: "level_99",
    category: "hero",
    name: "LIVING LEGEND",
    desc: "REACH LEVEL 99",
    icon: "icon_medal",
    tier: "expert",
    goal: 99,
    read: (t) => t.heroLevel,
  }),

  // ---- MASTERY: showing up, again and again.
  counter({
    id: "runs_10",
    category: "mastery",
    name: "FREQUENT FLYER",
    desc: "START 10 RUNS",
    icon: "rocket",
    tier: "beginner",
    goal: 10,
    read: (t) => t.totalRuns,
  }),
  counter({
    id: "runs_50",
    category: "mastery",
    name: "ROAD WARRIOR",
    desc: "START 50 RUNS",
    icon: "starship",
    tier: "intermediate",
    goal: 50,
    read: (t) => t.totalRuns,
  }),
  counter({
    id: "runs_100",
    category: "mastery",
    name: "NO PLACE LIKE HOME",
    desc: "START 100 RUNS",
    icon: "lander",
    tier: "pro",
    goal: 100,
    read: (t) => t.totalRuns,
  }),
  counter({
    id: "farm_10",
    category: "mastery",
    name: "CREATURE OF HABIT",
    desc: "RUN THE SAME MISSION 10 TIMES",
    icon: "tracks",
    tier: "intermediate",
    goal: 10,
    read: maxLevelRuns,
  }),
  counter({
    id: "farm_25",
    category: "mastery",
    name: "FARMING SIMULATOR",
    desc: "RUN THE SAME MISSION 25 TIMES",
    icon: "plant",
    tier: "pro",
    goal: 25,
    read: maxLevelRuns,
  }),
];

/** Ledger lookups: id → def, in one pass. */
export const ACHIEVEMENTS_BY_ID: ReadonlyMap<string, AchievementDef> = new Map(
  ACHIEVEMENTS.map((a) => [a.id, a]),
);
