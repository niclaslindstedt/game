// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The playable screen: mounts the canvas, runs the fixed-timestep loop over
// the engine, feeds it pointer input per the player's control settings
// (touch: a virtual dpad anchored where the finger lands, taps jump —
// including a second finger while steering; mouse: hold- or cursor-steer,
// Space jumps; a powerup-dock slot tap, click, or E spends a banked ability,
// and dragging a slot clear of the dock discards it in a poof of smoke),
// plays event sounds, and overlays the DOM UI: the HUD (top vitals + XP strip
// + the hero-avatar inventory button, plus the bottom-corner powerup dock),
// the level intro text box, the level-up stat chooser, the Diablo-style
// inventory, and the end-of-run splash. One <GameScreen> mount = one session
// at the menu; one run = one `runId` (retry bumps it).
//
// This file is the ORCHESTRATOR: it owns the React state/refs and wires the
// run together. The working parts live in ./game-screen/ — run-setup builds
// the engine state, controls/player-input/bot-driver feed the sim, event-fx /
// run-progress / autopilot-director / bot-feedback react to engine events,
// render-frame draws and writes the per-frame DOM, and the JSX surfaces
// (PlayingHud, docks, SceneOverlays, EndSplash) render from the HUD snapshot.

import { useEffect, useRef, useState } from "react";

import {
  discardHeldAbility,
  dismissIntro,
  levelDef,
  openInventory,
  pauseGame,
  resumeGame,
  setSpellSlot,
  stayOnField,
  step,
  type Difficulty,
  type GameInput,
  type GameState,
} from "@game/core";

import { startGameLoop } from "@ui/lib/game-loop.ts";
import { useMediaQuery } from "@ui/lib/use-media-query.ts";

import { loadGameAssets, spriteCursor, type GameAssets } from "./assets.ts";
import {
  recordAchievementEvents,
  recordRunStarted,
  recordWornEquipment,
} from "./achievements.ts";
import { AchievementToast } from "./AchievementToast.tsx";
import { synth } from "./audio.ts";
import { AreaCaption } from "./AreaCaption.tsx";
import type { CutsceneReveal } from "./overlays/CutsceneOverlay.tsx";
import type { DialogueReveal } from "./overlays/DialogueOverlay.tsx";
import { playDamageHaptic } from "./haptics.ts";
import type { IntroReveal } from "./overlays/IntroOverlay.tsx";
import { bindingLabel } from "./keybindings.ts";
import { LoadingScreen } from "./LoadingScreen.tsx";
import {
  pauseMusic,
  playLevelMusic,
  resumeMusic,
  stopMusic,
} from "./music/index.ts";
import { PickupFeed, type PickupMessage } from "./PickupFeed.tsx";
import { PickupModal, type PickupCard } from "./PickupModal.tsx";
import {
  computeCamera,
  uiScaleFor,
  VIEW_SCALE,
  viewScaleFor,
} from "./render.ts";
import { getSettings } from "./settings.ts";
import { playEventSounds, playUiSound } from "./sfx/index.ts";
import { SpellBar } from "./SpellBar.tsx";
import { type Character } from "./characters.ts";
import {
  createAutopilotDirector,
  useAutopilotSession,
} from "./game-screen/autopilot-director.ts";
import {
  AutopilotHistoryModal,
  AutopilotPanel,
} from "./game-screen/AutopilotPanel.tsx";
import { createBotDriver } from "./game-screen/bot-driver.ts";
import { createBotFeedback, createTapFx } from "./game-screen/bot-feedback.ts";
import { ConsumableDock } from "./game-screen/ConsumableDock.tsx";
import { createControls } from "./game-screen/controls.ts";
import {
  createDemoDirector,
  useDemoState,
} from "./game-screen/demo-director.ts";
import { DefeatSplash, VictorySplash } from "./game-screen/EndSplash.tsx";
import {
  applyEventFx,
  expireEffects,
  heroGoreThisTick,
  mergePackKillXp,
  trackXpHeat,
} from "./game-screen/event-fx.ts";
import { HeroAvatar } from "./game-screen/HeroAvatar.tsx";
import { type Hud } from "./game-screen/hud-model.ts";
import { createLoopShared } from "./game-screen/loop-shared.ts";
import { RunPausedOverlay } from "./game-screen/PausedOverlays.tsx";
import {
  handleFieldTaps,
  readHumanInput,
  useInputQueues,
  type Viewport,
} from "./game-screen/player-input.ts";
import {
  createPickupCardQueue,
  createPickupFeed,
} from "./game-screen/pickup-ui.ts";
import { PlayingHud, type SpellStatus } from "./game-screen/PlayingHud.tsx";
import { PowerupDock } from "./game-screen/PowerupDock.tsx";
import {
  createRenderFrame,
  type AreaCaptionState,
} from "./game-screen/render-frame.ts";
import {
  createRunProgress,
  wornEquipment,
  type RunCheckpoint,
} from "./game-screen/run-progress.ts";
import { createRunSession } from "./game-screen/run-setup.ts";
import { SceneOverlays } from "./game-screen/SceneOverlays.tsx";
import { DemoChrome, ScreenChrome } from "./game-screen/ScreenChrome.tsx";
import { useAchievementToasts } from "./game-screen/use-achievement-toasts.ts";

export function GameScreen({
  character,
  difficulty,
  levelId: initialLevelId,
  onQuit,
  onExitToMenu,
  skipIntro: skipOpening = false,
  botView = false,
  demo = false,
  resume,
}: {
  /** The hero playing this run — the run starts from their persistent build,
   * and every victory (and, in hardcore, death) is banked onto them. */
  character: Character;
  difficulty: Difficulty;
  levelId: string;
  /** Abandon the run for good (the end-of-run splash's MENU button). */
  onQuit: () => void;
  /** Leave to the main menu mid-run (the pause screen's MENU button), handing
   * the live engine state up so it can be parked in memory and resumed. */
  onExitToMenu: (state: GameState) => void;
  /** Warp-in (the title moon's long-press): drop straight into play, skipping
   * the prelude cutscene and the hero's level-intro monologue. */
  skipIntro?: boolean;
  /** DEVELOPER → BOT VIEW: hand the run to the engine autopilot with a realistic
   * leveled + rolled-gear hero, and print the bot's live decision over its head —
   * a watchable, debuggable autoplay of any level/difficulty. */
  botView?: boolean;
  /** HOW TO PLAY: a self-playing showcase built on BOT VIEW (`botView` is also
   * set) but pinned to one gentle bundle — a melee hero, real-time speed — and
   * fronted for a newcomer: teaching tooltips pop where the autopilot taps, the
   * debug thought read is hidden, and a tap ANYWHERE raises an exit-to-menu
   * confirm instead of the pause menu. See demo.ts. */
  demo?: boolean;
  /** Resuming a run parked in memory: adopt this frozen (paused) engine state
   * as-is instead of starting fresh. Consumed once — a later RETRY / NEXT
   * LEVEL in this same mount recreates the game normally. */
  resume?: GameState;
}) {
  // The level this run is on. Retry replays it; the victory splash's NEXT
  // LEVEL button advances it along LEVEL_ORDER, which re-runs the mount effect
  // (a fresh createGame) — each run is standalone, carrying only the chosen
  // difficulty across, per docs/game-content.md.
  const [levelId, setLevelId] = useState(initialLevelId);
  // The live character, kept in a ref so it survives re-renders and, crucially,
  // so a second victory in the SAME mount (clear a level → NEXT LEVEL → clear
  // again) starts from the loadout the FIRST victory just banked. `recordVictory`
  // returns the updated character; we stash it back here.
  const characterRef = useRef<Character>(character);
  // The parked engine state to adopt on this mount (a run resumed from the
  // menu), consumed the first time the run effect fires so a later RETRY /
  // NEXT LEVEL recreates the game from scratch instead of re-adopting it.
  const resumeRef = useRef<GameState | null>(resume ?? null);
  // The retry checkpoint: a snapshot of THIS level taken the instant combat
  // began (see run-progress.ts), kept across RETRY re-runs of the run effect.
  // A death's RETRY adopts a fresh copy so the player drops back into the
  // action instead of replaying the prelude + intro; NEXT LEVEL (a new levelId)
  // supersedes it with the new level's own checkpoint. See checkpoint.ts.
  const checkpointRef = useRef<RunCheckpoint | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // The live HUD minimap canvas: the render loop paints the fog-of-war map and
  // its blips straight onto it each frame (like the dpad/powerup DOM writes),
  // so the map tracks the hero without a React re-render.
  const minimapRef = useRef<HTMLCanvasElement>(null);
  const dpadRef = useRef<HTMLDivElement>(null);
  // BOT VIEW steering telemetry: the root shell (a coordinate basis for tap
  // ripples), a fixed lower-right dpad mirroring the bot's steer, and a layer of
  // white "tap" ripples blooming where the bot clicks (a jump, or an
  // ability/spell/consumable button). Driven imperatively from the game loop and
  // only ever shown while the bot drives — normal play sees none of it.
  const screenRef = useRef<HTMLDivElement>(null);
  const botDpadRef = useRef<HTMLDivElement>(null);
  const tapFxRef = useRef<HTMLDivElement>(null);
  // The powerup dock: a spent powerup keeps its slot and counts down in place,
  // its radial cooldown sweep and countdown numbers written straight to the DOM
  // by the render loop (like the dpad), so the timer stays smooth without a
  // React re-render every frame.
  const powerupDockRef = useRef<HTMLDivElement>(null);
  // The queued one-shot input edges the DOM handlers bank between sim ticks
  // (taps, bound keys, dock/spell-slot presses) — see player-input.ts.
  const queues = useInputQueues();
  // A pause the VIEWER opened by hand (clicking the timer / pressing P) while
  // watching BOT VIEW. The bot's input loop clears auto-pauses (tab blur) so
  // autoplay keeps running, but must LEAVE a hand-opened pause alone — that's
  // the only way a viewer can reach the pause menu to quit to the main menu.
  const userPausedRef = useRef(false);
  // The live pickup-card <button> element, so a tap landing over a
  // NON-INTERACTIVE (non-upgrade) card can dismiss it instead of jumping — its
  // steering already passes straight through (pointer-events:none). Null when
  // no card is up. `pickupDismissRef` carries the dismiss action for the
  // current card, or null when the card is a tap-to-equip upgrade (which owns
  // its own tap) — so the canvas only steals the tap for a card meant to be
  // flicked away.
  const pickupCardElRef = useRef<HTMLButtonElement | null>(null);
  const pickupDismissRef = useRef<(() => void) | null>(null);
  // Mirror of `weaponMenuOpen` so the (closure-captured) key handler can read
  // the live value without re-registering on every toggle.
  const weaponMenuOpenRef = useRef(false);
  // Live mirror of the dialogue crawl so keyboard advance shares the tap's
  // two-step feel: the first press finishes the reveal, the next turns the
  // page. Defaults to "done" so an advance before any scene is a plain turn.
  const dialogueRevealRef = useRef<DialogueReveal>({
    done: true,
    skip: () => {},
  });
  // Same mirror for the level-intro monologue crawl, so Space shares the tap's
  // two-step feel: the first press finishes the reveal, the next turns the page.
  const introRevealRef = useRef<IntroReveal>({ done: true, skip: () => {} });
  // …and for the prelude cutscene's crawling lines.
  const cutsceneRevealRef = useRef<CutsceneReveal>({
    done: true,
    skip: () => {},
  });
  const [assets, setAssets] = useState<GameAssets | null>(null);
  const [runId, setRunId] = useState(0);
  const [hud, setHud] = useState<Hud | null>(null);
  // Whether the just-ended run set a new best survival time on this
  // difficulty — flagged on the end-of-run splash's high-score line.
  const [newRecord, setNewRecord] = useState(false);
  // The live engine state object for this run. Mutable (the loop advances it
  // in place); stored in React state so overlays can read it during render.
  const [state, setState] = useState<GameState | null>(null);
  // Bumped by paused-phase UI (inventory, level-up) after engine mutations
  // so React re-reads the frozen state.
  const [, setUiTick] = useState(0);
  const bumpUi = () => setUiTick((t) => t + 1);
  // The AUTO PILOT session (see autopilot-director.ts): survives the run
  // remounts the ride itself causes and ends with the screen.
  const autopilot = useAutopilotSession();
  // The transient SPELL STATUS echo shown high on the HUD: the name of the spell
  // just cast, or why a cast fizzled. Auto-clears after a beat (see the timer
  // ref). Set from the event loop on spellCast / spellFizzled.
  const [spellStatus, setSpellStatus] = useState<SpellStatus | null>(null);
  const spellStatusTimerRef = useRef<number | null>(null);
  const flashSpellStatus = (
    text: string,
    tone: "cast" | "fizzle",
    accent: string,
  ) => {
    setSpellStatus({ text, tone, accent });
    if (spellStatusTimerRef.current !== null) {
      window.clearTimeout(spellStatusTimerRef.current);
    }
    spellStatusTimerRef.current = window.setTimeout(
      () => setSpellStatus(null),
      1300,
    );
  };
  // The lower-right pickup feed ("PICKED UP X"). Lines are appended as loot is
  // scooped and expire on individual PICKUP_TTL_MS timers (see pickup-ui.ts).
  const [pickups, setPickups] = useState<PickupMessage[]>([]);
  // Autoplay economy: sim ms of the bot's last merchant counter visit — the
  // cooldown gate so it doesn't re-open a stall every tick (bot-driver.ts).
  const botShopMsRef = useRef(-Infinity);
  // HOW TO PLAY demo state (see demo-director.ts): the teaching tooltip on
  // screen, the level-up focus highlight, and the loop's pacing refs.
  const demoState = useDemoState();
  const { demoTip, setDemoTip, demoLevelupFocus } = demoState;
  // The area caption ("STOCK ROOM"): the last named zone the hero walked into,
  // flashed over the field. The render loop detects the entry (comparing to
  // `lastAreaRef`) and bumps `id` so the caption remounts and replays its fade.
  const [areaCaption, setAreaCaption] = useState<AreaCaptionState | null>(null);
  const lastAreaRef = useRef<string | null>(null);
  const areaCaptionSeq = useRef(0);
  // The guidance arrow's last-pinged blink index — the render loop pings the
  // "go this way" beacon each time the pulse reaches a fresh peak while the
  // arrow is visible. Reset to null whenever the arrow hides, so a reappearance
  // re-baselines instead of firing a backlog of missed blinks.
  const guideBlinkRef = useRef<number | null>(null);
  // The framed pickup card ("PICKED UP <gear>") for bag gear — one at a time,
  // the newest replacing the last, cleared on its own TTL timer (pickup-ui.ts).
  const [pickupCard, setPickupCard] = useState<PickupCard | null>(null);
  // Whether the in-HUD weapon switcher (tap the weapon slot / Q) is expanded.
  const [weaponMenuOpen, setWeaponMenuOpen] = useState(false);
  // The HUD FPS readout — the DEVELOPER menu's DEBUG MODE flag (or ?debug)
  // turns it on, read once per mount so flipping the setting applies to the
  // next run. The value itself is written straight to the DOM by the render
  // loop (see fpsRef) — a React state ticking every frame would defeat the
  // point of measuring.
  const [showFps] = useState(
    () =>
      getSettings().debug === "on" ||
      new URLSearchParams(window.location.search).has("debug"),
  );
  const fpsRef = useRef<HTMLDivElement | null>(null);
  // Landscape (the reference orientation) splits the bottom docks across BOTH
  // corners — the powerup (+ spell) buttons in the player's chosen corner, the
  // consumable items in the opposite one — so neither stack crowds the middle of
  // the short landscape field. Portrait keeps them all stacked in one corner
  // (there's room up the tall edge, and one thumb covers both). See the dock CSS.
  const wide = useMediaQuery("(min-aspect-ratio: 4/3)");
  // The XP strip's kill-heat overlay — the render loop sizes it to the
  // freshly-earned slice and toggles its `is-hot` class straight on the DOM
  // (like fpsRef) so a kill lights it up without a React re-render.
  const xpHeatRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    weaponMenuOpenRef.current = weaponMenuOpen;
  }, [weaponMenuOpen]);

  // Achievement unlocks: batched unlocks queue and toast ONE at a time (see
  // use-achievement-toasts.ts).
  const { achievementToast, celebrateAchievements } = useAchievementToasts();

  useEffect(() => {
    let alive = true;
    void loadGameAssets().then((loaded) => {
      if (alive) setAssets(loaded);
    });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!assets || !canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Desktop mouse: the pointer becomes the 16-bit crosshair reticle over the
    // play field (the aim dimension made visible). Touch never shows a cursor.
    canvas.style.cursor =
      spriteCursor(assets.sprites, "crosshair", { fallback: "crosshair" }) ??
      "crosshair";

    // Build this run's engine state (seed/resume/checkpoint/bot-view/scenario,
    // opening skip + music arming, `?debug` hooks) — see run-setup.ts.
    const session = createRunSession({
      levelId,
      difficulty,
      characterRef,
      resumeRef,
      checkpointRef,
      botView,
      demo,
      skipOpening,
      runId,
      castSpellIndexRef: queues.castSpellIndexRef,
    });
    const { state, runLevelId, bot, tuning, beginRun } = session;
    setState(state);
    setNewRecord(false);

    // Book the run on the achievement ledger — fresh starts and RETRYs both
    // count as "running the level"; a run resumed from the menu is the same
    // run continuing, so it doesn't. Run-count badges can unlock right here.
    // The HOW TO PLAY demo never touches the account-wide trophy shelf: the
    // player is watching, not playing, so the bot must bank no achievements and
    // inflate no lifetime totals.
    if (!session.resumed && !demo)
      celebrateAchievements(recordRunStarted(runLevelId));

    // The per-run scratch shared between simulate and render (effects, the
    // hero's live attack pose, the XP-heat streak, the bag-full nudge).
    const shared = createLoopShared();
    const feed = createPickupFeed(setPickups);
    const cardQueue = createPickupCardQueue({
      state,
      assets,
      setPickupCard,
      pickupDismissRef,
      bumpUi,
    });
    const tapFx = createTapFx(tapFxRef);
    const demoDirector = createDemoDirector({
      demo,
      bot,
      state,
      refs: demoState.refs,
      setDemoTip,
      setDemoLevelupFocus: demoState.setDemoLevelupFocus,
      screenRef,
      tapFx,
      bumpUi,
    });

    // Backing store in world units; CSS upscales by the view scale
    // (pixelated). The scale is the phone baseline (VIEW_SCALE), doubled on
    // large/desktop viewports so the world matches the 2×-scaled DOM UI.
    const viewport: Viewport = {
      cssToWorld: { x: 1 / VIEW_SCALE, y: 1 / VIEW_SCALE },
      uiScale: uiScaleFor(window.innerWidth, window.innerHeight),
    };
    const resize = () => {
      const scale = viewScaleFor(window.innerWidth, window.innerHeight);
      canvas.width = Math.max(1, Math.ceil(canvas.clientWidth / scale));
      canvas.height = Math.max(1, Math.ceil(canvas.clientHeight / scale));
      viewport.cssToWorld.x = canvas.width / canvas.clientWidth;
      viewport.cssToWorld.y = canvas.height / canvas.clientHeight;
      viewport.uiScale = uiScaleFor(window.innerWidth, window.innerHeight);
    };
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    resize();

    const botFeedback = createBotFeedback({
      canvas,
      cssToWorld: viewport.cssToWorld,
      tapFx,
      powerupDockRef,
      screenRef,
      showDemoTip: demoDirector.showDemoTip,
    });

    // Pause freezes the sim (the engine's "paused" phase) and the music
    // together; resume lifts both. Music truly resumes in place — the chiptune
    // player keeps its position across the pause. Guarded so it only toggles
    // mid-run, never over an intro/level-up/end splash.
    const pause = (userInitiated = false) => {
      if (state.phase !== "playing") return;
      // A hand-opened pause latches so the bot's input loop won't clear it (an
      // auto-pause from tab blur passes userInitiated=false and stays clearable).
      if (userInitiated) userPausedRef.current = true;
      pauseGame(state);
      pauseMusic();
      bumpUi();
    };
    const resumeRun = () => {
      if (state.phase !== "paused") return;
      userPausedRef.current = false;
      resumeGame(state);
      resumeMusic();
      bumpUi();
    };

    const controls = createControls({
      canvas,
      state,
      queues,
      bot,
      botView,
      pickupCardElRef,
      pickupDismissRef,
      userPausedRef,
      dialogueRevealRef,
      introRevealRef,
      cutsceneRevealRef,
      weaponMenuOpenRef,
      setWeaponMenuOpen,
      pause,
      resume: resumeRun,
      beginRun,
      bumpUi,
    });

    const progress = createRunProgress({
      characterRef,
      checkpointRef,
      difficulty,
      runLevelId,
      captureEnabled: session.captureCheckpoint,
      setHud,
      setLevelId,
      setNewRecord,
    });
    // AUTO PILOT: re-arm the session's meter on this fresh run and stand up
    // the flight director (finds, coin meters, the next-lap routing).
    const autopilotDirector = createAutopilotDirector({
      sessionRef: autopilot.sessionRef,
      syncView: autopilot.syncView,
      state,
      demo,
      bot,
      assets,
      characterRef,
      checkpointRef,
      difficulty,
      pushPickup: feed.push,
      pause,
      bumpUi,
      setHud,
      setLevelId,
      setRunId,
    });

    const input: GameInput = {
      steering: false,
      target: { x: 0, y: 0 },
      jump: false,
      useItem: false,
    };
    const botDriver = createBotDriver({
      state,
      input,
      bot,
      demo,
      demoDirector,
      userPausedRef,
      botShopMsRef,
      beginRun,
      bumpUi,
    });

    const render = createRenderFrame({
      state,
      canvas,
      ctx,
      assets,
      shared,
      tuning,
      input,
      pointer: controls.pointer,
      bot,
      botView,
      demo,
      showFps,
      demoDirector,
      minimapRef,
      fpsRef,
      xpHeatRef,
      dpadRef,
      botDpadRef,
      powerupDockRef,
      lastAreaRef,
      areaCaptionSeq,
      setAreaCaption,
      guideBlinkRef,
      setHud,
    });

    const stop = startGameLoop({
      // Fast-forward (`?speed=` / `__speed`) advances the sim faster by running
      // more fixed steps per frame — read live so `__speed` can retune mid-run.
      // An engaged AUTO PILOT overrides it with its paid rung (1×–16× — the
      // engine meter and the fast-forward always agree; see autopilot.ts).
      speed: () =>
        state.autopilot.active ? state.autopilot.speed : tuning.simSpeed,
      simulate(dtMs) {
        // HOW TO PLAY: the sim stays frozen while a teaching tooltip is being
        // read; render keeps drawing the frozen frame + tip.
        if (demoDirector.holdSim(dtMs)) return;
        const camera = computeCamera(state, canvas.width, canvas.height);
        // The character only targets what the player can see.
        input.view = {
          x: camera.x,
          y: camera.y,
          width: canvas.width,
          height: canvas.height,
        };
        // AUTO PILOT refused at the door (the banked purse can't fund the
        // rung on this fresh run): freeze the run where it stands so the
        // hero isn't slaughtered unattended, and say why.
        if (autopilotDirector.consumeBrokeAtDoor()) {
          feed.push("AUTO PILOT · OUT OF COINS", "#ffcf6b");
          pause(true);
          bumpUi();
        }
        // The driving seat: the developer BOT VIEW / `?bot=` playtest bot, or
        // the paid AUTO PILOT's own bot while its engine meter runs.
        const drivingBot = botDriver.resolveDrivingBot();
        if (drivingBot) {
          botDriver.drive(drivingBot, dtMs);
        } else {
          readHumanInput(input, {
            state,
            pointer: controls.pointer,
            camera,
            viewport,
            queues,
          });
        }
        // A banked field tap may open the merchant's shop / re-open the
        // victory menu instead of acting as a jump (player-input.ts).
        handleFieldTaps(input, {
          state,
          bot,
          camera,
          viewport,
          queues,
          bumpUi,
        });
        // The fill level BEFORE this step, so a kill that starts a fresh streak
        // can anchor the bright slice at the XP the hero already had.
        const xpBeforeStep = state.player.xp;
        // The hp BEFORE this step, so the damage haptic below can weigh the
        // buzz by how big a bite the tick actually took out of the bar (a shield
        // may absorb part of a blow, so the felt loss is the true hp delta, not
        // the raw damage the engine rolled).
        const hpBeforeStep = state.player.hp;
        // `timeScale` (?debug `window.__timeScale`) slows the whole run for
        // animation tuning — a neutral 1 in normal play.
        step(state, input, dtMs * tuning.timeScale);
        botDriver.postStep(drivingBot);
        progress.captureCheckpoint(state);
        playEventSounds(synth, state.events);
        // Buzz back when the hero was bitten this tick, scaled to the share of
        // his max hp the blow cost. Gated on the playerHurt event (not a bare hp
        // drop) so only real hits buzz; the magnitude is the true hp delta so a
        // shield-softened blow reads lighter than the damage the engine rolled.
        if (
          state.player.maxHp > 0 &&
          state.events.some((e) => e.type === "playerHurt")
        ) {
          playDamageHaptic(
            (hpBeforeStep - state.player.hp) / state.player.maxHp,
          );
        }
        // Book the tick's events on the achievement ledger (kills, loot,
        // clears, …) and celebrate whatever unlocked — the toast + chime,
        // sized a notch below the ding and the unique card. Skipped in the demo
        // (watching, not playing — the trophy shelf stays the player's).
        if (!demo)
          celebrateAchievements(
            recordAchievementEvents(state.events, {
              levelId: state.level.id,
              difficulty,
              stats: state.stats,
            }),
          );
        // …and the hero's outfit for the wardrobe feats. Reported every
        // frame; the store no-ops until the worn set actually changes, and
        // equips made while a panel freezes the sim are still caught here
        // (the loop keeps running under paused phases). Skipped in the demo.
        if (!demo)
          celebrateAchievements(recordWornEquipment(wornEquipment(state)));

        trackXpHeat(shared, state, xpBeforeStep);
        // Big kills merge their XP into one oversized pop (event-fx.ts);
        // the marked drips are skipped by the per-kill float below.
        const mergedKills = mergePackKillXp(shared, state);
        // A signature melee weapon throws THEMED gore on the hero's own blows.
        const heroGore = heroGoreThisTick(state);

        const fxCtx = {
          state,
          shared,
          mergedKills,
          heroGore,
          pushPickup: feed.push,
          flashSpellStatus,
          showPickupCard: cardQueue.show,
        };
        for (const event of state.events) {
          // Visual/feedback reactions first (they match the engine's own event
          // order), then the BOT VIEW ripples, then the character/checkpoint
          // banking, then the AUTO PILOT flight director — the same relative
          // order the monolithic loop ran these in.
          applyEventFx(event, fxCtx);
          if (bot) botFeedback.onEvent(event, state, camera);
          progress.onEvent(event, state);
          autopilotDirector.onEvent(event, state);
        }
        expireEffects(shared, state);
      },
      render,
    });

    return () => {
      stop();
      stopMusic();
      controls.detach();
      observer.disconnect();
      feed.dispose();
      tapFx.dispose();
      cardQueue.dispose();
      demoDirector.dispose();
    };
  }, [
    assets,
    runId,
    difficulty,
    levelId,
    initialLevelId,
    skipOpening,
    botView,
    demo,
    showFps,
    // The rest are STABLE (refs, memoized bundles, setState functions).
    autopilot.sessionRef,
    autopilot.syncView,
    celebrateAchievements,
    demoState.refs,
    demoState.setDemoLevelupFocus,
    queues,
    setDemoTip,
  ]);

  if (!assets) {
    return <LoadingScreen />;
  }
  const font = assets.font;
  // Which bottom corner the powerup dock lives in; the pickup feed takes the
  // opposite one. Read live so the title-screen toggle applies next run.
  const powerupSide = getSettings().powerupSide;
  // The consumable dock rides with the powerups in portrait (stacked above
  // them), but crosses to the OPPOSITE corner in landscape so the two rows split
  // left/right instead of piling up on one side of the field.
  const oppositeSide = powerupSide === "left" ? "right" : "left";
  const consumableSide = wide ? oppositeSide : powerupSide;
  // Show 1/2/3 · Q · 1-4 key caps on the dock and weapon switcher only when
  // desktop keyboard controls are on (touch has no keys to hint).
  const keyHints = getSettings().keyboardMove === "on";

  // The hero-avatar inventory button — shared between the playing HUD's
  // status unit and the arrival-scene corner (see SceneOverlays).
  const heroAvatar = hud && (
    <HeroAvatar
      state={state}
      appearance={hud.appearance}
      level={hud.level}
      assets={assets}
      font={font}
      onOpen={() => {
        if (state) {
          setWeaponMenuOpen(false);
          openInventory(state);
          playUiSound(synth, "confirm");
          bumpUi();
        }
      }}
    />
  );

  return (
    <div ref={screenRef} className="game-screen">
      <canvas ref={canvasRef} className="game-canvas" />

      {/* The imperative chrome the render loop writes into directly: the
          touch dpad hint, BOT VIEW's steer dpad + tap-ripple layer, and the
          FPS meter (ScreenChrome.tsx). */}
      <ScreenChrome
        dpadRef={dpadRef}
        botDpadRef={botDpadRef}
        tapFxRef={tapFxRef}
        fpsRef={fpsRef}
        showFps={showFps}
      />

      {/* HOW TO PLAY: the teaching tooltip + the tap-anywhere exit catcher
          (ScreenChrome.tsx DemoChrome). */}
      {demo && (
        <DemoChrome
          state={state}
          hud={hud}
          font={font}
          demoTip={demoTip}
          clearTip={demoState.clearTip}
          userPausedRef={userPausedRef}
          bumpUi={bumpUi}
        />
      )}

      {hud && hud.phase === "playing" && state && (
        <PlayingHud
          hud={hud}
          state={state}
          assets={assets}
          font={font}
          spellStatus={spellStatus}
          weaponMenuOpen={weaponMenuOpen}
          onToggleWeaponMenu={setWeaponMenuOpen}
          keyHints={keyHints}
          minimapRef={minimapRef}
          xpHeatRef={xpHeatRef}
          heroAvatar={heroAvatar}
          autopilotOverlay={
            state.autopilot.active && (
              <AutopilotPanel
                state={state}
                font={font}
                coins={hud.coins}
                autopilot={autopilot}
                bumpUi={bumpUi}
              />
            )
          }
          userPausedRef={userPausedRef}
          bumpUi={bumpUi}
        />
      )}

      {hud?.phase === "playing" && (
        <ConsumableDock
          hud={hud}
          assets={assets}
          font={font}
          keyHints={keyHints}
          side={consumableSide}
          wide={wide}
          onUse={queues.queueConsumable}
        />
      )}

      {/* The SPELL BAR: the caster's row of cast slots, stacked just ABOVE the
          consumable dock in the same thumb corner. A tap casts a slot (dimmed
          while short on mana / recharging); a long-press opens the picker to
          reassign it from the unlocked spells. Only shown once the hero is a
          caster (some INT invested). */}
      {hud?.phase === "playing" && hud.isCaster && (
        <SpellBar
          sprites={assets.sprites}
          font={font}
          side={powerupSide}
          split={wide}
          slots={hud.spells}
          unlockedIds={hud.unlockedSpells}
          keyHints={keyHints}
          keyLabels={[
            bindingLabel(getSettings().keybindings.spell1),
            bindingLabel(getSettings().keybindings.spell2),
            bindingLabel(getSettings().keybindings.spell3),
            bindingLabel(getSettings().keybindings.spell4),
          ]}
          onCast={queues.queueSpellCast}
          onAssign={(slot, spellId) => {
            if (state) setSpellSlot(state, slot, spellId);
            bumpUi();
          }}
        />
      )}

      <PowerupDock
        hud={hud?.phase === "playing" ? hud : null}
        assets={assets}
        font={font}
        keyHints={keyHints}
        weaponMenuOpen={weaponMenuOpen}
        side={powerupSide}
        dockRef={powerupDockRef}
        onSpend={queues.queueDockSpend}
        onDiscard={(index) => {
          if (state && discardHeldAbility(state, index)) {
            playUiSound(synth, "back");
            return true;
          }
          return false;
        }}
      />

      {hud?.phase === "playing" && (
        <PickupFeed
          font={font}
          messages={pickups}
          side={powerupSide === "left" ? "right" : "left"}
        />
      )}

      {/* The AUTO PILOT LOOT history — a full-shell modal. */}
      {state && state.autopilot.active && autopilot.historyOpen && (
        <AutopilotHistoryModal
          state={state}
          font={font}
          autopilot={autopilot}
        />
      )}

      {/* The area caption — keyed on its bump id so walking into a room remounts
          the label and replays its one-shot fade. */}
      {hud?.phase === "playing" && areaCaption && (
        <AreaCaption
          key={areaCaption.id}
          label={areaCaption.label}
          font={font}
        />
      )}

      {/* The framed pickup card for freshly bagged gear. Keyed by the card id
          so a new find remounts the box and restarts its pop + border spark. */}
      {hud?.phase === "playing" && pickupCard && (
        <PickupModal
          key={pickupCard.id}
          font={font}
          relicFonts={assets.relicFonts}
          card={pickupCard}
          cardRef={pickupCardElRef}
        />
      )}

      {/* The phase-driven overlay stack: cutscene, intro/outro, title card,
          dialogue (+ the arrival-scene bag shortcut), choice, companion,
          level-up, spell unlock, respec, inventory, shop, and map. */}
      {state && hud && (
        <SceneOverlays
          state={state}
          hud={hud}
          assets={assets}
          font={font}
          cutsceneRevealRef={cutsceneRevealRef}
          introRevealRef={introRevealRef}
          dialogueRevealRef={dialogueRevealRef}
          demoLevelupFocus={demo ? demoLevelupFocus : null}
          heroAvatar={heroAvatar}
          onBeginRun={() => {
            // Leave the level-name card and drop into the run — the level
            // music rolls the moment play begins.
            dismissIntro(state);
            playLevelMusic(levelDef(state.level.id).music);
            bumpUi();
          }}
          bumpUi={bumpUi}
        />
      )}

      {/* The paused-phase menus: the demo's exit confirm, or the ordinary
          pause menu with its AUTO PILOT engage row (PausedOverlays.tsx). */}
      {state && hud?.phase === "paused" && (
        <RunPausedOverlay
          state={state}
          font={font}
          demo={demo}
          botView={botView}
          userPausedRef={userPausedRef}
          characterRef={characterRef}
          difficulty={difficulty}
          autopilot={autopilot}
          onQuit={onQuit}
          onExitToMenu={onExitToMenu}
          bumpUi={bumpUi}
        />
      )}

      {/* The achievement unlock banner — any phase: a badge earned on the
          winning blow still gets its moment over the victory splash. */}
      {achievementToast && (
        <AchievementToast
          key={achievementToast.id}
          font={font}
          sprites={assets.sprites}
          toast={achievementToast}
        />
      )}

      {hud && hud.phase === "victory" && (
        <VictorySplash
          state={state}
          font={font}
          newRecord={newRecord}
          onAdvance={(next) => {
            setHud(null);
            setLevelId(next);
          }}
          onRestart={() => {
            setHud(null);
            setRunId((id) => id + 1);
          }}
          onStay={() => {
            if (state && stayOnField(state)) {
              setHud(null);
              playLevelMusic(levelDef(state.level.id).music);
            }
          }}
        />
      )}

      {hud && hud.phase === "defeat" && (
        <DefeatSplash
          hud={hud}
          state={state}
          font={font}
          newRecord={newRecord}
          hardcore={character.hardcore}
          onRetry={() => {
            setHud(null);
            setRunId((id) => id + 1);
          }}
          onQuit={onQuit}
        />
      )}
    </div>
  );
}
