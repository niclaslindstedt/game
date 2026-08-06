// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE ACHIEVEMENTS' sentences. The badge list is the easy half; what makes the
// section worth generating is the paragraph around it — what a category is
// actually asking of a player, what a tier is worth, and why the store lists
// carry a third of the shelf and no more.
//
// Every clause is assembled out of facts the model read from the catalogs
// (./model-achievements.mjs); none of it invents a number.

import { TITLE } from "./html.mjs";
import { list } from "./prose.mjs";

const n = (value) => value.toLocaleString("en-US");

/**
 * WHAT EACH SECTION OF THE SHELF IS ACTUALLY ASKING FOR, in one line.
 *
 * The catalog gives a category a LABEL and nothing else — `CATEGORY_LABELS` is
 * eight words — so the sentence that says what filing something under COMBAT
 * rather than MASTERY means is written here, once. A category with no clause
 * fails the build (the library test walks this map against the shipped
 * catalog), because the alternative is a page that heads itself WARDROBE and
 * then explains nothing.
 *
 * Kept SHORT on purpose: it is also the middle of the page's meta description,
 * which Google cuts at about 160 characters.
 */
export const CATEGORY_BLURB = {
  story: "getting through the campaign, and getting through it the hard ways",
  combat: "the body count, and how hard the blows that made it landed",
  loot: "what the floor gave up, and the collection at the top of it",
  gear: "dressing the hero — every slot filled once, then filled well",
  arsenal: "the trophy wall, one badge for every named relic in the game",
  party: "the legends you chose not to finish, and who they became",
  hero: "the climb to the level cap, marked at five points on the way",
  mastery: "showing up — the runs, and the maps you keep going back to",
};

/** What one row of a rack IS, singular and plural — the noun the sentence over
 * a rack reaches for. `ally`/`allies` is the reason this is a table rather than
 * a name with an `s` stuck on it. */
const SUBJECT_NOUN = {
  level: ["mission", "missions"],
  unique: ["relic", "relics"],
  companion: ["ally", "allies"],
  difficulty: ["difficulty", "difficulties"],
};

const noun = (kind, count) =>
  (SUBJECT_NOUN[kind] ?? ["entry", "entries"])[count === 1 ? 0 : 1];

// ---- the index ----------------------------------------------------------------

/** The badge shelf, in a sentence: how much there is and how it is filed. */
export function achievementsLede(model) {
  return (
    `All ${n(model.total)} badges ${TITLE} can award, filed the way the shelf ` +
    `files them: what each one asks for, what it is worth, and — across the ` +
    `${model.categories.length} sections below — what each section is really ` +
    `measuring.`
  );
}

/** The achievements index's `<meta name="description">`. Held under Google's
 * 160-character cut, which is where the tail of a description stops existing. */
export function achievementsDescription(model) {
  return (
    `All ${n(model.total)} achievements in ${TITLE}: what each badge asks for, ` +
    `what tier it pays, and which of them reach a Game Center or Steam profile.`
  );
}

/**
 * THE POINT LADDER: the effort tiers, their weights, and what the whole shelf
 * is worth. Counted off the model rather than stated here — the ladder grew a
 * rung once already (LEGEND, for the handful of feats that stop the screen),
 * and a number typed into this sentence would have gone stale that day.
 *
 * The weights come from the game's achievement catalog, and the
 * spread across them is the one fact about the catalog nobody can see from
 * inside the game — the shelf shows a running total, never the shape of what
 * makes it up.
 */
export function economyProse(model) {
  const rungs = model.tiers
    .filter((tier) => tier.count > 0)
    .map((tier) => `${n(tier.count)} of them at ${tier.points}`);
  return [
    `Every badge sits on one of ${model.tiers.length} effort tiers, and the tier ` +
      `is what it is worth: ${list(
        model.tiers.map(
          (tier) => `${tier.id.toUpperCase()} pays ${tier.points}`,
        ),
      )}. Across the whole shelf that comes to ${n(model.points)} points — ` +
      `${list(rungs)}.`,
    `Nothing here is hidden and nothing is missable. Every condition is on show ` +
      `from the first run, a counter badge keeps its tally across every hero on ` +
      `the roster, and the ledger belongs to the account rather than to a ` +
      `character — so a hardcore hero who dies for good takes none of it away ` +
      `with them.`,
  ];
}

/**
 * THE PLATFORM HALF — the part of the feature that is genuinely invisible from
 * inside the game.
 *
 * Game Center allows a game 100 achievements and 1,000 points in total, and
 * Steam caps a new app at the same hundred; this shelf is more than twice that.
 * So a store list has to be curated, and which badges did NOT make it — and what
 * carries them instead — is exactly the sort of thing a reference page is for.
 */
export function platformProse(model) {
  const { platform } = model;
  const held = platform.local.length;
  // Named off the model rather than typed out: the families that stay home are
  // whichever categories the curation actually leaves behind, and the day a
  // third joins them this sentence follows it.
  const byCategory = new Map();
  for (const badge of platform.local) {
    byCategory.set(badge.category, (byCategory.get(badge.category) ?? 0) + 1);
  }
  const homebound = model.categories
    .filter((category) => byCategory.has(category.id))
    .map(
      (category) => `${n(byCategory.get(category.id))} from ${category.label}`,
    );

  return [
    `${n(platform.count)} of them travel. Game Center allows a game ` +
      `${platform.limit} achievements and ${n(platform.budget)} points in total, ` +
      `and Steam caps a new app at the same ${platform.limit} until it clears ` +
      `Valve's own threshold — so a store list is a curated slice of this one. ` +
      `The ${n(held)} left off it (${list(homebound)}) are the families that ` +
      `read as a collection rather than as a brag.`,
    `Nothing is lost by staying behind: each of them is already rolled up by a ` +
      `ladder that does travel, so a player filling the relic wall still watches ` +
      `the count climb on their profile. The points on a store list are not this ` +
      `page's points either — the ${n(platform.budget)} are apportioned across ` +
      `the ${n(platform.count)} listed badges from these same tiers, so every ` +
      `badge added re-slices the same pie.`,
    platform.steam.whole
      ? `Steam carries the whole shelf — all ${n(platform.steam.count)} of them.`
      : `Steam carries the same ${n(platform.steam.count)} for now. Its cap lifts ` +
        `once the game clears Valve's Profile Features threshold, and the whole ` +
        `shelf goes up then.`,
  ];
}

// ---- a category ---------------------------------------------------------------

/** A category's own opening lines: what it measures, how it is shaped, and what
 * it is worth. */
export function categoryLead(category, model) {
  const climbs = category.badges.filter((badge) => badge.goal !== null).length;
  const rest = category.count - climbs;
  const shape =
    climbs === 0
      ? `Every one is a one-shot: you have done it or you have not.`
      : climbs === category.count
        ? `Every one is a climb, metered on the shelf the whole way up.`
        : `${climbs === 1 ? "One of them is a climb" : `${n(climbs)} of them are climbs`}` +
          `, metered on the shelf as you go; the other ` +
          `${rest === 1 ? "is a one-shot" : `${n(rest)} are one-shots`}.`;
  const travel =
    category.platformCount === category.count
      ? `and every one of them shows up on a Game Center or Steam profile too`
      : category.platformCount === 0
        ? `and none of them travels to a store profile — this family is browsed ` +
          `here rather than bragged about`
        : `and ${n(category.platformCount)} of them travel to a Game Center or ` +
          `Steam profile`;
  return [
    `${
      category.count === 1 ? "The one badge" : `The ${n(category.count)} badges`
    } filed under ${category.label}: ${CATEGORY_BLURB[category.id]}. ${shape}`,
    `Together they are worth ${n(category.points)} of the shelf's ` +
      `${n(model.points)} points, ${travel}.`,
  ];
}

/**
 * The sentence over a rack: one condition, filled a different way per row — and
 * the tier, when every row shares one.
 *
 * The condition takes a full stop only when it does not already end in the
 * ellipsis standing in for the subject's name — that ellipsis is terminal
 * punctuation, and a period after it reads as a fourth dot.
 */
export function rackLead(block) {
  const count = block.badges.length;
  const ask = block.ask.trim().replace(/\s+/g, " ");
  const worth =
    block.tier === null
      ? ""
      : ` Each is ${
          /^[aeiou]/i.test(block.tier) ? "an" : "a"
        } ${block.tier.toUpperCase()} badge.`;
  return (
    `One badge per ${noun(block.subjectKind, 1)}, ${n(count)} in all, each ` +
    `asking the same thing: ${ask}${ask.endsWith("…") ? "" : "."}${worth}`
  );
}

/** A rack's heading — what it is a rack of. */
export const rackTitle = (block) =>
  `${n(block.badges.length)} ${noun(block.subjectKind, block.badges.length)}`;

/**
 * The meta line under a badge: its tier, what it pays, and — only where they
 * say something the row does not already say — how far it runs and whether it
 * stays in the game.
 *
 * Both of those are conditional on purpose. A condition ALREADY states its own
 * goal nearly every time ("KILL 1,000 MOBS"), so a GOAL 1,000 beside it is the
 * same figure printed twice; it earns its place only where the condition is
 * worded as a completion ("FIND EVERY UNIQUE ITEM") and the number is the thing
 * the reader came for. And the category's own opening lines already say how many
 * of its badges reach a store profile, so the rows mark the EXCEPTIONS rather
 * than stamping ON YOUR PROFILE down a column of thirty-five.
 */
export function badgeMeta(badge) {
  const parts = [badge.tier.toUpperCase(), `${badge.points} PTS`];
  // …and a goal of ONE is never worth a column either: a ladder's first rung is
  // a one-shot in everything but bookkeeping, and GOAL 1 beside "COLLECT A
  // STORY ITEM" is a figure that adds nothing to the sentence above it.
  if (badge.goal !== null && badge.goal > 1 && !statesGoal(badge)) {
    parts.push(`GOAL ${n(badge.goal)}`);
  }
  if (!badge.platform) parts.push("IN-GAME ONLY");
  return parts;
}

/** Whether the condition already spells the goal out, in either the plain or
 * the grouped form the catalog writes counts in. */
const statesGoal = (badge) =>
  badge.ask.includes(n(badge.goal)) || badge.ask.includes(`${badge.goal}`);

/**
 * A category's figures, as chips: what it is worth and how much of it travels.
 *
 * The INDEX uses these where the page uses `categoryLead`'s second paragraph.
 * Eight panels each closing with the same "together they are worth N of the
 * shelf's 17,865 points, and every one of them shows up on a Game Center or
 * Steam profile too" is one sentence printed eight times, which is both the
 * dullest way to say it and a page of near-duplicate prose sitting one click
 * above the pages it duplicates.
 */
export function categoryChips(category) {
  return [
    `${n(category.points)} PTS`,
    category.platformCount === 0
      ? "NONE ON A PROFILE"
      : category.platformCount === category.count
        ? "ALL ON YOUR PROFILE"
        : `${n(category.platformCount)} OF ${n(category.count)} ON YOUR PROFILE`,
  ];
}

/** A category page's `<meta name="description">`, under the 160-character cut. */
export function categoryDescription(category) {
  return (
    `The ${n(category.count)} ${category.label} achievements in ${TITLE}: ` +
    `${CATEGORY_BLURB[category.id]}. What each badge asks for and what it pays.`
  );
}
