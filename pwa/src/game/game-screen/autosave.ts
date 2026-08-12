// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE CHECKPOINT AUTOSAVE — parking the live run to storage WHILE it is being
// played, rather than only when the player walks out through the pause menu.
//
// The run used to reach storage exactly once: `App`'s exit-to-menu handler
// called `saveRun`. Every other way out of a run left nothing behind — and on a
// phone the ordinary way out is not a menu at all. An iOS home-screen PWA
// swiped out of the app switcher is killed outright: no `beforeunload`, no
// `pagehide`, no chance to write anything on the way down. An hour of play, the
// hero eight levels up, and the next launch offered no CONTINUE and a roster
// hero still on level 1.
//
// So the run is parked continuously, on two clocks:
//
//   PROGRESS — a save at most every `PROGRESS_SAVE_MS`, and only when the run
//     has actually moved since the last one (a kill, a pickup, a coin, XP, a
//     ding, a story item). A hero standing still in the garage writes nothing.
//   BEATS — the moments worth not losing (a ding, a boss down, an errand
//     turned in) jump the queue and are written on the next tick, held only by
//     a short floor so a loot explosion cannot write ten times in a second.
//
// …and one event: the app being BACKGROUNDED (`visibilitychange` → hidden, or
// `pagehide`) writes immediately and unconditionally. That is the last instant
// an iOS PWA is guaranteed to run any code before it is killed, which makes it
// the single most valuable save in the file.
//
// WHY NOT SIMPLY SAVE EVERY KILL. A parked run is the whole `GameState` — a
// couple of hundred KB of JSON even with the fog packed (saved-run.ts) — and
// both the stringify and the synchronous `localStorage` write land on the frame
// thread. At 60 Hz in a busy fight that is a stutter per kill. Coalescing to a
// few seconds costs at most a few seconds of progress on a kill -9 and is
// invisible while playing, which is the trade this file exists to make.
//
// A RESOLVED RUN IS NOT PARKED. On victory or defeat the outcome is banked onto
// the CHARACTER (run-progress.ts) and the parked run is dropped: resuming into a
// corpse or into an already-counted win is worse than having nothing to resume.
//
// A RUN UNDER A MINIGAME IS, THOUGH — and it is the one park whose state needs
// repairing on the way back out. While the DRIVE is up the run stays mounted and
// frozen (`driveRef`, GameScreen.tsx), so `tick` is never reached and these
// listeners are the only thing that can still write: an app switcher killing the
// page mid-road flushes a garage the car has already driven out of, its
// departure booked and latched. That is a state nothing could resume until
// `rebookDeparture` (saved-run.ts), which drops the latch on the thaw so the
// leg opens again on its own title card. Nothing to do HERE — the flush is
// right to write it, because the alternative is losing the run — but the two
// halves only work as a pair.

import type { GameEvent, GameState } from "@game/core";
import type { MutableRefObject } from "react";

import type { Character } from "../characters.ts";
import { localHero } from "../local-seat.ts";
import { clearSavedRun, saveRun } from "../saved-run.ts";

/** How often a run that is making ordinary progress is parked (ms). */
const PROGRESS_SAVE_MS = 5_000;

/** The floor between two saves a BEAT asked for (ms) — one nuke can drop a
 * dozen items and ding twice inside a second, and each of those is a beat. */
const BEAT_SAVE_MS = 1_000;

/**
 * The beats that must not wait for the ordinary cadence. Everything else the
 * run does is caught by the progress counters below, which is why this list is
 * short: it is not "what counts as progress", it is "what would sting most to
 * replay".
 */
const BEATS: ReadonlySet<GameEvent["type"]> = new Set([
  "levelUp",
  "bossDefeated",
  "storyItemCollected",
  "questAccepted",
  "questCompleted",
  "questTurnedIn",
  "companionJoined",
  "merchantDiscovered",
  "gearRepaired",
]);

/**
 * The phases worth parking. A run mid-cutscene or mid-intro has nothing yet to
 * lose, and `dying`/`victory`/`defeat`/`outro` are the resolution — which the
 * character, not the parked run, carries from here on.
 */
const PARKABLE = new Set<GameState["phase"]>([
  "playing",
  "dialogue",
  "choice",
  "bossDeath",
]);

export type Autosave = {
  /** Offer this tick's event — a beat jumps the queue. */
  onEvent: (event: GameEvent) => void;
  /** Run the cadence for this tick. Cheap: a handful of number compares
   * unless a save is actually due. */
  tick: (state: GameState) => void;
  /** Park the run right now, whatever the clocks say (the backgrounding
   * path, and anything else that knows the run is about to stop being
   * watched). */
  flush: (state: GameState) => void;
  dispose: () => void;
};

/**
 * A no-op autosave, for the runs that are not the player's to park: the HOW TO
 * PLAY demo and DEVELOPER → BOT VIEW (both fly a synthetic hero), and a joined
 * session (whose run belongs to the host — a joiner's CONTINUE must not drop
 * them back into somebody else's game).
 */
function disabledAutosave(): Autosave {
  return {
    onEvent: () => {},
    tick: () => {},
    flush: () => {},
    dispose: () => {},
  };
}

export function createAutosave(deps: {
  /** The live state this run is advancing — held so the backgrounding
   * listeners have something to park without the loop handing it over. */
  state: GameState;
  /** Whose run this is. A ref, because a victory mid-mount replaces the
   * character object (run-progress.ts) and the save must name the live one. */
  characterRef: MutableRefObject<Character>;
  /** False for the runs listed on {@link disabledAutosave}. */
  enabled: boolean;
}): Autosave {
  const { state: runState, characterRef, enabled } = deps;
  if (!enabled) return disabledAutosave();

  let lastSaveMs = -Infinity;
  // Progress has been made SINCE THE LAST SAVE — not since the last tick.
  // The distinction is the whole cadence: a fight's kills all land inside one
  // throttle window, and a flag that reset every tick would swallow them and
  // wait for the next kill after the window to write anything at all.
  let dirty = false;
  let beatPending = false;
  // The run resolved (victory/defeat) and its parked copy has been dropped —
  // nothing is parked again until play actually resumes, which is what STAY
  // after a victory does.
  let resolved = false;

  // The progress counters, in the order they are checked below. Primed to -1 so
  // the first tick of any run always reads as "moved" and parks it straight
  // away: a run is worth having on disk from its first frame of play, not from
  // its first kill.
  const seen = [-1, -1, -1, -1, -1, -1, -1];
  const moved = (i: number, value: number): boolean => {
    if (seen[i] === value) return false;
    seen[i] = value;
    return true;
  };
  /** Has the run made progress since the last check? Allocation-free — this
   * runs on every simulated tick. */
  const progressed = (state: GameState): boolean => {
    const hero = localHero(state);
    const stats = state.stats;
    // Every term is checked (no short-circuit): they all have to be recorded,
    // or the one skipped this tick reports a change on the next one.
    let changed = moved(0, stats.kills);
    if (moved(1, stats.itemsCollected)) changed = true;
    if (moved(2, stats.goldCollected)) changed = true;
    if (moved(3, hero.level)) changed = true;
    if (moved(4, hero.xp)) changed = true;
    if (moved(5, hero.coins)) changed = true;
    if (moved(6, state.storyItems.length)) changed = true;
    return changed;
  };

  const park = (state: GameState): void => {
    lastSaveMs = performance.now();
    dirty = false;
    beatPending = false;
    saveRun({
      characterId: characterRef.current.id,
      // The run's own, not the mount's: a paid AUTO PILOT ride steps the
      // difficulty up, and a crossing moves the level, both mid-mount.
      difficulty: state.difficulty,
      levelId: state.level.id,
      state,
    });
  };

  const flush = (state: GameState): void => {
    if (resolved || !PARKABLE.has(state.phase)) return;
    progressed(state);
    park(state);
  };

  // BACKGROUNDED — the last code an app switcher lets this page run. `pagehide`
  // covers a browser tab being navigated away or discarded; `visibilitychange`
  // covers the phone case that motivated all of this. Both are idempotent, and
  // both are cheap enough to just do rather than to reason about which fired.
  const onHide = () => {
    if (document.visibilityState === "hidden") flush(runState);
  };
  const onPageHide = () => flush(runState);
  document.addEventListener("visibilitychange", onHide);
  window.addEventListener("pagehide", onPageHide);

  return {
    onEvent(event) {
      // The run is over: bin the parked copy rather than leave one that
      // resumes into a death scene or a win already banked on the character.
      // On the FALL (`playerDeath`), not on the modal a beat later — the gap
      // between the two is a window in which killing the app would resume the
      // run from just before the blow, and a hardcore hero's death is supposed
      // to be the end of them. A STAY after a victory (or a party that fights
      // on) clears the flag again on the next live tick.
      if (
        event.type === "victory" ||
        event.type === "defeat" ||
        event.type === "playerDeath"
      ) {
        resolved = true;
        beatPending = false;
        clearSavedRun();
        return;
      }
      if (BEATS.has(event.type)) beatPending = true;
    },
    tick(state) {
      if (!PARKABLE.has(state.phase)) return;
      // Back on the field after a resolved run (the victory splash's STAY).
      resolved = false;
      if (progressed(state)) dirty = true;
      if (!dirty && !beatPending) return;
      const since = performance.now() - lastSaveMs;
      if (since < (beatPending ? BEAT_SAVE_MS : PROGRESS_SAVE_MS)) return;
      park(state);
    },
    flush,
    dispose() {
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", onPageHide);
    },
  };
}
