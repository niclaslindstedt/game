// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The Doom-style splash / main menu: a starfield, the big title, and a
// keyboard-and-pointer menu — NEW GAME leads to the difficulty ladder, and
// picking a difficulty starts the run. Menu structure is data (MENU/HELP
// arrays); the wisp sprite plays the part of Doom's skull cursor.

import {
  lazy,
  Suspense,
  type AnimationEvent as ReactAnimationEvent,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  BALANCE_TUNING_DEFAULTS,
  DIFFICULTY_ORDER,
  difficultyDef,
  LEVEL_ORDER,
  SECRET_LEVEL_ORDER,
  STARTING_DIFFICULTIES,
  levelDef,
  type Difficulty,
} from "@game/core";

import { PixelText } from "@ui/lib/PixelText.tsx";
import { useScrollFade } from "@ui/lib/scroll-fade.ts";

import { formatCompact } from "@ui/lib/format-number.ts";

import { IDENTITY } from "../identity.ts";
import { canVibrate } from "../app/platform.ts";

import { PixelCheckbox } from "@ui/lib/PixelCheckbox.tsx";
import { PixelSlider } from "@ui/lib/PixelSlider.tsx";
import { PixelToggle } from "@ui/lib/PixelToggle.tsx";

import { ArsenalScreen } from "./ArsenalScreen.tsx";
import {
  BALANCE_KNOBS,
  balanceFromSlider,
  balanceToSlider,
  formatBalanceMult,
  nudgeBalance,
} from "./balanceKnobs.ts";
import { LoadingScreen } from "./LoadingScreen.tsx";
import { SEED_TIERS, seedTierCharacters } from "./seedCharacters.ts";

import {
  topCampaigns,
  type CampaignRow,
  type ScoreMetric,
} from "./highscores.ts";

import {
  loadGameAssets,
  spriteCursor,
  spriteDataUrl,
  type GameAssets,
} from "./assets.ts";
import { synth } from "./audio.ts";
import { haptics, playMenuHaptic } from "./haptics.ts";
import { playTitleMusic } from "./music/index.ts";
import {
  exportCharacterToFile,
  importCharacterFromFile,
} from "./character-transfer.ts";
import {
  characterPurse,
  firstUnclearedLevel,
  grantCoins,
  hasClearedLevel,
  importCharacter,
  isDifficultyBeaten,
  isDifficultyUnlocked,
  isLevelUnlocked,
  loadCharacters,
  type Character,
} from "./characters.ts";
import {
  bankBalance,
  buyCoinPack,
  COIN_PACKS,
  coinStoreAvailable,
  fetchCoinPrices,
  SEND_TICK,
  sendCoins,
  type CoinPack,
} from "./store.ts";
import { BOT_VIEW_SPECS, botViewSpec } from "./botViewSpecs.ts";
import {
  DEFAULT_KEYBINDINGS,
  KEYBIND_ROWS,
  bindingLabel,
  mouseButtonCode,
  wheelCode,
  withBinding,
  type BindableAction,
} from "./keybindings.ts";
import { uiScaleFor } from "./render.ts";
import {
  GAME_SPEEDS,
  getSettings,
  KNOCKBACK_MAX,
  updateSettings,
  type GameSettings,
} from "./settings.ts";
import { playUiSound } from "./sfx/index.ts";
import { startTitleSky } from "./titleSky.ts";

// Lazy for the SEO critical-path budget: the browser is a menu destination,
// not startup code (see the GameScreen twin of this note).
const AchievementsScreen = lazy(() =>
  import("./AchievementsScreen.tsx").then((m) => ({
    default: m.AchievementsScreen,
  })),
);

type MenuScreen =
  | "main"
  | "play"
  | "difficulty"
  | "levels"
  | "botspeed"
  | "scores"
  | "settings"
  | "controls"
  | "keybindings"
  | "display"
  | "sound"
  | "data"
  | "export"
  | "developer"
  | "balance"
  | "seed"
  | "arsenal"
  | "achievements"
  | "store"
  | "storehero"
  | "storesend";

const pct = (v: number) => `${Math.round(v * 100)}%`;

/** The SETTINGS-tree screens that render as a stable form (fixed-width column +
 * a single bottom help line instead of per-row inline blurbs). The `settings`
 * index itself is excluded — it's a menu of destinations, so it keeps the
 * inline blurbs the other navigation menus use. */
const SETTINGS_TREE = new Set<MenuScreen>([
  "controls",
  "keybindings",
  "display",
  "sound",
  "data",
  "export",
  "developer",
  "balance",
  "seed",
]);

/** m:ss survival time (mirrors the HUD/splash formatter). */
const formatTime = (ms: number): string => {
  const total = Math.floor(ms / 1000);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
};

/** Kills-per-minute, kept to one decimal below 10 and whole above (a
 * double-digit rate reads cleaner without the noise of a trailing decimal). */
const formatKpm = (v: number): string =>
  v >= 10 ? String(Math.round(v)) : v.toFixed(1);

/** YYYY-MM-DD for a banked run's timestamp — the detail card's date line. */
const formatScoreDate = (at: number): string => {
  const d = new Date(at);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

/** Resolve a banked run's level id to its display name and hostile label,
 * tolerating an id a later content revision may have retired. */
const scoreLevelInfo = (levelId: string): { name: string; foes: string } => {
  try {
    const level = levelDef(levelId);
    return { name: level.name, foes: level.foes };
  } catch {
    return { name: levelId.toUpperCase(), foes: "FOES" };
  }
};

/** The high-score board's rankings, in swipe/arrow order. */
const SCORE_METRICS: { id: ScoreMetric; label: string }[] = [
  { id: "kills", label: "MOBS KILLED" },
  { id: "time", label: "SURVIVAL TIME" },
  { id: "kpm", label: "KILLS / MIN" },
  { id: "menace", label: "PEAK MENACE" },
];

/** A minimum travel (CSS px) before a pointer drag counts as a swipe. */
const SWIPE_THRESHOLD = 36;

/** How long the title moon must be held to reveal the hidden DEVELOPER menu —
 * a deliberately long, secret gesture so it never fires by accident. */
const MOON_HOLD_MS = 7000;

/** How long the moon's detonation plays before the developer unlock lands. Must
 * match the `.moon-boom` keyframe durations in styles.css. A short cut is used
 * instead under prefers-reduced-motion. */
const MOON_BOOM_MS = 900;
const MOON_BOOM_MS_REDUCED = 200;

/** Base cycle length of each backdrop asteroid's drift keyframe (seconds),
 * matching the `.title-asteroid-N` animations in styles.css. The visible
 * crossing is a fixed slice of this cycle, so a shorter cycle reads as a
 * faster fly-by. */
const ASTEROID_BASE_SECONDS = [21, 17, 27];

/** Speed spread for a fly-by, relative to the base cadence: from a lazy drift
 * (0.5×) up to a gentle streak (1.5×). Each crossing rolls a fresh multiplier
 * so no two feel alike and the belt reads as natural rather than a metronome.
 * Kept modest so even the quickest asteroid stays easy to follow by eye. */
const ASTEROID_MIN_SPEED = 0.5;
const ASTEROID_MAX_SPEED = 1.5;

/** A random `animation-duration` for one asteroid's next crossing. Faster
 * speed ⇒ shorter cycle. `Math.random` is fine here — this is cosmetic, not
 * gameplay RNG. */
function randomAsteroidDuration(baseSeconds: number): string {
  const speed =
    ASTEROID_MIN_SPEED +
    Math.random() * (ASTEROID_MAX_SPEED - ASTEROID_MIN_SPEED);
  return `${(baseSeconds / speed).toFixed(2)}s`;
}

type MenuEntry = {
  label: string;
  aria: string;
  color?: string;
  blurb?: string;
  /** A shown-but-not-yet-playable entry (a locked level): the cursor still
   * lands on it, but choosing it just buzzes instead of starting. */
  locked?: boolean;
  action: () => void;
  /** A slider row (BALANCE knobs, SOUND volumes): renders a drag track after
   * the label and takes ArrowLeft/ArrowRight (see onKeyDown) instead of a
   * confirm cycle. `pos` is the 0..1 track position; `set` commits a
   * dragged/tapped position; `nudge` steps one keyboard tick (±1). */
  slider?: {
    pos: number;
    set: (pos: number) => void;
    nudge: (dir: number) => void;
  };
  /** An ON/OFF row: renders a pixel switch after the label; the arrows set it
   * (→ on, ← off) and confirm/click flips it. `on` is the current state; `set`
   * commits a new one. */
  toggle?: { on: boolean; set: (on: boolean) => void };
  /** A MULTI-SELECT row (the EXPORT CHARACTER picker): renders a pixel tick-box
   * after the label; the arrows set it (→ checked, ← empty) and confirm/click
   * toggles it. `checked` is the current state; `set` commits a new one. A
   * tick-box (not a switch) because these rows pick one of many, not a
   * setting's on/off. */
  check?: { checked: boolean; set: (checked: boolean) => void };
  /** A KEY BINDINGS row: renders the bound key's name right-aligned (Quake
   * style — label left, key far right). `capturing` swaps it for a "PRESS A
   * KEY" prompt while this row is listening for the next press. */
  binding?: { code: string; capturing: boolean };
  /** A label-cycling settings row (MOUSE, KEYS, GEAR…): the current value,
   * rendered right-aligned like a binding so the key sits at the left and the
   * value lines up down the right edge (confirm/click still cycles it). */
  value?: string;
  /** A persistent second line of DATA under the label (the EXPORT picker's
   * per-hero "LV 34 - SOFTCORE"). Unlike `blurb` — interactive help that the
   * settings tree hoists to the bottom help line so a value change can't reflow
   * the row — a subtitle is row-bound content and always renders in the row. */
  subtitle?: string;
};

// Audio needs a user gesture; the first interaction with the menu doubles
// as the unlock, and the title theme starts with it.
function unlockAudio() {
  synth.unlock();
  playTitleMusic();
}

/** Where the difficulty ladder's cursor opens for this hero: on the furthest
 * GATED rung they've unlocked (the progression frontier — nightmare, then
 * jesus), or, before any is open, on MEDIUM — the middle of the three parallel
 * starting lanes, a neutral default (the three are all open from the start, so
 * "furthest unlocked" would otherwise land arbitrarily on hard). */
function furthestUnlockedDifficulty(character: Character): number {
  for (let i = DIFFICULTY_ORDER.length - 1; i >= 0; i--) {
    const id = DIFFICULTY_ORDER[i] as Difficulty;
    if (
      !STARTING_DIFFICULTIES.includes(id) &&
      isDifficultyUnlocked(character, id)
    ) {
      return i;
    }
  }
  return DIFFICULTY_ORDER.indexOf("medium");
}

export function TitleScreen({
  character,
  onStart,
  onResume,
  onNewGame,
  onLoadGame,
  onHowToPlay,
  startOnDifficulty = false,
}: {
  /** The active hero, or null when none is selected yet (the menu still opens
   * on the title; PLAY then routes through character select). The difficulty
   * ladder and level picker read their unlock/clear state from this character's
   * progress, and the run starts from their build. */
  character: Character | null;
  onStart: (
    difficulty: Difficulty,
    levelId: string,
    opts?: { skipIntro?: boolean; botView?: boolean },
  ) => void;
  /** Present only while a run sits parked in memory (the player exited to the
   * menu from the pause screen). When set, the menu offers RESUME, which
   * drops straight back into the frozen run. */
  onResume?: () => void;
  /** PLAY → NEW GAME: open the roster straight on the create form to mint a
   * fresh hero, then drop into the difficulty ladder for it. */
  onNewGame: () => void;
  /** PLAY → LOAD GAME: open the roster to pick (or remove) an existing hero,
   * then resume the chosen one at the beginning of its current level — or open
   * the difficulty ladder if no campaign is under way. */
  onLoadGame: () => void;
  /** HOW TO PLAY: launch the self-playing showcase run (App drives it as a
   * demo BOT VIEW — see demo.ts / GameScreen `demo`). */
  onHowToPlay: () => void;
  /** Mount straight on the difficulty ladder (set when returning from the
   * roster via PLAY) instead of the main menu. */
  startOnDifficulty?: boolean;
}) {
  const [assets, setAssets] = useState<GameAssets | null>(null);
  const [screen, setScreen] = useState<MenuScreen>(
    startOnDifficulty && character ? "difficulty" : "main",
  );
  // Cursor position per screen; the difficulty ladder opens on the hero's
  // furthest-unlocked rung (see furthestUnlockedDifficulty).
  const [cursor, setCursor] = useState(() =>
    startOnDifficulty && character ? furthestUnlockedDifficulty(character) : 0,
  );
  // Each backdrop asteroid gets its own random speed for its first fly-by, and
  // rerolls a fresh one at every iteration boundary (rerollAsteroid), so the
  // belt never falls into a fixed rhythm. Computed once per mount.
  const asteroidDurations = useMemo(
    () => ASTEROID_BASE_SECONDS.map(randomAsteroidDuration),
    [],
  );
  const rerollAsteroid = useCallback(
    (e: ReactAnimationEvent<HTMLSpanElement>, baseSeconds: number) => {
      // Fires while the asteroid is parked off-screen, so swapping the
      // duration never shows as a mid-flight jump.
      e.currentTarget.style.animationDuration =
        randomAsteroidDuration(baseSeconds);
    },
    [],
  );
  // The difficulty picked on the ladder — the level-select screen that
  // follows reads it to decide which levels are unlocked (progress is per
  // difficulty), and it carries into the run.
  const [difficulty, setDifficulty] = useState<Difficulty>("medium");
  // Warp mode: the level list was opened via the developer menu's SELECT LEVEL,
  // so every level is reachable regardless of progress and picking one skips
  // the intro.
  const [warp, setWarp] = useState(false);
  // BOT VIEW: the warp pickers were opened via DEVELOPER → BOT VIEW, so picking a
  // level hands the run to the engine autopilot (a realistic arrival hero) rather
  // than starting a normal playable run. Rides on top of `warp` (same pickers).
  const [botView, setBotView] = useState(false);
  // The level a BOT VIEW run was launched at, stashed while the GAME SPEED step
  // (the `botspeed` screen, shown AFTER difficulty + level) picks the
  // fast-forward multiplier before the run finally starts. Null off that flow.
  const [botLevel, setBotLevel] = useState<string | null>(null);
  // The scrollable menu column: each screen change starts reading from the
  // top (the selected row's scrollIntoView would otherwise land a tall screen
  // — SETTINGS — scrolled to its BACK row, hiding the content).
  const contentRef = useRef<HTMLDivElement | null>(null);
  // The moon is mid-charge (held but not yet at MOON_HOLD_MS) — drives the
  // "charging up" glow so the long-press has visible feedback.
  const [moonCharging, setMoonCharging] = useState(false);
  // The moon has reached full charge and is detonating: a one-shot blast that
  // plays before the developer menu is unlocked (see startMoonHold /
  // MOON_BOOM_MS).
  const [moonExploding, setMoonExploding] = useState(false);
  // The HIGH SCORES board's axes: left/right picks the difficulty column,
  // up/down flips between the four campaign rankings (kills, survival, KPM,
  // menace). The board is hardcore-only and per campaign (see highscores.ts).
  const [scoreDifficulty, setScoreDifficulty] = useState<Difficulty>("medium");
  const [scoreMetric, setScoreMetric] = useState<ScoreMetric>("kills");
  // The campaign row currently opened into its full breakdown card, or null for
  // the ranked list.
  const [scoreDetail, setScoreDetail] = useState<CampaignRow | null>(null);
  // Which action is mid-rebind (KEY BINDINGS): the next key/mouse press is
  // captured as its new bind. Null when not listening.
  const [captureBind, setCaptureBind] = useState<BindableAction | null>(null);
  // Landscape phones are short and portrait ones narrow: pick a logo scale
  // that keeps the title logo plus the menu inside both. `wide` gates the
  // big desktop logo (scale 10, ~510 CSS px), so it must track the 2×
  // root-font regime (UI_SCALE_BREAKPOINT_PX): past that breakpoint the logo
  // renders at ~1020 *physical* px, so the width gate doubles too. A plain
  // (min-width: 760px) media query counted an iPad portrait (820×1180) as
  // wide and clipped the title off both screen edges.
  const isCompact = () => window.innerHeight <= 480;
  const isWide = () => {
    const { innerWidth: w, innerHeight: h } = window;
    return w >= (uiScaleFor(w, h) === 2 ? 1080 : 760);
  };
  const [compact, setCompact] = useState(isCompact);
  const [wide, setWide] = useState(isWide);
  // KEY BINDINGS only make sense where there's a physical keyboard to rebind,
  // so the row is desktop-only: any device with a fine pointer (a mouse or
  // trackpad, which travels with a keyboard) shows it; touch-only phones and
  // tablets don't. A device characteristic, so it's read once at mount.
  const hasFinePointer =
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(any-pointer: fine)").matches;
  // The VIBRATION row is offered only where a buzz can actually land: a
  // touch-primary device whose browser has the Vibration API (Android in a
  // browser or an installed PWA), or the native app (Taptic bridge). Desktop
  // (API present but no motor) and all of iOS (no API) would show a dead
  // switch, so it's hidden there (see app/platform.ts `canVibrate`). A device
  // characteristic, so it's read once at mount alongside the pointer probe.
  const canBuzz = canVibrate();

  useEffect(() => {
    const onResize = () => {
      setCompact(isCompact());
      setWide(isWide());
    };
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
    };
  }, []);
  const logoScale = compact ? 7 : wide ? 10 : 6;

  // The row the selection cursor is on, so cursor moves can keep it in view.
  const selectedRowRef = useRef<HTMLButtonElement | null>(null);
  const prevScreenRef = useRef(screen);
  useEffect(() => {
    if (prevScreenRef.current !== screen) {
      // Fresh screen: start reading from the top. Scrolling the selected row
      // into view here instead used to land a taller-than-viewport screen
      // (SETTINGS on a small phone or a 2×-scaled tablet) scrolled to its
      // BACK row, clipping the header and the content's first lines.
      prevScreenRef.current = screen;
      contentRef.current?.scrollTo(0, 0);
    } else {
      // In-screen cursor move: keep the highlighted row visible as a long
      // list (levels, settings) scrolls under keyboard navigation.
      selectedRowRef.current?.scrollIntoView({ block: "nearest" });
    }
  }, [screen, cursor]);
  // A long blurb (the developer flags carry sentence-length ones) would stretch
  // the centered menu wider than a portrait phone, shoving every label to the
  // left and the selection cursor off the screen edge. On narrow screens cap
  // the wrap width so a long blurb folds to a second line instead; landscape /
  // desktop (wide) keep the roomy single-line look.
  const blurbMaxWidth = wide ? undefined : 20;

  useEffect(() => {
    let alive = true;
    void loadGameAssets().then((loaded) => {
      if (alive) setAssets(loaded);
    });
    // Returning from a run the context is already unlocked — bring the
    // theme back without waiting for a gesture.
    if (synth.now() !== null) playTitleMusic();
    return () => {
      alive = false;
    };
  }, []);

  // The backdrop's solar-system Easter egg — a rAF loop that spins Earth and
  // Mars around a static sun (and the Moon around Earth), each lit from the
  // sun's real position. Starts once the menu (and its elements) has mounted
  // after the assets load.
  const moonRef = useRef<HTMLDivElement>(null);
  const mercuryRef = useRef<HTMLDivElement>(null);
  const venusRef = useRef<HTMLDivElement>(null);
  const earthRef = useRef<HTMLDivElement>(null);
  const marsRef = useRef<HTMLDivElement>(null);
  const sunRef = useRef<HTMLDivElement>(null);
  const glareRef = useRef<HTMLDivElement>(null);
  // The backdrop asteroids, driven on a 3D fly-through in orbit mode (they keep
  // their CSS drift with the flag off). Collected so startTitleSky can take them
  // over.
  const asteroidRefs = useRef<(HTMLSpanElement | null)[]>([]);

  // The level list only needs to scroll when it genuinely can't fit — a long
  // ladder (20+ levels) on a short viewport. With the handful of levels this
  // game ships it fits with room to spare, so an unconditional cap would show
  // a needless scrollbar (and clip the top row). Measure the list against the
  // space the centered column leaves it and only cap+scroll on real overflow.
  const screenRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLElement>(null);
  const [levelsOverflow, setLevelsOverflow] = useState(false);
  // The screens whose row lists can genuinely outgrow a short viewport — the
  // level ladder and the developer BALANCE knobs — share the measure-then-cap
  // treatment (see the levelsOverflow effect below).
  const tallMenu =
    screen === "levels" || screen === "balance" || screen === "seed";
  // Settings live in a plain singleton; mirror a tick so labels re-render.
  const [settingsTick, setSettingsTick] = useState(0);

  // Planetarium test view (`?skytest`): strip the menu chrome so the orbiting
  // solar system can be inspected on a bare sky — no logo/menu/footer
  // overlapping the bodies.
  const skyTest = new URLSearchParams(window.location.search).has("skytest");
  useEffect(() => {
    const moon = moonRef.current;
    const sun = sunRef.current;
    const glare = glareRef.current;
    if (!moon || !sun || !glare) return;
    const mercury = mercuryRef.current;
    const venus = venusRef.current;
    const earth = earthRef.current;
    const mars = marsRef.current;
    if (!mercury || !venus || !earth || !mars) return;
    const asteroids = asteroidRefs.current.filter(
      (a): a is HTMLSpanElement => !!a,
    );
    return startTitleSky({
      moon,
      mercury,
      venus,
      earth,
      mars,
      sun,
      glare,
      asteroids,
    });
  }, [assets]);

  // Character transfer (SETTINGS → DATA → EXPORT / IMPORT CHARACTER): the last
  // result, shown as a line under the menu.
  const [transferNotice, setTransferNotice] = useState<{
    tone: "info" | "error";
    text: string;
  } | null>(null);

  // The whole roster, loaded for the EXPORT CHARACTER picker (SETTINGS → DATA →
  // EXPORT CHARACTER). Refreshed each time the screen opens (via exportTick) so
  // a hero imported this session shows up. Independent of the ACTIVE character —
  // the picker exports whichever heroes are ticked, not the current game.
  const [exportTick, setExportTick] = useState(0);
  // exportTick is the deliberate refresh trigger (a fresh roster snapshot each
  // time the picker opens); eslint can't see the dependency through
  // loadCharacters(), so it wrongly flags it — keep it and silence the warning.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const roster = useMemo(() => loadCharacters(), [exportTick]);
  // The ids ticked in the EXPORT CHARACTER picker — one or many. A Set so
  // toggling a row is O(1) and the export button reads its size.
  const [exportPicks, setExportPicks] = useState<Set<string>>(() => new Set());
  const toggleExportPick = useCallback((id: string, on: boolean) => {
    playUiSound(synth, "confirm");
    setExportPicks((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);

  // Export every ticked hero as its own signed zip. A no-op with nothing ticked
  // (the row buzzes instead). Downloads run sequentially so the browser doesn't
  // drop overlapping saves; a single failure is surfaced without hiding the
  // ones that did land.
  const exportPicked = useCallback(async () => {
    const chosen = roster.filter((c) => exportPicks.has(c.id));
    if (chosen.length === 0) {
      playUiSound(synth, "back");
      setTransferNotice({ tone: "error", text: "SELECT A HERO TO EXPORT" });
      return;
    }
    playUiSound(synth, "confirm");
    let failed = 0;
    for (const hero of chosen) {
      try {
        await exportCharacterToFile(hero);
      } catch {
        failed += 1;
      }
    }
    if (failed === 0) {
      setTransferNotice({
        tone: "info",
        text:
          chosen.length === 1
            ? `EXPORTED ${chosen[0]!.name}`
            : `EXPORTED ${chosen.length} HEROES`,
      });
    } else {
      setTransferNotice({ tone: "error", text: `EXPORT FAILED (${failed})` });
    }
  }, [roster, exportPicks]);

  const runImport = useCallback(async (file: File) => {
    try {
      const imported = await importCharacterFromFile(file);
      const stored = importCharacter(imported);
      playUiSound(synth, "start");
      setTransferNotice({ tone: "info", text: `IMPORTED ${stored.name}` });
    } catch (err) {
      playUiSound(synth, "back");
      setTransferNotice({
        tone: "error",
        text: err instanceof Error ? err.message : "IMPORT FAILED",
      });
    }
  }, []);

  // Open the OS file picker. A transient input avoids a render-time ref (and
  // the click is a genuine user gesture, so the dialog opens).
  const pickImport = useCallback(() => {
    playUiSound(synth, "confirm");
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".zip,application/zip";
    input.addEventListener("change", () => {
      const file = input.files?.[0];
      if (file) void runImport(file);
    });
    input.click();
  }, [runImport]);

  // DEVELOPER → SEED CHARACTERS: mint the melee/ranged/magic specimens for a
  // tier (or the whole 3×4 matrix with no tier) straight into the roster, then
  // refresh the roster snapshot and report the count under the menu.
  const runSeed = useCallback((tier: (typeof SEED_TIERS)[number] | null) => {
    playUiSound(synth, "confirm");
    const count = seedTierCharacters(tier);
    setExportTick((t) => t + 1);
    setTransferNotice({ tone: "info", text: `SEEDED ${count} HEROES` });
  }, []);

  // The COIN STORE: the native shell, or any build where the DEVELOPER →
  // FORCE STORE switch is on (free packs — see game/store.ts). Recomputed
  // every render so flipping the switch surfaces the row immediately.
  const storeOpen = coinStoreAvailable();
  // The hero picked in the DISTRIBUTE flow, carried into the amount screen.
  const [storeHeroId, setStoreHeroId] = useState<string | null>(null);
  // The DISTRIBUTE slider's chosen amount (coins, in SEND_TICK steps).
  const [storeAmount, setStoreAmount] = useState(0);
  // Localized price tags from the platform store, fetched on first entry;
  // null until they arrive (rows show the shipped USD tags meanwhile).
  const [storePrices, setStorePrices] = useState<Record<string, string> | null>(
    null,
  );
  // A pay sheet is open — further store rows buzz instead of stacking flows.
  const [storeBusy, setStoreBusy] = useState(false);
  useEffect(() => {
    if (screen !== "store" || storePrices !== null || !storeOpen) return;
    let cancelled = false;
    void fetchCoinPrices().then((prices) => {
      if (!cancelled && prices) setStorePrices(prices);
    });
    return () => {
      cancelled = true;
    };
  }, [screen, storePrices, storeOpen]);

  // STORE → pack tapped: run the platform pay sheet; the coins land in the
  // undistributed bank (store.ts). The promise resolves only after the
  // credit is persisted, so the refresh below reads the new balance.
  const runPurchase = useCallback(async (pack: CoinPack) => {
    playUiSound(synth, "confirm");
    setStoreBusy(true);
    setTransferNotice({ tone: "info", text: "OPENING THE STORE" });
    const result = await buyCoinPack(pack);
    setStoreBusy(false);
    if (result.ok) {
      playUiSound(synth, "start");
      setTransferNotice({
        tone: "info",
        text: `${pack.amount} COINS BANKED - ${formatCompact(bankBalance())} UNDISTRIBUTED`,
      });
      setExportTick((t) => t + 1); // the DISTRIBUTE blurb re-reads the bank
    } else if (result.reason === "cancelled") {
      // The player changed their mind — that's fine, and it stays quiet.
      playUiSound(synth, "back");
      setTransferNotice(null);
    } else {
      playUiSound(synth, "back");
      setTransferNotice({
        tone: "error",
        text: "STORE UNAVAILABLE - TRY AGAIN LATER",
      });
    }
  }, []);

  // DISTRIBUTE → SEND: move the slider's amount from the bank onto the
  // chosen hero and report exactly what moved and what stayed.
  const runSend = useCallback((hero: Character, amount: number) => {
    const sent = sendCoins(hero.id, amount);
    if (sent <= 0) {
      playUiSound(synth, "back");
      return;
    }
    playUiSound(synth, "start");
    setTransferNotice({
      tone: "info",
      text: `SENT ${formatCompact(sent)} TO ${hero.name} - ${formatCompact(bankBalance())} UNDISTRIBUTED`,
    });
    setStoreAmount(0);
    setExportTick((t) => t + 1); // purse blurbs + bank readouts refresh
    // Nothing left to hand out: the amount screen would be a dead slider, so
    // step back to the store.
    if (bankBalance() <= 0) {
      setScreen("store");
      setCursor(COIN_PACKS.length);
    }
  }, []);

  const entries: MenuEntry[] = useMemo(() => {
    const backTo = (target: MenuScreen, at = 0): MenuEntry => ({
      label: "BACK",
      aria: "menu-back",
      action: () => {
        playUiSound(synth, "back");
        setScreen(target);
        setCursor(at);
      },
    });

    // The boolean SETTINGS rows that read as a straight ON/OFF share one shape:
    // a constant label plus a pixel switch (see MenuEntry.toggle). `audition`
    // fires a confirming cue after the flip (e.g. a haptic buzz for VIBRATION).
    type OnOffKey =
      | "autoFire"
      | "debug"
      | "autoLevelStats"
      | "storeForce"
      | "vibration"
      | "muted"
      | "xpFloat"
      | "healthBars"
      | "dialogue"
      | "cutscenes";
    const onOffRow = (
      key: OnOffKey,
      label: string,
      aria: string,
      blurb: string,
      audition?: (on: boolean) => void,
    ): MenuEntry => {
      const on = getSettings()[key] === "on";
      const set = (next: boolean) => {
        playUiSound(synth, "confirm");
        updateSettings({ [key]: next ? "on" : "off" } as Partial<GameSettings>);
        audition?.(next);
        setSettingsTick((t) => t + 1);
      };
      return {
        label,
        aria,
        blurb,
        toggle: { on, set },
        action: () => set(!on),
      };
    };

    // A 0–1 volume as a drag slider: the label carries the "%" readout, the
    // arrows nudge in 5% steps, and updateSettings applies the level live.
    const volumeRow = (
      key: "musicVolume" | "sfxVolume",
      label: string,
      aria: string,
      blurb: string,
    ): MenuEntry => {
      const vol = getSettings()[key];
      const setVol = (v: number) => {
        updateSettings({
          [key]: Math.round(Math.min(1, Math.max(0, v)) * 100) / 100,
        });
        setSettingsTick((t) => t + 1);
      };
      return {
        label: `${label} ${pct(vol)}`,
        aria,
        blurb,
        action: () => {},
        slider: {
          pos: vol,
          set: setVol,
          nudge: (dir: number) => setVol(getSettings()[key] + dir * 0.05),
        },
      };
    };

    if (screen === "main") {
      return [
        // Offered only when a run is parked in memory; sits at the top so it's
        // the default highlight when the player ducked out to the menu.
        ...(onResume
          ? [
              {
                label: "RESUME",
                aria: "resume",
                action: () => {
                  playUiSound(synth, "confirm");
                  onResume();
                },
              },
            ]
          : []),
        {
          // PLAY is a menu now, not a launch: it opens the NEW GAME / LOAD GAME
          // submenu (picking a hero was the old PLAY's job — the two paths make
          // that choice explicit).
          label: "PLAY",
          aria: "play",
          action: () => {
            playUiSound(synth, "confirm");
            setScreen("play");
            setCursor(0);
          },
        },
        {
          label: "HIGH SCORES",
          aria: "high-scores",
          action: () => {
            playUiSound(synth, "confirm");
            setScreen("scores");
            setCursor(0);
          },
        },
        {
          label: "ACHIEVEMENTS",
          aria: "achievements",
          action: () => {
            playUiSound(synth, "confirm");
            setScreen("achievements");
          },
        },
        {
          label: "SETTINGS",
          aria: "settings",
          action: () => {
            playUiSound(synth, "confirm");
            setScreen("settings");
            setCursor(0);
          },
        },
        {
          label: "HOW TO PLAY",
          aria: "how-to-play",
          action: () => {
            playUiSound(synth, "start");
            onHowToPlay();
          },
        },
        // The coin store — native app builds only (purchases need the
        // platform store). Deliberately unadorned: default color, no blurb,
        // last in the list. It just sits there.
        ...(storeOpen
          ? [
              {
                label: "STORE",
                aria: "store",
                action: () => {
                  playUiSound(synth, "confirm");
                  setTransferNotice(null);
                  setScreen("store");
                  setCursor(0);
                },
              },
            ]
          : []),
      ];
    }
    if (screen === "store") {
      // The COIN STORE: real-money coin packs that fund the AUTO PILOT (the
      // purse drains per simulated second — see src/game/autopilot.ts). A
      // tapped pack goes straight to the platform pay sheet (the OS confirms
      // the charge); the coins land in the UNDISTRIBUTED bank, and the
      // DISTRIBUTE row below hands them out. The platform's localized price
      // tag sits right-aligned like a settings value.
      const bank = bankBalance();
      return [
        ...COIN_PACKS.map((pack): MenuEntry => ({
          label: `${pack.amount} COINS`,
          aria: `store-${pack.sku}`,
          value: storePrices?.[pack.sku] ?? pack.price,
          action: () => {
            if (storeBusy) {
              playUiSound(synth, "back");
              return;
            }
            void runPurchase(pack);
          },
        })),
        {
          label: "DISTRIBUTE",
          aria: "store-distribute",
          blurb:
            bank > 0
              ? `${formatCompact(bank)} COINS UNDISTRIBUTED - SEND THEM TO YOUR HEROES`
              : "NOTHING UNDISTRIBUTED",
          locked: bank <= 0,
          action: () => {
            if (bank <= 0) {
              playUiSound(synth, "back");
              return;
            }
            playUiSound(synth, "confirm");
            setScreen("storehero");
            setCursor(0);
          },
        },
        // Land back on the STORE row — the last main-menu row.
        backTo("main", onResume ? 6 : 5),
      ];
    }
    if (screen === "storehero") {
      // DISTRIBUTE → choose which hero receives coins. Every living hero is
      // offered with their current purse; the fallen keep their graves
      // (coins can't help them).
      const living = roster.filter((c) => !c.dead);
      if (living.length === 0) {
        return [
          {
            label: "NO HEROES YET",
            aria: "store-hero-empty",
            blurb: "CREATE A HERO FROM PLAY - NEW GAME FIRST",
            locked: true,
            action: () => playUiSound(synth, "back"),
          },
          backTo("store", COIN_PACKS.length),
        ];
      }
      return [
        ...living.map((hero): MenuEntry => ({
          label: hero.name,
          aria: `store-hero-${hero.id}`,
          blurb: `PURSE ${formatCompact(characterPurse(hero))} COINS`,
          action: () => {
            playUiSound(synth, "confirm");
            setStoreHeroId(hero.id);
            setStoreAmount(0);
            setScreen("storesend");
            setCursor(0);
          },
        })),
        backTo("store", COIN_PACKS.length),
      ];
    }
    if (screen === "storesend") {
      // DISTRIBUTE → hero picked: a slider spans 0 → everything
      // undistributed in 1-million ticks (SEND_TICK), and SEND commits it.
      // The remainder simply stays banked for later.
      const bank = bankBalance();
      const living = roster.filter((c) => !c.dead);
      const hero = living.find((c) => c.id === storeHeroId);
      if (!hero || bank <= 0) {
        return [
          {
            label: "NOTHING TO DISTRIBUTE",
            aria: "store-send-empty",
            locked: true,
            action: () => playUiSound(synth, "back"),
          },
          backTo("store", COIN_PACKS.length),
        ];
      }
      const heroAt = living.findIndex((c) => c.id === hero.id);
      const amount = Math.min(storeAmount, bank);
      const setAmount = (next: number) => {
        const ticked = Math.round(next / SEND_TICK) * SEND_TICK;
        setStoreAmount(Math.min(Math.max(0, ticked), bank));
      };
      return [
        {
          label: `SEND ${formatCompact(amount)}`,
          aria: "store-send-amount",
          blurb: `TO ${hero.name} - PURSE ${formatCompact(characterPurse(hero))}`,
          // The row itself does nothing on confirm; the slider owns the value.
          action: () => {},
          slider: {
            pos: amount / bank,
            set: (pos: number) => setAmount(pos * bank),
            nudge: (dir: number) => setAmount(amount + dir * SEND_TICK),
          },
        },
        {
          label: "SEND",
          aria: "store-send-confirm",
          locked: amount <= 0,
          blurb:
            amount > 0
              ? `${formatCompact(bank - amount)} WILL STAY UNDISTRIBUTED`
              : "SLIDE TO PICK AN AMOUNT",
          action: () => {
            if (amount <= 0) {
              playUiSound(synth, "back");
              return;
            }
            runSend(hero, amount);
          },
        },
        backTo("storehero", heroAt),
      ];
    }
    if (screen === "play") {
      // The PLAY submenu: NEW GAME mints a fresh hero, LOAD GAME picks (or
      // removes) an existing one. Both open the roster; once a hero is chosen a
      // fresh one drops into the difficulty ladder while one mid-campaign
      // resumes at the start of its current level (see App's onNewGame/onLoadGame).
      // LOAD GAME dims out when there is no saved hero to load.
      const hasRoster = roster.length > 0;
      return [
        {
          label: "NEW GAME",
          aria: "new-game",
          blurb: "CREATE A NEW HERO",
          action: () => {
            playUiSound(synth, "confirm");
            onNewGame();
          },
        },
        {
          label: "LOAD GAME",
          aria: "load-game",
          // Greyed and inert with an empty roster — there is no saved hero to
          // load, so mint one via NEW GAME first (mirrors a locked level row).
          color: hasRoster ? undefined : "#5a6068",
          locked: !hasRoster,
          blurb: hasRoster
            ? "PLAY ON WITH A SAVED HERO - OR RETIRE ONE"
            : "NO SAVED HEROES YET - START A NEW GAME",
          action: () => {
            if (!hasRoster) {
              playUiSound(synth, "back");
              return;
            }
            playUiSound(synth, "confirm");
            onLoadGame();
          },
        },
        // Land back on the PLAY row in the main menu (one lower when RESUME
        // tops the menu).
        backTo("main", onResume ? 1 : 0),
      ];
    }
    if (screen === "difficulty" && character) {
      // Warp mode (opened from the developer menu's SELECT LEVEL) ignores the
      // unlock ladder: every difficulty is selectable so you can warp into any
      // mission at any difficulty. Picking one hands off to the level picker
      // (still in warp mode); backing out returns to the developer menu.
      const warpBack: MenuEntry = {
        label: "BACK",
        aria: "menu-back",
        action: () => {
          playUiSound(synth, "back");
          setWarp(false);
          setBotView(false);
          setBotLevel(null);
          setScreen("developer");
          setCursor(0);
        },
      };
      return [
        ...DIFFICULTY_ORDER.map((id) => {
          const def = difficultyDef(id);
          // The three starting lanes (easy/medium/hard) are parallel and always
          // open — a player picks one. The gated rungs open on a prereq beaten:
          // NIGHTMARE on any starting lane, JESUS on NIGHTMARE (see
          // `DIFFICULTY_UNLOCK_PREREQS`). Locked rungs show greyed out. Warp mode
          // opens every rung.
          const unlocked = warp || isDifficultyUnlocked(character, id);
          const beaten = isDifficultyBeaten(character, id);
          const lockedBlurb =
            id === "jesus"
              ? "LOCKED - BEAT NIGHTMARE"
              : "LOCKED - BEAT A STARTING DIFFICULTY";
          return {
            label: def.name,
            aria: `difficulty-${id}`,
            color: unlocked ? def.color : "#5a6068",
            locked: !unlocked,
            blurb: warp
              ? "WARP - PICK A MISSION"
              : !unlocked
                ? lockedBlurb
                : beaten
                  ? "CLEARED - CHOOSE ANY MISSION"
                  : def.tagline,
            action: () => {
              if (!unlocked) {
                playUiSound(synth, "back");
                return;
              }
              setDifficulty(id);
              // Warp: pick the difficulty, then hand off to the level picker
              // (still in warp mode) — never auto-start the campaign.
              if (warp) {
                playUiSound(synth, "confirm");
                setScreen("levels");
                setCursor(0);
                return;
              }
              // Until this difficulty is beaten the level picker stays locked:
              // the hero is walked straight through the campaign from the next
              // unbeaten level. Once beaten, the picker opens for free replays.
              if (!beaten) {
                playUiSound(synth, "start");
                onStart(id, firstUnclearedLevel(character, id));
                return;
              }
              playUiSound(synth, "confirm");
              setScreen("levels");
              // Open on the furthest level still reachable at this difficulty.
              const furthest = LEVEL_ORDER.reduce(
                (best, levelId, i) =>
                  isLevelUnlocked(character, levelId, id) ? i : best,
                0,
              );
              setCursor(furthest);
            },
          };
        }),
        // Re-home on NEW GAME — one lower when CONTINUE tops the menu.
        warp ? warpBack : backTo("main", onResume ? 1 : 0),
      ];
    }
    if (screen === "levels" && character) {
      // Warp mode (opened from the developer menu's SELECT LEVEL) ignores the
      // unlock gate: every level is reachable so you can try any of them, and
      // picking one drops straight into play with no intro. Backing out returns
      // to the warp difficulty picker it was launched from (still in warp mode).
      const warpBack: MenuEntry = {
        label: "BACK",
        aria: "menu-back",
        action: () => {
          playUiSound(synth, "back");
          setScreen("difficulty");
          setCursor(DIFFICULTY_ORDER.indexOf(difficulty));
        },
      };
      return [
        ...LEVEL_ORDER.map((id, i) => {
          const def = levelDef(id);
          const unlocked = warp || isLevelUnlocked(character, id, difficulty);
          const cleared = hasClearedLevel(character, id, difficulty);
          const blurb = botView
            ? "BOT VIEW - WATCH THE BOT PLAY IT"
            : warp
              ? "WARP - DROPS STRAIGHT IN"
              : !unlocked
                ? "LOCKED - CLEAR THE PREVIOUS LEVEL"
                : cleared
                  ? "CLEARED - REPLAY"
                  : "NEW";
          return {
            label: `${i + 1}. ${def.name}`,
            aria: `level-${id}`,
            color: unlocked ? "#7ef0c8" : "#5a6068",
            locked: !unlocked,
            blurb,
            action: () => {
              if (!unlocked) {
                playUiSound(synth, "back");
                return;
              }
              // BOT VIEW picks the fast-forward speed next (the `botspeed`
              // step); a normal/warp pick drops straight in.
              if (botView) {
                playUiSound(synth, "confirm");
                setBotLevel(id);
                setScreen("botspeed");
                setCursor(0);
                return;
              }
              playUiSound(synth, "start");
              onStart(
                difficulty,
                id,
                warp ? { skipIntro: true, botView } : undefined,
              );
            },
          };
        }),
        // The secret venues (the bunker): reachable in play only through
        // their travel gates, so the campaign picker never lists them — the
        // dev warp does, as extra unnumbered rows.
        ...(warp
          ? SECRET_LEVEL_ORDER.map((id) => ({
              label: `?. ${levelDef(id).name}`,
              aria: `level-${id}`,
              color: "#c9a2ff",
              blurb: "SECRET - WARP DROPS STRAIGHT IN",
              action: () => {
                if (botView) {
                  playUiSound(synth, "confirm");
                  setBotLevel(id);
                  setScreen("botspeed");
                  setCursor(0);
                  return;
                }
                playUiSound(synth, "start");
                onStart(difficulty, id, { skipIntro: true, botView });
              },
            }))
          : []),
        warp
          ? warpBack
          : backTo("difficulty", DIFFICULTY_ORDER.indexOf(difficulty)),
      ];
    }
    if (screen === "botspeed" && character) {
      // The GAME SPEED step of BOT VIEW, reached AFTER a difficulty and level
      // are chosen. A developer-only fast-forward: it runs more fixed game-loop
      // steps per frame, so the autopilot blitzes the level in a fraction of the
      // wall-clock time (deterministic — the step size never changes). The pick
      // persists in the settings and the game loop reads it (GameScreen
      // `simSpeed`); START launches the stashed level under the bot.
      const s = getSettings();
      const target = botLevel;
      const spec = botViewSpec(s.botViewSpec);
      return [
        {
          label: "GAME SPEED",
          value: `${s.gameSpeed}×`,
          aria: "botspeed-speed",
          blurb: "FAST-FORWARD THE BOT RUN - MORE STEPS PER FRAME",
          action: () => {
            playUiSound(synth, "confirm");
            const i = GAME_SPEEDS.indexOf(s.gameSpeed);
            const next = GAME_SPEEDS[(i + 1) % GAME_SPEEDS.length];
            updateSettings({ gameSpeed: next });
            setSettingsTick((t) => t + 1);
          },
        },
        {
          // Which generated hero the autopilot showcases: the BOT SPEC decides
          // the arrival loadout's weapon lane, the stat picks, and the posture
          // (how close it fights) together (see botViewSpecs.ts).
          label: "BOT SPEC",
          value: spec.label,
          aria: "botspeed-spec",
          blurb: spec.blurb,
          action: () => {
            playUiSound(synth, "confirm");
            const i = BOT_VIEW_SPECS.findIndex((sp) => sp.id === spec.id);
            const next = BOT_VIEW_SPECS[(i + 1) % BOT_VIEW_SPECS.length]!;
            updateSettings({ botViewSpec: next.id });
            setSettingsTick((t) => t + 1);
          },
        },
        {
          label: "START",
          aria: "botspeed-start",
          color: "#7ef0c8",
          blurb: target
            ? `WATCH THE ${spec.label} BOT PLAY ${levelDef(target).name} AT ${s.gameSpeed}×`
            : "WATCH THE BOT PLAY",
          action: () => {
            if (!target) return;
            playUiSound(synth, "start");
            onStart(difficulty, target, { skipIntro: true, botView: true });
          },
        },
        {
          label: "BACK",
          aria: "menu-back",
          action: () => {
            playUiSound(synth, "back");
            setBotLevel(null);
            setScreen("levels");
            setCursor(0);
          },
        },
      ];
    }
    if (screen === "settings") {
      const s = getSettings();
      return [
        {
          label: "CONTROLS",
          aria: "settings-controls",
          blurb: "STEERING AND ITEM USE",
          action: () => {
            playUiSound(synth, "confirm");
            setScreen("controls");
            setCursor(0);
          },
        },
        {
          label: "DISPLAY",
          aria: "settings-display",
          blurb: "ON-SCREEN POPUPS AND EFFECTS",
          action: () => {
            playUiSound(synth, "confirm");
            setScreen("display");
            setCursor(0);
          },
        },
        // Music and sound-fx volume live together in their own SOUND submenu,
        // keeping the SETTINGS list short.
        {
          label: "SOUND",
          aria: "settings-sound",
          blurb: "MUSIC AND SOUND FX VOLUME",
          action: () => {
            playUiSound(synth, "confirm");
            setScreen("sound");
            setCursor(0);
          },
        },
        // Character transfer lives in its own DATA submenu (EXPORT / IMPORT),
        // keeping the SETTINGS list short. It sits with the rest of the
        // device-level configuration.
        {
          label: "DATA",
          aria: "settings-data",
          blurb: "EXPORT AND IMPORT CHARACTERS",
          action: () => {
            playUiSound(synth, "confirm");
            setScreen("data");
            setCursor(0);
          },
        },
        // The DEVELOPER row is hidden until the title moon's secret long-press
        // unlocks it (see startMoonHold); once found it stays put across
        // launches (persisted via `developerUnlocked`).
        ...(s.developerUnlocked
          ? [
              {
                label: "DEVELOPER",
                aria: "settings-developer",
                blurb: "LEVEL SELECT AND DEBUG MODE",
                action: () => {
                  playUiSound(synth, "confirm");
                  setScreen("developer");
                  setCursor(0);
                },
              },
            ]
          : []),
        backTo("main", onResume ? 4 : 3),
      ];
    }
    if (screen === "developer") {
      return [
        {
          label: "SELECT LEVEL",
          aria: "developer-select-level",
          blurb: "WARP TO ANY DIFFICULTY & MISSION - SKIPS THE INTRO",
          action: () => {
            playUiSound(synth, "confirm");
            setWarp(true);
            setScreen("difficulty");
            setCursor(0);
          },
        },
        {
          label: "BOT VIEW",
          aria: "developer-bot-view",
          blurb: "WATCH THE AUTOPILOT PLAY ANY LEVEL WITH A REAL HERO",
          action: () => {
            playUiSound(synth, "confirm");
            setWarp(true);
            setBotView(true);
            setScreen("difficulty");
            setCursor(0);
          },
        },
        {
          label: "VIEW ARSENAL",
          aria: "developer-arsenal",
          blurb: "EVERY UNIQUE & LEGENDARY ITEM, BY ITEM LEVEL",
          action: () => {
            playUiSound(synth, "confirm");
            setScreen("arsenal");
            setCursor(0);
          },
        },
        {
          label: "BALANCE",
          aria: "developer-balance",
          blurb: "TUNE XP, MOB STRENGTH AND LOOT MULTIPLIERS",
          action: () => {
            playUiSound(synth, "confirm");
            setScreen("balance");
            setCursor(0);
          },
        },
        {
          label: "SEED CHARACTERS",
          aria: "developer-seed",
          blurb: "MINT MELEE / RANGED / MAGIC HEROES AT THE HIGH TIERS",
          action: () => {
            playUiSound(synth, "confirm");
            setTransferNotice(null);
            setScreen("seed");
            setCursor(0);
          },
        },
        // A war chest for probing the AUTO PILOT economy: pours 10B coins
        // into every character's banked purse (a fresh hero has no bank yet —
        // the purse rides the loadout banked on a level clear).
        {
          label: "GRANT 10B COINS",
          aria: "developer-grant-coins",
          blurb: "POUR 10 BILLION COINS INTO EVERY BANKED HERO",
          action: () => {
            playUiSound(synth, "confirm");
            const funded = grantCoins(10_000_000_000);
            setTransferNotice(
              funded > 0
                ? {
                    tone: "info",
                    text: `FUNDED ${funded} HERO${funded === 1 ? "" : "ES"}`,
                  }
                : {
                    tone: "error",
                    text: "NO BANKED HEROES - FINISH A LEVEL FIRST",
                  },
            );
          },
        },
        onOffRow(
          "debug",
          "DEBUG MODE",
          "developer-debug",
          "SHOW THE FPS METER DURING RUNS",
        ),
        onOffRow(
          "autoLevelStats",
          "AUTO LEVEL STATS",
          "developer-auto-level-stats",
          "FREE BASE STAT GROWTH EACH LEVEL (MOBS SCALE TO MATCH)",
        ),
        onOffRow(
          "storeForce",
          "FORCE STORE",
          "developer-force-store",
          "SHOW THE COIN STORE IN THIS BUILD - PACKS ARE FREE",
        ),
        // The overkill fling strength: a drag track from 0× (bodies drop where
        // they stand) through 1× (shipped feel) up to KNOCKBACK_MAX× (mobs
        // rocket clear off the screen). Read live by GameScreen's launch.
        ((): MenuEntry => {
          const kb = getSettings().knockback;
          const setKb = (mult: number) => {
            updateSettings({ knockback: mult });
            setSettingsTick((t) => t + 1);
          };
          return {
            label: `KNOCKBACK ${formatBalanceMult(kb)}`,
            aria: "developer-knockback",
            blurb: "HOW FAR AN OVERKILL FLINGS THE MOB FLYING",
            action: () => {},
            slider: {
              pos: kb / KNOCKBACK_MAX,
              set: (pos: number) => setKb(pos * KNOCKBACK_MAX),
              nudge: (dir: number) =>
                setKb(getSettings().knockback + dir * 0.1),
            },
          };
        })(),
        // Land back on the DEVELOPER row in SETTINGS. It sits just above BACK,
        // after CONTROLS / DISPLAY / SOUND / DATA.
        backTo("settings", 4),
      ];
    }
    if (screen === "balance") {
      // The BALANCE subpage: one row per runtime multiplier (see
      // balanceKnobs.ts). Each row is an exponential slider — drag it, tap the
      // track, or steer it with ArrowLeft/ArrowRight — spanning 0× (system off)
      // to 100× the shipped tuning, where 1× is baseline. The engine applies
      // the value via settings.ts.
      const s = getSettings();
      const setKnob = (key: keyof typeof s.balance, value: number) => {
        updateSettings({ balance: { ...getSettings().balance, [key]: value } });
        setSettingsTick((t) => t + 1);
      };
      return [
        ...BALANCE_KNOBS.map(({ key, label, blurb }) => ({
          label: `${label} ${formatBalanceMult(s.balance[key])}`,
          aria: `balance-${key}`,
          blurb,
          // The row itself does nothing on confirm; the slider owns the value.
          action: () => {},
          slider: {
            pos: balanceToSlider(s.balance[key]),
            set: (pos: number) => setKnob(key, balanceFromSlider(pos)),
            nudge: (dir: number) =>
              setKnob(key, nudgeBalance(getSettings().balance[key], dir)),
          },
        })),
        {
          label: "RESET ALL",
          aria: "balance-reset",
          blurb: "EVERY KNOB BACK TO 1× - THE SHIPPED TUNING",
          action: () => {
            playUiSound(synth, "back");
            updateSettings({ balance: { ...BALANCE_TUNING_DEFAULTS } });
            setSettingsTick((t) => t + 1);
          },
        },
        // Land back on the BALANCE row in DEVELOPER (after SELECT LEVEL and
        // VIEW ARSENAL).
        backTo("developer", 2),
      ];
    }
    if (screen === "seed") {
      // Mint ready-to-play specimens into the roster (see seedCharacters.ts):
      // SEED ALL drops the whole melee/ranged/magic × four-tier matrix; each
      // tier row drops just that tier's three lane builds. The heroes appear
      // under PLAY → LOAD GAME.
      return [
        {
          label: "SEED ALL",
          aria: "seed-all",
          blurb: "EVERY BUILD AT EVERY TIER - 12 HEROES",
          action: () => runSeed(null),
        },
        ...SEED_TIERS.map((tier) => ({
          label: `${tier.label} (LV ${tier.level})`,
          aria: `seed-${tier.id}`,
          blurb: "MELEE, RANGED AND MAGIC AT THIS TIER",
          action: () => runSeed(tier),
        })),
        // Land back on the SEED CHARACTERS row in DEVELOPER (after SELECT
        // LEVEL, VIEW ARSENAL and BALANCE).
        backTo("developer", 3),
      ];
    }
    if (screen === "data") {
      // Character transfer: EXPORT opens a picker over the WHOLE roster (tick
      // one or many, not just the current game); IMPORT loads any exported hero
      // back via a file picker.
      return [
        {
          label: "EXPORT CHARACTER",
          aria: "data-export-character",
          blurb: "SAVE ONE OR MORE HEROES TO FILES",
          action: () => {
            playUiSound(synth, "confirm");
            setExportTick((t) => t + 1); // refresh the roster snapshot
            setExportPicks(new Set());
            setTransferNotice(null);
            setScreen("export");
            setCursor(0);
          },
        },
        {
          label: "IMPORT CHARACTER",
          aria: "data-import-character",
          blurb: "LOAD A HERO EXPORTED FROM ANOTHER DEVICE",
          action: pickImport,
        },
        // Land back on the DATA row in SETTINGS (after CONTROLS / DISPLAY /
        // SOUND).
        backTo("settings", 3),
      ];
    }
    if (screen === "export") {
      // The EXPORT CHARACTER picker: a ticked list of the WHOLE roster (not the
      // active hero), then one download per ticked hero. A fallen hardcore hero
      // still exports — a backup is a backup.
      if (roster.length === 0) {
        return [
          {
            label: "NO HEROES YET",
            aria: "export-empty",
            blurb: "CREATE A HERO FROM PLAY - NEW GAME FIRST",
            locked: true,
            action: () => playUiSound(synth, "back"),
          },
          backTo("data", 0),
        ];
      }
      const heroRows: MenuEntry[] = roster.map((hero) => {
        const level = hero.loadout?.level ?? 1;
        const on = exportPicks.has(hero.id);
        const status = hero.dead
          ? "FALLEN"
          : hero.hardcore
            ? "HARDCORE"
            : "SOFTCORE";
        return {
          label: hero.name,
          aria: `export-hero-${hero.id}`,
          // Per-hero data, not help — stays a second line in the row (the
          // checkbox centres against both lines), rather than the bottom help
          // line where a settings blurb goes.
          subtitle: `LV ${level} - ${status}`,
          check: {
            checked: on,
            set: (next: boolean) => toggleExportPick(hero.id, next),
          },
          action: () => toggleExportPick(hero.id, !on),
        };
      });
      const count = roster.filter((c) => exportPicks.has(c.id)).length;
      const canExport = count > 0;
      return [
        ...heroRows,
        {
          label: canExport ? `EXPORT (${count})` : "EXPORT",
          aria: "export-confirm",
          // Greyed and inert until at least one hero is ticked (mirrors a
          // locked level row): choosing it just buzzes.
          color: canExport ? "#7ef0c8" : "#5a6068",
          locked: !canExport,
          blurb: canExport
            ? "DOWNLOAD THE TICKED HEROES AS SIGNED FILES"
            : "TICK A HERO ABOVE TO EXPORT",
          action: () => {
            if (!canExport) {
              playUiSound(synth, "back");
              return;
            }
            void exportPicked();
          },
        },
        // Land back on the EXPORT CHARACTER row in DATA (the first row).
        backTo("data", 0),
      ];
    }
    if (screen === "sound") {
      // Both volumes are drag sliders now (see volumeRow). The theme follows
      // the music level live; the SFX level is auditioned by the "move" cue the
      // arrows already play, and by every other sound the slider doesn't mute.
      // MUTE sits on top as a plain ON/OFF switch: it silences everything while
      // the sliders keep their values, so unmuting restores the exact mix.
      return [
        onOffRow(
          "muted",
          "MUTE",
          "sound-mute",
          "SILENCE ALL — SLIDERS KEEP THEIR LEVELS",
          // The row's own confirm cue plays before the flip, so it's swallowed
          // when muting; on UN-mute, sound out an extra cue after the flip so
          // the player hears audio return at their kept levels.
          (muted) => {
            if (!muted) playUiSound(synth, "confirm");
          },
        ),
        volumeRow(
          "musicVolume",
          "MUSIC",
          "sound-music-volume",
          "THE THEME FOLLOWS ALONG",
        ),
        volumeRow(
          "sfxVolume",
          "SOUND FX",
          "sound-sfx-volume",
          "BLASTERS, GHOSTS, PICKUPS",
        ),
        // Land back on the SOUND row in SETTINGS (after CONTROLS / DISPLAY).
        backTo("settings", 2),
      ];
    }
    if (screen === "controls") {
      const s = getSettings();
      return [
        // The mouse rows are desktop-only, like KEY BINDINGS below: touch
        // always steers by holding and dragging, so there's no mouse mode
        // (or keyboard) to configure there (see hasFinePointer). AIM & SHOOT
        // adds the AUTO-FIRE row and LOCKS the KEYS row at WASD MOVE — the
        // keyboard always walks in that mode, and the greyed row shows that
        // rather than hiding where the movement went — so the list is one
        // row longer there (KEY BINDINGS' back target accounts for it).
        ...(hasFinePointer
          ? [
              {
                label: "MOUSE",
                value: s.steering === "hover" ? "FOLLOW CURSOR" : "AIM & SHOOT",
                aria: "controls-steering",
                blurb:
                  s.steering === "hover"
                    ? "THE CURSOR LEADS - CLICK USES AN ITEM"
                    : "WASD WALKS - THE POINTER AIMS - CLICK SHOOTS",
                action: () => {
                  playUiSound(synth, "confirm");
                  updateSettings({
                    steering: s.steering === "hover" ? "aim" : "hover",
                  });
                  setSettingsTick((t) => t + 1);
                },
              },
              ...(s.steering === "aim"
                ? [
                    onOffRow(
                      "autoFire",
                      "AUTO-FIRE",
                      "controls-auto-fire",
                      "SHOOT ON SIGHT - OFF FIRES ONLY WHILE YOU CLICK",
                    ),
                    {
                      // Locked at WASD MOVE: AIM & SHOOT always walks by
                      // keyboard, and the greyed row SHOWS that instead of
                      // hiding where the movement went. Choosing it buzzes,
                      // like a locked level row.
                      label: "KEYS",
                      value: "WASD MOVE",
                      aria: "controls-keyboard-move",
                      color: "#5a6068",
                      locked: true,
                      blurb: "AIM & SHOOT ALWAYS WALKS BY KEYBOARD",
                      action: () => {
                        playUiSound(synth, "back");
                      },
                    },
                  ]
                : [
                    {
                      label: "KEYS",
                      value:
                        s.keyboardMove === "on" ? "WASD MOVE" : "MOUSE ONLY",
                      aria: "controls-keyboard-move",
                      blurb:
                        s.keyboardMove === "on"
                          ? "STEER WITH THE KEYBOARD - REBIND IN KEY BINDINGS"
                          : "STEERING STAYS ON THE MOUSE",
                      action: () => {
                        playUiSound(synth, "confirm");
                        updateSettings({
                          keyboardMove: s.keyboardMove === "on" ? "off" : "on",
                        });
                        setSettingsTick((t) => t + 1);
                      },
                    },
                  ]),
            ]
          : []),
        {
          label: "POWERUPS",
          value: s.itemUse === "auto" ? "USE ON PICKUP" : "USE MANUALLY",
          aria: "controls-item-use",
          blurb:
            s.itemUse === "auto"
              ? "POWERS FIRE THE MOMENT YOU GRAB THEM"
              : "TAP A POWERUP SLOT / CLICK / E / 1-3 SPENDS ONE",
          action: () => {
            playUiSound(synth, "confirm");
            updateSettings({
              itemUse: s.itemUse === "auto" ? "manual" : "auto",
            });
            setSettingsTick((t) => t + 1);
          },
        },
        {
          label: "GEAR",
          value: s.autoEquip === "on" ? "EQUIP ON PICKUP" : "KEEP IN BAG",
          aria: "controls-auto-equip",
          blurb:
            s.autoEquip === "on"
              ? "STRONGER FINDS ARE WORN THE MOMENT YOU GRAB THEM"
              : "FINDS GO TO THE BAG - EQUIP THEM YOURSELF",
          action: () => {
            playUiSound(synth, "confirm");
            updateSettings({
              autoEquip: s.autoEquip === "on" ? "off" : "on",
            });
            setSettingsTick((t) => t + 1);
          },
        },
        {
          label: "POWERUPS",
          value: s.powerupSide === "right" ? "LOWER RIGHT" : "LOWER LEFT",
          aria: "controls-powerup-side",
          blurb: "WHICH CORNER THE BIG POWERUP SLOTS SIT IN",
          action: () => {
            playUiSound(synth, "confirm");
            updateSettings({
              powerupSide: s.powerupSide === "right" ? "left" : "right",
            });
            setSettingsTick((t) => t + 1);
          },
        },
        // KEY BINDINGS is desktop-only — there's no keyboard to rebind on a
        // touch phone, so the row is hidden there (see hasFinePointer).
        ...(hasFinePointer
          ? [
              {
                label: "KEY BINDINGS",
                aria: "controls-keybindings",
                blurb: "REBIND EVERY DESKTOP KEY - MOVEMENT, ACTIONS, THE DOCK",
                action: () => {
                  playUiSound(synth, "confirm");
                  setScreen("keybindings");
                  setCursor(0);
                },
              },
            ]
          : []),
        // VIBRATION shows only where a buzz can land (see canBuzz), so it never
        // reads as a dead switch on desktop or iOS. Where it shows, it always
        // can buzz — so the row drops the old "(NO IOS)" caveat.
        ...(canBuzz
          ? [
              onOffRow(
                "vibration",
                "VIBRATION",
                "controls-vibration",
                "BUZZ ON HITS, DEATH, MENUS & DIALOGUE - HARDER BLOWS HIT HARDER",
                // Audition the new state — a firm tap confirms it's live.
                (on) => on && haptics.vibrate(28),
              ),
            ]
          : []),
        backTo("settings", 0),
      ];
    }
    if (screen === "keybindings") {
      // Quake-style rebind list: one row per action, its label at the left and
      // the bound key's name far right. Choosing a row arms capture — the next
      // key or mouse button pressed becomes the bind (see the capture handler).
      const binds = getSettings().keybindings;
      return [
        ...KEYBIND_ROWS.map(({ action, label, blurb }) => ({
          label,
          aria: `keybind-${action}`,
          blurb,
          binding: { code: binds[action], capturing: captureBind === action },
          action: () => {
            playUiSound(synth, "confirm");
            setCaptureBind(action);
            setSettingsTick((t) => t + 1);
          },
        })),
        {
          label: "RESET TO DEFAULTS",
          aria: "keybind-reset",
          blurb: "RESTORE THE SHIPPED WASD + ACTION KEY SCHEME",
          action: () => {
            playUiSound(synth, "confirm");
            setCaptureBind(null);
            updateSettings({ keybindings: { ...DEFAULT_KEYBINDINGS } });
            setSettingsTick((t) => t + 1);
          },
        },
        // Land back on the KEY BINDINGS row in CONTROLS (after MOUSE /
        // [AUTO-FIRE /] KEYS / POWERUPS / GEAR / POWERUP SIDE — this screen
        // is desktop-only, so the mouse rows are always shown, and AIM &
        // SHOOT's extra AUTO-FIRE row shifts the index by one).
        backTo("controls", getSettings().steering === "aim" ? 6 : 5),
      ];
    }
    if (screen === "display") {
      return [
        onOffRow(
          "xpFloat",
          "XP ON KILL",
          "display-xp-float",
          "FLOAT A BLUE +N XP OFF EACH KILL",
        ),
        onOffRow(
          "healthBars",
          "HEALTH BARS",
          "display-health-bars",
          "SHOW A TINY HP BAR OVER EVERY WOUNDED MOB",
        ),
        onOffRow(
          "dialogue",
          "DIALOGUE",
          "display-dialogue",
          "PLAY IN-WORLD TALK: ARRIVALS, THOUGHTS, LORE",
        ),
        onOffRow(
          "cutscenes",
          "CUTSCENES",
          "display-cutscenes",
          "PLAY THE PRELUDE SCENES THAT OPEN A LEVEL",
        ),
        // Land back on the DISPLAY row in SETTINGS (index 1, after CONTROLS).
        backTo("settings", 1),
      ];
    }
    return [backTo("main", onResume ? 5 : 4)];
    // `settingsTick` is an intentional invalidation key: the menu reads the
    // non-React settings store through getSettings(), so bumping the tick after
    // updateSettings is what rebuilds this list with the fresh values. eslint
    // can't see that dependency through getSettings(), so it wrongly flags the
    // tick as unnecessary — keep it and silence the false positive.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    screen,
    character,
    onStart,
    onResume,
    onNewGame,
    onLoadGame,
    settingsTick,
    captureBind,
    difficulty,
    warp,
    botView,
    hasFinePointer,
    canBuzz,
    roster,
    exportPicks,
    toggleExportPick,
    exportPicked,
    pickImport,
    runSeed,
    storeOpen,
    storeHeroId,
    storeAmount,
    storePrices,
    storeBusy,
    runPurchase,
    runSend,
  ]);

  // The HIGH SCORES board is steered on two axes rather than a cursor list:
  // left/right walks the difficulty ladder, up/down flips the ranking. Both
  // are driven from arrows (below) and from swipes (the pointer handlers).
  const stepScoreDifficulty = useCallback((delta: number) => {
    unlockAudio();
    playUiSound(synth, "move");
    setScoreDetail(null);
    setScoreDifficulty((d) => {
      const n = DIFFICULTY_ORDER.length;
      const i = (DIFFICULTY_ORDER.indexOf(d) + delta + n) % n;
      return DIFFICULTY_ORDER[i] as Difficulty;
    });
  }, []);
  const stepScoreMetric = useCallback((delta: number) => {
    unlockAudio();
    playUiSound(synth, "move");
    setScoreDetail(null);
    setScoreMetric((m) => {
      const n = SCORE_METRICS.length;
      const i = (SCORE_METRICS.findIndex((x) => x.id === m) + delta + n) % n;
      return (SCORE_METRICS[i] as { id: ScoreMetric }).id;
    });
  }, []);

  // Doom menus live on the keyboard: arrows move, Enter/Space picks,
  // Escape backs out. The scores board reinterprets the arrows as its two
  // axes (see above) instead of a cursor.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      // A KEY BINDINGS rebind is listening: the next key IS the new bind, stored
      // by physical `code` so WASD stays WASD across layouts. Escape cancels
      // (it's the reserved menu-back key, never bindable); anything else is
      // taken and stolen off whatever action already held it (withBinding).
      if (captureBind) {
        event.preventDefault();
        if (event.key !== "Escape") {
          updateSettings({
            keybindings: withBinding(
              getSettings().keybindings,
              captureBind,
              event.code,
            ),
          });
          playUiSound(synth, "confirm");
        } else {
          playUiSound(synth, "back");
        }
        setCaptureBind(null);
        setSettingsTick((t) => t + 1);
        return;
      }
      // The arsenal viewer and the achievements browser run their own list
      // navigation; stay out of their way so the arrows don't also drive the
      // hidden menu underneath.
      if (screen === "arsenal" || screen === "achievements") return;
      if (screen === "scores") {
        // While a detail card is open the whole board's navigation collapses to
        // "close it" — any steer/confirm/back key returns to the ranked list.
        if (scoreDetail) {
          if (
            event.key === "Escape" ||
            event.key === "Enter" ||
            event.key === " " ||
            event.key.startsWith("Arrow")
          ) {
            event.preventDefault();
            unlockAudio();
            playUiSound(synth, "back");
            setScoreDetail(null);
          }
          return;
        }
        if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
          event.preventDefault();
          stepScoreDifficulty(event.key === "ArrowRight" ? 1 : -1);
        } else if (event.key === "ArrowUp" || event.key === "ArrowDown") {
          event.preventDefault();
          stepScoreMetric(event.key === "ArrowDown" ? 1 : -1);
        } else if (
          event.key === "Escape" ||
          event.key === "Enter" ||
          event.key === " "
        ) {
          event.preventDefault();
          unlockAudio();
          playUiSound(synth, "back");
          setScreen("main");
          setCursor(onResume ? 2 : 1);
        }
        return;
      }
      const row = entries[cursor];
      const horizontal =
        event.key === "ArrowLeft" || event.key === "ArrowRight";
      if (row?.slider && horizontal) {
        // On a slider row (BALANCE knobs, SOUND volumes) the horizontal arrows
        // steer the track instead of idling — up/down still walk the row list.
        event.preventDefault();
        unlockAudio();
        playUiSound(synth, "move");
        row.slider.nudge(event.key === "ArrowRight" ? 1 : -1);
      } else if (row?.toggle && horizontal) {
        // On an ON/OFF row the arrows set the switch directly (→ on, ← off);
        // `set` plays its own confirm cue.
        event.preventDefault();
        unlockAudio();
        row.toggle.set(event.key === "ArrowRight");
      } else if (row?.check && horizontal) {
        // On a multi-select row the arrows set the tick-box directly
        // (→ checked, ← empty); `set` plays its own confirm cue.
        event.preventDefault();
        unlockAudio();
        row.check.set(event.key === "ArrowRight");
      } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        unlockAudio();
        playUiSound(synth, "move");
        const delta = event.key === "ArrowDown" ? 1 : -1;
        setCursor((c) => (c + delta + entries.length) % entries.length);
      } else if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        unlockAudio();
        if (entries[cursor]) playMenuHaptic();
        entries[cursor]?.action();
      } else if (event.key === "Escape" && screen !== "main") {
        unlockAudio();
        playUiSound(synth, "back");
        // The warp picker walks developer → difficulty → levels; Escape backs
        // out one rung at a time, leaving warp mode only once it returns to the
        // developer menu (from the warp difficulty picker).
        if (screen === "difficulty" && warp) {
          setWarp(false);
          setBotView(false);
          setBotLevel(null);
        }
        const back: Record<string, MenuScreen> = {
          play: "main",
          controls: "settings",
          keybindings: "controls",
          display: "settings",
          sound: "settings",
          data: "settings",
          export: "data",
          developer: "settings",
          balance: "developer",
          difficulty: warp ? "developer" : "main",
          levels: "difficulty",
          botspeed: "levels",
          store: "main",
          storehero: "store",
          storesend: "storehero",
        };
        setScreen(back[screen] ?? "main");
        setCursor(0);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    entries,
    cursor,
    screen,
    scoreDetail,
    captureBind,
    stepScoreDifficulty,
    stepScoreMetric,
    warp,
    onResume,
  ]);

  // While a KEY BINDINGS row is armed, a mouse button or wheel notch can be
  // bound too. The LEFT button (0) is left alone — it's how the menu is
  // clicked, and in-game it steers — so only the middle/right/side buttons and
  // the wheel are captured here (the row's own click already armed capture, so
  // its mouseup is spent before this listener mounts).
  useEffect(() => {
    if (!captureBind) return;
    const commit = (code: string) => {
      updateSettings({
        keybindings: withBinding(getSettings().keybindings, captureBind, code),
      });
      playUiSound(synth, "confirm");
      setCaptureBind(null);
      setSettingsTick((t) => t + 1);
    };
    const onMouseDown = (event: MouseEvent) => {
      if (event.button === 0) return; // left click drives the menu itself
      event.preventDefault();
      commit(mouseButtonCode(event.button));
    };
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      commit(wheelCode(event.deltaY));
    };
    const onContextMenu = (event: MouseEvent) => event.preventDefault();
    window.addEventListener("mousedown", onMouseDown);
    window.addEventListener("wheel", onWheel, { passive: false });
    window.addEventListener("contextmenu", onContextMenu);
    return () => {
      window.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("wheel", onWheel);
      window.removeEventListener("contextmenu", onContextMenu);
    };
  }, [captureBind]);

  // Touch: a swipe on the board picks its axis by the dominant direction —
  // horizontal walks the difficulty ladder, vertical flips the ranking.
  const swipeStart = useRef<{ x: number; y: number } | null>(null);
  const onScorePointerDown = (event: ReactPointerEvent) => {
    unlockAudio();
    swipeStart.current = { x: event.clientX, y: event.clientY };
  };
  const onScorePointerUp = (event: ReactPointerEvent) => {
    const start = swipeStart.current;
    swipeStart.current = null;
    if (!start) return;
    // A detail card owns its own BACK button; don't let a swipe behind it
    // quietly walk the difficulty ladder or flip the ranking.
    if (scoreDetail) return;
    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < SWIPE_THRESHOLD) return;
    if (Math.abs(dx) >= Math.abs(dy)) {
      // Swipe left advances the ladder (next difficulty), right steps back.
      stepScoreDifficulty(dx < 0 ? 1 : -1);
    } else {
      // Swipe up advances the ranking, down steps back.
      stepScoreMetric(dy < 0 ? 1 : -1);
    }
  };

  // The moon's hidden long-press: hold it for MOON_HOLD_MS to reveal the
  // DEVELOPER menu — a settings entry with level select and a debug toggle.
  // Nothing else happens; the player finds the new row in SETTINGS on their
  // own. A running glow (moonCharging) shows the hold is building; releasing
  // early cancels it.
  const moonHold = useRef<number | null>(null);
  // The pending "blast finished → unlock developer menu" timer, so we can drop
  // it if the menu unmounts mid-detonation.
  const moonBoom = useRef<number | null>(null);
  const cancelMoonHold = useCallback(() => {
    if (moonHold.current !== null) {
      window.clearTimeout(moonHold.current);
      moonHold.current = null;
    }
    // A release once the moon is already detonating no longer cancels: the
    // blast is committed and runs to the warp picker on its own.
    setMoonCharging(false);
  }, []);
  const startMoonHold = useCallback((event: ReactPointerEvent) => {
    unlockAudio();
    // Only a primary press charges; a mouse right/middle button is ignored.
    if (event.pointerType === "mouse" && event.button !== 0) return;
    if (moonHold.current !== null || moonBoom.current !== null) return;
    setMoonCharging(true);
    moonHold.current = window.setTimeout(() => {
      moonHold.current = null;
      setMoonCharging(false);
      // Blow the moon up first, then latch the developer unlock once the blast
      // has played out. Nothing navigates: the DEVELOPER row simply appears in
      // SETTINGS for the player to discover.
      setMoonExploding(true);
      playUiSound(synth, "boom");
      haptics.vibrate([30, 40, 90]);
      const reduce =
        typeof window.matchMedia === "function" &&
        window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      moonBoom.current = window.setTimeout(
        () => {
          moonBoom.current = null;
          setMoonExploding(false);
          updateSettings({ developerUnlocked: true });
          // Rebuild the menu so the SETTINGS list picks up the new row even if
          // it happens to be open already.
          setSettingsTick((t) => t + 1);
        },
        reduce ? MOON_BOOM_MS_REDUCED : MOON_BOOM_MS,
      );
    }, MOON_HOLD_MS);
  }, []);
  // Drop any pending timers if the menu unmounts mid-charge or mid-blast.
  useEffect(
    () => () => {
      cancelMoonHold();
      if (moonBoom.current !== null) {
        window.clearTimeout(moonBoom.current);
        moonBoom.current = null;
      }
    },
    [cancelMoonHold],
  );

  // Decide whether the level list overflows the room the centered column
  // leaves it. Runs when the list or viewport changes; the measurement reads
  // the list's full natural height (`scrollHeight`, independent of any cap) and
  // the space left over after the title/heading, so it never oscillates once a
  // cap is applied. Off the levels screen it stays false.
  useLayoutEffect(() => {
    const measure = () => {
      if (!tallMenu) {
        setLevelsOverflow(false);
        return;
      }
      // The menu rows live in the .title-content scroll column now — measure
      // against IT (it owns the row gap and the height cap), not the screen
      // root, whose only in-flow child is that column.
      const host = contentRef.current;
      const nav = menuRef.current;
      if (!host || !nav) return;
      const hostStyle = getComputedStyle(host);
      const gap = parseFloat(hostStyle.rowGap) || 0;
      const pad =
        (parseFloat(hostStyle.paddingTop) || 0) +
        (parseFloat(hostStyle.paddingBottom) || 0);
      let siblings = 0;
      let inFlow = 0;
      for (const child of Array.from(host.children)) {
        const el = child as HTMLElement;
        // Skip the absolutely-positioned decorative layers (stars, asteroids).
        if (getComputedStyle(el).position === "absolute") continue;
        inFlow += 1;
        if (el !== nav) siblings += el.offsetHeight;
      }
      const avail =
        host.clientHeight - pad - siblings - gap * Math.max(0, inFlow - 1);
      setLevelsOverflow(nav.scrollHeight > avail + 1);
    };
    // Measure on the next frame (not synchronously in the effect) so the pass
    // reads settled layout and React owns the resulting class toggle.
    const raf = requestAnimationFrame(measure);
    window.addEventListener("resize", measure);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", measure);
    };
  }, [tallMenu, entries]);

  // Soften the scroll edges of both the menu column and — when a long ladder
  // caps and scrolls on its own — the inner row list, so rows fade in/out of
  // view instead of clipping in with a hard line. Re-measures on every screen
  // swap and cursor move (a keyboard step scrolls the highlighted row).
  useScrollFade(contentRef, [assets, screen, cursor, entries, levelsOverflow]);
  useScrollFade(menuRef, [assets, screen, cursor, entries, levelsOverflow]);

  if (!assets) {
    return <LoadingScreen />;
  }
  const font = assets.font;
  const cursorSprite = spriteDataUrl(assets.sprites, "wisp_0") ?? "";
  // The menu's mouse pointer: a 16-bit Mickey glove, hotspot on the fingertip.
  // Fed to the whole screen through the --menu-cursor CSS var (see styles.css).
  const menuCursor = spriteCursor(assets.sprites, "glove", {
    hotX: 3.5,
    hotY: 0.5,
    fallback: "default",
  });
  const scoreRows = topCampaigns(scoreDifficulty, scoreMetric);
  const scoreDef = difficultyDef(scoreDifficulty);
  // The full-screen browsers (achievements, arsenal) own the whole display:
  // don't paint the logo/menu underneath — it bled through their backdrop.
  const browserOpen = screen === "achievements" || screen === "arsenal";
  // Sub-screens drop the tagline and shrink the logo: the heading + rows get
  // the room, and a tall menu no longer collides with the branding.
  const onMain = screen === "main";
  const headerScale = onMain ? logoScale : compact ? 4 : 6;
  // The SETTINGS tree renders as a stable form: a fixed-width column (so a
  // value change never shifts the right-aligned controls) with each row's help
  // text hoisted OUT of the row to a single bottom help line (so toggling a
  // setting can't reflow the row height or push the rows below it). The rest of
  // the menus stay content-width with an inline per-row blurb. `settings`
  // itself is the tree's entry menu (a list of destinations, like the main
  // menu), so it keeps inline blurbs.
  const useHelpLine = SETTINGS_TREE.has(screen);
  // The focused row's help text — shown in the bottom help line when the
  // settings tree hoists blurbs out of the rows.
  const helpText = useHelpLine ? (entries[cursor]?.blurb ?? "") : "";
  // The campaign row opened into its full breakdown card, or null for the list.
  const openScore = scoreDetail;

  return (
    <div
      ref={screenRef}
      className={`title-screen orbits${skyTest ? " sky-test" : ""}`}
      onPointerDown={unlockAudio}
      style={{ "--menu-cursor": menuCursor } as CSSProperties}
    >
      <div className="title-stars" aria-hidden="true" />
      {/* Asteroids drift across the backdrop now and then, so the menu feels
          alive rather than a static painting. */}
      <div className="title-asteroids" aria-hidden="true">
        {ASTEROID_BASE_SECONDS.map((baseSeconds, i) => (
          <span
            key={i}
            ref={(el) => {
              asteroidRefs.current[i] = el;
            }}
            className={`title-asteroid title-asteroid-${i + 1}`}
            style={{ animationDuration: asteroidDurations[i] }}
            onAnimationIteration={(e) => rerollAsteroid(e, baseSeconds)}
          />
        ))}
      </div>
      {/* A handful of stars twinkle on their own long cycles, out of sync, so
          the sky flickers with life rather than sitting as a flat backdrop. */}
      <div className="title-twinkles" aria-hidden="true">
        <span className="title-twinkle title-twinkle-1" />
        <span className="title-twinkle title-twinkle-2" />
        <span className="title-twinkle title-twinkle-3" />
        <span className="title-twinkle title-twinkle-4" />
        <span className="title-twinkle title-twinkle-5" />
        <span className="title-twinkle title-twinkle-6" />
        <span className="title-twinkle title-twinkle-7" />
      </div>
      {/* Mercury, Venus, Earth and Mars, wheeling around the sun; the Moon
          (below) orbits Earth. Positions and lighting are driven each frame by
          startTitleSky (titleSky.ts) — the CSS only supplies each surface. */}
      <div
        ref={mercuryRef}
        className="title-planet title-mercury"
        aria-hidden="true"
      />
      <div
        ref={venusRef}
        className="title-planet title-venus"
        aria-hidden="true"
      />
      <div
        ref={earthRef}
        className="title-planet title-earth"
        aria-hidden="true"
      />
      <div
        ref={marsRef}
        className="title-planet title-mars"
        aria-hidden="true"
      />
      {/* Hidden developer gesture: hold the moon for MOON_HOLD_MS to reveal the
          DEVELOPER row in SETTINGS (see startMoonHold). aria-hidden stays — it
          is a secret, pointer-only Easter egg, not an announced control. The
          moon rides its orbit around Earth (titleSky.ts) but stays the trigger. */}
      <div
        ref={moonRef}
        className={`title-planet title-moon${moonCharging ? " charging" : ""}${
          moonExploding ? " exploding" : ""
        }`}
        aria-hidden="true"
        onPointerDown={startMoonHold}
        onPointerUp={cancelMoonHold}
        onPointerLeave={cancelMoonHold}
        onPointerCancel={cancelMoonHold}
        onContextMenu={(event) => event.preventDefault()}
      />
      {/* The detonation, drawn as a sibling of the moon (which clips to its own
          disc) so the flash, shockwave and debris can spill across the sky.
          Anchored over the moon and mounted only for the blast. */}
      {moonExploding && (
        <div className="moon-boom" aria-hidden="true">
          <span className="moon-boom-flash" />
          <span className="moon-boom-ring" />
          <span className="moon-boom-ring moon-boom-ring-2" />
          <span className="moon-boom-core" />
          {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map((n) => (
            <span
              key={n}
              className="moon-boom-shard"
              style={{ "--shard": n } as CSSProperties}
            />
          ))}
        </div>
      )}
      {/* Easter egg sun: it sits still at the centre of the sky while the
          planets wheel around it. Driven by titleSky.ts; the CSS is just the
          look. */}
      <div ref={sunRef} className="title-sun" aria-hidden="true" />
      <div ref={glareRef} className="title-sun-glare" aria-hidden="true" />

      {!browserOpen && !skyTest && (
        <div className="title-content" ref={contentRef}>
          <header className="title-logo">
            <h1 className="visually-hidden">{IDENTITY.title}</h1>
            <PixelText
              font={font}
              text={IDENTITY.title.toUpperCase()}
              scale={headerScale}
              color="#7ef0c8"
            />
            {onMain && (
              <PixelText
                font={font}
                text={IDENTITY.tagline.toUpperCase()}
                scale={2}
                color="#9aa3ad"
              />
            )}
          </header>

          {screen === "play" && (
            <PixelText font={font} text="PLAY" scale={2} color="#d9a0f0" />
          )}
          {screen === "difficulty" && (
            <PixelText
              font={font}
              text={warp ? "WARP TO ANY DIFFICULTY" : "CHOOSE YOUR NIGHTMARE"}
              scale={2}
              color={warp ? "#7ef0c8" : "#d9a0f0"}
            />
          )}
          {screen === "levels" && (
            <PixelText
              font={font}
              text={warp ? "WARP TO ANY MISSION" : "CHOOSE YOUR MISSION"}
              scale={2}
              color={warp ? "#7ef0c8" : "#d9a0f0"}
            />
          )}
          {screen === "botspeed" && (
            <PixelText
              font={font}
              text="BOT VIEW - GAME SPEED"
              scale={2}
              color="#7ef0c8"
            />
          )}
          {screen === "settings" && (
            <PixelText font={font} text="SETTINGS" scale={2} color="#d9a0f0" />
          )}

          {screen === "controls" && (
            <PixelText
              font={font}
              text="SETTINGS - CONTROLS"
              scale={2}
              color="#d9a0f0"
            />
          )}
          {screen === "keybindings" && (
            <PixelText
              font={font}
              text="CONTROLS - KEY BINDINGS"
              scale={2}
              color="#d9a0f0"
            />
          )}
          {screen === "display" && (
            <PixelText
              font={font}
              text="SETTINGS - DISPLAY"
              scale={2}
              color="#d9a0f0"
            />
          )}
          {screen === "sound" && (
            <PixelText
              font={font}
              text="SETTINGS - SOUND"
              scale={2}
              color="#d9a0f0"
            />
          )}
          {screen === "data" && (
            <PixelText
              font={font}
              text="SETTINGS - DATA"
              scale={2}
              color="#d9a0f0"
            />
          )}
          {screen === "export" && (
            <PixelText
              font={font}
              text="DATA - EXPORT CHARACTER"
              scale={2}
              color="#d9a0f0"
            />
          )}
          {screen === "developer" && (
            <PixelText font={font} text="DEVELOPER" scale={2} color="#7ef0c8" />
          )}
          {screen === "balance" && (
            <PixelText
              font={font}
              text="DEVELOPER - BALANCE"
              scale={2}
              color="#7ef0c8"
            />
          )}
          {screen === "seed" && (
            <PixelText
              font={font}
              text="DEVELOPER - SEED CHARACTERS"
              scale={2}
              color="#7ef0c8"
            />
          )}

          {screen === "scores" && (
            <>
              <PixelText
                font={font}
                text="HIGH SCORES"
                scale={2}
                color="#d9a0f0"
              />
              <PixelText
                font={font}
                text="HARDCORE CAMPAIGNS"
                scale={1}
                color="#ff6d6d"
              />
              <div
                className="score-board"
                onPointerDown={onScorePointerDown}
                onPointerUp={onScorePointerUp}
              >
                <button
                  type="button"
                  className="score-axis score-bob"
                  aria-label="score-difficulty"
                  onClick={() => stepScoreDifficulty(1)}
                >
                  <PixelText
                    font={font}
                    text={scoreDef.name}
                    scale={3}
                    color={scoreDef.color}
                  />
                </button>

                {openScore ? (
                  (() => {
                    const detail = openScore;
                    const survived = detail.outcome === "survived";
                    const { name: levelName } = scoreLevelInfo(
                      detail.levelId ?? "",
                    );
                    // The whole campaign at a glance: the four ranked numbers
                    // plus how far the hero got before beating it or falling.
                    const lines: [string, string][] = [
                      ["MOBS KILLED", String(detail.kills)],
                      ["SURVIVAL TIME", formatTime(detail.combatMs)],
                      ["KILLS / MIN", formatKpm(detail.kpm)],
                      ["PEAK MENACE", `RAMPAGE ${detail.peakMenace}`],
                      ["LEVELS CLEARED", String(detail.levels)],
                    ];
                    if (!survived && detail.levelId) {
                      lines.push(["FELL ON", levelName]);
                    }
                    return (
                      <div className="score-detail">
                        <PixelText
                          font={font}
                          text={survived ? "SURVIVED" : "FELL"}
                          scale={3}
                          color={survived ? "#7ef0c8" : "#d83a3a"}
                        />
                        <PixelText font={font} text={detail.name} scale={2} />
                        <PixelText
                          font={font}
                          text={formatScoreDate(detail.at)}
                          scale={1}
                          color="#7a8088"
                        />
                        <div className="score-detail-stats">
                          {lines.map(([label, value]) => (
                            <div className="score-detail-row" key={label}>
                              <PixelText
                                font={font}
                                text={label}
                                scale={1}
                                color="#9aa3ad"
                              />
                              <PixelText font={font} text={value} scale={2} />
                            </div>
                          ))}
                        </div>
                        <button
                          type="button"
                          className="score-back"
                          aria-label="score-back"
                          onClick={() => {
                            playUiSound(synth, "back");
                            setScoreDetail(null);
                          }}
                        >
                          <PixelText
                            font={font}
                            text="BACK"
                            scale={3}
                            color="#ffd75e"
                          />
                        </button>
                      </div>
                    );
                  })()
                ) : (
                  <>
                    <button
                      type="button"
                      className="score-metric score-bob score-bob-delay"
                      aria-label="score-metric"
                      onClick={() => stepScoreMetric(1)}
                    >
                      <PixelText
                        font={font}
                        text={
                          SCORE_METRICS.find((m) => m.id === scoreMetric)
                            ?.label ?? ""
                        }
                        scale={2}
                        color="#7ef0c8"
                      />
                    </button>

                    <div className="score-list">
                      {scoreRows.length === 0 ? (
                        <PixelText
                          font={font}
                          text="NO CAMPAIGNS YET"
                          scale={2}
                          color="#5a6068"
                        />
                      ) : (
                        scoreRows.map((row, i) => {
                          const medal =
                            ["#ffd75e", "#c8cdd4", "#cd7f4b"][i] ?? "#7ef0c8";
                          // Each ranking leads with its own metric; the smaller
                          // secondary line keeps the two headline numbers (kills
                          // and survival) cross-visible.
                          const metricValue = (m: ScoreMetric): string => {
                            switch (m) {
                              case "kills":
                                return `${row.kills} KILLS`;
                              case "time":
                                return formatTime(row.combatMs);
                              case "kpm":
                                return `${formatKpm(row.kpm)} KPM`;
                              case "menace":
                                return `RAMPAGE ${row.peakMenace}`;
                            }
                          };
                          const primary = metricValue(scoreMetric);
                          const secondary =
                            scoreMetric === "kills"
                              ? metricValue("time")
                              : metricValue("kills");
                          return (
                            <button
                              type="button"
                              className="score-row"
                              key={i}
                              aria-label={`score-row-${i + 1}`}
                              onClick={() => {
                                playUiSound(synth, "move");
                                setScoreDetail(row);
                              }}
                            >
                              <PixelText
                                font={font}
                                text={`${i + 1}.`}
                                scale={3}
                                color={medal}
                              />
                              <PixelText font={font} text={primary} scale={3} />
                              <PixelText
                                font={font}
                                text={secondary}
                                scale={1}
                                color="#9aa3ad"
                              />
                              <PixelText
                                font={font}
                                text=">"
                                scale={2}
                                color="#5a6068"
                              />
                            </button>
                          );
                        })
                      )}
                    </div>

                    <PixelText
                      font={font}
                      text="SWIPE OR ARROWS TO SWITCH"
                      scale={2}
                      color="#7a8088"
                    />
                    <button
                      type="button"
                      className="score-back"
                      aria-label="score-back"
                      onClick={() => {
                        playUiSound(synth, "back");
                        setScreen("main");
                        setCursor(onResume ? 2 : 1);
                      }}
                    >
                      <PixelText
                        font={font}
                        text="BACK"
                        scale={3}
                        color="#ffd75e"
                      />
                    </button>
                  </>
                )}
              </div>
            </>
          )}

          {/* browserOpen (arsenal/achievements) never reaches here — the whole
              content column is skipped while a full-screen browser is up. */}
          {screen !== "scores" && (
            <nav
              ref={menuRef}
              className={`title-menu${useHelpLine ? " settings-menu" : ""}${tallMenu && levelsOverflow ? " scrollable" : ""}`}
              aria-label="main menu"
            >
              {entries.map((entry, i) => {
                const selected = i === cursor;
                const baseColor = entry.color ?? "#ffd75e";
                const color = selected
                  ? baseColor
                  : entry.locked
                    ? "#5a6068"
                    : "#9aa3ad";
                return (
                  <button
                    key={entry.aria}
                    type="button"
                    // Tracked so cursor moves scroll the row into view — the
                    // scrolling itself lives in an effect keyed on the cursor,
                    // NOT here: a mount-time scrollIntoView fights the
                    // scroll-to-top on screen entry (see contentRef).
                    ref={
                      selected
                        ? (el) => {
                            selectedRowRef.current = el;
                          }
                        : undefined
                    }
                    className={`menu-item${selected ? " selected" : ""}${entry.locked ? " locked" : ""}`}
                    aria-label={entry.aria}
                    onPointerEnter={() => {
                      if (i !== cursor) {
                        playUiSound(synth, "move");
                        setCursor(i);
                      }
                    }}
                    onClick={() => {
                      // A light tap under every menu press — felt on touch
                      // (where each tap IS the activation) and on click alike.
                      playMenuHaptic();
                      entry.action();
                    }}
                  >
                    <img
                      src={cursorSprite}
                      alt=""
                      className="menu-cursor"
                      style={{ visibility: selected ? "visible" : "hidden" }}
                    />
                    <span className="menu-item-text">
                      <span className="menu-item-headline">
                        <PixelText
                          font={font}
                          text={entry.label}
                          scale={3}
                          color={color}
                        />
                      </span>
                      {entry.subtitle && (
                        // Row-bound DATA (the EXPORT picker's per-hero level +
                        // standing): always a second line in the row — the
                        // right-hand control centres against both lines.
                        <span className="menu-item-subtitle">
                          <PixelText
                            font={font}
                            text={entry.subtitle}
                            scale={2}
                            color={selected ? "#9aa3ad" : "#6b7178"}
                            maxWidth={blurbMaxWidth}
                          />
                        </span>
                      )}
                      {entry.slider && (
                        <PixelSlider
                          pos={entry.slider.pos}
                          onChange={entry.slider.set}
                        />
                      )}
                      {entry.blurb && !useHelpLine && (
                        // Off the settings tree the help line shows on every row,
                        // always — a dim gray subtitle under the label. On the
                        // settings tree it is hoisted to the bottom help line
                        // (see `.menu-help`) so a changing blurb never reflows
                        // the row.
                        <span className="menu-item-blurb">
                          <PixelText
                            font={font}
                            text={entry.blurb}
                            scale={2}
                            color={selected ? "#9aa3ad" : "#6b7178"}
                            maxWidth={blurbMaxWidth}
                          />
                        </span>
                      )}
                    </span>
                    {/* The row's control sits OUTSIDE the text column, as a
                        direct flex child of the button, so `align-items: center`
                        centres it vertically across the whole row (both lines of
                        a two-line EXPORT row) and `margin-left: auto` pins it to
                        the row's right edge. */}
                    {(entry.toggle ||
                      entry.value !== undefined ||
                      entry.check ||
                      entry.binding) && (
                      <span className="menu-item-control">
                        {entry.toggle && <PixelToggle on={entry.toggle.on} />}
                        {entry.value !== undefined && (
                          <PixelText
                            font={font}
                            text={entry.value}
                            scale={3}
                            color={selected ? baseColor : "#9aa3ad"}
                          />
                        )}
                        {entry.check && (
                          <PixelCheckbox checked={entry.check.checked} />
                        )}
                        {entry.binding && (
                          <PixelText
                            font={font}
                            text={
                              entry.binding.capturing
                                ? "PRESS A KEY"
                                : bindingLabel(entry.binding.code)
                            }
                            scale={3}
                            color={
                              entry.binding.capturing
                                ? "#7ef0c8"
                                : selected
                                  ? "#ffd75e"
                                  : "#9aa3ad"
                            }
                          />
                        )}
                      </span>
                    )}
                  </button>
                );
              })}
            </nav>
          )}

          {/* The settings tree's single help line: the focused row's help text,
              hoisted out of the row so a value change never reflows the list.
              A fixed min-height reserves its space, so moving the cursor
              between rows (or an empty-help row) never shifts the layout. The
              `key` restarts a soft fade each time the text changes. */}
          {useHelpLine && (
            <p className="menu-help" role="status" aria-live="polite">
              {helpText && (
                <PixelText
                  key={helpText}
                  font={font}
                  text={helpText}
                  scale={2}
                  color="#9aa3ad"
                  maxWidth={wide ? 44 : 24}
                />
              )}
            </p>
          )}

          {/* The import/export result line, under the SETTINGS - DATA menu,
              the EXPORT CHARACTER picker, the DEVELOPER grant/seed rows, and
              the COIN STORE (purchase results). */}
          {(screen === "data" ||
            screen === "export" ||
            screen === "seed" ||
            screen === "developer" ||
            screen === "store" ||
            screen === "storehero" ||
            screen === "storesend") &&
            transferNotice && (
              <p
                className={`title-notice ${transferNotice.tone}`}
                role="status"
                aria-live="polite"
              >
                <PixelText
                  font={font}
                  text={transferNotice.text}
                  scale={2}
                  color={
                    transferNotice.tone === "error" ? "#ff6d6d" : "#7ef0c8"
                  }
                  maxWidth={24}
                />
              </p>
            )}
        </div>
      )}

      {/* The ACHIEVEMENTS browser: a full-screen overlay over the menu,
          mounted only while browsing (it owns its own keyboard navigation).
          Opening it acknowledges any unseen badges. */}
      {screen === "achievements" && (
        <Suspense fallback={null}>
          <AchievementsScreen
            font={font}
            sprites={assets.sprites}
            onClose={() => {
              setScreen("main");
              // Land back on the ACHIEVEMENTS row.
              setCursor(onResume ? 3 : 2);
            }}
          />
        </Suspense>
      )}

      {/* The developer ARSENAL viewer: a full-screen overlay over the menu,
          mounted only while browsing (it owns its own keyboard navigation). */}
      {screen === "arsenal" && (
        <ArsenalScreen
          font={font}
          relicFonts={assets.relicFonts}
          sprites={assets.sprites}
          onClose={() => {
            setScreen("developer");
            // Land back on VIEW ARSENAL — the second developer row.
            setCursor(1);
          }}
        />
      )}

      {!browserOpen && !skyTest && (
        <footer className="title-footer">
          <PixelText
            font={font}
            text={`v${__APP_VERSION__} · ${__BUILD_COMMIT__}`}
            scale={1}
            color="#7a8088"
          />
        </footer>
      )}
    </div>
  );
}
