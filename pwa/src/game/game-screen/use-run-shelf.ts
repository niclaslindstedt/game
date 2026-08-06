// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// A SHELF OVER A LIVE RUN — the freeze/thaw discipline shared by every
// full-screen browser the game raises mid-fight without leaving it.
//
// Two use it today and they behave identically, which is why the rule lives
// here once: the ACHIEVEMENTS shelf (the ACHIEVEMENTS bind — Y, World of
// Warcraft's own achievements key — or a tap on the unlock toast) and the
// SCREENSHOT gallery (a press on the flash the screenshot key raises). The
// browser itself is the title menu's own screen, mounted lazily by GameScreen;
// all this holds is WHETHER it is up and what raising it did to the run.
//
// Opening PAUSES the run — a trophy shelf, or a photo roll, read over a live
// field would be read with the horde still closing in — through the run's own
// pause pair, so the music stops and the local hero's `paused` screen goes up
// exactly as the PAUSE key raises it (a hand-opened pause, latched so BOT
// VIEW's input loop leaves it alone). Closing lifts that pause again, UNLESS
// the shelf went up over a pause menu the player had already opened: then it
// simply lifts off, leaving the pause menu standing where it was.
//
// The pause/resume pair lives inside GameScreen's run effect (it closes over
// the engine state), so the effect hands it here with `bind` and clears it on
// teardown; every caller — the key handler, the canvas tap router, the shelf's
// own BACK button — then works off one stable set of callbacks.

import { useCallback, useRef, useState } from "react";
import type { MutableRefObject } from "react";

import type { GameState } from "@game/core";

import { synth } from "../audio.ts";
import { fieldLive, localScreen } from "../local-seat.ts";
import { playUiSound } from "../sfx/ui.ts";

/** The live run a shelf raises itself over: its engine state plus the run
 * effect's own pause/resume pair (see GameScreen). */
export type ShelfRun = {
  state: GameState;
  pause: (userInitiated?: boolean) => void;
  resume: () => void;
};

export type RunShelf = {
  /** Whether the shelf is mounted over the run — GameScreen renders on it. */
  open: boolean;
  /** Live mirror for the control layer, whose key handler cedes the whole
   * keyboard while the shelf is up (it runs its own row navigation). */
  openRef: MutableRefObject<boolean>;
  /** Hand the shelf this run's state + pause pair; null on teardown (which
   * also drops any open shelf, since the next run starts clean). */
  bind: (run: ShelfRun | null) => void;
  /** Raise the shelf (pausing the run). A no-op when it is already up, or
   * when the run is in no state to take it — see below. */
  openShelf: () => void;
  /** The bind's own verb: up if it is down, down if it is up. */
  toggle: () => void;
  /** Drop the shelf, resuming the run if opening it is what paused it. */
  close: () => void;
  /** Whether raising the shelf right now would work — the same test
   * `openShelf` applies, asked without doing it. The screenshot flash words
   * its hint line on this. */
  canOpen: () => boolean;
};

export function useRunShelf(): RunShelf {
  const [open, setOpen] = useState(false);
  // The render state above drives the mount; this mirror is what the
  // closure-captured key/tap handlers read without re-registering.
  const openRef = useRef(false);
  const runRef = useRef<ShelfRun | null>(null);
  // Whether OPENING the shelf is what froze the run. Only then does closing it
  // thaw the run again — a shelf raised from the pause menu leaves it up.
  const pausedByShelfRef = useRef(false);

  const close = useCallback(() => {
    if (!openRef.current) return;
    openRef.current = false;
    setOpen(false);
    const run = runRef.current;
    if (pausedByShelfRef.current && run) run.resume();
    pausedByShelfRef.current = false;
  }, []);

  // Only over a field the player is actually steering, or over the pause menu
  // that field is already frozen behind — never over a scene, a splash, a
  // death or another open screen, all of which own the moment themselves.
  const canOpen = useCallback(() => {
    const run = runRef.current;
    if (!run) return false;
    return fieldLive(run.state) || localScreen(run.state) === "paused";
  }, []);

  const openShelf = useCallback(() => {
    if (openRef.current) return;
    const run = runRef.current;
    if (!run || !canOpen()) return;
    const live = fieldLive(run.state);
    if (live) run.pause(true);
    pausedByShelfRef.current = live;
    openRef.current = true;
    setOpen(true);
    playUiSound(synth, "confirm");
  }, [canOpen]);

  const toggle = useCallback(() => {
    if (openRef.current) {
      playUiSound(synth, "back");
      close();
    } else {
      openShelf();
    }
  }, [close, openShelf]);

  const bind = useCallback((run: ShelfRun | null) => {
    runRef.current = run;
    if (run) return;
    // The run is gone (a retry, the next level, an unmount): there is nothing
    // left to resume, so drop the shelf without touching a stale state.
    openRef.current = false;
    pausedByShelfRef.current = false;
    setOpen(false);
  }, []);

  return { open, openRef, bind, openShelf, toggle, close, canOpen };
}
