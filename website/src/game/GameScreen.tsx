// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The playable screen: mounts the canvas, runs the fixed-timestep loop over
// the engine, feeds it pointer input per the player's control settings
// (touch: a virtual dpad anchored where the finger lands, taps jump —
// including a second finger while steering; mouse: hold- or cursor-steer,
// Space jumps; a powerup-dock slot tap, click, or E spends a banked ability,
// and dragging a slot clear of the dock discards it in a poof of smoke),
// plays event sounds, and overlays the DOM UI: the HUD (top vitals + XP strip
// + the hero-avatar inventory button, plus the bottom-corner powerup dock),
// the level intro text box, the level-up stat chooser, the Diablo-style
// inventory, and the end-of-run splash. One <GameScreen> mount = one session
// at the menu; one run = one `runId` (retry bumps it).

import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from "react";

import {
  abilityDef,
  advanceDialogue,
  advanceIntro,
  allocateStat,
  confirmRespec,
  BOT_STRATEGIES,
  botAct,
  botAllocate,
  closeInventory,
  closeMap,
  closeShop,
  createBot,
  createGame,
  debug,
  difficultyDef,
  discardHeldAbility,
  dismissIntro,
  enemyDef,
  equipFromInventory,
  equipmentIcon,
  equipmentLevelReq,
  extractLoadout,
  isWeaponDef,
  LEVELS,
  levelDef,
  MENACE,
  MERCHANT,
  menaceStage,
  openInventory,
  openMap,
  openShop,
  pauseGame,
  equipmentMaxDurability,
  PLAYER,
  playerAppearance,
  resumeGame,
  skipCutscene,
  skipIntro,
  STAMINA,
  step,
  storyItemDef,
  tapCutscene,
  weaponDamageFor,
  weaponDef,
  type BotStrategy,
  type Difficulty,
  type Equipment,
  type GameInput,
  type GamePhase,
  type GameState,
  type GameStats,
  type Tier,
} from "@game/core";

import { formatCompact } from "@ui/lib/format-number.ts";
import { startGameLoop } from "@ui/lib/game-loop.ts";
import { PixelText } from "@ui/lib/PixelText.tsx";
import type { PixelFont } from "@ui/lib/pixel-font.ts";
import { trackPointer } from "@ui/lib/pointer.ts";

import {
  loadGameAssets,
  spriteCursor,
  spriteDataUrl,
  type GameAssets,
} from "./assets.ts";
import { synth } from "./audio.ts";
import { playEventHaptics, playTypewriterHaptic } from "./haptics.ts";
import { CutsceneOverlay, type CutsceneReveal } from "./CutsceneOverlay.tsx";
import { DialogueOverlay, type DialogueReveal } from "./DialogueOverlay.tsx";
import { IntroOverlay, type IntroReveal } from "./IntroOverlay.tsx";
import { TitleCard } from "./TitleCard.tsx";
import { InventoryPanel } from "./InventoryPanel.tsx";
import { LevelUpOverlay } from "./LevelUpOverlay.tsx";
import { MapOverlay } from "./MapOverlay.tsx";
import { RespecOverlay } from "./RespecOverlay.tsx";
import { PauseOverlay } from "./PauseOverlay.tsx";
import { ShopPanel } from "./ShopPanel.tsx";
import {
  pauseMusic,
  playLevelMusic,
  resumeMusic,
  stopMusic,
} from "./music/index.ts";
import {
  PickupFeed,
  PICKUP_TTL_MS,
  type PickupMessage,
} from "./PickupFeed.tsx";
import {
  PickupModal,
  PICKUP_CARD_TTL_MS,
  type PickupCard,
} from "./PickupModal.tsx";
import { bestTime, recordRun } from "./highscores.ts";
import {
  bankKeepsakesOnVictory,
  markLevelCompleted,
  nextLevelId,
  noteHardcoreDeath,
  restoreKeepsakes,
  saveLoadout,
  startingLoadout,
} from "./progress.ts";
import {
  computeCamera,
  drawEffects,
  drawFrame,
  VIEW_SCALE,
  viewScaleFor,
  uiScaleFor,
  type Effect,
} from "./render.ts";
import { getSettings } from "./settings.ts";
import { playEventSounds, playUiSound } from "./sfx/index.ts";
import { TIER_COLORS, WEAPON_CLASS_COLORS } from "./tiers.ts";

type Hud = {
  phase: GamePhase;
  hp: number;
  maxHp: number;
  /** Current sprint pool and its max. */
  stamina: number;
  maxStamina: number;
  level: number;
  xp: number;
  xpToNext: number;
  enemiesLeft: number;
  /** Current menace/rampage stage (0…MENACE.maxStage) driving the gauge. */
  menaceStage: number;
  /** Free (empty) bag cells — shown on the avatar badge, red at 0. */
  bagFree: number;
  /** True for a short window after the full bag turned away loot — pulses the
   * inventory button to nudge the player to open it and make room. */
  bagFullHint: boolean;
  /** Banked ability pickups, oldest first (ABILITY_DEFS ids). */
  heldAbilities: string[];
  /**
   * Currently running powerups, one entry per distinct id (in activation
   * order) with how many copies of it are stacked. Drives the highlighted
   * active-powerup strip — a stack of two shows a ×2 badge, sharing one slot;
   * the per-frame countdown/radial for each is written to the DOM directly by
   * the render loop (off the freshest copy), not through here.
   */
  activeAbilities: { defId: string; count: number }[];
  /** Equipped weapon def id — drives the always-on weapon widget. */
  weaponDefId: string;
  /** Equipped weapon's durability 0..1, or null for the unbreakable sidearm. */
  weaponWear: number | null;
  /** The purse — coins earned selling loot to the merchant. */
  coins: number;
  /** Player sprite family (`playerAppearance`) for the inventory avatar. */
  appearance: string;
  stats: GameStats;
};

// A powerup mid-drag out of its dock slot. `moved` flips once the pointer
// travels past the tap threshold, which is what tells a discard drag apart
// from a plain tap that spends the powerup.
type DockDrag = {
  index: number;
  defId: string;
  rect: DOMRect;
  x: number;
  y: number;
  moved: boolean;
};

// A one-shot smoke poof anchored (in viewport px) to where a discarded powerup
// vanished.
type Poof = { id: number; x: number; y: number };

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
// How far a powerup must be dragged off its dock slot's center before the
// gesture counts as a drag-to-discard rather than a tap that spends it (CSS px).
const DOCK_DRAG_THRESHOLD_PX = 16;
// How long a discard smoke poof lives before it clears itself (ms) — matches
// the .powerup-poof CSS animation.
const POOF_TTL_MS = 600;
// How long the inventory button keeps pulsing after the bag turns away loot,
// nudging the player to open it and make room (ms). A few pulse cycles — long
// enough to notice without nagging.
const BAG_FULL_HINT_MS = 4000;
// The gentlest push past the deadzone still creeps at this fraction of full
// speed, so a barely-off-center thumb walks instead of standing still.
const MIN_WALK_THROTTLE = 0.35;
// Cursor-follow reaches full speed once the target leads the character by this
// many world px; nearer than that the character eases down to a walk. This is
// the phone baseline: desktop renders the world at 2× zoom (uiScaleFor), which
// would otherwise double the physical cursor travel needed to sprint, so the
// live throttle divides that extra zoom back out (see the render loop) — the
// on-screen distance to full speed stays constant across viewports.
const CURSOR_FULL_SPEED_PX = 90;

/** Map a dpad thumb distance (CSS px) to a walk throttle in [MIN_WALK, 1]. */
function dpadThrottle(len: number): number {
  const span = DPAD_RING_PX - DPAD_DEADZONE_PX;
  const t = span > 0 ? (len - DPAD_DEADZONE_PX) / span : 1;
  return (
    MIN_WALK_THROTTLE + (1 - MIN_WALK_THROTTLE) * Math.max(0, Math.min(1, t))
  );
}

/** Map a cursor-to-character distance (world px) to a walk throttle in [0, 1].
 * `fullSpeedPx` is the distance at which the throttle saturates; callers shrink
 * it by the viewport's UI scale so the character sprints after the same CSS
 * cursor travel whether or not the desktop 2× zoom is active. */
function cursorThrottle(dist: number, fullSpeedPx: number): number {
  return Math.max(0, Math.min(1, dist / fullSpeedPx));
}

// Desktop WASD/arrow steering (settings.keyboardMove === "on"): each held key
// contributes a cardinal direction; the vector sum is the heading, projected
// DPAD_STEER_DISTANCE ahead like the touch dpad. Movement is binary — run by
// default, hold Shift to walk, stand still with no key down. Keyed by
// `event.code` so it's layout-independent (AZERTY etc.).
const MOVE_KEYS: Record<string, { x: number; y: number }> = {
  KeyW: { x: 0, y: -1 },
  ArrowUp: { x: 0, y: -1 },
  KeyS: { x: 0, y: 1 },
  ArrowDown: { x: 0, y: 1 },
  KeyA: { x: -1, y: 0 },
  ArrowLeft: { x: -1, y: 0 },
  KeyD: { x: 1, y: 0 },
  ArrowRight: { x: 1, y: 0 },
};
// The reduced pace while Shift is held; the default (no modifier) runs at full
// speed. Pinned to the engine's run threshold so a Shift-walk stays a *walk*
// for the stamina system: `running = throttle > STAMINA.runThreshold`, so a
// throttle at (not above) the threshold recovers stamina instead of draining
// it. A bare 0.6 tipped over the 0.5 threshold and drained like a run.
const KEYBOARD_WALK_THROTTLE = STAMINA.runThreshold;

/** Other carried weapons, strongest first — the switch targets shared by the
 * Q weapon menu and the 1-4 hotkeys. Damage is stat-scaled (weaponDamageFor)
 * so the ordering matches the number each slot shows and follows the build. */
function weaponAlternatives(
  state: GameState,
): { item: Equipment; index: number; dmg: number }[] {
  return state.player.inventory
    .map((item, index) => ({ item, index }))
    .filter((e) => e.item !== null && isWeaponDef(e.item.defId))
    .map((e) => ({
      item: e.item as Equipment,
      index: e.index,
      dmg: Math.round(weaponDamageFor(state, e.item as Equipment)),
    }))
    .sort((a, b) => b.dmg - a.dmg);
}

function formatTime(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

/** The rampage gauge heats from amber to red as the menace stage climbs
 * (0…MENACE.maxStage = 10) — the top stages glow a hotter red so the deadly
 * end of the meter reads at a glance. */
function rampageColor(stage: number): string {
  if (stage >= 8) return "#ff3020";
  if (stage >= 5) return "#ff5030";
  if (stage >= 2) return "#ff9040";
  return "#ffd050";
}

/** The live kill tally, which jolts on every kill so a fresh frag is felt.
 * The jolt scales with the recent kill rate: a lone kill is a small nudge,
 * but a burst — several mobs downed inside a one-second window (a nuke, a
 * cleaving swing) — stacks into a hard, wide shake. Amplitude/rotation/duration
 * all ride the burst count so a rampage reads as chaos, not a metronome. */
function KillCounter({
  font,
  label,
  kills,
}: {
  font: PixelFont;
  label: string;
  kills: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const prevKills = useRef(kills);
  // Timestamps of kills landed within the last second — its length is the
  // burst size that drives how hard the counter shakes.
  const recent = useRef<number[]>([]);

  useEffect(() => {
    const delta = kills - prevKills.current;
    prevKills.current = kills;
    // Ignore resets (retry) and no-ops; only a rising tally shakes.
    if (delta <= 0) return;
    const el = ref.current;
    if (!el) return;

    const now = performance.now();
    for (let i = 0; i < delta; i++) recent.current.push(now);
    recent.current = recent.current.filter((t) => now - t <= 1000);
    const burst = recent.current.length;

    // Map the burst onto a felt shake: a single kill nudges ~3px, and each
    // further kill this second widens the throw and tilt toward a hard cap.
    const amp = Math.min(3 + (burst - 1) * 1.6, 12);
    const rot = Math.min(1.5 + (burst - 1) * 1.1, 9);
    const dur = Math.min(160 + (burst - 1) * 24, 420);
    el.style.setProperty("--shake-amp", `${amp}px`);
    el.style.setProperty("--shake-rot", `${rot}deg`);
    el.style.setProperty("--shake-dur", `${dur}ms`);

    // Restart the animation from the top on every kill: drop the class, force a
    // reflow so the browser sees a genuine state change, then re-add it.
    el.classList.remove("kill-shake");
    void el.offsetWidth;
    el.classList.add("kill-shake");
  }, [kills]);

  return (
    <div ref={ref} className="hud-kills">
      <PixelText
        font={font}
        text={`${label} ${kills}`}
        scale={2}
        color="#d9a0f0"
      />
    </div>
  );
}

export function GameScreen({
  difficulty,
  levelId: initialLevelId,
  onQuit,
  onExitToMenu,
  skipIntro: skipOpening = false,
  respec = false,
  resume,
}: {
  difficulty: Difficulty;
  levelId: string;
  /** Abandon the run for good (the end-of-run splash's MENU button). */
  onQuit: () => void;
  /** Leave to the main menu mid-run (the pause screen's MENU button), handing
   * the live engine state up so it can be parked in memory and resumed. */
  onExitToMenu: (state: GameState) => void;
  /** Warp-in (the title moon's long-press): drop straight into play, skipping
   * the prelude cutscene and the hero's level-intro monologue. */
  skipIntro?: boolean;
  /** Cashed a LEVEL TOKEN: refund the carried build into a from-scratch stat
   * respec once the intro clears (see the engine's `beginRespec`). Only the
   * token-jumped level itself respecs — advancing to the NEXT LEVEL does not. */
  respec?: boolean;
  /** Resuming a run parked in memory: adopt this frozen (paused) engine state
   * as-is instead of starting fresh. Consumed once — a later RETRY / NEXT
   * LEVEL in this same mount recreates the game normally. */
  resume?: GameState;
}) {
  // The level this run is on. Retry replays it; the victory splash's NEXT
  // LEVEL button advances it along LEVEL_ORDER, which re-runs the mount effect
  // (a fresh createGame) — each run is standalone, carrying only the chosen
  // difficulty across, per docs/game-content.md.
  const [levelId, setLevelId] = useState(initialLevelId);
  // The parked engine state to adopt on this mount (a run resumed from the
  // menu), consumed the first time the run effect fires so a later RETRY /
  // NEXT LEVEL recreates the game from scratch instead of re-adopting it.
  const resumeRef = useRef<GameState | null>(resume ?? null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dpadRef = useRef<HTMLDivElement>(null);
  // The active-powerup strip: its radial cooldown sweeps and countdown numbers
  // are written straight to the DOM by the render loop (like the dpad), so the
  // timer stays smooth without a React re-render every frame.
  const activePowerupsRef = useRef<HTMLDivElement>(null);
  const jumpQueuedRef = useRef(false);
  const useItemQueuedRef = useRef(false);
  // Where the last tap/click landed (CSS px on the canvas): the sim loop
  // checks it against the discovered merchant — a tap on him at the counter
  // opens the shop instead of jumping.
  const shopTapRef = useRef<{ x: number; y: number } | null>(null);
  // Desktop keyboard steering: which MOVE_KEYS are held right now, and whether
  // the walk modifier (Shift) is down. Read every sim tick (see the loop).
  const heldMoveKeysRef = useRef<Set<string>>(new Set());
  const walkingRef = useRef(false);
  // Mirror of `weaponMenuOpen` so the (closure-captured) key handler can read
  // the live value without re-registering on every toggle.
  const weaponMenuOpenRef = useRef(false);
  // Which powerup dock slot the player tapped this frame (index into
  // heldAbilities). null = spend the oldest (click / E / auto-use).
  const useItemIndexRef = useRef<number | null>(null);
  // A powerup being dragged out of its dock slot to trash it. Tracks the slot
  // (index + defId), the slot cell's screen rect (where the poof blooms), the
  // live pointer position (the drag ghost), and whether it has moved far enough
  // to count as a drag rather than a tap-to-spend. Mirrored into a ref so the
  // pointer-up handler reads the freshest value without re-subscribing.
  const [dockDrag, setDockDrag] = useState<DockDrag | null>(null);
  const dockDragRef = useRef<DockDrag | null>(null);
  // Short-lived smoke poofs left where discarded powerups vanished; each clears
  // itself after the CSS animation (see the .powerup-poof layer).
  const [poofs, setPoofs] = useState<Poof[]>([]);
  const poofIdRef = useRef(0);
  // Live mirror of the dialogue crawl so keyboard advance shares the tap's
  // two-step feel: the first press finishes the reveal, the next turns the
  // page. Defaults to "done" so an advance before any scene is a plain turn.
  const dialogueRevealRef = useRef<DialogueReveal>({
    done: true,
    skip: () => {},
  });
  // Same mirror for the level-intro monologue crawl, so Space shares the tap's
  // two-step feel: the first press finishes the reveal, the next turns the page.
  const introRevealRef = useRef<IntroReveal>({ done: true, skip: () => {} });
  // …and for the prelude cutscene's crawling lines.
  const cutsceneRevealRef = useRef<CutsceneReveal>({
    done: true,
    skip: () => {},
  });
  const [assets, setAssets] = useState<GameAssets | null>(null);
  const [runId, setRunId] = useState(0);
  const [hud, setHud] = useState<Hud | null>(null);
  // Whether the just-ended run set a new best survival time on this
  // difficulty — flagged on the end-of-run splash's high-score line.
  const [newRecord, setNewRecord] = useState(false);
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
  // The framed pickup card ("PICKED UP <gear>") for bag gear — one at a time,
  // the newest replacing the last, cleared on its own PICKUP_CARD_TTL_MS timer.
  const [pickupCard, setPickupCard] = useState<PickupCard | null>(null);
  // Whether the in-HUD weapon switcher (tap the weapon slot / Q) is expanded.
  const [weaponMenuOpen, setWeaponMenuOpen] = useState(false);
  useEffect(() => {
    weaponMenuOpenRef.current = weaponMenuOpen;
  }, [weaponMenuOpen]);

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

    // Desktop mouse: the pointer becomes the 16-bit crosshair reticle over the
    // play field (the aim dimension made visible). Touch never shows a cursor.
    canvas.style.cursor =
      spriteCursor(assets.sprites, "crosshair", { fallback: "crosshair" }) ??
      "crosshair";

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
    const runLevelId = devLevel ?? levelId;
    // Resuming a run parked in memory (exited to the menu from the pause
    // screen): adopt the frozen engine state as-is. Consumed once — a RETRY /
    // NEXT LEVEL later in this mount falls back to a fresh createGame.
    const resumed = resumeRef.current;
    resumeRef.current = null;
    // The carry-over: the loadout banked when the previous level was cleared
    // (or a derived stand-in for dev jumps with nothing banked). The hero
    // arrives with the level, stats and items he finished the last level with.
    const state =
      resumed ??
      createGame(
        seed,
        runLevelId,
        difficulty,
        startingLoadout(runLevelId, difficulty) ?? undefined,
        // The token respec is owed only on the jumped-into level; once the run
        // advances along the campaign (a fresh levelId) it no longer applies.
        respec && levelId === initialLevelId,
      );
    // The forever-hoard follows the hero into every FRESH run: any stashed
    // unique/legendary he isn't already carrying lands in the bag. (In
    // hardcore the stash exists too — right up until a death burns it.) A
    // resumed run already carries whatever its own creation restored.
    if (!resumed) restoreKeepsakes(state);
    // The prelude always plays — every run opens on its cutscene (the player
    // can dismiss it with the SKIP button or Esc). It is never auto-skipped on
    // replay.
    setState(state);
    setNewRecord(false);
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

    // The framed pickup card for bag gear: the newest find pops in and replaces
    // whatever is showing (its id keys the mount, restarting the pop + spark),
    // then clears itself after PICKUP_CARD_TTL_MS.
    setPickupCard(null);
    let pickupCardTimer: ReturnType<typeof setTimeout> | undefined;
    let pickupCardSeq = 0;
    const showPickupCard = (opts: {
      name: string;
      tier: Tier;
      defId?: string;
      itemId?: number;
      equipped: boolean;
      upgrade: boolean;
    }) => {
      const { name, tier, defId, itemId, equipped, upgrade } = opts;
      const icon = defId
        ? spriteDataUrl(assets.sprites, equipmentIcon(defId))
        : undefined;
      const color = TIER_COLORS[tier] ?? TIER_COLORS.regular;
      const id = ++pickupCardSeq;
      // Tap-to-equip is offered only for a bagged find the hero can wear right
      // now — an auto-equipped upgrade is already worn, and an under-leveled
      // find would be refused. The item is located by its stable id so a bag
      // rearranged while the card is up still equips the right piece.
      const canEquip =
        !equipped &&
        itemId != null &&
        defId != null &&
        state.player.level >= equipmentLevelReq(defId);
      const onEquip = canEquip
        ? () => {
            const index = state.player.inventory.findIndex(
              (it) => it?.id === itemId,
            );
            if (index >= 0 && equipFromInventory(state, index)) {
              playUiSound(synth, "equip");
              bumpUi();
              // Flip the live card to its worn state — the find is now equipped,
              // no longer an upgrade to chase or a tap target.
              setPickupCard((prev) =>
                prev && prev.id === id
                  ? {
                      ...prev,
                      equipped: true,
                      upgrade: false,
                      onEquip: undefined,
                    }
                  : prev,
              );
            }
          }
        : undefined;
      setPickupCard({
        id,
        icon,
        name,
        color,
        tier,
        upgrade,
        equipped,
        onEquip,
      });
      if (pickupCardTimer) clearTimeout(pickupCardTimer);
      pickupCardTimer = setTimeout(
        () => setPickupCard(null),
        PICKUP_CARD_TTL_MS,
      );
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

    if (resumed) {
      // Back from the menu: the run was frozen on the pause screen and the
      // menu played the title theme over it. Re-arm this level's theme but
      // keep it paused, so the player lands on the same PAUSED overlay and one
      // tap resumes both the sim and the music in place.
      playLevelMusic(levelDef(state.level.id).music);
      pauseMusic();
    } else if (skipOpening) {
      // Warp-in from the title moon's long-press: bail the whole opening and
      // drop straight into play. skipCutscene lands the prelude on the level
      // `title` card, then beginRun's dismissIntro carries it into `playing` —
      // the same shortcut the keyboard and headless bot use, done up front.
      if (state.phase === "cutscene") skipCutscene(state);
      beginRun();
    }

    // Backing store in world units; CSS upscales by the view scale
    // (pixelated). The scale is the phone baseline (VIEW_SCALE), doubled on
    // large/desktop viewports so the world matches the 2×-scaled DOM UI.
    const cssToWorld = { x: 1 / VIEW_SCALE, y: 1 / VIEW_SCALE };
    // Extra desktop zoom (1 on phones, 2 on large screens); cursor-follow
    // divides it out so a sprint takes the same CSS mouse travel everywhere.
    let uiScale = uiScaleFor(window.innerWidth, window.innerHeight);
    const resize = () => {
      const scale = viewScaleFor(window.innerWidth, window.innerHeight);
      canvas.width = Math.max(1, Math.ceil(canvas.clientWidth / scale));
      canvas.height = Math.max(1, Math.ceil(canvas.clientHeight / scale));
      cssToWorld.x = canvas.width / canvas.clientWidth;
      cssToWorld.y = canvas.height / canvas.clientHeight;
      uiScale = uiScaleFor(window.innerWidth, window.innerHeight);
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
        // Remember where the tap landed (CSS px): the sim loop checks it
        // against the merchant before letting it act as a jump.
        shopTapRef.current = { x: pointer.state.x, y: pointer.state.y };
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

    // Pause freezes the sim (the engine's "paused" phase) and the music
    // together; resume lifts both. Music truly resumes in place — the chiptune
    // player keeps its position across the pause. Guarded so it only toggles
    // mid-run, never over an intro/level-up/end splash.
    const pause = () => {
      if (state.phase !== "playing") return;
      pauseGame(state);
      pauseMusic();
      bumpUi();
    };
    const resume = () => {
      if (state.phase !== "paused") return;
      resumeGame(state);
      resumeMusic();
      bumpUi();
    };

    const onKeyDown = (event: KeyboardEvent) => {
      // Track held movement keys + the run modifier every keydown (repeats
      // included — Set.add is idempotent) so the sim loop reads live state.
      if (event.code in MOVE_KEYS) {
        heldMoveKeysRef.current.add(event.code);
        if (getSettings().keyboardMove === "on" && state.phase === "playing") {
          event.preventDefault(); // arrow keys must not scroll the page
        }
      }
      if (event.code === "ShiftLeft" || event.code === "ShiftRight") {
        walkingRef.current = true;
      }
      if (event.repeat) return;
      // Space and Enter both turn the page through any waiting scene (cutscene,
      // intro, title card, in-world dialogue). Space alone doubles as jump once
      // the run is live; Enter is scene-only so it never fires an action.
      const advanceKey = event.code === "Space" || event.key === "Enter";
      const inScene =
        state.phase === "cutscene" ||
        state.phase === "intro" ||
        state.phase === "title" ||
        state.phase === "dialogue";
      if (advanceKey && inScene) {
        event.preventDefault();
        if (state.phase === "cutscene") {
          // Two-step like the dialogue crawl: finish the line, then turn it.
          if (!cutsceneRevealRef.current.done) {
            cutsceneRevealRef.current.skip();
          } else {
            tapCutscene(state);
          }
        } else if (state.phase === "intro") {
          // Two-step like the dialogue crawl: finish the reveal, then turn the
          // page (past the last page the engine flashes the level name).
          if (!introRevealRef.current.done) {
            introRevealRef.current.skip();
          } else {
            advanceIntro(state);
            playUiSound(synth, "move");
          }
          bumpUi();
        } else if (state.phase === "title") {
          beginRun();
          bumpUi();
        } else if (state.phase === "dialogue") {
          if (!dialogueRevealRef.current.done) {
            dialogueRevealRef.current.skip();
          } else {
            advanceDialogue(state);
            playUiSound(synth, "move");
          }
          bumpUi();
        }
      } else if (event.code === "Space") {
        // No scene up: Space is the jump.
        event.preventDefault();
        jumpQueuedRef.current = true;
      } else if (event.key === "Escape" && state.phase === "cutscene") {
        skipCutscene(state);
        playUiSound(synth, "back");
      } else if (event.key === "Escape" && state.phase === "intro") {
        skipIntro(state);
        playUiSound(synth, "back");
        bumpUi();
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
      } else if (
        (event.key === "m" || event.key === "M") &&
        (state.phase === "playing" || state.phase === "map")
      ) {
        // M toggles the fog-of-war level map (same freeze as the bag).
        if (state.phase === "playing") {
          openMap(state);
          playUiSound(synth, "confirm");
        } else {
          closeMap(state);
          playUiSound(synth, "back");
        }
        bumpUi();
      } else if (event.key === "Escape" && state.phase === "shop") {
        closeShop(state);
        playUiSound(synth, "back");
        bumpUi();
      } else if (event.key === "Escape" && state.phase === "map") {
        closeMap(state);
        playUiSound(synth, "back");
        bumpUi();
      } else if (
        (event.key === "p" || event.key === "P" || event.key === "Escape") &&
        (state.phase === "playing" || state.phase === "paused")
      ) {
        // P or Escape toggles the pause screen (desktop). Music pauses with the
        // sim. Escape does double duty — it skips the scenes above, and pauses
        // once the run is live.
        if (state.phase === "playing") {
          pause();
          playUiSound(synth, "confirm");
        } else {
          resume();
          playUiSound(synth, "back");
        }
      } else if (
        (event.key === "q" || event.key === "Q") &&
        state.phase === "playing"
      ) {
        // Q brings up the weapon switcher (1-4 then pick from it).
        setWeaponMenuOpen((open) => !open);
        playUiSound(synth, "confirm");
      } else if (state.phase === "playing" && /^[1-9]$/.test(event.key)) {
        const n = Number(event.key) - 1;
        if (weaponMenuOpenRef.current) {
          // The weapon menu is up: 1-4 equip the listed alternatives.
          const alt = weaponAlternatives(state)[n];
          if (alt && equipFromInventory(state, alt.index)) {
            playUiSound(synth, "equip");
            setWeaponMenuOpen(false);
            bumpUi();
          }
        } else if (n <= 2 && state.player.heldAbilities[n]) {
          // Otherwise 1/2/3 fire the matching powerup dock slot.
          useItemQueuedRef.current = true;
          useItemIndexRef.current = n;
        }
      }
    };
    const onKeyUp = (event: KeyboardEvent) => {
      if (event.code in MOVE_KEYS) heldMoveKeysRef.current.delete(event.code);
      if (event.code === "ShiftLeft" || event.code === "ShiftRight") {
        walkingRef.current = false;
      }
    };
    // Losing focus (alt-tab, switching tab/app) must not leave a key "stuck",
    // and auto-pauses the run — the world (and music) freeze until the player
    // comes back and clicks in. A no-op mid-overlay (pause() is guarded).
    const onBlur = () => {
      heldMoveKeysRef.current.clear();
      walkingRef.current = false;
      pause();
    };
    // Tab hidden (mobile app-switch, backgrounded tab): same auto-pause. Both
    // signals fire in different browsers, and pause() is idempotent.
    const onVisibility = () => {
      if (document.hidden) pause();
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);
    document.addEventListener("visibilitychange", onVisibility);

    const input: GameInput = {
      steering: false,
      target: { x: 0, y: 0 },
      jump: false,
      useItem: false,
    };
    let lastHud = "";
    // Transient visuals driven by engine events (lightning strikes).
    let effects: Effect[] = [];
    // Run-clock ms through which the "bags are full" nudge stays lit — set when
    // a `pickupBlocked` event fires, drives the inventory button's pulse.
    let bagFullHintUntilMs = 0;

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
          // phases a human would click through (including an auto-pause from
          // the headless tab reporting itself hidden/unfocused).
          if (state.phase === "paused") resumeGame(state);
          if (state.phase === "cutscene") skipCutscene(state);
          if (state.phase === "intro") skipIntro(state);
          if (state.phase === "title") beginRun();
          if (state.phase === "dialogue") {
            advanceDialogue(state);
            bumpUi();
          }
          if (state.phase === "levelup") {
            allocateStat(state, botAllocate(bot, state));
            bumpUi();
          }
          if (state.phase === "respec") {
            // Spend the refunded pool point-by-point, then commit and drop in.
            if (state.player.pendingStatPoints > 0) {
              allocateStat(state, botAllocate(bot, state));
            } else {
              confirmRespec(state);
            }
            bumpUi();
          }
          const decided = botAct(bot, state);
          input.steering = decided.steering;
          input.target.x = decided.target.x;
          input.target.y = decided.target.y;
          input.throttle = 1;
          input.jump = decided.jump;
          input.useItem = decided.useItem ?? false;
          input.useItemIndex = undefined;
          input.aim = undefined;
        } else {
          const settings = getSettings();
          // Desktop mouse aim: the pointer adds a second steering dimension —
          // the hero prefers the foe the cursor points at. Live in every mouse
          // mode (freed WASD steering, cursor-follow, hold); touch/pen never
          // aim, so it stays the plain nearest foe there.
          input.aim =
            pointer.state.pointerType === "mouse" &&
            (pointer.state.hovering || pointer.state.held)
              ? {
                  x: camera.x + pointer.state.x * cssToWorld.x,
                  y: camera.y + pointer.state.y * cssToWorld.y,
                }
              : undefined;
          const touchSteering =
            pointer.state.held && pointer.state.pointerType !== "mouse";
          if (touchSteering) {
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
          } else if (settings.keyboardMove === "on") {
            // Desktop WASD/arrows: a binary control mode — the held keys sum
            // to a heading (run, or walk with Shift), no key stands still.
            // The mouse is freed from steering here (aim stays automatic).
            let dx = 0;
            let dy = 0;
            for (const code of heldMoveKeysRef.current) {
              const v = MOVE_KEYS[code];
              if (v) {
                dx += v.x;
                dy += v.y;
              }
            }
            const len = Math.hypot(dx, dy);
            input.steering = len > 0;
            if (input.steering) {
              input.target.x =
                state.player.pos.x + (dx / len) * DPAD_STEER_DISTANCE;
              input.target.y =
                state.player.pos.y + (dy / len) * DPAD_STEER_DISTANCE;
              input.throttle = walkingRef.current ? KEYBOARD_WALK_THROTTLE : 1;
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
            // Divide the desktop 2× zoom out of the full-speed distance so the
            // sprint threshold stays fixed in CSS px, not doubled by the zoom.
            input.throttle = cursorThrottle(
              Math.hypot(
                input.target.x - state.player.pos.x,
                input.target.y - state.player.pos.y,
              ),
              CURSOR_FULL_SPEED_PX / uiScale,
            );
          }
          input.jump = jumpQueuedRef.current;
          jumpQueuedRef.current = false;
          // Instant item use (opt-in) pops pickups the moment they are
          // carried; manual waits for the player's edge — a dock slot tap
          // (which names its index), a click, or E. A tapped slot spends
          // exactly that powerup; everything else spends the oldest.
          input.useItem =
            useItemQueuedRef.current ||
            (settings.itemUse === "auto" &&
              state.player.heldAbilities.length > 0);
          input.useItemIndex = useItemIndexRef.current ?? undefined;
          useItemQueuedRef.current = false;
          useItemIndexRef.current = null;
        }
        // A tap that lands on the DISCOVERED merchant (and the hero close
        // enough to trade — openShop checks the counter distance) opens the
        // shop instead of acting as a jump or an item use.
        const shopTap = shopTapRef.current;
        shopTapRef.current = null;
        if (
          shopTap &&
          !bot &&
          state.phase === "playing" &&
          state.merchant.discovered
        ) {
          const wx = camera.x + shopTap.x * cssToWorld.x;
          const wy = camera.y + shopTap.y * cssToWorld.y;
          const m = state.merchant.pos;
          if (
            Math.hypot(wx - m.x, wy - m.y) <= MERCHANT.radius * 2.5 &&
            openShop(state)
          ) {
            input.jump = false;
            input.useItem = false;
            playUiSound(synth, "confirm");
            bumpUi();
          }
        }
        step(state, input, dtMs);
        playEventSounds(synth, state.events);
        playEventHaptics(state.events);

        for (const event of state.events) {
          if (event.type === "lightning") {
            effects.push({
              kind: "lightning",
              pos: event.pos,
              untilMs: state.stats.timeMs + 130,
            });
          }
          // A melee swing sweeps a slash toward the target, sized to the
          // weapon's (STRENGTH-widened) reach and its cone: a wide arc for a
          // blade, a narrow thrust for a spear.
          if (event.type === "swing") {
            effects.push({
              kind: "swing",
              // These blows leave the hero's hands, so lift the arc by his
              // current jump height (player.z) — otherwise a swing thrown
              // mid-air draws down at his grounded feet, not up where he is.
              pos: { x: event.pos.x, y: event.pos.y - state.player.z },
              angle: Math.atan2(event.dir.y, event.dir.x),
              radius: event.range,
              arc: event.arc,
              untilMs: state.stats.timeMs + 200,
              durationMs: 200,
            });
          }
          // A shot flashes at the muzzle — a hot burst for guns, a cool cast
          // bloom for wands — oriented along the aim.
          if (event.type === "shot") {
            effects.push({
              kind: "muzzle",
              // Lift to the hero's airborne height so the muzzle flash fires
              // from the weapon in his hands, not from the ground below him.
              pos: { x: event.pos.x, y: event.pos.y - state.player.z },
              angle: Math.atan2(event.dir.y, event.dir.x),
              weaponClass: event.weaponClass,
              untilMs: state.stats.timeMs + 110,
              durationMs: 110,
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
            // The kill's XP reward flows up off the corpse as blue combat text
            // (WoW's floating "+N"), starting above the damage number and
            // climbing higher/longer so the two don't overlap.
            if (event.type === "enemyKilled" && event.xp > 0) {
              // Trail the popup half a second behind the kill's damage number so
              // the two read in sequence — the hit lands, then the XP flows up.
              const xpDelayMs = 500;
              effects.push({
                kind: "text",
                pos: {
                  x: event.pos.x,
                  y: event.pos.y - def.radius - 12,
                },
                startMs: state.stats.timeMs + xpDelayMs,
                untilMs: state.stats.timeMs + xpDelayMs + 1100,
                durationMs: 1100,
                text: `+${formatCompact(event.xp)} XP`,
                color: "#6cc4ff",
                rise: 30,
              });
            }
          }
          if (event.type === "nuke") {
            effects.push({
              kind: "nuke",
              pos: event.pos,
              untilMs: state.stats.timeMs + 450,
              durationMs: 450,
            });
          }
          // A sidestep: float a "DODGE" tag off the hero so the whiff reads.
          if (event.type === "playerDodge") {
            effects.push({
              kind: "text",
              pos: { x: event.pos.x, y: event.pos.y - PLAYER.radius },
              untilMs: state.stats.timeMs + 650,
              durationMs: 650,
              text: "DODGE",
              color: "#7ecbff",
            });
          }
          // A blow that never landed: the foe sidestepped it ("DODGE") or the
          // hero's own aim whiffed ("MISS"). Float the tag off the target.
          if (event.type === "enemyDodge" || event.type === "enemyMiss") {
            const def = enemyDef(event.defId);
            effects.push({
              kind: "text",
              pos: { x: event.pos.x, y: event.pos.y - def.radius - 2 },
              untilMs: state.stats.timeMs + 650,
              durationMs: 650,
              text: event.type === "enemyDodge" ? "DODGE" : "MISS",
              color: event.type === "enemyDodge" ? "#cfd6df" : "#9aa3ad",
            });
          }
          // The bag is full and turned away a piece of loot: float a "BAG
          // FULL" thought over the hero's hair and light the inventory button's
          // pulse so the player knows to open it and make room.
          if (event.type === "pickupBlocked") {
            effects.push({
              kind: "text",
              pos: { x: event.pos.x, y: event.pos.y - PLAYER.radius - 6 },
              untilMs: state.stats.timeMs + 900,
              durationMs: 900,
              text: "BAG FULL",
              color: "#ffcf6b",
            });
            bagFullHintUntilMs = state.stats.timeMs + BAG_FULL_HINT_MS;
          }
          // Bag gear (weapons + equipment) pops the framed pickup card, tinted
          // to its rarity and carrying its icon — the "new and shiny" highlight.
          // Loose pickups (medkits, arrows, repair kits, powerups) stay in the
          // lower-corner feed; only special tiers tint their name there.
          if (event.type === "itemCollected" && event.name) {
            if (event.kind === "equipment") {
              showPickupCard({
                name: event.name,
                tier: event.tier ?? "regular",
                defId: event.defId,
                itemId: event.itemId,
                equipped: event.equipped === true,
                upgrade: event.upgrade === true,
              });
            } else {
              pushPickup(
                event.name,
                event.tier && event.tier !== "regular"
                  ? TIER_COLORS[event.tier]
                  : undefined,
              );
            }
          }
          if (event.type === "storyItemCollected") {
            pushPickup(storyItemDef(event.defId).name, "#ffd75e");
          }
          // The merchant met: toast it — his greeting scene (if the level
          // has one) takes the stage through the ordinary dialogue overlay.
          if (event.type === "merchantDiscovered") {
            pushPickup("MERCHANT DISCOVERED", "#ffd75e");
          }
          // The run is over: silence the loop so the jingle stands alone, and
          // bank the run as this difficulty's high score — the survival time
          // and kills rank it, and the full session snapshot rides along so the
          // board can later reveal the whole story behind those two numbers.
          if (event.type === "victory" || event.type === "defeat") {
            stopMusic();
            if (
              recordRun(difficulty, {
                timeMs: state.stats.timeMs,
                kills: state.stats.kills,
                level: state.player.level,
                detail: {
                  stats: { ...state.stats },
                  level: state.player.level,
                  levelId: state.level.id,
                  outcome: event.type,
                  at: Date.now(),
                },
              })
            )
              setNewRecord(true);
          }
          // Clearing a level records it (per difficulty) so the campaign
          // unlocks the next one and the menu marks this one replayable —
          // and banks the hero's snapshot (level, stats, items) so the next
          // level starts with everything he finished this one with. Beating
          // the difficulty's LAST level also banks any unique/legendary
          // finds into the forever-stash.
          if (event.type === "victory") {
            markLevelCompleted(state.level.id, difficulty);
            const loadout = extractLoadout(state);
            saveLoadout(state.level.id, difficulty, loadout);
            bankKeepsakesOnVictory(state.level.id, loadout);
          }
          // A hardcore death takes the hoard and the shortcuts with it —
          // keepsakes, banked unique/legendary pieces, tokens and their
          // unlocks all burn (a softcore death loses nothing).
          if (event.type === "defeat") {
            noteHardcoreDeath();
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

        // Drive each active powerup's WoW-style cooldown: a conic sweep that
        // unwinds as the ability runs out, plus a whole-second countdown. Both
        // are written to the DOM here so they tick every frame without a React
        // re-render (React only owns which slots exist — see the `active` key).
        const activeRow = activePowerupsRef.current;
        if (activeRow) {
          // Stacked copies share one slot, so drive it off the freshest (most
          // time left) copy of each id — that's the sweep the player reads as
          // "how long until this power lapses".
          const freshestMs = new Map<string, number>();
          for (const ability of state.player.abilities) {
            const prev = freshestMs.get(ability.defId) ?? 0;
            if (ability.remainingMs > prev)
              freshestMs.set(ability.defId, ability.remainingMs);
          }
          for (const [defId, remainingMs] of freshestMs) {
            const slot = activeRow.querySelector<HTMLElement>(
              `[data-ability="${defId}"]`,
            );
            if (!slot) continue;
            const total = abilityDef(defId).durationMs;
            const remaining = Math.max(0, remainingMs);
            const frac = total > 0 ? Math.min(1, remaining / total) : 0;
            slot.style.setProperty("--cd", frac.toFixed(4));
            const secs = slot.querySelector<HTMLElement>(
              ".active-powerup-secs",
            );
            if (secs) secs.textContent = String(Math.ceil(remaining / 1000));
          }
        }

        // Mirror the slow-moving values into React only when they change.
        const bagCount = state.player.inventory.filter(Boolean).length;
        // Empty cells: the capacity (which grows with STRENGTH / a worn bag)
        // minus what's carried — shown on the avatar badge, red at 0.
        const bagFree = state.player.inventory.length - bagCount;
        const bagFullHint = state.stats.timeMs < bagFullHintUntilMs;
        const held = state.player.heldAbilities.join(",");
        // Only the *set* of running powerups mounts/unmounts slots; the ticking
        // timer itself is animated straight on the DOM, so it stays out of the
        // change-key (which would otherwise thrash React state every frame).
        const active = state.player.abilities.map((a) => a.defId).join(",");
        const weapon = state.player.equipment.weapon;
        const weaponWear =
          weapon.durability === undefined
            ? null
            : weapon.durability / equipmentMaxDurability(weapon);
        const appearance = playerAppearance(state);
        const stage = menaceStage(state);
        const key = `${state.phase}/${state.player.hp}/${Math.ceil(state.player.stamina)}/${state.player.xp}/${state.player.level}/${state.player.pendingStatPoints}/${state.enemies.length}/${bagCount}/${bagFree}/${bagFullHint ? 1 : 0}/${held}/${active}/${weapon.defId}/${weaponWear?.toFixed(2) ?? ""}/${state.player.coins}/${appearance}/${stage}/${state.stats.kills}/${Math.floor(state.stats.timeMs / 1000)}`;
        if (key !== lastHud) {
          lastHud = key;
          setHud({
            phase: state.phase,
            hp: state.player.hp,
            maxHp: state.player.maxHp,
            stamina: state.player.stamina,
            maxStamina: state.player.maxStamina,
            level: state.player.level,
            xp: state.player.xp,
            xpToNext: state.player.xpToNext,
            enemiesLeft: state.enemies.length,
            menaceStage: stage,
            bagFree,
            bagFullHint,
            heldAbilities: [...state.player.heldAbilities],
            activeAbilities: state.player.abilities.reduce<
              { defId: string; count: number }[]
            >((rows, a) => {
              const row = rows.find((r) => r.defId === a.defId);
              if (row) row.count++;
              else rows.push({ defId: a.defId, count: 1 });
              return rows;
            }, []),
            weaponDefId: weapon.defId,
            weaponWear,
            coins: state.player.coins,
            appearance,
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
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
      document.removeEventListener("visibilitychange", onVisibility);
      canvas.removeEventListener("pointerdown", unlock);
      pickupTimers.forEach(clearTimeout);
      if (pickupCardTimer) clearTimeout(pickupCardTimer);
    };
  }, [assets, runId, difficulty, levelId, initialLevelId, respec, skipOpening]);

  if (!assets) {
    return <div className="game-loading">Loading…</div>;
  }
  const font = assets.font;
  // Which bottom corner the powerup dock lives in; the pickup feed takes the
  // opposite one. Read live so the title-screen toggle applies next run.
  const powerupSide = getSettings().powerupSide;
  // Show 1/2/3 · Q · 1-4 key caps on the dock and weapon switcher only when
  // desktop keyboard controls are on (touch has no keys to hint).
  const keyHints = getSettings().keyboardMove === "on";

  // Powerup dock interaction. A filled slot is both a button and a drag handle:
  // a plain tap/click spends the powerup (queued for the sim loop), while
  // dragging it clear of the dock trashes it in a poof of smoke — a quick way
  // to clear a banked slot for fresh loot. The gesture captures the pointer on
  // the slot so a touch keeps tracking off the button, and never reaches the
  // steering canvas (a separate element).
  const startDockDrag =
    (index: number, defId: string) => (e: ReactPointerEvent) => {
      e.preventDefault();
      e.currentTarget.setPointerCapture(e.pointerId);
      dockDragRef.current = {
        index,
        defId,
        rect: e.currentTarget.getBoundingClientRect(),
        x: e.clientX,
        y: e.clientY,
        moved: false,
      };
      setDockDrag(dockDragRef.current);
    };

  const moveDockDrag = (e: ReactPointerEvent) => {
    const d = dockDragRef.current;
    if (!d) return;
    const moved =
      d.moved ||
      Math.hypot(
        e.clientX - (d.rect.left + d.rect.width / 2),
        e.clientY - (d.rect.top + d.rect.height / 2),
      ) > DOCK_DRAG_THRESHOLD_PX;
    dockDragRef.current = { ...d, x: e.clientX, y: e.clientY, moved };
    setDockDrag(dockDragRef.current);
  };

  const endDockDrag = (e: ReactPointerEvent) => {
    const d = dockDragRef.current;
    dockDragRef.current = null;
    setDockDrag(null);
    if (!d) return;
    if (!d.moved) {
      // Barely moved: treat as a tap/click that spends this exact slot (the
      // dock's original behavior), queued for the next sim tick.
      useItemQueuedRef.current = true;
      useItemIndexRef.current = d.index;
      return;
    }
    // A real drag: released clear of the dock discards the powerup. A release
    // back over the dock is a harmless cancel (keep the powerup).
    const overDock = document
      .elementFromPoint(e.clientX, e.clientY)
      ?.closest(".powerup-dock");
    if (!overDock && state && discardHeldAbility(state, d.index)) {
      playUiSound(synth, "back");
      const id = poofIdRef.current++;
      const poof: Poof = {
        id,
        x: d.rect.left + d.rect.width / 2,
        y: d.rect.top + d.rect.height / 2,
      };
      setPoofs((prev) => [...prev, poof]);
      window.setTimeout(
        () => setPoofs((prev) => prev.filter((p) => p.id !== id)),
        POOF_TTL_MS,
      );
    }
  };

  // A cancelled pointer (OS gesture, focus loss) just drops the drag — never a
  // discard, since the release point is unknown.
  const cancelDockDrag = () => {
    dockDragRef.current = null;
    setDockDrag(null);
  };

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
          {/* Full-width XP strip along the very top (top-scroller staple). */}
          <div className="hud-xp">
            <div
              className="hud-xp-fill"
              style={{ width: `${(100 * hud.xp) / hud.xpToNext}%` }}
            />
            <span className="hud-xp-badge">
              <PixelText
                font={font}
                text={`LV ${hud.level}`}
                scale={2}
                color="#ffd75e"
              />
            </span>
          </div>

          <div className="hud-top">
            {/* Left: one framed unit — the hero avatar (inventory button)
                beside HP over the always-on weapon widget, matching the
                center clock unit's border + backdrop. */}
            <div className="hud-status">
              <button
                type="button"
                className={`inventory-avatar${hud.bagFullHint ? " bag-full" : ""}`}
                aria-label="open-inventory"
                onClick={() => {
                  if (state) {
                    setWeaponMenuOpen(false);
                    openInventory(state);
                    playUiSound(synth, "confirm");
                    bumpUi();
                  }
                }}
              >
                {(() => {
                  const src = spriteDataUrl(
                    assets.sprites,
                    `${hud.appearance}_0`,
                  );
                  return src ? (
                    <img src={src} alt="" className="pixel-img avatar-img" />
                  ) : null;
                })()}
                {/* Empty bag slots, always shown — dark on the white badge,
                    flipping red the moment the bag is full (0). */}
                <span className="avatar-badge">
                  <PixelText
                    font={font}
                    text={String(hud.bagFree)}
                    scale={1}
                    color={hud.bagFree === 0 ? "#d83a3a" : "#0b0d10"}
                  />
                </span>
              </button>
              <div className="hud-vitals">
                <div className="hud-stat-row">
                  <PixelText font={font} text="HP" scale={2} color="#9aa3ad" />
                  <div className="hud-bar hp-bar">
                    <div
                      className="hud-bar-fill"
                      style={{ width: `${(100 * hud.hp) / hud.maxHp}%` }}
                    />
                  </div>
                  <span className="hud-stat-val">
                    <PixelText font={font} text={String(hud.hp)} scale={2} />
                  </span>
                </div>
                <div className="hud-stat-row">
                  <PixelText font={font} text="ST" scale={2} color="#9aa3ad" />
                  <div className="hud-bar hp-bar">
                    <div
                      className="hud-bar-fill stamina-fill"
                      style={{
                        width: `${(100 * hud.stamina) / hud.maxStamina}%`,
                      }}
                    />
                  </div>
                  <span className="hud-stat-val">
                    <PixelText
                      font={font}
                      text={String(Math.ceil(hud.stamina))}
                      scale={2}
                    />
                  </span>
                </div>
                <div className="hud-stat-row hud-weapon-row">
                  {(() => {
                    if (!state) return null;
                    const equipped = state.player.equipment.weapon;
                    const equippedColor =
                      WEAPON_CLASS_COLORS[weaponDef(equipped.defId).class];
                    const icon = spriteDataUrl(
                      assets.sprites,
                      weaponDef(equipped.defId).icon,
                    );
                    // Other carried weapons, highest damage first — the switch
                    // targets, shared with the Q menu / 1-4 hotkeys.
                    const alternatives = weaponAlternatives(state);
                    return (
                      <div className="wpn-control">
                        <button
                          type="button"
                          className="wpn-slot"
                          aria-label="switch-weapon"
                          style={{
                            borderColor: equippedColor.border,
                            background: equippedColor.bg,
                          }}
                          onClick={() => {
                            setWeaponMenuOpen((open) => !open);
                            playUiSound(synth, "confirm");
                          }}
                        >
                          {icon ? (
                            <img
                              src={icon}
                              alt=""
                              className="pixel-img wpn-slot-img"
                            />
                          ) : null}
                        </button>
                        {weaponMenuOpen && (
                          <div className="wpn-switcher">
                            {alternatives.length === 0 ? (
                              <PixelText
                                font={font}
                                text="NO OTHER WEAPONS"
                                scale={2}
                                color="#9aa3ad"
                              />
                            ) : (
                              alternatives.map(
                                ({ item, index, dmg }, order) => {
                                  const color =
                                    WEAPON_CLASS_COLORS[
                                      weaponDef(item.defId).class
                                    ];
                                  const wpnIcon = spriteDataUrl(
                                    assets.sprites,
                                    weaponDef(item.defId).icon,
                                  );
                                  return (
                                    <button
                                      key={item.id}
                                      type="button"
                                      className="wpn-slot wpn-switch-slot"
                                      aria-label={`equip-${item.defId}`}
                                      style={{
                                        borderColor: color.border,
                                        background: color.bg,
                                      }}
                                      onClick={() => {
                                        if (equipFromInventory(state, index)) {
                                          playUiSound(synth, "equip");
                                          setWeaponMenuOpen(false);
                                          bumpUi();
                                        }
                                      }}
                                    >
                                      {wpnIcon ? (
                                        <img
                                          src={wpnIcon}
                                          alt=""
                                          className="pixel-img wpn-slot-img"
                                        />
                                      ) : null}
                                      {keyHints && order < 4 && (
                                        <span className="slot-key">
                                          <PixelText
                                            font={font}
                                            text={String(order + 1)}
                                            scale={1}
                                            color="#0b0d10"
                                          />
                                        </span>
                                      )}
                                      <span className="wpn-switch-dmg">
                                        <PixelText
                                          font={font}
                                          text={formatCompact(dmg)}
                                          scale={1}
                                        />
                                      </span>
                                    </button>
                                  );
                                },
                              )
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })()}
                  <div className="hud-bar wpn-bar">
                    <div
                      className="hud-bar-fill wpn-fill"
                      style={
                        hud.weaponWear === null
                          ? { width: "100%", background: "#7ef0c8" }
                          : {
                              width: `${Math.max(4, Math.round(100 * hud.weaponWear))}%`,
                              background:
                                hud.weaponWear < 0.25 ? "#d83a3a" : "#9aa3ad",
                            }
                      }
                    />
                  </div>
                  <PixelText
                    font={font}
                    text={hud.weaponWear === null ? "∞" : ""}
                    scale={2}
                    color="#7ef0c8"
                  />
                </div>
                {/* The purse: coins earned selling loot to the merchant. */}
                <div className="hud-stat-row hud-coin-row">
                  {(() => {
                    const coin = spriteDataUrl(assets.sprites, "icon_coin");
                    return coin ? (
                      <img src={coin} alt="" className="pixel-img hud-coin" />
                    ) : null;
                  })()}
                  <PixelText
                    font={font}
                    text={formatCompact(hud.coins)}
                    scale={2}
                    color="#ffd75e"
                  />
                </div>
              </div>
            </div>

            {/* Top-right: run clock over the foe counter, with the MAP button
                tucked underneath in the same column so the pair reads as one
                unit. Tapping the clock pauses the run (the same freeze as
                P/Escape) — a big, thumb-reachable target for the phone, where
                there's no keyboard. */}
            <div className="hud-clock-stack">
              <button
                type="button"
                className="hud-center"
                aria-label="pause"
                onClick={() => {
                  if (state?.phase === "playing") {
                    pauseGame(state);
                    pauseMusic();
                    playUiSound(synth, "confirm");
                    bumpUi();
                  }
                }}
              >
                <PixelText
                  font={font}
                  text={formatTime(hud.stats.timeMs)}
                  scale={3}
                />
                <KillCounter
                  font={font}
                  label={state?.level.foes ?? "FOES"}
                  kills={hud.stats.kills}
                />
                {/* Rampage gauge: overkilling and fast kills evolve and lure the
                  horde. Shown only while the meter is hot, reddening as the
                  stage climbs so the escalation is legible. */}
                {hud.menaceStage > 0 && (
                  <div className="hud-rampage" aria-hidden>
                    <PixelText
                      font={font}
                      text="RAMPAGE"
                      scale={2}
                      color={rampageColor(hud.menaceStage)}
                    />
                    <div className="hud-rampage-pips">
                      {Array.from({ length: MENACE.maxStage }, (_, i) => (
                        <span
                          key={i}
                          className="hud-rampage-pip"
                          style={{
                            background:
                              i < hud.menaceStage
                                ? rampageColor(hud.menaceStage)
                                : "rgba(255,255,255,0.15)",
                          }}
                        />
                      ))}
                    </div>
                  </div>
                )}
              </button>

              {/* The MAP button — a treasure map that opens the fog-of-war
                level map (M on desktop) and pauses the run under it, like
                the bag. Stretched to the clock unit's width by the stack. */}
              <button
                type="button"
                className="hud-map-btn"
                aria-label="open-map"
                onClick={() => {
                  if (state?.phase === "playing") {
                    setWeaponMenuOpen(false);
                    openMap(state);
                    playUiSound(synth, "confirm");
                    bumpUi();
                  }
                }}
              >
                <img
                  src={spriteDataUrl(assets.sprites, "icon_treasure_map") ?? ""}
                  alt=""
                  className="pixel-img hud-map-icon"
                />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Active powerups: a used ability lights up here (just above the dock)
          and counts down like a WoW cooldown — the icon glows and a translucent
          radial sweep unwinds over the ability's duration, with the remaining
          seconds in the corner. The sweep + number are animated by the render
          loop straight on the DOM (see activePowerupsRef); React only mounts and
          unmounts a slot as an ability starts/ends. Nukes are instant (duration
          0) so they never appear here. */}
      {hud?.phase === "playing" && hud.activeAbilities.length > 0 && (
        <div
          ref={activePowerupsRef}
          className={`active-powerups dock-${powerupSide}`}
          aria-hidden="true"
        >
          {hud.activeAbilities.map(({ defId, count }) => {
            const icon = spriteDataUrl(assets.sprites, abilityDef(defId).icon);
            return (
              <div key={defId} className="active-powerup" data-ability={defId}>
                {icon && (
                  <img src={icon} alt="" className="pixel-img powerup-icon" />
                )}
                <span className="active-powerup-sweep" />
                {count > 1 && (
                  <span className="active-powerup-stack">×{count}</span>
                )}
                <span className="active-powerup-secs" />
              </div>
            );
          })}
        </div>
      )}

      {/* The powerup dock: three big, thumb-sized slots. Oldest sits leftmost
          and fills rightward; tapping a slot spends exactly that powerup and
          the rest shift down. Dragging a slot clear of the dock trashes that
          powerup in a poof of smoke — a fast way to free a slot for new loot.
          Sits in whichever bottom corner the player picked
          (settings.powerupSide). */}
      {hud?.phase === "playing" && (
        <div className={`powerup-dock dock-${powerupSide}`}>
          {[0, 1, 2].map((i) => {
            const defId = hud.heldAbilities[i];
            const icon = defId
              ? spriteDataUrl(assets.sprites, abilityDef(defId).icon)
              : undefined;
            const dragging = dockDrag?.moved && dockDrag.index === i;
            return (
              <button
                key={i}
                type="button"
                className={`powerup-slot${defId ? " filled" : ""}${
                  dragging ? " dragging" : ""
                }`}
                aria-label={
                  defId ? `use-powerup-${i}` : `powerup-slot-${i}-empty`
                }
                disabled={!defId}
                onPointerDown={defId ? startDockDrag(i, defId) : undefined}
                onPointerMove={defId ? moveDockDrag : undefined}
                onPointerUp={defId ? endDockDrag : undefined}
                onPointerCancel={defId ? cancelDockDrag : undefined}
              >
                {icon && !dragging && (
                  <img src={icon} alt="" className="pixel-img powerup-icon" />
                )}
                {/* 1/2/3 fire the dock — but while the weapon stack is open
                    those keys select weapons, so the hints move over there. */}
                {keyHints && !weaponMenuOpen && (
                  <span className="slot-key">
                    <PixelText
                      font={font}
                      text={String(i + 1)}
                      scale={1}
                      color="#0b0d10"
                    />
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* The powerup being dragged out follows the pointer as a ghost, with a
          "DRAG OFF TO DISCARD" hint so the destructive gesture reads clearly. */}
      {dockDrag?.moved &&
        (() => {
          const icon = spriteDataUrl(
            assets.sprites,
            abilityDef(dockDrag.defId).icon,
          );
          return (
            <>
              <div
                className="powerup-drag-ghost"
                style={{ left: dockDrag.x, top: dockDrag.y }}
              >
                {icon && (
                  <img src={icon} alt="" className="pixel-img powerup-icon" />
                )}
              </div>
              <div className={`powerup-discard-hint dock-${powerupSide}`}>
                <PixelText
                  font={font}
                  text="DRAG OFF TO DISCARD"
                  scale={2}
                  color="#e06a6a"
                />
              </div>
            </>
          );
        })()}

      {/* Smoke poofs where discarded powerups vanished. */}
      {poofs.map((poof) => (
        <div
          key={poof.id}
          className="powerup-poof"
          style={{ left: poof.x, top: poof.y }}
          aria-hidden="true"
        >
          {[0, 1, 2, 3, 4, 5, 6].map((n) => (
            <span
              key={n}
              className="poof-puff"
              style={{ "--puff": n } as CSSProperties}
            />
          ))}
        </div>
      ))}

      {hud?.phase === "playing" && (
        <PickupFeed
          font={font}
          messages={pickups}
          side={powerupSide === "left" ? "right" : "left"}
        />
      )}

      {/* The framed pickup card for freshly bagged gear. Keyed by the card id
          so a new find remounts the box and restarts its pop + border spark. */}
      {hud?.phase === "playing" && pickupCard && (
        <PickupModal key={pickupCard.id} font={font} card={pickupCard} />
      )}

      {state && state.cutscene && hud?.phase === "cutscene" && (
        <CutsceneOverlay
          cutscene={state.cutscene}
          assets={assets}
          font={font}
          revealRef={cutsceneRevealRef}
          onBlip={() => {
            playUiSound(synth, "blip");
            playTypewriterHaptic();
          }}
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
          assets={assets}
          font={font}
          revealRef={introRevealRef}
          onBlip={() => {
            playUiSound(synth, "blip");
            playTypewriterHaptic();
          }}
          onAdvance={() => {
            advanceIntro(state);
            playUiSound(synth, "move");
            bumpUi();
          }}
          onSkip={() => {
            skipIntro(state);
            playUiSound(synth, "back");
            bumpUi();
          }}
        />
      )}

      {state && hud?.phase === "title" && (
        <TitleCard
          state={state}
          font={font}
          onBegin={() => {
            // Leave the level-name card and drop into the run — the level
            // music rolls the moment play begins.
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
          revealRef={dialogueRevealRef}
          onBlip={() => {
            playUiSound(synth, "blip");
            playTypewriterHaptic();
          }}
          onAdvance={() => {
            advanceDialogue(state);
            playUiSound(synth, "move");
            bumpUi();
          }}
        />
      )}

      {state && hud?.phase === "levelup" && (
        <LevelUpOverlay
          state={state}
          font={font}
          sprites={assets.sprites}
          onChange={bumpUi}
        />
      )}

      {state && hud?.phase === "respec" && (
        <RespecOverlay
          state={state}
          font={font}
          sprites={assets.sprites}
          onChange={bumpUi}
          onConfirm={() => {
            if (confirmRespec(state)) {
              playUiSound(synth, "start");
              bumpUi();
            }
          }}
        />
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

      {state && hud?.phase === "shop" && (
        <ShopPanel
          state={state}
          font={font}
          sprites={assets.sprites}
          onChange={bumpUi}
          onClose={() => {
            closeShop(state);
            playUiSound(synth, "back");
            bumpUi();
          }}
        />
      )}

      {state && hud?.phase === "map" && (
        <MapOverlay
          state={state}
          assets={assets}
          font={font}
          onClose={() => {
            closeMap(state);
            playUiSound(synth, "back");
            bumpUi();
          }}
        />
      )}

      {state && hud?.phase === "paused" && (
        <PauseOverlay
          font={font}
          onResume={() => {
            if (state.phase !== "paused") return;
            resumeGame(state);
            resumeMusic();
            bumpUi();
          }}
          // Leave to the menu but keep the frozen run in memory — CONTINUE
          // resumes it. The state is already in the `paused` phase here.
          onExit={() => onExitToMenu(state)}
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
          {newRecord && (
            <PixelText
              font={font}
              text="NEW RECORD!"
              scale={3}
              color="#ffd75e"
            />
          )}
          <div className="splash-stats">
            <PixelText
              font={font}
              text={`TIME ${formatTime(hud.stats.timeMs)}`}
              scale={3}
            />
            <PixelText
              font={font}
              text={`BEST (${difficultyDef(difficulty).name}) ${formatTime(bestTime(difficulty))}`}
              scale={3}
              color="#9aa3ad"
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
              text={`XP ${formatCompact(hud.stats.xpGained)}`}
              scale={3}
            />
            <PixelText
              font={font}
              text={`DAMAGE DEALT ${formatCompact(hud.stats.damageDealt)}`}
              scale={3}
            />
            <PixelText
              font={font}
              text={`DAMAGE TAKEN ${formatCompact(hud.stats.damageTaken)}`}
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
