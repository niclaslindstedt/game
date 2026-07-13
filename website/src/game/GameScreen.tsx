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
  advanceOutro,
  applyScenario,
  skipOutro,
  allocateStat,
  bestMedkitTier,
  confirmRespec,
  BOT_STRATEGIES,
  botAct,
  botAllocate,
  canOpenInventory,
  closeCompanionPanel,
  closeInventory,
  closeMap,
  closeShop,
  companionDef,
  createBot,
  createGame,
  debug,
  discardHeldAbility,
  dismissIntro,
  enemyDef,
  equipFromInventory,
  equipmentIcon,
  itemLevelReq,
  extractLoadout,
  isWeaponDef,
  LEVELS,
  levelDef,
  markThoughtsSeen,
  MERCHANT,
  menaceStage,
  openCompanionPanel,
  openInventory,
  openMap,
  openShop,
  pauseGame,
  resolveChoice,
  equipmentMaxDurability,
  PLAYER,
  playerAppearance,
  resumeGame,
  skipCutscene,
  skipIntro,
  skipStoryOpening,
  STAMINA,
  step,
  storyItemDef,
  tapCutscene,
  warn,
  weaponDamageFor,
  weaponDef,
  type BotStrategy,
  type Difficulty,
  type Equipment,
  type GameEvent,
  type GameInput,
  type GamePhase,
  type GameState,
  type GameStats,
  type Quality,
  type ScenarioSpec,
  type Tier,
} from "@game/core";

import { clusterByTouch } from "@ui/lib/cluster.ts";
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
import { ACHIEVEMENTS_BY_ID } from "./achievement-defs.ts";
import {
  recordAchievementEvents,
  recordRunStarted,
  recordWornEquipment,
} from "./achievements.ts";
import {
  AchievementToast,
  ACHIEVEMENT_TOAST_TTL_MS,
  type AchievementToastData,
} from "./AchievementToast.tsx";
import { synth } from "./audio.ts";
import {
  medkitColorFor,
  medkitIconFor,
  STAMINA_POTION_COLOR,
  STAMINA_POTION_ICON,
} from "./consumables.ts";

import { cloneGameState } from "./checkpoint.ts";
import {
  playAchievementHaptic,
  playEventHaptics,
  playTypewriterHaptic,
} from "./haptics.ts";
import { ChoiceOverlay } from "./ChoiceOverlay.tsx";
import { CompanionPanel } from "./CompanionPanel.tsx";
import { CutsceneOverlay, type CutsceneReveal } from "./CutsceneOverlay.tsx";
import { DialogueOverlay, type DialogueReveal } from "./DialogueOverlay.tsx";
import { IntroOverlay, type IntroReveal } from "./IntroOverlay.tsx";
import { TitleCard } from "./TitleCard.tsx";
import { InventoryPanel } from "./InventoryPanel.tsx";
import { LevelUpOverlay } from "./LevelUpOverlay.tsx";
import { MapOverlay } from "./MapOverlay.tsx";
import { dollDataUrl, playerDollLayers } from "./paper-doll.ts";
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
  PICKUP_CARD_TTL_QUEUED_MS,
  PICKUP_CARD_TTL_UPGRADE_MS,
  type PickupCard,
} from "./PickupModal.tsx";
import {
  accrueCampaign,
  bankLoadout,
  campaignTally,
  clearedLevelsFor,
  hasClearedLevel,
  hasMetMerchant,
  hasSeenOpening,
  markMerchantMet,
  markStorySeen,
  nextLevelId,
  recordDeath,
  recordVictory,
  resetCampaign,
  seenThoughts,
  type Character,
} from "./characters.ts";
import { recordCampaign } from "./highscores.ts";
import {
  computeCamera,
  drawEffects,
  drawFrame,
  MELEE_SWING_MS,
  VIEW_SCALE,
  viewScaleFor,
  uiScaleFor,
  type Effect,
  type PlayerAction,
} from "./render.ts";
import { goreStyleFor, shotStyleFor } from "./weapon-fx.ts";
import {
  actionForCode,
  bindingLabel,
  moveVectorForCode,
  mouseButtonCode,
  wheelCode,
  type BindableAction,
} from "./keybindings.ts";
import { getSettings } from "./settings.ts";
import { playEventSounds, playUiSound } from "./sfx/index.ts";
import { playAchievementJingle } from "./sfx/jingles.ts";
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
  /** Current menace/rampage stage (uncapped) driving the gauge. */
  menaceStage: number;
  /** Free (empty) bag cells — shown on the avatar badge, red at 0. */
  bagFree: number;
  /** True for a short window after the full bag turned away loot — pulses the
   * inventory button to nudge the player to open it and make room. */
  bagFullHint: boolean;
  /** The powerup dock, oldest first (ABILITY_DEFS ids) — banked and running. */
  heldAbilities: string[];
  /**
   * Which dock slots (indices into `heldAbilities`) hold a powerup that is
   * running right now: those slots show the countdown radial in place and take
   * no taps until they lapse, while the rest stay banked and spendable. The
   * per-frame countdown/radial for each is written to the DOM directly by the
   * render loop (keyed on the slot), not through here.
   */
  activeSlots: number[];
  /** The best-quality medkit the hero holds (MEDKIT tier index), or -1 when
   * none — the consumable dock's medkit slot shows this grade + its count. */
  medkitTier: number;
  /** How many medkits of `medkitTier` are stacked (0 when none held). */
  medkitCount: number;
  /** Stacked stamina potions held — the consumable dock's stamina slot count. */
  staminaPotions: number;
  /** Equipped weapon def id — drives the always-on weapon widget. */
  weaponDefId: string;
  /** Equipped weapon's durability 0..1, or null for the unbreakable sidearm. */
  weaponWear: number | null;
  /** The purse — coins earned selling loot to the merchant. */
  coins: number;
  /** Player sprite family (`playerAppearance`) for the inventory avatar. */
  appearance: string;
  /**
   * The recruited party, join order — one clickable portrait per companion
   * below the hero's avatar (tapping one opens its equip screen). `hpFrac`
   * drives the sliver bar; a DOWNED companion's portrait grays out.
   */
  companions: {
    id: number;
    defId: string;
    sprite: string;
    hpFrac: number;
    downed: boolean;
  }[];
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
// How many bag-gear pickup cards may WAIT in the queue behind the one on
// screen. Past this a loot flood would take too long to drain, so the oldest
// ordinary (non-upgrade) card is dropped to make room — better finds are never
// skipped, only ordinary overflow is.
const PICKUP_CARD_QUEUE_MAX = 8;
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

// Merged pack-kill XP floats. When one attack drops this many foes at once and
// their bodies sit in one knot, their XP drips fuse into a single oversized
// "+N XP" pop that jolts like a crit — one big satisfying number instead of a
// smear of overlapping drips. The pack size sets the glyph scale: count/10 (20
// mobs → 2×, 30 → 3×), floored so even a small merge reads as bigger and capped
// so a monster pull can't swallow the screen. `SLACK` is generous — mobs a
// body-width apart still count as one knot, so a wide blast over a loosely
// packed horde (bodies rarely literally overlapping) still merges instead of
// dripping a dozen separate numbers.
const XP_MERGE_MIN_KILLS = 3;
const XP_MERGE_SLACK_PX = 16;
const XP_MERGE_MIN_SCALE = 1.4;
const XP_MERGE_MAX_SCALE = 4;

// A `swing`/`shot` event is the hero's (not a companion's) when it was thrown
// from his own position — both fire in the same step, so the hero hasn't moved
// off the spot the event recorded. A generous world-px slop absorbs any drift.
const HERO_ATTACK_SLOP_PX = 12;
function isHeroAttack(
  pos: { x: number; y: number },
  player: { x: number; y: number },
): boolean {
  return Math.hypot(pos.x - player.x, pos.y - player.y) <= HERO_ATTACK_SLOP_PX;
}

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

// Desktop steering (settings.keyboardMove === "on"): each held direction key
// contributes a cardinal vector; the sum is the heading, projected
// DPAD_STEER_DISTANCE ahead like the touch dpad. Movement is binary — run by
// default, hold WALK to walk, stand still with no key down. The keys are the
// player's rebindable FORWARD/BACK/LEFT/RIGHT binds (keybindings.ts), read by
// `event.code` so they stay layout-independent (AZERTY etc.).
// The reduced pace while WALK is held; the default (no modifier) runs at full
// speed. Pinned to the engine's run threshold so a Shift-walk stays a *walk*
// for the stamina system: `running = throttle > STAMINA.runThreshold`, so a
// throttle at (not above) the threshold recovers stamina instead of draining
// it. A bare 0.6 tipped over the 0.5 threshold and drained like a run.
const KEYBOARD_WALK_THROTTLE = STAMINA.runThreshold;

/** Other carried weapons, best first — the switch targets shared by the Q
 * weapon menu and the 1-4 hotkeys. Ordered by ilvl (highest first) so "1"
 * grabs the top-item-level weapon; ties break on stat-scaled damage
 * (weaponDamageFor) so equal-ilvl slots fall in dps order and follow the
 * build. */
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
    .sort((a, b) => b.item.ilvl - a.item.ilvl || b.dmg - a.dmg);
}

function formatTime(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

/** Pips on the rampage gauge. The menace stage itself is UNCAPPED (the
 * evolution ratchet climbs as long as the player out-hits the horde); the
 * gauge fills its ten pips and then counts the deeper stages numerically. */
const RAMPAGE_PIPS = 10;

/** The rampage gauge heats from amber to red as the menace stage climbs —
 * the top stages glow a hotter red so the deadly end of the meter reads at
 * a glance. */
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
  character,
  difficulty,
  levelId: initialLevelId,
  onQuit,
  onExitToMenu,
  skipIntro: skipOpening = false,
  resume,
}: {
  /** The hero playing this run — the run starts from their persistent build,
   * and every victory (and, in hardcore, death) is banked onto them. */
  character: Character;
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
  // The live character, kept in a ref so it survives re-renders and, crucially,
  // so a second victory in the SAME mount (clear a level → NEXT LEVEL → clear
  // again) starts from the loadout the FIRST victory just banked. `recordVictory`
  // returns the updated character; we stash it back here.
  const characterRef = useRef<Character>(character);
  // The parked engine state to adopt on this mount (a run resumed from the
  // menu), consumed the first time the run effect fires so a later RETRY /
  // NEXT LEVEL recreates the game from scratch instead of re-adopting it.
  const resumeRef = useRef<GameState | null>(resume ?? null);
  // The retry checkpoint: a snapshot of THIS level taken the instant combat
  // began (see the simulate loop), kept across RETRY re-runs of the run effect.
  // A death's RETRY adopts a fresh copy so the player drops back into the
  // action instead of replaying the prelude + intro; NEXT LEVEL (a new levelId)
  // supersedes it with the new level's own checkpoint. See checkpoint.ts.
  const checkpointRef = useRef<{ levelId: string; state: GameState } | null>(
    null,
  );
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dpadRef = useRef<HTMLDivElement>(null);
  // The powerup dock: a spent powerup keeps its slot and counts down in place,
  // its radial cooldown sweep and countdown numbers written straight to the DOM
  // by the render loop (like the dpad), so the timer stays smooth without a
  // React re-render every frame.
  const powerupDockRef = useRef<HTMLDivElement>(null);
  const jumpQueuedRef = useRef(false);
  const useItemQueuedRef = useRef(false);
  // The consumable dock: a medkit / stamina-potion use queued this frame (a
  // slot tap or its bindable key), spent on the next sim tick.
  const useMedkitQueuedRef = useRef(false);
  const useStaminaQueuedRef = useRef(false);
  // Where the last tap/click landed (CSS px on the canvas): the sim loop
  // checks it against the discovered merchant — a tap on him at the counter
  // opens the shop instead of jumping.
  const shopTapRef = useRef<{ x: number; y: number } | null>(null);
  // Desktop keyboard steering: which movement-bound key codes are held right
  // now, and whether the walk modifier is down. Read every sim tick (the loop
  // resolves each held code to a direction via the player's key bindings).
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
  // The HUD FPS readout — the DEVELOPER menu's DEBUG MODE flag (or ?debug)
  // turns it on, read once per mount so flipping the setting applies to the
  // next run. The value itself is written straight to the DOM by the render
  // loop (see fpsRef) — a React state ticking every frame would defeat the
  // point of measuring.
  const [showFps] = useState(
    () =>
      getSettings().debug === "on" ||
      new URLSearchParams(window.location.search).has("debug"),
  );
  const fpsRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    weaponMenuOpenRef.current = weaponMenuOpen;
  }, [weaponMenuOpen]);

  // Achievement unlocks: batched unlocks queue and toast ONE at a time (each
  // replays the banner + chime). Badges are earned in-run but only browsed from
  // the main menu's ACHIEVEMENTS shelf — the run just celebrates them.
  const achievementQueueRef = useRef<AchievementToastData[]>([]);
  const achievementToastSeqRef = useRef(0);
  const [achievementToast, setAchievementToast] =
    useState<AchievementToastData | null>(null);

  // Bumped whenever badges join the queue, waking the stage effect below.
  // The queue lives in a ref and is only ever shifted inside effects — state
  // updaters must stay pure (StrictMode double-invokes them), which is why
  // the stage never advances the queue from inside setAchievementToast.
  const [achievementTick, setAchievementTick] = useState(0);

  // The toast stage, two halves: a showing toast chimes once and clears
  // itself after its TTL; an idle stage pulls the next queued badge.
  useEffect(() => {
    if (!achievementToast) return;
    playAchievementJingle(synth);
    playAchievementHaptic();
    const timer = setTimeout(
      () => setAchievementToast(null),
      ACHIEVEMENT_TOAST_TTL_MS,
    );
    return () => clearTimeout(timer);
  }, [achievementToast]);
  useEffect(() => {
    if (achievementToast) return;
    const next = achievementQueueRef.current.shift();
    if (next) setAchievementToast(next);
  }, [achievementToast, achievementTick]);

  // Queue freshly-unlocked badges for the toast stage. Called from the sim loop
  // (event ingestion) and the run-start hook. Only refs and setters are touched
  // (the toast resolves its own icon sprite), so the run effect can call it
  // without listing it as a dependency — the same footing as `bumpUi`.
  const celebrateAchievements = (ids: string[]) => {
    if (ids.length === 0) return;
    const queued = achievementQueueRef.current;
    for (const id of ids) {
      const def = ACHIEVEMENTS_BY_ID.get(id);
      if (!def) continue;
      queued.push({
        id: ++achievementToastSeqRef.current,
        name: def.name,
        icon: def.icon,
      });
    }
    // Wake the stage (the idle-stage effect pulls the queue).
    setAchievementTick((t) => t + 1);
  };

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
    // A retry checkpoint captured for THIS level: RETRY after a death adopts a
    // fresh copy of it (combat-start of this level) rather than replaying the
    // whole opening. Only consulted when not resuming a parked run from the
    // menu; a checkpoint for a different level (a stale one from before NEXT
    // LEVEL) does not apply and is left to be superseded.
    const checkpoint =
      !resumed && checkpointRef.current?.levelId === runLevelId
        ? checkpointRef.current.state
        : null;
    // The carry-over: the character's persistent build. The hero arrives with
    // the exact level, stats and items they carry right now — into any level,
    // any difficulty. A brand-new hero (no banked build yet) starts from the
    // authored fresh start (level 1, the difficulty's wall weapon).
    const state =
      resumed ??
      (checkpoint
        ? cloneGameState(checkpoint)
        : createGame(
            seed,
            runLevelId,
            difficulty,
            characterRef.current.loadout ?? undefined,
            false,
            // Campaign progress the engine gates drops on (the bunker key
            // stays latent until Eastworld is cleared on this difficulty).
            clearedLevelsFor(characterRef.current, difficulty),
            // Met the trader here before? He's set up at the door from the
            // start, so a restart-after-death can walk over and repair.
            hasMetMerchant(characterRef.current, runLevelId, difficulty),
          ));
    // A run started from scratch (not resumed from the menu, not adopted from a
    // checkpoint that already froze it): capture the combat-start checkpoint
    // once this mount, superseding any stale one from an earlier level.
    const captureCheckpoint = !resumed && !checkpoint;
    // The per-character story ledger (characters.ts): has this hero already
    // watched this level's opening — and which inner monologues has he read —
    // on this difficulty? We die and replay a lot, so a witnessed opening is
    // skipped and already-read thoughts are pre-marked as seen. Seed the seen
    // thoughts into every rebuild (a fresh createGame OR a cloned checkpoint,
    // so a post-victory RETRY doesn't replay a late kill/sight beat either);
    // the opening itself is skipped below, once, for a fresh createGame.
    const openingSeen = hasSeenOpening(
      characterRef.current,
      runLevelId,
      difficulty,
    );
    markThoughtsSeen(state, seenThoughts(characterRef.current, difficulty));
    // `?scenario=<json>` (dev/test): mutate the fresh run into an exact
    // situation — position, hp, gear, spawns (see docs/configuration.md and
    // the test-scenario skill). Resumed/checkpointed runs already lived past
    // their opening, so the spec only applies to a run built from scratch.
    let scenarioApplied = false;
    const scenarioParam = params.get("scenario");
    if (scenarioParam && !resumed && !checkpoint) {
      try {
        applyScenario(state, JSON.parse(scenarioParam) as ScenarioSpec);
        scenarioApplied = true;
        debug(`scenario applied: ${scenarioParam}`);
      } catch {
        warn(`?scenario= is not valid JSON — ignored: ${scenarioParam}`);
      }
    }
    setState(state);
    setNewRecord(false);
    debug(`run ${runId} started (seed ${seed}, ${difficulty})`);

    // Book the run on the achievement ledger — fresh starts and RETRYs both
    // count as "running the level"; a run resumed from the menu is the same
    // run continuing, so it doesn't. Run-count badges can unlock right here.
    if (!resumed) celebrateAchievements(recordRunStarted(runLevelId));

    // The lower-right pickup feed: a fresh run starts with an empty log, and
    // each line schedules its own expiry so rows fade independently (WoW's
    // loot toast: newest at the bottom, oldest drops off the top first).
    setPickups([]);
    const pickupTimers = new Set<ReturnType<typeof setTimeout>>();
    let pickupSeq = 0;
    const pushPickup = (text: string, color?: string, prefix?: string) => {
      const id = ++pickupSeq;
      setPickups((prev) => {
        const next = [...prev, { id, text, color, prefix }];
        return next.length > PICKUP_MAX ? next.slice(-PICKUP_MAX) : next;
      });
      const timer = setTimeout(() => {
        pickupTimers.delete(timer);
        setPickups((prev) => prev.filter((p) => p.id !== id));
      }, PICKUP_TTL_MS);
      pickupTimers.add(timer);
    };

    // The framed pickup card for bag gear: finds are ENQUEUED and shown one at
    // a time, so a burst of loot doesn't flash-replace itself before the player
    // can read (or tap-to-equip) each piece — each card gets its own turn on
    // screen, which is the "delay" between pickups. A card's dwell shortens
    // while a backlog waits behind it (so the queue drains fast) but a BETTER
    // find — an upgrade over / at-or-above the worn piece for its slot — always
    // lingers longer, so a real gear jump gets a proper look. The queue is
    // capped (PICKUP_CARD_QUEUE_MAX); on overflow the oldest ordinary card is
    // dropped first, so better finds are never skipped.
    setPickupCard(null);
    let pickupCardTimer: ReturnType<typeof setTimeout> | undefined;
    let pickupCardSeq = 0;
    const cardQueue: PickupCard[] = [];
    let cardShowing = false;

    // Pull the next queued card onto the screen, sizing its dwell to the state
    // at show time: a better find lingers, an ordinary one is halved while a
    // backlog still waits behind it, and otherwise runs the full base time.
    // When the queue empties the stage goes idle.
    const pumpPickupCards = () => {
      const next = cardQueue.shift();
      if (!next) {
        cardShowing = false;
        return;
      }
      cardShowing = true;
      const better = next.upgrade || next.equipped;
      const ttlMs = better
        ? PICKUP_CARD_TTL_UPGRADE_MS
        : cardQueue.length > 0
          ? PICKUP_CARD_TTL_QUEUED_MS
          : PICKUP_CARD_TTL_MS;
      setPickupCard({ ...next, ttlMs });
      if (pickupCardTimer) clearTimeout(pickupCardTimer);
      pickupCardTimer = setTimeout(() => {
        setPickupCard(null);
        pumpPickupCards();
      }, ttlMs);
    };

    const showPickupCard = (opts: {
      name: string;
      tier: Tier;
      quality?: Quality;
      defId?: string;
      itemId?: number;
      equipped: boolean;
      upgrade: boolean;
    }) => {
      const { name, tier, quality, defId, itemId, equipped, upgrade } = opts;
      const icon = defId
        ? spriteDataUrl(assets.sprites, equipmentIcon(defId))
        : undefined;
      const color = TIER_COLORS[tier] ?? TIER_COLORS.regular;
      const id = ++pickupCardSeq;
      // Tap-to-equip is offered only for a bagged find the hero can wear right
      // now — an auto-equipped upgrade is already worn, and an under-leveled
      // find would be refused. The item is located by its stable id so a bag
      // rearranged while the card is up still equips the right piece, and its
      // requirement is read off the INSTANCE (`itemLevelReq`) so an artifact's
      // cap gate matches the engine's refusal instead of its lower base req.
      const bagged =
        itemId != null
          ? (state.player.inventory.find((it) => it?.id === itemId) ?? null)
          : null;
      const canEquip =
        !equipped &&
        defId != null &&
        bagged != null &&
        state.player.level >= itemLevelReq(bagged);
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
      // Dwell is decided at show time (pumpPickupCards); enqueue with the base.
      cardQueue.push({
        id,
        icon,
        name,
        color,
        tier,
        quality,
        upgrade,
        equipped,
        onEquip,
        ttlMs: PICKUP_CARD_TTL_MS,
      });
      // Keep the backlog bounded: drop the oldest ORDINARY card first so a flood
      // of trash can't stall an upgrade's turn; fall back to the oldest of all
      // if every waiting card is a keeper.
      if (cardQueue.length > PICKUP_CARD_QUEUE_MAX) {
        const drop = cardQueue.findIndex((c) => !(c.upgrade || c.equipped));
        cardQueue.splice(drop >= 0 ? drop : 0, 1);
      }
      if (!cardShowing) pumpPickupCards();
    };

    // The run's music: the level theme rolls once the intro is dismissed and
    // stops for the end-of-run jingles (victory/defeat events below).
    const beginRun = () => {
      dismissIntro(state);
      playLevelMusic(levelDef(state.level.id).music);
    };

    // In debug mode (?debug) the live state is reachable from the console /
    // automated playtests, and `__scenario(spec)` re-shapes the live run from
    // DevTools. See the debug-game and test-scenario skills.
    if (params.has("debug")) {
      const dev = window as {
        __game?: GameState;
        __scenario?: (spec: ScenarioSpec) => void;
      };
      dev.__game = state;
      dev.__scenario = (spec) => applyScenario(state, spec);
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
    } else if (checkpoint) {
      // Straight back into the fight: the checkpoint is already in the
      // `playing` phase, past the prelude and intro, so just roll the level
      // theme — no cutscene, no monologue, no scripted strike to sit through.
      playLevelMusic(levelDef(state.level.id).music);
    } else if (scenarioApplied && state.phase === "playing") {
      // A scenario that skipped the opening starts mid-run by construction:
      // roll the level theme, nothing left to dismiss.
      playLevelMusic(levelDef(state.level.id).music);
    } else if (skipOpening) {
      // Warp-in from the title moon's long-press: bail the whole opening and
      // drop straight into play. skipCutscene lands the prelude on the level
      // `title` card, then beginRun's dismissIntro carries it into `playing` —
      // the same shortcut the keyboard and headless bot use, done up front.
      if (state.phase === "cutscene") skipCutscene(state);
      beginRun();
    } else if (openingSeen) {
      // Already watched this level's opening on this difficulty (a die-and-retry
      // loop): skip the prelude, the intro monologue and the scripted opening
      // strike, arming the hero, and roll the level theme straight away — the
      // level music beginRun would start, minus the story it would sit through.
      skipStoryOpening(state);
      playLevelMusic(levelDef(state.level.id).music);
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

    // Perform a rebindable discrete action (fired from a bound key, mouse
    // button, or wheel notch). Each case mirrors what its shipped key used to
    // do, honoring the current phase so a bind only bites where it makes sense.
    const runBinding = (action: BindableAction) => {
      switch (action) {
        case "jump":
          // Space's old bare-press jump; queued for the sim loop.
          if (state.phase === "playing") jumpQueuedRef.current = true;
          return;
        case "useAbility":
          // Spend the oldest powerup — the engine no-ops off the field.
          useItemQueuedRef.current = true;
          return;
        case "weaponMenu":
          if (state.phase === "playing") {
            setWeaponMenuOpen((open) => !open);
            playUiSound(synth, "confirm");
          }
          return;
        case "inventory":
          // Opens mid-run AND during an elite/boss arrival scene (the engine
          // gate) — the stare-down is when a fitting weapon gets equipped.
          if (canOpenInventory(state)) {
            openInventory(state);
            playUiSound(synth, "confirm");
          } else if (state.phase === "inventory") {
            closeInventory(state);
            playUiSound(synth, "back");
          }
          bumpUi();
          return;
        case "map":
          // Toggles the fog-of-war level map (same freeze as the bag).
          if (state.phase === "playing") {
            openMap(state);
            playUiSound(synth, "confirm");
            bumpUi();
          } else if (state.phase === "map") {
            closeMap(state);
            playUiSound(synth, "back");
            bumpUi();
          }
          return;
        case "pause":
          if (state.phase === "playing") {
            pause();
            playUiSound(synth, "confirm");
          } else if (state.phase === "paused") {
            resume();
            playUiSound(synth, "back");
          }
          return;
        case "medkit":
          // Spend from the consumable dock; the engine no-ops when nothing is
          // held or there's nothing to top up, so an idle press is free.
          if (state.phase === "playing" && !weaponMenuOpenRef.current)
            useMedkitQueuedRef.current = true;
          return;
        case "stamina":
          if (state.phase === "playing" && !weaponMenuOpenRef.current)
            useStaminaQueuedRef.current = true;
          return;
      }
    };

    const onKeyDown = (event: KeyboardEvent) => {
      // The level-up chooser owns the keyboard while it's up: LevelUpOverlay
      // runs its own listener (arrows/WASD move the cursor, Enter/Space spend a
      // point). Ceding here keeps those keys from steering or queuing a jump.
      if (state.phase === "levelup") return;
      const binds = getSettings().keybindings;
      // Track held movement keys + the walk modifier every keydown (repeats
      // included — Set.add is idempotent) so the sim loop reads live state.
      if (moveVectorForCode(event.code, binds)) {
        heldMoveKeysRef.current.add(event.code);
        if (getSettings().keyboardMove === "on" && state.phase === "playing") {
          event.preventDefault(); // arrow keys must not scroll the page
        }
      }
      if (event.code === binds.walk) {
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
        state.phase === "outro" ||
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
        } else if (state.phase === "outro") {
          // The epilogue turns like the intro (the overlay shares the reveal
          // ref — only one of the two is ever mounted at a time).
          if (!introRevealRef.current.done) {
            introRevealRef.current.skip();
          } else {
            advanceOutro(state);
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
      } else if (event.key === "Escape") {
        // Escape is the fixed, non-rebindable escape hatch: it skips a running
        // scene, closes an open overlay, and pauses/resumes the live run — the
        // one control a rebind can never steal.
        if (state.phase === "cutscene") {
          skipCutscene(state);
          playUiSound(synth, "back");
        } else if (state.phase === "intro") {
          skipIntro(state);
          playUiSound(synth, "back");
          bumpUi();
        } else if (state.phase === "outro") {
          skipOutro(state);
          playUiSound(synth, "back");
          bumpUi();
        } else if (state.phase === "inventory") {
          closeInventory(state);
          playUiSound(synth, "back");
          bumpUi();
        } else if (state.phase === "shop") {
          closeShop(state);
          playUiSound(synth, "back");
          bumpUi();
        } else if (state.phase === "map") {
          closeMap(state);
          playUiSound(synth, "back");
          bumpUi();
        } else if (state.phase === "playing") {
          pause();
          playUiSound(synth, "confirm");
        } else if (state.phase === "paused") {
          resume();
          playUiSound(synth, "back");
        }
      } else if (actionForCode(event.code, binds)) {
        // A rebindable action key fired (see keybindings.ts / runBinding).
        event.preventDefault();
        runBinding(actionForCode(event.code, binds) as BindableAction);
      } else if (state.phase === "playing" && /^[1-9]$/.test(event.key)) {
        // The weapon-slot / powerup-dock number keys stay fixed (a contextual
        // range, not a single bind): 1-4 equip a listed alternative while the
        // weapon menu is up, otherwise 1/2/3 fire the matching powerup slot.
        const n = Number(event.key) - 1;
        if (weaponMenuOpenRef.current) {
          const alt = weaponAlternatives(state)[n];
          if (alt && equipFromInventory(state, alt.index)) {
            playUiSound(synth, "equip");
            setWeaponMenuOpen(false);
            bumpUi();
          }
        } else if (
          n <= 2 &&
          state.player.heldAbilities[n] &&
          !state.player.abilities.some((a) => a.slot === n)
        ) {
          // A slot already counting down a running power isn't spendable.
          useItemQueuedRef.current = true;
          useItemIndexRef.current = n;
        }
      }
    };
    const onKeyUp = (event: KeyboardEvent) => {
      const binds = getSettings().keybindings;
      if (moveVectorForCode(event.code, binds))
        heldMoveKeysRef.current.delete(event.code);
      if (event.code === binds.walk) {
        walkingRef.current = false;
      }
    };
    // A mouse button / wheel notch can be bound to any discrete action too (see
    // keybindings.ts). Both no-op unless the player bound a pointer control —
    // the shipped scheme is all-keyboard, so there's no default pointer capture
    // to fight the canvas steering.
    const onMouseDown = (event: MouseEvent) => {
      const action = actionForCode(
        mouseButtonCode(event.button),
        getSettings().keybindings,
      );
      if (action) {
        event.preventDefault();
        runBinding(action);
      }
    };
    const onWheel = (event: WheelEvent) => {
      const action = actionForCode(
        wheelCode(event.deltaY),
        getSettings().keybindings,
      );
      if (action) {
        event.preventDefault();
        runBinding(action);
      }
    };
    // Suppress the browser context menu only when the right button is actually
    // bound, so an unbound right-click still behaves normally.
    const onContextMenu = (event: MouseEvent) => {
      if (
        actionForCode(mouseButtonCode(2), getSettings().keybindings) !== null
      ) {
        event.preventDefault();
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
    window.addEventListener("mousedown", onMouseDown);
    // Non-passive so a bound wheel notch can preventDefault the page scroll.
    window.addEventListener("wheel", onWheel, { passive: false });
    window.addEventListener("contextmenu", onContextMenu);
    window.addEventListener("blur", onBlur);
    document.addEventListener("visibilitychange", onVisibility);

    const input: GameInput = {
      steering: false,
      target: { x: 0, y: 0 },
      jump: false,
      useItem: false,
    };
    let lastHud = "";
    // FPS meter (DEBUG MODE / ?debug): an EMA over the real rAF deltas,
    // flushed to its DOM node a few times a second by the render loop.
    let fpsLastMs: number | undefined;
    let fpsAvgMs = 0;
    let fpsNextFlushMs = 0;
    // Transient visuals driven by engine events (lightning strikes).
    let effects: Effect[] = [];
    // The hero's most recent attack, so the field renderer can swing the held
    // weapon in step with its slash/muzzle effect (developer WEAPON SWING).
    // Only the hero's own blows are captured — companions swing from their own
    // spots (matched by proximity to the hero below).
    let heroAction: PlayerAction | undefined;
    // Weapon-swing tuning hook (?debug): `window.__swing({kind, weaponClass,
    // t})` PINS the held weapon to a fixed fraction `t` (0..1) of its swing arc
    // so a screenshot can sample the animation frame by frame; `null` clears it
    // and hands the weapon back to the live attack. For a melee swing, passing
    // `arc` (the weapon's cone, rad) and `range` (its reach, world px) shapes
    // the blade's sweep AND draws the matching slash cone pinned at the same
    // fraction, so the strip shows the blade and its AoE as one motion. Paired
    // with the `weapon-swing` dev script (website/scripts/weapon-swing.mjs), it
    // is how the held-weapon pose is tuned when designing weapon art. See the
    // `weapon-system` skill and docs/configuration.md.
    let debugPose: {
      kind: PlayerAction["kind"];
      weaponClass: PlayerAction["weaponClass"];
      t: number;
      arc?: number;
      range?: number;
    } | null = null;
    if (params.has("debug")) {
      (
        window as unknown as { __swing?: (o: typeof debugPose) => void }
      ).__swing = (o) => {
        debugPose = o;
      };
    }
    // Run-clock ms through which the "bags are full" nudge stays lit — set when
    // a `pickupBlocked` event fires, drives the inventory button's pulse.
    let bagFullHintUntilMs = 0;
    // Slow-motion tuning hook (?debug): `window.__timeScale(f)` scales the
    // simulation clock — 0.1 runs the whole run (steering, swings, slash cones,
    // muzzle flashes, mob motion) at a tenth speed so a fast animation can be
    // eyeballed or screenshotted frame by frame, 1 restores real time. It slows
    // the SIM, not the render, so it costs nothing and stays deterministic. The
    // `weapon-swing` dev script drives it to sample weapon EFFECTS. See the
    // `weapon-system` skill and docs/configuration.md.
    let timeScale = 1;
    if (params.has("debug")) {
      (window as unknown as { __timeScale?: (f: number) => void }).__timeScale =
        (f) => {
          timeScale = Number.isFinite(f) && f > 0 ? f : 1;
        };
    }

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
          if (state.phase === "outro") skipOutro(state);
          if (state.phase === "title") beginRun();
          if (state.phase === "dialogue") {
            advanceDialogue(state);
            bumpUi();
          }
          // The bot always SPARES a kneeling unique — autoplay runs exercise
          // the companion systems, and a party beats a lone bot anyway.
          if (state.phase === "choice") {
            resolveChoice(state, true);
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
          // The bot spends stacked consumables on its own read of the state
          // (botAct: medkit under half hp, drink when winded) — wire them
          // through so autoplay actually heals instead of hoarding kits.
          input.useMedkit = decided.useMedkit ?? false;
          input.useStaminaPotion = decided.useStaminaPotion ?? false;
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
          } else {
            // Desktop WASD/arrows and the mouse coexist. While any movement
            // key is held (keyboardMove === "on"), the summed keys are the
            // heading (run, or walk with Shift). The instant no key is down,
            // steering falls back to the mouse so "just hold the cursor where
            // you want to go" keeps working alongside the keyboard — the
            // keyboard only takes over for as long as a key is actually held.
            let dx = 0;
            let dy = 0;
            if (settings.keyboardMove === "on") {
              const binds = settings.keybindings;
              for (const code of heldMoveKeysRef.current) {
                const v = moveVectorForCode(code, binds);
                if (v) {
                  dx += v.x;
                  dy += v.y;
                }
              }
            }
            const keyLen = Math.hypot(dx, dy);
            if (keyLen > 0) {
              input.steering = true;
              input.target.x =
                state.player.pos.x + (dx / keyLen) * DPAD_STEER_DISTANCE;
              input.target.y =
                state.player.pos.y + (dy / keyLen) * DPAD_STEER_DISTANCE;
              input.throttle = walkingRef.current ? KEYBOARD_WALK_THROTTLE : 1;
            } else {
              // Cursor-follow steering: a hovering mouse steers with no button
              // (hover mode); hold mode steers only while a button is down.
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
          // Stacked consumables: a queued medkit / stamina-potion use fires
          // this tick (the engine no-ops when there's nothing to spend or top
          // up, so a stray edge is harmless).
          input.useMedkit = useMedkitQueuedRef.current;
          input.useStaminaPotion = useStaminaQueuedRef.current;
          useMedkitQueuedRef.current = false;
          useStaminaQueuedRef.current = false;
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
        // `timeScale` (?debug `window.__timeScale`) slows the whole run for
        // animation tuning — a neutral 1 in normal play.
        step(state, input, dtMs * timeScale);
        // The first instant the run is truly in the player's hands — armed and
        // playing, past the prelude, the intro monologue, and (on SpaceZ HQ)
        // the scripted opening strike that draws the blade. Snapshot it once so
        // a later RETRY drops the hero back HERE, into the action, instead of
        // replaying the whole opening. NEXT LEVEL runs this on its own fresh
        // run, superseding the previous level's checkpoint.
        if (
          captureCheckpoint &&
          checkpointRef.current?.levelId !== runLevelId &&
          state.phase === "playing" &&
          !state.player.disarmed
        ) {
          checkpointRef.current = {
            levelId: runLevelId,
            state: cloneGameState(state),
          };
          // Combat has begun, so the opening (cutscene + intro, and the strike
          // that armed him) has been witnessed — bank it on the character now,
          // together with the inner monologues read so far, so it stays skipped
          // even if the player quits before the run resolves. Late in-play
          // thoughts are added again at run's end below.
          characterRef.current = markStorySeen(
            characterRef.current,
            runLevelId,
            difficulty,
            state.thoughtsSeen,
          );
        }
        playEventSounds(synth, state.events);
        playEventHaptics(state.events);
        // Book the tick's events on the achievement ledger (kills, loot,
        // clears, …) and celebrate whatever unlocked — the toast + chime,
        // sized a notch below the ding and the unique card.
        celebrateAchievements(
          recordAchievementEvents(state.events, {
            levelId: state.level.id,
            difficulty,
            stats: state.stats,
          }),
        );
        // …and the hero's outfit for the wardrobe feats. Reported every
        // frame; the store no-ops until the worn set actually changes, and
        // equips made while a panel freezes the sim are still caught here
        // (the loop keeps running under paused phases).
        {
          const eq = state.player.equipment;
          const worn = [
            {
              slot: "weapon",
              tier: eq.weapon.tier,
              defId: eq.weapon.defId,
            },
          ];
          for (const slot of [
            "head",
            "chest",
            "legs",
            "feet",
            "charm",
            "bag",
          ] as const) {
            const piece = eq[slot];
            if (piece) {
              worn.push({ slot, tier: piece.tier, defId: piece.defId });
            }
          }
          celebrateAchievements(recordWornEquipment(worn));
        }

        // Big kills merge their XP: when one step drops a knot of foes packed
        // body-to-body, fuse their per-kill "+N XP" drips into a single
        // oversized pop that jolts like a crit — the bigger the pack, the
        // bigger and shakier the number (see render.ts's text float). The
        // events in a step already share the same instant (one swing, one AoE),
        // so proximity alone tells the pack apart from unrelated stray kills.
        // `mergedKills` marks the drips that were folded in so the per-kill
        // float below skips them. Honors the same `xpFloat` DISPLAY preference.
        const mergedKills = new Set<GameEvent>();
        if (getSettings().xpFloat === "on") {
          const kills = state.events.filter(
            (e): e is Extract<GameEvent, { type: "enemyKilled" }> =>
              e.type === "enemyKilled" && e.xp > 0,
          );
          if (kills.length >= XP_MERGE_MIN_KILLS) {
            const bodies = kills.map((e) => ({
              x: e.pos.x,
              y: e.pos.y,
              radius: enemyDef(e.defId).radius,
            }));
            for (const group of clusterByTouch(bodies, XP_MERGE_SLACK_PX)) {
              if (group.length < XP_MERGE_MIN_KILLS) continue;
              let xpSum = 0;
              let cx = 0;
              let headY = Infinity; // float above the pack's highest head
              for (const idx of group) {
                const e = kills[idx]!;
                mergedKills.add(e);
                xpSum += e.xp;
                cx += e.pos.x;
                headY = Math.min(headY, e.pos.y - enemyDef(e.defId).radius);
              }
              cx /= group.length;
              const scale = Math.max(
                XP_MERGE_MIN_SCALE,
                Math.min(XP_MERGE_MAX_SCALE, group.length / 10),
              );
              effects.push({
                kind: "text",
                pos: { x: cx, y: headY - 12 },
                untilMs: state.stats.timeMs + 1400,
                durationMs: 1400,
                text: `+${formatCompact(xpSum)} XP`,
                color: "#6cc4ff",
                rise: 34,
                scale,
                shake: true,
              });
            }
          }
        }

        // A signature melee weapon throws THEMED gore on the hero's own blows —
        // Muramasa sprays crimson, Excalibur golden light. Detect the hero's
        // swing this tick (matched to his position, ignoring companions) and, if
        // his weapon carries a gore signature, mark it so this tick's enemy hits
        // spray it. Bundled with the experimental WEAPON SWING flag.
        const heroGore =
          getSettings().weaponSwing === "on" &&
          state.events.some(
            (e) => e.type === "swing" && isHeroAttack(e.pos, state.player.pos),
          )
            ? goreStyleFor(state.player.equipment.weapon.uniqueId)
            : null;

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
              // The cone runs on the SAME clock as the held-weapon swing
              // (MELEE_SWING_MS), so the slash tracks the blade frame for frame.
              untilMs: state.stats.timeMs + MELEE_SWING_MS,
              durationMs: MELEE_SWING_MS,
            });
            // Swing the hero's own blade to match — companions swing from
            // their own spots, so only a blow thrown from the hero's position
            // arms the animation. Hand the weapon's cone (`event.arc`) to the
            // pose so the blade's sweep matches this weapon's reach and arc.
            if (isHeroAttack(event.pos, state.player.pos)) {
              heroAction = {
                kind: "swing",
                weaponClass: "melee",
                startMs: state.stats.timeMs,
                durationMs: MELEE_SWING_MS,
                arc: event.arc,
              };
            }
          }
          // A shot flashes at the muzzle — a hot burst for guns, a cool cast
          // bloom for wands — oriented along the aim.
          if (event.type === "shot") {
            const heroShot = isHeroAttack(event.pos, state.player.pos);
            effects.push({
              kind: "muzzle",
              // Lift to the hero's airborne height so the muzzle flash fires
              // from the weapon in his hands, not from the ground below him.
              pos: { x: event.pos.x, y: event.pos.y - state.player.z },
              angle: Math.atan2(event.dir.y, event.dir.x),
              weaponClass: event.weaponClass,
              untilMs: state.stats.timeMs + 110,
              durationMs: 110,
              // The hero's own shot flashes his weapon's signature (WEAPON
              // SWING flag); companion/enemy shots keep the plain class look.
              fx:
                heroShot &&
                getSettings().weaponSwing === "on" &&
                event.weaponClass !== "melee"
                  ? shotStyleFor(
                      state.player.equipment.weapon.uniqueId,
                      event.weaponClass,
                    )
                  : undefined,
            });
            // Kick/cast the hero's own weapon to match the muzzle flash — a gun
            // recoils, a wand thrusts — but not a companion's shot.
            if (heroShot) {
              heroAction = {
                kind: "shot",
                weaponClass: event.weaponClass,
                startMs: state.stats.timeMs,
                durationMs: event.weaponClass === "magic" ? 220 : 150,
              };
            }
          }
          // Every landed hit sprays the victim's gore (ghosts: ectoplasm)
          // and pops a static damage number on the head — crits are bigger,
          // gold, and shake in place. Only XP floats up.
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
            // A signature weapon's themed gore, sprayed over the plain splash
            // on the hero's own melee blows (see `heroGore` above).
            if (heroGore) {
              effects.push({
                kind: "burst",
                pos: { x: event.pos.x, y: event.pos.y },
                untilMs: state.stats.timeMs + 320,
                durationMs: 320,
                gore: heroGore,
                seed: Math.floor(Math.random() * 997),
              });
            }
            // A slain mob keels over where it fell — the engine removed the
            // live enemy this tick, so the corpse takes over its spot. Minions
            // are a 2s send-off (fall → lie → blink out); epic bodies (elites
            // and bosses) are few, so they keel over and simply stay down for
            // the rest of the level. Rolls a topple side so the horde doesn't
            // all fall the same way.
            if (event.type === "enemyKilled") {
              const epic = def.role !== "minion";
              // Epics linger the whole level; a day of run-clock outlives any
              // level, and `persist` keeps them from blinking out.
              const lifeMs = epic ? 86_400_000 : 2000;
              effects.push({
                kind: "corpse",
                pos: { x: event.pos.x, y: event.pos.y },
                untilMs: state.stats.timeMs + lifeMs,
                durationMs: lifeMs,
                sprite: def.sprite,
                angle: (Math.random() < 0.5 ? -1 : 1) * (Math.PI / 2),
                persist: epic || undefined,
              });
            }
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
              critPower: event.critPower,
            });
            // The kill's XP reward flows up off the corpse as blue combat text
            // (WoW's floating "+N"), starting above the damage number and
            // climbing higher/longer so the two don't overlap. The DISPLAY
            // preference `xpFloat` can silence these popups.
            if (
              event.type === "enemyKilled" &&
              event.xp > 0 &&
              !mergedKills.has(event) &&
              getSettings().xpFloat === "on"
            ) {
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
          // A NOVA proc: the violet burst ring, sized to the engine's
          // damage radius.
          if (event.type === "nova") {
            effects.push({
              kind: "nova",
              pos: event.pos,
              untilMs: state.stats.timeMs + 320,
              durationMs: 320,
              radius: event.radius,
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
          // A blow bounced off a guarded unique: float "SHIELDED" so the
          // immunity reads as a rule (kill the controllers first), not a bug.
          if (event.type === "enemyShielded") {
            const def = enemyDef(event.defId);
            effects.push({
              kind: "text",
              pos: { x: event.pos.x, y: event.pos.y - def.radius - 2 },
              untilMs: state.stats.timeMs + 650,
              durationMs: 650,
              text: "SHIELDED",
              color: "#8fd7ff",
            });
          }
          // An enemy's shot flashes at its muzzle like the hero's own.
          if (event.type === "enemyShot") {
            effects.push({
              kind: "muzzle",
              pos: { x: event.pos.x, y: event.pos.y },
              angle: Math.atan2(event.dir.y, event.dir.x),
              weaponClass: "ranged",
              untilMs: state.stats.timeMs + 110,
              durationMs: 110,
            });
          }
          // A companion's kill-quote banter: hovering text over the killer,
          // gold and longer-lived than a combat tag — a one-liner, not a
          // dialogue scene, so the run never pauses for it.
          if (event.type === "companionQuote") {
            effects.push({
              kind: "text",
              pos: { x: event.pos.x, y: event.pos.y - 16 },
              untilMs: state.stats.timeMs + 2200,
              durationMs: 2200,
              text: event.text,
              color: "#ffd75e",
            });
          }
          // The DING: a "LEVEL UP!" tag rises off the hero while the golden
          // burn plays (the stat chooser waits out the celebration), and the
          // automatic base gains tick into the lower-right feed in gold so
          // the level is FELT in the body, not just in the chooser.
          if (event.type === "levelUp") {
            effects.push({
              kind: "text",
              pos: {
                x: state.player.pos.x,
                y: state.player.pos.y - PLAYER.radius - 8,
              },
              untilMs: state.stats.timeMs + 1100,
              durationMs: 1100,
              text: "LEVEL UP!",
              color: "#ffd75e",
              rise: 26,
            });
            pushPickup(`LEVEL ${event.level}!`, "#ffd75e", "");
            for (const gain of event.gains) {
              pushPickup(
                `+${gain.amount} ${gain.stat.toUpperCase()}`,
                "#ffd75e",
                "",
              );
            }
          }
          // A spared figure joined the party: toast the recruitment (its
          // joining scene follows through the dialogue overlay).
          if (event.type === "companionJoined") {
            pushPickup(`${companionDef(event.defId).name} JOINED`, "#7ef0c8");
          }
          // A companion beaten down / back on its feet: float the state
          // change off its head so the party's ebb reads at a glance.
          if (
            event.type === "companionDowned" ||
            event.type === "companionRevived"
          ) {
            effects.push({
              kind: "text",
              pos: { x: event.pos.x, y: event.pos.y - 14 },
              untilMs: state.stats.timeMs + 900,
              durationMs: 900,
              text: event.type === "companionDowned" ? "DOWN!" : "BACK UP",
              color: event.type === "companionDowned" ? "#d83a3a" : "#7ef0c8",
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
                quality: event.quality,
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
          // A golden XP arrow flows its award up off the hero's head as blue
          // "+N XP" combat text — the same popup a slain foe drips, but at
          // double size and with a crit-style jolt first: an arrow is a whole
          // slice of the level bar, basically a crit's worth of XP, so it
          // shakes in place before it floats. Honors the same `xpFloat` DISPLAY
          // preference that silences kill-XP popups.
          if (
            event.type === "itemCollected" &&
            event.kind === "xp" &&
            event.xp != null &&
            event.xp > 0 &&
            getSettings().xpFloat === "on"
          ) {
            effects.push({
              kind: "text",
              pos: {
                x: state.player.pos.x,
                y: state.player.pos.y - PLAYER.radius - 12,
              },
              untilMs: state.stats.timeMs + 1100,
              durationMs: 1100,
              text: `+${formatCompact(event.xp)} XP`,
              color: "#6cc4ff",
              rise: 30,
              scale: 2,
              shake: true,
            });
          }
          if (event.type === "storyItemCollected") {
            pushPickup(storyItemDef(event.defId).name, "#ffd75e");
          }
          // The merchant met: toast it — his greeting scene (if the level
          // has one) takes the stage through the ordinary dialogue overlay.
          if (event.type === "merchantDiscovered") {
            pushPickup("MERCHANT DISCOVERED", "#ffd75e");
            // Remember the meeting per map+difficulty so he's set up at the
            // door on every later entry (repair-after-death within reach).
            characterRef.current = markMerchantMet(
              characterRef.current,
              runLevelId,
              difficulty,
            );
          }
          // Paid the trader to mend the whole kit — toast the spend.
          if (event.type === "gearRepaired") {
            pushPickup(`REPAIRED - ${event.paid} COIN`, "#ffd75e");
          }
          // A placed pack wiped out: toast the patch of ground as cleared —
          // the movement reward. The ambush and clear chimes ride the sfx bus.
          if (event.type === "packCleared") {
            pushPickup("AREA CLEARED", "#7cff9b");
          }
          // The run is over: silence the loop so the jingle stands alone. High
          // scores are banked below — per CAMPAIGN, hardcore only (not per run).
          if (event.type === "victory" || event.type === "defeat") {
            stopMusic();
          }
          // Clearing a level records it (per difficulty) so the campaign
          // unlocks the next one and the menu marks this one replayable —
          // and banks the hero's snapshot (level, stats, items) so the next
          // level starts with everything he finished this one with. Beating
          // the difficulty's LAST level also banks any unique/legendary
          // finds into the forever-stash.
          if (event.type === "victory") {
            // Whether this clear ADDS to the hardcore campaign score: it must
            // be the level's FIRST clear on a difficulty not yet beaten, so a
            // replay through the free level picker can't inflate a total.
            const before = characterRef.current;
            const scores =
              before.hardcore &&
              !before.beaten.includes(difficulty) &&
              !hasClearedLevel(before, state.level.id, difficulty);
            // Bank the win onto the character: their build becomes the
            // end-of-level snapshot, the clear is recorded, and clearing the
            // difficulty's LAST level marks it beaten (opening its level picker
            // and the next rung of the ladder). The updated character feeds the
            // next level's carry-over.
            characterRef.current = recordVictory(
              before,
              state.level.id,
              difficulty,
              extractLoadout(state),
            );
            if (scores) {
              // Fold this map into the running campaign total.
              characterRef.current = accrueCampaign(
                characterRef.current,
                difficulty,
                {
                  kills: state.stats.kills,
                  combatMs: state.stats.combatMs,
                  peakMenace: state.stats.peakMenace,
                },
              );
              // Beating the LAST level completes the campaign (recordVictory
              // just marked it beaten): bank the whole campaign total as a
              // SURVIVED high score, flag a new record, and clear the tally so
              // a replay can't re-bank it.
              const completed =
                !before.beaten.includes(difficulty) &&
                characterRef.current.beaten.includes(difficulty);
              if (completed) {
                const tally = campaignTally(characterRef.current, difficulty);
                if (
                  recordCampaign(difficulty, {
                    name: characterRef.current.name,
                    kills: tally.kills,
                    combatMs: tally.combatMs,
                    peakMenace: tally.peakMenace,
                    levels: tally.levels,
                    outcome: "survived",
                    at: Date.now(),
                  })
                )
                  setNewRecord(true);
                characterRef.current = resetCampaign(
                  characterRef.current,
                  difficulty,
                );
              }
            }
          }
          // Death splits on the hero's mode. Hardcore is permadeath: bank the
          // campaign the hero fell in (its cleared maps PLUS this fatal,
          // uncleared run) as a FELL high score, then retire them for good.
          // Softcore costs no progress: bank the run's build so the level,
          // stats and items earned this run are kept, and drop the retry
          // checkpoint (which froze the entry build at combat-start) so RETRY
          // rebuilds the level from this just-banked build — replaying from the
          // lower entry build would regress the hero on the next clear.
          if (event.type === "defeat") {
            if (characterRef.current.hardcore) {
              // Bank the campaign total reached — the cleared maps plus this
              // fatal run — but only while the difficulty is unbeaten (a death
              // on a replay of an already-conquered campaign scores nothing).
              if (!characterRef.current.beaten.includes(difficulty)) {
                const tally = campaignTally(characterRef.current, difficulty);
                if (
                  recordCampaign(difficulty, {
                    name: characterRef.current.name,
                    kills: tally.kills + state.stats.kills,
                    combatMs: tally.combatMs + state.stats.combatMs,
                    peakMenace: Math.max(
                      tally.peakMenace,
                      state.stats.peakMenace,
                    ),
                    levels: tally.levels,
                    outcome: "fell",
                    levelId: state.level.id,
                    at: Date.now(),
                  })
                )
                  setNewRecord(true);
              }
              characterRef.current = recordDeath(characterRef.current);
            } else {
              // Powerups do NOT survive death: the banked build keeps the level,
              // stats, gear, bag and coins earned this run, but the dock's
              // pocketed powerups are spent — a RETRY rebuilds the level from
              // this build and starts it with an empty dock, so a hoarded stack
              // can't be replayed through the same fight over and over.
              const banked = extractLoadout(state);
              banked.heldAbilities = [];
              characterRef.current = bankLoadout(characterRef.current, banked);
              checkpointRef.current = null;
            }
          }
          // Stepping into a travel gate (the cow-level door the SEVERED HAND
          // tears open): bank the hero's build and the thoughts read this
          // run, then swap the mount to the destination level. The next run
          // dresses the hero in the banked build, so the crossing carries
          // everything he's holding — the run he leaves behind simply ends.
          if (event.type === "gateEntered") {
            characterRef.current = bankLoadout(
              characterRef.current,
              extractLoadout(state),
            );
            characterRef.current = markStorySeen(
              characterRef.current,
              state.level.id,
              difficulty,
              state.thoughtsSeen,
            );
            checkpointRef.current = null;
            stopMusic();
            setHud(null);
            setLevelId(event.to);
          }
          // Run over either way: bank the opening and every inner monologue read
          // this run onto the character, so the next replay on this difficulty
          // skips them. This catches the late kill/sight beats that only fire
          // deep into a run (the combat-start mark above bags the opening ones).
          if (event.type === "victory" || event.type === "defeat") {
            characterRef.current = markStorySeen(
              characterRef.current,
              state.level.id,
              difficulty,
              state.thoughtsSeen,
            );
          }
        }
        if (effects.length > 0) {
          effects = effects.filter((e) => e.untilMs > state.stats.timeMs);
        }
      },
      render(timeMs) {
        const camera = computeCamera(
          state,
          canvas.width,
          canvas.height,
          timeMs,
        );
        // A pinned swing pose (?debug `window.__swing`) overrides the live
        // action so a screenshot samples an exact fraction of the arc. Rebuilt
        // each frame off the current clock so the fraction stays fixed. Neutral
        // (undefined) in normal play — the live `heroAction` drives the swing.
        const DEBUG_POSE_MS = 1000;
        const action = debugPose
          ? {
              kind: debugPose.kind,
              weaponClass: debugPose.weaponClass,
              startMs: state.stats.timeMs - debugPose.t * DEBUG_POSE_MS,
              durationMs: DEBUG_POSE_MS,
              arc: debugPose.arc,
            }
          : heroAction;
        drawFrame(ctx, state, assets, camera, timeMs, action);
        // A pinned melee swing (with `arc`/`range`) also draws its slash cone
        // frozen at the SAME fraction, so the preview strip shows the blade and
        // its AoE moving together. The untilMs is set so drawEffects resolves
        // the cone's own `t` back to `debugPose.t`.
        let debugEffects = effects;
        if (debugPose && debugPose.kind === "swing" && debugPose.arc != null) {
          debugEffects = [
            ...effects,
            {
              kind: "swing",
              pos: { x: state.player.pos.x, y: state.player.pos.y },
              angle: state.player.faceLeft ? Math.PI : 0,
              radius: debugPose.range ?? 40,
              arc: debugPose.arc,
              untilMs: state.stats.timeMs + (1 - debugPose.t) * MELEE_SWING_MS,
              durationMs: MELEE_SWING_MS,
            },
          ];
        } else if (debugPose && debugPose.kind === "shot") {
          // Pin the muzzle / cast flash at the same fraction as the pose, so a
          // ranged/magic weapon's shot signature can be sampled frame by frame.
          const MUZZLE_MS = 110;
          const wc = debugPose.weaponClass === "magic" ? "magic" : "ranged";
          debugEffects = [
            ...effects,
            {
              kind: "muzzle",
              pos: { x: state.player.pos.x, y: state.player.pos.y },
              angle: state.player.faceLeft ? Math.PI : 0,
              weaponClass: debugPose.weaponClass,
              fx: shotStyleFor(state.player.equipment.weapon.uniqueId, wc),
              untilMs: state.stats.timeMs + (1 - debugPose.t) * MUZZLE_MS,
              durationMs: MUZZLE_MS,
            },
          ];
        }
        drawEffects(ctx, debugEffects, camera, state.stats.timeMs, assets);

        // The FPS readout: smooth the frame delta (EMA) and write the number
        // straight to the DOM every quarter second — no React re-render, so
        // the meter itself costs nothing worth measuring.
        const fpsNode = fpsRef.current;
        if (fpsNode) {
          if (fpsLastMs !== undefined) {
            const frameMs = timeMs - fpsLastMs;
            fpsAvgMs =
              fpsAvgMs === 0 ? frameMs : fpsAvgMs * 0.9 + frameMs * 0.1;
            if (timeMs >= fpsNextFlushMs && fpsAvgMs > 0) {
              fpsNextFlushMs = timeMs + 250;
              fpsNode.textContent = `${Math.round(1000 / fpsAvgMs)} FPS`;
            }
          }
          fpsLastMs = timeMs;
        }

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

        // Drive each running powerup's WoW-style cooldown right on its dock
        // slot: a conic sweep that unwinds as the ability runs out, plus a
        // whole-second countdown. Both are written to the DOM here so they tick
        // every frame without a React re-render (React only owns which slots
        // are banked vs running — see the `active` key). Each running copy owns
        // its own slot, so there's no stacking to reconcile here.
        const dock = powerupDockRef.current;
        if (dock) {
          for (const ability of state.player.abilities) {
            if (ability.slot === undefined) continue;
            const slot = dock.querySelector<HTMLElement>(
              `[data-slot="${ability.slot}"]`,
            );
            if (!slot) continue;
            const total = abilityDef(ability.defId).durationMs;
            const remaining = Math.max(0, ability.remainingMs);
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
        // Only *which* slots are banked vs running mounts/unmounts dock chrome;
        // the ticking timer itself is animated straight on the DOM, so it stays
        // out of the change-key (which would otherwise thrash React state every
        // frame).
        const active = state.player.abilities
          .map((a) => a.slot)
          .filter((s) => s !== undefined)
          .sort((a, b) => a - b)
          .join(",");
        // The consumable dock: the best-quality medkit held (and its stack
        // depth) plus the stamina-potion count. Both feed the change-key so the
        // two slots re-render as kits are grabbed and spent.
        const medkitTier = bestMedkitTier(state);
        const medkitCount =
          medkitTier >= 0 ? (state.player.medkits[medkitTier] ?? 0) : 0;
        const staminaPotions = state.player.staminaPotions;
        const weapon = state.player.equipment.weapon;
        const weaponWear =
          weapon.durability === undefined
            ? null
            : weapon.durability / equipmentMaxDurability(weapon);
        const appearance = playerAppearance(state);
        // The worn armor pieces, so the avatar portrait re-renders when the
        // outfit changes (the weapon is already keyed via `weapon.defId`).
        const { head, chest, legs, feet } = state.player.equipment;
        const outfit = [head, chest, legs, feet]
          .map((piece) => piece?.defId ?? "")
          .join(",");
        const stage = menaceStage(state);
        // The party portraits re-render on membership, coarse health (tenths
        // — the sliver bar's resolution), and the downed flag.
        const party = state.companions
          .map(
            (c) =>
              `${c.id}:${Math.ceil((10 * c.hp) / Math.max(1, c.maxHp))}:${c.downedMs !== undefined ? 1 : 0}`,
          )
          .join(",");
        // The prelude scene's id is part of the key: a chained prelude swaps
        // `state.cutscene` for the next scene with nothing else changing, and
        // the overlay only receives the fresh scene if this re-renders.
        const key = `${state.phase}/${state.cutscene?.defId ?? ""}/${state.player.hp}/${Math.ceil(state.player.stamina)}/${state.player.xp}/${state.player.level}/${state.player.pendingStatPoints}/${state.enemies.length}/${bagCount}/${bagFree}/${bagFullHint ? 1 : 0}/${held}/${active}/${medkitTier}:${medkitCount}/${staminaPotions}/${weapon.defId}/${weaponWear?.toFixed(2) ?? ""}/${state.player.coins}/${appearance}/${outfit}/${stage}/${party}/${state.stats.kills}/${Math.floor(state.stats.combatMs / 1000)}`;
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
            activeSlots: state.player.abilities
              .map((a) => a.slot)
              .filter((s): s is number => s !== undefined),
            medkitTier,
            medkitCount,
            staminaPotions,
            weaponDefId: weapon.defId,
            weaponWear,
            coins: state.player.coins,
            appearance,
            companions: state.companions.map((c) => ({
              id: c.id,
              defId: c.defId,
              sprite: companionDef(c.defId).sprite,
              hpFrac: c.maxHp > 0 ? c.hp / c.maxHp : 0,
              downed: c.downedMs !== undefined,
            })),
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
      window.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("wheel", onWheel);
      window.removeEventListener("contextmenu", onContextMenu);
      window.removeEventListener("blur", onBlur);
      document.removeEventListener("visibilitychange", onVisibility);
      canvas.removeEventListener("pointerdown", unlock);
      pickupTimers.forEach(clearTimeout);
      if (pickupCardTimer) clearTimeout(pickupCardTimer);
    };
  }, [assets, runId, difficulty, levelId, initialLevelId, skipOpening]);

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

  // The hero-avatar inventory button — the dressed paper-doll portrait with
  // the free-bag-cells badge. Shared between the playing HUD's status unit
  // and the arrival-scene corner: an elite/boss stare-down hides the HUD
  // proper but still offers the bag (see canOpenInventory), so the player
  // can size up the speaker and equip a fitting weapon before the fight.
  const heroAvatar = hud && (
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
        // The dressed paper-doll (worn armor + held weapon), so
        // the portrait always matches the character on the field.
        const src = state
          ? dollDataUrl(assets.sprites, playerDollLayers(state, "0"))
          : spriteDataUrl(assets.sprites, `${hud.appearance}_0`);
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
  );

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

      {/* The FPS meter (DEBUG MODE / ?debug): a tiny bottom-center readout
          the render loop writes into directly — see fpsRef. */}
      {showFps && <div ref={fpsRef} className="game-fps" aria-hidden="true" />}

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
                center clock unit's border + backdrop — with the recruited
                party's portraits railed underneath (tap one to equip it). */}
            <div className="hud-left">
              <div className="hud-status">
                {heroAvatar}
                <div className="hud-vitals">
                  {/* HP + stamina stay together; the weapon + durability and
                      purse form a second group that reflows to the RIGHT of
                      the vitals in landscape (stacks below in portrait). */}
                  <div className="hud-vitals-group hud-vitals-primary">
                    <div className="hud-stat-row">
                      <PixelText
                        font={font}
                        text="HP"
                        scale={2}
                        color="#9aa3ad"
                      />
                      <div className="hud-bar hp-bar">
                        <div
                          className="hud-bar-fill"
                          style={{ width: `${(100 * hud.hp) / hud.maxHp}%` }}
                        />
                      </div>
                      <span className="hud-stat-val">
                        <PixelText
                          font={font}
                          text={String(hud.hp)}
                          scale={2}
                        />
                      </span>
                    </div>
                    <div className="hud-stat-row">
                      <PixelText
                        font={font}
                        text="ST"
                        scale={2}
                        color="#9aa3ad"
                      />
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
                  </div>
                  <div className="hud-vitals-group hud-vitals-gear">
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
                                            if (
                                              equipFromInventory(state, index)
                                            ) {
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
                                    hud.weaponWear < 0.25
                                      ? "#d83a3a"
                                      : "#9aa3ad",
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
                          <img
                            src={coin}
                            alt=""
                            className="pixel-img hud-coin"
                          />
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
              </div>

              {/* The party rail: one clickable portrait per companion under the
                hero's avatar — Diablo-2 style, tap one to open its equip
                screen. A downed companion grays out; the sliver is its hp. */}
              {hud.companions.length > 0 && (
                <div className="companion-portraits">
                  {hud.companions.map((companion) => {
                    const src = spriteDataUrl(
                      assets.sprites,
                      `${companion.sprite}_0`,
                    );
                    return (
                      <button
                        key={companion.id}
                        type="button"
                        className={`companion-portrait${companion.downed ? " downed" : ""}`}
                        aria-label={`open-companion-${companion.defId}`}
                        onClick={() => {
                          if (state && state.phase === "playing") {
                            openCompanionPanel(state, companion.id);
                            playUiSound(synth, "confirm");
                            bumpUi();
                          }
                        }}
                      >
                        {src ? (
                          <img
                            src={src}
                            alt=""
                            className="pixel-img companion-portrait-img"
                          />
                        ) : null}
                        <span className="companion-portrait-hp">
                          <span
                            style={{
                              width: `${Math.round(100 * companion.hpFrac)}%`,
                            }}
                          />
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
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
                  text={formatTime(hud.stats.combatMs)}
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
                      text={
                        hud.menaceStage > RAMPAGE_PIPS
                          ? `RAMPAGE ${hud.menaceStage}`
                          : "RAMPAGE"
                      }
                      scale={2}
                      color={rampageColor(hud.menaceStage)}
                    />
                    <div className="hud-rampage-pips">
                      {Array.from({ length: RAMPAGE_PIPS }, (_, i) => (
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

              {/* MAP + ACHIEVEMENTS ride together in one aux group. In
                landscape it reflows to the LEFT of the clock (tighter HUD);
                in portrait it stacks under the clock as before. */}
              <div className="hud-clock-aux">
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
                    src={
                      spriteDataUrl(assets.sprites, "icon_treasure_map") ?? ""
                    }
                    alt=""
                    className="pixel-img hud-map-icon"
                  />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* The consumable dock: two slots the same width as the powerup slots,
          sitting just ABOVE them in the same corner. The medkit slot shows the
          best quality the hero holds (quality-tinted ring + count); the stamina
          slot shows the potion count. Tapping a slot (or its bindable key, C /
          X on desktop) spends one — the engine no-ops at a full bar so a mistap
          never wastes a kit. The tap area runs well past the slot art (a padded
          hit region) so the small icons are still easy to hit on a phone. */}
      {hud?.phase === "playing" && (
        <div className={`consumable-dock dock-${powerupSide}`}>
          <button
            type="button"
            className={`consumable-slot${hud.medkitCount > 0 ? " filled" : ""}`}
            style={
              hud.medkitCount > 0
                ? ({
                    "--slot-accent": medkitColorFor(hud.medkitTier),
                  } as CSSProperties)
                : undefined
            }
            aria-label={
              hud.medkitCount > 0 ? "use-medkit" : "medkit-slot-empty"
            }
            disabled={hud.medkitCount === 0}
            onPointerDown={() => {
              useMedkitQueuedRef.current = true;
            }}
          >
            {hud.medkitCount > 0 && (
              <img
                src={
                  spriteDataUrl(
                    assets.sprites,
                    medkitIconFor(hud.medkitTier),
                  ) ?? ""
                }
                alt=""
                className="pixel-img consumable-icon"
              />
            )}
            {hud.medkitCount > 0 && (
              <span className="consumable-count">
                <PixelText
                  font={font}
                  text={String(hud.medkitCount)}
                  scale={2}
                  color="#f4f4f4"
                />
              </span>
            )}
            {keyHints && (
              <span className="slot-key consumable-key">
                <PixelText
                  font={font}
                  text={bindingLabel(getSettings().keybindings.medkit)}
                  scale={1}
                  color="#0b0d10"
                />
              </span>
            )}
          </button>
          <button
            type="button"
            className={`consumable-slot${
              hud.staminaPotions > 0 ? " filled" : ""
            }`}
            style={
              hud.staminaPotions > 0
                ? ({ "--slot-accent": STAMINA_POTION_COLOR } as CSSProperties)
                : undefined
            }
            aria-label={
              hud.staminaPotions > 0
                ? "use-stamina-potion"
                : "stamina-slot-empty"
            }
            disabled={hud.staminaPotions === 0}
            onPointerDown={() => {
              useStaminaQueuedRef.current = true;
            }}
          >
            {hud.staminaPotions > 0 && (
              <img
                src={spriteDataUrl(assets.sprites, STAMINA_POTION_ICON) ?? ""}
                alt=""
                className="pixel-img consumable-icon"
              />
            )}
            {hud.staminaPotions > 0 && (
              <span className="consumable-count">
                <PixelText
                  font={font}
                  text={String(hud.staminaPotions)}
                  scale={2}
                  color="#f4f4f4"
                />
              </span>
            )}
            {keyHints && (
              <span className="slot-key consumable-key">
                <PixelText
                  font={font}
                  text={bindingLabel(getSettings().keybindings.stamina)}
                  scale={1}
                  color="#0b0d10"
                />
              </span>
            )}
          </button>
        </div>
      )}

      {/* The powerup dock: three big, thumb-sized slots. Oldest sits leftmost
          and fills rightward; tapping a slot spends exactly that powerup, which
          then STAYS in its slot and counts down like a WoW cooldown — the icon
          glows amber and a translucent radial sweep unwinds over its duration,
          the remaining seconds in the corner. Only when it lapses does the slot
          free and the rest shift down, so the dock stays full (no new pickup)
          while a power runs. The sweep + number are animated by the render loop
          straight on the DOM (see powerupDockRef). A banked slot can also be
          dragged clear of the dock to trash it in a poof of smoke; a running
          one can't (it's spent). Sits in whichever bottom corner the player
          picked (settings.powerupSide). */}
      {hud?.phase === "playing" && (
        <div
          ref={powerupDockRef}
          className={`powerup-dock dock-${powerupSide}`}
        >
          {[0, 1, 2].map((i) => {
            const defId = hud.heldAbilities[i];
            const active = defId ? hud.activeSlots.includes(i) : false;
            const icon = defId
              ? spriteDataUrl(assets.sprites, abilityDef(defId).icon)
              : undefined;

            // A running powerup: inert, counting down in place. No taps, no
            // drag — it holds the slot until it lapses.
            if (active) {
              return (
                <div
                  key={i}
                  className="powerup-slot active"
                  data-slot={i}
                  aria-label={`active-powerup-${i}`}
                >
                  {icon && (
                    <img src={icon} alt="" className="pixel-img powerup-icon" />
                  )}
                  <span className="active-powerup-sweep" />
                  <span className="active-powerup-secs" />
                </div>
              );
            }

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
        <PickupModal
          key={pickupCard.id}
          font={font}
          relicFonts={assets.relicFonts}
          card={pickupCard}
        />
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

      {state && hud?.phase === "outro" && (
        <IntroOverlay
          variant="outro"
          state={state}
          assets={assets}
          font={font}
          revealRef={introRevealRef}
          onBlip={() => {
            playUiSound(synth, "blip");
            playTypewriterHaptic();
          }}
          onAdvance={() => {
            advanceOutro(state);
            playUiSound(synth, "move");
            bumpUi();
          }}
          onSkip={() => {
            skipOutro(state);
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

      {/* An elite/boss ARRIVAL scene offers the bag: the hero's avatar
          re-parks top-left OVER the overlay's tap-to-advance backdrop
          (rendered after it, so its taps never turn the page), letting the
          player open the inventory and equip a fitting weapon before the
          fight. Other scenes (last words, thoughts, lore) stay read-only —
          the engine's canOpenInventory draws that line. */}
      {state && hud?.phase === "dialogue" && canOpenInventory(state) && (
        <div className="dialogue-hud">{heroAvatar}</div>
      )}

      {state && hud?.phase === "choice" && (
        <ChoiceOverlay
          state={state}
          assets={assets}
          font={font}
          onResolve={(spared) => {
            playUiSound(synth, spared ? "confirm" : "back");
            bumpUi();
          }}
        />
      )}

      {state && hud?.phase === "companion" && (
        <CompanionPanel
          state={state}
          font={font}
          sprites={assets.sprites}
          onChange={bumpUi}
          onClose={() => {
            closeCompanionPanel(state);
            playUiSound(synth, "back");
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
          relicFonts={assets.relicFonts}
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
          relicFonts={assets.relicFonts}
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

      {/* The achievement unlock banner — any phase: a badge earned on the
          winning blow still gets its moment over the victory splash. */}
      {achievementToast && (
        <AchievementToast
          key={achievementToast.id}
          font={font}
          sprites={assets.sprites}
          toast={achievementToast}
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
          {/* A death parts the two modes: hardcore is retired for good, while a
              softcore hero keeps everything earned this run and only has to
              restart the level (or leave). */}
          {hud.phase === "defeat" && (
            <PixelText
              font={font}
              text={
                character.hardcore
                  ? "HARDCORE · HERO RETIRED"
                  : "SOFTCORE · PROGRESS KEPT"
              }
              scale={2}
              color={character.hardcore ? "#ff6d6d" : "#7ef0c8"}
            />
          )}
          <div className="splash-stats">
            <PixelText
              font={font}
              text={`TIME ${formatTime(hud.stats.combatMs)}`}
              scale={2}
            />
            <PixelText
              font={font}
              text={`PEAK MENACE ${hud.stats.peakMenace}`}
              scale={2}
              color="#9aa3ad"
            />
            <PixelText
              font={font}
              text={`LEVEL REACHED ${hud.level}`}
              scale={2}
            />
            <PixelText
              font={font}
              text={`${state?.level.foes ?? "FOES"} ${hud.stats.kills}/${hud.stats.totalEnemies}`}
              scale={2}
            />
            <PixelText
              font={font}
              text={`XP ${formatCompact(hud.stats.xpGained)}`}
              scale={2}
            />
            <PixelText
              font={font}
              text={`DAMAGE DEALT ${formatCompact(hud.stats.damageDealt)}`}
              scale={2}
            />
            <PixelText
              font={font}
              text={`DAMAGE TAKEN ${formatCompact(hud.stats.damageTaken)}`}
              scale={2}
            />
            <PixelText
              font={font}
              text={`ITEMS ${hud.stats.itemsCollected}`}
              scale={2}
            />
          </div>
          <div className="splash-buttons">
            {hud.phase === "victory" &&
              state &&
              (() => {
                // A level with a return door (`exitTo` — the bunker's way
                // back to the rift) offers the crossing instead of the
                // campaign's NEXT LEVEL; a level with neither shows nothing.
                const exitTo = levelDef(state.level.id).exitTo ?? null;
                const next = exitTo ?? nextLevelId(state.level.id);
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
                      text={
                        exitTo
                          ? `BACK TO ${levelDef(exitTo).name}`
                          : "NEXT LEVEL"
                      }
                      scale={3}
                      color="#0b0d10"
                    />
                  </button>
                );
              })()}
            {/* RETRY restarts the level. Offered after every victory, and after
                a SOFTCORE death (the kept build rebuilds the run) — but never
                for a hardcore hero, who is retired and can only exit to MENU. */}
            {(hud.phase === "victory" || !character.hardcore) && (
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
            )}
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
