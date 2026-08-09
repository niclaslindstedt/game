// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// ONE SCENES-SHELF EXHIBIT, RUNNING AS A REAL CUTSCENE — the gallery's third
// host.
//
// WHY THERE ARE THREE. `run-exhibit.ts` stands a `GameState` up and fires an
// effect into it; `drive-exhibit.ts` builds a road and drives into something. A
// cutscene is neither: no run, no level, no horde, no road — a `CutsceneState`
// on its own clock, stepped by `stepCutscene` and DRAWN BY A COMPONENT rather
// than into the gallery's canvas (`CutsceneOverlay` owns a canvas of its own,
// because the scene stage is a fixed 224×126 letterbox scaled to the viewport
// and the dialogue box over it is DOM). So the road's lesson applies again: a
// third host answering the same `ExhibitRun` contract, and the gallery's chrome,
// its keys, its slow-motion chip and the contact-sheet script go on not knowing
// how many kinds of exhibit there are.
//
// IT IS THE SHIPPED SCENE, not a diorama of one. `createCutscene` builds it from
// the compiled catalog with the run tags the exhibit carries, `stepCutscene`
// ticks it, and `CutsceneOverlay` draws it — the very three the game plays a
// prelude with. Nothing here decides what a scene looks like.
//
// THE ONE THING THIS HOST DOES THAT THE GAME DOES NOT IS READ. A text beat holds
// the frame for the PLAYER's tap, JRPG-style, and there is no player in a
// display case — left alone, every scene in the shelf would stop on its first
// caption and every contact sheet would be a picture of the same held line. So
// the host taps for them, after a dwell long enough to read the page
// (`READ_MS`), which is also what makes a scene loop like every other exhibit.

import {
  advanceCutsceneBeat,
  createCutscene,
  cutsceneDef,
  error,
  stepCutscene,
  type CutsceneState,
} from "@game/core";

import { describeError } from "@ui/lib/describe-error.ts";
import { startGameLoop } from "@ui/lib/game-loop.ts";

import type { CutsceneExhibit, ExhibitRun } from "./exhibit-kit.ts";

/**
 * How long a text beat is left up before the host turns it (ms).
 *
 * Sized to READING rather than to the loop: a page is at most three rows of the
 * narrowest box the game supports (the story schema's own budget), the letters
 * print at the dialogue crawl's rate, and this has to outlast both or the shelf
 * shows half-typed lines. It is SIM time, so slow motion stretches it with
 * everything else.
 */
const READ_MS = 2600;

/** The quiet beat between a scene ending and the host playing it again — the
 * other two hosts' own figure, so browsing from one shelf to another does not
 * change the gallery's rhythm under the viewer. */
const REPLAY_GAP_MS = 1000;

/** The most catch-up one frame may do (ms), so a backgrounded tab does not
 * resolve a whole scene in a single step. */
const MAX_CATCHUP_MS = 100;

export function runCutsceneExhibit(deps: {
  exhibit: CutsceneExhibit;
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  /** Slow motion (see `EXHIBIT_SPEEDS`). Default 1. */
  speed?: number;
  /**
   * THE LIVE SCENE, handed up for the gallery to mount `CutsceneOverlay`
   * against — the peer of the road host's `onDials` and the UI shelf's
   * `onState`, and for the same reason: the drawing is React's and the clock is
   * this loop's. Published once per take rather than per frame; the overlay
   * watches the object it was given mutate, exactly as it does in a real run.
   */
  onScene: (scene: CutsceneState | null) => void;
}): ExhibitRun {
  const { exhibit, canvas, ctx, onScene } = deps;
  let speed = deps.speed ?? 1;
  const def = cutsceneDef(exhibit.sceneId);
  const readMs = exhibit.readMs ?? READ_MS;

  /** How long the beat on screen has been up — the dwell a held text beat is
   * turned after. Reset by every beat change, including the ones the scene
   * turns itself. */
  let beatMs = 0;
  let atBeat = -1;
  /** Sim ms since the scene ended, or null while it is still playing. */
  let overMs: number | null = null;
  let replayPending = false;
  let owedMs = 0;

  /**
   * A FRESH SCENE, from the catalog and the exhibit's own run tags.
   *
   * REBUILT rather than re-staged, like the road and for the same reason: there
   * is no `applyScenario` for a cutscene and there should not be —
   * `createCutscene` from the same def and the same tags IS the re-stage, and
   * it is exact.
   */
  const build = (): CutsceneState => {
    beatMs = 0;
    atBeat = -1;
    overMs = null;
    const fresh = createCutscene(def, exhibit.tags ?? []);
    onScene(fresh);
    return fresh;
  };
  let scene = build();

  // `?debug` handle, mirroring the other two hosts' `__gallery`. The scene is
  // read through a getter because a replay replaces the object.
  if (new URLSearchParams(window.location.search).has("debug")) {
    (
      window as {
        __gallery?: {
          exhibit: CutsceneExhibit;
          scene: () => CutsceneState;
          replay: () => void;
        };
      }
    ).__gallery = {
      exhibit,
      scene: () => scene,
      replay: () => {
        replayPending = true;
      },
    };
  }

  const stop = startGameLoop({
    simulate(realDtMs) {
      if (replayPending) {
        replayPending = false;
        scene = build();
        owedMs = 0;
        return;
      }
      owedMs = Math.min(MAX_CATCHUP_MS, owedMs + realDtMs * speed);
      const dtMs = owedMs;
      owedMs = 0;
      if (overMs !== null) {
        overMs += dtMs;
        if (overMs >= REPLAY_GAP_MS) scene = build();
        return;
      }
      stepCutscene(scene, def, dtMs);
      // THE DWELL IS PER BEAT, and it is measured on the beat INDEX rather than
      // on `beatMs` inside the scene: a timed beat runs its own clock down and
      // hands over by itself, so what this needs to know is only "has the beat
      // on screen changed", which is true for both kinds.
      if (scene.beat !== atBeat) {
        atBeat = scene.beat;
        beatMs = 0;
      } else {
        beatMs += dtMs;
        // A text beat is the only one that can still be up after its dwell —
        // everything else has already moved on — so this needs no test for the
        // kind. Turning a beat that was going to turn anyway is a no-op.
        if (beatMs >= readMs) advanceCutsceneBeat(scene, def);
      }
      if (scene.done) overMs = 0;
    },
    render() {
      // NOTHING IS DRAWN HERE, and the canvas is CLEARED rather than left: the
      // scene is drawn by `CutsceneOverlay` over the top of this one, and the
      // exhibit browsed away from painted its last frame into it. Left alone,
      // a run-hosted diorama sits frozen behind every scene in this shelf.
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = Math.round(canvas.clientWidth * dpr);
      const h = Math.round(canvas.clientHeight * dpr);
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    },
    onError: (err, phase) => {
      error(`cutscene exhibit ${phase} failed: ${describeError(err)}`);
    },
  });

  return {
    setSpeed: (next: number) => {
      speed = next > 0 ? next : 1;
    },
    replay: () => {
      replayPending = true;
    },
    stop: () => {
      stop();
      onScene(null);
    },
  };
}
