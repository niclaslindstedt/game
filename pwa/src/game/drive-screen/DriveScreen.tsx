// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE DRIVE, ON SCREEN — the minigame's whole app half: a canvas, a fixed-step
// loop, one thumb's worth of input, and the four things the hero says.
//
// IT IS ITS OWN MOUNT, deliberately. A drive is not a run — no `GameState`, no
// HUD model, no session, no autopilot — so folding it into `GameScreen`'s loop
// would mean teaching every one of those to sit an interlude out. Instead the
// game screen hands the wheel over and takes it back: while a drive is up this
// component owns the picture and the input, and when it ends it calls
// `onArrived` and the crossing happens exactly as it would have a minute
// earlier.
//
// THE GORE GATE IS ASKED ONCE, BEFORE THE ROAD EXISTS (`driveParamsFor`), and
// the answer rides in on `DriveParams.gib`. That is the house rule — the gate
// goes where the thing is DECIDED — and here it also has to be a single answer
// for the whole road: a switch flipped mid-drive would leave half the tarmac
// gibbed and half of it lying in the gutter. So this screen never asks: it
// reads what the drive was built with, exactly like the difficulty beside it.

import type { CSSProperties, ReactElement } from "react";
import { useCallback, useEffect, useRef, useState } from "react";

import {
  createDrive,
  createDriveDriver,
  driveDriverInput,
  driveScore,
  driveVerdict,
  restartDrive,
  stepDrive,
  thoughtDef,
  withHeroNameLines,
  DRIVE,
  DRIVE_OUTCOME,
  type DriveDriver,
  type DriveInput,
  type DriveParams,
  type DriveState,
} from "@game/core";

import { type GameAssets } from "../assets.ts";
import { carKeyControl } from "../car-keys.ts";
import { actionForCode } from "../keybindings.ts";
import { getSettings } from "../settings.ts";
import {
  DialogueBox,
  IDLE_REVEAL,
  type DialogueReveal,
} from "../overlays/DialogueBox.tsx";
import { viewScaleFor } from "../render/view.ts";
import { createWearTrail, driveDials, sameDials } from "./dials.ts";
import { driveBindings, type DriveDials } from "../hud/bindings.ts";
// The run's own dpad-hint geometry, borrowed rather than restated: the road
// wears the same control and must not drift off it by a pixel.
import { DPAD_DEADZONE_PX, DPAD_RING_PX } from "../game-screen/player-input.ts";
import { HudRoot } from "../hud/HudRoot.tsx";
import type { HudContext } from "../hud/context.ts";
import { DriveIntro } from "./DriveIntro.tsx";
import { DrivePause } from "./DrivePause.tsx";
import {
  DriveScores,
  driveBoardResult,
  type DriveBoardResult,
} from "./DriveScores.tsx";
import {
  clearDriveFx,
  createDriveFx,
  drawDriveFx,
  shakeCamera,
  stepDriveFx,
  type DriveFxState,
} from "./drive-fx.ts";
import {
  clearDriveGore,
  createDriveGore,
  type DriveGoreState,
} from "./drive-gore.ts";
import { clearSkids, createSkids, type SkidState } from "./skid.ts";
import {
  createEngineNote,
  drainDrive,
  drawBursts,
  runEngineNote,
  type Burst,
} from "./loop.ts";
import { drawDrive, driveCamera } from "./render.ts";

/** The simulation's fixed step (ms) — the engine's own, so a drive ticks at the
 * same rate a run does and the physics is frame-rate independent. */
const STEP_MS = 16;
/** The most catch-up a single frame may do, so a backgrounded tab does not
 * resolve four seconds of collisions in one go. */
const MAX_CATCHUP_MS = 100;

/** How far the thumb has to travel from its anchor for the pad to be pushed all
 * the way over (client px). Deliberately a longer throw than the run's own walk
 * dpad (`DPAD_RING_PX`): on foot the thumb is picking a HEADING and wants to
 * reach full tilt at once, while here it is holding a LINE between two lanes,
 * and a pad that saturates in the first few px is a car that only ever steers
 * fully left or fully right. */
const PAD_REACH_PX = 48;

/**
 * One of the hero's thoughts, mid-delivery — which one, its pages, how far
 * through them he has got, and the drive-clock ms this page gives way at.
 *
 * IT IS A BARK, NOT A SCENE, and that is the whole design of the road's voice.
 * The first cut froze the world for it — the same freeze the run's own dialogue
 * is — and it was wrong for a reason that only shows up at speed: the hero's
 * line about minding how you go is funny BECAUSE he says it while driving, and
 * a box that stops the car to deliver it turns a man talking to himself at the
 * wheel into a cutscene about talking to himself. So it prints over the moving
 * road, holds long enough to read, and gets out of the way on its own. Nothing
 * on this screen ever waits for the player to dismiss a line.
 */
type Speech = {
  id: string;
  pages: string[][];
  page: number;
  /** Drive-clock ms this page is retired at — the drive's clock rather than
   * the wall's, so a paused road holds the line where it was. */
  untilMs: number;
};

/**
 * How long a page of it sits there: a fixed beat, plus reading time.
 *
 * The crawl prints at about 30 ms a character (`useTypewriter`), so the second
 * term covers the printing AND leaves the finished line up for roughly as long
 * again — which at the speeds this is read at is the difference between a line
 * the player noticed and one they saw go past.
 */
function barkMs(page: readonly string[]): number {
  const chars = page.join(" ").length;
  return Math.min(9000, Math.max(3600, 1800 + chars * 62));
}

export function DriveScreen({
  params,
  assets,
  onArrived,
  stage,
  heroName,
  heroPortrait,
  onScreenshot,
  onMenu,
  auto = false,
}: {
  params: DriveParams;
  assets: GameAssets;
  /**
   * The road is behind him: make the crossing that was waiting on it, carrying
   * what he made of the trip — `verdict` is the id of the thought the drive
   * earned (`driveVerdict`), spoken as the first page of the destination's
   * opening monologue rather than as a popup on the road.
   */
  onArrived: (to: string, bodies: number, verdict: string) => void;
  /**
   * DEVELOPER STAGING, run once on the fresh road before its first tick — the
   * hook the `?drive` workbench plants a body or a van in front of the bumper
   * with. A real drive passes nothing, so the road a player gets is the road
   * `createDrive` built and this parameter does not exist for them.
   */
  stage?: (drive: DriveState) => void;
  /** The name the player gave this hero — the speech box's own header. */
  heroName?: string;
  /**
   * His face, already composed by the caller.
   *
   * The DOLL is built from a `GameState` (worn armor, held weapon, the blood on
   * his coat) and a drive has none — so the screen that mounts the road hands
   * the picture in rather than this one reaching for a run it deliberately does
   * not have. Omitted (the `?drive` workbench) → the box prints his name over
   * the lines with no portrait panel, which is the same box a shade shorter.
   */
  heroPortrait?: string | null;
  /** Take a picture (the SCREENSHOT bind). The road is inside the run's own
   * screen, so the caller owns the roll and the flash; all this does is notice
   * the key, because while a drive is up the run's controls are not listening. */
  onScreenshot?: () => void;
  /**
   * LEAVE THE GAME from the road — the pause card's MAIN MENU, once its confirm
   * has been answered.
   *
   * The road cannot hand a PARKED run back the way the fight's pause menu does:
   * the car is already away down a road that only exists while this screen is
   * up, and the run behind it is a level the hero has driven out of. So what
   * this means is settled by the host (GameScreen banks the hero as he sits and
   * ends the run), and the road only raises it. Absent — the `?drive`
   * workbench, which has no game behind it — and the row is not drawn.
   */
  onMenu?: () => void;
  /**
   * SOMEBODY ELSE AT THE WHEEL — the engine's own auto-driver
   * (`createDriveDriver`) supplies the input and the pad and the keys sit out.
   *
   * On for every run nobody is playing: the title-screen demo, a `?bot=`
   * playtest, `?drive&bot=1` in the workbench. Without it those land on a road
   * with nothing holding the throttle, the car coasts down from its opening 28%
   * and stops, and the drive never arrives — which is not a stalled MINIGAME,
   * it is a stalled attract loop, because the crossing on the far side of the
   * road is what the run was waiting for.
   *
   * The DIALOGUE needs no switch of its own: his lines are BARKED over a road
   * that never stops for them (see `Speech`), so an unattended drive pages
   * through them exactly as an attended one does — there is nothing here for a
   * missing thumb to be stuck on.
   */
  auto?: boolean;
}): ReactElement {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  /** THE STEERING HINT — the run's own virtual dpad (`ScreenChrome.tsx`), worn
   * by the road. Written straight onto DOM styles from the frame loop, exactly
   * as the run writes its own: a hint that re-rendered React on every pointer
   * move would be the most expensive thing on this screen. */
  const dpadRef = useRef<HTMLDivElement | null>(null);
  const driveRef = useRef<DriveState>(
    (() => {
      const drive = createDrive(params);
      stage?.(drive);
      return drive;
    })(),
  );
  const burstsRef = useRef<Burst[]>([]);
  const fxRef = useRef<DriveFxState>(createDriveFx());
  /** What the road is holding of the people it has met — the marks on the
   * tarmac and the bookkeeping behind them (`drive-gore.ts`). Held for the whole
   * leg and thrown away on a restart, exactly like the effect layer beside it:
   * the mess is a record of THIS attempt at the road. */
  const goreRef = useRef<DriveGoreState>(createDriveGore());
  /** …and what the DRIVER left on it: the rubber off every handbrake stop.
   * Thrown away on a restart with the rest of the mess — the marks are a record
   * of THIS attempt at the road. */
  const skidRef = useRef<SkidState>(createSkids());
  const engineRef = useRef(createEngineNote());
  const inputRef = useRef<DriveInput>({ pedal: 0, wheel: 0 });
  const keysRef = useRef<Set<string>>(new Set());
  const padRef = useRef<{ x: number; y: number } | null>(null);
  /** Which pointer anchored the pad, and every OTHER one currently down — the
   * second thumb, which is the handbrake for as long as it stays there. A SET
   * rather than a flag so a third finger arriving cannot release the lever the
   * second one is still holding. */
  const padIdRef = useRef<number | null>(null);
  const brakeIdsRef = useRef<Set<number>>(new Set());
  /** The pad's RAW drag, in client px, kept beside the -1…1 the car is steered
   * by. The two are not the same fact: the input is a clamped direction, and
   * the hint has to draw a nub that stops travelling at the ring while the
   * thumb keeps going. Presentation, so it is never read by the loop's input. */
  const padDragRef = useRef<{ dx: number; dy: number }>({ dx: 0, dy: 0 });
  /** …and WHAT anchored it. A mouse gets no dpad — the same rule the run
   * follows (`render-frame.ts`): the hint exists to show a finger where the
   * anchor it cannot see is, and a cursor is already visible. */
  const padTypeRef = useRef<string>("touch");
  /** The hands on the wheel when nobody's are — minted once, because the driver
   * carries the line it has committed to and rebuilding it every frame would be
   * a driver that never commits to anything. */
  const driverRef = useRef<DriveDriver | null>(
    auto ? createDriveDriver() : null,
  );
  const [speech, setSpeech] = useState<Speech | null>(null);
  const [paused, setPaused] = useState(false);
  /**
   * THE TITLE CARD, up until it isn't (`DriveIntro.tsx`) — "ROAD TO GOODCO"
   * over the black the garage's dim handed across.
   *
   * It HOLDS the road, exactly as the pause card and the board do: the fixed
   * step below breaks on it, so the first crowd of the leg is not walked into
   * during a title card.
   *
   * NOBODY'S THUMB, NO CARD. An `auto` road — the title-screen attract loop, a
   * `?bot=` playtest, a screenshot recipe — is not somebody arriving at a
   * minigame, and every one of those wants the road itself in the first frame.
   * (It is safe either way: the card times out on its own, so this is about
   * what those surfaces should LOOK like rather than about getting them
   * unstuck.) Mirrored onto a ref for the loop, which must not re-bind on it.
   */
  const [intro, setIntro] = useState(!auto);
  const introRef = useRef(!auto);
  /**
   * THE CABINET'S BOARD, once the road is behind him — the leg's score, where it
   * landed, and the board it landed on (`DriveScores.tsx`).
   *
   * It holds the road: the crossing that was waiting on the drive does not
   * happen until the player has signed off, which is the one place in this
   * minigame that DOES wait for a thumb. That is safe here and nowhere else,
   * because the board is never raised for an unattended drive (see `arrive`).
   *
   * Mirrored on a ref because the loop reads it every step and must not
   * re-bind on it.
   */
  const [board, setBoard] = useState<DriveBoardResult | null>(null);
  const boardRef = useRef<DriveBoardResult | null>(null);
  /**
   * THE DIALS — what the dashboard reads, republished only when one of them
   * actually moves.
   *
   * More than the shipped dashboard uses, on purpose: a dial that had to wait
   * for this screen to start publishing its number would be a dial nobody could
   * author. The continuous ones are QUANTISED — the revs to a sixteenth, the
   * crank to the nearest fifty rpm — because a needle wants smooth and a needle
   * that re-rendered React sixty times a second would be paying for the whole
   * HUD every frame. (A genuinely 60fps needle is a render-loop handle, the way
   * the stamina bar is.)
   */
  // Seeded from a road built here rather than from the live one, because a ref
  // must not be read during a render — and a fresh drive's dials are exactly
  // what the live one is about to publish on its first frame anyway.
  const [hud, setHud] = useState<DriveDials>(() =>
    driveDials(createDrive(params), false),
  );
  /** The damage dial's fresh-slice anchor. Held across ticks (and across a
   * restart, which lays a clean car and snaps it back to nothing on its own). */
  const wearTrailRef = useRef(createWearTrail());
  const speechRef = useRef<Speech | null>(null);
  const pausedRef = useRef(false);
  /** What the speech box says its tap means — the same seam the run's own
   * dialogue uses, so a keypress and a tap can never disagree about whether
   * this one finishes the crawl or turns the page. */
  const revealRef = useRef<DialogueReveal>(IDLE_REVEAL);

  /** Raise one of the hero's lines. Held on a ref as well as in state so the
   * loop can tell whether one is already up without re-rendering. */
  const say = useCallback(
    (id: string, nowMs: number) => {
      const def = thoughtDef(id);
      if (!def) return;
      // A page may carry a `{ them: [...] }` block when somebody answers him;
      // none of the drive's do — he is alone in the car, which is the whole
      // joke — so the plain string rows are the whole of it.
      const pages = def.pages.map((page) => [
        ...withHeroNameLines(Array.isArray(page) ? page : page.them, heroName),
      ]);
      const next = {
        id,
        pages,
        page: 0,
        untilMs: nowMs + barkMs(pages[0] ?? []),
      };
      speechRef.current = next;
      setSpeech(next);
    },
    [heroName],
  );

  /** The bark's own clock, run from inside the loop: turn the page when this
   * one has had its time, and take the box away after the last. */
  const ageSpeech = useCallback((nowMs: number) => {
    const live = speechRef.current;
    if (!live || nowMs < live.untilMs) return;
    if (live.page + 1 >= live.pages.length) {
      speechRef.current = null;
      setSpeech(null);
      return;
    }
    const page = live.page + 1;
    const next = {
      ...live,
      page,
      untilMs: nowMs + barkMs(live.pages[page] ?? []),
    };
    speechRef.current = next;
    setSpeech(next);
  }, []);

  const setPause = useCallback((on: boolean) => {
    pausedRef.current = on;
    setPaused(on);
  }, []);

  /** The card has had its beat (or its tap): let the road run. Idempotent — the
   * timer and the touch both call it, and the loser must not restart anything. */
  const endIntro = useCallback(() => {
    if (!introRef.current) return;
    introRef.current = false;
    setIntro(false);
  }, []);

  /** Every control let go of at once — the accelerator, the wheel, both hands.
   * What a lost window leaves behind (see below), and what the pause card is
   * raised on top of, so nothing is still held when the road starts again. */
  const dropControls = useCallback(() => {
    keysRef.current.clear();
    padIdRef.current = null;
    padRef.current = null;
    padOrigin = null;
    brakeIdsRef.current.clear();
  }, []);

  // LOSING THE WINDOW PARKS THE CAR — the run's own auto-pause (alt-tab, a tab
  // switch, an app switch on a phone), which the road was missing for the
  // reason it was missing PAUSE and SCREENSHOT: while a drive is up the run's
  // control layer is not listening, so every rule that layer enforces has to be
  // enforced here too (controls.ts `onBlur`/`onVisibility`). Both signals are
  // watched because browsers disagree about which one a backgrounding fires,
  // and parking twice is parking once.
  //
  // Two things go with it, and the second is the one that bites: a key held
  // when the window went away never sees its `keyup`, so a wagon paused with
  // the accelerator down resumes at full throttle a minute later — which is
  // exactly the stuck-key the run clears on the same event.
  //
  // NOBODY'S THUMB, NO PAUSE. An `auto` road — the attract loop, a playtest, a
  // shot recipe — has no driver to come back and lift the card, so a pause it
  // cannot clear is a car parked for the rest of its life. The run reaches the
  // same outcome from the other end: it pauses, and the bot's input loop clears
  // it again on the next tick.
  useEffect(() => {
    if (auto) return;
    const park = () => {
      dropControls();
      // …BUT NEVER OVER THE BOARD. Once the leg is scored the road is already
      // stopped and there is nothing held to come back to, so a pause card
      // raised here would only cover the one thing on screen worth reading —
      // and it would be a card the board's own key handler is not listening to
      // dismiss. Dropping the controls above still matters: a key held when the
      // window went is a key with no `keyup` coming.
      //
      // Nor over the TITLE CARD, for the same reason twice over: the road it
      // would be pausing is already held, and the card's own listeners are not
      // watching for a card to be lifted off them.
      if (boardRef.current || introRef.current) return;
      setPause(true);
    };
    const onVisibility = () => {
      if (document.hidden) park();
    };
    window.addEventListener("blur", park);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("blur", park);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [auto, dropControls, setPause]);

  /**
   * THE ROAD IS BEHIND HIM. Either the cabinet gets its moment, or the crossing
   * happens exactly as it did before there was a board.
   *
   * NOBODY'S THUMB, NO BOARD. The attract loop, a `?bot=` playtest and every
   * screenshot recipe drive this road with the engine's own driver, and a
   * high-score screen waiting on a keypress would park the demo on it forever —
   * the same failure an unattended drive with nothing on the throttle is, one
   * screen later. So an auto-driven leg arrives silently, and it is not merely
   * that the board is hidden: it is never scored and never banked, because a
   * board full of the demo's own initials is not a high-score table.
   */
  const arrive = useCallback(
    (drive: DriveState) => {
      const to = drive.params.to;
      const verdict = driveVerdict(drive);
      if (auto) {
        onArrived(to, drive.bodies, verdict);
        return;
      }
      const result = driveBoardResult(
        driveScore(drive),
        drive.params.difficulty,
      );
      boardRef.current = result;
      setBoard(result);
    },
    [auto, onArrived],
  );

  /** Signed off: give the road back and make the crossing it was holding. */
  const leaveBoard = useCallback(() => {
    const drive = driveRef.current;
    boardRef.current = null;
    setBoard(null);
    onArrived(drive.params.to, drive.bodies, driveVerdict(drive));
  }, [onArrived]);

  /** A finger has left the picture: whichever of the two jobs it had stops. A
   * leftover brake finger never inherits the pad — the next press re-anchors
   * deliberately, which is the same rule the run's own tracker follows and for
   * the same reason: steering from an anchor somebody set down half a second
   * ago for something else is a car that darts. */
  const releasePad = useCallback((id: number) => {
    if (padIdRef.current === id) {
      padIdRef.current = null;
      padRef.current = null;
      padOrigin = null;
      return;
    }
    brakeIdsRef.current.delete(id);
  }, []);

  // ── THE CONTROLS ──────────────────────────────────────────────────────────
  // THE SAME CONTROLS THE GARAGE READS, and the engine resolves them the same
  // way: a pedal, a wheel, and nothing held holds the speed.
  //
  // A DRAG says a direction — along the nose is the accelerator, against it the
  // brake, across it the wheel — so the leg out (nose right) accelerates on
  // RIGHT and the leg home (nose left) accelerates on LEFT: "drag the way the
  // car is pointing", which is the one rule a thumb needs.
  //
  // THE KEYS ARE FIXED: D accelerates, A slows and backs up, W and S are the
  // wheel, on both legs and whichever way the wagon is facing.
  //
  // AND THE HANDBRAKE IS THE OTHER HAND — a second thumb anywhere on the
  // picture, or SPACE (the JUMP bind, which is the one action a man in a car
  // cannot perform). It is the fastest way this wagon stops by a long way, and
  // it is the only control on the road that needs no aim: what a driver wants
  // when a wall of people appears in lane two is one thing he can hit without
  // thinking about where.
  //
  // TWO OF THE RUN'S OWN BINDS ARE ANSWERED HERE TOO, and they have to be:
  // while a drive is up the run's control layer is not listening (there is no
  // live `GameState` under an interlude for it to be built around), so PAUSE
  // and SCREENSHOT would simply do nothing on the one screen a player is most
  // likely to want a picture of.
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      const action = actionForCode(e.code, getSettings().keybindings);
      if (action === "screenshot") {
        onScreenshot?.();
        return;
      }
      // WHILE THE BOARD IS UP, NOTHING HERE IS LISTENING. The screen owns the
      // keyboard (its own capture-phase handler turns the wheels), and the road
      // it would be steering is over — a PAUSE card raised over a high-score
      // table would cover the one thing on screen worth reading. The shutter
      // above is the deliberate exception: a player who just took the board is
      // exactly the player who wants a picture of it.
      if (boardRef.current) return;
      // …AND THE TITLE CARD OWNS THE FIRST KEYPRESS. Whatever it was going to
      // mean, it means "get on with it" (`DriveIntro` has its own listener for
      // that) — a PAUSE card raised over a card that is already holding the
      // road would be a hold on a hold, and a key banked into `keysRef` here
      // would be a control held down before the road ever moved.
      if (introRef.current) return;
      // ESCAPE is the pause on this screen whatever the bind says: it is what
      // every player reaches for, and the road has no other menu for it to
      // mean.
      if (action === "pause" || e.code === "Escape") {
        setPause(!pausedRef.current);
        return;
      }
      if (pausedRef.current) return;
      keysRef.current.add(e.code);
    };
    const up = (e: KeyboardEvent) => keysRef.current.delete(e.code);
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, [onScreenshot, setPause]);

  // ?debug — THE ROAD'S OWN `window.__game`.
  //
  // A run has been reachable from the console since the beginning
  // (`run-setup.ts`), and the drive never was, which made every question about
  // it ("is that moped carrying a rider", "did that car climb a rung", "how far
  // did the body actually go") one you could only answer by squinting at a
  // screenshot. The road is a simulation like any other and gets the same
  // handle: `window.__drive` is the live `DriveState`, so a staged collision is
  // a couple of lines in DevTools rather than a minute of hoping.
  //
  // IN AN EFFECT, and it has to be: writing to `window` and reading a ref
  // during render are both things React's own lint refuses (and is right to —
  // a render is not allowed to be the thing that has the side effect). One
  // shot on mount is enough because the ref's OBJECT never changes: a restart
  // is `Object.assign(drive, restartDrive(drive))`, which keeps the identity
  // the handle is pointing at.
  //
  // AND IT IS NOT CLEANED UP ON UNMOUNT, deliberately. The workbench remounts
  // this screen on every lap (its `key` carries the seed), so a teardown that
  // deleted the handle would run AFTER the next lap's setup had installed one
  // and leave the console holding nothing — the debug surface breaking exactly
  // when the road restarts, which is when it is most wanted. The run's own
  // `window.__game` is left standing for the same reason.
  useEffect(() => {
    if (!new URLSearchParams(window.location.search).has("debug")) return;
    (window as { __drive?: DriveState }).__drive = driveRef.current;
  }, []);

  const nose = params.direction === 1 ? 1 : -1;

  // ── THE LOOP ──────────────────────────────────────────────────────────────
  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    let acc = 0;
    // Resolved once per mount rather than per frame, exactly as the run
    // resolves its own (`render-frame.ts`): the hint is written to sixty times
    // a second and a `querySelector` in that loop is a lookup per frame for an
    // element that never changes.
    const dpad = dpadRef.current;
    const dpadNub = dpad?.querySelector<HTMLElement>(".dpad-nub") ?? null;

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext("2d");
      if (!canvas || !ctx) return;

      // Resize to the device, at the same integer scale tier the run uses.
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

      // Gather the controls. A thumb on the pad wins; otherwise the keys.
      //
      // THE TWO ARE READ DIFFERENTLY ON PURPOSE. A drag is a DIRECTION, so the
      // push read against the nose is the pedal and the push across it is the
      // wheel — exactly `carControl`'s reading, one frame earlier, and the
      // same "drag the way the car is pointing" the garage answers to. A KEY is
      // not a direction but a control on the car: D is the accelerator on both
      // legs of the road, even the one the wagon drives nose-LEFT
      // (`carKeyControl`, ../car-keys.ts).
      const pad = padRef.current;
      const drive = driveRef.current;
      const driver = driverRef.current;
      const keys = carKeyControl(keysRef.current, getSettings().keybindings);
      // THE LEVER IS NOT A PUSH, so it is composed rather than read off one: a
      // second thumb anywhere on the picture and the JUMP bind both haul on it,
      // and either does so whether the first thumb is saying anything or not.
      const handbrake = brakeIdsRef.current.size > 0 || keys.handbrake;
      inputRef.current = driver
        ? // NOBODY IS PLAYING THIS. The engine's own driver reads the road and
          // the thumb and the keyboard are ignored outright — not merely
          // unread: a stray keypress in a demo must not be able to steer the
          // car, and a screenshot recipe that holds a key down must not get a
          // different road than the one it asked for.
          driveDriverInput(driver, drive)
        : pad
          ? { pedal: pad.x * nose, wheel: pad.y, handbrake }
          : { ...keys, handbrake };

      // TWO THINGS PARK THE CAR: the pause card, and the high-score board at
      // the end of the leg. A LINE DOES NOT —
      // his thoughts are barked over a road that keeps moving (see `Speech`),
      // which is the only way a man muttering at the wheel reads as a man
      // muttering at the wheel, and it is also what leaves an UNATTENDED drive
      // (the attract loop, a playtest) nothing to be stuck on.

      // ── THE MOMENT ────────────────────────────────────────────────────────
      // THERE ISN'T ONE, AND THAT IS A DECISION. The road used to drop to a
      // quarter speed and lean the camera in the instant a collision stopped
      // being avoidable — a predictor in the engine (`inevitableHit`) armed a
      // dilation in the app. It was cut, both halves, because it was answering
      // the wrong question: a bullet-time beat is for a moment the player might
      // still do something about, and this one was fired precisely when they
      // could not. What it actually did was interrupt the DRIVING — the thing
      // the minigame is — several times a leg, on a road laid down so thick
      // that a hit is a couple of seconds away at all times. The tension here
      // is the wheel and the speed; slowing the world to admire a collision
      // spends it.
      acc += Math.min(MAX_CATCHUP_MS, now - last);
      last = now;
      while (acc >= STEP_MS) {
        acc -= STEP_MS;
        // RE-READ EACH STEP rather than latched once a frame: `endDrive` below
        // can raise the board mid-batch, and a latched flag would keep stepping
        // a road the player is already reading a scoreboard over.
        //
        // THREE THINGS PARK THE CAR and this is the first of them: the title
        // card at the top of the leg, the pause card, and the board at the end.
        // The road is PAINTED under all three — the frame below runs whatever
        // the step did — which is what makes the card lift onto a road that is
        // already there instead of onto a black rectangle.
        if (introRef.current || pausedRef.current || boardRef.current) break;
        stepDrive(drive, STEP_MS, inputRef.current);
        drainDrive(
          drive,
          burstsRef.current,
          fxRef.current,
          goreRef.current,
          skidRef.current,
          say,
        );
        ageSpeech(drive.ms);
        // THE FX AND THE ENGINE AGE ON THE DRIVE'S OWN CLOCK, inside the
        // fixed step — so a slow frame never skips a grain or fast-forwards a
        // spark, the pause card's freeze stops both dead exactly as it stops
        // the road, and the slow-motion slows them with it.
        stepDriveFx(fxRef.current, STEP_MS, drive.ms);
        runEngineNote(drive, engineRef.current);
        endDrive(
          drive,
          burstsRef.current,
          fxRef.current,
          goreRef.current,
          skidRef.current,
          arrive,
        );
      }

      // ── PAINT ─────────────────────────────────────────────────────────────
      const viewW = w / (scale * dpr);
      const viewH = h / (scale * dpr);
      const unit = scale * dpr;
      ctx.imageSmoothingEnabled = false;
      // THE CAMERA IS SHAKEN, NOT THE CONTEXT: everything drawn this frame —
      // the road, the crowd, the gore and the sparks — reads the same camera,
      // so the whole picture moves as one instead of the effects sliding
      // against the world they are standing in.
      const camera = shakeCamera(
        fxRef.current,
        driveCamera(drive, viewW, viewH),
        drive.ms,
      );
      ctx.setTransform(unit, 0, 0, unit, 0, 0);
      drawDrive(
        ctx,
        drive,
        camera,
        assets.sprites,
        viewW,
        viewH,
        drive.ms,
        goreRef.current,
        assets.font,
        skidRef.current,
      );

      burstsRef.current = drawBursts(
        ctx,
        burstsRef.current,
        camera,
        drive.ms,
        assets.sprites,
      );

      // The sparks, the grit, the smoke and the bloom — over the finished
      // picture, on the same camera it was drawn with.
      drawDriveFx(
        ctx,
        fxRef.current,
        camera,
        drive.ms,
        viewW,
        viewH,
        drive.car.pos,
      );

      // ── THE STEERING HINT ─────────────────────────────────────────────────
      // THE RUN'S OWN VIRTUAL DPAD, ON THE ROAD. The road's pad is anchored
      // wherever the thumb lands, exactly like the run's, and until now it drew
      // nothing at all: a player holding a line had no idea where the anchor he
      // was steering against actually was, and every re-anchor (a finger lifted
      // and put back down an inch away) was invisible. Same markup, same
      // classes, same DOM-per-frame writes as `render-frame.ts` — a control
      // scheme the player has already learned on foot must not be drawn a
      // second way in an interlude.
      if (dpad) {
        const show =
          !driver &&
          padIdRef.current !== null &&
          padTypeRef.current !== "mouse" &&
          !pausedRef.current &&
          !boardRef.current;
        dpad.style.display = show ? "block" : "none";
        if (show && padOrigin) {
          dpad.style.left = `${padOrigin.x}px`;
          dpad.style.top = `${padOrigin.y}px`;
          const { dx, dy } = padDragRef.current;
          const len = Math.hypot(dx, dy);
          const ux = len > 0 ? dx / len : 0;
          const uy = len > 0 ? dy / len : 0;
          // THE DEADZONE HERE IS THE HINT'S, NOT THE CAR'S. The wheel answers
          // the very first pixel of drag — that is what makes this pad feel
          // like a wheel rather than a switch — but four arrows flickering
          // around a resting thumb is noise, so only the ARROWS wait for a push
          // worth calling a direction. The nub follows from the first px.
          const lit = len >= DPAD_DEADZONE_PX;
          // cos(67°) ≈ 0.38: diagonals light up both of their arrows.
          dpad.dataset.left = lit && ux < -0.38 ? "1" : "";
          dpad.dataset.right = lit && ux > 0.38 ? "1" : "";
          dpad.dataset.up = lit && uy < -0.38 ? "1" : "";
          dpad.dataset.down = lit && uy > 0.38 ? "1" : "";
          if (dpadNub) {
            // The nub travels the drawn RING while the thumb travels the THROW:
            // the two are different lengths (`PAD_REACH_PX` vs `DPAD_RING_PX`),
            // so the head is on the rim exactly when the wheel is hard over
            // rather than a third of the way there.
            const reach =
              (Math.min(len, PAD_REACH_PX) / PAD_REACH_PX) * DPAD_RING_PX;
            dpadNub.style.transform = `translate(${ux * reach}px, ${uy * reach}px)`;
          }
        }
      }

      setHud((prev) => {
        const next = driveDials(drive, pausedRef.current, wearTrailRef.current);
        return sameDials(prev, next) ? prev : next;
      });
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [ageSpeech, arrive, assets, nose, say]);

  /** Give up on the road: arrive anyway, with whatever the trip had reached. */
  const skipDrive = useCallback(() => {
    setPause(false);
    const drive = driveRef.current;
    // He still made the trip — the game just stops showing it — so the verdict
    // is read off however far he actually got.
    onArrived(params.to, drive.bodies, driveVerdict(drive));
  }, [onArrived, params.to, setPause]);

  /**
   * WHAT THE DASHBOARD READS. The road's half of the same context the fight's
   * HUD is handed — no run state at all, because a drive has no hero, no bag
   * and no horde, and the union's tag is what stops a widget built for one
   * surface being drawn on the other.
   */
  const hudContext: HudContext = {
    surface: "drive",
    assets,
    font: assets.font,
    values: driveBindings(hud),
    refs: {},
    actions: {
      driveResume: () => setPause(false),
      driveSkip: skipDrive,
      // THE WAY OUT OF THE GAME, offered to an authored dashboard exactly as
      // the other two are — and absent, rather than dead, wherever the host has
      // no menu to drop to. An action the mounting screen does not supply is a
      // press that does nothing, which is the answer the vocabulary is built
      // around (hud-schema.mjs).
      ...(onMenu ? { driveMenu: onMenu } : {}),
    },
  };

  return (
    // The class carries ONE thing — the stacking band (styles.css). It has to
    // out-rank the departure curtain, which is still painted full black behind
    // a drive and would otherwise hide the entire road.
    <div className="drive-screen" style={SHELL}>
      <canvas ref={canvasRef} style={CANVAS} />
      {/* THE DASHBOARD — authored, exactly like the fight's HUD
          (`content/hud/elements/drive_*.yaml`, region `drive_bar`). What each
          dial SAYS is a Lua judgement in `content/hud/scripts/drive.lua`, so a
          conversion can give the wagon a rally's pace note or a delivery run's
          order slip without a line of code here.

          IN THE GAME'S OWN FONT, on the run's own frame sprite: everything else
          the player reads in this game is the pixel font, and a browser
          monospace here made the minigame look like a different program —
          exactly what an interlude must not do. */}
      <HudRoot ctx={hudContext} />

      {/* THE PAD — one thumb, anywhere on the picture. Dragging from where the
          thumb went down is the push; letting go means carry on, which is the
          whole of the control model.

          …AND THE OTHER THUMB IS THE HANDBRAKE. Every pointer after the first
          is a lever rather than a second pad: it needs no aim, no anchor and no
          drag, which is exactly right for the one control a driver reaches for
          without looking. The first finger down owns the pad and keeps it
          (`padIdRef`) — without that, a second thumb landing re-anchored the
          steering under the first one and the car snapped straight. */}
      <div
        style={PAD}
        onPointerDown={(e) => {
          (e.target as Element).setPointerCapture(e.pointerId);
          if (padIdRef.current !== null) {
            brakeIdsRef.current.add(e.pointerId);
            return;
          }
          padIdRef.current = e.pointerId;
          padTypeRef.current = e.pointerType;
          padRef.current = { x: 0, y: 0 };
          padDragRef.current = { dx: 0, dy: 0 };
          padOrigin = { x: e.clientX, y: e.clientY };
        }}
        onPointerMove={(e) => {
          if (e.pointerId !== padIdRef.current) return;
          if (!padRef.current || !padOrigin) return;
          const dx = e.clientX - padOrigin.x;
          const dy = e.clientY - padOrigin.y;
          padDragRef.current = { dx, dy };
          const len = Math.hypot(dx, dy) || 1;
          const reach = Math.min(1, len / PAD_REACH_PX);
          padRef.current = { x: (dx / len) * reach, y: (dy / len) * reach };
        }}
        onPointerUp={(e) => releasePad(e.pointerId)}
        onPointerCancel={(e) => releasePad(e.pointerId)}
      />
      {/* …AND WHERE THAT THUMB PUT IT DOWN. The run's own virtual dpad, part
          for part (`ScreenChrome.tsx`, `.touch-dpad` in styles.css): four
          arrows ringing the anchor that brighten toward the push, and a nub
          that trails the finger. The road had the same anchored pad and drew
          none of it, which left the one control the whole minigame is played
          with invisible — and re-anchoring (a finger lifted and set down an
          inch away) impossible to see at all.

          Positioned and lit by the frame loop, never by React. Hidden outright
          for a mouse and for an auto-driven road, the same two exemptions the
          run makes. */}
      <div ref={dpadRef} className="touch-dpad" aria-hidden="true">
        <span className="dpad-arrow dpad-up" />
        <span className="dpad-arrow dpad-down" />
        <span className="dpad-arrow dpad-left" />
        <span className="dpad-arrow dpad-right" />
        <span className="dpad-nub" />
      </div>
      {/* HIS OWN VOICE, IN THE GAME'S OWN WINDOW. The very same box every
          other line in the game is delivered in (`DialogueBox`): the grained
          panel, his face beside his name, the letter-by-letter crawl, and copy
          re-broken to the box's MEASURED column — which is the bug this
          replaced. The road's old box wrapped its text at a fixed 40 rem and
          sat in a 78vw card, so on any phone the monologue printed straight out
          through both walls of the window it was supposedly inside.

          NO BACKDROP AND NO POINTER. It is a bark over a road that is still
          moving, so it neither dims the picture nor takes the thumb: the wrapper
          is inert, and the box's own `pointer-events: none` means a player who
          puts a thumb down over it is steering, not reading.

          AND IT SITS BESIDE THE DASHBOARD (`.drive-bark`), not over it. The
          shipped window is centred along the bottom of the screen, which is
          where the dials are; on the road it takes the room to their right, and
          on a portrait screen — where there is no such room — it moves to the
          top instead. */}
      {speech && (
        <div style={BARK} aria-live="polite">
          <DialogueBox
            className="drive-bark"
            font={assets.font}
            lines={speech.pages[speech.page] ?? EMPTY_PAGE}
            speaker={heroName ?? "YOU"}
            speakerColor="#7ef0c8"
            portrait={heroPortrait}
            pageKey={`${speech.id}:${speech.page}`}
            revealRef={revealRef}
          />
        </div>
      )}
      {paused && (
        <DrivePause
          font={assets.font}
          onResume={() => setPause(false)}
          onSkip={skipDrive}
          onMenu={onMenu}
        />
      )}
      {/* THE CABINET'S BOARD, over a stopped road. Last in the tree so it sits
          over the dashboard and the bark alike — it is the only thing on this
          screen worth reading once the course is behind him. */}
      {board && (
        <DriveScores font={assets.font} result={board} onDone={leaveBoard} />
      )}
      {/* …AND THE TITLE CARD AT THE OTHER END OF THE LEG, last of all because
          for its beat and a half it is the whole picture: it opens at the same
          full black the garage's dim handed across, names the road, and lifts
          off a car that has not moved an inch (the step above breaks on it). */}
      {intro && (
        <DriveIntro font={assets.font} to={params.to} onDone={endIntro} />
      )}
    </div>
  );
}

const EMPTY_PAGE: string[] = [];

/** The pad's anchor, in client px — module-scoped because it is read inside
 * handlers that must not re-bind every render. */
let padOrigin: { x: number; y: number } | null = null;

/**
 * THE TWO TERMINAL BEATS, once their hold has run out. A BREAKDOWN puts the
 * player back at the top of the SAME road (the seed is kept, so the stretch
 * that killed him is the stretch he gets to learn); an ARRIVAL hands the
 * crossing back to the game screen.
 *
 * Not in `loop.ts` with the rest of the drain, because these are POLICY rather
 * than presentation and the drive's two hosts answer them differently — the
 * gallery's exhibit simply re-stages its show.
 */
function endDrive(
  drive: DriveState,
  bursts: Burst[],
  fx: DriveFxState,
  gore: DriveGoreState,
  skids: SkidState,
  /** What the arrival hands the leg to — the screen's own `arrive`, which is
   * where the choice between the high-score board and a silent crossing is
   * made. */
  onArrived: (drive: DriveState) => void,
): void {
  if (
    drive.outcome === DRIVE_OUTCOME.broken &&
    drive.outcomeMs > DRIVE.breakdownHoldMs
  ) {
    Object.assign(drive, restartDrive(drive));
    bursts.length = 0;
    clearDriveFx(fx);
    clearDriveGore(gore);
    clearSkids(skids);
  }
  if (
    drive.outcome === DRIVE_OUTCOME.arrived &&
    drive.outcomeMs > DRIVE.arrivalHoldMs
  ) {
    // WHAT HE MAKES OF THE TRIP goes with him rather than being said here.
    // `driveVerdict` reads the whole drive — the clock, the car, the other
    // drivers, the council's lighting and the people — and the line it picks is
    // spoken as the last page of the destination's opening monologue, which is
    // where a man's opinion of a journey belongs: standing beside the car,
    // having finished it. (`RunParams.arrivalThought` → `introPages`.)
    onArrived(drive);
  }
}

const SHELL: CSSProperties = {
  position: "absolute",
  inset: 0,
  background: "#0a0c14",
  overflow: "hidden",
  touchAction: "none",
};
const CANVAS: CSSProperties = {
  position: "absolute",
  inset: 0,
  width: "100%",
  height: "100%",
  imageRendering: "pixelated",
};
const PAD: CSSProperties = {
  position: "absolute",
  inset: 0,
  touchAction: "none",
};
/** Where a bark sits: across the bottom of the picture, inert. The box inside
 * places itself (`.dialogue-box` is absolutely positioned against its own
 * offset parent), so this only has to be a full-screen, tap-transparent layer
 * over the pad. */
const BARK: CSSProperties = {
  position: "absolute",
  inset: 0,
  pointerEvents: "none",
};
