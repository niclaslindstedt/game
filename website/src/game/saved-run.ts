// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Parking the in-progress run in storage, so it survives a page reload — most
// importantly the one an app update forces. A run exited to the menu used to
// live only in React memory: applying a PWA update reloads the page, memory is
// wiped, and the CONTINUE button vanished with it (the exact bug this fixes).
//
// The whole engine GameState is plain JSON apart from its `rng` closure, so we
// serialize the state as-is and snapshot the rng's internal position beside it,
// rebuilding the generator on load so a resumed run picks up the exact same
// stream (proven in tests/engine/persistence_test.ts).

import { LEVELS, warn } from "@game/core";
import type { Difficulty, GameState } from "@game/core";

import { createRngFromState, rngState } from "@game/lib/rng.ts";

import { storageKey } from "../identity.ts";

const KEY = storageKey("current-run");

// Bump this whenever the serialized GameState shape changes in a way an older
// snapshot can't be read into. A mismatched (or unparseable) blob is dropped
// rather than resumed, so a stale run from a previous build never crashes the
// thaw — the CONTINUE button simply doesn't appear, as it wouldn't have before.
const SAVE_VERSION = 1;

/** A run parked between sessions: enough to drop the player straight back in. */
export type ParkedRun = {
  difficulty: Difficulty;
  levelId: string;
  state: GameState;
};

type Serialized = {
  v: number;
  difficulty: Difficulty;
  levelId: string;
  // The rng closure can't be serialized; its position is snapshotted here and
  // the generator rebuilt on load.
  rngState: number;
  // The GameState verbatim minus its rng (restored on load). `events` is
  // transient per-step chatter, blanked so a resume doesn't replay stale sfx.
  state: Omit<GameState, "rng">;
};

/** Freeze the parked run to storage. Best-effort — a storage failure is logged, not thrown. */
export function saveRun(run: ParkedRun): void {
  try {
    const { rng, ...rest } = run.state;
    const payload: Serialized = {
      v: SAVE_VERSION,
      difficulty: run.difficulty,
      levelId: run.levelId,
      rngState: rngState(rng),
      // `events` is transient per-step chatter; blank it so a resume doesn't
      // replay stale sfx (it's overwritten again on the first step anyway).
      state: { ...rest, events: [] },
    };
    localStorage.setItem(KEY, JSON.stringify(payload));
  } catch (err) {
    warn(`could not save the current run: ${String(err)}`);
  }
}

/** Drop any parked run — called when one is resumed, abandoned, or replaced. */
export function clearSavedRun(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // A storage that won't delete is a storage that won't persist either;
    // nothing to recover, so stay silent.
  }
}

/**
 * Thaw the parked run from storage, or null if there's none / it's unreadable
 * / it was written by an incompatible build. Any such blob is cleared so it
 * can't wedge future loads.
 */
export function loadSavedRun(): ParkedRun | null {
  let raw: string | null;
  try {
    raw = localStorage.getItem(KEY);
  } catch {
    return null;
  }
  if (!raw) return null;
  try {
    const payload = JSON.parse(raw) as Serialized;
    // Reject anything from an older/newer save format, or parked on a level a
    // later build has since retired — either way it can't be resumed cleanly.
    if (
      !payload ||
      payload.v !== SAVE_VERSION ||
      typeof payload.levelId !== "string" ||
      !(payload.levelId in LEVELS)
    ) {
      clearSavedRun();
      return null;
    }
    const state: GameState = {
      ...payload.state,
      events: [],
      rng: createRngFromState(payload.rngState),
    };
    return {
      difficulty: payload.difficulty,
      levelId: payload.levelId,
      state,
    };
  } catch (err) {
    warn(`ignoring an unreadable saved run: ${String(err)}`);
    clearSavedRun();
    return null;
  }
}
