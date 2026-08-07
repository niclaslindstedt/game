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
  driveMph,
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
import { engineNote, GEAR_COUNT } from "../sfx/drive.ts";
import { driveBindings, type DriveDials } from "../hud/bindings.ts";
import { HudRoot } from "../hud/HudRoot.tsx";
import type { HudContext } from "../hud/context.ts";
import { DrivePause } from "./DrivePause.tsx";
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
  const engineRef = useRef(createEngineNote());
  const inputRef = useRef<DriveInput>({ pedal: 0, wheel: 0 });
  const keysRef = useRef<Set<string>>(new Set());
  const padRef = useRef<{ x: number; y: number } | null>(null);
  /** The hands on the wheel when nobody's are — minted once, because the driver
   * carries the line it has committed to and rebuilding it every frame would be
   * a driver that never commits to anything. */
  const driverRef = useRef<DriveDriver | null>(
    auto ? createDriveDriver() : null,
  );
  const [speech, setSpeech] = useState<Speech | null>(null);
  const [paused, setPaused] = useState(false);
  /**
   * THE DIALS — what the dashboard reads, republished only when one of them
   * actually moves.
   *
   * More than the two shipped plates use, on purpose: the revs, the gear count
   * and the top end are what a TACHOMETER and a GEARBOX are drawn from, and a
   * dial that had to wait for this screen to start publishing its number would
   * be a dial nobody could author. `rev` is the one continuous value here, so it
   * is quantised to a sixteenth — a needle wants smooth, but a needle that
   * re-rendered React sixty times a second would be paying for the whole HUD
   * every frame. (A genuinely 60fps needle is a render-loop handle, the way the
   * stamina bar is.)
   */
  const [hud, setHud] = useState<DriveDials>({
    mph: 0,
    topSpeedMph: DRIVE.topSpeedMph,
    speedFrac: 0,
    gear: 0,
    gearCount: GEAR_COUNT,
    rev: 0,
    reversing: false,
    bodies: 0,
    wear: 0,
    failing: false,
    paused: false,
  });
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

  const nose = params.direction === 1 ? 1 : -1;

  // ── THE LOOP ──────────────────────────────────────────────────────────────
  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    let acc = 0;

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
      inputRef.current = driver
        ? // NOBODY IS PLAYING THIS. The engine's own driver reads the road and
          // the thumb and the keyboard are ignored outright — not merely
          // unread: a stray keypress in a demo must not be able to steer the
          // car, and a screenshot recipe that holds a key down must not get a
          // different road than the one it asked for.
          driveDriverInput(driver, drive)
        : pad
          ? { pedal: pad.x * nose, wheel: pad.y }
          : carKeyControl(keysRef.current, getSettings().keybindings);

      // ONE THING PARKS THE CAR, and it is the pause card. A LINE DOES NOT —
      // his thoughts are barked over a road that keeps moving (see `Speech`),
      // which is the only way a man muttering at the wheel reads as a man
      // muttering at the wheel, and it is also what leaves an UNATTENDED drive
      // (the attract loop, a playtest) nothing to be stuck on.
      const frozen = pausedRef.current;

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
        if (frozen) break;
        stepDrive(drive, STEP_MS, inputRef.current);
        drainDrive(
          drive,
          burstsRef.current,
          fxRef.current,
          goreRef.current,
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
          onArrived,
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

      setHud((prev) => {
        const speedFrac = Math.min(
          1,
          Math.abs(drive.car.speed) / DRIVE.topSpeedPx,
        );
        const note = engineNote(speedFrac);
        const wearPercent = Math.round(drive.car.wear * 100);
        const next: DriveDials = {
          mph: driveMph(drive),
          topSpeedMph: DRIVE.topSpeedMph,
          speedFrac: Math.round(speedFrac * 64) / 64,
          gear: note.gear,
          gearCount: GEAR_COUNT,
          rev: Math.round(note.rev * 16) / 16,
          reversing: drive.car.speed < 0,
          bodies: drive.bodies,
          wear: wearPercent / 100,
          failing: wearPercent > FAILING_WEAR_PERCENT,
          paused: pausedRef.current,
        };
        return sameDials(prev, next) ? prev : next;
      });
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [ageSpeech, assets, nose, onArrived, say]);

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
          whole of the control model. */}
      <div
        style={PAD}
        onPointerDown={(e) => {
          (e.target as Element).setPointerCapture(e.pointerId);
          padRef.current = { x: 0, y: 0 };
          padOrigin = { x: e.clientX, y: e.clientY };
        }}
        onPointerMove={(e) => {
          if (!padRef.current || !padOrigin) return;
          const dx = e.clientX - padOrigin.x;
          const dy = e.clientY - padOrigin.y;
          const len = Math.hypot(dx, dy) || 1;
          const reach = Math.min(1, len / 48);
          padRef.current = { x: (dx / len) * reach, y: (dy / len) * reach };
        }}
        onPointerUp={() => {
          padRef.current = null;
          padOrigin = null;
        }}
        onPointerCancel={() => {
          padRef.current = null;
          padOrigin = null;
        }}
      />
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
          puts a thumb down over it is steering, not reading. */}
      {speech && (
        <div style={BARK} aria-live="polite">
          <DialogueBox
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
        />
      )}
    </div>
  );
}

const EMPTY_PAGE: string[] = [];

/** Where the damage readout stops being a scratch and starts being trouble.
 * The wagon takes cosmetic knocks the whole way down, and a dial that alarmed
 * at the first one would teach the player to ignore it — so this is the point
 * where the next real hit ends the trip. What the dial DOES about it is the
 * content's call (`hud/scripts/drive.lua`); this is only the fact. */
const FAILING_WEAR_PERCENT = 70;

/** Have any of the dials actually moved? Compared field by field rather than
 * by a key string: this runs every frame of a drive. */
function sameDials(a: DriveDials, b: DriveDials): boolean {
  return (
    a.mph === b.mph &&
    a.speedFrac === b.speedFrac &&
    a.gear === b.gear &&
    a.rev === b.rev &&
    a.reversing === b.reversing &&
    a.bodies === b.bodies &&
    a.wear === b.wear &&
    a.failing === b.failing &&
    a.paused === b.paused
  );
}

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
  onArrived: (to: string, bodies: number, verdict: string) => void,
): void {
  if (
    drive.outcome === DRIVE_OUTCOME.broken &&
    drive.outcomeMs > DRIVE.breakdownHoldMs
  ) {
    Object.assign(drive, restartDrive(drive));
    bursts.length = 0;
    clearDriveFx(fx);
    clearDriveGore(gore);
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
    onArrived(drive.params.to, drive.bodies, driveVerdict(drive));
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
