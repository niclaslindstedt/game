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
// THE GORE GATE IS ASKED ONCE, AT THE TOP (`driveGib` below), and the answer
// rides on the drive as a plain boolean. That is the house rule — the gate goes
// where the thing is DECIDED — and here it also has to be a single answer for
// the whole road: a switch flipped mid-drive would leave half the tarmac gibbed
// and half of it lying in the gutter.

import type { CSSProperties, ReactElement } from "react";
import { useCallback, useEffect, useRef, useState } from "react";

import {
  createDrive,
  driveMph,
  driveRideQuality,
  restartDrive,
  stepDrive,
  thoughtDef,
  withHeroNameLines,
  DRIVE,
  DRIVE_OUTCOME,
  type DriveInput,
  type DriveParams,
  type DriveState,
} from "@game/core";

import { type GameAssets } from "../assets.ts";
import { carKeyControl } from "../car-keys.ts";
import { getSettings } from "../settings.ts";
import { dismemberAllowed, goreAmount } from "../game-screen/gore-gate.ts";
import { goreBurst, type GoreBurst } from "../game-screen/gore-burst.ts";
import { drawGore } from "../render/gibs.ts";
import { viewScaleFor } from "../render/view.ts";
import { drawDrive, driveCamera } from "./render.ts";
import { CROWD_SPRITES } from "./scenery.ts";

/** The simulation's fixed step (ms) — the engine's own, so a drive ticks at the
 * same rate a run does and the physics is frame-rate independent. */
const STEP_MS = 16;
/** The most catch-up a single frame may do, so a backgrounded tab does not
 * resolve four seconds of collisions in one go. */
const MAX_CATCHUP_MS = 100;

/**
 * WHETHER BODIES COME APART ON THIS ROAD — the gore gate, asked once.
 *
 * Both halves have to say yes: the family's own switch (people bleed → `blood`)
 * AND the dismemberment switch for a body BURST rather than cut. That pairing is
 * the whole of the setting matrix the drive was asked for:
 *
 *   gore on                → they gib, and the car wears it
 *   blood off, gibs ON     → they still gib (the pieces fly, the road stays clean)
 *   gibs off               → nobody comes apart; they are knocked aside instead
 *
 * …and the car breaks either way, because that is damage to a car rather than
 * anything gory.
 */
function driveGib(): boolean {
  return goreAmount("blood") !== null && dismemberAllowed("gib");
}

/** One body coming apart, held for as long as its pieces are in the air. */
type Burst = {
  burst: GoreBurst;
  x: number;
  y: number;
  bornMs: number;
  sprite: string;
};

/** How long a burst's pieces are drawn for (ms) — the run's own figure. */
const BURST_LIFE_MS = 2600;

export function DriveScreen({
  params,
  assets,
  onArrived,
}: {
  params: DriveParams;
  assets: GameAssets;
  /** The road is behind him: make the crossing that was waiting on it. */
  onArrived: (to: string, bodies: number) => void;
}): ReactElement {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const driveRef = useRef<DriveState>(createDrive(params));
  const burstsRef = useRef<Burst[]>([]);
  const inputRef = useRef<DriveInput>({ pedal: 0, wheel: 0 });
  const keysRef = useRef<Set<string>>(new Set());
  const padRef = useRef<{ x: number; y: number } | null>(null);
  const [speech, setSpeech] = useState<string[] | null>(null);
  const [hud, setHud] = useState({ mph: 0, bodies: 0, wear: 0 });
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
    const gib = driveGib();

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
      inputRef.current = pad
        ? { pedal: pad.x * nose, wheel: pad.y }
        : carKeyControl(keysRef.current, getSettings().keybindings);

      const drive = driveRef.current;
      // A line on screen parks the car — the same freeze the run's own dialogue
      // is, and for the same reason: nobody reads a monologue at 120 mph.
      const paused = speechRef.current !== null;
      acc += Math.min(MAX_CATCHUP_MS, now - last);
      last = now;
      while (acc >= STEP_MS) {
        acc -= STEP_MS;
        if (!paused) {
          stepDrive(drive, STEP_MS, inputRef.current);
          drainDrive(drive, burstsRef.current, now, gib, say, onArrived);
        }
      }

      // ── PAINT ─────────────────────────────────────────────────────────────
      const viewW = w / (scale * dpr);
      const viewH = h / (scale * dpr);
      ctx.setTransform(scale * dpr, 0, 0, scale * dpr, 0, 0);
      ctx.imageSmoothingEnabled = false;
      const camera = driveCamera(drive, viewW, viewH);
      drawDrive(ctx, drive, camera, assets.sprites, viewW, viewH, now);

      // The bodies coming apart, over the finished picture — the same pass the
      // run uses, handed a synthetic effect because a drive has no effect layer.
      burstsRef.current = burstsRef.current.filter(
        (b) => now - b.bornMs < BURST_LIFE_MS,
      );
      for (const b of burstsRef.current) {
        drawGore(
          ctx,
          {
            kind: "gib",
            gib: b.burst,
            sprite: b.sprite,
            untilMs: b.bornMs + BURST_LIFE_MS,
            durationMs: BURST_LIFE_MS,
            pos: { x: b.x, y: b.y },
          } as Parameters<typeof drawGore>[1],
          Math.round(b.x - camera.x),
          Math.round(b.y - camera.y),
          now,
          assets.sprites,
        );
      }

      setHud((prev) => {
        const next = {
          mph: driveMph(drive),
          bodies: drive.bodies,
          wear: Math.round(drive.car.wear * 100),
        };
        return prev.mph === next.mph &&
          prev.bodies === next.bodies &&
          prev.wear === next.wear
          ? prev
          : next;
      });
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [assets, nose, onArrived, say]);

  const damage = hud.wear;
  const failing = damage > 70;

  return (
    <div style={SHELL}>
      <canvas ref={canvasRef} style={CANVAS} />
      <div style={HUD_BAR}>
        <span>
          {hud.mph} <small style={{ opacity: 0.6 }}>MPH</small>
        </span>
        <span style={{ color: failing ? "#e8635a" : undefined }}>
          DAMAGE {damage}%
        </span>
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
            <p key={i} style={{ margin: "0 0 0.4em" }}>
              {line}
            </p>
          ))}
          <span style={{ opacity: 0.5, fontSize: "0.8em" }}>TAP TO GO ON</span>
        </button>
      )}
    </div>
  );
}

/** The pad's anchor, in client px — module-scoped because it is read inside
 * handlers that must not re-bind every render. */
let padOrigin: { x: number; y: number } | null = null;

/**
 * Turn one tick's drive events and strikes into what the app owes them.
 *
 * The BEATS are the four lines; the STRIKES are the bodies. Kept out of the
 * component body so the loop reads as a loop.
 */
function drainDrive(
  drive: DriveState,
  bursts: Burst[],
  now: number,
  gib: boolean,
  say: (id: string) => void,
  onArrived: (to: string, bodies: number) => void,
): void {
  for (const strike of drive.strikes) {
    const frames = CROWD_SPRITES[strike.variant % CROWD_SPRITES.length];
    bursts.push({
      // The burst's force is priced off the collision's own energy, so a body
      // taken at 120 comes apart harder than one clipped at 40 — the physics
      // reaches the picture rather than being re-decided here.
      burst: goreBurst(
        "gib",
        Math.atan2(strike.vel.y, strike.vel.x),
        Math.min(6, 1 + strike.joules / 30000),
        1,
        "humanoid",
        strike.id,
        "blood",
      ),
      x: strike.pos.x,
      y: strike.pos.y,
      bornMs: now,
      sprite: frames?.[0] ?? "stampede_a_0",
    });
  }
  for (const event of drive.events) {
    if (event.type === "monologue") say("drive_out_welfare");
    if (event.type === "breakdown") say("drive_broke_down");
    if (event.type === "arrived") {
      const quality = driveRideQuality(drive);
      say(
        quality === "clean"
          ? "drive_arrive_clean"
          : quality === "some"
            ? "drive_arrive_some"
            : "drive_arrive_bumpy",
      );
    }
  }
  // The two terminal beats, once their hold has run out. A BREAKDOWN puts the
  // player back at the top of the SAME road (the seed is kept, so the stretch
  // that killed him is the stretch he gets to learn); an ARRIVAL hands the
  // crossing back to the game screen.
  if (
    drive.outcome === DRIVE_OUTCOME.broken &&
    drive.outcomeMs > DRIVE.breakdownHoldMs
  ) {
    Object.assign(drive, restartDrive(drive));
    bursts.length = 0;
  }
  if (
    drive.outcome === DRIVE_OUTCOME.arrived &&
    drive.outcomeMs > DRIVE.arrivalHoldMs
  ) {
    onArrived(drive.params.to, drive.bodies);
  }
  void gib;
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
  top: 8,
  left: 12,
  right: 12,
  display: "flex",
  justifyContent: "space-between",
  color: "#e8e4d8",
  font: "16px monospace",
  letterSpacing: "0.08em",
  textShadow: "0 1px 0 #000",
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
  color: "#e8e4d8",
  font: "15px monospace",
  lineHeight: 1.45,
  textAlign: "left",
  cursor: "pointer",
};
