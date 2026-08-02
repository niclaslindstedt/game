// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE ACHIEVEMENTS' page model: every badge the game can award, folded into the
// shape a page wants to be rendered from — what each one asks for, what it is
// worth, what named thing it is about, and whether it travels to the platforms'
// own lists.
//
// Facts only, the same rule the bestiary, arsenal, powers and talents models
// follow. The sentences are ./prose-achievements.mjs; the markup is
// ./render-achievements.mjs.
//
// WHY IT IS ITS OWN SECTION. Every other section describes something the game
// puts in front of the player — a monster, a piece, a power, a place. A badge is
// the one thing here that describes the PLAYER: it is the game's record of what
// they have done, and the only part of the product that is a list of things to
// go and do. The shelf shows all of it already, but it shows it to somebody who
// has the game open, and half of what is worth knowing about a badge is not on
// the shelf at all — what a tier is worth, which badges Game Center and Steam
// carry, and why the two biggest families deliberately stay behind.
//
// WHY THERE IS NO PAGE PER BADGE. A badge is four facts and a sprite, and 244
// pages of four facts is the thin-content failure the library exists to avoid —
// `unique_excalibur` would be a page saying "find EXCALIBUR" next to the arsenal
// page that already describes EXCALIBUR. So a CATEGORY is the unit, exactly as a
// CHAPTER is the unit of the story section, and every badge is on precisely one
// of them (which the coverage test pins).

import {
  ACHIEVEMENTS,
  ACHIEVEMENT_CATEGORIES,
  CATEGORY_LABELS,
  COMPANION_DEFS,
  DIFFICULTY_DEFS,
  LEVELS,
  PLATFORM_ACHIEVEMENT_LIMIT,
  PLATFORM_POINT_BUDGET,
  STEAM_ACHIEVEMENTS,
  STEAM_FULL_CATALOG,
  ACHIEVEMENT_POINTS,
  UNIQUE_DEFS,
  emptyLifetimeTotals,
  isPlatformAchievement,
  platformPoints,
} from "./catalogs.mjs";
import { allyPath } from "./model-allies.mjs";

/**
 * EVERY AUTHORED FIELD REACHES A PAGE — or the build stops. Same contract as the
 * bestiary's `ENEMY_FIELDS` (see ./model.mjs for why it exists). The catalog it
 * guards is TypeScript rather than YAML, which makes the failure quieter rather
 * than rarer: a field added to `AchievementDef` compiles, ships, and is silently
 * absent from the one page in the product that describes badges.
 */
export const ACHIEVEMENT_FIELDS = {
  id: "the badge's own anchor on its category page",
  category: "which page it is on",
  name: "the badge's name",
  desc: "the condition, printed as the shelf prints it",
  icon: "the badge sprite",
  tier: "the effort chip, and the point value derived from it",
  subject: "the link out — to the mission, relic or ally the badge is about",
  progress: "whether it is a climb, and the goal it climbs to",
  done: "not reader-facing: the condition is published as `desc`, in words",
};

/** The effort classes in ascending point order. */
const TIER_ORDER = Object.keys(ACHIEVEMENT_POINTS).sort(
  (a, b) => ACHIEVEMENT_POINTS[a] - ACHIEVEMENT_POINTS[b],
);

/** Fail the build when a badge carries something no page would show. */
function assertAchievementFieldsCovered(def) {
  const unknown = Object.keys(def).filter(
    (key) => !(key in ACHIEVEMENT_FIELDS),
  );
  if (unknown.length > 0) {
    throw new Error(
      `library: achievement "${def.id}" carries ${unknown.join(", ")}, which no ` +
        `library page renders. Add it to the generator ` +
        `(pwa/scripts/library/model-achievements.mjs) and declare it in ` +
        `ACHIEVEMENT_FIELDS — the pages are never edited by hand, so an ` +
        `unrendered field would silently vanish.`,
    );
  }
}

/** URL slug for a catalog id — hyphens read better in a URL than underscores. */
const slugFor = (id) => id.replace(/_/g, "-");

/** The route a category's page lives at, relative to `/library/`. */
export const achievementCategoryPath = (category) =>
  `achievements/${slugFor(category)}`;

/**
 * WHERE A BADGE'S SUBJECT LIVES IN THE LIBRARY.
 *
 * The four generated families are minted off four catalogs, and every one of
 * those catalogs has pages — so a badge about them is a link rather than a
 * name, which is the whole reason the section is worth generating instead of
 * printing the shelf into HTML.
 *
 * A DIFFICULTY has no page anywhere, and gets a name and no link rather than a
 * link to something adjacent.
 */
function resolveSubject(subject) {
  if (!subject) return null;
  const { kind, id } = subject;
  if (kind === "level") {
    const level = LEVELS[id];
    if (!level) return missing(kind, id);
    return { kind, id, name: level.name, path: `missions/${slugFor(id)}` };
  }
  if (kind === "unique") {
    const unique = UNIQUE_DEFS[id];
    if (!unique) return missing(kind, id);
    return { kind, id, name: unique.name, path: `arsenal/${slugFor(id)}` };
  }
  if (kind === "companion") {
    const companion = COMPANION_DEFS[id];
    if (!companion) return missing(kind, id);
    // The ALLY's own page, not the elite's. It used to be the elite's, because
    // an ally had nowhere else to be — which pointed a badge for recruiting
    // somebody at the page about killing them, and left the reader to work out
    // that the two were the same figure.
    return { kind, id, name: companion.name, path: allyPath(id) };
  }
  if (kind === "difficulty") {
    const difficulty = DIFFICULTY_DEFS[id];
    if (!difficulty) return missing(kind, id);
    return { kind, id, name: difficulty.name, path: null };
  }
  return missing(kind, id);
}

function missing(kind, id) {
  throw new Error(
    `library: an achievement names ${kind} "${id}", which is not in the ` +
      `catalogs. Either the badge's subject is stale or the entry was retired ` +
      `without its badge.`,
  );
}

// ---- one badge ------------------------------------------------------------------

function badgeModel(def, points) {
  assertAchievementFieldsCovered(def);
  // THE GOAL IS ASKED OF THE BADGE, not read off a ladder table. `progress` is
  // the only thing that knows what a rung climbs to, and it only ever reports a
  // goal alongside a live tally — so it is asked with a blank ledger, which is
  // exactly the state a player who has never played is in.
  const progress = def.progress?.(emptyLifetimeTotals()) ?? null;
  return {
    id: def.id,
    slug: slugFor(def.id),
    /** Which section of the shelf files it — the page it is on, and the way the
     * index names the families the store lists leave behind. */
    category: def.category,
    name: def.name,
    // The condition, in the game's own words. The shelf, the unlock toast and
    // both store portals all print this string; a page rewording it would be
    // the one copy of it that could be wrong.
    ask: def.desc,
    icon: def.icon,
    tier: def.tier,
    /** What the badge is worth in the game's own points (framework weights). */
    points: ACHIEVEMENT_POINTS[def.tier],
    /** A climb (a counter ladder) rather than a one-shot, and what it climbs to. */
    goal: progress ? progress.goal : null,
    subject: resolveSubject(def.subject),
    /** Whether the platform lists carry it — see `platformCurationProse`. */
    platform: isPlatformAchievement(def.id),
    /** Its apportioned Game Center value, for the badges that travel. */
    platformPoints: points[def.id] ?? null,
  };
}

// ---- how a category lays itself out ---------------------------------------------

/**
 * A rack needs this many badges before it beats a list of rows. Below it the
 * repetition is not yet a wall, and a four-item grid of links reads as a
 * fragment of the table it was cut out of.
 */
const RACK_MIN = 4;

/**
 * A CONDITION REPEATED IS A LIST, NOT A TABLE.
 *
 * Most of a category is a handful of distinct things to go and do, and those are
 * rows: the condition is the content. Two of the families are not — the 131
 * relics and the companion roster are ONE condition with a different subject
 * each time, and printing "FIND <NAME>" 131 times down a column is a page that
 * says one thing at enormous length. Those become a RACK of the subjects: the
 * icons and the names, each a link into the arsenal or the bestiary, with the
 * shared condition stated once above them.
 *
 * The split is DERIVED rather than declared, because declaring it would be a
 * third place that has to know which families are generated. A run qualifies
 * when it is long enough, every member is a one-shot carrying a subject that
 * resolves to a page, and every member's condition is the same sentence once its
 * own subject's name is taken out of it — which is precisely what "one condition
 * with a different subject each time" means.
 */
function template(badge) {
  if (!badge.subject) return null;
  return badge.ask.split(badge.subject.name).join(" ");
}

function blocksFor(badges) {
  const blocks = [];
  let run = [];
  const flushRun = () => {
    if (run.length === 0) return;
    if (run.length >= RACK_MIN) {
      // A VALUE IDENTICAL DOWN EVERY ROW BELONGS IN THE SENTENCE, NOT IN EVERY
      // ROW — the same rule that turned the run into a rack in the first place.
      // The relic wall really does climb three tiers and says so per row; the
      // companion roster is four PRO badges, and stamping PRO on each of them
      // four times over is a column that carries no information at all.
      const tiers = new Set(run.map((badge) => badge.tier));
      blocks.push({
        kind: "rack",
        // Stated once, with each subject's own name lifted out of it — every row
        // under it fills the gap in with its own.
        ask: run[0].ask.split(run[0].subject.name).join("…"),
        subjectKind: run[0].subject.kind,
        tier: tiers.size === 1 ? run[0].tier : null,
        badges: run,
      });
    } else {
      appendRows(blocks, run);
    }
    run = [];
  };

  for (const badge of badges) {
    const key = template(badge);
    const rackable =
      key !== null && badge.goal === null && badge.subject.path !== null;
    if (rackable && (run.length === 0 || template(run[0]) === key)) {
      run.push(badge);
      continue;
    }
    flushRun();
    if (rackable) run.push(badge);
    else appendRows(blocks, [badge]);
  }
  flushRun();
  return blocks;
}

/** Add rows to the trailing table block, opening one if the last block isn't. */
function appendRows(blocks, badges) {
  const last = blocks[blocks.length - 1];
  if (last?.kind === "rows") last.badges.push(...badges);
  else blocks.push({ kind: "rows", badges: [...badges] });
}

// ---- the catalog ----------------------------------------------------------------

/**
 * Every badge, filed under the category the shelf files it under, plus the two
 * economies that decide what one is worth: the game's own point ladder, and the
 * platforms' capped lists.
 */
export function achievementsModel() {
  const points = platformPoints();
  const badges = ACHIEVEMENTS.map((def) => badgeModel(def, points));
  const byId = new Map(badges.map((badge) => [badge.id, badge]));

  const categories = ACHIEVEMENT_CATEGORIES.map((category) => {
    // CATALOG order, which is shelf order — a ladder's rungs are adjacent in it
    // and climb, so the list reads as the climb it is. Sorting by name would
    // scatter DEATH INCARNATE five rows from FIRST BLOOD for nothing.
    const entries = ACHIEVEMENTS.filter((def) => def.category === category).map(
      (def) => byId.get(def.id),
    );
    return {
      id: category,
      slug: slugFor(category),
      label: CATEGORY_LABELS[category],
      path: achievementCategoryPath(category),
      badges: entries,
      blocks: blocksFor(entries),
      count: entries.length,
      points: entries.reduce((sum, badge) => sum + badge.points, 0),
      platformCount: entries.filter((badge) => badge.platform).length,
      sourceFiles: ["pwa/src/game/achievement-defs.ts"],
    };
  }).filter((category) => category.count > 0);

  const carried = badges.filter((badge) => badge.platform);

  return {
    badges,
    categories,
    total: badges.length,
    /** The game's own point pool: every badge's tier weight, summed. */
    points: badges.reduce((sum, badge) => sum + badge.points, 0),
    /** How many badges sit on each rung of the effort ladder, and its weight. */
    tiers: TIER_ORDER.map((tier) => ({
      id: tier,
      points: ACHIEVEMENT_POINTS[tier],
      count: badges.filter((badge) => badge.tier === tier).length,
    })),
    /** The platform half: what travels, what the caps are, and what stays home. */
    platform: {
      count: carried.length,
      limit: PLATFORM_ACHIEVEMENT_LIMIT,
      budget: PLATFORM_POINT_BUDGET,
      /** Every badge the lists do NOT carry, filed under its category — the
       * shape of the curation, rather than a restatement of its reasons. */
      local: badges.filter((badge) => !badge.platform),
      steam: {
        count: STEAM_ACHIEVEMENTS.length,
        /** False while Steam still caps a new app at the same hundred. */
        whole: STEAM_FULL_CATALOG,
      },
    },
    sourceFiles: [
      "pwa/src/game/achievement-defs.ts",
      "pwa/src/game/platform-achievements.ts",
    ],
  };
}
