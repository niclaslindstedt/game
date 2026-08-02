// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// CLIENT-SIDE MOVEMENT PREDICTION — the engine's own movement pass, run
// speculatively against a replicated state so the local hero answers the stick
// at 60 Hz instead of at the publish rate.
//
// THE RULE IS: PREDICT MOVEMENT, NEVER COMBAT. The net client (see
// `server/client-predict.ts` and `docs/multiplayer.md`) replays its own
// unacknowledged inputs over each authoritative snapshot, and every replayed
// step must be free to be WRONG — the next snapshot rebases it. A step that
// damaged an enemy, drew from the seeded rng stream (whose every draw is
// load-bearing for the drop ladder), or pushed shared meters would leave marks
// the rebase cannot wipe: the wire never re-sends what the client scribbled on
// itself. So this wrapper runs `stepPlayer` — the WHOLE per-hero movement:
// speed, steering, facing, jump/gravity, obstacle resolution, bounds clamp,
// stamina ledger — with the shared-state side effects neutralized:
//
//   - `state.events` is swapped for a scratch array and restored, so a
//     predicted jump/land/recovery cue is never played twice (the real one
//     arrives with the snapshot's event batch);
//   - `state.moveSpawnCredit`, `state.staminaRegenLockMs`,
//     `state.staminaEmptyMs` and `state.stats.jumps` are saved and restored —
//     they are the run's, not this hero's, and the server owns them;
//   - the SEISMIC LANDING slam is skipped via `stepPlayer`'s `predicting`
//     flag — it is combat, and it is the only path from `stepPlayer` to an
//     rng draw (`hitEnemy`). With it skipped, a predicted step draws nothing.
//
// What it deliberately DOES mutate is the hero handed in: pos, z/vz, vel,
// facing, faceLeft, moving, stamina and the knockout/hurt-flash timers. That
// is the point — and every one of those fields is public on the wire, so the
// next snapshot corrects any of it.

import { stepPlayer } from "./step/player.ts";
import type { GameEvent } from "./types/events.ts";
import type { GameInput, GameState, Player } from "./types/index.ts";

/** Reused across calls: the throwaway event sink a predicted step writes into.
 * One shared array, emptied per call — prediction runs at 60 Hz and must not
 * allocate per step. */
const scratchEvents: GameEvent[] = [];

/**
 * Run ONE movement step for `player` under `input`, leaving everything but the
 * hero's own kinematics untouched. See the module header for exactly what is
 * neutralized and why. Safe to call any number of times between snapshots;
 * the caller (the net client's predictor) rebases the hero from the next
 * authoritative snapshot before replaying.
 */
export function predictHeroMovement(
  state: GameState,
  player: Player,
  input: GameInput,
  dt: number,
  dtMs: number,
): void {
  const events = state.events;
  const moveSpawnCredit = state.moveSpawnCredit;
  const staminaRegenLockMs = state.staminaRegenLockMs;
  const staminaEmptyMs = state.staminaEmptyMs;
  const jumps = state.stats.jumps;
  scratchEvents.length = 0;
  state.events = scratchEvents;
  try {
    stepPlayer(state, player, input, dt, dtMs, { predicting: true });
  } finally {
    state.events = events;
    state.moveSpawnCredit = moveSpawnCredit;
    state.staminaRegenLockMs = staminaRegenLockMs;
    state.staminaEmptyMs = staminaEmptyMs;
    state.stats.jumps = jumps;
  }
}
