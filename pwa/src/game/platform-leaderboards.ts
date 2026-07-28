// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// WHICH public rankings the platform (Game Center today, Play Games later)
// carries, and how each one's number must be formatted. The peer of
// platform-achievements.ts, and curation in the same sense: the game's own HIGH
// SCORES board ranks a player against THEMSELVES, and this list is what is
// worth ranking them against everyone else.
//
// THE RULE: a board must be UNCAPPED. A ranking of something with a ceiling —
// highest hero level (98), relics recovered (131), trophy points (a fixed
// budget) — fills up with players tied at the top and stops being a ranking at
// all; the first hundred to finish share first place and nobody after them can
// ever move. So every board here measures something no amount of play converges
// on: a bigger blow, more dead, a faster rate held for longer, a deeper run at
// the hardest difficulty.
//
// Nothing is tracked FOR these: each value is a record the game already keeps
// for itself (achievement-totals.ts, highscores.ts), read by leaderboards.ts.
// A leaderboard is a second READER of the player's own records, never a second
// bookkeeper.
//
// This module is deliberately DATA ONLY — no ledger, no engine, no `window` —
// because two things that are not the running game import it: the portal
// manifest generator (scripts/game-center-leaderboards.mjs) and the test that
// guards it.
//
// Adding a board to a shipped catalog means creating its entry in App Store
// Connect: regenerate the manifest (`node scripts/game-center-leaderboards.mjs`)
// and the diff is the work list. The suite fails if the manifest drifts.

import type { LeaderboardKey } from "../app/scores-bridge.ts";

/** Game Center's ceiling on leaderboards per game. Play Games' is far higher,
 * so the tighter platform sets the shape of the list for both. */
export const PLATFORM_LEADERBOARD_LIMIT = 100;

/**
 * How a board's number is written. A platform board stores one INT64, so a
 * value that isn't a whole count has to be scaled on the way out and formatted
 * back by the portal — and the two must agree, or every score on that board is
 * silently wrong by a factor of a hundred. That is why the format is the ONE
 * knob: the scale is derived from it below rather than authored beside it.
 *
 *   integer  a plain count, submitted as-is
 *   fixed2   two decimals (App Store Connect: "Fixed Point, 2 decimals")
 *   elapsed  a duration in whole SECONDS (App Store Connect: "Elapsed Time")
 */
export type LeaderboardFormat = "integer" | "fixed2" | "elapsed";

/** The multiplier a value takes on its way to the platform, per format. The
 * source units are the game's own: a count, a rate per minute, or MILLIseconds
 * (every duration in the engine is ms). */
export const FORMAT_SCALE: Record<LeaderboardFormat, number> = {
  integer: 1,
  fixed2: 100,
  elapsed: 1 / 1000,
};

/** What App Store Connect calls each format, for the manifest a human reads. */
const FORMAT_LABEL: Record<LeaderboardFormat, string> = {
  integer: "Integer",
  fixed2: "Fixed Point (2 decimals)",
  elapsed: "Elapsed Time (to seconds)",
};

/** One published board, as the portal needs it described. */
export type PlatformLeaderboard = {
  /** The board key — and, on Game Center, the leaderboard ID itself: App Store
   * Connect lets us choose the identifier, so a board has ONE name in the
   * catalog, in the manifest, and in a crash log. Play Games generates its own
   * ids, which is why that mapping lives on the native provider. */
  key: LeaderboardKey;
  /** The board's public name, shown by the platform. */
  name: string;
  /** What the number means — the portal's description, and the sentence a
   * player reads if the game ever lists the boards itself. */
  blurb: string;
  format: LeaderboardFormat;
  /** The unit written after the score, singular / plural. Omitted for a
   * duration, which the platform writes as a clock. */
  suffix?: { one: string; many: string };
};

/**
 * The published boards, in display order. Five, deliberately: a page of
 * rankings nobody is near the top of is a page nobody opens twice.
 */
export const PLATFORM_LEADERBOARDS: readonly PlatformLeaderboard[] = [
  {
    key: "hardest_blow",
    name: "Hardest Blow",
    // The board a decked-out, damage-geared hero wins: it ranks the PEAK a
    // build can hit, not how long it was played. A single tick's summed damage,
    // so a nuke's screen wipe, an AoE sweep and a pierce volley all land as one
    // blow — which is exactly how it reads on screen.
    blurb: "The biggest damage ever landed in one strike.",
    format: "integer",
    suffix: { one: "damage", many: "damage" },
  },
  {
    key: "foes_felled",
    name: "Foes Felled",
    blurb: "Every mob killed, across every hero and every run.",
    format: "integer",
    suffix: { one: "kill", many: "kills" },
  },
  {
    key: "kill_rate",
    name: "Kill Rate",
    blurb:
      "The fastest killing held for ten straight minutes of combat — a rate, not a moment.",
    format: "fixed2",
    suffix: { one: "per min", many: "per min" },
  },
  {
    key: "jesus_survival",
    name: "Jesus Survival",
    blurb: "The longest a hardcore hero has lived through a campaign on JESUS.",
    format: "elapsed",
  },
  {
    key: "jesus_kills",
    name: "Jesus Slaughter",
    blurb: "The most foes a hardcore hero has felled in a campaign on JESUS.",
    format: "integer",
    suffix: { one: "kill", many: "kills" },
  },
];

/** One row of the portal manifest — what a human types into App Store Connect
 * (Game Center → Leaderboards) for this board. */
export type LeaderboardManifestRow = {
  id: string;
  name: string;
  description: string;
  format: string;
  /** What the game multiplies its own value by before submitting — the number
   * that has to agree with the format above. Written into the manifest so a
   * reviewer can check the pair at a glance. */
  scale: number;
  /** Every board here ranks a bigger number higher. */
  sort: "High to Low";
  /** A player's best stands; a worse later run never displaces it. */
  submission: "Best Score";
  suffixSingular?: string;
  suffixPlural?: string;
};

/**
 * The portal manifest, in catalog order — so a regenerated file diffs cleanly
 * and the diff IS the work list of entries to create or retitle.
 */
export function leaderboardManifest(): LeaderboardManifestRow[] {
  return PLATFORM_LEADERBOARDS.map((board) => ({
    id: board.key,
    name: board.name,
    description: board.blurb,
    format: FORMAT_LABEL[board.format],
    scale: FORMAT_SCALE[board.format],
    sort: "High to Low" as const,
    submission: "Best Score" as const,
    ...(board.suffix
      ? { suffixSingular: board.suffix.one, suffixPlural: board.suffix.many }
      : {}),
  }));
}
