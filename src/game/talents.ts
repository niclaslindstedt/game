// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The talent ECONOMY — the state-mutating half of the passive talent system
// (the catalog lives in `defs/talents/`, the pure effect reads in
// `talent-effects.ts`). It owns:
//
//  1. The point ECONOMY. Every 10 CHOSEN points in a tree stat earns one talent
//     point in that tree (`earnedTalentPoints`); ranks purchased spend them
//     (`spentTalentRanks`). The unspent remainder — clamped to what the tree can
//     still hold — is the pool the picker offers (`availableTalentPoints`).
//     `reconcileTalentPoints` rebuilds `state.pendingTalentPoints` (the picker
//     queue) from that derivation, so the queue is a deterministic CACHE of the
//     player's stats + owned ranks rather than a hand-maintained log. This makes
//     every edge case fall out for free: a respec that drops a tree stat below a
//     milestone revokes the un-spent point (earned drops → queue shrinks), a
//     full tree never enqueues an unspendable point (the capacity clamp), and an
//     adopted veteran's converted points appear the instant their stats load.
//
//  2. SPENDING a point (`spendTalentPoint`) — bump a talent's rank and re-derive.
//
// The respec floor rule (`talentStatFloor`) lives here too: a tree stat can't be
// pushed below `10 × ranks spent in that tree`, so a spent point is permanent.

import {
  TALENT_STATS,
  TALENT_STAT_CLASS,
  TALENT_CLASS_STAT,
  TALENT_UNLOCK_STEP,
  talentDefs,
  treeCapacity,
} from "./defs/talents/index.ts";
import { recomputeMaxHp } from "./items/derived.ts";
import { spentTalentRanks, talentRank } from "./talent-effects.ts";
import type { GameState, Player, StatName } from "./types/index.ts";

/**
 * Close this hero's level-up chooser — but only once the banked stat points
 * are all spent AND their talent-picker queue is empty. A ding that crosses a
 * ×10 tree milestone earns a talent point (`allocateStat` →
 * `reconcileTalentPoints`); the chooser stays up behind the picker so the
 * point is never left silently on the table. Called when the last point lands
 * (`allocateStat`) and when the last talent is picked (`spendTalentPoint`),
 * so whichever finishes last is the one that closes. A no-op outside the
 * chooser (a respec never auto-closes; the field stays the field).
 *
 * A stuck chooser is no longer anybody's problem: the screen is this hero's
 * alone (plan §3.2), so a hero who quits or goes down with it open holds
 * nothing shut — `partyBlocked` only counts heroes in play. That is the
 * structural version of what `releaseStuckLevelup` used to bolt on, and the
 * reason that function no longer exists.
 */
export function resumeAfterLevelup(player: Player): void {
  if (
    player.screen === "levelup" &&
    player.pendingStatPoints === 0 &&
    player.pendingTalentPoints.length === 0
  ) {
    delete player.screen;
  }
}

/** Talent points a tree stat has EARNED — one per `TALENT_UNLOCK_STEP` chosen
 * (hand-allocated) points, so gear never mints a point. Reads `spentStats`, the
 * player's own picks (not the effective stat, which folds in gear/head-start). */
export function earnedTalentPoints(
  spentStats: Record<StatName, number>,
  stat: StatName,
): number {
  return Math.floor((spentStats[stat] ?? 0) / TALENT_UNLOCK_STEP);
}

/** Un-spent, SPENDABLE points in `stat`'s tree: earned minus ranks already
 * spent, clamped to what the tree can still absorb (so a full tree never leaves
 * a point stranded — the level-up pause would hang on an unspendable point). 0
 * for a non-tree stat (stamina/luck). */
export function availableTalentPoints(
  state: GameState,
  player: Player,
  stat: StatName,
): number {
  const tree = TALENT_STAT_CLASS[stat];
  if (!tree) return 0;
  const earned = earnedTalentPoints(player.spentStats, stat);
  const spent = spentTalentRanks(state, player, tree);
  const room = treeCapacity(tree) - spent;
  return Math.max(0, Math.min(earned - spent, room));
}

/**
 * Rebuild this hero's `pendingTalentPoints` from their current stats + owned
 * ranks — the single source of truth for "what the picker still owes." One
 * entry per spendable point, in `TALENT_STATS` (STR > DEX > INT) order so the
 * picker surfaces trees in a stable sequence. Idempotent; call after any
 * change to `spentStats` or `talents` (allocate/deallocate/respec/load/spend).
 */
export function reconcileTalentPoints(state: GameState, player: Player): void {
  const queue: StatName[] = [];
  for (const stat of TALENT_STATS) {
    const n = availableTalentPoints(state, player, stat);
    for (let i = 0; i < n; i++) queue.push(stat);
  }
  player.pendingTalentPoints = queue;
}

/** True while this hero has a talent point waiting to be spent — the picker's
 * "show me" flag and the chooser's hold condition. Every queued point is
 * spendable (the queue is capacity-clamped), so length alone is the test. */
export function hasPendingTalentPoint(player: Player): boolean {
  return player.pendingTalentPoints.length > 0;
}

/**
 * Spend one talent point on `talentId`, ranking it up by one. Fails (returns
 * false, no change) when the id is unknown, the talent is already at
 * `maxRank`, or the hero has no spendable point in that talent's tree. On
 * success it re-derives max hp (Bulwark grows the pool), reconciles the pending
 * queue, and lifts the level-up pause once the queue empties — the picker's
 * counterpart to the stat chooser's last-point resume.
 */
export function spendTalentPoint(
  state: GameState,
  player: Player,
  talentId: string,
): boolean {
  const defs = talentDefs();
  const def = defs[talentId];
  if (!def) return false;
  const rank = talentRank(state, player, talentId);
  if (rank >= def.maxRank) return false;
  if (availableTalentPoints(state, player, TALENT_CLASS_STAT[def.tree]) <= 0) {
    return false;
  }
  player.talents[talentId] = rank + 1;
  recomputeMaxHp(state, player);
  reconcileTalentPoints(state, player);
  resumeAfterLevelup(player);
  return true;
}

/**
 * The lowest a tree stat may be respecced to: `TALENT_UNLOCK_STEP × ranks spent
 * in that tree`, so every spent point stays supported by the stat that earned
 * it (spent points are permanent). 0 for a non-tree stat. The respec UI shows
 * this as the "locked by talents" floor. Takes the hero whose build is being
 * respecced — a party member's floor is their own, never seat 0's.
 */
export function talentStatFloor(
  state: GameState,
  player: Player,
  stat: StatName,
): number {
  const tree = TALENT_STAT_CLASS[stat];
  if (!tree) return 0;
  return TALENT_UNLOCK_STEP * spentTalentRanks(state, player, tree);
}

/** Total talent points a build has earned across all three trees — reporting
 * only (sim/HUD). */
export function talentPointsEarned(
  spentStats: Record<StatName, number>,
): number {
  let total = 0;
  for (const stat of TALENT_STATS)
    total += earnedTalentPoints(spentStats, stat);
  return total;
}
