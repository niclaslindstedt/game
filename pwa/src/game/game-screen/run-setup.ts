// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Building one run's engine state: the seed and dev URL overrides, the
// resume/checkpoint/fresh-createGame decision, the BOT VIEW arrival hero,
// the `?scenario=` mutation, the per-character story ledger seeding, the
// opening-skip + music arming branches, the autoplay bot, the fast-forward
// speed, and the `?debug` window hooks. GameScreen calls createRunSession
// once per run effect and wires the result into the loop.

import type { MutableRefObject } from "react";

import {
  applyScenario,
  autofillSpellSlots,
  BOT_PROFILES,
  BOT_STRATEGIES,
  createBot,
  createGame,
  debug,
  dismissIntro,
  levelDef,
  LEVELS,
  markThoughtsSeen,
  muteDialogue,
  recomputeMaxMana,
  setSpellSlot,
  skipCutscene,
  skipStoryOpening,
  warn,
  type Bot,
  type BotProfile,
  type BotStrategy,
  type Difficulty,
  type GameState,
  type ScenarioSpec,
} from "@game/core";

import { botViewSpec } from "../bot-view-specs.ts";
import { cloneGameState } from "../checkpoint.ts";
import {
  clearedLevelsFor,
  hasMetMerchant,
  hasSeenOpening,
  seenThoughts,
  type Character,
} from "../characters.ts";
import { DEMO_BOT_SPEC, DEMO_GAME_SPEED } from "../demo.ts";
import { pauseMusic, playLevelMusic } from "../music/index.ts";
import { buildBotViewLoadout } from "../seed-characters.ts";
import { getSettings } from "../settings.ts";
import type { PlayerAction } from "../render.ts";
import type { RunCheckpoint } from "./run-progress.ts";

// Fast-forward ceiling: the most the `?speed=` param / `__speed` debug hook may
// crank the sim clock. High enough to blitz a bot playtest, capped so a single
// frame's step burst stays bounded (the game loop's own maxStepsPerFrame is the
// hard backstop).
const MAX_SIM_SPEED = 16;

/** A pinned weapon pose (?debug `window.__swing`) — see the weapon-swing dev
 * script and the `weapon-system` skill. */
export type DebugPose = {
  kind: PlayerAction["kind"];
  weaponClass: PlayerAction["weaponClass"];
  t: number;
  arc?: number;
  range?: number;
} | null;

declare global {
  interface Window {
    /** ?debug hook: pin the held weapon to a fixed swing fraction. */
    __swing?: (o: DebugPose) => void;
    /** ?debug hook: fast-forward the sim N× (clamped to MAX_SIM_SPEED). */
    __speed?: (f: number) => void;
    /** ?debug hook: slow-motion — scale the sim clock (0.1 = tenth speed). */
    __timeScale?: (f: number) => void;
    /** ?debug hook: unlock, slot, and fire the named spell for FX review. */
    __cast?: (id: string) => void;
    /** ?debug hook: detonate the screen-clearing NUKE's FX at the hero. */
    __nuke?: () => void;
  }
}

/** The run's live speed/pose tuning, mutated by the `?debug` window hooks
 * (`__speed`, `__timeScale`, `__swing`) and read by the loop each frame. */
export type RunTuning = {
  /** FAST-FORWARD: run the whole run N× faster by simulating more fixed
   * steps per frame — genuinely advancing the game quicker, deterministic. */
  simSpeed: number;
  /** Slow-motion: scales the step SIZE (0.1 = tenth speed) for animation
   * tuning — the OPPOSITE of fast-forward. A neutral 1 in normal play. */
  timeScale: number;
  /** A pinned swing/shot pose overriding the live hero action, or null. */
  debugPose: DebugPose;
  /** Latched by the `?debug` `window.__nuke()` hook; the loop injects one
   * screen-clearer `nuke` event post-step, then clears it. */
  nukePending: boolean;
};

export type RunSession = {
  state: GameState;
  /** The level this run actually plays (after the `?level=` dev override). */
  runLevelId: string;
  /** True when this mount adopted a run parked in memory (menu CONTINUE). */
  resumed: boolean;
  /** Whether this mount should capture the combat-start retry checkpoint (a
   * run started from scratch — not resumed, not adopted from a checkpoint). */
  captureCheckpoint: boolean;
  /** The developer BOT VIEW / `?bot=` playtest bot, or null. */
  bot: Bot | null;
  tuning: RunTuning;
  /** Dismiss the level intro and roll the level theme — the run's opener,
   * shared by the title card, the keyboard advance, and the bot. */
  beginRun: () => void;
  seed: number;
};

export function createRunSession(deps: {
  levelId: string;
  difficulty: Difficulty;
  characterRef: MutableRefObject<Character>;
  /** The parked engine state to adopt on this mount, consumed here. */
  resumeRef: MutableRefObject<GameState | null>;
  checkpointRef: MutableRefObject<RunCheckpoint | null>;
  botView: boolean;
  demo: boolean;
  /** Warp-in (the title moon's long-press): skip the whole opening. */
  skipOpening: boolean;
  runId: number;
  /** Which spell-bar slot to cast (the `__cast` debug hook fires through the
   * same queue a tapped slot uses). */
  castSpellIndexRef: MutableRefObject<number | null>;
}): RunSession {
  const {
    levelId,
    difficulty,
    characterRef,
    resumeRef,
    checkpointRef,
    botView,
    demo,
    skipOpening,
    runId,
    castSpellIndexRef,
  } = deps;

  // Dev/playtest handles: `?seed=` pins the run's layout, `?level=` jumps
  // to any catalog level (see docs/configuration.md).
  const params = new URLSearchParams(window.location.search);
  const seedParam = Number(params.get("seed"));
  const seed =
    Number.isInteger(seedParam) && seedParam > 0
      ? seedParam & 0x7fffffff
      : Date.now() & 0x7fffffff;
  // `?level=` is a dev override that jumps to any catalog level and bypasses
  // the campaign unlock gate; otherwise the run starts on the picked level.
  const levelParam = params.get("level");
  const devLevel = levelParam && levelParam in LEVELS ? levelParam : null;
  const runLevelId = devLevel ?? levelId;
  // Resuming a run parked in memory (exited to the menu from the pause
  // screen): adopt the frozen engine state as-is. Consumed once — a RETRY /
  // NEXT LEVEL later in this mount falls back to a fresh createGame.
  const resumed = resumeRef.current;
  resumeRef.current = null;
  // A retry checkpoint captured for THIS level: RETRY after a death adopts a
  // fresh copy of it (combat-start of this level) rather than replaying the
  // whole opening. Only consulted when not resuming a parked run from the
  // menu; a checkpoint for a different level (a stale one from before NEXT
  // LEVEL) does not apply and is left to be superseded.
  const checkpoint =
    !resumed && checkpointRef.current?.levelId === runLevelId
      ? checkpointRef.current.state
      : null;
  // The carry-over: the character's persistent build. The hero arrives with
  // the exact level, stats and items they carry right now — into any level,
  // any difficulty. A brand-new hero (no banked build yet) starts from the
  // authored fresh start (level 1, the difficulty's wall weapon).
  // BOT VIEW drops a REALISTIC arrival hero (leveled + rolled gear for this
  // map/difficulty) so the watched autopilot plays the level as an arriving
  // player would, not from the character's own build. The chosen BOT SPEC
  // (DEVELOPER → BOT VIEW → BOT SPEC) picks the whole showcase: the arrival
  // hero's weapon/gear lane here, and the bot's stat picks + posture below.
  // The demo pins the melee showcase; the developer BOT VIEW honours the
  // picked BOT SPEC.
  const botViewChoice = botView
    ? botViewSpec(demo ? DEMO_BOT_SPEC : getSettings().botViewSpec)
    : null;
  const botViewLoadout = botViewChoice
    ? buildBotViewLoadout(runLevelId, difficulty, botViewChoice.build)
    : null;
  const state =
    resumed ??
    (checkpoint
      ? cloneGameState(checkpoint)
      : createGame(
          seed,
          runLevelId,
          difficulty,
          botViewLoadout ?? characterRef.current.loadout ?? undefined,
          false,
          // Campaign progress the engine gates drops on (the bunker key
          // stays latent until Eastworld is cleared on this difficulty).
          clearedLevelsFor(characterRef.current, difficulty),
          // Met the trader here before? He's set up at the door from the
          // start, so a restart-after-death can walk over and repair.
          hasMetMerchant(characterRef.current, runLevelId, difficulty),
        ));
  // A run started from scratch (not resumed from the menu, not adopted from a
  // checkpoint that already froze it): capture the combat-start checkpoint
  // once this mount, superseding any stale one from an earlier level.
  const captureCheckpoint = !resumed && !checkpoint;
  // The per-character story ledger (characters.ts): has this hero already
  // watched this level's opening — and which inner monologues has he read —
  // on this difficulty? We die and replay a lot, so a witnessed opening is
  // skipped and already-read thoughts are pre-marked as seen. Seed the seen
  // thoughts into every rebuild (a fresh createGame OR a cloned checkpoint,
  // so a post-victory RETRY doesn't replay a late kill/sight beat either);
  // the opening itself is skipped below, once, for a fresh createGame.
  const openingSeen = hasSeenOpening(
    characterRef.current,
    runLevelId,
    difficulty,
  );
  markThoughtsSeen(state, seenThoughts(characterRef.current, difficulty));
  // `?scenario=<json>` (dev/test): mutate the fresh run into an exact
  // situation — position, hp, gear, spawns (see docs/configuration.md and
  // the test-scenario skill). Resumed/checkpointed runs already lived past
  // their opening, so the spec only applies to a run built from scratch.
  let scenarioApplied = false;
  const scenarioParam = params.get("scenario");
  if (scenarioParam && !resumed && !checkpoint) {
    try {
      applyScenario(state, JSON.parse(scenarioParam) as ScenarioSpec);
      scenarioApplied = true;
      debug(`scenario applied: ${scenarioParam}`);
    } catch {
      warn(`?scenario= is not valid JSON — ignored: ${scenarioParam}`);
    }
  }
  // A carried/derived caster may arrive with unlocked spells but a blank bar
  // (the loadout restores an empty bar) — drop his newest spells onto it so
  // the spell bar is never empty when spells are available. Manual clears and
  // later unlocks are handled by the picker / the unlock modal.
  autofillSpellSlots(state);
  debug(`run ${runId} started (seed ${seed}, ${difficulty})`);

  // The run's music: the level theme rolls once the intro is dismissed and
  // stops for the end-of-run jingles (victory/defeat events).
  const beginRun = () => {
    dismissIntro(state);
    playLevelMusic(levelDef(state.level.id).music);
  };

  // In debug mode (?debug) the live state is reachable from the console /
  // automated playtests, and `__scenario(spec)` re-shapes the live run from
  // DevTools. See the debug-game and test-scenario skills.
  if (params.has("debug")) {
    const dev = window as {
      __game?: GameState;
      __scenario?: (spec: ScenarioSpec) => void;
    };
    dev.__game = state;
    dev.__scenario = (spec) => applyScenario(state, spec);
  }

  // Autoplay: the engine bot steers instead of the pointer and spends level-ups
  // itself. Turned on by DEVELOPER → BOT VIEW (the chosen BOT SPEC's posture +
  // stat lane) or the `?bot=<strategy>` URL param. An optional
  // ?botProfile=<build> (melee/ranged/magic/balanced/auto) commits the hero to a
  // stat-distribution build — a lane, or the even `balanced` spread. See the
  // playtest skill.
  const requested = params.get("bot");
  const requestedProfile = params.get("botProfile");
  const profile =
    requestedProfile && (BOT_PROFILES as string[]).includes(requestedProfile)
      ? (requestedProfile as BotProfile)
      : "meta";
  // BOT VIEW plays the picked spec (its posture + stat lane); a `?bot=` playtest
  // uses the requested strategy and ?botProfile.
  const bot = botViewChoice
    ? createBot(botViewChoice.strategy, botViewChoice.profile)
    : requested && (BOT_STRATEGIES as string[]).includes(requested)
      ? createBot(requested as BotStrategy, profile)
      : null;

  // Autoplay mutes the in-world dialogue: with the engine bot steering there
  // is nobody to read (or tap through) the arrival scenes, last words,
  // thoughts, lore, companion joins and merchant greeting — un-muted they'd
  // freeze the run in the `dialogue` phase and flash one page per tick as the
  // bot clicks through them. Muting latches `state.dialogueMuted` so those
  // scenes never enter the stage at all (BOT VIEW and the `?bot=` playtests
  // watch the fight, not the story).
  if (bot) muteDialogue(state);

  if (resumed) {
    // Back from the menu: the run was frozen on the pause screen and the
    // menu played the title theme over it. Re-arm this level's theme but
    // keep it paused, so the player lands on the same PAUSED overlay and one
    // tap resumes both the sim and the music in place.
    playLevelMusic(levelDef(state.level.id).music);
    pauseMusic();
  } else if (checkpoint) {
    // Straight back into the fight: the checkpoint is already in the
    // `playing` phase, past the prelude and intro, so just roll the level
    // theme — no cutscene, no monologue, no scripted strike to sit through.
    playLevelMusic(levelDef(state.level.id).music);
  } else if (scenarioApplied && state.phase === "playing") {
    // A scenario that skipped the opening starts mid-run by construction:
    // roll the level theme, nothing left to dismiss.
    playLevelMusic(levelDef(state.level.id).music);
  } else if (skipOpening) {
    // Warp-in from the title moon's long-press: bail the whole opening and
    // drop straight into play. skipCutscene lands the prelude on the level
    // `title` card, then beginRun's dismissIntro carries it into `playing` —
    // the same shortcut the keyboard and headless bot use, done up front.
    if (state.phase === "cutscene") skipCutscene(state);
    beginRun();
  } else if (openingSeen) {
    // Already watched this level's opening on this difficulty (a die-and-retry
    // loop): skip the prelude, the intro monologue and the scripted opening
    // strike, arming the hero, and roll the level theme straight away — the
    // level music beginRun would start, minus the story it would sit through.
    skipStoryOpening(state);
    playLevelMusic(levelDef(state.level.id).music);
  }

  // FAST-FORWARD: `?speed=<n>` (or the ?debug `window.__speed(n)`) runs the
  // whole run N× faster by simulating more fixed steps per frame — genuinely
  // advancing the game quicker, so a `?bot=` playtest clears a level in a
  // fraction of the wall-clock time. This is the OPPOSITE of `__timeScale`:
  // fast-forward runs MORE steps at the same step size (deterministic — a
  // fast-forwarded bot run is identical to a real-time one), while
  // `__timeScale` slows by scaling the step SIZE. Clamped to [1, MAX_SIM_SPEED].
  //
  // The BASE speed is the player's persisted GAME SPEED choice (SETTINGS →
  // GAME SPEED, chosen before the run). An automated bot playtest can OVERRIDE
  // it higher via `?speed=` (and `__speed` retunes live). See
  // docs/configuration.md.
  // The demo always runs real-time so it reads as play; the developer BOT
  // VIEW honours the picked GAME SPEED fast-forward.
  const tuning: RunTuning = {
    simSpeed: demo
      ? DEMO_GAME_SPEED
      : Math.min(getSettings().gameSpeed, MAX_SIM_SPEED),
    timeScale: 1,
    debugPose: null,
    nukePending: false,
  };
  const speedParam = Number(params.get("speed"));
  if (Number.isFinite(speedParam) && speedParam > 1) {
    tuning.simSpeed = Math.min(speedParam, MAX_SIM_SPEED);
  }
  if (params.has("debug")) {
    // Weapon-swing tuning hook: `window.__swing({kind, weaponClass, t})` PINS
    // the held weapon to a fixed fraction `t` (0..1) of its swing arc so a
    // screenshot can sample the animation frame by frame; `null` clears it
    // and hands the weapon back to the live attack. For a melee swing, passing
    // `arc` (the weapon's cone, rad) and `range` (its reach, world px) shapes
    // the blade's sweep AND draws the matching slash cone pinned at the same
    // fraction. Paired with the `weapon-swing` dev script — see the
    // `weapon-system` skill and docs/configuration.md.
    window.__swing = (o) => {
      tuning.debugPose = o;
    };
    window.__speed = (f) => {
      tuning.simSpeed =
        Number.isFinite(f) && f >= 1 ? Math.min(f, MAX_SIM_SPEED) : 1;
    };
    // Slow-motion tuning hook: `window.__timeScale(f)` scales the simulation
    // clock — 0.1 runs the whole run (steering, swings, slash cones, muzzle
    // flashes, mob motion) at a tenth speed so a fast animation can be
    // eyeballed or screenshotted frame by frame, 1 restores real time. It
    // slows the SIM, not the render, so it costs nothing and stays
    // deterministic. See the `weapon-system` skill and docs/configuration.md.
    window.__timeScale = (f) => {
      tuning.timeScale = Number.isFinite(f) && f > 0 ? f : 1;
    };
    // Spell-cast tuning hook: `window.__cast(spellId)` makes the hero
    // a caster who unlocks and affords the named spell, drops it in slot 0,
    // and fires it — so the element-tinted cast FX (spell-fx.ts) can be
    // eyeballed or screenshotted (pair with __scenario to stage a target and
    // __timeScale to slow it). Drives the `spell-preview` dev script. See the
    // `spell-fx` skill and docs/configuration.md.
    window.__cast = (id) => {
      state.player.stats.intelligence = Math.max(
        state.player.stats.intelligence,
        260,
      );
      recomputeMaxMana(state);
      state.player.mana = state.player.maxMana;
      state.player.spellCooldowns = {};
      // Clear both cooldowns and the queue so a preview cast always fires this
      // instant, no matter how recently the last one went off.
      state.player.globalCooldownMs = 0;
      state.player.spellQueue = [];
      setSpellSlot(state, 0, id);
      castSpellIndexRef.current = 0;
    };
    // Nuke FX tuning hook: `window.__nuke()` sets off a real screen-nuke at the
    // hero WITHOUT the rare pickup — the canvas shockwave/embers/scorch, the
    // full-screen CSS flash/fire/smoke overlay (createNukeFx), AND the caught
    // mobs burning up into smoking charred skeletons — so the whole detonation
    // can be eyeballed or screenshotted (pair with __timeScale to slow it). The
    // loop runs the detonation post-step (see GameScreen). Drives the
    // `nuke-preview` dev script. See the `visual-effects` skill and
    // docs/configuration.md.
    window.__nuke = () => {
      tuning.nukePending = true;
    };
  }

  return {
    state,
    runLevelId,
    resumed: resumed !== null,
    captureCheckpoint,
    bot,
    tuning,
    beginRun,
    seed,
  };
}
