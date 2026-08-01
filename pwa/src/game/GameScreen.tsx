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

import { localHero } from "./local-seat.ts";
import { useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";

import {
  runLevelDef,
  canOpenInventory,
  debugDetonateNuke,
  debugLevelUpFx,
  error,
  type Difficulty,
  type GameInput,
  type GameState,
} from "@game/core";

import { describeError } from "@ui/lib/describe-error.ts";
import { startGameLoop } from "@ui/lib/game-loop.ts";
import { useMediaQuery } from "@ui/lib/use-media-query.ts";

import { loadGameAssets, spriteCursor, type GameAssets } from "./assets.ts";
import { recordRunStarted } from "./achievements.ts";
import { AchievementToast } from "./AchievementToast.tsx";
import { synth } from "./audio.ts";
import { AreaCaption } from "./AreaCaption.tsx";
import type { CutsceneReveal } from "./overlays/CutsceneOverlay.tsx";
import type { DialogueReveal } from "./overlays/DialogueOverlay.tsx";
import type { IntroReveal } from "./overlays/IntroOverlay.tsx";
import { levelUpIntensity } from "./levelup-intensity.ts";
import { LoadingScreen } from "./LoadingScreen.tsx";
import {
  pauseMusic,
  playLevelMusic,
  resumeMusic,
  stopMusic,
} from "./music/index.ts";
import { playTypewriterHaptic } from "./haptics.ts";
import { PickupFeed, type PickupMessage } from "./PickupFeed.tsx";
import { PickupModal, type PickupCard } from "./PickupModal.tsx";
import {
  canvasToWorld,
  computeCamera,
  uiScaleFor,
  VIEW_SCALE,
  viewScaleFor,
  worldToCanvas,
  worldViewRect,
} from "./render.ts";
import { setHiddenLandmarks } from "./render/hidden-landmarks.ts";
import { fxStyleVars } from "./render/postfx.ts";
import { getSettings } from "./settings.ts";
import { playUiSound } from "./sfx/ui.ts";
import { hasKeepsake, type Character } from "./characters.ts";
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
import { fatalBlow, killerLabel } from "./game-screen/death-cause.ts";
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
import { flushGoldPickups } from "./game-screen/gold-float.ts";
import { HeroAvatar } from "./game-screen/HeroAvatar.tsx";
import { type Hud } from "./game-screen/hud-model.ts";
import { createLoopShared } from "./game-screen/loop-shared.ts";
import { createEliteFx } from "./game-screen/elite-css-fx.ts";
import { createNukeFx } from "./game-screen/nuke-fx.ts";
import { createPowerupAura } from "./game-screen/powerup-aura.ts";
import { createLevelUpFx } from "./game-screen/levelup-fx.ts";
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
import { PlayingHud } from "./game-screen/PlayingHud.tsx";
import { QuestFlash } from "./game-screen/QuestFlash.tsx";
import { QuestTracker } from "./game-screen/QuestTracker.tsx";
import { QuestOverlay } from "./overlays/QuestOverlay.tsx";
import { TalkOverlay } from "./overlays/TalkOverlay.tsx";
import { PowerupDock } from "./game-screen/PowerupDock.tsx";
import { SwipeDock } from "./game-screen/SwipeDock.tsx";
import {
  createRenderFrame,
  type AreaCaptionState,
} from "./game-screen/render-frame.ts";
import {
  createRunProgress,
  type RunCheckpoint,
  type RunProgress,
} from "./game-screen/run-progress.ts";
import { TravelPanel } from "./game-screen/TravelPanel.tsx";
import { pollGamepad, type GamepadSnapshot } from "@ui/lib/gamepad.ts";
import { setGamepadKeysSuspended } from "@ui/lib/gamepad-keys.ts";
import { ConnectingScreen } from "./game-screen/ConnectingScreen.tsx";
import { createRunDriver, type RunDriver } from "./game-screen/run-driver.ts";
import { createRunSession } from "./game-screen/run-setup.ts";
import { activeMods } from "./mod-state.ts";
import { joinRefusalText } from "./net-text.ts";
import type { SessionLink } from "./net/session-link.ts";
import { ChatOverlay } from "./overlays/ChatOverlay.tsx";
import type { JoinIntent } from "./session-intent.ts";
import { createTickReactions } from "./game-screen/tick-reactions.ts";
import { SceneOverlays, type CharTab } from "./game-screen/SceneOverlays.tsx";
import { DemoChrome, ScreenChrome } from "./game-screen/ScreenChrome.tsx";
import { useAchievementToasts } from "./game-screen/use-achievement-toasts.ts";

import { runCommand, runCommandOk } from "./run-commands.ts";

export function GameScreen({
  character,
  difficulty: initialDifficulty,
  levelId: initialLevelId,
  onQuit,
  onExitToMenu,
  skipIntro: skipOpening = false,
  botView = false,
  demo = false,
  resume,
  join,
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
  /** Warp-in (the developer menu's SELECT LEVEL): drop straight into play,
   * skipping the prelude cutscene and the hero's level-intro monologue. */
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
  /**
   * JOINING somebody else's session: watch their run instead of starting one.
   *
   * The whole screen works the same way — the renderer, the HUD, the effects
   * and the sound bus read a `GameState` and one is still there — with two
   * differences the rest of this file is written around. The state ARRIVES
   * (nothing here builds it, so the loop waits on the welcome exactly as it
   * waits on the sprite atlas), and nothing is BANKED: a spectator plays on a
   * throwaway hero, so somebody else's kills cannot land on their roster.
   */
  join?: JoinIntent;
}) {
  // The level this run is on. Retry replays it; the victory splash's NEXT
  // LEVEL button advances it along LEVEL_ORDER, which re-runs the mount effect
  // (a fresh createGame) — each run is standalone, carrying only the chosen
  // difficulty across, per docs/game-content.md.
  const [levelId, setLevelId] = useState(initialLevelId);
  // The rung this run is on. Normally the one the player picked and it never
  // moves — but a paid AUTO PILOT ride that BEATS the campaign steps up to the
  // next unlocked difficulty (see autopilot-director's `autopilotStepUp`), so
  // the live value lives here beside the level rather than in the prop. The
  // engine state carries it too, which is what App parks a run's rung from.
  const [difficulty, setDifficulty] = useState(initialDifficulty);
  // The live character, kept in a ref so it survives re-renders and, crucially,
  // so a second victory in the SAME mount (clear a level → NEXT LEVEL → clear
  // again) starts from the loadout the FIRST victory just banked. `recordVictory`
  // returns the updated character; we stash it back here.
  const characterRef = useRef<Character>(character);
  // The controller, re-polled each sim tick. Held across ticks so the reader
  // can prefer the pad already in use and so button EDGES can be diffed — the
  // Gamepad API only ever reports that a button IS down.
  const gamepadRef = useRef<GamepadSnapshot | null>(null);

  // Leaving the run must always hand controller navigation back, whatever the
  // phase was on the way out — a crash, a quit, an unmount mid-frame. The tick
  // sets the flag, so only the teardown needs to clear it.
  useEffect(() => () => setGamepadKeysSuspended(false), []);
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
  // The screen-clearing NUKE's full-screen flash/fire/smoke overlay layer
  // (createNukeFx writes into it directly from the sim loop's event pass).
  const nukeFxRef = useRef<HTMLDivElement>(null);
  const eliteFxRef = useRef<HTMLDivElement>(null);
  // The LEVEL-UP light explosion's full-screen flash/bloom/rays/pillar overlay
  // layer (createLevelUpFx writes into it from the sim loop's event pass).
  const levelUpFxRef = useRef<HTMLDivElement>(null);
  // The powerups' screen-space layer: the sustained aura a running power wears
  // over the whole frame, and the one-shot washes its loud beats throw
  // (createPowerupAura writes into it directly from the sim loop).
  const powerupAuraRef = useRef<HTMLDivElement>(null);
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
  // The live pickup-card <button> element, so a tap landing over it can act on
  // the card instead of jumping. The card itself is pointer-events:none in
  // EVERY state (styles.css) — it parks in the lower centre, exactly where a
  // thumb anchors the virtual dpad, so it must never swallow a press — and the
  // canvas owns its tap instead. `pickupCardTapRef` carries what that tap does
  // for the card currently up: equip it (a tap-to-equip upgrade) or flick it
  // away (everything else). Both null when no card is up.
  const pickupCardElRef = useRef<HTMLButtonElement | null>(null);
  const pickupCardTapRef = useRef<(() => void) | null>(null);
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
  // What landed the fatal blow, ready to print — the line the SOFTCORE YOU DIED
  // splash leads with (death-cause.ts). Captured off the tick the hero fell on,
  // because that tick carries both the blow and the death.
  const [killedBy, setKilledBy] = useState<string | null>(null);
  // The live engine state object for this run. Mutable (the loop advances it
  // in place); stored in React state so overlays can read it during render.
  const [state, setState] = useState<GameState | null>(null);
  // Which standing travel door's picker is open (a `travelDoors` id from the
  // hub), or null. Opened by a field tap on the door's landmark
  // (player-input.ts), closed by picking a road or NOT YET. The CHARACTER is
  // snapshotted at the tap — a victory banked earlier in this same mount is
  // exactly what decides which roads read unlocked, and capturing it at the
  // open keeps the render off the live ref.
  const [travelDoor, setTravelDoor] = useState<{
    doorId: string;
    character: Character;
  } | null>(null);
  // The current run's progress banker, reachable from the travel picker's
  // render-time onTravel — the run effect rebuilds it per run.
  const progressRef = useRef<RunProgress | null>(null);
  // Bumped by paused-phase UI (inventory, level-up) after engine mutations
  // so React re-reads the frozen state.
  const [, setUiTick] = useState(0);
  const bumpUi = () => setUiTick((t) => t + 1);
  // A loop failure BEFORE this mount's first complete frame. The loop's
  // crash-resilience (game-loop.ts) is built for a bad frame in a healthy run —
  // it logs, drops the frame and keeps going. A run that cannot produce its
  // FIRST frame is a different animal: nothing has published a HUD yet, so no
  // overlay, dock or pause menu ever mounts, and "keep going" leaves a frozen
  // canvas with no UI and no way out (the post-update resume freeze — a thawed
  // save the new build can't read throws on every frame). Escalate that one
  // case to React instead: the throw below lands in App's ErrorBoundary, which
  // shows the RELOAD screen.
  const [fatalRunError, setFatalRunError] = useState<unknown>(null);
  // The AUTO PILOT session (see autopilot-director.ts): survives the run
  // remounts the ride itself causes and ends with the screen.
  const autopilot = useAutopilotSession();
  // The lower-right pickup feed ("PICKED UP X"). Lines are appended as loot is
  // scooped and expire on individual PICKUP_TTL_MS timers (see pickup-ui.ts).
  const [pickups, setPickups] = useState<PickupMessage[]>([]);
  // Autoplay economy: sim ms of the bot's last merchant counter visit — the
  // cooldown gate so it doesn't re-open a stall every tick (bot-driver.ts).
  const botShopMsRef = useRef(-Infinity);
  // HOW TO PLAY demo state (see demo-director.ts): the teaching tooltip on
  // screen, the level-up focus highlight, and the loop's pacing refs.
  const demoState = useDemoState();
  const { demoTip, setDemoTip, demoLevelupFocus, demoTalentFocus } = demoState;
  // The area caption ("STOCK ROOM", "AREA CLEARED"): the field's centred
  // announcement line. The render loop detects a named-zone entry (comparing to
  // `lastAreaRef`), and event-fx announces what happens to an area; both bump
  // `id` so the caption remounts and replays its fade.
  const [areaCaption, setAreaCaption] = useState<AreaCaptionState | null>(null);
  const lastAreaRef = useRef<string | null>(null);
  const areaCaptionSeq = useRef(0);
  // THE QUEST PROGRESS FLASH ("SCRAP DRONES: 3/10") — the tally thrown over the
  // middle of the field whenever an errand moves (QuestFlash.tsx). Its own
  // sequence, like the caption's, so the pop replays on every bump; several
  // bumps in one tick (a nuke through a marked pack) collapse into the LAST
  // one, which is the highest count and the only one worth reading.
  const [questFlash, setQuestFlash] = useState<{
    text: string;
    done: boolean;
    id: number;
  } | null>(null);
  const questFlashSeq = useRef(0);
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
  // Which face of the CHARACTER SCREEN the engine's `inventory` phase is
  // showing — Diablo 2's split, kept app-side because the engine has one
  // freeze, not two: the bag pouch raises the inventory, the hero's portrait
  // raises the stat sheet, and either panel can swap to the other in place.
  const [charTab, setCharTab] = useState<CharTab>("bag");
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
  // SWIPE BARS is a touch gesture, so the mode only ever engages where touch
  // exists — a desktop with the setting somehow on keeps its fixed docks.
  const hasTouch = useMediaQuery("(any-pointer: coarse)");
  // The XP strip's kill-heat overlay — the render loop sizes it to the
  // freshly-earned slice and toggles its `is-hot` class straight on the DOM
  // (like fpsRef) so a kill lights it up without a React re-render.
  const xpHeatRef = useRef<HTMLDivElement | null>(null);
  // The stamina bar's fill — written by the render loop EVERY frame (like
  // fpsRef/xpHeatRef) so the sprint pool drains and refills glass-smooth;
  // React only mounts the bar (the pool is out of the HUD change-key).
  const staminaFillRef = useRef<HTMLDivElement | null>(null);
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

  // JOINING: connect first, play second.
  //
  // The run loop below cannot start without a `GameState`, and on this path
  // nothing in this process builds one — the net client builds it from the
  // welcome's own session parameters, which is the ordinary path its static
  // tier was designed for. So this effect stands where the sprite atlas's does
  // and the loop waits on it the same way: `joined` is null, the effect below
  // returns early, and the CONNECTING screen is up.
  //
  // It owns the driver for the whole mount, deliberately. The run effect
  // re-runs for a dozen ordinary reasons (a RETRY, NEXT LEVEL, the FPS row) and
  // every one of them would otherwise drop the connection and reconnect.
  const [joined, setJoined] = useState<{
    state: GameState;
    driver: RunDriver;
  } | null>(null);
  const [joinRefusal, setJoinRefusal] = useState<string | null>(null);
  const [sessionLink, setSessionLink] = useState<SessionLink | null>(null);
  useEffect(() => {
    if (!join) return;
    let live = true;
    let made: RunDriver | null = null;
    void import("./net/driver.ts").then(({ createJoinDriver }) => {
      if (!live) return;
      made = createJoinDriver({
        address: join.address,
        peer: join.peer,
        name: join.name,
        password: join.password,
        mods: activeMods().map((stamp) => stamp.id),
        onReady: (state: GameState) => {
          if (live) setJoined({ state, driver: made as RunDriver });
        },
        onClosed: (reason, detail) => {
          if (!live) return;
          setJoinRefusal(joinRefusalText(reason, detail));
        },
      });
      // No bridge at all — a browser, a phone, a desktop build with the shell
      // down. The JOIN screens are hidden on those, so this is the case where
      // one was reached anyway (a deep link, a stale window).
      if (!made) setJoinRefusal(joinRefusalText("no-session"));
    });
    return () => {
      live = false;
      made?.dispose();
    };
  }, [join]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!assets || !canvas) return;
    // JOINING: nothing to draw until the welcome lands and the world is built.
    // The same shape as the atlas gate above it, and the effect re-runs when
    // `joined` arrives.
    if (join && !joined) return;
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
      spectate: joined?.state ?? null,
    });
    const { state, runLevelId, bot, tuning, beginRun } = session;
    // WHO ADVANCES THIS RUN. A local driver steps it here, exactly as this
    // screen always did; a net driver hands the input to a session server and
    // applies what comes back. Which one is decided once, at the top of the
    // run, and nothing below this line knows the difference — see
    // ./game-screen/run-driver.ts.
    // A SPECTATOR'S DRIVER IS ALREADY RUNNING — the connection is what built
    // the state this loop is about to read, so it cannot be created here, and
    // it is owned by the join effect above rather than by this one.
    const driver = joined?.driver ?? createRunDriver(session);
    setState(state);
    // A sealed travel door's landmark stays out of sight (and out of tap
    // reach) until its keepsake is banked — the rift seam only appears in
    // the garage once the player has come back through the rift with THE
    // FOUNDER's RIFT CREATOR in hand.
    setHiddenLandmarks(
      (runLevelDef(state).travelDoors ?? [])
        .filter(
          (door) =>
            door.requires !== undefined &&
            !hasKeepsake(characterRef.current, door.requires),
        )
        .map((door) => door.id),
    );
    // THE SESSION BEHIND THIS RUN, if there is one — what the chat overlay is
    // mounted from. Null for every local run, which is every browser, every
    // phone and every desktop game nobody opened the doors on.
    setSessionLink(driver.session ?? null);
    setNewRecord(false);
    setKilledBy(null);

    // Book the run on the achievement ledger — fresh starts and RETRYs both
    // count as "running the level"; a run resumed from the menu is the same
    // run continuing, so it doesn't. Run-count badges can unlock right here.
    // The HOW TO PLAY demo never touches the account-wide trophy shelf: the
    // player is watching, not playing, so the bot must bank no achievements and
    // inflate no lifetime totals — and a SPECTATOR is the same case for the
    // same reason, one machine further away.
    if (!session.resumed && !demo && !join)
      celebrateAchievements(recordRunStarted(runLevelId));

    // The per-run scratch shared between simulate and render (effects, the
    // hero's live attack pose, the XP-heat streak, the bag-full nudge).
    const shared = createLoopShared();
    const feed = createPickupFeed(setPickups);
    // Flash a line in the field's caption slot — the same centred announcement
    // the named zones use, bumped through the same sequence so a caption always
    // remounts and replays its fade.
    const showAreaCaption = (label: string, color?: string) => {
      setAreaCaption({ label, color, id: ++areaCaptionSeq.current });
    };
    const showQuestFlash = (text: string, done: boolean) => {
      setQuestFlash({ text, done, id: ++questFlashSeq.current });
    };
    const cardQueue = createPickupCardQueue({
      state,
      assets,
      setPickupCard,
      pickupCardTapRef,
      bumpUi,
    });
    const tapFx = createTapFx(tapFxRef);
    const nukeFx = createNukeFx(nukeFxRef);
    const eliteFx = createEliteFx(eliteFxRef);
    const levelUpFx = createLevelUpFx(levelUpFxRef);
    const powerupAura = createPowerupAura(powerupAuraRef);
    const demoDirector = createDemoDirector({
      demo,
      bot,
      state,
      refs: demoState.refs,
      setDemoTip,
      setDemoLevelupFocus: demoState.setDemoLevelupFocus,
      setDemoTalentFocus: demoState.setDemoTalentFocus,
      setWeaponMenuOpen,
      screenRef,
      tapFx,
      bumpUi,
    });

    // Backing store in world units; CSS upscales by the view scale
    // (pixelated). The scale is the phone baseline (VIEW_SCALE), doubled on
    // large/desktop viewports so the world matches the 2×-scaled DOM UI.
    //
    // THESE TWO CONVERSIONS CARRY THE WORLD PROJECTION (render/tilt.ts), and
    // they are the one place the whole app needs it: the ground plane is tilted
    // (and, with the yaw knob up, turned), so a step down the screen is not a
    // step of the same size south. Every screen↔world crossing outside the
    // renderer goes through this pair — where the player is pointing, which foe
    // the cursor is aiming at, whether a tap landed on the merchant, and where
    // a floating DOM label pins itself over a world point. Get it wrong and the
    // hero walks off at a slightly different angle than the one he was asked
    // for, which is the kind of bug that reads as "the controls feel drifty".
    let cssPerCanvasPx = VIEW_SCALE;
    const viewport: Viewport = {
      toWorld: (cssX, cssY, camera) =>
        canvasToWorld(cssX / cssPerCanvasPx, cssY / cssPerCanvasPx, camera),
      toCss: (worldX, worldY, camera) => {
        const at = worldToCanvas(worldX, worldY, camera);
        return { x: at.x * cssPerCanvasPx, y: at.y * cssPerCanvasPx };
      },
      uiScale: uiScaleFor(window.innerWidth, window.innerHeight),
    };
    const resize = () => {
      const scale = viewScaleFor(window.innerWidth, window.innerHeight);
      canvas.width = Math.max(1, Math.ceil(canvas.clientWidth / scale));
      canvas.height = Math.max(1, Math.ceil(canvas.clientHeight / scale));
      cssPerCanvasPx = canvas.clientWidth / canvas.width;
      viewport.uiScale = uiScaleFor(window.innerWidth, window.innerHeight);
    };
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    resize();

    const botFeedback = createBotFeedback({
      canvas,
      toCss: viewport.toCss,
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
      runCommand(state, "pauseGame");
      pauseMusic();
      bumpUi();
    };
    const resumeRun = () => {
      if (state.phase !== "paused") return;
      userPausedRef.current = false;
      runCommand(state, "resumeGame");
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
      pickupCardTapRef,
      userPausedRef,
      dialogueRevealRef,
      introRevealRef,
      cutsceneRevealRef,
      weaponMenuOpenRef,
      setWeaponMenuOpen,
      setCharTab,
      pause,
      resume: resumeRun,
      beginRun,
      bumpUi,
    });

    const reactions = createTickReactions({
      state,
      // A SPECTATOR banks nothing, exactly as the demo banks nothing: the kills
      // on this screen are somebody else's, and a lifetime ledger that counted
      // them would pay a watcher for a run they are not playing.
      transient: demo || Boolean(join),
      difficulty,
      celebrateAchievements,
    });
    const progress = createRunProgress({
      characterRef,
      checkpointRef,
      difficulty,
      // A real run funds its purse from the hero's whole wealth (banked coins +
      // pendingCoins) at start (run-setup.ts), so banking must not fold the
      // pending in again. BOT VIEW / demo fly a synthetic loadout, not the
      // hero's purse, so they keep the plain fold.
      coinsIncludePending: !botView && !demo,
      runLevelId,
      captureEnabled: session.captureCheckpoint,
      setHud,
      setLevelId,
      setNewRecord,
    });
    progressRef.current = progress;
    // A fresh run starts with no picker open — a door tapped on the way out
    // of the last level must not greet the arrival.
    setTravelDoor(null);
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
      setDifficulty,
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

    const renderFrame = createRenderFrame({
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
      staminaFillRef,
      dpadRef,
      botDpadRef,
      powerupDockRef,
      lastAreaRef,
      areaCaptionSeq,
      setAreaCaption,
      guideBlinkRef,
      setHud,
    });
    // One COMPLETE frame is the line between "a bad frame in a live run"
    // (survivable — see onError below) and "a run that cannot start" (fatal).
    // Flipped after the first render that returns without throwing, which is
    // also what publishes the first HUD snapshot React's whole overlay stack
    // is gated on.
    let firstFrameOk = false;
    const render = (timeMs: number) => {
      renderFrame(timeMs);
      firstFrameOk = true;
    };

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
        // The character only targets what the player can see — and the tilt
        // means he can see FURTHER up and down than the canvas is tall
        // (render/tilt.ts), so this rect is measured in world units. The fog
        // reveal, the companions' screen-edge follow and the death scene's
        // framing all read it.
        const worldRect = worldViewRect(canvas.width, canvas.height);
        input.view = {
          x: camera.x + worldRect.x,
          y: camera.y + worldRect.y,
          width: worldRect.width,
          height: worldRect.height,
        };
        // AUTO PILOT refused at the door (the banked purse can't fund the
        // rung on this fresh run): freeze the run where it stands so the
        // hero isn't slaughtered unattended, and say why.
        if (autopilotDirector.consumeBrokeAtDoor()) {
          feed.push("AUTO PILOT · OUT OF COINS", "#ffcf6b");
          pause(true);
          bumpUi();
        }
        // CONTROLLER NAVIGATION yields to the field. `playing` is exactly
        // "the run owns the input": every menu and overlay the game can put up
        // — paused, levelup, shop, dying, victory, dialogue — is its own phase,
        // so each of them keeps full controller navigation, and only live play
        // gives it up. Set every tick rather than on transitions so no path out
        // of a phase can leave it stuck.
        // `bossDeath` joins `playing` on the FIELD side of that split, and it is
        // the one phase where that is not obvious: it puts no menu up, the run
        // is still simulating, and the only press it wants is "get on with it"
        // (handled in controls.ts). Left out, the arrow keys would start driving
        // menus in the middle of a finisher.
        setGamepadKeysSuspended(
          state.phase === "playing" || state.phase === "bossDeath",
        );
        // The driving seat: the developer BOT VIEW / `?bot=` playtest bot, or
        // the paid AUTO PILOT's own bot while its engine meter runs.
        const drivingBot = botDriver.resolveDrivingBot();
        if (drivingBot) {
          botDriver.drive(drivingBot, dtMs);
        } else {
          // Poll the controller once per tick and hand the snapshot down.
          // Polling here rather than inside the input assembly keeps that
          // function pure-ish and gives every consumer the SAME frame — two
          // polls in one tick can disagree, which is how a press gets missed.
          gamepadRef.current = pollGamepad(gamepadRef.current?.index);
          readHumanInput(input, {
            state,
            pointer: controls.pointer,
            camera,
            viewport,
            queues,
            gamepad: gamepadRef.current,
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
          // A joined client may look at a door but not swap the level — the
          // session is the host's, so the picker mounts read-only there
          // (TravelPanel's canTravel) and the tap itself stays enabled.
          openTravelDoor: (doorId) =>
            setTravelDoor({ doorId, character: characterRef.current }),
        });
        // The fill level BEFORE this step, so a kill that starts a fresh streak
        // can anchor the bright slice at the XP the hero already had.
        const xpBeforeStep = localHero(state).xp;
        // The hp BEFORE this step, so the damage haptic below can weigh the
        // buzz by how big a bite the tick actually took out of the bar (a shield
        // may absorb part of a blow, so the felt loss is the true hp delta, not
        // the raw damage the engine rolled).
        const hpBeforeStep = localHero(state).hp;
        // `timeScale` (?debug `window.__timeScale`) slows the whole run for
        // animation tuning — a neutral 1 in normal play.
        driver.advance(input, dtMs * tuning.timeScale);
        botDriver.postStep(drivingBot);
        // HOW TO PLAY: offer the AMBIENT lessons this tick made true — the
        // sprint pool run low under a standing hero, a worn weapon, a pack
        // worth opening (see demo-lessons.ts). Run AFTER the step so it reads
        // the state the viewer is about to see, and after postStep so the bot's
        // own bag sweep has settled. A no-op outside the demo.
        demoDirector.watchLessons(dtMs, () => {
          // The hero's own screen point, for a lesson about something on the
          // FIELD (the ding's shockwave) rather than a HUD control. A thunk —
          // the rect read only happens on the tick a lesson is actually due.
          const cr = canvas.getBoundingClientRect();
          const at = viewport.toCss(
            localHero(state).pos.x,
            localHero(state).pos.y,
            camera,
          );
          return { x: cr.left + at.x, y: cr.top + at.y };
        });
        // ?debug `window.__nuke()` sets off a real screen-nuke at the hero
        // without the rare pickup — run post-step so its events (the `nuke`
        // flash plus the incinerated-mob kills) survive the next step's clear
        // and flow through the normal sound + FX consumers below.
        if (tuning.nukePending) {
          tuning.nukePending = false;
          debugDetonateNuke(state);
        }
        // ?debug `window.__levelup()` plays the whole ding SPECTACLE at the hero
        // without leveling — run post-step so its `levelUp` event (and the light
        // shockwave it arms) survive the next step's clear and flow through the
        // normal sound + FX consumers below.
        if (tuning.levelUpPending) {
          tuning.levelUpPending = false;
          debugLevelUpFx(state);
        }
        progress.captureCheckpoint(state);
        // Everything the app does with this tick's EVENTS — their sounds, the
        // haptics for the ones you should feel, and the achievement ledger
        // (tick-reactions.ts). Runs before the next step clears the list.
        reactions.consume(hpBeforeStep);
        // WHO KILLED HIM (softcore defeat splash). Read off THIS tick's events:
        // `playerDeath` rides the same list as the blow that landed it, so the
        // attribution is exact without a clock or a recency window. Resolved to
        // its display name here so the modal renders a string.
        const fatal = fatalBlow(state.events);
        if (fatal) setKilledBy(killerLabel(fatal.cause));

        trackXpHeat(shared, state, xpBeforeStep);
        // Big kills merge their XP into one oversized pop (event-fx.ts);
        // the marked drips are skipped by the per-kill float below.
        const mergedKills = mergePackKillXp(shared, state);
        // A signature melee weapon throws THEMED gore on the hero's own blows.
        const heroGore = heroGoreThisTick(state);

        const fxCtx = {
          state,
          shared,
          sprites: assets.sprites,
          mergedKills,
          heroGore,
          pushPickup: feed.push,
          showAreaCaption,
          showQuestFlash,
          showPickupCard: cardQueue.show,
        };
        for (const event of state.events) {
          // Visual/feedback reactions first (they match the engine's own event
          // order), then the BOT VIEW ripples, then the character/checkpoint
          // banking, then the AUTO PILOT flight director — the same relative
          // order the monolithic loop ran these in.
          applyEventFx(event, fxCtx);
          // The screen-clearing NUKE also fires its screen-space CSS detonation
          // (flash / light / fire / smoke), centred on the blast's screen point;
          // the canvas keeps the world-anchored rings + embers + scorch.
          // A WARD SHIELD breaking is the one elite-tier moment that earns a
          // screen-space wash — see game-screen/elite-css-fx.ts for why the
          // other nine primitives deliberately stay on the canvas.
          if (
            event.type === "eliteCast" &&
            event.kind === "ward_shield" &&
            event.phase === "end"
          ) {
            eliteFx.flash(event.look);
          }
          if (event.type === "nuke") {
            const cr = canvas.getBoundingClientRect();
            const at = viewport.toCss(event.pos.x, event.pos.y, camera);
            nukeFx.fire(cr.left + at.x, cr.top + at.y);
          }
          // The DING also fires its full-screen light explosion (blinding flash
          // / bloom / god-rays / pillar / sparkles), centred on the hero's
          // screen point; the canvas keeps the world-anchored blast + rings +
          // sparkle-stars. The modal rises out of the fading glare a beat later.
          if (event.type === "levelUp") {
            const cr = canvas.getBoundingClientRect();
            const at = viewport.toCss(
              localHero(state).pos.x,
              localHero(state).pos.y,
              camera,
            );
            levelUpFx.fire(
              cr.left + at.x,
              cr.top + at.y,
              // Sized to the level reached, like the canvas blast and the burn.
              levelUpIntensity(event.level),
            );
          }
          // The POWERUPS' loud beats wash the whole frame: a wave reaching the
          // glass, a shield giving up, a ward refusing a killing blow, a moon
          // rock landing. The world-anchored halves ride the canvas
          // (render/powerup-bursts.ts), so the two read as one event.
          if (event.type === "voidWave") powerupAura.flash("powerup-wave");
          if (event.type === "barrierBroke") {
            powerupAura.flash("powerup-shatter");
          }
          if (event.type === "wardHeld") powerupAura.flash("powerup-save");
          if (event.type === "meteorFall") powerupAura.flash("powerup-quake");
          if (bot) botFeedback.onEvent(event, state, camera);
          progress.onEvent(event, state);
          autopilotDirector.onEvent(event, state);
        }
        // Money taken in one breath floats as ONE number: the group lands the
        // moment the piles stop arriving, which needs a tick of its own rather
        // than an event (the last pile of a handful is still an event too early).
        flushGoldPickups(shared, state, feed.push);
        expireEffects(shared, state);
        // The sustained powerup auras track the run's live power list — a
        // spectral wash, a hot rim, a gilded frame — and can never outlive
        // the power that raised them (the sync is a no-op when nothing moved).
        powerupAura.sync(state);
        // EVERY CONSUMER OF THIS TICK'S EVENTS HAS NOW RUN. On the local path
        // that is all this is; on the net path it is where the list is emptied,
        // because `step()` — which does it here — is running in another
        // process. See run-driver.ts for what leaving it in place sounds like.
        driver.endTick();
      },
      render,
      // A frame that throws no longer takes the run down with it (see
      // game-loop.ts): the loop keeps stepping and drawing, and the failure is
      // booked here so `?debug`'s log buffer carries it into a bug report
      // instead of the run simply stopping dead with nothing to go on.
      onError: (err, phase) => {
        error(`game loop ${phase} failed: ${describeError(err)}`);
        // Failed before ever completing a frame: the run is dead on arrival
        // (a deterministic engine re-throws the same way every frame), and no
        // HUD means no UI ever mounts to escape through. Hand the error to
        // React — the throw in the render body routes it to App's
        // ErrorBoundary and the player gets a RELOAD screen instead of a
        // frozen picture.
        if (!firstFrameOk) {
          setFatalRunError(
            err ?? new Error(`game loop ${phase} failed before first frame`),
          );
        }
      },
    });

    return () => {
      stop();
      // A joined run's driver belongs to the join effect, which holds the
      // connection for the whole mount: disposing it here would drop the
      // session every time this effect re-ran.
      if (!joined) driver.dispose();
      stopMusic();
      controls.detach();
      observer.disconnect();
      feed.dispose();
      tapFx.dispose();
      nukeFx.dispose();
      eliteFx.dispose();
      levelUpFx.dispose();
      powerupAura.dispose();
      cardQueue.dispose();
      demoDirector.dispose();
    };
  }, [
    assets,
    join,
    joined,
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
    demoState.setDemoTalentFocus,
    queues,
    setDemoTip,
  ]);

  // A run that failed before its first complete frame (see the loop's
  // onError): re-throw during render so App's ErrorBoundary catches it and
  // shows the RELOAD screen. The parked run (if this was a resume) was already
  // consumed, so reloading lands on a working title menu.
  if (fatalRunError !== null) {
    throw fatalRunError;
  }

  if (!assets) {
    return <LoadingScreen />;
  }
  // JOINING: the handshake, then somebody else's level being built. It can take
  // seconds and it can be refused, so it says which — a spinner that turns into
  // a black screen is how "multiplayer is broken" gets reported.
  if (join && !joined) {
    return (
      <ConnectingScreen
        font={assets.font}
        target={join.label ?? join.address ?? "THE SESSION"}
        refusal={joinRefusal}
        onBack={onQuit}
      />
    );
  }
  const font = assets.font;
  // Which bottom corner the powerup dock lives in; the pickup feed takes the
  // opposite one. Read live so the title-screen toggle applies next run.
  const powerupSide = getSettings().powerupSide;
  // SWIPE BARS (SETTINGS → GAMEPLAY, touch only): the fixed corner docks stand
  // down and an edge swipe summons both bars where the thumb is (SwipeDock).
  // Read live like the row above, so the title-screen toggle applies next run.
  const swipeBars = hasTouch && getSettings().swipeBars === "on";
  // The consumable dock rides with the powerups in portrait (stacked above
  // them), but crosses to the OPPOSITE corner in landscape so the two rows split
  // left/right instead of piling up on one side of the field.
  const oppositeSide = powerupSide === "left" ? "right" : "left";
  const consumableSide = wide ? oppositeSide : powerupSide;
  // Show 1/2/3 · Q · 1-4 key caps on the dock and weapon switcher only when
  // desktop keyboard controls are on (touch has no keys to hint).
  const keyHints = getSettings().keyboardMove === "on";
  // SETTINGS → VISUALS, the CSS half: the grade on the canvas plus the vignette
  // and haze overlay. Read live like the rows above, so the title-screen sliders
  // apply to the next run. The haze is scaled by the live camera pitch — a
  // picture looking straight down has no horizon to fade toward — which is why
  // this goes through `fxStyleVars` rather than writing the numbers inline.
  const fxSettings = getSettings();
  const fxVars = fxStyleVars(
    fxSettings,
    fxSettings.cameraPitch,
  ) as CSSProperties;
  // Both overlay gradients off means the element is `display: none` rather than
  // two transparent layers the compositor still has to blend every frame.
  const fxOn = fxSettings.vignette > 0 || fxSettings.depthHaze > 0;

  // Raise the character screen on one of its two faces (Diablo 2's split): the
  // engine freeze is the same either way, only the panel differs. One helper so
  // every entry point — the portrait, the bag pouch, the inventory key — agrees
  // on the order (pick the face BEFORE the freeze, or the panel that mounts is
  // whichever one was up last time).
  const openCharScreen = (tab: CharTab) => {
    if (!state || !canOpenInventory(state)) return;
    setWeaponMenuOpen(false);
    setCharTab(tab);
    runCommand(state, "openInventory");
    playUiSound(synth, "confirm");
    bumpUi();
  };

  // The hero-avatar button, built for whichever face it should open. In the
  // playing HUD, pressing your own portrait opens your CHARACTER SHEET the way
  // it does in D2 — the bag pouch sits right beside it and owns the bag. Over
  // an ARRIVAL SCENE there is no pouch (the HUD proper is hidden) and the whole
  // reason the avatar is re-parked there is to equip a fitting weapon before
  // the fight, so that copy opens the BAG instead.
  const heroAvatarFor = (tab: CharTab) =>
    hud && (
      <HeroAvatar
        state={state}
        appearance={hud.appearance}
        level={hud.level}
        assets={assets}
        font={font}
        onOpen={() => openCharScreen(tab)}
      />
    );
  const heroAvatar = heroAvatarFor("stats");

  return (
    // The VISUALS custom properties go on the SCREEN ROOT, not on the overlay
    // below: the colour grade is a `filter` on the CANVAS, which is the overlay's
    // SIBLING, so variables set on the overlay would never reach it. On the root
    // they inherit to both.
    <div ref={screenRef} className="game-screen" style={fxVars}>
      <canvas ref={canvasRef} className="game-canvas" />

      {/* THE VIGNETTE AND THE DEPTH HAZE (SETTINGS → VISUALS) — two CSS
          gradients over the finished picture, at device resolution and free per
          frame, where compositing them into the ~422x195 canvas would cost a
          full-frame draw every frame to come out banded (render/postfx.ts).
          Immediately after the canvas and before every HUD element, which is
          exactly what puts it over the field and under the interface. */}
      <div className={`game-fx${fxOn ? " is-on" : ""}`} aria-hidden="true">
        <div className="game-fx-vignette" />
        <div className="game-fx-haze" />
      </div>

      {/* The imperative chrome the render loop writes into directly: the
          touch dpad hint, BOT VIEW's steer dpad + tap-ripple layer, and the
          FPS meter (ScreenChrome.tsx). */}
      <ScreenChrome
        dpadRef={dpadRef}
        botDpadRef={botDpadRef}
        tapFxRef={tapFxRef}
        nukeFxRef={nukeFxRef}
        eliteFxRef={eliteFxRef}
        levelUpFxRef={levelUpFxRef}
        powerupAuraRef={powerupAuraRef}
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
          weaponMenuOpen={weaponMenuOpen}
          onToggleWeaponMenu={setWeaponMenuOpen}
          keyHints={keyHints}
          minimapRef={minimapRef}
          xpHeatRef={xpHeatRef}
          staminaFillRef={staminaFillRef}
          heroAvatar={heroAvatar}
          onOpenBag={() => openCharScreen("bag")}
          onOpenQuestLog={() => {
            if (state.phase !== "playing") return;
            setWeaponMenuOpen(false);
            runCommand(state, "openQuestLog");
            playUiSound(synth, "confirm");
            bumpUi();
          }}
          autopilotOverlay={
            state.autopilot.active && (
              <AutopilotPanel
                state={state}
                font={font}
                sprites={assets.sprites}
                coins={hud.coins}
                characterRef={characterRef}
                autopilot={autopilot}
                bumpUi={bumpUi}
              />
            )
          }
          userPausedRef={userPausedRef}
          bumpUi={bumpUi}
        />
      )}

      {hud?.phase === "playing" && !swipeBars && (
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

      {!swipeBars && (
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
            if (state && runCommand(state, "discardHeldAbility", index)) {
              playUiSound(synth, "back");
              return true;
            }
            return false;
          }}
        />
      )}

      {/* SWIPE BARS: the fixed docks' stand-in — an edge swipe reveals both
          slot groups where the thumb is (SwipeDock.tsx). The render loop's
          cooldown writes ride the same dockRef either way. */}
      {swipeBars && (
        <SwipeDock
          hud={hud?.phase === "playing" ? hud : null}
          assets={assets}
          font={font}
          dockRef={powerupDockRef}
          onSpend={queues.queueDockSpend}
          onUse={queues.queueConsumable}
        />
      )}

      {hud?.phase === "playing" && (
        <PickupFeed
          font={font}
          messages={pickups}
          side={powerupSide === "left" ? "right" : "left"}
        />
      )}

      {/* THE ON-SCREEN QUEST TRACKER — what is running, in the corner, over
          the fight (game-screen/QuestTracker.tsx). Tap-transparent: the strip
          annotates the run, it must never eat a steering press. */}
      {state && hud?.phase === "playing" && (
        <QuestTracker state={state} font={font} />
      )}

      {/* The AUTO PILOT LOOT history — a full-shell modal. */}
      {state && state.autopilot.active && autopilot.historyOpen && (
        <AutopilotHistoryModal
          state={state}
          font={font}
          autopilot={autopilot}
        />
      )}

      {/* The area caption — keyed on its bump id so walking into a room (or
          clearing one out) remounts the label and replays its one-shot fade.
          The remount-keyed surfaces here (caption, quest flash, pickup card,
          achievement toast) are SIBLINGS counted by independent
          sequences, so each key carries its own prefix — bare numbers collide
          the moment two of the counters reach the same value, which React
          reports as duplicate children. */}
      {hud?.phase === "playing" && areaCaption && (
        <AreaCaption
          key={`area-${areaCaption.id}`}
          label={areaCaption.label}
          color={areaCaption.color}
          font={font}
        />
      )}

      {/* THE QUEST PROGRESS FLASH — "SCRAP DRONES: 3/10" over the middle of the
          field the moment the tally moves, keyed on its bump id so every
          objective bump replays the pop (QuestFlash.tsx). */}
      {hud?.phase === "playing" && questFlash && (
        <QuestFlash
          key={`quest-${questFlash.id}`}
          text={questFlash.text}
          done={questFlash.done}
          font={font}
        />
      )}

      {/* The framed pickup card for freshly bagged gear. Keyed by the card id
          so a new find remounts the box and restarts its pop + border spark. */}
      {hud?.phase === "playing" && pickupCard && (
        <PickupModal
          key={`card-${pickupCard.id}`}
          font={font}
          relicFonts={assets.relicFonts}
          card={pickupCard}
          cardRef={pickupCardElRef}
        />
      )}

      {/* THE SESSION'S CHAT — mounted only when there IS a session, which is
          what `driver.session` answers. Its own overlay rather than a panel
          inside the pause screen: what it is for is being read while the fight
          goes on, and a chat you have to pause the game to see is a chat
          nobody uses. It hands ENTER back whenever a screen that owns the
          keyboard is up. */}
      {sessionLink && (
        <ChatOverlay
          font={font}
          link={sessionLink}
          suspended={hud?.phase !== "playing"}
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
          demoTalentFocus={demo ? demoTalentFocus : null}
          heroAvatar={heroAvatarFor("bag")}
          charTab={charTab}
          onCharTab={setCharTab}
          // Both are immutable for a hero's whole life, so the mounting prop
          // is as fresh as the ref the victories rewrite (and readable during
          // render, which the ref is not).
          heroName={character.name}
          hardcore={character.hardcore}
          onBeginRun={() => {
            // Leave the level-name card and drop into the run — the level
            // music rolls the moment play begins.
            runCommand(state, "dismissIntro");
            playLevelMusic(runLevelDef(state).music);
            bumpUi();
          }}
          bumpUi={bumpUi}
        />
      )}

      {/* THE TRAVEL PICKER — where the tapped standing door (the garage's
          rocket / rift portal) can take you. The run keeps playing behind it
          (a hub is safe ground), so it hangs off its own React state rather
          than an engine phase; the trip itself is run-progress's travelTo,
          the same crossing a gateEntered books. The character travels WITH
          the open (snapshotted at the tap), so the render never touches the
          live ref. */}
      {state && travelDoor && hud?.phase === "playing" && (
        <TravelPanel
          state={state}
          font={font}
          doorId={travelDoor.doorId}
          character={travelDoor.character}
          difficulty={difficulty}
          canTravel={!join}
          onTravel={(dest) => {
            setTravelDoor(null);
            playUiSound(synth, "confirm");
            progressRef.current?.travelTo(state, dest);
          }}
          onClose={() => {
            setTravelDoor(null);
            playUiSound(synth, "back");
          }}
        />
      )}

      {/* THE TALK BOX — a conversation the player STEERS: what a bystander
          says, and what the hero may say back. Its own `talk` phase, frozen
          exactly as the errand box is; every branch is an engine mutator, so
          the box owns none of the rules. */}
      {state && hud?.phase === "talk" && (
        <TalkOverlay
          state={state}
          assets={assets}
          font={font}
          onAdvance={() => {
            runCommand(state, "advanceTalk");
            playUiSound(synth, "move");
            bumpUi();
          }}
          onPick={(index) => {
            runCommandOk(state, "pickTalkChoice", index);
            playUiSound(synth, "confirm");
            bumpUi();
          }}
          onBlip={() => {
            playUiSound(synth, "blip");
            playTypewriterHaptic();
          }}
          onClose={() => {
            runCommand(state, "closeTalk");
            playUiSound(synth, "back");
            bumpUi();
          }}
        />
      )}

      {/* THE QUEST BOX — the conversation with somebody who has an errand.
          The run is frozen behind it in its own `quest` phase, exactly as it
          is behind the shop; every action here is an engine mutator, so the
          box owns none of the rules. */}
      {state && hud?.phase === "quest" && (
        <QuestOverlay
          state={state}
          assets={assets}
          font={font}
          onAdvance={() => {
            runCommand(state, "advanceQuestDialogue");
            playUiSound(synth, "move");
            bumpUi();
          }}
          onAccept={() => {
            runCommandOk(state, "acceptQuest");
            playUiSound(synth, "confirm");
            bumpUi();
          }}
          onDecline={() => {
            runCommandOk(state, "declineQuest");
            playUiSound(synth, "back");
            bumpUi();
          }}
          onTurnIn={() => {
            runCommand(state, "turnInQuest");
            playUiSound(synth, "confirm");
            bumpUi();
          }}
          onPick={(questId) => {
            runCommandOk(state, "pickQuestTopic", questId);
            playUiSound(synth, "confirm");
            bumpUi();
          }}
          onChooseReward={(index) => {
            runCommandOk(state, "chooseQuestReward", index);
            playUiSound(synth, "move");
            bumpUi();
          }}
          onBlip={() => {
            playUiSound(synth, "blip");
            playTypewriterHaptic();
          }}
          onClose={() => {
            runCommand(state, "closeQuestDialogue");
            playUiSound(synth, "back");
            bumpUi();
          }}
        />
      )}

      {/* The paused-phase menus: the demo's exit confirm, or the ordinary
          pause menu with its AUTO PILOT engage row (PausedOverlays.tsx). */}
      {state && hud?.phase === "paused" && (
        <RunPausedOverlay
          state={state}
          font={font}
          relicFonts={assets.relicFonts}
          sprites={assets.sprites}
          demo={demo}
          botView={botView}
          hardcore={character.hardcore}
          userPausedRef={userPausedRef}
          characterRef={characterRef}
          difficulty={difficulty}
          autopilot={autopilot}
          onQuit={onQuit}
          onExitToMenu={onExitToMenu}
          bumpUi={bumpUi}
          sessionLink={sessionLink}
        />
      )}

      {/* The achievement unlock banner — any phase: a badge earned on the
          winning blow still gets its moment over the victory splash. */}
      {achievementToast && (
        <AchievementToast
          key={`toast-${achievementToast.id}`}
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
            if (state && runCommandOk(state, "stayOnField")) {
              setHud(null);
              playLevelMusic(runLevelDef(state).music);
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
          killedBy={killedBy}
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
