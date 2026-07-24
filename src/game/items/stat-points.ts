// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Level-up stat allocation and the LEVEL TOKEN respec: spending pending
// points (with talent-point milestones), refunding the whole build, and
// committing it back into play.

import { STAT_NAMES } from "../defs/equipment.ts";
import { statCap } from "../leveling.ts";
import {
  reconcileTalentPoints,
  resumeAfterLevelup,
  talentStatFloor,
} from "../talents.ts";
import type { GameState, StatName } from "../types/index.ts";
import { recomputeMaxHp, recomputeMaxStamina } from "./derived.ts";
import { syncInventoryCapacity } from "./inventory.ts";

// ---- Level-ups -------------------------------------------------------------------

/**
 * Spend one pending stat point. When the last point is spent the `levelup`
 * pause lifts and play resumes.
 */
export function allocateStat(state: GameState, stat: StatName): boolean {
  const player = state.player;
  if (player.pendingStatPoints <= 0) return false;
  // The level-scaled cap: chosen points can't be placed past `statCap` (they'd
  // realize nothing — that region is the diminished GEAR tail). Below ~L66 the
  // cap sits above any achievable chosen pile, so this only bites at the 250
  // hard ceiling; the UI greys a maxed stat.
  if (player.stats[stat] >= statCap(player.level)) return false;
  player.stats[stat]++;
  // Tally the player's own pick so the chooser can show it apart from the
  // head-start/auto-growth/gear baked into the effective stat. This chosen tally
  // is also what earns TALENT points (10 per tree stat), so bump it first.
  player.spentStats[stat]++;
  player.pendingStatPoints--;
  recomputeMaxHp(state);
  recomputeMaxStamina(state);
  // Every 10 CHOSEN points in a STR/DEX/INT tree earns a talent point; rederive
  // the picker queue from the new tally (a no-op for off-tree stats, and during
  // a respec it silently tracks the re-placement — the picker only surfaces once
  // the respec is confirmed).
  reconcileTalentPoints(state);
  // STRENGTH also widens the carry bag — grow it as the point lands.
  if (stat === "strength") syncInventoryCapacity(state);
  // A level-up resumes the moment its last point lands — UNLESS that point just
  // earned a talent point: its picker modal sits over the (now point-less)
  // chooser, and the run must stay frozen behind it until the talent is chosen,
  // or the hero would fight on unattended while the player picks.
  // `resumeAfterLevelup` resumes only when both the stat points AND the talent
  // queue are empty; `spendTalentPoint` finishes the job on the pick. A respec
  // never auto-closes — the chooser stays open (points move back and forth)
  // until the player confirms the build (`confirmRespec`).
  resumeAfterLevelup(state);
  return true;
}

// ---- Respec (LEVEL TOKEN reallocation) ----------------------------------------

/**
 * Open the from-scratch respec the way a spent LEVEL TOKEN owes it (see
 * progress.ts): refund every banked stat point back into a single pool and
 * zero the six stats, then freeze the run in the `respec` phase so the player
 * re-places the whole build. Idempotent guard aside, this is the one-shot the
 * pending flag arms — clear it so a later `dismissIntro` can't re-open the
 * chooser. The refunded total is the hero's carried-in level (plus any
 * difficulty head-start already folded into his stats).
 */
export function beginRespec(state: GameState): void {
  const player = state.player;
  state.respecPending = false;
  let pool = player.pendingStatPoints;
  for (const stat of STAT_NAMES) {
    // TALENTS lock a floor: a spent talent point is permanent, so its earning
    // stat can't be refunded below `10 × ranks spent in that tree`. The floor
    // points stay placed (and stay "spent"); only the surplus — head-start
    // included — returns to the pool to be re-allocated. A stat with no trained
    // talents floors at 0, refunding whole as before.
    const floor = talentStatFloor(state, stat);
    pool += Math.max(0, player.stats[stat] - floor);
    player.stats[stat] = floor;
    player.spentStats[stat] = floor;
  }
  player.pendingStatPoints = pool;
  // The floor exactly supports the ranks already spent, so no talent point is
  // pending yet; re-placing above a milestone mints them back (see allocateStat).
  reconcileTalentPoints(state);
  recomputeMaxHp(state);
  recomputeMaxStamina(state);
  syncInventoryCapacity(state);
  // Refunding STRENGTH shrinks the bag; keep current hp/stamina inside the
  // freshly-zeroed pools so the readouts never show an over-full bar.
  player.hp = Math.min(player.hp, player.maxHp);
  player.stamina = Math.min(player.stamina, player.maxStamina);
  state.phase = "respec";
}

/**
 * Put one point back into the pool during a respec: the inverse of
 * `allocateStat`, live only while the `respec` chooser is open. Floored at the
 * TALENT floor (`10 × ranks spent in that tree`, or 0 for a stat with no
 * trained talents) so a spent talent can never be left stranded above its
 * earning stat. Returns false when the stat is already at its floor (nothing to
 * refund) or the run is not respeccing.
 */
export function deallocateStat(state: GameState, stat: StatName): boolean {
  if (state.phase !== "respec") return false;
  const player = state.player;
  if (player.stats[stat] <= talentStatFloor(state, stat)) return false;
  player.stats[stat]--;
  player.spentStats[stat] = Math.max(0, player.spentStats[stat] - 1);
  player.pendingStatPoints++;
  // Dropping below a milestone revokes its un-spent talent point (the floor
  // guard above guarantees a SPENT one is never touched).
  reconcileTalentPoints(state);
  recomputeMaxHp(state);
  recomputeMaxStamina(state);
  if (stat === "strength") syncInventoryCapacity(state);
  player.hp = Math.min(player.hp, player.maxHp);
  player.stamina = Math.min(player.stamina, player.maxStamina);
  return true;
}

/**
 * Commit the respec and drop into play — only once every refunded point has
 * been re-spent, so the build is never left with points on the table. The run
 * arrives rested, exactly like a fresh drop: full health and a full sprint
 * pool over the newly-chosen stats. False (nothing happens) while points
 * remain or the run is not respeccing.
 */
export function confirmRespec(state: GameState): boolean {
  const player = state.player;
  if (state.phase !== "respec" || player.pendingStatPoints > 0) return false;
  player.hp = player.maxHp;
  player.stamina = player.maxStamina;
  // If the re-placed build crossed milestones the old ranks don't cover, those
  // talent points are now pending — surface the picker (the level-up flow) so
  // they aren't left silently on the table; otherwise drop straight into play.
  state.phase = state.pendingTalentPoints.length > 0 ? "levelup" : "playing";
  return true;
}
