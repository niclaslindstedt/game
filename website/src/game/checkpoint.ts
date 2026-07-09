// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The retry checkpoint: a deep, in-memory snapshot of the run taken the instant
// combat truly begins — the hero armed and in the player's hands, past the
// prelude cutscene, the intro monologue, and (on SpaceZ HQ) the scripted
// opening strike. RETRY after a death adopts a fresh copy of it so the player
// drops straight back into the action instead of sitting through the whole
// opening again. It lives only in React memory (a ref that survives the RETRY
// re-run of the run effect), so it is gone the moment the screen unmounts —
// unlike the parked run in saved-run.ts, which persists to storage.
//
// The whole engine GameState is plain JSON apart from its two `rng` closures,
// so we clone everything else with structuredClone and rebuild the generators
// from their snapshotted stream positions — exactly the trick saved-run.ts uses
// to freeze a run to storage (proven in tests/engine/persistence_test.ts).

import type { GameState } from "@game/core";

import { createRngFromState, rngState } from "@game/lib/rng.ts";

/**
 * A deep, independent copy of the engine state: everything but the two rng
 * closures cloned outright, their stream positions snapshotted and rebuilt so
 * the copy replays the exact same loot/damage streams. Each call yields a fresh
 * object graph, so one stored snapshot can be restored again and again — every
 * RETRY gets its own clone and mutating the run never touches the checkpoint.
 */
export function cloneGameState(state: GameState): GameState {
  const { rng, fxRng, ...rest } = state;
  const copy = structuredClone(rest) as Omit<GameState, "rng" | "fxRng">;
  return {
    ...copy,
    // `events` is transient per-step chatter; blank it so an adopted copy
    // doesn't replay stale sfx (the first step overwrites it anyway).
    events: [],
    rng: createRngFromState(rngState(rng)),
    fxRng: createRngFromState(rngState(fxRng)),
  };
}
