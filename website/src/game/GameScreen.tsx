// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The playable screen: mounts the canvas, runs the fixed-timestep loop over
// the engine, feeds it hold-to-steer pointer input (tap or Space to jump),
// plays event sounds, and overlays the DOM UI: HUD, the level intro text
// box, the level-up stat chooser, the Diablo-style inventory, and the
// end-of-run splash. One <GameScreen> mount = one session at the menu; one
// run = one `runId` (retry bumps it).

import { useEffect, useRef, useState } from "react";

import {
  allocateStat,
  BOT_STRATEGIES,
  botAct,
  botAllocate,
  closeInventory,
  createBot,
  createGame,
  debug,
  dismissIntro,
  openInventory,
  step,
  type BotStrategy,
  type GameInput,
  type GamePhase,
  type GameState,
  type GameStats,
} from "@game/core";

import { startGameLoop } from "@ui/lib/game-loop.ts";
import { PixelText } from "@ui/lib/PixelText.tsx";
import { trackPointer } from "@ui/lib/pointer.ts";
import { createSynth, type Synth } from "@ui/lib/synth.ts";

import { loadGameAssets, type GameAssets } from "./assets.ts";
import { IntroOverlay } from "./IntroOverlay.tsx";
import { InventoryPanel } from "./InventoryPanel.tsx";
import { LevelUpOverlay } from "./LevelUpOverlay.tsx";
import { computeCamera, drawFrame, VIEW_SCALE } from "./render.ts";
import { playEventSounds } from "./sfx.ts";

type Hud = {
  phase: GamePhase;
  hp: number;
  maxHp: number;
  level: number;
  xp: number;
  xpToNext: number;
  enemiesLeft: number;
  bagCount: number;
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
  const jumpQueuedRef = useRef(false);
  const [assets, setAssets] = useState<GameAssets | null>(null);
  const [runId, setRunId] = useState(0);
  const [hud, setHud] = useState<Hud | null>(null);
  // The live engine state object for this run. Mutable (the loop advances it
  // in place); stored in React state so overlays can read it during render.
  const [state, setState] = useState<GameState | null>(null);
  // Bumped by paused-phase UI (inventory, level-up) after engine mutations
  // so React re-reads the frozen state.
  const [, setUiTick] = useState(0);
  const bumpUi = () => setUiTick((t) => t + 1);

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
    setState(state);
    debug(`run ${runId} started (seed ${seed})`);

    // In debug mode (?debug) the live state is reachable from the console /
    // automated playtests. See the debug-game skill.
    const params = new URLSearchParams(window.location.search);
    if (params.has("debug")) {
      (window as { __game?: GameState }).__game = state;
    }

    // Autoplay (?bot=<strategy>): the engine bot steers instead of the
    // pointer and spends level-ups itself. See the playtest skill.
    const requested = params.get("bot");
    const bot =
      requested && (BOT_STRATEGIES as string[]).includes(requested)
        ? createBot(requested as BotStrategy)
        : null;

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

    // Tap = jump (moon gravity!); hold = steer. Space works too.
    const pointer = trackPointer(canvas, {
      onTap: () => {
        jumpQueuedRef.current = true;
      },
    });
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.repeat) return;
      if (event.code === "Space") {
        event.preventDefault();
        if (state.phase === "intro") {
          dismissIntro(state);
          bumpUi();
        } else {
          jumpQueuedRef.current = true;
        }
      } else if (event.key === "i" || event.key === "I") {
        if (state.phase === "playing") openInventory(state);
        else if (state.phase === "inventory") closeInventory(state);
        bumpUi();
      } else if (event.key === "Escape" && state.phase === "inventory") {
        closeInventory(state);
        bumpUi();
      }
    };
    window.addEventListener("keydown", onKeyDown);

    const input: GameInput = {
      steering: false,
      target: { x: 0, y: 0 },
      jump: false,
    };
    let lastHud = "";

    const stop = startGameLoop({
      simulate(dtMs) {
        if (bot) {
          // The bot is a drop-in input source; it also clears the paused
          // phases a human would click through.
          if (state.phase === "intro") dismissIntro(state);
          if (state.phase === "levelup") {
            allocateStat(state, botAllocate(bot, state));
            bumpUi();
          }
          const decided = botAct(bot, state);
          input.steering = decided.steering;
          input.target.x = decided.target.x;
          input.target.y = decided.target.y;
          input.jump = decided.jump;
        } else {
          const camera = computeCamera(state, canvas.width, canvas.height);
          input.steering = pointer.state.held;
          input.target.x = camera.x + pointer.state.x * cssToWorld.x;
          input.target.y = camera.y + pointer.state.y * cssToWorld.y;
          input.jump = jumpQueuedRef.current;
          jumpQueuedRef.current = false;
        }
        step(state, input, dtMs);
        playEventSounds(synth, state.events);
      },
      render(timeMs) {
        const camera = computeCamera(state, canvas.width, canvas.height);
        drawFrame(ctx, state, assets, camera, timeMs);

        // Mirror the slow-moving values into React only when they change.
        const bagCount = state.player.inventory.filter(Boolean).length;
        const key = `${state.phase}/${state.player.hp}/${state.player.xp}/${state.player.level}/${state.player.pendingStatPoints}/${state.enemies.length}/${bagCount}/${Math.floor(state.stats.timeMs / 1000)}`;
        if (key !== lastHud) {
          lastHud = key;
          setHud({
            phase: state.phase,
            hp: state.player.hp,
            maxHp: state.player.maxHp,
            level: state.player.level,
            xp: state.player.xp,
            xpToNext: state.player.xpToNext,
            enemiesLeft: state.enemies.length,
            bagCount,
            stats: { ...state.stats },
          });
        }
      },
    });

    return () => {
      stop();
      pointer.dispose();
      observer.disconnect();
      window.removeEventListener("keydown", onKeyDown);
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
            <PixelText
              font={font}
              text={`LV ${hud.level}`}
              scale={2}
              color="#ffd75e"
            />
            <div className="hud-bar xp-bar">
              <div
                className="hud-bar-fill xp-fill"
                style={{ width: `${(100 * hud.xp) / hud.xpToNext}%` }}
              />
            </div>
          </div>
          <div className="hud-right">
            <PixelText
              font={font}
              text={`GHOSTS ${hud.stats.totalEnemies - hud.enemiesLeft}/${hud.stats.totalEnemies}`}
              scale={2}
              color="#d9a0f0"
            />
            <PixelText
              font={font}
              text={formatTime(hud.stats.timeMs)}
              scale={2}
            />
            <button
              type="button"
              className="pixel-button bag-button"
              aria-label="open-inventory"
              onClick={() => {
                if (state) {
                  openInventory(state);
                  bumpUi();
                }
              }}
            >
              <PixelText
                font={font}
                text={`BAG ${hud.bagCount}`}
                scale={2}
                color="#0b0d10"
              />
            </button>
          </div>
        </div>
      )}

      {state && hud?.phase === "intro" && (
        <IntroOverlay
          state={state}
          font={font}
          onBegin={() => {
            dismissIntro(state);
            bumpUi();
          }}
        />
      )}

      {state && hud?.phase === "levelup" && (
        <LevelUpOverlay state={state} font={font} onChange={bumpUi} />
      )}

      {state && hud?.phase === "inventory" && (
        <InventoryPanel
          state={state}
          font={font}
          sprites={assets.sprites}
          onChange={bumpUi}
          onClose={() => {
            closeInventory(state);
            bumpUi();
          }}
        />
      )}

      {hud && (hud.phase === "victory" || hud.phase === "defeat") && (
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
              text={`LEVEL REACHED ${hud.level}`}
              scale={3}
            />
            <PixelText
              font={font}
              text={`GHOSTS ${hud.stats.kills}/${hud.stats.totalEnemies}`}
              scale={3}
            />
            <PixelText
              font={font}
              text={`XP ${hud.stats.xpGained}`}
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
              text={`ITEMS ${hud.stats.itemsCollected}`}
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
