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
  driveDashUp,
  driveDriverInput,
  driveHandsOff,
  driveReadyUp,
  driveScore,
  holdDriveOpening,
  readCarDamage,
  stepDrive,
  withHeroNameLines,
  type CarDamage,
  type DriveDriver,
  type DriveInput,
  type DriveParams,
  type DriveState,
} from "@game/core";

import { PixelText } from "@ui/lib/PixelText.tsx";

import { type GameAssets } from "../assets.ts";
import { carKeyControl } from "../car-keys.ts";
import { carriedCarFilth, carryCarFilth } from "../car-condition.ts";
import { actionForCode } from "../keybindings.ts";
import { sfwModeEnabled } from "../game-screen/gore-gate.ts";
import { getSettings } from "../settings.ts";
import {
  DialogueBox,
  IDLE_REVEAL,
  type DialogueReveal,
} from "../overlays/DialogueBox.tsx";
import {
  pauseMusic,
  playMusic,
  resumeMusic,
  stopMusic,
} from "../music/index.ts";
import { viewScaleFor } from "../render/view.ts";
import { ageBark, openBark, turnBark, type Speech } from "./bark.ts";
import {
  createWearTrail,
  driveBindings,
  driveDials,
  sameDials,
  type DriveDials,
} from "./dials.ts";
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
  createDriveFx,
  drawDriveFx,
  shakeCamera,
  stepDriveFx,
  type DriveFxState,
} from "./drive-fx.ts";
import { createDriveGore, type DriveGoreState } from "./drive-gore.ts";
import { createSkids, type SkidState } from "./skid.ts";
import {
  createEngineNote,
  drainDrive,
  drawBursts,
  runEngineNote,
  type Burst,
} from "./loop.ts";
import { endDrive } from "./end-drive.ts";
import { feelDrive } from "./drive-haptics.ts";
import { drawDrive, driveCamera } from "./render.ts";
import { arrivalLine, thoughtPages } from "./voice.ts";

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
 * THE ROAD'S OWN SCORES — OVERDUE and AN HOUR BEHIND
 * (`content/music/overdue.yaml`, `content/music/hour_behind.yaml`).
 *
 * Named HERE rather than in the music module, which knows nothing about
 * minigames and must not start to: a score id is content this screen owns, the
 * way the town's art and the hero's four lines are (AGENTS.md — a minigame
 * meets the game in four places and the soundtrack is not a fifth one). A
 * second cabinet names its own.
 *
 * TWO TRACKS, ONE PER DIRECTION, AND THE RETURN LEG IS NOT THE GENTLER ONE.
 * That is the whole reason the split is allowed to exist: a softer theme going
 * home would be the game telling the player the pressure had come off, which is
 * the one thing that never happens. It has changed KIND instead. Out, he is
 * late — the jacket has been answering from the campus for an hour, and OVERDUE
 * ticks a clock in every bar of itself. Back, there is nothing left to be late
 * for: she was flown off the planet an hour before he got through the door, so
 * AN HOUR BEHIND deletes the clock, cuts the reply out of every phrase, and
 * falls Dm–C–B♭–A without ever landing.
 *
 * DERIVED FROM `params.direction`, which the road already carries and which
 * both doors already set — a campaign leg from `legDirection`, the arcade
 * cabinet from the shelf's DIRECTION row. So the cabinet gets the pair for
 * free and neither mount had to learn that a road has a soundtrack.
 */
const ROAD_TRACK_OUT = "overdue";
const ROAD_TRACK_HOME = "hour_behind";

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
  arcade = false,
}: {
  params: DriveParams;
  assets: GameAssets;
  /**
   * The road is behind him: make the crossing that was waiting on it.
   *
   * WHAT HE MADE OF THE TRIP DOES NOT TRAVEL WITH IT. The verdict is said at the
   * wheel, on the run-in, in front of the place's own line (`arrivalLine`), so
   * the only thing the road hands the far side is the car and the count.
   */
  onArrived: (
    to: string,
    bodies: number,
    /** THE WAGON AS THE LEG LEAVES IT (`CarDamage`) — what the level on the far
     * side mints its own car from (`RunParams.car`), so the thing he parks is
     * the thing he drove. The other half of the condition, the blood, has gone
     * into `car-condition.ts` by the time this is called; a caller with nowhere
     * to put a car (the arcade cabinet) simply ignores this. */
    car: CarDamage,
  ) => void;
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
  /**
   * THE ROAD IS THE WHOLE GAME — a lap off the arcade shelf (`MinigameScreen`)
   * rather than a leg of a run.
   *
   * It changes only what the PAUSE CARD offers and says: there is no crossing
   * waiting on the far side to hand a skipped trip on to, and no hero to be
   * banked as he sits. The road, the crowd, the scoring and the board are the
   * same road, the same crowd, the same scoring and the same board — which is
   * the whole reason a score set here belongs beside one set on the way to work.
   */
  arcade?: boolean;
}): ReactElement {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  /** SFW is latched for the whole leg, just like the gore params the engine
   * received — a switch flipped mid-drive would leave half the tarmac in blood
   * and half of it in glitter. It withholds NOTHING: the crashes, the dents,
   * the debris and the shake all play, and only the substance of what a body
   * leaves changes (`render.ts` for the whole of what that means). */
  const [fairy] = useState(() => sfwModeEnabled());
  /** THE STEERING HINT — the run's own virtual dpad (`ScreenChrome.tsx`), worn
   * by the road. Written straight onto DOM styles from the frame loop, exactly
   * as the run writes its own: a hint that re-rendered React on every pointer
   * move would be the most expensive thing on this screen. */
  const dpadRef = useRef<HTMLDivElement>(null);
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
   * the mess is a record of THIS attempt at the road.
   *
   * …EXCEPT WHAT THE CAR ARRIVED WEARING, which is not this attempt's and is
   * seeded from the wagon's own carried film (`car-condition.ts`) — the other
   * half of `DriveParams.car`, kept app-side because the engine has never known
   * a car can get dirty. A leg the cabinet plays hands over nothing and opens on
   * clean paint. */
  const goreRef = useRef<DriveGoreState>(
    createDriveGore(params.car ? carriedCarFilth() : undefined),
  );
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
   * THE PICTURE GOING OUT — the last thing the road does.
   *
   * The run-in ends with the car parked on GOODCO's approach and the hero
   * standing beside it having asked how he is supposed to get in; then the
   * screen goes black, and the board comes up over the black rather than over a
   * frozen car park. It is the same half-second dim the garage handed the road
   * at the other end (`DEPARTURE`), which is what makes the whole leg read as
   * one journey with a fade at each end instead of a minigame that stops.
   *
   * A FLAG RATHER THAN A CLOCK, because the timing is the engine's
   * (`DRIVE.arrival.blackoutMs`, raised as an event) and the FADE is the app's:
   * CSS owns the curve, and the only thing React has to know is whether it has
   * started.
   */
  const [blackout, setBlackout] = useState(false);
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
  /**
   * THE APPROACH'S COUNTDOWN, as the screen needs it — two booleans, published
   * by the frame loop only when one of them moves.
   *
   * `ready` is the last stretch of the opening, from the frame the carriageway
   * starts opening out to four lanes (`driveReadyUp`): GET READY goes up with
   * the widening, which is the first thing on screen that says the town is
   * coming. `dash` is the last second of it: the wheel has been handed back and
   * the instruments slide in from the left. The pedal arrives when the gate
   * does, with the clock, and takes the caption away with it.
   *
   * SEEDED QUIET because that is what a fresh road is — the wagon is still
   * sliding into frame with the hero's own thought to get through, and the words
   * have nothing to be about until he has finished it.
   */
  const [opening, setOpening] = useState({ ready: false, dash: false });
  /** The damage dial's fresh-slice anchor. Held across ticks (and across a
   * restart, which lays a clean car and snaps it back to nothing on its own). */
  const wearTrailRef = useRef(createWearTrail());
  const speechRef = useRef<Speech | null>(null);
  const pausedRef = useRef(false);
  /** What the speech box says its tap means — the same seam the run's own
   * dialogue uses, so a keypress and a tap can never disagree about whether
   * this one finishes the crawl or turns the page. */
  const revealRef = useRef<DialogueReveal>(IDLE_REVEAL);

  /**
   * Raise one of the hero's lines. Held on a ref as well as in state so the
   * loop can tell whether one is already up without re-rendering.
   *
   * `lead` is a SECOND thought printed onto the front of the first one's first
   * row rather than as a page of its own — the run-in's verdict, and nothing
   * else in the game (`arrivalLine`, voice.ts, which owns the reasoning). The
   * bark still keeps `id` as its identity, because the line it prints is the
   * place's; the verdict is what he says about the hour behind it.
   */
  const say = useCallback(
    (id: string, nowMs: number, lead?: string) => {
      // A page may carry a `{ them: [...] }` block when somebody answers him;
      // none of the drive's do — he is alone in the car, which is the whole
      // joke — so the plain string rows are the whole of it.
      const rows = lead ? arrivalLine(lead, id) : thoughtPages(id);
      if (!rows.length) return;
      const pages = rows.map((page) => [...withHeroNameLines(page, heroName)]);
      // THE OPENING'S LINE IS TURNED BY THE PLAYER, and it is the only one that
      // is: it is the one thing said while the car is HELD (`driveHandsOff`),
      // with no clock running and nothing else to be doing. So the box waits for
      // a thumb and the road waits with it — the town is kept out of reach until
      // the last page goes, which is what lets a page be added to the thought
      // without re-measuring the approach it is said over.
      //
      // NOBODY'S THUMB, NO WAIT. An `auto` road — the attract loop, a `?bot=`
      // playtest, a screenshot recipe — has nobody to turn a page, so its lines
      // stay barks that retire themselves and its approach stays the authored
      // one. It is the same rule the title card and the pause card follow.
      const drive = driveRef.current;
      const waits = !auto && driveHandsOff(drive);
      const next = openBark(id, pages, nowMs, waits);
      if (waits) holdDriveOpening(drive, true);
      speechRef.current = next;
      setSpeech(next);
    },
    [auto, heroName],
  );

  /** Take whatever is on the screen away right now — what a restart owes the
   * box (see `endDrive`), and what the last page of a bark does to itself.
   *
   * IT LETS THE ROAD GO TOO. A held road is waiting on a box that is no longer
   * on the screen, and every way one can leave — the last page, a restart —
   * has to hand the town back or the approach never ends. Idempotent in the
   * engine, so the calls that had nothing to release cost nothing. */
  const clearSpeech = useCallback(() => {
    speechRef.current = null;
    setSpeech(null);
    holdDriveOpening(driveRef.current, false);
  }, []);

  /** The bark's own clock, run from inside the loop: turn the page when this
   * one has had its time, and take the box away after the last. A waiting line
   * is not on this clock at all (`ageBark`) — `nudgeSpeech` turns that one. */
  const ageSpeech = useCallback(
    (nowMs: number) => {
      const live = speechRef.current;
      if (!live) return;
      const next = ageBark(live, nowMs);
      if (next === live) return;
      if (!next) {
        clearSpeech();
        return;
      }
      speechRef.current = next;
      setSpeech(next);
    },
    [clearSpeech],
  );

  /**
   * THE THUMB ON THE OPENING'S LINE — a tap finishes the crawl, then turns the
   * page, then takes the box away and lets the road arrive.
   *
   * THE TWO-STEP IS THE BOX'S, NOT THIS SCREEN'S (`revealRef`): the same staged
   * reveal every conversation in the game answers to, so a tap out here means
   * what a tap means everywhere else and a key can never disagree with it.
   *
   * Returns whether it ate the press. Only a WAITING line does — the car is held
   * while one is up, so there is no steering for the tap to be taking away, and
   * every other line is a bark the road drives out from under on its own.
   */
  const nudgeSpeech = useCallback((): boolean => {
    const live = speechRef.current;
    if (!live?.waits) return false;
    if (!revealRef.current.done) {
      revealRef.current.skip();
      return true;
    }
    const next = turnBark(live, driveRef.current.ms);
    if (!next) {
      clearSpeech();
      return true;
    }
    speechRef.current = next;
    setSpeech(next);
    return true;
  }, [clearSpeech]);

  const setPause = useCallback((on: boolean) => {
    pausedRef.current = on;
    setPaused(on);
    // THE SCORE FREEZES WITH THE ROAD, exactly as the run's does behind its own
    // pause menu: the arrangement is held in place rather than restarted, so
    // lifting the card drops the player back into the same bar of the same
    // section they were driving through.
    if (on) pauseMusic();
    else resumeMusic();
  }, []);

  // ── THE SCORE ─────────────────────────────────────────────────────────────
  // OVERDUE going out, AN HOUR BEHIND coming home (`ROAD_TRACK_*` above),
  // claimed for as long as this screen owns the picture.
  //
  // IT STARTS WITH THE MOUNT, under the title card, because the card's beat and
  // a half is the score's own intro: out, the clock alone, then the engine,
  // then the first wail as "ROAD TO GOODCO" lifts off a car that has not moved
  // yet; home, one tracker ping into an empty street.
  //
  // AND IT IS STOPPED ON THE WAY OUT, not left to whatever comes next. A leg
  // ends in one of two places and both want the quiet: the arrival's blackout
  // cuts it below (the high-score board counts up over silence, exactly as the
  // run's end-of-level jingles play over one), and the unmount catches every
  // other way off this screen — the pause card's SKIP, its MAIN MENU, the
  // workbench relaying. The crossing on the far side raises the destination's
  // own theme a frame later.
  const roadTrack = params.direction === -1 ? ROAD_TRACK_HOME : ROAD_TRACK_OUT;
  useEffect(() => {
    playMusic(roadTrack);
    return () => stopMusic();
  }, [roadTrack]);

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
  /**
   * THE WAGON, HANDED OFF THE ROAD — both halves of its condition, at the one
   * moment the leg is over however it ended (arrived, signed off, or skipped).
   *
   * The BLOOD goes into the app's own carrier here rather than being returned,
   * because the only thing that ever wants it is a renderer and the engine has
   * no field for it; the DAMAGE is returned, because it is a run parameter on
   * the far side. A leg with no night behind it (the arcade) has nothing to
   * hand on and leaves the carrier alone — see `DriveParams.car`.
   */
  const handOffCar = useCallback((drive: DriveState): CarDamage => {
    if (drive.params.car) {
      const gore = goreRef.current;
      carryCarFilth({ soak: gore.car, tyre: gore.tyre });
    }
    return readCarDamage(drive.car);
  }, []);

  const arrive = useCallback(
    (drive: DriveState) => {
      const to = drive.params.to;
      if (auto) {
        onArrived(to, drive.bodies, handOffCar(drive));
        return;
      }
      const result = driveBoardResult(
        driveScore(drive),
        drive.params.difficulty,
      );
      boardRef.current = result;
      setBoard(result);
    },
    [auto, handOffCar, onArrived],
  );

  /** Signed off: give the road back and make the crossing it was holding. */
  const leaveBoard = useCallback(() => {
    const drive = driveRef.current;
    boardRef.current = null;
    setBoard(null);
    onArrived(drive.params.to, drive.bodies, handOffCar(drive));
  }, [handOffCar, onArrived]);

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
      // …AND THE OPENING'S LINE OWNS EVERY KEY WHILE IT IS UP, the way the card
      // above owns the first one. The car is held out there so there is nothing
      // for a key to be steering, and a press banked into `keysRef` would be a
      // control held down from before the player had finished reading.
      if (nudgeSpeech()) return;
      keysRef.current.add(e.code);
    };
    const up = (e: KeyboardEvent) => keysRef.current.delete(e.code);
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, [nudgeSpeech, onScreenshot, setPause]);

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
      // the end of the leg. A LINE DOES NOT — his thoughts are said over a road
      // that keeps moving (see `Speech`), which is the only way a man muttering
      // at the wheel reads as a man muttering at the wheel, and it is also what
      // leaves an UNATTENDED drive (the attract loop, a playtest) nothing to be
      // stuck on. What the OPENING's line holds is the TOWN, not the wagon: the
      // gate walks along in front of him until the page is turned, so the road
      // waits without a single frame of it standing still.

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
          fairy,
        );
        ageSpeech(drive.ms);
        // …AND WHAT THE WHEEL FELT. Read off the tick's own events after the
        // drain, exactly as the fade below is, and sized by the collision's own
        // energy so a body clipped at forty and a van met square are not the
        // same buzz (`drive-haptics.ts`).
        //
        // NOBODY'S THUMB, NO BUZZ — the same `auto` rule that already takes
        // away the title card, the pause card and the high-score board. An
        // attract loop that vibrated a phone nobody is holding is the one
        // failure this cue has, and it is the loudest one.
        if (!auto) feelDrive(drive);
        // THE PICTURE GOING OUT. Read off the tick's own events rather than off
        // a clock kept out here, so the fade starts on exactly the beat the
        // engine says it does — and read AFTER the drain, which is where the
        // rest of this tick's events have already been spoken and heard.
        if (drive.events.some((event) => event.type === "blackout")) {
          setBlackout(true);
          // …AND THE SCORE GOES OUT WITH THE PICTURE. The leg is over — the car
          // is parked on the approach and the man is standing beside it — and
          // what comes up over the black is the high-score board counting his
          // bonuses one at a time. That wants the quiet, exactly as the run's
          // own end-of-level jingles do.
          stopMusic();
        }
        // THE FX AND THE ENGINE AGE ON THE DRIVE'S OWN CLOCK, inside the
        // fixed step — so a slow frame never skips a grain or fast-forwards a
        // spark, the pause card's freeze stops both dead exactly as it stops
        // the road, and the slow-motion slows them with it.
        stepDriveFx(
          fxRef.current,
          STEP_MS,
          drive.ms,
          drive.car.pos.x,
          drive.params.direction,
        );
        runEngineNote(drive, engineRef.current);
        endDrive(
          drive,
          burstsRef.current,
          fxRef.current,
          goreRef.current,
          skidRef.current,
          clearSpeech,
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
      const baseCamera = driveCamera(drive, viewW, viewH);
      const camera = shakeCamera(fxRef.current, baseCamera, drive.ms);
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
        fairy,
        fxRef.current,
      );

      // In SFW mode this list carries fairy dust rather than gore — the pastel
      // shower a body peels away in, laid over the collision that caused it.
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
        // …and the atlas, for the two effects out here made of authored ART
        // rather than of particles: a burning car and a fuel tank going.
        assets.sprites,
        // …and only the half that FLIES. The glass went down on the tarmac
        // inside `drawDrive`, under the wrecks and under the wagon.
        "air",
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
      // THE COUNTDOWN, republished only when it MOVES. Two booleans and four
      // beats between them: the quiet approach (no dashboard, no controls, the
      // hero talking), the road opening out to four lanes (GET READY), the
      // wheel handed back a second out (the dashboard slides in), and the flag.
      // Read off the engine rather than off the distance, because where each of
      // those falls is the ROAD's decision and this screen is not the only thing
      // that asks (`driveReadyUp` / `driveDashUp` / `driveSteerOnly`).
      setOpening((prev) => {
        const ready = driveReadyUp(drive);
        const up = driveDashUp(drive);
        return prev.ready === ready && prev.dash === up
          ? prev
          : { ready, dash: up };
      });
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [ageSpeech, arrive, assets, auto, clearSpeech, fairy, nose, say]);

  /** Give up on the road: arrive anyway, with whatever the trip had reached. */
  const skipDrive = useCallback(() => {
    setPause(false);
    const drive = driveRef.current;
    // He still made the trip — the game just stops showing it — so the wagon
    // still carries whatever the part of it he did play did to it. The verdict
    // is not owed here: it is a line on the run-in he has just skipped past.
    onArrived(params.to, drive.bodies, handOffCar(drive));
  }, [handOffCar, onArrived, params.to, setPause]);

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
      // RAISING THE CARD, from the stopwatch in the corner — the fight's own
      // gesture (its survival timer pauses the run on a tap), and the only way
      // into this card a player without a keyboard had. The verb is the fight's
      // `pauseGame` rather than a road-shaped fourth one, because it is the
      // same press: a mod that puts PAUSE on a dashboard of its own writes what
      // it would write on a HUD.
      //
      // HANDS OFF WITH IT, exactly as losing the window is (`park` above): a
      // wheel or an accelerator still held when the card goes up is a control
      // the road resumes under, and the thumb that pressed PAUSE is not the
      // thumb that was steering.
      //
      // The two screens that own the picture outright refuse it for the reasons
      // the keyboard's ESCAPE refuses it — a card over the high-score board
      // covers the one thing worth reading, and a card over the title card is a
      // hold on a hold. Both draw over the dashboard already; this is what
      // keeps that true for a mod's button as well as for ours.
      pauseGame: () => {
        if (boardRef.current || introRef.current) return;
        dropControls();
        setPause(true);
      },
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
      <div
        className={
          opening.dash ? "drive-hud-shelf drive-hud-in" : "drive-hud-shelf"
        }
      >
        <HudRoot ctx={hudContext} />
      </div>

      {/* GET READY — the approach's countdown, said out loud.

          IT GOES UP WITH THE WIDENING (`driveReadyUp`), which is the frame the
          road starts opening out from two lanes to four — the first thing on
          screen that says the town is arriving. A second later the wheel comes
          back and the dashboard slides in beside this, and then the gate
          arrives and this goes. A player handed straight from a menu into a
          side-on car at seventy with a crowd coming needs the same three words
          every arcade racer has ever opened with — and, more than the words, a
          beat in which nothing can go wrong yet.

          IT IS THE ANSWER TO HIS LAST PAGE, and never a caption held over one.
          The town is planted a taper ahead of the car on the frame the player
          turns the opening thought away (`holdDriveOpening`), so these words go
          up on that tap: the countdown is never counting down to something eight
          seconds off, and it is never over the top of a line still being read.

          Inert, aria-hidden and out of the way of the thumb: the last second of
          it is genuinely steerable, and a caption that ate the pad would be a
          countdown the player could not use. */}
      {opening.ready && (
        <div className="drive-ready" aria-hidden="true">
          <PixelText
            font={assets.font}
            text="GET READY"
            scale={3}
            color="#ffd75e"
          />
        </div>
      )}

      {/* THE PAD — one thumb, anywhere on the picture. Dragging from where the
          thumb went down is the push; letting go means carry on, which is the
          whole of the control model.

          …AND THE OTHER THUMB IS THE HANDBRAKE. Every pointer after the first
          is a lever rather than a second pad: it needs no aim, no anchor and no
          drag, which is exactly right for the one control a driver reaches for
          without looking. The first finger down owns the pad and keeps it
          (`padIdRef`) — without that, a second thumb landing re-anchored the
          steering under the first one and the car snapped straight.

          …AND WHILE THE OPENING'S LINE IS UP IT IS A PAGE-TURN INSTEAD. The pad
          covers the whole picture, which is exactly what that line wants: the
          box itself is `pointer-events: none` and holds no target worth aiming
          at, so anywhere on the screen turns the page. Nothing is lost by it —
          the car is held while a waiting line is on screen, so the pad it takes
          the press from is not connected to anything yet. */}
      <div
        style={PAD}
        onPointerDown={(e) => {
          if (nudgeSpeech()) return;
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
            // A BARK IS INERT AND THE OPENING'S LINE IS NOT. A bark has nobody
            // to press it, so it must not draw the "there is more" arrow at a
            // player who has nothing to press it with, and it turns its own
            // folded screens or the tail of a long page on a narrow phone would
            // never be shown. The opening's line is turned by the thumb the
            // whole screen collects (`nudgeSpeech`), so it wants the arrow and
            // wants its screens left alone.
            inert={!speech.waits}
          />
        </div>
      )}
      {paused && (
        <DrivePause
          font={assets.font}
          onResume={() => setPause(false)}
          // AN ARCADE LAP HAS NOTHING TO SKIP TO. "Hand the crossing on" and
          // "leave" are one press there, so the card offers one row rather than
          // two that do the same thing — and says what leaving a lap costs,
          // which is the lap, because nothing about a hero is true here.
          onSkip={arcade ? undefined : skipDrive}
          onMenu={onMenu}
          cost={
            arcade
              ? "THE LAP ENDS HERE - AN UNFINISHED ROAD SCORES NOTHING"
              : undefined
          }
        />
      )}
      {/* THE PICTURE GOING OUT, under the board and over everything else. The
          car is parked on GOODCO's approach with the man standing beside it,
          he has asked the question the next level answers, and the leg fades
          the way it opened. Inert — there is nothing to press on a fade. */}
      {blackout && <div className="drive-blackout" aria-hidden="true" />}
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
