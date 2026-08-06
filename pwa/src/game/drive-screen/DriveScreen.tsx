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

import { PixelText } from "@ui/lib/PixelText.tsx";

import { spriteDataUrl, type GameAssets } from "../assets.ts";
import { carKeyControl } from "../car-keys.ts";
import { getSettings } from "../settings.ts";
import { viewScaleFor } from "../render/view.ts";
import { engineNote } from "../sfx/drive.ts";
import {
  clearDriveFx,
  createDriveFx,
  drawDriveFx,
  shakeCamera,
  stepDriveFx,
  type DriveFxState,
} from "./drive-fx.ts";
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
 * How long one of the hero's lines is left up when NOBODY IS WATCHING FOR A TAP
 * (ms). A line parks the car — that is the point of it, and a player dismisses
 * it — but an attract loop has no thumb, so without this the demo stops dead on
 * the monologue and never reaches the road it was raised to talk about.
 * Comfortably longer than reading four short lines out loud.
 */
const AUTO_SPEECH_MS = 3400;

export function DriveScreen({
  params,
  assets,
  onArrived,
  stage,
  auto = false,
}: {
  params: DriveParams;
  assets: GameAssets;
  /** The road is behind him: make the crossing that was waiting on it. */
  onArrived: (to: string, bodies: number) => void;
  /**
   * DEVELOPER STAGING, run once on the fresh road before its first tick — the
   * hook the `?drive` workbench plants a body or a van in front of the bumper
   * with. A real drive passes nothing, so the road a player gets is the road
   * `createDrive` built and this parameter does not exist for them.
   */
  stage?: (drive: DriveState) => void;
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
   * The DIALOGUE follows the wheel: with nobody to tap, the hero's four lines
   * dismiss themselves after {@link AUTO_SPEECH_MS} instead of parking the car
   * forever on the first one.
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
  /** Drive-clock ms at which an unattended line puts itself away. */
  const autoSpeechRef = useRef(0);
  const [speech, setSpeech] = useState<string[] | null>(null);
  const [hud, setHud] = useState({ mph: 0, gear: 0, bodies: 0, wear: 0 });
  const speechRef = useRef<string[] | null>(null);

  /** Raise one of the hero's four lines. Held on a ref as well as in state so
   * the loop can tell whether one is already up without re-rendering. */
  const say = useCallback((id: string) => {
    const def = thoughtDef(id);
    if (!def) return;
    // A page may carry a `{ them: [...] }` block when somebody answers him;
    // none of the drive's four do — he is alone in the car, which is the whole
    // joke — so the plain string rows are the whole of it.
    const rows = def.pages
      .flat()
      .filter((p): p is string => typeof p === "string");
    const lines = [...withHeroNameLines(rows)];
    speechRef.current = lines;
    setSpeech(lines);
  }, []);

  const dismiss = useCallback(() => {
    speechRef.current = null;
    autoSpeechRef.current = 0;
    setSpeech(null);
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
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      keysRef.current.add(e.code);
      if (speechRef.current) dismiss();
    };
    const up = (e: KeyboardEvent) => keysRef.current.delete(e.code);
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, [dismiss]);

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

      // A line on screen parks the car — the same freeze the run's own dialogue
      // is, and for the same reason: nobody reads a monologue at 120 mph. With
      // nobody there to tap it away, it puts ITSELF away (see `auto`); the
      // clock is the wall's, because the drive's own stops with the road.
      if (driver && speechRef.current !== null) {
        if (autoSpeechRef.current === 0)
          autoSpeechRef.current = now + AUTO_SPEECH_MS;
        else if (now >= autoSpeechRef.current) dismiss();
      }
      const paused = speechRef.current !== null;
      acc += Math.min(MAX_CATCHUP_MS, now - last);
      last = now;
      while (acc >= STEP_MS) {
        acc -= STEP_MS;
        if (!paused) {
          stepDrive(drive, STEP_MS, inputRef.current);
          drainDrive(drive, burstsRef.current, fxRef.current, say);
          // THE FX AND THE ENGINE AGE ON THE DRIVE'S OWN CLOCK, inside the
          // fixed step — so a slow frame never skips a grain or fast-forwards a
          // spark, and the speech box's freeze stops both dead exactly as it
          // stops the road.
          stepDriveFx(fxRef.current, STEP_MS, drive.ms);
          runEngineNote(drive, engineRef.current);
          endDrive(drive, burstsRef.current, fxRef.current, onArrived);
        }
      }

      // ── PAINT ─────────────────────────────────────────────────────────────
      const viewW = w / (scale * dpr);
      const viewH = h / (scale * dpr);
      ctx.setTransform(scale * dpr, 0, 0, scale * dpr, 0, 0);
      ctx.imageSmoothingEnabled = false;
      // THE CAMERA IS SHAKEN, NOT THE CONTEXT: everything drawn this frame —
      // the road, the crowd, the gore and the sparks — reads the same camera,
      // so the whole picture moves as one instead of the effects sliding
      // against the world they are standing in.
      const camera = shakeCamera(
        fxRef.current,
        driveCamera(drive, viewW, viewH),
        drive.ms,
        Math.abs(drive.car.speed) / DRIVE.topSpeedPx,
      );
      drawDrive(ctx, drive, camera, assets.sprites, viewW, viewH, now);

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
        const next = {
          mph: driveMph(drive),
          gear: engineNote(Math.abs(drive.car.speed) / DRIVE.topSpeedPx).gear,
          bodies: drive.bodies,
          wear: Math.round(drive.car.wear * 100),
        };
        return prev.mph === next.mph &&
          prev.gear === next.gear &&
          prev.bodies === next.bodies &&
          prev.wear === next.wear
          ? prev
          : next;
      });
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [assets, dismiss, nose, onArrived, say]);

  const damage = hud.wear;
  const failing = damage > 70;
  // The run's own HUD frame sprite, 9-sliced behind the dials (see
  // `.drive-hud-plate`) — the same panel the vitals wear in a fight.
  const frame = spriteDataUrl(assets.sprites, "hud_frame");
  const plate: CSSProperties | undefined = frame
    ? { borderImageSource: `url(${frame})` }
    : undefined;

  return (
    // The class carries ONE thing — the stacking band (styles.css). It has to
    // out-rank the departure curtain, which is still painted full black behind
    // a drive and would otherwise hide the entire road.
    <div className="drive-screen" style={SHELL}>
      <canvas ref={canvasRef} style={CANVAS} />
      {/* THE DIALS, IN THE GAME'S OWN FONT. Everything else the player reads
          in this game is the pixel font (`PixelText`) — a browser monospace
          here made the minigame look like a different program, which is
          exactly what an interlude must not do.

          SPEED AND THE GEAR IT IS BEING MADE IN: the gear is `engineNote`'s
          own reading, the same one the sound is built from, so what the player
          hears climbing and dropping is what the dial says. A readout, not a
          control — the wagon shifts itself. */}
      <div style={HUD_BAR}>
        <div className="drive-hud-plate" style={plate}>
          <PixelText
            font={assets.font}
            text={`${hud.mph} MPH  GEAR ${hud.gear + 1}`}
            scale={2}
            color="#e8e4d8"
          />
        </div>
        <div className="drive-hud-plate" style={plate}>
          <PixelText
            font={assets.font}
            text={`DAMAGE ${damage}%`}
            scale={2}
            color={failing ? "#e8635a" : "#e8e4d8"}
          />
        </div>
      </div>
      {/* THE PAD — one thumb, anywhere on the picture. Dragging from where the
          thumb went down is the push; letting go means carry on, which is the
          whole of the control model. */}
      <div
        style={PAD}
        onPointerDown={(e) => {
          if (speechRef.current) {
            dismiss();
            return;
          }
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
      {speech && (
        <button type="button" style={SPEECH} onClick={dismiss}>
          {speech.map((line, i) => (
            <PixelText
              key={i}
              font={assets.font}
              text={line}
              scale={2}
              color="#e8e4d8"
              maxWidth={40}
            />
          ))}
          <PixelText
            font={assets.font}
            text="TAP TO GO ON"
            scale={1}
            color="#8b8f99"
          />
        </button>
      )}
    </div>
  );
}

/** The pad's anchor, in client px — module-scoped because it is read inside
 * handlers that must not re-bind every render. */
let padOrigin: { x: number; y: number } | null = null;

/**
 * THE TWO TERMINAL BEATS, once their hold has run out — the SCREEN's own
 * policy, which is why they are here rather than in the shared drain
 * (`loop.ts`). A BREAKDOWN puts the player back at the top of the SAME road
 * (the seed is kept, so the stretch that killed him is the stretch he gets to
 * learn); an ARRIVAL hands the crossing back to the game screen.
 */
function endDrive(
  drive: DriveState,
  bursts: Burst[],
  fx: DriveFxState,
  onArrived: (to: string, bodies: number) => void,
): void {
  if (
    drive.outcome === DRIVE_OUTCOME.broken &&
    drive.outcomeMs > DRIVE.breakdownHoldMs
  ) {
    Object.assign(drive, restartDrive(drive));
    bursts.length = 0;
    clearDriveFx(fx);
  }
  if (
    drive.outcome === DRIVE_OUTCOME.arrived &&
    drive.outcomeMs > DRIVE.arrivalHoldMs
  ) {
    onArrived(drive.params.to, drive.bodies);
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
const HUD_BAR: CSSProperties = {
  position: "absolute",
  top: 14,
  left: 12,
  right: 12,
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  pointerEvents: "none",
};
const PAD: CSSProperties = {
  position: "absolute",
  inset: 0,
  touchAction: "none",
};
const SPEECH: CSSProperties = {
  position: "absolute",
  left: "50%",
  bottom: "10%",
  transform: "translateX(-50%)",
  maxWidth: "min(78vw, 560px)",
  padding: "14px 18px",
  background: "rgba(10, 12, 20, 0.92)",
  border: "2px solid #4a4f5c",
  display: "flex",
  flexDirection: "column",
  gap: 8,
  alignItems: "flex-start",
  cursor: "pointer",
};
