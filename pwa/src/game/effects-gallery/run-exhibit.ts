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

import type { RefObject } from "react";

import {
  applyScenario,
  createGame,
  step,
  type GameEvent,
  type GameInput,
  type GameState,
} from "@game/core";

import { startGameLoop } from "@ui/lib/game-loop.ts";

import { type GameAssets } from "../assets.ts";
import { synth } from "../audio.ts";
import { applyEventFx, expireEffects } from "../game-screen/event-fx.ts";
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

export type ExhibitRun = {
  /** Re-stage the diorama and run the show again right now, restarting the loop
   * from here (PLAY, or a tap on the field). For an always-on exhibit (a
   * talent's conjurations, a running powerup) the re-stage IS the show: the aura
   * is back at full strength. */
  replay: () => void;
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
  /** Called on every firing (the loop's and `replay`'s alike), so the screen can
   * stand its PLAY button down while the show is actually running. */
  onFire?: () => void;
}): ExhibitRun {
  const { exhibit, canvas, ctx, assets, nukeFxRef, levelUpFxRef, onFire } =
    deps;
  const spec = stageSpec(exhibit);
  const levelId = exhibit.levelId ?? "spacez_hq";
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
          replay: () => void;
        };
      }
    ).__gallery = {
      exhibit,
      state: () => state,
      replay: () => {
        firePending = true;
      },
    };
  }

  const fire = () => {
    const mobs = sortedMobs(state);
    exhibit.fire?.({
      state,
      emit: (event: GameEvent) => state.events.push(event),
      kill: () => {
        const mob = sortedMobs(state)[0];
        if (!mob) return null;
        state.enemies = state.enemies.filter((e) => e.id !== mob.id);
        return mob;
      },
      mobs,
    });
    onFire?.();
  };

  // Backing store in world units (1 canvas px = 1 world unit); CSS upscales it
  // pixelated at the view scale, phone baseline doubled on large viewports —
  // the same sizing GameScreen uses, so the gallery frames the effect exactly
  // as the game does.
  const cssToWorld = { x: 1, y: 1 };
  const resize = () => {
    const scale = viewScaleFor(window.innerWidth, window.innerHeight);
    canvas.width = Math.max(1, Math.ceil(canvas.clientWidth / scale));
    canvas.height = Math.max(1, Math.ceil(canvas.clientHeight / scale));
    cssToWorld.x = canvas.width / Math.max(1, canvas.clientWidth);
    cssToWorld.y = canvas.height / Math.max(1, canvas.clientHeight);
  };
  const observer = new ResizeObserver(resize);
  observer.observe(canvas);
  resize();

  const stop = startGameLoop({
    simulate(dtMs) {
      // Hand the engine the camera rect it reports to state-readers.
      const camera = computeCamera(state, canvas.width, canvas.height);
      input.view = {
        x: camera.x,
        y: camera.y,
        width: canvas.width,
        height: canvas.height,
      };
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

      playEventSounds(synth, state.events);
      const fxCtx = {
        state,
        shared,
        // No pack-XP merge pass and no signature gore inference here: an
        // exhibit that wants either emits it as part of its own show.
        mergedKills: new Set<GameEvent>(),
        heroGore: null,
        pushPickup: () => {},
        showPickupCard: () => {},
      };
      for (const event of state.events) {
        applyEventFx(event, fxCtx);
        // The screen-space halves of the two big spectacles, centred on their
        // world point exactly as GameScreen centres them.
        if (event.type === "nuke") {
          const rect = canvas.getBoundingClientRect();
          nukeFx.fire(
            rect.left + (event.pos.x - camera.x) / cssToWorld.x,
            rect.top + (event.pos.y - camera.y) / cssToWorld.y,
          );
        }
        if (event.type === "levelUp") {
          const rect = canvas.getBoundingClientRect();
          levelUpFx.fire(
            rect.left + (state.player.pos.x - camera.x) / cssToWorld.x,
            rect.top + (state.player.pos.y - camera.y) / cssToWorld.y,
            levelUpIntensity(event.level),
          );
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
  });

  return {
    replay: () => {
      firePending = true;
    },
    stop: () => {
      stop();
      observer.disconnect();
      nukeFx.dispose();
      levelUpFx.dispose();
    },
  };
}
