// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The talent timers — Frost Nova's internal cooldown (magic tree) and Evasion's
// rank-5 speed-burst window (ranged tree). Called every playing frame from
// `step`, before the combat passes read them: both clocks count down so the next
// struck-frame can freeze the swarm again and a dodge's dart fades out.

import type { GameState } from "./types/index.ts";

/** Advance the talent timers one tick (see module note). */
export function stepTimers(state: GameState, dtMs: number): void {
  const player = state.player;

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
}
