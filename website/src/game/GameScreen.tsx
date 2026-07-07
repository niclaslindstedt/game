// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The playable screen: mounts the canvas, runs the fixed-timestep loop over
// the engine, feeds it pointer input per the player's control settings
// (touch: a virtual dpad anchored where the finger lands, taps jump —
// including a second finger while steering; mouse: hold- or cursor-steer,
// Space jumps; click, E, or the HUD button spends a banked item), plays
// event sounds, and overlays the DOM UI: HUD, the level intro text box, the
// level-up stat chooser, the Diablo-style inventory, and the end-of-run
// splash. One <GameScreen> mount = one session at the menu; one run = one
// `runId` (retry bumps it).

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
  levelDef,
  openInventory,
  skipCutscene,
  step,
  storyItemDef,
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

import { loadGameAssets, spriteDataUrl, type GameAssets } from "./assets.ts";
import { synth } from "./audio.ts";
import { CutsceneOverlay } from "./CutsceneOverlay.tsx";
import { DialogueOverlay } from "./DialogueOverlay.tsx";
import { IntroOverlay } from "./IntroOverlay.tsx";
import { InventoryPanel } from "./InventoryPanel.tsx";
import { LevelUpOverlay } from "./LevelUpOverlay.tsx";
import { playLevelMusic, stopMusic } from "./music/index.ts";
import {
  PickupFeed,
  PICKUP_TTL_MS,
  type PickupMessage,
} from "./PickupFeed.tsx";
import {
  hasSeenCutscene,
  markCutsceneSeen,
  markLevelCompleted,
  nextLevelId,
} from "./progress.ts";
import {
  computeCamera,
  drawEffects,
  drawFrame,
  VIEW_SCALE,
  type Effect,
} from "./render.ts";
import { getSettings } from "./settings.ts";
import { playEventSounds, playUiSound } from "./sfx/index.ts";
import { TIER_COLORS } from "./tiers.ts";

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

// The touch virtual dpad: dragging past the deadzone walks in that direction;
// the steer target is projected this far ahead (world units, must stay well
// beyond PLAYER.arriveRadius so the walk never "arrives").
const DPAD_DEADZONE_PX = 10;
const DPAD_STEER_DISTANCE = 200;
// The on-screen dpad hint: arrow ring radius and nub travel (CSS px).
const DPAD_RING_PX = 36;
// At most this many pickup lines show at once; older ones drop off the top so
// a loot flood never buries the screen.
const PICKUP_MAX = 6;
// The gentlest push past the deadzone still creeps at this fraction of full
// speed, so a barely-off-center thumb walks instead of standing still.
const MIN_WALK_THROTTLE = 0.35;
// Cursor-follow reaches full speed once the target leads the character by this
// many world px; nearer than that the character eases down to a walk.
const CURSOR_FULL_SPEED_PX = 90;

/** Map a dpad thumb distance (CSS px) to a walk throttle in [MIN_WALK, 1]. */
function dpadThrottle(len: number): number {
  const span = DPAD_RING_PX - DPAD_DEADZONE_PX;
  const t = span > 0 ? (len - DPAD_DEADZONE_PX) / span : 1;
  return (
    MIN_WALK_THROTTLE + (1 - MIN_WALK_THROTTLE) * Math.max(0, Math.min(1, t))
  );
}

/** Map a cursor-to-character distance (world px) to a walk throttle in [0, 1]. */
function cursorThrottle(dist: number): number {
  return Math.max(0, Math.min(1, dist / CURSOR_FULL_SPEED_PX));
}

function formatTime(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export function GameScreen({
  difficulty,
  levelId: initialLevelId,
  onQuit,
}: {
  difficulty: Difficulty;
  levelId: string;
  onQuit: () => void;
}) {
  // The level this run is on. Retry replays it; the victory splash's NEXT
  // LEVEL button advances it along LEVEL_ORDER, which re-runs the mount effect
  // (a fresh createGame) — each run is standalone, carrying only the chosen
  // difficulty across, per docs/game-content.md.
  const [levelId, setLevelId] = useState(initialLevelId);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dpadRef = useRef<HTMLDivElement>(null);
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
  // The lower-right pickup feed ("PICKED UP X"). Lines are appended as loot is
  // scooped and expire on individual PICKUP_TTL_MS timers (see the loop).
  const [pickups, setPickups] = useState<PickupMessage[]>([]);

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
    // `?level=` is a dev override that jumps to any catalog level and bypasses
    // the campaign unlock gate; otherwise the run starts on the picked level.
    const levelParam = params.get("level");
    const devLevel = levelParam && levelParam in LEVELS ? levelParam : null;
    const state = createGame(seed, devLevel ?? levelId, difficulty);
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

    // The lower-right pickup feed: a fresh run starts with an empty log, and
    // each line schedules its own expiry so rows fade independently (WoW's
    // loot toast: newest at the bottom, oldest drops off the top first).
    setPickups([]);
    const pickupTimers = new Set<ReturnType<typeof setTimeout>>();
    let pickupSeq = 0;
    const pushPickup = (text: string, color?: string) => {
      const id = ++pickupSeq;
      setPickups((prev) => {
        const next = [...prev, { id, text, color }];
        return next.length > PICKUP_MAX ? next.slice(-PICKUP_MAX) : next;
      });
      const timer = setTimeout(() => {
        pickupTimers.delete(timer);
        setPickups((prev) => prev.filter((p) => p.id !== id));
      }, PICKUP_TTL_MS);
      pickupTimers.add(timer);
    };

    // The run's music: the level theme rolls once the intro is dismissed and
    // stops for the end-of-run jingles (victory/defeat events below).
    const beginRun = () => {
      dismissIntro(state);
      playLevelMusic(levelDef(state.level.id).music);
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

    // The control scheme (see settings.ts): a touch anchors a virtual dpad
    // where it lands — dragging away from the anchor walks in that
    // direction, releasing stops. Any tap jumps: a quick solo tap, or the
    // other hand tapping while the first finger steers. A mouse follows the
    // steering setting — cursor-follow mode turns clicks into item use
    // (Space jumps), classic mode keeps click-tap = jump.
    const pointer = trackPointer(canvas, {
      onTap: ({ pointerType }) => {
        if (pointerType !== "mouse" || getSettings().steering === "hold") {
          jumpQueuedRef.current = true;
        }
      },
      onPress: ({ pointerType }) => {
        if (pointerType === "mouse" && getSettings().steering === "hover") {
          useItemQueuedRef.current = true;
        }
      },
    });
    // The dpad hint is drawn by the render loop straight onto DOM styles —
    // per-frame position/highlight without React re-renders.
    const dpad = dpadRef.current;
    const dpadNub = dpad?.querySelector<HTMLElement>(".dpad-nub") ?? null;
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
          input.throttle = 1;
          input.jump = decided.jump;
          input.useItem = decided.useItem ?? false;
        } else {
          const settings = getSettings();
          if (pointer.state.held && pointer.state.pointerType !== "mouse") {
            // Touch virtual dpad: the drag offset from the anchor is a
            // direction, not a destination — steer relative to the player.
            const dx = pointer.state.x - pointer.state.originX;
            const dy = pointer.state.y - pointer.state.originY;
            const len = Math.hypot(dx, dy);
            input.steering = len >= DPAD_DEADZONE_PX;
            if (input.steering) {
              input.target.x =
                state.player.pos.x + (dx / len) * DPAD_STEER_DISTANCE;
              input.target.y =
                state.player.pos.y + (dy / len) * DPAD_STEER_DISTANCE;
              // How far the thumb sits from the dpad center sets the pace: a
              // nudge past the deadzone creeps, a full push to the ring runs.
              input.throttle = dpadThrottle(len);
            }
          } else {
            // Cursor-follow steering: a hovering mouse steers with no button.
            const hoverSteer =
              settings.steering === "hover" && pointer.state.hovering;
            input.steering = pointer.state.held || hoverSteer;
            input.target.x = camera.x + pointer.state.x * cssToWorld.x;
            input.target.y = camera.y + pointer.state.y * cssToWorld.y;
            // On desktop the pace scales with how far the cursor leads the
            // character — hold it close to stroll, throw it wide to sprint.
            input.throttle = cursorThrottle(
              Math.hypot(
                input.target.x - state.player.pos.x,
                input.target.y - state.player.pos.y,
              ),
            );
          }
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
          // Loot and powerups announce themselves in the lower-right feed;
          // equipment carries its tier color, plot pieces glow gold.
          if (event.type === "itemCollected" && event.name) {
            pushPickup(
              event.name,
              event.tier ? TIER_COLORS[event.tier] : undefined,
            );
          }
          if (event.type === "storyItemCollected") {
            pushPickup(storyItemDef(event.defId).name, "#ffd75e");
          }
          // The run is over: silence the loop so the jingle stands alone.
          if (event.type === "victory" || event.type === "defeat") {
            stopMusic();
          }
          // Clearing a level records it (per difficulty) so the campaign
          // unlocks the next one and the menu marks this one replayable.
          if (event.type === "victory") {
            markLevelCompleted(state.level.id, difficulty);
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

        // The virtual dpad hint: anchored where the touch landed, arrows
        // brighten toward the drag direction, the nub trails the finger.
        if (dpad) {
          const show =
            !bot &&
            pointer.state.held &&
            pointer.state.pointerType !== "mouse" &&
            state.phase === "playing";
          dpad.style.display = show ? "block" : "none";
          if (show) {
            dpad.style.left = `${pointer.state.originX}px`;
            dpad.style.top = `${pointer.state.originY}px`;
            const dx = pointer.state.x - pointer.state.originX;
            const dy = pointer.state.y - pointer.state.originY;
            const len = Math.hypot(dx, dy);
            const steering = len >= DPAD_DEADZONE_PX;
            const nx = steering ? dx / len : 0;
            const ny = steering ? dy / len : 0;
            // cos(67°) ≈ 0.38: diagonals light up both of their arrows.
            dpad.dataset.left = nx < -0.38 ? "1" : "";
            dpad.dataset.right = nx > 0.38 ? "1" : "";
            dpad.dataset.up = ny < -0.38 ? "1" : "";
            dpad.dataset.down = ny > 0.38 ? "1" : "";
            if (dpadNub) {
              const reach = Math.min(len, DPAD_RING_PX);
              dpadNub.style.transform = `translate(${nx * reach}px, ${ny * reach}px)`;
            }
          }
        }

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
      pickupTimers.forEach(clearTimeout);
    };
  }, [assets, runId, difficulty, levelId]);

  if (!assets) {
    return <div className="game-loading">Loading…</div>;
  }
  const font = assets.font;

  return (
    <div className="game-screen">
      <canvas ref={canvasRef} className="game-canvas" />

      {/* The touch steering hint (see the render loop): subtle arrows around
          the finger's anchor point plus a nub that trails the drag. */}
      <div ref={dpadRef} className="touch-dpad" aria-hidden="true">
        <span className="dpad-arrow dpad-up" />
        <span className="dpad-arrow dpad-down" />
        <span className="dpad-arrow dpad-left" />
        <span className="dpad-arrow dpad-right" />
        <span className="dpad-nub" />
      </div>

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
                  const icon = spriteDataUrl(
                    assets.sprites,
                    abilityDef(hud.heldAbilities[0] as string).icon,
                  );
                  return icon ? (
                    <img src={icon} alt="" className="pixel-img use-icon" />
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

      {hud?.phase === "playing" && (
        <PickupFeed font={font} messages={pickups} />
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
            playLevelMusic(levelDef(state.level.id).music);
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
            {hud.phase === "victory" &&
              state &&
              (() => {
                const next = nextLevelId(state.level.id);
                if (!next) return null;
                return (
                  <button
                    type="button"
                    className="pixel-button"
                    onClick={() => {
                      setHud(null);
                      setLevelId(next);
                    }}
                  >
                    <PixelText
                      font={font}
                      text="NEXT LEVEL"
                      scale={3}
                      color="#0b0d10"
                    />
                  </button>
                );
              })()}
            <button
              type="button"
              className={`pixel-button${hud.phase === "victory" ? " secondary" : ""}`}
              onClick={() => {
                setHud(null);
                setRunId((id) => id + 1);
              }}
            >
              <PixelText
                font={font}
                text="RETRY"
                scale={3}
                color={hud.phase === "victory" ? undefined : "#0b0d10"}
              />
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
