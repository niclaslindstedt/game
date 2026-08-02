// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// WHAT each published board's number IS — the reading half of the leaderboards,
// where platform-leaderboards.ts is the declaring half (which boards exist and
// how the portal formats them). The split is not tidiness: that half is
// imported by a build script and a test, this one reaches the achievement
// ledger and the campaign book, and dragging those into a generator would make
// it load the whole engine.
//
// Nothing here is tracked FOR a board. Every value is a record the game already
// keeps for itself, so a board can be added or retired without touching a
// counter, and no ranking can ever disagree with what the game shows the player
// about their own play.
//
// **AND EVERY ONE OF THEM IS A SOLO RECORD** (docs/multiplayer.md). The host
// of a session is a player, so the host can cheat — that is the accepted cost of
// a listen server, fine among friends and fatal for a ranking — and seven people
// helping inflates all four of these without anybody having to cheat at all. So
// a run more than one person has played is MARKED (`PartyStamp`), the ledger
// keeps the board-facing figures for solo play alone (`LifetimeTotals.solo`),
// and `highscores.ts` refuses a campaign any leg of which was played in company.
// The badges are the opposite and deliberately so: a party kill counts for
// everyone present.
//
// The honesty this rule owes: it stops a co-op run reaching a board, and it is
// not an anti-cheat. A determined host can still forge a solo record, exactly as
// they could before multiplayer existed.

import { type Difficulty } from "@game/menu";

import type { LeaderboardEntry, LeaderboardKey } from "../app/scores-bridge.ts";
import { scoresBridgeAvailable, submitScores } from "../app/scores-bridge.ts";

import { getAchievements } from "./achievements.ts";
import { topCampaigns } from "./highscores.ts";
import {
  FORMAT_SCALE,
  PLATFORM_LEADERBOARDS,
} from "./platform-leaderboards.ts";

/** The difficulty the two campaign boards rank. The hardest rung in the game:
 * a survival board open to every difficulty would be won on the easiest one,
 * where a hero lives longest — so the campaign boards name their rung instead
 * of averaging over all of them. */
const CAMPAIGN_BOARD_DIFFICULTY: Difficulty = "jesus";

/** Where each board's value comes from, in the metric's own natural units
 * (a count, a rate per minute, or milliseconds — the format's scale converts).
 * Exhaustive over `LeaderboardKey`, so a new board cannot ship without one. */
const BOARD_VALUE: Record<LeaderboardKey, () => number> = {
  hardest_blow: () => getAchievements().totals.solo.maxBurstDamage,
  foes_felled: () => getAchievements().totals.solo.kills,
  kill_rate: () => getAchievements().totals.solo.bestKillRate,
  jesus_survival: () => bestCampaign("time")?.combatMs ?? 0,
  jesus_kills: () => bestCampaign("kills")?.kills ?? 0,
};

/** The best banked hardcore campaign on the board difficulty by one metric, or
 * undefined when no hardcore hero has finished one there yet. */
function bestCampaign(metric: "time" | "kills") {
  return topCampaigns(CAMPAIGN_BOARD_DIFFICULTY, metric, 1)[0];
}

/**
 * Every board's current value as the integer the platform stores. Boards
 * sitting at zero are DROPPED rather than submitted: a player who has never
 * finished a JESUS campaign has no standing on that board, and publishing a 0
 * would seat them at the bottom of it rather than leaving them off it.
 */
export function leaderboardEntries(): LeaderboardEntry[] {
  const entries: LeaderboardEntry[] = [];
  for (const board of PLATFORM_LEADERBOARDS) {
    const raw = BOARD_VALUE[board.key]();
    if (!Number.isFinite(raw) || raw <= 0) continue;
    const value = Math.round(raw * FORMAT_SCALE[board.format]);
    if (value <= 0) continue;
    entries.push({ key: board.key, value });
  }
  return entries;
}

/**
 * Publish the player's whole slate. The platform keeps the BEST value it has
 * ever been sent for a board, so this is safe to call at any natural moment (a
 * run ending, a launch) with no record of what went before — which is also what
 * backfills a player's existing history the first time they sign in. A no-op
 * outside the native shell.
 */
export async function publishLeaderboards(): Promise<boolean> {
  if (!scoresBridgeAvailable()) return false;
  return submitScores(leaderboardEntries());
}
