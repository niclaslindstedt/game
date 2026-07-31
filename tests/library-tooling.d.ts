// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Ambient types for THE LIBRARY's build-tooling `.mjs` modules
// (pwa/scripts/library/, see docs/architecture.md). They're plain JavaScript
// with no declarations of their own; these wildcard module shims give
// tests/content/library_test.ts just enough typing to import them without
// `any` — the same pattern as ./sprite-tooling.d.ts.
//
// Deliberately loose on the page model: the shapes are the generator's own
// business and pinning them here would be a second definition to keep in step.
// What the test asserts is BEHAVIOUR — that every monster gets a page, that
// the numbers are the engine's, that the markup holds — not field types.

type LibraryRung = {
  difficulty: string;
  name: string;
  color: string;
  heroLevel: number;
  level: [number, number];
  authoredHp: boolean;
  hp: [number, number];
  contact: [number, number];
  xp: [number, number];
};

type LibrarySighting = {
  venue: { id: string; slug: string; name: string };
  kinds: string[];
  rungs: LibraryRung[];
};

type LibraryEnemy = {
  id: string;
  slug: string;
  path: string;
  name: string;
  lore: string;
  role: "minion" | "elite" | "boss";
  sprite: string;
  home: { id: string; slug: string; name: string } | null;
  sightings: LibrarySighting[];
  [field: string]: unknown;
};

/** An arsenal page's subject — a plain base or a named chase item. Loose for
 * the same reason `LibraryEnemy` is: the shape is the generator's business. */
type LibraryItem = {
  id: string;
  slug: string;
  path: string;
  name: string;
  kind: "base" | "named";
  family: "weapon" | "gear" | "named";
  tier: string;
  icon: string;
  levelReq: number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [field: string]: any;
};

/** A mission page's subject. */
type LibraryMission = {
  id: string;
  slug: string;
  path: string;
  name: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [field: string]: any;
};

/** A power page's subject — one timed powerup. */
type LibraryPower = {
  id: string;
  slug: string;
  path: string;
  name: string;
  lore: string;
  kind: string;
  icon: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [field: string]: any;
};

/** The whole powers section: the pages, the venue grouping, and the yardsticks
 * the damage figures on them are read against. */
type LibraryPowers = {
  powers: LibraryPower[];
  groups: Array<{
    venue: { id: string; name: string } | null;
    entries: LibraryPower[];
  }>;
  refMobHp: number;
  intDamagePerPoint: number;
  stasisRadiusPerInt: number;
};

/** A talent page's subject — one passive talent, with its per-rank readouts. */
type LibraryTalent = {
  id: string;
  slug: string;
  path: string;
  name: string;
  blurb: string;
  kind: string;
  icon: string;
  maxRank: number;
  tree: { id: string; stat: string; title: string; accent: string };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [field: string]: any;
};

/** The whole talents section: the pages, the three trees, and the point
 * economy every one of them is bought out of. */
type LibraryTalents = {
  talents: LibraryTalent[];
  trees: Array<{
    id: string;
    stat: string;
    title: string;
    accent: string;
    entries: LibraryTalent[];
    capacity: number;
    ceiling: number;
  }>;
  unlockStep: number;
  maxRank: number;
  statHardCap: number;
  refMobHp: number;
  spellIntervalPerInt: number;
  spellIntervalFloor: number;
};

/** A story chapter's subject — one mission's worth of plot, or the hellborn. */
type LibraryChapter = {
  id: string;
  slug: string;
  path: string;
  name: string;
  kind: "mission" | "hellborn";
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [field: string]: any;
};

/** An errand page's subject — one quest, with its ask, its reward and its
 * chain already resolved. Loose for the same reason the others are. */
type LibraryQuest = {
  id: string;
  slug: string;
  path: string;
  name: string;
  lore: string;
  face: string | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [field: string]: any;
};

/** A quest giver's page — one person and the whole chain they hand out. */
type LibraryGiver = {
  id: string;
  slug: string;
  path: string;
  name: string;
  lore: string;
  sprite: string;
  quests: Array<{ id: string; name: string; path: string }>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [field: string]: any;
};

/** The whole errands section: the errands, the people, the venue grouping, and
 * the tuning that is true of every one of them rather than of any single one. */
type LibraryQuests = {
  quests: LibraryQuest[];
  givers: LibraryGiver[];
  groups: Array<{
    venue: { id: string; name: string; path: string } | null;
    givers: LibraryGiver[];
    quests: LibraryQuest[];
  }>;
  tuning: Record<string, number>;
};

/** One badge, as a category page draws it. Loose past the fields the test
 * actually asserts on, for the same reason every other model here is. */
type LibraryBadge = {
  id: string;
  slug: string;
  category: string;
  name: string;
  ask: string;
  icon: string;
  tier: string;
  points: number;
  goal: number | null;
  platform: boolean;
  platformPoints: number | null;
  subject: {
    kind: string;
    id: string;
    name: string;
    path: string | null;
  } | null;
};

/** One category of the shelf — a page, and the blocks it lays its badges out
 * in (a list of rows, or a rack of one repeated condition's subjects). */
type LibraryBadgeCategory = {
  id: string;
  slug: string;
  label: string;
  path: string;
  badges: LibraryBadge[];
  blocks: Array<{
    kind: "rows" | "rack";
    badges: LibraryBadge[];
    ask?: string;
    subjectKind?: string;
    tier?: string | null;
  }>;
  count: number;
  points: number;
  platformCount: number;
  sourceFiles: string[];
};

/** The whole achievements section: every badge, the categories they are filed
 * under, and the two economies that decide what one is worth. */
type LibraryAchievements = {
  badges: LibraryBadge[];
  categories: LibraryBadgeCategory[];
  total: number;
  points: number;
  tiers: Array<{ id: string; points: number; count: number }>;
  platform: {
    count: number;
    limit: number;
    budget: number;
    local: LibraryBadge[];
    steam: { count: number; whole: boolean };
  };
  sourceFiles: string[];
};

type LibraryModel = {
  enemies: LibraryEnemy[];
  venues: Array<{ id: string; slug: string; name: string }>;
  groups: Array<{ venue: { id: string } | null; entries: LibraryEnemy[] }>;
  items: LibraryItem[];
  bases: LibraryItem[];
  named: LibraryItem[];
  missions: LibraryMission[];
  powers: LibraryPowers;
  talents: LibraryTalents;
  quests: LibraryQuests;
  achievements: LibraryAchievements;
  story: {
    premise: string;
    chapters: LibraryChapter[];
    refrain: Array<{ id: string; pages: string[][] }>;
  };
};

/** What a page renderer needs to resolve slot-relative URLs, backgrounds and
 * the mission maps. */
type LibraryContext = {
  base: string;
  groundFor: (venueId: string | null) => string | null;
  mapFor?: (
    levelId: string,
  ) => { src: string; width: number; height: number } | null;
  venueOf?: (item: LibraryItem) => string;
  /** What a name in the story's prose may link to, in priority order. */
  linkGroups?: Array<Array<{ name: string; path: string }>>;
};

declare module "*/library/escape.mjs" {
  export function escapeHtml(s: string): string;
}

declare module "*/library/model.mjs" {
  export const ENEMY_FIELDS: Record<string, string>;
  export function libraryModel(): LibraryModel;
  export function libraryRoutes(): Array<{ path: string; sources: string[] }>;
  export function slugFor(id: string): string;
  export function enemyPath(id: string): string;
}

declare module "*/library/model-arsenal.mjs" {
  export const WEAPON_FIELDS: Record<string, string>;
  export const GEAR_FIELDS: Record<string, string>;
  export const UNIQUE_FIELDS: Record<string, string>;
  export function itemPath(id: string): string;
}

declare module "*/library/model-missions.mjs" {
  export const LEVEL_FIELDS: Record<string, string>;
  export function missionPath(id: string): string;
}

declare module "*/library/model-powers.mjs" {
  export const POWER_FIELDS: Record<string, string>;
  export function powersModel(): LibraryPowers;
  export function powerPath(id: string): string;
}

declare module "*/library/render-powers.mjs" {
  export function powerPage(
    power: LibraryPower,
    model: LibraryPowers,
    context: LibraryContext,
  ): string;
  export function powersIndex(
    model: LibraryPowers,
    context: LibraryContext,
  ): string;
}

declare module "*/library/model-talents.mjs" {
  export const TALENT_FIELDS: Record<string, string>;
  export function talentsModel(): LibraryTalents;
  export function talentPath(id: string): string;
}

declare module "*/library/prose-talents.mjs" {
  export const SLOPE_NOUN: Record<string, string>;
  export const PROC_NOUN: Record<string, string>;
  export const CONJURE_NOUN: Record<string, string>;
}

declare module "*/library/render-talents.mjs" {
  export function talentPage(
    talent: LibraryTalent,
    model: LibraryTalents,
    context: LibraryContext,
  ): string;
  export function talentsIndex(
    model: LibraryTalents,
    context: LibraryContext,
  ): string;
}

declare module "*/library/render-arsenal.mjs" {
  export function itemPage(item: LibraryItem, context: LibraryContext): string;
  export function arsenalIndex(
    model: LibraryModel,
    context: LibraryContext,
  ): string;
}

declare module "*/library/render-missions.mjs" {
  export function missionPage(
    mission: LibraryMission,
    context: LibraryContext,
    sprites: string,
  ): string;
  export function missionsIndex(
    model: LibraryModel,
    context: LibraryContext,
  ): string;
}

declare module "*/library/model-quests.mjs" {
  export const QUEST_FIELDS: Record<string, string>;
  export const QUEST_GIVER_FIELDS: Record<string, string>;
  export function questsModel(): LibraryQuests;
  export function questPath(id: string): string;
  export function giverPath(id: string): string;
}

declare module "*/library/render-quests.mjs" {
  export function questPage(
    quest: LibraryQuest,
    model: LibraryQuests,
    context: LibraryContext,
  ): string;
  export function giverPage(
    giver: LibraryGiver,
    model: LibraryQuests,
    context: LibraryContext,
  ): string;
  export function questsIndex(
    model: LibraryQuests,
    context: LibraryContext,
  ): string;
}

declare module "*/library/model-achievements.mjs" {
  export const ACHIEVEMENT_FIELDS: Record<string, string>;
  export function achievementsModel(): LibraryAchievements;
  export function achievementCategoryPath(category: string): string;
}

declare module "*/library/prose-achievements.mjs" {
  export const CATEGORY_BLURB: Record<string, string>;
}

declare module "*/library/render-achievements.mjs" {
  export function categoryPage(
    category: LibraryBadgeCategory,
    model: LibraryAchievements,
    context: LibraryContext,
  ): string;
  export function achievementsIndex(
    model: LibraryAchievements,
    context: LibraryContext,
  ): string;
}

declare module "*/library/model-story.mjs" {
  export const STORY_ITEM_FIELDS: Record<string, string>;
  export const THOUGHT_FIELDS: Record<string, string>;
  export const CUTSCENE_BEAT_KINDS: Record<string, string>;
  export function chapterPath(id: string): string;
}

declare module "*/library/render-story.mjs" {
  export function chapterPage(
    chapter: LibraryChapter,
    context: LibraryContext,
    position: number,
    total: number,
  ): string;
  export function storyIndex(
    model: LibraryModel,
    context: LibraryContext,
  ): string;
  export function storyLinks(
    model: LibraryModel,
  ): Array<Array<{ name: string; path: string }>>;
}

declare module "*/library/render-bestiary.mjs" {
  export function enemyPage(
    enemy: LibraryEnemy,
    context: LibraryContext,
  ): string;
  export function bestiaryIndex(
    model: LibraryModel,
    context: LibraryContext,
  ): string;
  export function landing(model: LibraryModel, context: LibraryContext): string;
}
