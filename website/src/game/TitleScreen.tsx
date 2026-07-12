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
  levelDef,
  type Difficulty,
} from "@game/core";

import { formatCompact } from "@ui/lib/format-number.ts";
import { PixelText } from "@ui/lib/PixelText.tsx";
import { useScrollFade } from "@ui/lib/scroll-fade.ts";

import { IDENTITY } from "../identity.ts";

import { ArsenalScreen } from "./ArsenalScreen.tsx";
import { BalanceSlider } from "./BalanceSlider.tsx";
import {
  BALANCE_KNOBS,
  balanceFromSlider,
  balanceToSlider,
  formatBalanceMult,
  nudgeBalance,
} from "./balanceKnobs.ts";
import { HELP_LINES } from "./copy.ts";

import { topScores, type ScoreMetric, type ScoreRow } from "./highscores.ts";

import {
  loadGameAssets,
  spriteCursor,
  spriteDataUrl,
  type GameAssets,
} from "./assets.ts";
import { synth } from "./audio.ts";
import { haptics } from "./haptics.ts";
import { playTitleMusic } from "./music/index.ts";
import {
  exportCharacterToFile,
  importCharacterFromFile,
} from "./character-transfer.ts";
import {
  firstUnclearedLevel,
  hasClearedLevel,
  importCharacter,
  isDifficultyBeaten,
  isDifficultyUnlocked,
  isLevelUnlocked,
  type Character,
} from "./characters.ts";
import { uiScaleFor } from "./render.ts";
import { getSettings, updateSettings } from "./settings.ts";
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
  | "difficulty"
  | "levels"
  | "scores"
  | "settings"
  | "controls"
  | "display"
  | "sound"
  | "data"
  | "developer"
  | "balance"
  | "arsenal"
  | "achievements"
  | "help";

const pct = (v: number) => `${Math.round(v * 100)}%`;
/** 0 → 25 → 50 → 75 → 100 → 0, in quarter steps. */
const cycleVolume = (v: number) => ((Math.round(v * 4) + 1) % 5) / 4;

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
  { id: "time", label: "SURVIVAL TIME" },
  { id: "kpm", label: "KILLS / MIN" },
  { id: "kills", label: "MOBS KILLED" },
  { id: "level", label: "LEVEL REACHED" },
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
  /** A DEVELOPER → BALANCE row: renders a drag slider after the label and
   * takes ArrowLeft/ArrowRight (see onKeyDown) instead of a confirm cycle.
   * `pos` is the 0..1 track position; `set` commits a dragged/tapped position;
   * `nudge` steps one keyboard tick in a direction (±1). */
  slider?: {
    pos: number;
    set: (pos: number) => void;
    nudge: (dir: number) => void;
  };
};

// Audio needs a user gesture; the first interaction with the menu doubles
// as the unlock, and the title theme starts with it.
function unlockAudio() {
  synth.unlock();
  playTitleMusic();
}

/** The furthest difficulty rung this hero has unlocked — where the ladder
 * opens (a fresh hero lands on EASY, the only one open). */
function furthestUnlockedDifficulty(character: Character): number {
  return DIFFICULTY_ORDER.reduce(
    (best, id, i) => (isDifficultyUnlocked(character, id) ? i : best),
    0,
  );
}

export function TitleScreen({
  character,
  onStart,
  onResume,
  onManageCharacters,
  onNeedCharacter,
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
    opts?: { skipIntro?: boolean },
  ) => void;
  /** Present only while a run sits parked in memory (the player exited to the
   * menu from the pause screen). When set, the menu offers CONTINUE, which
   * drops straight back into the frozen run. */
  onResume?: () => void;
  /** Open the character roster to switch heroes / create a new one (CHARACTERS,
   * and the target when PLAY needs a hero but one is already active). */
  onManageCharacters: () => void;
  /** PLAY was chosen with no active hero: open the roster to pick or create one
   * first, then drop into the difficulty ladder for it. */
  onNeedCharacter: () => void;
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
  // The scrollable menu column: each screen change starts reading from the
  // top (the selected row's scrollIntoView would otherwise land a tall screen
  // — HOW TO PLAY — scrolled to its BACK row, hiding the content).
  const contentRef = useRef<HTMLDivElement | null>(null);
  // The moon is mid-charge (held but not yet at MOON_HOLD_MS) — drives the
  // "charging up" glow so the long-press has visible feedback.
  const [moonCharging, setMoonCharging] = useState(false);
  // The moon has reached full charge and is detonating: a one-shot blast that
  // plays before the developer menu is unlocked (see startMoonHold /
  // MOON_BOOM_MS).
  const [moonExploding, setMoonExploding] = useState(false);
  // The HIGH SCORES board's axes: left/right picks the difficulty column,
  // up/down flips between the survival-time and kills-per-minute rankings.
  const [scoreDifficulty, setScoreDifficulty] = useState<Difficulty>("medium");
  const [scoreMetric, setScoreMetric] = useState<ScoreMetric>("time");
  // The board row currently opened into its full-session detail card, or null
  // for the ranked list. Only rows banked with a detail snapshot can open.
  const [scoreDetail, setScoreDetail] = useState<ScoreRow | null>(null);
  // Which consumable-dock key is mid-rebind (CONTROLS): the next key pressed is
  // captured as the new bind. Null when not listening.
  const [captureBind, setCaptureBind] = useState<"medkit" | "stamina" | null>(
    null,
  );
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
      // (HOW TO PLAY on a small phone or a 2×-scaled tablet) scrolled to its
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

  // The backdrop's sun/moon Easter egg — a rAF loop that keeps the moon lit
  // from the sun's real position. Starts once the menu (and its elements) has
  // mounted after the assets load.
  const moonRef = useRef<HTMLDivElement>(null);
  const sunRef = useRef<HTMLDivElement>(null);
  const glareRef = useRef<HTMLDivElement>(null);

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
  const tallMenu = screen === "levels" || screen === "balance";
  useEffect(() => {
    const moon = moonRef.current;
    const sun = sunRef.current;
    const glare = glareRef.current;
    if (!moon || !sun || !glare) return;
    return startTitleSky({ moon, sun, glare });
  }, [assets]);

  // Settings live in a plain singleton; mirror a tick so labels re-render.
  const [settingsTick, setSettingsTick] = useState(0);

  // Character transfer (SETTINGS → DATA → EXPORT / IMPORT CHARACTER): the last
  // result, shown as a line under the menu.
  const [transferNotice, setTransferNotice] = useState<{
    tone: "info" | "error";
    text: string;
  } | null>(null);

  // Export the ACTIVE hero (the roster's per-character export moved here, so it
  // is the one currently selected). A no-op with no active character — the row
  // isn't offered then.
  const exportActive = useCallback(async () => {
    if (!character) return;
    playUiSound(synth, "confirm");
    try {
      await exportCharacterToFile(character);
      setTransferNotice({ tone: "info", text: `EXPORTED ${character.name}` });
    } catch {
      setTransferNotice({ tone: "error", text: "EXPORT FAILED" });
    }
  }, [character]);

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

    if (screen === "main") {
      return [
        // Offered only when a run is parked in memory; sits at the top so it's
        // the default highlight when the player ducked out to the menu.
        ...(onResume
          ? [
              {
                label: "CONTINUE",
                aria: "continue",
                action: () => {
                  playUiSound(synth, "confirm");
                  onResume();
                },
              },
            ]
          : []),
        {
          label: "PLAY",
          aria: "new-game",
          action: () => {
            playUiSound(synth, "confirm");
            // No hero yet: pick or create one first — the roster drops back
            // into the difficulty ladder once a hero is chosen.
            if (!character) {
              onNeedCharacter();
              return;
            }
            setScreen("difficulty");
            // Open on the hardest rung this hero has unlocked.
            setCursor(furthestUnlockedDifficulty(character));
          },
        },
        {
          label: "CHARACTERS",
          aria: "characters",
          action: () => {
            playUiSound(synth, "back");
            onManageCharacters();
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
            playUiSound(synth, "confirm");
            setScreen("help");
            setCursor(0);
          },
        },
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
          setScreen("developer");
          setCursor(0);
        },
      };
      return [
        ...DIFFICULTY_ORDER.map((id) => {
          const def = difficultyDef(id);
          // The ladder unlocks in order per character: a rung opens once the
          // one before it is beaten (easy is always open). Locked rungs show
          // greyed out. Warp mode opens every rung.
          const unlocked = warp || isDifficultyUnlocked(character, id);
          const beaten = isDifficultyBeaten(character, id);
          return {
            label: def.name,
            aria: `difficulty-${id}`,
            color: unlocked ? def.color : "#5a6068",
            locked: !unlocked,
            blurb: warp
              ? "WARP - PICK A MISSION"
              : !unlocked
                ? "LOCKED - BEAT THE PREVIOUS DIFFICULTY"
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
          const blurb = warp
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
              playUiSound(synth, "start");
              onStart(difficulty, id, warp ? { skipIntro: true } : undefined);
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
                playUiSound(synth, "start");
                onStart(difficulty, id, { skipIntro: true });
              },
            }))
          : []),
        warp
          ? warpBack
          : backTo("difficulty", DIFFICULTY_ORDER.indexOf(difficulty)),
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
        backTo("main", onResume ? 5 : 4),
      ];
    }
    if (screen === "developer") {
      const s = getSettings();
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
          label: s.debug === "on" ? "DEBUG MODE: ON" : "DEBUG MODE: OFF",
          aria: "developer-debug",
          blurb: "SHOW THE FPS METER DURING RUNS",
          action: () => {
            playUiSound(synth, "confirm");
            updateSettings({ debug: s.debug === "on" ? "off" : "on" });
            setSettingsTick((t) => t + 1);
          },
        },
        {
          label:
            s.autoLevelStats === "on"
              ? "AUTO LEVEL STATS: ON"
              : "AUTO LEVEL STATS: OFF",
          aria: "developer-auto-level-stats",
          blurb: "FREE BASE STAT GROWTH EACH LEVEL (MOBS SCALE TO MATCH)",
          action: () => {
            playUiSound(synth, "confirm");
            updateSettings({
              autoLevelStats: s.autoLevelStats === "on" ? "off" : "on",
            });
            setSettingsTick((t) => t + 1);
          },
        },
        {
          label:
            s.characterWeapon === "on"
              ? "CHARACTER WEAPON: ON"
              : "CHARACTER WEAPON: OFF",
          aria: "developer-character-weapon",
          blurb: "SHOW THE HELD WEAPON ON THE HERO SPRITE",
          action: () => {
            playUiSound(synth, "confirm");
            updateSettings({
              characterWeapon: s.characterWeapon === "on" ? "off" : "on",
            });
            setSettingsTick((t) => t + 1);
          },
        },
        {
          label:
            s.weaponSwing === "on" ? "WEAPON SWING: ON" : "WEAPON SWING: OFF",
          aria: "developer-weapon-swing",
          blurb:
            "ANIMATE THE HELD WEAPON ON EACH ATTACK (NEEDS CHARACTER WEAPON)",
          action: () => {
            playUiSound(synth, "confirm");
            updateSettings({
              weaponSwing: s.weaponSwing === "on" ? "off" : "on",
            });
            setSettingsTick((t) => t + 1);
          },
        },
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
    if (screen === "data") {
      // Character transfer: EXPORT the active hero as a signed zip (offered
      // only when one is active), IMPORT any exported hero back via a file
      // picker.
      return [
        ...(character
          ? [
              {
                label: "EXPORT CHARACTER",
                aria: "data-export-character",
                blurb: `SAVE ${character.name} TO A FILE`,
                action: () => void exportActive(),
              },
            ]
          : []),
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
    if (screen === "sound") {
      const s = getSettings();
      return [
        {
          label: `MUSIC ${pct(s.musicVolume)}`,
          aria: "sound-music-volume",
          blurb: "THE THEME FOLLOWS ALONG",
          action: () => {
            updateSettings({ musicVolume: cycleVolume(s.musicVolume) });
            setSettingsTick((t) => t + 1);
          },
        },
        {
          label: `SOUND FX ${pct(s.sfxVolume)}`,
          aria: "sound-sfx-volume",
          blurb: "BLASTERS, GHOSTS, PICKUPS",
          action: () => {
            updateSettings({ sfxVolume: cycleVolume(s.sfxVolume) });
            setSettingsTick((t) => t + 1);
            playUiSound(synth, "confirm"); // audition the new level
          },
        },
        // Land back on the SOUND row in SETTINGS (after CONTROLS / DISPLAY).
        backTo("settings", 2),
      ];
    }
    if (screen === "controls") {
      const s = getSettings();
      return [
        {
          label:
            s.steering === "hover"
              ? "MOUSE: FOLLOW CURSOR"
              : "MOUSE: HOLD TO STEER",
          aria: "controls-steering",
          blurb:
            s.steering === "hover"
              ? "THE CURSOR LEADS - CLICK USES AN ITEM"
              : "HOLD TO WALK - CLICK-TAP JUMPS",
          action: () => {
            playUiSound(synth, "confirm");
            updateSettings({
              steering: s.steering === "hover" ? "hold" : "hover",
            });
            setSettingsTick((t) => t + 1);
          },
        },
        {
          label:
            s.keyboardMove === "on" ? "KEYS: WASD MOVE" : "KEYS: MOUSE ONLY",
          aria: "controls-keyboard-move",
          blurb:
            s.keyboardMove === "on"
              ? "WASD / ARROWS RUN - SHIFT WALKS - SPACE JUMPS"
              : "STEERING STAYS ON THE MOUSE",
          action: () => {
            playUiSound(synth, "confirm");
            updateSettings({
              keyboardMove: s.keyboardMove === "on" ? "off" : "on",
            });
            setSettingsTick((t) => t + 1);
          },
        },
        {
          label:
            s.itemUse === "auto"
              ? "POWERUPS: USE ON PICKUP"
              : "POWERUPS: USE MANUALLY",
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
          label:
            s.autoEquip === "on"
              ? "GEAR: EQUIP ON PICKUP"
              : "GEAR: KEEP IN BAG",
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
          label:
            s.powerupSide === "right"
              ? "POWERUPS: LOWER RIGHT"
              : "POWERUPS: LOWER LEFT",
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
        {
          label:
            captureBind === "medkit"
              ? "HEAL KEY: PRESS A KEY..."
              : `HEAL KEY: ${s.keyMedkit.toUpperCase()}`,
          aria: "controls-key-medkit",
          blurb: "DESKTOP KEY THAT USES A MEDKIT FROM THE DOCK",
          action: () => {
            playUiSound(synth, "confirm");
            setCaptureBind("medkit");
            setSettingsTick((t) => t + 1);
          },
        },
        {
          label:
            captureBind === "stamina"
              ? "STAMINA KEY: PRESS A KEY..."
              : `STAMINA KEY: ${s.keyStamina.toUpperCase()}`,
          aria: "controls-key-stamina",
          blurb: "DESKTOP KEY THAT DRINKS A STAMINA POTION FROM THE DOCK",
          action: () => {
            playUiSound(synth, "confirm");
            setCaptureBind("stamina");
            setSettingsTick((t) => t + 1);
          },
        },
        {
          label: s.vibration === "on" ? "VIBRATION: ON" : "VIBRATION: OFF",
          aria: "controls-vibration",
          blurb: "BUZZ ON KILLS & DIALOGUE - BIGGER MOBS HIT HARDER (NO IOS)",
          action: () => {
            playUiSound(synth, "confirm");
            const next = s.vibration === "on" ? "off" : "on";
            updateSettings({ vibration: next });
            // Audition the new state — a firm tap confirms it's live.
            if (next === "on") haptics.vibrate(28);
            setSettingsTick((t) => t + 1);
          },
        },
        backTo("settings", 0),
      ];
    }
    if (screen === "display") {
      const s = getSettings();
      return [
        {
          label: s.xpFloat === "on" ? "XP ON KILL: ON" : "XP ON KILL: OFF",
          aria: "display-xp-float",
          blurb:
            s.xpFloat === "on"
              ? "A BLUE +N XP FLOATS OFF EACH KILL"
              : "NO XP TEXT ON KILLS",
          action: () => {
            playUiSound(synth, "confirm");
            updateSettings({ xpFloat: s.xpFloat === "on" ? "off" : "on" });
            setSettingsTick((t) => t + 1);
          },
        },
        // Land back on the DISPLAY row in SETTINGS (index 1, after CONTROLS).
        backTo("settings", 1),
      ];
    }
    return [backTo("main", onResume ? 3 : 2)];
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
    onManageCharacters,
    onNeedCharacter,
    settingsTick,
    captureBind,
    difficulty,
    warp,
    exportActive,
    pickImport,
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
      // A consumable-dock key rebind is listening: the next key IS the new
      // bind. Escape cancels; any single printable key (lowercased) is taken,
      // so it can't collide with the arrow/Enter menu keys below.
      if (captureBind) {
        event.preventDefault();
        if (event.key !== "Escape" && event.key.length === 1) {
          updateSettings(
            captureBind === "medkit"
              ? { keyMedkit: event.key.toLowerCase() }
              : { keyStamina: event.key.toLowerCase() },
          );
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
      const sliderRow = entries[cursor]?.slider;
      if (
        sliderRow &&
        (event.key === "ArrowLeft" || event.key === "ArrowRight")
      ) {
        // On a BALANCE row the horizontal arrows steer its slider instead of
        // idling — up/down still walk the row list as everywhere else.
        event.preventDefault();
        unlockAudio();
        playUiSound(synth, "move");
        sliderRow.nudge(event.key === "ArrowRight" ? 1 : -1);
      } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        unlockAudio();
        playUiSound(synth, "move");
        const delta = event.key === "ArrowDown" ? 1 : -1;
        setCursor((c) => (c + delta + entries.length) % entries.length);
      } else if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        unlockAudio();
        entries[cursor]?.action();
      } else if (event.key === "Escape" && screen !== "main") {
        unlockAudio();
        playUiSound(synth, "back");
        // The warp picker walks developer → difficulty → levels; Escape backs
        // out one rung at a time, leaving warp mode only once it returns to the
        // developer menu (from the warp difficulty picker).
        if (screen === "difficulty" && warp) setWarp(false);
        const back: Record<string, MenuScreen> = {
          controls: "settings",
          display: "settings",
          sound: "settings",
          data: "settings",
          developer: "settings",
          balance: "developer",
          difficulty: warp ? "developer" : "main",
          levels: "difficulty",
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
    return <div className="game-loading">Loading…</div>;
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
  const scoreRows = topScores(scoreDifficulty, scoreMetric);
  const scoreDef = difficultyDef(scoreDifficulty);
  // The full-screen browsers (achievements, arsenal) own the whole display:
  // don't paint the logo/menu underneath — it bled through their backdrop.
  const browserOpen = screen === "achievements" || screen === "arsenal";
  // Sub-screens drop the tagline and shrink the logo: the heading + rows get
  // the room, and a tall menu no longer collides with the branding.
  const onMain = screen === "main";
  const headerScale = onMain ? logoScale : compact ? 4 : 6;
  // When a row with a banked session is opened, this holds it (with `detail`
  // narrowed non-null) so the board swaps its list for the full-session card.
  const openScore =
    scoreDetail && scoreDetail.detail
      ? { row: scoreDetail, detail: scoreDetail.detail }
      : null;

  return (
    <div
      ref={screenRef}
      className="title-screen"
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
      {/* Hidden developer gesture: hold the moon for MOON_HOLD_MS to reveal the
          DEVELOPER row in SETTINGS (see startMoonHold). aria-hidden stays — it
          is a secret, pointer-only Easter egg, not an announced control. */}
      <div
        ref={moonRef}
        className={`title-moon${moonCharging ? " charging" : ""}${
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
      {/* Easter egg: a lone sun slowly arcs across the sky roughly every few
          minutes. The moon is dark while it is up and swells to full once it
          has set — always lit from the sun's true direction. Driven by
          startTitleSky (titleSky.ts); the CSS only supplies the static look. */}
      <div ref={sunRef} className="title-sun" aria-hidden="true" />
      <div ref={glareRef} className="title-sun-glare" aria-hidden="true" />

      {!browserOpen && (
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

          {screen === "help" && (
            <div className="title-help">
              {HELP_LINES.map((line, i) =>
                line === "" ? (
                  <div key={i} className="intro-gap" />
                ) : (
                  <PixelText key={i} font={font} text={line} scale={2} />
                ),
              )}
            </div>
          )}

          {screen === "scores" && (
            <>
              <PixelText
                font={font}
                text="HIGH SCORES"
                scale={2}
                color="#d9a0f0"
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
                    const { detail } = openScore;
                    const { name: levelName, foes } = scoreLevelInfo(
                      detail.levelId,
                    );
                    const cleared = detail.outcome === "victory";
                    const kpm =
                      detail.stats.timeMs > 0
                        ? detail.stats.kills / (detail.stats.timeMs / 60_000)
                        : 0;
                    // Every field of the run, headline numbers and all: a big kill
                    // count reads very differently beside the shots and damage it
                    // cost to earn.
                    const lines: [string, string][] = [
                      ["TIME", formatTime(detail.stats.timeMs)],
                      [
                        foes,
                        `${detail.stats.kills}/${detail.stats.totalEnemies}`,
                      ],
                      ["KILLS / MIN", formatKpm(kpm)],
                      ["LEVEL REACHED", String(detail.level)],
                      ["XP GAINED", formatCompact(detail.stats.xpGained)],
                      ["SHOTS FIRED", formatCompact(detail.stats.shotsFired)],
                      ["DAMAGE DEALT", formatCompact(detail.stats.damageDealt)],
                      ["DAMAGE TAKEN", formatCompact(detail.stats.damageTaken)],
                      ["ITEMS", String(detail.stats.itemsCollected)],
                    ];
                    return (
                      <div className="score-detail">
                        <PixelText
                          font={font}
                          text={cleared ? "LEVEL CLEAR!" : "YOU DIED"}
                          scale={3}
                          color={cleared ? "#7ef0c8" : "#d83a3a"}
                        />
                        <PixelText font={font} text={levelName} scale={2} />
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
                          text="NO RUNS YET"
                          scale={2}
                          color="#5a6068"
                        />
                      ) : (
                        scoreRows.map((row, i) => {
                          const medal =
                            ["#ffd75e", "#c8cdd4", "#cd7f4b"][i] ?? "#7ef0c8";
                          // Each ranking leads with its own metric; the smaller
                          // secondary line keeps survival time in view (or KPM,
                          // when time itself is the headline).
                          const metricValue = (m: ScoreMetric): string => {
                            switch (m) {
                              case "time":
                                return formatTime(row.timeMs);
                              case "kpm":
                                return `${formatKpm(row.kpm)} KPM`;
                              case "kills":
                                return `${row.kills} KILLS`;
                              case "level":
                                return `LV ${row.level}`;
                            }
                          };
                          const primary = metricValue(scoreMetric);
                          const secondary =
                            scoreMetric === "time"
                              ? metricValue("kpm")
                              : metricValue("time");
                          // A row opens into its full session only when one was
                          // banked; legacy time-only runs stay inert (no arrow).
                          const openable = Boolean(row.detail);
                          return (
                            <button
                              type="button"
                              className="score-row"
                              key={i}
                              disabled={!openable}
                              aria-label={`score-row-${i + 1}`}
                              onClick={() => {
                                if (!openable) return;
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
                              {openable && (
                                <PixelText
                                  font={font}
                                  text=">"
                                  scale={2}
                                  color="#5a6068"
                                />
                              )}
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
              className={`title-menu${tallMenu && levelsOverflow ? " scrollable" : ""}`}
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
                    onClick={entry.action}
                  >
                    <img
                      src={cursorSprite}
                      alt=""
                      className="menu-cursor"
                      style={{ visibility: selected ? "visible" : "hidden" }}
                    />
                    <span className="menu-item-text">
                      <PixelText
                        font={font}
                        text={entry.label}
                        scale={3}
                        color={color}
                      />
                      {entry.slider && (
                        <BalanceSlider
                          pos={entry.slider.pos}
                          onChange={entry.slider.set}
                        />
                      )}
                      {entry.blurb && (
                        // Always occupy the blurb's row so selecting an item never
                        // changes its height. The menu is vertically centered, so a
                        // grow-on-hover row would shift every label (including the
                        // hovered one) — the flicker. Hidden when unselected keeps
                        // the space reserved without showing the text.
                        <span
                          className="menu-item-blurb"
                          style={{
                            visibility: selected ? "visible" : "hidden",
                          }}
                        >
                          <PixelText
                            font={font}
                            text={entry.blurb}
                            scale={2}
                            color="#9aa3ad"
                            maxWidth={blurbMaxWidth}
                          />
                        </span>
                      )}
                    </span>
                  </button>
                );
              })}
            </nav>
          )}

          {/* The import/export result line, under the SETTINGS - DATA menu. */}
          {screen === "data" && transferNotice && (
            <p
              className={`title-notice ${transferNotice.tone}`}
              role="status"
              aria-live="polite"
            >
              <PixelText
                font={font}
                text={transferNotice.text}
                scale={2}
                color={transferNotice.tone === "error" ? "#ff6d6d" : "#7ef0c8"}
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
              setCursor(onResume ? 4 : 3);
            }}
          />
        </Suspense>
      )}

      {/* The developer ARSENAL viewer: a full-screen overlay over the menu,
          mounted only while browsing (it owns its own keyboard navigation). */}
      {screen === "arsenal" && (
        <ArsenalScreen
          font={font}
          sprites={assets.sprites}
          onClose={() => {
            setScreen("developer");
            // Land back on VIEW ARSENAL — the second developer row.
            setCursor(1);
          }}
        />
      )}

      {!browserOpen && (
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
