// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The per-hero windows — Frost Nova's internal cooldown (magic tree), Evasion's
// rank-5 speed-burst (ranged tree), and the XP SCROLL's double-XP window.
// Called every playing frame from `step`, before the combat passes read them:
// the clocks count down so the next struck-frame can freeze the swarm again, a
// dodge's dart fades out, and a scroll's thirty seconds actually run out.

import type { GameState, Player } from "./types/index.ts";

/** Advance the talent timers one tick (see module note). */
export function stepTimers(
  state: GameState,
  player: Player,
  dtMs: number,
): void {
  // FROST NOVA's internal cooldown (magic-tree talent) ebbs each tick so the
  // next blow the hero takes can freeze the swarm again.
  if (player.frostNovaCooldownMs && player.frostNovaCooldownMs > 0) {
    player.frostNovaCooldownMs = Math.max(0, player.frostNovaCooldownMs - dtMs);
  }

  // EVASION rank 5's speed-burst window (ranged-tree talent) ebbs each tick; a
  // fresh dodge re-arms it in the struck path.
  if (player.evasionBurstMs && player.evasionBurstMs > 0) {
    player.evasionBurstMs = Math.max(0, player.evasionBurstMs - dtMs);
  }

  // THE XP SCROLL's double-XP window burns down in real time, whatever the hero
  // spends it on — that IS the scroll's design (its worth is what he does with
  // the thirty seconds). Ticked here rather than in `stepPlayer` so a hero
  // knocked flat by a sandstorm still burns his window: the scroll is not a
  // resource he can bank by lying down.
  if (player.xpBoostMs && player.xpBoostMs > 0) {
    player.xpBoostMs = Math.max(0, player.xpBoostMs - dtMs);
  }
}
