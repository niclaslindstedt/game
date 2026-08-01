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
import { heroInPlay } from "./party.ts";
import { spentTalentRanks, talentRank } from "./talent-effects.ts";
import type { GameState, Player, StatName } from "./types/index.ts";

/**
 * Lift the `levelup` pause and drop back into play — but only once the banked
 * stat points are all spent AND the talent-picker queue is empty. A ding that
 * crosses a ×10 tree milestone earns a talent point (`allocateStat` →
 * `reconcileTalentPoints`); the run must stay frozen behind the picker, or the
 * hero would fight on unattended while the player chooses. Called when the last
 * point lands (`allocateStat`) and when the last talent is picked
 * (`spendTalentPoint`), so whichever finishes last is the one that resumes. A
 * no-op outside `levelup` (a respec never auto-closes; play stays play).
 */
export function resumeAfterLevelup(state: GameState, player: Player): void {
  if (
    state.phase === "levelup" &&
    player.pendingStatPoints === 0 &&
    state.pendingTalentPoints.length === 0
  ) {
    state.phase = "playing";
  }
}

/**
 * DROP A LEVEL-UP CHOOSER NOBODY LEFT IN PLAY CAN CLOSE.
 *
 * The chooser is a GLOBAL phase that lifts only when the points are placed, and
 * the hero who owes them can stop being able to place them in two ways: they
 * QUIT (`departHero`) or they go DOWN (hp 0 with the party not yet wiped, so no
 * `dying` scene ever runs). Either way the run freezes for everybody, for ever
 * — and it does so silently, because from the outside the session still ticks
 * and still publishes. The bot-client soak found both, in that order: the first
 * was fixed at the departure and the second wedged the very next run.
 *
 * So the rule is checked EVERY TICK rather than at the events that can trigger
 * it, which is the only version that cannot be out-run by a new way of leaving
 * play. `heroInPlay` is the same line the rest of the engine draws — the world
 * does not answer for a body nobody is behind, and that has to include waiting
 * on one.
 *
 * **THE POINTS ARE NOT FORFEITED.** A held seat may be reclaimed inside the
 * grace window and a downed hero may be revived, and either should find their
 * level-up where they left it (`promptPendingPoints` raises it again). What is
 * dropped is the WORLD's obligation to stand still.
 *
 * It can only ever lower a screen that is already stuck: `promptPendingPoints`
 * refuses to raise one with nothing owed, so a live hero owing points always
 * holds it. `respec` is deliberately untouched — it is raised by a deliberate
 * act and closed by one, and a run does not enter it by surprise.
 *
 * The real fix is per-player screens (multiplayer plan §3.2); until `state.phase`
 * loses its eleven UI members this is the difference between one player leaving
 * and everybody's run ending.
 */
export function releaseStuckLevelup(state: GameState): void {
  if (state.phase !== "levelup") return;
  if (state.pendingTalentPoints.length > 0) return;
  for (const player of state.players) {
    if (heroInPlay(player) && player.pendingStatPoints > 0) return;
  }
  state.phase = "playing";
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
 * Rebuild `state.pendingTalentPoints` from the current stats + owned ranks —
 * the single source of truth for "what the picker still owes." One entry per
 * spendable point, in `TALENT_STATS` (STR > DEX > INT) order so the picker
 * surfaces trees in a stable sequence. Idempotent; call after any change to
 * `spentStats` or `talents` (allocate/deallocate/respec/load/spend).
 */
export function reconcileTalentPoints(state: GameState, player: Player): void {
  const queue: StatName[] = [];
  for (const stat of TALENT_STATS) {
    const n = availableTalentPoints(state, player, stat);
    for (let i = 0; i < n; i++) queue.push(stat);
  }
  state.pendingTalentPoints = queue;
}

/** True while the hero has a talent point waiting to be spent — the picker's
 * "show me" flag and the level-up pause's hold condition. Every queued point is
 * spendable (the queue is capacity-clamped), so length alone is the test. */
export function hasPendingTalentPoint(state: GameState): boolean {
  return state.pendingTalentPoints.length > 0;
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
  resumeAfterLevelup(state, player);
  return true;
}

/**
 * The lowest a tree stat may be respecced to: `TALENT_UNLOCK_STEP × ranks spent
 * in that tree`, so every spent point stays supported by the stat that earned
 * it (spent points are permanent). 0 for a non-tree stat. The respec UI shows
 * this as the "locked by talents" floor.
 */
export function talentStatFloor(state: GameState, stat: StatName): number {
  const tree = TALENT_STAT_CLASS[stat];
  if (!tree) return 0;
  return TALENT_UNLOCK_STEP * spentTalentRanks(state, state.players[0], tree);
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
