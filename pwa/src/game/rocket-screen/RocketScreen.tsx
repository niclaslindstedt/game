// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE FLIGHT, MOUNTED — the screen that owns the picture from the launch
// cutscene's black to the moon's, the drive screen's shape at the second seam.
//
// TWO HOSTS, ONE COMPONENT: the campaign mounts it over the frozen moon run
// (`GameScreen`), the arcade shelf mounts it for the score (`MinigameScreen`),
// and the `?rocket` workbench laps it forever. What differs between them
// arrives as props — exactly `DriveScreen`'s contract.
//
// THREE THINGS PARK THE SKY: the intro cards, the pause card, and the board at
// the end. The picture is painted under all three, so a card lifts onto a sky
// that is already there. A LINE never parks anything — the hero's remarks are
// barks over a climb that keeps climbing, which is also what leaves an
// unattended flight nothing to be stuck on.

import { useCallback, useEffect, useRef, useState } from "react";
import type { CSSProperties, ReactElement } from "react";

import { PixelText } from "@ui/lib/PixelText.tsx";
import {
  FLIGHT_OUTCOME,
  createFlight,
  flightHandsOff,
  flightScore,
  stepFlight,
  withHeroNameLines,
  type FlightInput,
  type FlightParams,
  type FlightState,
} from "@game/core";

import { ageBark, openBark, type Speech } from "../bark.ts";
import type { GameAssets } from "../assets.ts";
import { getSettings } from "../settings.ts";
import { actionForCode } from "../keybindings.ts";
import {
  pauseMusic,
  playMusic,
  resumeMusic,
  stopMusic,
} from "../music/index.ts";
import {
  DialogueBox,
  IDLE_REVEAL,
  type DialogueReveal,
} from "../overlays/DialogueBox.tsx";
import { viewScaleFor } from "../render/view.ts";
import { DPAD_DEADZONE_PX, DPAD_RING_PX } from "../game-screen/player-input.ts";
import { HudRoot } from "../hud/HudRoot.tsx";
import type { HudContext } from "../hud/context.ts";

import { drawFlight, flightCamera } from "./render.ts";
import {
  createRocketFx,
  drawRocketFx,
  shakeOffset,
  type RocketFxState,
} from "./rocket-fx.ts";
import {
  createFlightBeats,
  drainFlight,
  voiceFlightControls,
  type FlightBeats,
} from "./loop.ts";
import { endFlight } from "./end-flight.ts";
import { feelFlight, resetFlightHaptics } from "./rocket-haptics.ts";
import {
  flightBindings,
  flightDials,
  quantiseFlightDials,
  sameFlightDials,
  type FlightDials,
} from "./dials.ts";
import { flightThoughtPages } from "./voice.ts";
import { RocketIntro } from "./RocketIntro.tsx";
import { RocketPause } from "./RocketPause.tsx";
import {
  RocketScores,
  flightBoardResult,
  type FlightBoardResult,
} from "./RocketScores.tsx";

const STEP_MS = 16;
const MAX_CATCHUP_MS = 100;

/** The pad's full throw (client px) — the drive pad's, for the drive pad's
 * reason: a steering gesture, not a heading pick. */
const PAD_REACH_PX = 48;

/** THE FLIGHT'S SCORE. The moon's own theme, deliberately: the trip is TO the
 * moon, the cabinet is a trip to the moon, and the destination's music pulling
 * the player up the climb is the oldest trick a level select has. A score of
 * this sky's own is the natural next authoring pass; it lands here, one id. */
const FLIGHT_TRACK = "regolith_ride";

export function RocketScreen({
  params,
  assets,
  onLanded,
  stage,
  heroName,
  heroPortrait,
  onScreenshot,
  onMenu,
  auto = false,
  arcade = false,
}: {
  params: FlightParams;
  assets: GameAssets;
  /** The moon is under the pads: hand the trip on. `to` is the flight's own
   * destination (`FlightParams.to`). */
  onLanded: (to: string) => void;
  /** Developer staging (`?rocket` workbench) — run once before the first
   * tick. */
  stage?: (flight: FlightState) => void;
  heroName?: string;
  /** The dressed doll, composed by the caller — a flight has no `GameState` to
   * read one off. Null shortens the box. */
  heroPortrait?: string | null;
  onScreenshot?: () => void;
  /** The pause card's MAIN MENU; absent → the row is not drawn. */
  onMenu?: () => void;
  /** Nobody's hands: no cards, no board, no buzz — the attract loop's rules. */
  auto?: boolean;
  /** A lap off the shelf: changes only the pause card's offer. */
  arcade?: boolean;
}): ReactElement {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dpadRef = useRef<HTMLDivElement>(null);
  const flightRef = useRef<FlightState>(
    (() => {
      const flight = createFlight(params);
      stage?.(flight);
      return flight;
    })(),
  );
  const fxRef = useRef<RocketFxState>(createRocketFx());
  const beatsRef = useRef<FlightBeats>(createFlightBeats());
  const rumbleRef = useRef({ nextMs: 0 });
  const inputRef = useRef<FlightInput>({ throttle: 0, steer: 0 });
  const keysRef = useRef<Set<string>>(new Set());
  const padRef = useRef<{ x: number; y: number } | null>(null);
  const padIdRef = useRef<number | null>(null);
  const padDragRef = useRef<{ dx: number; dy: number }>({ dx: 0, dy: 0 });
  const padTypeRef = useRef<string>("touch");
  const [speech, setSpeech] = useState<Speech | null>(null);
  const speechRef = useRef<Speech | null>(null);
  const revealRef = useRef<DialogueReveal>(IDLE_REVEAL);
  const [paused, setPaused] = useState(false);
  const pausedRef = useRef(false);
  const [intro, setIntro] = useState(!auto);
  const introRef = useRef(!auto);
  const [board, setBoard] = useState<FlightBoardResult | null>(null);
  const boardRef = useRef<FlightBoardResult | null>(null);
  const [hud, setHud] = useState<FlightDials>(() =>
    quantiseFlightDials(flightDials(createFlight(params), false, 0)),
  );
  /** GET READY / LAND THE MODULE — the hands-off captions, published only when
   * they move. */
  const [caption, setCaption] = useState<string | null>(null);

  // The moon's theme, for the whole trip — see FLIGHT_TRACK.
  useEffect(() => {
    playMusic(FLIGHT_TRACK);
    return () => stopMusic();
  }, []);

  /** Raise one of the hero's lines — always a bark: the sky never waits. */
  const say = useCallback(
    (id: string) => {
      if (auto) return;
      const pages = flightThoughtPages(id).map((page) => [
        ...withHeroNameLines(page, heroName),
      ]);
      if (!pages.length) return;
      const next = openBark(id, pages, flightRef.current.ms);
      speechRef.current = next;
      setSpeech(next);
    },
    [auto, heroName],
  );

  const clearSpeech = useCallback(() => {
    speechRef.current = null;
    setSpeech(null);
  }, []);

  const ageSpeech = useCallback(
    (nowMs: number) => {
      const live = speechRef.current;
      if (!live) return;
      const next = ageBark(live, nowMs);
      if (next === live) return;
      speechRef.current = next;
      setSpeech(next);
      if (!next) clearSpeech();
    },
    [clearSpeech],
  );

  const setPause = useCallback((on: boolean) => {
    pausedRef.current = on;
    setPaused(on);
    if (on) pauseMusic();
    else resumeMusic();
  }, []);

  const endIntro = useCallback(() => {
    if (!introRef.current) return;
    introRef.current = false;
    setIntro(false);
  }, []);

  const dropControls = useCallback(() => {
    keysRef.current.clear();
    padIdRef.current = null;
    padRef.current = null;
    padOrigin = null;
  }, []);

  // Losing the window parks the ship — the drive's auto-pause, with the same
  // two exemptions (never over the board or the intro) and the same stuck-key
  // clear.
  useEffect(() => {
    if (auto) return;
    const park = () => {
      dropControls();
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

  /** Down on the moon. The cabinet gets its board; an unattended flight hands
   * straight on — never scored, never banked. */
  const arrive = useCallback(
    (flight: FlightState) => {
      if (auto) {
        onLanded(flight.params.to);
        return;
      }
      stopMusic();
      const result = flightBoardResult(
        flightScore(flight),
        flight.params.difficulty,
      );
      boardRef.current = result;
      setBoard(result);
    },
    [auto, onLanded],
  );

  const leaveBoard = useCallback(() => {
    boardRef.current = null;
    setBoard(null);
    onLanded(flightRef.current.params.to);
  }, [onLanded]);

  // ── THE CONTROLS ──────────────────────────────────────────────────────────
  // HOLD DOWN TO BURN, LEFT AND RIGHT TO STAY UPRIGHT — one rule each way the
  // screen is held. On keys: ↓/S is the throttle, ←→/A/D are the poofs. On a
  // thumb: the drag's downward pull is the throttle and its sideways lean is
  // the poofs — hold down and slide, which is the balance gesture the whole
  // minigame is.
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      const action = actionForCode(e.code, getSettings().keybindings);
      if (action === "screenshot") {
        onScreenshot?.();
        return;
      }
      if (boardRef.current) return;
      if (introRef.current) return;
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

  // ?debug — the sky's own `window.__game`; not cleaned up on unmount for the
  // workbench-remount reason the drive's handle is not.
  useEffect(() => {
    if (!new URLSearchParams(window.location.search).has("debug")) return;
    (window as { __flight?: FlightState }).__flight = flightRef.current;
  }, []);

  // ── THE LOOP ──────────────────────────────────────────────────────────────
  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    let acc = 0;
    const dpad = dpadRef.current;
    const dpadNub = dpad?.querySelector<HTMLElement>(".dpad-nub") ?? null;

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext("2d");
      if (!canvas || !ctx) return;

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

      // Gather the controls: a thumb on the pad wins, otherwise the keys.
      const pad = padRef.current;
      const flight = flightRef.current;
      const keys = keysRef.current;
      const keySteer =
        (keys.has("ArrowRight") || keys.has("KeyD") ? 1 : 0) -
        (keys.has("ArrowLeft") || keys.has("KeyA") ? 1 : 0);
      const keyThrottle =
        keys.has("ArrowDown") || keys.has("KeyS") || keys.has("Space") ? 1 : 0;
      inputRef.current = pad
        ? { throttle: Math.max(0, pad.y), steer: pad.x }
        : { throttle: keyThrottle, steer: keySteer };

      acc += Math.min(MAX_CATCHUP_MS, now - last);
      last = now;
      while (acc >= STEP_MS) {
        acc -= STEP_MS;
        // Re-read each step: `endFlight` can raise the board mid-batch.
        if (introRef.current || pausedRef.current || boardRef.current) break;
        stepFlight(flight, STEP_MS, inputRef.current);
        drainFlight(flight, fxRef.current, beatsRef.current, say);
        voiceFlightControls(
          flight,
          fxRef.current,
          rumbleRef.current,
          inputRef.current.throttle,
          inputRef.current.steer,
        );
        ageSpeech(flight.ms);
        if (!auto) feelFlight(flight);
        endFlight(flight, fxRef.current, beatsRef.current, clearSpeech, arrive);
      }

      // ── PAINT ─────────────────────────────────────────────────────────────
      const viewW = w / (scale * dpr);
      const viewH = h / (scale * dpr);
      const unit = scale * dpr;
      ctx.imageSmoothingEnabled = false;
      ctx.setTransform(unit, 0, 0, unit, 0, 0);
      // The camera is shaken, not the context — everything reads one frame.
      const base = flightCamera(flight, viewW, viewH);
      const shake = shakeOffset(fxRef.current, flight.ms);
      const cam = { x: base.x + shake.dx, topAlt: base.topAlt + shake.dy };
      const boost =
        inputRef.current.throttle > 0 &&
        !flightHandsOff(flight) &&
        flight.outcome === FLIGHT_OUTCOME.flying;
      drawFlight(ctx, flight, cam, assets, viewW, viewH, flight.ms, boost);
      drawRocketFx(ctx, fxRef.current, cam, flight.ms, viewW, viewH, assets);

      // ── THE STEERING HINT — the run's own dpad, the drive's rules. ────────
      if (dpad) {
        const show =
          !auto &&
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
          const lit = len >= DPAD_DEADZONE_PX;
          dpad.dataset.left = lit && ux < -0.38 ? "1" : "";
          dpad.dataset.right = lit && ux > 0.38 ? "1" : "";
          dpad.dataset.up = "";
          dpad.dataset.down = lit && uy > 0.38 ? "1" : "";
          if (dpadNub) {
            const reach =
              (Math.min(len, PAD_REACH_PX) / PAD_REACH_PX) * DPAD_RING_PX;
            dpadNub.style.transform = `translate(${ux * reach}px, ${uy * reach}px)`;
          }
        }
      }

      setHud((prev) => {
        const next = quantiseFlightDials(
          flightDials(flight, pausedRef.current, inputRef.current.throttle),
        );
        return sameFlightDials(prev, next) ? prev : next;
      });
      // The hands-off captions: GET READY over the opening, LAND THE MODULE
      // over the drop's first beat.
      setCaption((prev) => {
        const next = !flightHandsOff(flight)
          ? null
          : flight.phase === "landing"
            ? "LAND THE MODULE"
            : "GET READY";
        return prev === next ? prev : next;
      });
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [ageSpeech, arrive, assets, auto, clearSpeech, say]);

  // The haptics' rate-limit clock is module state; a fresh mount starts it
  // fresh so a lap's first hit always lands.
  useEffect(() => resetFlightHaptics(), []);

  /** Give up on the sky: arrive anyway, unscored. */
  const skipFlight = useCallback(() => {
    setPause(false);
    onLanded(params.to);
  }, [onLanded, params.to, setPause]);

  /** Mission control's half of the HUD context — no run state at all, and the
   * union's tag keeps a field widget off this surface. */
  const hudContext: HudContext = {
    surface: "rocket",
    assets,
    font: assets.font,
    values: flightBindings(hud),
    refs: {},
    actions: {
      pauseGame: () => {
        if (boardRef.current || introRef.current) return;
        dropControls();
        setPause(true);
      },
    },
  };

  const releasePad = useCallback((id: number) => {
    if (padIdRef.current !== id) return;
    padIdRef.current = null;
    padRef.current = null;
    padOrigin = null;
  }, []);

  return (
    <div className="drive-screen" style={SHELL}>
      <canvas ref={canvasRef} style={CANVAS} />

      {/* MISSION CONTROL — authored, like the fight's HUD and the road's dash
          (`content/hud/elements/rocket_*.yaml`): the twin dials, the hull bar,
          the attitude indicator, the T+ clock and the mission timeline. */}
      <div
        className={
          hud.dashLive ? "drive-hud-shelf drive-hud-in" : "drive-hud-shelf"
        }
      >
        <HudRoot ctx={hudContext} />
      </div>

      {/* The hands-off captions — the drive's GET READY beat, twice. */}
      {caption && (
        <div className="drive-ready" aria-hidden="true">
          <PixelText
            font={assets.font}
            text={caption}
            scale={3}
            color="#ffd75e"
          />
        </div>
      )}

      {/* THE PAD — one thumb, anywhere: pull DOWN for the burn, lean the same
          drag sideways for the poofs. Letting go closes the throttle, which is
          the one honest difference from the wagon (a rocket with no thumb on
          it still burns its base engine — the sim's, not the pad's). */}
      <div
        style={PAD}
        onPointerDown={(e) => {
          (e.target as Element).setPointerCapture(e.pointerId);
          if (padIdRef.current !== null) return;
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
          // The two axes are read independently — a thumb holding full burn
          // must not lose throttle by leaning: the drag is a POSITION, each
          // axis clamped to its own reach.
          padRef.current = {
            x: Math.max(-1, Math.min(1, dx / PAD_REACH_PX)),
            y: Math.max(-1, Math.min(1, dy / PAD_REACH_PX)),
          };
        }}
        onPointerUp={(e) => releasePad(e.pointerId)}
        onPointerCancel={(e) => releasePad(e.pointerId)}
      />
      <div ref={dpadRef} className="touch-dpad" aria-hidden="true">
        <span className="dpad-arrow dpad-up" />
        <span className="dpad-arrow dpad-down" />
        <span className="dpad-arrow dpad-left" />
        <span className="dpad-arrow dpad-right" />
        <span className="dpad-nub" />
      </div>

      {/* His own voice, in the game's own window — barks over a moving sky,
          inert, beside the dash (`.drive-bark`). */}
      {speech && (
        <div style={BARK} aria-live="polite">
          <DialogueBox
            className="drive-bark rocket-bark"
            font={assets.font}
            lines={speech.pages[speech.page] ?? EMPTY_PAGE}
            speaker={heroName ?? "YOU"}
            speakerColor="#7ef0c8"
            portrait={heroPortrait ?? null}
            pageKey={`${speech.id}:${speech.page}`}
            revealRef={revealRef}
            inert
          />
        </div>
      )}

      {paused && (
        <RocketPause
          font={assets.font}
          onResume={() => setPause(false)}
          onSkip={arcade ? undefined : skipFlight}
          onMenu={onMenu}
          cost={
            arcade
              ? "THE LAP ENDS HERE - AN UNFINISHED FLIGHT SCORES NOTHING"
              : undefined
          }
        />
      )}

      {board && (
        <RocketScores font={assets.font} result={board} onDone={leaveBoard} />
      )}

      {intro && <RocketIntro font={assets.font} onDone={endIntro} />}
    </div>
  );
}

const EMPTY_PAGE: string[] = [];

/** The pad's anchor, in client px — module-scoped for the drive pad's
 * reason. */
let padOrigin: { x: number; y: number } | null = null;

const SHELL: CSSProperties = {
  position: "absolute",
  inset: 0,
  background: "#070911",
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
const BARK: CSSProperties = {
  position: "absolute",
  inset: 0,
  pointerEvents: "none",
};
