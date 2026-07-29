// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// WHICH badges the platform (Game Center today, Play Games later) carries, and
// how far along each one is. The game's own shelf shows all 226; a platform
// list is capped — Game Center allows a game 100 achievements and 1,000 points
// TOTAL across them — so this module curates, and the curation is content, not
// machinery.
//
// The rule: a platform entry is something a player would tell someone about.
// Two families are therefore game-only, and each is already ROLLED UP by a
// ladder that does travel:
//
//   unique_*   131 badges, one per hand-authored relic. That is a collection
//              WALL — it reads as a set, browsed in the shelf, and alone it
//              would take three quarters of the platform's entire allowance.
//              The `uniques_1/5/10/25/50/all` ladder carries the same climb in
//              six entries.
//   equip_*    nine "wear a helmet" onboarding nudges. `outfit_full` (fill
//              every slot at once) is the version worth showing.
//
// Everything else maps ONE TO ONE, and the badge id IS the platform id on Game
// Center — the same name in the ledger, on the shelf, in the manifest the
// portal was filled in from, and in a crash log. Play Games generates its own
// ids, which is why that mapping lives on the native provider rather than here.
//
// Adding a badge to a shipped catalog means creating its entry in App Store
// Connect: regenerate the manifest (`node scripts/game-center-achievements.mjs`)
// and the diff is the work list. The suite fails if the manifest drifts, if the
// list outgrows the cap, or if the points overrun the budget.

import { TIER_POINTS } from "@niclaslindstedt/oss-framework/achievements";

import { ACHIEVEMENTS, type AchievementDef } from "./achievement-defs.ts";
import type { LifetimeTotals } from "./achievement-totals.ts";

/** Game Center's ceiling on achievements per game. Play Games' is far higher,
 * so the tighter platform sets the shape of the list for both.
 *
 * STEAM lands on the same number by a different road, which is why one curated
 * list serves every platform: Valve caps a NEW app at 100 achievements "until
 * your app reaches the threshold for Profile Features", after which it rises
 * far past our whole catalog. So the cap is temporary there rather than
 * permanent — see `STEAM_FULL_CATALOG` below. */
export const PLATFORM_ACHIEVEMENT_LIMIT = 100;

/** Game Center's ceiling on the SUM of every achievement's point value. */
export const PLATFORM_POINT_BUDGET = 1_000;

/** Game Center's per-achievement point range (both ends inclusive). */
export const PLATFORM_POINT_MAX = 100;

/** Badge families the platform doesn't carry — see the header for why each one
 * is better served by the ladder that rolls it up. */
const LOCAL_ONLY = [/^unique_/, /^equip_/];

/** Does this badge get an entry in the platform's list? */
export function isPlatformAchievement(id: string): boolean {
  return !LOCAL_ONLY.some((pattern) => pattern.test(id));
}

/** The curated list, in catalog order — the manifest's own order, so a
 * regenerated manifest diffs cleanly. */
export const PLATFORM_ACHIEVEMENTS: readonly AchievementDef[] =
  ACHIEVEMENTS.filter((def) => isPlatformAchievement(def.id));

/** The slice of the achievements save this module reads. Structural, so the
 * store can pass its save without this module importing it (and the two can't
 * form an import cycle). */
export type PlatformProgressSource = {
  unlocked: Record<string, number>;
  totals: LifetimeTotals;
};

/**
 * How far along one badge is, 0…100. An entry in the unlock ledger is the
 * authority — a badge is EARNED the moment the ledger says so, whatever the
 * counters read afterwards — and a counter ladder otherwise reports its live
 * fraction so the platform draws the same progress bar the shelf does.
 */
export function platformPercent(
  def: AchievementDef,
  save: PlatformProgressSource,
): number {
  if (save.unlocked[def.id] !== undefined) return 100;
  const progress = def.progress?.(save.totals);
  if (!progress || progress.goal <= 0) {
    return def.done(save.totals) ? 100 : 0;
  }
  const percent = (100 * progress.have) / progress.goal;
  return Math.min(100, Math.max(0, percent));
}

/** Every platform badge's percentage, keyed by id. */
export function platformProgress(
  save: PlatformProgressSource,
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const def of PLATFORM_ACHIEVEMENTS) {
    out[def.id] = platformPercent(def, save);
  }
  return out;
}

/**
 * The point value to give each entry in the portal, spending the platform's
 * whole 1,000-point budget in proportion to the game's own tier weights
 * (10/25/50/100 — see the framework's `TIER_POINTS`).
 *
 * Not a hand-typed column: the budget is fixed while the catalog grows, so
 * every added badge re-slices the same pie, and typing the numbers would mean
 * re-typing all of them. Largest-remainder apportionment (the method used for
 * seats in a parliament) keeps the total EXACTLY at budget while every entry
 * stays within the platform's own 1…100 per-achievement range.
 */
export function platformPoints(): Record<string, number> {
  const totalWeight = PLATFORM_ACHIEVEMENTS.reduce(
    (sum, def) => sum + TIER_POINTS[def.tier],
    0,
  );
  if (totalWeight <= 0) return {};

  // Floor first, never below the platform's 1-point minimum, never above its
  // 100-point maximum.
  const shares = PLATFORM_ACHIEVEMENTS.map((def, index) => {
    const exact = (PLATFORM_POINT_BUDGET * TIER_POINTS[def.tier]) / totalWeight;
    return {
      id: def.id,
      index,
      fraction: exact - Math.floor(exact),
      points: Math.min(PLATFORM_POINT_MAX, Math.max(1, Math.floor(exact))),
    };
  });

  // Hand out what the flooring left over, biggest fractional part first — and
  // only to entries that still have room under the per-entry maximum.
  let remainder =
    PLATFORM_POINT_BUDGET -
    shares.reduce((sum, share) => sum + share.points, 0);
  const order = [...shares].sort(
    // Ties break on catalog order, so the allocation is deterministic.
    (a, b) => b.fraction - a.fraction || a.index - b.index,
  );
  for (const share of order) {
    if (remainder <= 0) break;
    if (share.points >= PLATFORM_POINT_MAX) continue;
    share.points += 1;
    remainder -= 1;
  }

  const out: Record<string, number> = {};
  for (const share of shares) out[share.id] = share.points;
  return out;
}

/** One row of the portal manifest (native/store/game-center-achievements.json)
 * — everything a human needs to create the entry in App Store Connect / Play
 * Console, and nothing the game reads at runtime. */
export type PlatformAchievementRow = {
  /** The platform achievement id (our badge id, on Game Center). */
  id: string;
  /** The portal's title. */
  name: string;
  /** The portal's pre-earned AND earned description — one line, as shown. */
  description: string;
  /** Our own category, for grouping the portal work. */
  category: string;
  tier: string;
  /** Point value to enter in the portal. */
  points: number;
  /** True for a badge whose progress is reported as it climbs, which Play
   * Console models as an INCREMENTAL achievement (Game Center reports a
   * percentage either way). */
  incremental: boolean;
  /** Hidden until earned? False throughout: the shelf shows every condition,
   * so hiding them in the portal would tell the player less than the game
   * already does. */
  hidden: boolean;
};

// ---------------------------------------------------------------------------
// STEAM
// ---------------------------------------------------------------------------

/**
 * Whether to publish the WHOLE badge catalog to Steam rather than the curated
 * list.
 *
 * Steam's 100-achievement cap lifts once the app clears Valve's Profile
 * Features threshold, at which point all 226 badges — the `unique_*` wall
 * included — can ship. Flip this then, regenerate the manifest, and create the
 * new rows in the partner site.
 *
 * It is safe to flip in exactly one direction. Adding rows is additive and
 * nothing a player already earned is disturbed; REMOVING them is not, because
 * a Steam achievement id is permanent once anyone has unlocked it, and a
 * catalog that stopped listing an id would leave it stranded in every owner's
 * profile with nothing in the game to explain it. So this goes false → true and
 * never back.
 */
export const STEAM_FULL_CATALOG = false;

/** The badges Steam carries. The curated list today; the whole catalog once the
 * cap lifts (see `STEAM_FULL_CATALOG`). */
export const STEAM_ACHIEVEMENTS: readonly AchievementDef[] = STEAM_FULL_CATALOG
  ? ACHIEVEMENTS
  : PLATFORM_ACHIEVEMENTS;

/**
 * One row of the Steam portal manifest (electron/store/steam-achievements.json).
 *
 * Deliberately NOT the same shape as `PlatformAchievementRow`, because the two
 * portals genuinely differ and a shared row would have to carry a field that is
 * meaningless in one of them:
 *
 *   - **No points.** Steam has no achievement point system at all — no budget,
 *     no per-achievement weight. The whole apportionment above is a Game Center
 *     concern and must not run for Steam, where it would invent a column nobody
 *     can enter.
 *   - **No incremental flag.** Steam CAN draw a progress bar, but only via an
 *     indicator stat configured per achievement, which this game does not have.
 *     The provider reports completions only (electron/src/achievements-steam.ts),
 *     so advertising progress here would describe something that never arrives.
 *
 * What Steam's portal does want is exactly this: an API name, a display name, a
 * description, and whether the row is hidden.
 */
export type SteamAchievementRow = {
  /** The "API Name" column — our badge id, which the provider uses verbatim. */
  id: string;
  /** The portal's Display Name. */
  name: string;
  /** The portal's Description. */
  description: string;
  /** Our own category and tier — not Steam columns, but they group the work of
   * creating a hundred rows by hand, and date the list against the catalog. */
  category: string;
  tier: string;
  /** Hidden until earned? False throughout, for the same reason as Game
   * Center: the game's own shelf shows every condition already. */
  hidden: boolean;
};

/** The Steam portal manifest, in catalog order. */
export function steamManifest(): SteamAchievementRow[] {
  return STEAM_ACHIEVEMENTS.map((def) => ({
    id: def.id,
    name: def.name,
    description: def.desc,
    category: def.category,
    tier: def.tier,
    hidden: false,
  }));
}

// ---------------------------------------------------------------------------
// GAME CENTER
// ---------------------------------------------------------------------------

/** The portal manifest, in catalog order. */
export function platformManifest(): PlatformAchievementRow[] {
  const points = platformPoints();
  return PLATFORM_ACHIEVEMENTS.map((def) => ({
    id: def.id,
    name: def.name,
    description: def.desc,
    category: def.category,
    tier: def.tier,
    points: points[def.id] ?? 1,
    incremental: def.progress !== undefined,
    hidden: false,
  }));
}
