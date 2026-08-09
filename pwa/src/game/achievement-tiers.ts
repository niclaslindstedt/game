// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE EFFORT LADDER — what an achievement's tier IS, what it is worth, and how
// loud it is allowed to be. The catalog (achievement-defs.ts) picks a rung per
// badge; this file is the rung itself.
//
// IT IMPORTS NOTHING, AND THAT IS LOAD-BEARING. The catalog reaches
// `@game/core` for the registries its generated badge groups are minted from,
// which puts the whole simulation one import away — and the two surfaces that
// have to know a badge's tier, the HAPTICS vocabulary and the JINGLE
// vocabulary, are both on the app's STARTUP path (a title-menu row press
// buzzes). A type-only import would have been erased at build time and still
// have failed `tests/content/net_reachability_test.ts`, which walks the import
// graph rather than the bundle — correctly, because the next edit to either
// module turns the type import into a value one and nobody notices until the
// 170 KB budget guard trips. So the ladder lives in a leaf, the same shape as
// the engine's own `engine/game/flags.ts`, and `achievement-defs.ts` re-exports
// it so the catalog stays the one door for everything else about a badge.
//
// THE POINT OF THE LOOK TABLE IS THAT IT CLIMBS. A ten-point badge is a quiet
// bronze slip at the bottom of the screen; a legend takes the whole frame,
// blows the doors off and holds them open. Reading the ladder off one table
// (rather than branching on tier at five call sites) is what keeps the climb
// monotone — the day a sixth tier lands, it lands here once.
//
// The REVEAL is the top rung only. It borrows the vocabulary of the pickup
// card's legendary flourish (rays, bloom, shockwave — see the "Rarity reveal"
// block in styles.css) so the game's two biggest "you got something" moments
// speak the same language, but keeps its own classes: the two are separate
// spectacles that happen to rhyme, and coupling them would mean tuning one
// through the other.

/**
 * A badge's tier is a claim about how HARD it is, and the points follow from
 * the tier rather than the other way round.
 *
 * Five buckets, not a ranking — plenty of badges are genuinely of equal
 * weight, so two rungs of one ladder may share a tier. What may never happen
 * is a ladder walking BACKWARDS (a harder rung paying less than an easier
 * one), which `tests/achievements_test.ts` pins for every counter ladder in
 * the catalog.
 *
 * LEGEND is deliberately scarce — seven badges out of the whole shelf. It is
 * the "you would tell someone about this" bucket: the level cap, the campaign
 * on its cruelest setting, every relic, every ally, nine named pieces worn at
 * once, and the two grinds that run several times the length of the entire
 * climb to 99. An eighth entry should have to argue for itself, and the suite
 * holds the count down so one cannot drift in.
 */
export type AchievementTier =
  "beginner" | "intermediate" | "pro" | "expert" | "legend";

export const ACHIEVEMENT_POINTS: Record<AchievementTier, number> = {
  beginner: 10,
  intermediate: 25,
  pro: 50,
  expert: 100,
  legend: 250,
};

/** The tiers in ascending effort order — stated once here so nothing has to
 * re-derive the ordering by sorting the point table. */
export const ACHIEVEMENT_TIERS: readonly AchievementTier[] = [
  "beginner",
  "intermediate",
  "pro",
  "expert",
  "legend",
] as const;

/** Where a tier sits on the ladder (0 = beginner). */
export function tierRank(tier: AchievementTier): number {
  return ACHIEVEMENT_TIERS.indexOf(tier);
}

export type TierLook = {
  /** The tier's name in pixel caps — the chip on a shelf row / card. */
  label: string;
  /** Frame, name text and glow color for the badge's celebration and chip. */
  color: string;
  /** How many flecks ride the banner's frame (0 = none). */
  sparkles: number;
  /** How long the celebration holds the screen, ms. Must match the CSS
   * animation the class of the same tier drives (styles.css). */
  ttlMs: number;
  /** Take the whole screen with the card REVEAL instead of the corner banner.
   * The top rung only — see the header. */
  reveal: boolean;
};

/**
 * Bronze → steel → gold → amber → the white-hot legend. The first three are
 * the trophy-shelf metals in order, which is what a player already reads a
 * ladder of awards as; expert breaks into the loot palette's legendary orange,
 * and LEGEND is the artifact red-white the game reserves for its rarest drop
 * (tiers.ts) — so the biggest badge and the biggest find flash the same color.
 */
export const TIER_LOOK: Record<AchievementTier, TierLook> = {
  beginner: {
    label: "BEGINNER",
    color: "#c9a37a",
    sparkles: 0,
    ttlMs: 3200,
    reveal: false,
  },
  intermediate: {
    label: "INTERMEDIATE",
    color: "#d7dde5",
    sparkles: 3,
    ttlMs: 3600,
    reveal: false,
  },
  pro: {
    label: "PRO",
    color: "#ffd75e",
    sparkles: 6,
    ttlMs: 4000,
    reveal: false,
  },
  expert: {
    label: "EXPERT",
    color: "#ffa726",
    sparkles: 10,
    ttlMs: 4600,
    reveal: false,
  },
  legend: {
    label: "LEGEND",
    color: "#ff5e6c",
    sparkles: 14,
    // The card flies in, lands, holds long enough to be READ, then goes. Sized
    // against the level-up celebration it usually lands on top of, so the two
    // don't clip each other short.
    ttlMs: 6400,
    reveal: true,
  },
};

/** `"r, g, b"` for the CSS light layers (the same idiom as `TIER_RGB` in
 * tiers.ts: derived once rather than typed a second time, because two
 * hand-kept copies of a palette drift and nobody watches the copy). */
export const TIER_RGB: Record<AchievementTier, string> = Object.fromEntries(
  Object.entries(TIER_LOOK).map(([tier, look]) => [
    tier,
    `${parseInt(look.color.slice(1, 3), 16)}, ${parseInt(
      look.color.slice(3, 5),
      16,
    )}, ${parseInt(look.color.slice(5, 7), 16)}`,
  ]),
) as Record<AchievementTier, string>;

/** The CSS custom properties every achievement surface is tinted and TIMED
 * through. Handed to a style prop so one object keeps the banner, the reveal,
 * the shelf row and the detail card lit by the same values — and so the dwell
 * is stated ONCE: the celebration's own timer and the CSS animation that has
 * to end with it both read `ttlMs` from this table, rather than a number in a
 * stylesheet quietly drifting from the number in a module. */
export function tierStyle(tier: AchievementTier): Record<string, string> {
  return {
    "--badge-tier": TIER_LOOK[tier].color,
    "--badge-tier-rgb": TIER_RGB[tier],
    "--badge-ttl": `${TIER_LOOK[tier].ttlMs}ms`,
  };
}
