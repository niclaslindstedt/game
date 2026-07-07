// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The playable screen: mounts the canvas, runs the fixed-timestep loop over
// the engine, feeds it pointer input per the player's control settings
// (hold- or cursor-steer; tap/Space jumps; click, two-finger tap, E, or the
// HUD button spends a banked item), plays event sounds, and overlays the
// DOM UI: HUD, the level intro text box, the level-up stat chooser, the
// Diablo-style inventory, and the end-of-run splash. One <GameScreen> mount
// = one session at the menu; one run = one `runId` (retry bumps it).

import { useEffect, useRef, useState } from "react";

import {
  abilityDef,
  advanceDialogue,
  allocateStat,
  BOT_STRATEGIES,
  botAct,
  botAllocate,
  closeInventory,
  createBot,
  createGame,
  debug,
  dismissIntro,
  enemyDef,
  LEVELS,
  openInventory,
  skipCutscene,
  step,
  tapCutscene,
  weaponDef,
  type BotStrategy,
  type Difficulty,
  type GameInput,
  type GamePhase,
  type GameState,
  type GameStats,
} from "@game/core";

import { startGameLoop } from "@ui/lib/game-loop.ts";
import { PixelText } from "@ui/lib/PixelText.tsx";
import { trackPointer } from "@ui/lib/pointer.ts";

import { loadGameAssets, spriteByName, type GameAssets } from "./assets.ts";
import { synth } from "./audio.ts";
import { CutsceneOverlay } from "./CutsceneOverlay.tsx";
import { DialogueOverlay } from "./DialogueOverlay.tsx";
import { IntroOverlay } from "./IntroOverlay.tsx";
import { InventoryPanel } from "./InventoryPanel.tsx";
import { LevelUpOverlay } from "./LevelUpOverlay.tsx";
import { playLevelMusic, stopMusic } from "./music.ts";
import { hasSeenCutscene, markCutsceneSeen } from "./progress.ts";
import {
  computeCamera,
  drawEffects,
  drawFrame,
  VIEW_SCALE,
  type Effect,
} from "./render.ts";
import { getSettings } from "./settings.ts";
import { playEventSounds, playUiSound } from "./sfx.ts";

type Hud = {
  phase: GamePhase;
  hp: number;
  maxHp: number;
  level: number;
  xp: number;
  xpToNext: number;
  enemiesLeft: number;
  bagCount: number;
  /** Banked ability pickups, oldest first (ABILITY_DEFS ids). */
  heldAbilities: string[];
  /** Equipped weapon's durability 0..1, or null for the unbreakable sidearm. */
  weaponWear: number | null;
  stats: GameStats;
};

function formatTime(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export function GameScreen({
  difficulty,
  onQuit,
}: {
  difficulty: Difficulty;
  onQuit: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const jumpQueuedRef = useRef(false);
  const useItemQueuedRef = useRef(false);
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

    // Dev/playtest handles: `?seed=` pins the run's layout, `?level=` jumps
    // to any catalog level (see docs/configuration.md).
    const params = new URLSearchParams(window.location.search);
    const seedParam = Number(params.get("seed"));
    const seed =
      Number.isInteger(seedParam) && seedParam > 0
        ? seedParam & 0x7fffffff
        : Date.now() & 0x7fffffff;
    const levelParam = params.get("level");
    const levelId = levelParam && levelParam in LEVELS ? levelParam : undefined;
    const state = createGame(seed, levelId, difficulty);
    // A prelude plays once per device: retries and later runs jump straight
    // to the intro. `pendingCutscene` marks the scene seen however it ends
    // (played out, tapped through, SKIP, Esc, or a bot skipping it) — the
    // watcher in the loop below catches every exit path in one place.
    let pendingCutscene =
      state.phase === "cutscene" ? (state.cutscene?.defId ?? null) : null;
    if (pendingCutscene && hasSeenCutscene(pendingCutscene)) {
      skipCutscene(state);
      pendingCutscene = null;
    }
    setState(state);
    debug(`run ${runId} started (seed ${seed}, ${difficulty})`);

    // The run's music: the level theme rolls once the intro is dismissed and
    // stops for the end-of-run jingles (victory/defeat events below).
    const beginRun = () => {
      dismissIntro(state);
      playLevelMusic();
    };

    // In debug mode (?debug) the live state is reachable from the console /
    // automated playtests. See the debug-game skill.
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

    // The control scheme (see settings.ts): touch always steers by holding,
    // taps jump, and a two-finger tap spends a banked item. A mouse follows
    // the steering setting — cursor-follow mode turns clicks into item use
    // (Space jumps), classic mode keeps click-tap = jump.
    const pointer = trackPointer(canvas, {
      onTap: ({ fingers, pointerType }) => {
        if (fingers >= 2) {
          useItemQueuedRef.current = true;
        } else if (
          pointerType !== "mouse" ||
          getSettings().steering === "hold"
        ) {
          jumpQueuedRef.current = true;
        }
      },
      onPress: ({ pointerType }) => {
        if (pointerType === "mouse" && getSettings().steering === "hover") {
          useItemQueuedRef.current = true;
        }
      },
    });
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.repeat) return;
      if (event.code === "Space") {
        event.preventDefault();
        if (state.phase === "cutscene") {
          tapCutscene(state);
        } else if (state.phase === "intro") {
          beginRun();
          bumpUi();
        } else if (state.phase === "dialogue") {
          advanceDialogue(state);
          playUiSound(synth, "move");
          bumpUi();
        } else {
          jumpQueuedRef.current = true;
        }
      } else if (event.key === "Escape" && state.phase === "cutscene") {
        skipCutscene(state);
        playUiSound(synth, "back");
      } else if (event.key === "e" || event.key === "E") {
        useItemQueuedRef.current = true;
      } else if (event.key === "i" || event.key === "I") {
        if (state.phase === "playing") {
          openInventory(state);
          playUiSound(synth, "confirm");
        } else if (state.phase === "inventory") {
          closeInventory(state);
          playUiSound(synth, "back");
        }
        bumpUi();
      } else if (event.key === "Escape" && state.phase === "inventory") {
        closeInventory(state);
        playUiSound(synth, "back");
        bumpUi();
      }
    };
    window.addEventListener("keydown", onKeyDown);

    const input: GameInput = {
      steering: false,
      target: { x: 0, y: 0 },
      jump: false,
      useItem: false,
    };
    let lastHud = "";
    // Transient visuals driven by engine events (lightning strikes).
    let effects: Effect[] = [];

    const stop = startGameLoop({
      simulate(dtMs) {
        const camera = computeCamera(state, canvas.width, canvas.height);
        // The character only targets what the player can see.
        input.view = {
          x: camera.x,
          y: camera.y,
          width: canvas.width,
          height: canvas.height,
        };
        if (bot) {
          // The bot is a drop-in input source; it also clears the paused
          // phases a human would click through.
          if (state.phase === "cutscene") skipCutscene(state);
          if (state.phase === "intro") beginRun();
          if (state.phase === "dialogue") {
            advanceDialogue(state);
            bumpUi();
          }
          if (state.phase === "levelup") {
            allocateStat(state, botAllocate(bot, state));
            bumpUi();
          }
          const decided = botAct(bot, state);
          input.steering = decided.steering;
          input.target.x = decided.target.x;
          input.target.y = decided.target.y;
          input.jump = decided.jump;
          input.useItem = decided.useItem ?? false;
        } else {
          const settings = getSettings();
          // Cursor-follow steering: a hovering mouse steers with no button.
          const hoverSteer =
            settings.steering === "hover" && pointer.state.hovering;
          input.steering = pointer.state.held || hoverSteer;
          input.target.x = camera.x + pointer.state.x * cssToWorld.x;
          input.target.y = camera.y + pointer.state.y * cssToWorld.y;
          input.jump = jumpQueuedRef.current;
          jumpQueuedRef.current = false;
          // Instant item use (the touch-first default) pops pickups the
          // moment they are carried; manual waits for the player's edge.
          input.useItem =
            useItemQueuedRef.current ||
            (settings.itemUse === "auto" &&
              state.player.heldAbilities.length > 0);
          useItemQueuedRef.current = false;
        }
        step(state, input, dtMs);
        if (pendingCutscene && state.phase !== "cutscene") {
          markCutsceneSeen(pendingCutscene);
          pendingCutscene = null;
        }
        playEventSounds(synth, state.events);

        for (const event of state.events) {
          if (event.type === "lightning") {
            effects.push({
              kind: "lightning",
              pos: event.pos,
              untilMs: state.stats.timeMs + 130,
            });
          }
          // Every landed hit sprays the victim's gore (ghosts: ectoplasm)
          // and floats its damage off the head — crits slam and shake.
          if (event.type === "enemyHit" || event.type === "enemyKilled") {
            const def = enemyDef(event.defId);
            effects.push({
              kind: "splash",
              pos: {
                x: event.pos.x + Math.round((Math.random() - 0.5) * 6),
                y: event.pos.y + Math.round((Math.random() - 0.5) * 6),
              },
              untilMs: state.stats.timeMs + 240,
              durationMs: 240,
              sprite: def.gore ?? "blood",
            });
            const duration = event.crit ? 900 : 650;
            effects.push({
              kind: "damage",
              pos: {
                x: event.pos.x + Math.round((Math.random() - 0.5) * 12),
                y: event.pos.y - def.radius - 2 - Math.round(Math.random() * 4),
              },
              untilMs: state.stats.timeMs + duration,
              durationMs: duration,
              value: event.damage,
              crit: event.crit,
            });
          }
          if (event.type === "nuke") {
            effects.push({
              kind: "nuke",
              pos: event.pos,
              untilMs: state.stats.timeMs + 450,
              durationMs: 450,
            });
          }
          // The run is over: silence the loop so the jingle stands alone.
          if (event.type === "victory" || event.type === "defeat") {
            stopMusic();
          }
        }
        if (effects.length > 0) {
          effects = effects.filter((e) => e.untilMs > state.stats.timeMs);
        }
      },
      render(timeMs) {
        const camera = computeCamera(state, canvas.width, canvas.height);
        drawFrame(ctx, state, assets, camera, timeMs);
        drawEffects(ctx, effects, camera, state.stats.timeMs, assets);

        // Mirror the slow-moving values into React only when they change.
        const bagCount = state.player.inventory.filter(Boolean).length;
        const held = state.player.heldAbilities.join(",");
        const weapon = state.player.equipment.weapon;
        const weaponWear =
          weapon.durability === undefined
            ? null
            : weapon.durability / weaponDef(weapon.defId).durability;
        const key = `${state.phase}/${state.player.hp}/${state.player.xp}/${state.player.level}/${state.player.pendingStatPoints}/${state.enemies.length}/${bagCount}/${held}/${weaponWear?.toFixed(2) ?? ""}/${Math.floor(state.stats.timeMs / 1000)}`;
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
            heldAbilities: [...state.player.heldAbilities],
            weaponWear,
            stats: { ...state.stats },
          });
        }
      },
    });

    return () => {
      stop();
      stopMusic();
      pointer.dispose();
      observer.disconnect();
      window.removeEventListener("keydown", onKeyDown);
      canvas.removeEventListener("pointerdown", unlock);
    };
  }, [assets, runId, difficulty]);

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
            {hud.weaponWear !== null && (
              <>
                <PixelText font={font} text="WPN" scale={2} color="#9aa3ad" />
                <div className="hud-bar">
                  <div
                    className="hud-bar-fill"
                    style={{
                      width: `${Math.round(100 * hud.weaponWear)}%`,
                      background: hud.weaponWear < 0.25 ? "#d83a3a" : "#9aa3ad",
                    }}
                  />
                </div>
              </>
            )}
          </div>
          <div className="hud-right">
            {hud.heldAbilities.length > 0 && (
              <button
                type="button"
                className="pixel-button use-button"
                aria-label="use-item"
                onClick={() => {
                  useItemQueuedRef.current = true;
                }}
              >
                {(() => {
                  const icon = spriteByName(
                    assets.sprites,
                    abilityDef(hud.heldAbilities[0] as string).icon,
                  );
                  return icon ? (
                    <img src={icon.src} alt="" className="pixel-img use-icon" />
                  ) : null;
                })()}
                <PixelText
                  font={font}
                  text={
                    hud.heldAbilities.length > 1
                      ? `USE x${hud.heldAbilities.length}`
                      : "USE"
                  }
                  scale={2}
                  color="#0b0d10"
                />
              </button>
            )}
            <PixelText
              font={font}
              text={`${state?.level.foes ?? "FOES"} ${hud.stats.totalEnemies - hud.enemiesLeft}/${hud.stats.totalEnemies}`}
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

      {state && state.cutscene && hud?.phase === "cutscene" && (
        <CutsceneOverlay
          cutscene={state.cutscene}
          assets={assets}
          font={font}
          onTap={() => {
            tapCutscene(state);
            playUiSound(synth, "move");
          }}
          onSkip={() => {
            skipCutscene(state);
            playUiSound(synth, "back");
          }}
        />
      )}

      {state && hud?.phase === "intro" && (
        <IntroOverlay
          state={state}
          font={font}
          onBegin={() => {
            dismissIntro(state);
            playLevelMusic();
            bumpUi();
          }}
        />
      )}

      {state && hud?.phase === "dialogue" && (
        <DialogueOverlay
          state={state}
          assets={assets}
          font={font}
          onAdvance={() => {
            advanceDialogue(state);
            playUiSound(synth, "move");
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
              text={`${state?.level.foes ?? "FOES"} ${hud.stats.kills}/${hud.stats.totalEnemies}`}
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
