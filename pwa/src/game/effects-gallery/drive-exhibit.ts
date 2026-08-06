// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// ONE DRIVE-SHELF EXHIBIT, RUNNING AS A REAL ROAD — the gallery's second host.
//
// WHY THERE ARE TWO. `run-exhibit.ts` stands a `GameState` up: `createGame`,
// `applyScenario`, `step()`, and the show fired into the run's own event stream.
// A drive has none of that — no `GameState`, no level, no `step`, its own clock
// (`DriveState.ms`) and its own event type (`DriveEvent`) — so the road gets a
// host of its own rather than a special case bolted into that one. What the two
// share is the CONTRACT (`ExhibitRun`) and nothing else, which is why the
// gallery's chrome, its keys and the contact-sheet script never learn that this
// shelf exists.
//
// IT IS THE REAL MINIGAME, not a diorama of one. `createDrive` builds the road,
// `stepDrive` ticks it at the shipped 16 ms, and every collision is drained
// through the SAME `drainDrive` the minigame's own screen uses (`loop.ts`) and
// drawn with the same `drawDrive` + `drawDriveFx`. Nothing here decides what a
// hit looks or sounds like; it only decides what is standing in front of the
// bumper, which is the one thing the road cannot be asked to arrange on cue.
//
// THE CAMERA STOPS WHERE THE COLLISION DID, and that is the one thing this host
// does differently from the screen — for a reason that is only obvious once you
// have watched it not do it. Everything a collision leaves behind is anchored to
// the ROAD: the gore, the grit, the sparks, the shards, the smoke off a dead
// engine. The shipped camera rides a fixed lead ahead of the car, so at 624 px/s
// the whole aftermath is off the left edge about two hundred milliseconds after
// the hit — correct in play (you drove past it) and useless in a display case,
// where a three-second show of a body coming apart was two frames of gore and
// then an empty road.
//
// So the take FOLLOWS the car up to its collision and HOLDS from there, which is
// what "a fixed camera" means for a road: the car goes on and out of frame, the
// wreckage stays in it. It is done by shifting the shipped `driveCamera` rather
// than by writing a second one, so the framing, the lead and the pinned road
// centre are all still the game's own. The one exhibit with no collision in it
// (the ride) never holds — following the car IS its subject.
//
// SLOW MOTION SCALES THE STEP COUNT, never the step. A drive's physics is
// fixed-step; feeding it a smaller `dtMs` would change the sum rather than the
// speed of it. So the loop banks scaled wall-clock time and pays it out in whole
// 16 ms ticks — at an eighth speed the road simply gets an eighth as many, and
// the sparks, the gore, the shake and the show's own rhythm all stretch together
// because every one of them is measured on `DriveState.ms`.

import {
  createDrive,
  error,
  stepDrive,
  DRIVE,
  type DriveInput,
  type DriveParams,
  type DriveState,
} from "@game/core";

import { describeError } from "@ui/lib/describe-error.ts";
import { startGameLoop } from "@ui/lib/game-loop.ts";

import { type GameAssets } from "../assets.ts";
import {
  clearDriveFx,
  createDriveFx,
  drawDriveFx,
  shakeCamera,
  stepDriveFx,
} from "../drive-screen/drive-fx.ts";
import {
  createEngineNote,
  drainDrive,
  drawBursts,
  runEngineNote,
  type Burst,
} from "../drive-screen/loop.ts";
import { drawDrive, driveCamera } from "../drive-screen/render.ts";
import { viewScaleFor } from "../render/view.ts";
import type { DriveExhibit, ExhibitRun } from "./exhibit-kit.ts";

/** The drive's own fixed step (ms) — the engine's, so an exhibit ticks at the
 * rate a played road does and shows the same physics. */
const STEP_MS = 16;
/** The most catch-up a single frame may do, so a backgrounded tab does not
 * resolve four seconds of collisions in one go. */
const MAX_CATCHUP_MS = 100;
/** Default show length for an exhibit that names none. */
const DEFAULT_SHOW_MS = 2000;
/** The quiet beat between a show ENDING and the loop running it again — the
 * run-hosted shelves' own figure, so browsing from one shelf to the other does
 * not change the gallery's rhythm under the viewer. */
const REPLAY_GAP_MS = 1000;
/** The gallery's fixed seed: every exhibit stages identically each visit, so a
 * look judged today is the same look tomorrow. */
const SEED = 20250725;
/** Where the road is driven TO. Never reached — the course is a minute long and
 * a show is a couple of seconds — but a drive is built from whole parameters,
 * so it has to be a real level. */
const DESTINATION = "goodco_hq";

/** Flat out, straight ahead — what is held on the wheel unless an exhibit says
 * otherwise. */
const FLAT_OUT: DriveInput = { pedal: 1, wheel: 0 };

export function runDriveExhibit(deps: {
  exhibit: DriveExhibit;
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  assets: GameAssets;
  /** Slow motion for judging a collision (see `EXHIBIT_SPEEDS`). Default 1. */
  speed?: number;
}): ExhibitRun {
  const { exhibit, canvas, ctx, assets } = deps;
  // Live, so changing the speed keeps the road exactly where it is instead of
  // restarting the show under the viewer.
  let speed = deps.speed ?? 1;
  const input = exhibit.input ?? FLAT_OUT;
  const params: DriveParams = {
    seed: SEED,
    direction: exhibit.direction ?? 1,
    difficulty: exhibit.difficulty ?? "medium",
    to: DESTINATION,
    // The gallery stands OUTSIDE the player's gore gate, exactly as every other
    // gore exhibit in it does: what a body coming apart at 120 looks like is
    // half of what this shelf is for.
    gib: exhibit.gib ?? true,
  };
  const showMs = exhibit.showMs ?? DEFAULT_SHOW_MS;

  let bursts: Burst[] = [];
  const fx = createDriveFx();
  const engine = createEngineNote();
  /**
   * Where the car was when this take's collision landed, or null while the take
   * is still following it. The camera is shifted back by however far the car has
   * come since (see the header), so the wreckage stays in frame while the car
   * that made it carries on out of it.
   */
  let holdAtX: number | null = null;

  /**
   * Lay a fresh road and plant the exhibit's collision on it.
   *
   * A drive is REBUILT rather than re-staged, and that is not laziness: the car
   * has moved, its panels are bent, its bumper is somewhere behind it and its
   * engine may be dead. There is no `applyScenario` for a road, and there should
   * not be — `createDrive` from the same seed IS the re-stage, and it is exact.
   */
  const build = (): DriveState => {
    const drive = createDrive(params);
    exhibit.road?.(drive);
    bursts = [];
    clearDriveFx(fx);
    engine.dueMs = 0;
    engine.gear = 0;
    holdAtX = null;
    return drive;
  };
  // Replaced outright on every take; every read below goes through this binding
  // so the loop picks the new road up on the next tick.
  let drive = build();
  // The loop's clock is the DRIVE's own, and it is re-read after each rebuild
  // (a fresh road starts at ms 0), so slow motion stretches the show, the beat
  // and the replay together.
  let nextTakeMs = showMs + REPLAY_GAP_MS;
  let replayPending = false;
  /** Wall-clock time banked but not yet paid out in whole 16 ms ticks. */
  let owedMs = 0;

  // `?debug` handle on the road, mirroring the run-hosted host's `__gallery`:
  // the live drive and its replay. Read through a getter because a rebuild
  // replaces the object.
  if (new URLSearchParams(window.location.search).has("debug")) {
    (
      window as {
        __gallery?: {
          exhibit: DriveExhibit;
          drive: () => DriveState;
          replay: () => void;
        };
      }
    ).__gallery = {
      exhibit,
      drive: () => drive,
      replay: () => {
        replayPending = true;
      },
    };
  }

  const stop = startGameLoop({
    stepMs: STEP_MS,
    simulate(realDtMs) {
      if (replayPending || drive.ms >= nextTakeMs) {
        replayPending = false;
        drive = build();
        nextTakeMs = showMs + REPLAY_GAP_MS;
        owedMs = 0;
        return;
      }
      owedMs = Math.min(MAX_CATCHUP_MS, owedMs + realDtMs * speed);
      while (owedMs >= STEP_MS) {
        owedMs -= STEP_MS;
        stepDrive(drive, STEP_MS, input);
        drainDrive(drive, bursts, fx);
        // The moment this exhibit's own collision lands, the camera stops here.
        // Latched off the car's position rather than the event's, so the shift
        // below is exactly "how far the car has come since" and the shipped
        // framing is preserved to the pixel.
        if (
          holdAtX === null &&
          exhibit.shows &&
          drive.events.some((event) => event.type === exhibit.shows)
        ) {
          holdAtX = drive.car.pos.x;
        }
        // THE FX AGE ON THE DRIVE'S OWN CLOCK, inside the fixed step — the same
        // rule the screen obeys, and what makes an eighth-speed take stretch a
        // spark shower rather than fast-forwarding through it.
        stepDriveFx(fx, STEP_MS, drive.ms);
        if (exhibit.engine) runEngineNote(drive, engine);
      }
      // NO TERMINAL BEATS. A breakdown does not restart the road and an arrival
      // hands nothing on — those are the SCREEN's policy (`endDrive`), and here
      // the wreck is exactly what the exhibit came to show. The loop's own
      // re-stage above is what ends every take.
    },
    render() {
      // Sized to the device at the same integer scale tier the run uses, and
      // re-read every frame like the drive screen's own loop — the gallery has
      // no resize of its own to hook.
      const cssW = canvas.clientWidth;
      const cssH = canvas.clientHeight;
      const scale = viewScaleFor(cssW, cssH);
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = Math.round(cssW * dpr);
      const h = Math.round(cssH * dpr);
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
      const viewW = w / (scale * dpr);
      const viewH = h / (scale * dpr);
      ctx.setTransform(scale * dpr, 0, 0, scale * dpr, 0, 0);
      ctx.imageSmoothingEnabled = false;
      // THE CAMERA IS SHAKEN, NOT THE CONTEXT: the road, the gore and the sparks
      // all read the same camera, so the whole picture moves as one.
      const tracking = driveCamera(drive, viewW, viewH);
      const held =
        holdAtX === null
          ? tracking
          : { x: tracking.x + (holdAtX - drive.car.pos.x), y: tracking.y };
      const camera = shakeCamera(
        fx,
        held,
        drive.ms,
        // THE TREMBLE IS THE RIDE'S, not the frame's, so it is read off the car
        // even after the camera has stopped chasing it — a held camera watching
        // a wreck coast to a halt still shudders with what the wreck is doing.
        Math.abs(drive.car.speed) / DRIVE.topSpeedPx,
      );
      // EVERY CLOCK HANDED DOWN IS THE DRIVE'S, including the walk cycle's:
      // the wall clock would leave the crowd striding on through a show being
      // watched at an eighth speed.
      drawDrive(ctx, drive, camera, assets.sprites, viewW, viewH, drive.ms);
      bursts = drawBursts(ctx, bursts, camera, drive.ms, assets.sprites);
      drawDriveFx(ctx, fx, camera, drive.ms, viewW, viewH, drive.car.pos);
    },
    onError: (err, phase) => {
      error(`drive exhibit ${phase} failed: ${describeError(err)}`);
    },
  });

  return {
    setSpeed: (next: number) => {
      speed = next > 0 ? next : 1;
    },
    replay: () => {
      replayPending = true;
    },
    stop,
  };
}
