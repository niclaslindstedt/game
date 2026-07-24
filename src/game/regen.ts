// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The SPIRIT-driven HEALTH regen tick and the magic-tree talent timers — Frost
// Nova's internal cooldown and Evasion's rank-5 speed-burst window. Called every
// playing frame from `step`, before the combat passes read the pools. Health
// mends only after the post-hit pause (`player.hpRegenMs`) lapses; the two talent
// clocks count down so the next struck-frame can freeze the swarm again and a
// dodge's dart fades out.

import { hpRegenPerSec } from "./items/derived.ts";
import type { GameState } from "./types/index.ts";

/** Advance the health regen and the talent timers one tick (see module note). */
export function stepRegen(state: GameState, dt: number, dtMs: number): void {
  const player = state.player;

  // Health regen: held off until the post-hit pause lapses; 0 at 0 SPIRIT.
  if (player.hpRegenMs > 0) {
    player.hpRegenMs = Math.max(0, player.hpRegenMs - dtMs);
  } else if (player.hp < player.maxHp) {
    const rate = hpRegenPerSec(state);
    if (rate > 0) player.hp = Math.min(player.maxHp, player.hp + rate * dt);
  }

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
