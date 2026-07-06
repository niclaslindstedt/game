// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The playable screen: mounts the canvas, runs the fixed-timestep loop over
// the engine, feeds it hold-to-steer pointer input, plays event sounds, and
// overlays the DOM HUD + end-of-run splash (stats + retry). One <GameScreen>
// mount = one session at the menu; one run = one `runId` (retry bumps it).

import { useEffect, useRef, useState } from "react";

import {
  createGame,
  debug,
  step,
  type GameInput,
  type GamePhase,
  type GameState,
  type GameStats,
} from "@game/core";

import { startGameLoop } from "../lib/game-loop.ts";
import { PixelText } from "../lib/PixelText.tsx";
import { trackPointer } from "../lib/pointer.ts";
import { createSynth, type Synth } from "../lib/synth.ts";
import { loadGameAssets, type GameAssets } from "./assets.ts";
import { computeCamera, drawFrame, VIEW_SCALE } from "./render.ts";
import { playEventSounds } from "./sfx.ts";

type Hud = {
  phase: GamePhase;
  hp: number;
  maxHp: number;
  enemiesLeft: number;
  stats: GameStats;
};

function formatTime(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export function GameScreen({ onQuit }: { onQuit: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const synthRef = useRef<Synth | null>(null);
  const [assets, setAssets] = useState<GameAssets | null>(null);
  const [runId, setRunId] = useState(0);
  const [hud, setHud] = useState<Hud | null>(null);

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

    const seed = Date.now() & 0x7fffffff;
    const state = createGame(seed);
    debug(`run ${runId} started (seed ${seed})`);

    // In debug mode (?debug) the live state is reachable from the console /
    // automated playtests. See the debug-game skill.
    if (new URLSearchParams(window.location.search).has("debug")) {
      (window as { __game?: GameState }).__game = state;
    }

    const synth = (synthRef.current ??= createSynth());
    // Audio can only start from a user gesture; the run itself begins with
    // a click/tap, and steering keeps the context alive after that.
    synth.unlock();
    const unlock = () => synth.unlock();
    canvas.addEventListener("pointerdown", unlock);

    // Backing store in world units; CSS upscales by VIEW_SCALE (pixelated).
    const cssToWorld = { x: 1 / VIEW_SCALE, y: 1 / VIEW_SCALE };
    const resize = () => {
      canvas.width = Math.max(1, Math.ceil(canvas.clientWidth / VIEW_SCALE));
      canvas.height = Math.max(1, Math.ceil(canvas.clientHeight / VIEW_SCALE));
      cssToWorld.x = canvas.width / canvas.clientWidth;
      cssToWorld.y = canvas.height / canvas.clientHeight;
    };
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    resize();

    const pointer = trackPointer(canvas);
    const input: GameInput = { steering: false, target: { x: 0, y: 0 } };
    let lastHud = "";

    const stop = startGameLoop({
      simulate(dtMs) {
        const camera = computeCamera(state, canvas.width, canvas.height);
        input.steering = pointer.state.held;
        input.target.x = camera.x + pointer.state.x * cssToWorld.x;
        input.target.y = camera.y + pointer.state.y * cssToWorld.y;
        step(state, input, dtMs);
        playEventSounds(synth, state.events);
      },
      render(timeMs) {
        const camera = computeCamera(state, canvas.width, canvas.height);
        drawFrame(ctx, state, assets, camera, timeMs);

        // Mirror the slow-moving values into React only when they change.
        const key = `${state.phase}/${state.player.hp}/${state.enemies.length}/${Math.floor(state.stats.timeMs / 1000)}`;
        if (key !== lastHud) {
          lastHud = key;
          setHud({
            phase: state.phase,
            hp: state.player.hp,
            maxHp: state.player.maxHp,
            enemiesLeft: state.enemies.length,
            stats: { ...state.stats },
          });
        }
      },
    });

    return () => {
      stop();
      pointer.dispose();
      observer.disconnect();
      canvas.removeEventListener("pointerdown", unlock);
    };
  }, [assets, runId]);

  if (!assets) {
    return <div className="game-loading">Loading…</div>;
  }
  const font = assets.font;

  return (
    <div className="game-screen">
      <canvas ref={canvasRef} className="game-canvas" />

      {hud && hud.phase === "playing" && (
        <div className="game-hud">
          <div className="hud-left">
            <PixelText font={font} text="HP" scale={2} color="#9aa3ad" />
            <div className="hud-bar">
              <div
                className="hud-bar-fill"
                style={{ width: `${(100 * hud.hp) / hud.maxHp}%` }}
              />
            </div>
            <PixelText font={font} text={String(hud.hp)} scale={2} />
          </div>
          <div className="hud-right">
            <PixelText
              font={font}
              text={`SLIMES ${hud.stats.totalEnemies - hud.enemiesLeft}/${hud.stats.totalEnemies}`}
              scale={2}
              color="#d9a0f0"
            />
            <PixelText
              font={font}
              text={formatTime(hud.stats.timeMs)}
              scale={2}
            />
          </div>
        </div>
      )}

      {hud && hud.phase !== "playing" && (
        <div className="game-splash">
          <PixelText
            font={font}
            text={hud.phase === "victory" ? "LEVEL CLEAR!" : "YOU DIED"}
            scale={6}
            color={hud.phase === "victory" ? "#7ef0c8" : "#d83a3a"}
          />
          <div className="splash-stats">
            <PixelText
              font={font}
              text={`TIME ${formatTime(hud.stats.timeMs)}`}
              scale={3}
            />
            <PixelText
              font={font}
              text={`KILLS ${hud.stats.kills}/${hud.stats.totalEnemies}`}
              scale={3}
            />
            <PixelText
              font={font}
              text={`SHOTS FIRED ${hud.stats.shotsFired}`}
              scale={3}
            />
            <PixelText
              font={font}
              text={`DAMAGE DEALT ${hud.stats.damageDealt}`}
              scale={3}
            />
            <PixelText
              font={font}
              text={`DAMAGE TAKEN ${hud.stats.damageTaken}`}
              scale={3}
            />
            <PixelText
              font={font}
              text={`MEDKITS USED ${hud.stats.itemsCollected}`}
              scale={3}
            />
          </div>
          <div className="splash-buttons">
            <button
              type="button"
              className="pixel-button"
              onClick={() => {
                setHud(null);
                setRunId((id) => id + 1);
              }}
            >
              <PixelText font={font} text="RETRY" scale={3} color="#0b0d10" />
            </button>
            <button
              type="button"
              className="pixel-button secondary"
              onClick={onQuit}
            >
              <PixelText font={font} text="MENU" scale={3} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
