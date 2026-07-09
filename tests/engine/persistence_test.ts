// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Persisting a run: the whole GameState is plain JSON apart from its `rng`
// closure, so it can be frozen to storage and thawed on reload. This suite
// proves the round-trip is lossless AND that a thawed run keeps stepping the
// exact same sequence a live one would — the guarantee behind the CONTINUE
// button surviving an app update (see website/src/game/saved-run.ts).

import { describe, expect, it } from "vitest";

import { createRngFromState, rngState } from "@game/lib/rng.ts";
import { step } from "@game/core";
import type { GameState } from "@game/core";

import { DT, idle, run, startGame } from "./helpers.ts";

// Everything the app persists: the state minus its (unserializable) rng
// closure, with the rng's internal position snapshotted alongside.
function freeze(state: GameState): string {
  const { rng, ...rest } = state;
  return JSON.stringify({ rngState: rngState(rng), state: { ...rest } });
}

// Rehydrate a frozen run: parse the plain data and rebuild the rng at the
// snapshotted position, exactly like saved-run.ts does.
function thaw(json: string): GameState {
  const parsed = JSON.parse(json) as {
    rngState: number;
    state: Omit<GameState, "rng">;
  };
  return { ...parsed.state, rng: createRngFromState(parsed.rngState) };
}

// A stable fingerprint of the sim's observable state. JSON.stringify drops the
// `rng` function value on its own, so the closure never enters the comparison.
function fingerprint(state: GameState): string {
  return JSON.stringify(state);
}

describe("run persistence", () => {
  it("round-trips a live run without losing data", () => {
    const state = startGame();
    run(state, idle, 800); // populate entities, advance the clock and rng
    const before = fingerprint(state);
    const restored = thaw(freeze(state));
    expect(fingerprint(restored)).toEqual(before);
  });

  it("a thawed run keeps stepping the exact same sequence", () => {
    const state = startGame();
    run(state, idle, 500);

    // Freeze here, then step the original and the thawed copy in lockstep.
    const restored = thaw(freeze(state));
    for (let i = 0; i < 120; i++) {
      step(state, idle, DT);
      step(restored, idle, DT);
    }
    expect(fingerprint(restored)).toEqual(fingerprint(state));
  });

  it("carries the exact rng position across the freeze", () => {
    const state = startGame();
    run(state, idle, 300);
    const restored = thaw(freeze(state));
    expect(restored.rng()).toEqual(state.rng());
  });
});
