// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// One EFFECTS GALLERY exhibit, running as a real game. This is a miniature of
// GameScreen's loop: build an engine state, stage it into the exhibit's
// situation (`applyScenario`), step it every frame, and run the tick's events
// through the SAME consumers a real run uses — `applyEventFx` for the canvas
// effects, `createNukeFx`/`createLevelUpFx` for the full-screen CSS bursts, and
// `playEventSounds` for the audio. Then draw the world with `drawFrame` and the
// effect layer with `drawEffects`.
//
// What it deliberately drops: no player input, no HUD, no bot, no progress
// banking, no achievements, no music. The exhibit is a diorama — the hero stands
// still, the horde is POSED (`freeze`), and the only thing that ever happens on
// screen is the effect under inspection. It plays on arrival and then LOOPS: the
// show runs, a beat of quiet follows so the aftermath settles and the eye
// resets, and it runs again. PLAY (or a tap on the field) restarts it early.

import { localHero } from "../local-seat.ts";
import type { RefObject } from "react";

import {
  applyScenario,
  createGame,
  enemyDef,
  enterBossDeath,
  error,
  step,
  type GameEvent,
  type GameInput,
  type GameState,
} from "@game/core";

import { describeError } from "@ui/lib/describe-error.ts";
import { startGameLoop } from "@ui/lib/game-loop.ts";

import { type GameAssets } from "../assets.ts";
import { synth } from "../audio.ts";
import { applyEventFx, expireEffects } from "../game-screen/event-fx.ts";
import { pinCleaveCut } from "../game-screen/gore-burst.ts";
import { pinEliteCaster } from "./exhibit-kit.ts";
import { createLevelUpFx } from "../game-screen/levelup-fx.ts";
import { createLoopShared } from "../game-screen/loop-shared.ts";
import { createNukeFx } from "../game-screen/nuke-fx.ts";
import { levelUpIntensity } from "../levelup-intensity.ts";
import {
  applyCameraShake,
  clearCameraShake,
  combatNoiseFade,
  computeCamera,
  drawEffects,
  drawFrame,
  effectsClockMs,
  viewScaleFor,
  worldToCanvas,
  worldViewRect,
  type Camera,
} from "../render.ts";
import { playEventSounds } from "../sfx/index.ts";
import { sortedMobs, stageSpec, type Exhibit } from "./exhibit-kit.ts";

/** A short beat between staging and the arrival firing, so the eye lands on the
 * diorama before the effect goes off. */
const OPENING_DELAY_MS = 400;
/** Default show length for an exhibit that names none (see `Exhibit.showMs`). */
const DEFAULT_SHOW_MS = 1400;
/** The quiet beat between a show ENDING and the loop running it again — long
 * enough that the replay reads as a fresh take rather than a stutter, short
 * enough that nobody waits for it. */
const REPLAY_GAP_MS = 1000;
/** The gallery's fixed seed: every exhibit stages identically each visit, so a
 * look judged today is the same look tomorrow. */
const SEED = 20250725;

/**
 * The phases a re-stage can't fix in place, so the diorama is rebuilt from
 * scratch instead: the run has ENDED (the death tableau's own exhibit lands
 * here, and so would anything unexpected that stops a run mid-gallery), or a
 * SCENE is playing and should replay from its first page rather than resume
 * mid-crawl. The panel phases (inventory, shop, map, the chooser…) are left
 * alone — an exhibit's `open` re-establishes those without the churn of a
 * fresh `createGame` every few seconds.
 */
const REBUILD_PHASES = new Set([
  // A running DEATH RITE, like a death scene: a scenario can re-shape a live
  // run but it cannot rewind a scene that is mid-beat, so a replay takes a
  // fresh run rather than restaging underneath the finisher.
  "bossDeath",
  "dying",
  "defeat",
  "victory",
  "outro",
  "cutscene",
  "intro",
  "title",
  "dialogue",
  "choice",
]);

/**
 * The speeds the gallery can run an exhibit at — the FX iteration loop's
 * slow-motion. A burst that is over in 200 ms is impossible to JUDGE at full
 * speed (the eye gets a smear and an afterimage); at an eighth it plays as a
 * readable sequence of beats, which is what tells "the flash is too long" from
 * "the flash is the wrong colour". The slowdown scales SIM time, so every part
 * of an effect stretches together and the loop's own rhythm (show, beat, replay)
 * stretches with it. The screen-space CSS bursts (the nuke's flash, the ding's
 * god-rays) run on wall-clock animations and keep their real length — they are
 * the one thing slow motion cannot stretch.
 */
export const EXHIBIT_SPEEDS = [1, 0.5, 0.25, 0.125] as const;

export type ExhibitSpeed = (typeof EXHIBIT_SPEEDS)[number];

/** The label a speed wears in the gallery bar and in a screenshot's filename. */
export function speedLabel(speed: number): string {
  return speed === 1 ? "1X" : `1/${Math.round(1 / speed)}X`;
}

export type ExhibitRun = {
  /** Re-stage the diorama and run the show again right now, restarting the loop
   * from here (a tap on the field, or Enter). For an always-on exhibit (a
   * talent's conjurations, a running powerup) the re-stage IS the show: the aura
   * is back at full strength. */
  replay: () => void;
  /** Run the diorama at a fraction of real time (see `EXHIBIT_SPEEDS`). Takes
   * effect on the next tick; the show in progress simply keeps playing, slower.
   */
  setSpeed: (speed: number) => void;
  /** Tear the run down (loop, observer, FX timers). */
  stop: () => void;
};

export function runExhibit(deps: {
  exhibit: Exhibit;
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  assets: GameAssets;
  /** The full-screen CSS burst layers (the nuke's and the ding's). */
  nukeFxRef: RefObject<HTMLDivElement | null>;
  levelUpFxRef: RefObject<HTMLDivElement | null>;
  /** Slow motion for judging an effect (see `EXHIBIT_SPEEDS`). Default 1. */
  speed?: number;
}): ExhibitRun {
  const { exhibit, canvas, ctx, assets, nukeFxRef, levelUpFxRef } = deps;
  // Live, so changing the speed keeps the diorama exactly where it is instead
  // of restarting the show under the viewer.
  let speed = deps.speed ?? 1;
  const spec = stageSpec(exhibit);
  const levelId = exhibit.levelId ?? "goodco_hq";
  const build = () => createGame(SEED, levelId, "medium");
  // Replaced outright when an exhibit ENDS its run — see `stage()`. Every read
  // below goes through this binding, so the loop picks the new run up on the
  // next tick.
  let state = build();

  const shared = createLoopShared();
  const nukeFx = createNukeFx(nukeFxRef);
  const levelUpFx = createLevelUpFx(levelUpFxRef);
  const input: GameInput = {
    steering: false,
    target: { x: 0, y: 0 },
    jump: false,
    useItem: false,
  };
  // Where a WALKING exhibit's circle is centred — the hero's staged spot,
  // re-read on every re-stage so the lap never drifts off the diorama.
  const walkCentre = { x: 0, y: 0 };

  /**
   * Set (or re-set) the exhibit's stage. The whole diorama is one
   * `applyScenario` call — the fog lift, the dialogue mute and the
   * never-end-the-level latch are all scenario fields (see `STAGE_BASE`), so
   * this runner holds no display-case tricks of its own. Re-applied before
   * every replay, so an exhibit that consumes its own mobs always has a fresh
   * crowd: the spec's `clearEnemies` makes that a swap, not a pile-up.
   */
  const stage = () => {
    applyScenario(state, spec);
    // A scenario can re-shape a live run but it can't un-end one, and it can't
    // rewind a scene to its first page — so those phases get a fresh run.
    if (REBUILD_PHASES.has(state.phase)) {
      state = build();
      applyScenario(state, spec);
      shared.effects.length = 0;
      shared.heroAction = undefined;
      clearCameraShake(shared.cameraShake);
    }
    // A walking exhibit laps around wherever the staging just put him.
    walkCentre.x = localHero(state).pos.x;
    walkCentre.y = localHero(state).pos.y;
  };
  stage();

  // The loop's clock, on SIM time (so a backgrounded tab picks the rhythm back
  // up where it left off instead of firing a backlog): the arrival firing, then
  // one every show-plus-a-beat.
  const showMs = exhibit.showMs ?? DEFAULT_SHOW_MS;
  let nextFireMs = state.stats.timeMs + OPENING_DELAY_MS;
  // Latched by `replay()` (and by the arrival) and consumed POST-step, so the
  // events an exhibit pushes survive the next step's `state.events = []` and
  // flow through the consumers below exactly like the engine's own.
  let firePending = false;

  // `?debug` handle on the diorama, mirroring the run's own `window.__game`:
  // the live state, the exhibit it was staged from, and its replay. The state is
  // read through a getter because a rebuild replaces the object.
  if (new URLSearchParams(window.location.search).has("debug")) {
    (
      window as {
        __gallery?: {
          exhibit: Exhibit;
          state: () => GameState;
          /** The live transient EFFECT layer — what the diorama is actually
           * drawing this frame. The one thing `state` cannot answer: an effect
           * that was pushed but never drawn and an effect that was never
           * pushed look identical from the engine side. */
          effects: () => readonly unknown[];
          replay: () => void;
        };
      }
    ).__gallery = {
      exhibit,
      state: () => state,
      effects: () => shared.effects,
      replay: () => {
        firePending = true;
      },
    };
  }

  // An exhibit's LATER beats (`ctx.after`) — an effect that is a sequence, like
  // a jump's shove-off and the touchdown it ends in. Held on the SIM clock so
  // slow motion stretches the gap, and dropped on every re-stage so a pending
  // beat can never land in the middle of the next take.
  let beats: { atMs: number; run: () => void }[] = [];
  const fire = () => {
    const mobs = sortedMobs(state);
    beats = [];
    // THE CUT THIS EXHIBIT STAGES, pinned over the roll (see `Exhibit.cut`).
    // Set on every take rather than once at mount, because a re-stage has to
    // put it back, and dropped again when the gallery stops so it can never
    // reach a real run.
    pinCleaveCut(exhibit.cut ?? null);
    exhibit.fire?.({
      state,
      emit: (event: GameEvent) => state.events.push(event),
      kill: () => {
        const mob = sortedMobs(state)[0];
        if (!mob) return null;
        state.enemies = state.enemies.filter((e) => e.id !== mob.id);
        return mob;
      },
      fell: () => {
        const mob = sortedMobs(state)[0];
        if (!mob) return null;
        // Off the board first, exactly as `killEnemy` does it — the rite poses
        // the body from its own scene state, and a copy left standing in the
        // live list would be drawn beside the one being finished.
        state.enemies = state.enemies.filter((e) => e.id !== mob.id);
        enterBossDeath(state, mob, enemyDef(mob.defId).death);
        return mob;
      },
      mobs,
      after: (delayMs, run) =>
        beats.push({ atMs: state.stats.timeMs + delayMs, run }),
    });
  };

  // Backing store in world units (1 canvas px = 1 world unit); CSS upscales it
  // pixelated at the view scale, phone baseline doubled on large viewports —
  // the same sizing GameScreen uses, so the gallery frames the effect exactly
  // as the game does.
  // CSS px per canvas px, and the world→page conversion built on it. The world
  // half goes through the projection (render/tilt.ts) rather than a scale
  // factor, exactly as the run's own viewport does — a screen point is not two
  // independent axes once the camera is off square.
  let cssPerCanvasPx = 1;
  const toPage = (worldX: number, worldY: number, camera: Camera) => {
    const rect = canvas.getBoundingClientRect();
    const at = worldToCanvas(worldX, worldY, camera);
    return {
      x: rect.left + at.x * cssPerCanvasPx,
      y: rect.top + at.y * cssPerCanvasPx,
    };
  };
  const resize = () => {
    const scale = viewScaleFor(window.innerWidth, window.innerHeight);
    canvas.width = Math.max(1, Math.ceil(canvas.clientWidth / scale));
    canvas.height = Math.max(1, Math.ceil(canvas.clientHeight / scale));
    cssPerCanvasPx = Math.max(1, canvas.clientWidth) / canvas.width;
  };
  const observer = new ResizeObserver(resize);
  observer.observe(canvas);
  resize();

  const stop = startGameLoop({
    simulate(realDtMs) {
      // SLOW MOTION: the whole diorama — the sim, the effects' own timelines,
      // and the loop's show/replay rhythm — runs off this scaled tick, so an
      // effect stretches without any part of it drifting out of step.
      const dtMs = realDtMs * speed;
      // Hand the engine the camera rect it reports to state-readers.
      const camera = computeCamera(state, canvas.width, canvas.height);
      const worldRect = worldViewRect(canvas.width, canvas.height);
      input.view = {
        x: camera.x + worldRect.x,
        y: camera.y + worldRect.y,
        width: worldRect.width,
        height: worldRect.height,
      };
      // A WALKING exhibit steers the hero around a slow circle centred on where
      // he was staged, so a movement-driven power (the ION WAKE's burning
      // trail) has somewhere to be laid. Everything else stands still — the
      // diorama rule.
      if (exhibit.walk) {
        const { radius, periodMs } = exhibit.walk;
        const a = (state.stats.timeMs / periodMs) * Math.PI * 2;
        input.steering = true;
        input.target = {
          x: walkCentre.x + Math.cos(a) * radius,
          y: walkCentre.y + Math.sin(a) * radius * 0.6,
        };
      }
      step(state, input, dtMs);

      if (state.stats.timeMs >= nextFireMs) firePending = true;
      if (firePending) {
        firePending = false;
        // The next take lands a quiet beat after this one has finished playing.
        nextFireMs = state.stats.timeMs + showMs + REPLAY_GAP_MS;
        // Re-stage first, so every showing plays over a full diorama: the mobs
        // the last one consumed are back, and a lapsed powerup is running again.
        stage();
        fire();
      }
      // The show's later beats, due on the sim clock. Drained before the event
      // consumers below, so a beat's events reach them on this very tick.
      if (beats.length > 0) {
        const due = beats.filter((beat) => state.stats.timeMs >= beat.atMs);
        if (due.length > 0) {
          beats = beats.filter((beat) => state.stats.timeMs < beat.atMs);
          for (const beat of due) beat.run();
        }
      }

      playEventSounds(synth, state.events);
      const fxCtx = {
        state,
        shared,
        sprites: assets.sprites,
        // No pack-XP merge pass and no signature gore inference here: an
        // exhibit that wants either emits it as part of its own show.
        mergedKills: new Set<GameEvent>(),
        heroGore: null,
        pushPickup: () => {},
        showAreaCaption: () => {},
        showQuestFlash: () => {},
        showPickupCard: () => {},
      };
      for (const event of state.events) {
        applyEventFx(event, fxCtx);
        // The screen-space halves of the two big spectacles, centred on their
        // world point exactly as GameScreen centres them.
        if (event.type === "nuke") {
          const at = toPage(event.pos.x, event.pos.y, camera);
          nukeFx.fire(at.x, at.y);
        }
        if (event.type === "levelUp") {
          const at = toPage(
            localHero(state).pos.x,
            localHero(state).pos.y,
            camera,
          );
          levelUpFx.fire(at.x, at.y, levelUpIntensity(event.level));
        }
      }
      expireEffects(shared, state);
    },
    render(timeMs) {
      const camera = computeCamera(state, canvas.width, canvas.height, timeMs);
      applyCameraShake(camera, shared.cameraShake, state.stats.timeMs, timeMs);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      drawFrame(ctx, state, assets, camera, timeMs, shared.heroAction);
      drawEffects(
        ctx,
        shared.effects,
        camera,
        effectsClockMs(state),
        assets,
        combatNoiseFade(state),
      );
    },
    onError: (err, phase) => {
      error(`effects gallery ${phase} failed: ${describeError(err)}`);
    },
  });

  return {
    setSpeed: (next: number) => {
      speed = next > 0 ? next : 1;
    },
    replay: () => {
      firePending = true;
    },
    stop: () => {
      stop();
      observer.disconnect();
      nukeFx.dispose();
      levelUpFx.dispose();
      // Hand the roll back: a pinned cut is a staging device and must not
      // outlive the display case it was staged in.
      pinCleaveCut(null);
      // Cleared with the cleave pin and for the identical reason: a mob casting
      // in another mob's colours must never survive into a real run.
      pinEliteCaster(undefined);
    },
  };
}
