// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The Doom-style splash / main menu: a starfield, the big title, and a
// keyboard-and-pointer menu — NEW GAME leads to the difficulty ladder, and
// picking a difficulty starts the run. Menu structure is data (MENU/HELP
// arrays); the wisp sprite plays the part of Doom's skull cursor.

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";

import {
  DIFFICULTY_ORDER,
  difficultyDef,
  LEVEL_ORDER,
  levelDef,
  type Difficulty,
} from "@game/core";

import { PixelText } from "@ui/lib/PixelText.tsx";

import { IDENTITY } from "../identity.ts";

import { HELP_LINES } from "./copy.ts";

import { topScores, type ScoreMetric } from "./highscores.ts";

import { loadGameAssets, spriteDataUrl, type GameAssets } from "./assets.ts";
import { synth } from "./audio.ts";
import { haptics } from "./haptics.ts";
import { playTitleMusic } from "./music/index.ts";
import {
  firstUnclearedLevel,
  hasBeatenDifficulty,
  hasCompletedLevel,
  isLevelUnlocked,
} from "./progress.ts";
import { getSettings, updateSettings } from "./settings.ts";
import { playUiSound } from "./sfx/index.ts";

type MenuScreen =
  | "main"
  | "difficulty"
  | "levels"
  | "scores"
  | "settings"
  | "controls"
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

/** The high-score board's two rankings, in swipe/arrow order. */
const SCORE_METRICS: { id: ScoreMetric; label: string }[] = [
  { id: "time", label: "SURVIVAL TIME" },
  { id: "kpm", label: "KILLS / MIN" },
];

/** A minimum travel (CSS px) before a pointer drag counts as a swipe. */
const SWIPE_THRESHOLD = 36;

type MenuEntry = {
  label: string;
  aria: string;
  color?: string;
  blurb?: string;
  /** A shown-but-not-yet-playable entry (a locked level): the cursor still
   * lands on it, but choosing it just buzzes instead of starting. */
  locked?: boolean;
  action: () => void;
};

// Audio needs a user gesture; the first interaction with the menu doubles
// as the unlock, and the title theme starts with it.
function unlockAudio() {
  synth.unlock();
  playTitleMusic();
}

export function TitleScreen({
  onStart,
}: {
  onStart: (difficulty: Difficulty, levelId: string) => void;
}) {
  const [assets, setAssets] = useState<GameAssets | null>(null);
  const [screen, setScreen] = useState<MenuScreen>("main");
  // Cursor position per screen; the difficulty list opens on MEDIUM.
  const [cursor, setCursor] = useState(0);
  // The difficulty picked on the ladder — the level-select screen that
  // follows reads it to decide which levels are unlocked (progress is per
  // difficulty), and it carries into the run.
  const [difficulty, setDifficulty] = useState<Difficulty>("medium");
  // The HIGH SCORES board's axes: left/right picks the difficulty column,
  // up/down flips between the survival-time and kills-per-minute rankings.
  const [scoreDifficulty, setScoreDifficulty] = useState<Difficulty>("medium");
  const [scoreMetric, setScoreMetric] = useState<ScoreMetric>("time");
  // Landscape phones are short and portrait ones narrow: pick a logo scale
  // that keeps the title logo plus the menu inside both.
  const [compact, setCompact] = useState(
    () => window.matchMedia("(max-height: 480px)").matches,
  );
  const [wide, setWide] = useState(
    () => window.matchMedia("(min-width: 760px)").matches,
  );

  useEffect(() => {
    const short = window.matchMedia("(max-height: 480px)");
    const broad = window.matchMedia("(min-width: 760px)");
    const onChange = () => {
      setCompact(short.matches);
      setWide(broad.matches);
    };
    short.addEventListener("change", onChange);
    broad.addEventListener("change", onChange);
    return () => {
      short.removeEventListener("change", onChange);
      broad.removeEventListener("change", onChange);
    };
  }, []);
  const logoScale = compact ? 7 : wide ? 10 : 6;

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

  // Settings live in a plain singleton; mirror a tick so labels re-render.
  const [settingsTick, setSettingsTick] = useState(0);

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
        {
          label: "NEW GAME",
          aria: "new-game",
          action: () => {
            playUiSound(synth, "confirm");
            setScreen("difficulty");
            setCursor(DIFFICULTY_ORDER.indexOf("medium"));
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
    if (screen === "difficulty") {
      return [
        ...DIFFICULTY_ORDER.map((id) => {
          const def = difficultyDef(id);
          return {
            label: def.name,
            aria: `difficulty-${id}`,
            color: def.color,
            blurb: hasBeatenDifficulty(id)
              ? "CLEARED - CHOOSE ANY MISSION"
              : def.tagline,
            action: () => {
              setDifficulty(id);
              // The level select stays locked until the whole story is
              // cleared at this difficulty — first-timers are walked straight
              // through the campaign, dropped into the next unbeaten level.
              if (!hasBeatenDifficulty(id)) {
                playUiSound(synth, "start");
                onStart(id, firstUnclearedLevel(id));
                return;
              }
              playUiSound(synth, "confirm");
              setScreen("levels");
              // Open on the furthest level still reachable at this difficulty.
              const furthest = LEVEL_ORDER.reduce(
                (best, levelId, i) => (isLevelUnlocked(levelId, id) ? i : best),
                0,
              );
              setCursor(furthest);
            },
          };
        }),
        backTo("main", 0),
      ];
    }
    if (screen === "levels") {
      return [
        ...LEVEL_ORDER.map((id, i) => {
          const def = levelDef(id);
          const unlocked = isLevelUnlocked(id, difficulty);
          const cleared = hasCompletedLevel(id, difficulty);
          const blurb = !unlocked
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
              onStart(difficulty, id);
            },
          };
        }),
        backTo("difficulty", DIFFICULTY_ORDER.indexOf(difficulty)),
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
          label: `MUSIC ${pct(s.musicVolume)}`,
          aria: "settings-music-volume",
          blurb: "THE THEME FOLLOWS ALONG",
          action: () => {
            updateSettings({ musicVolume: cycleVolume(s.musicVolume) });
            setSettingsTick((t) => t + 1);
          },
        },
        {
          label: `SOUND FX ${pct(s.sfxVolume)}`,
          aria: "settings-sfx-volume",
          blurb: "BLASTERS, GHOSTS, PICKUPS",
          action: () => {
            updateSettings({ sfxVolume: cycleVolume(s.sfxVolume) });
            setSettingsTick((t) => t + 1);
            playUiSound(synth, "confirm"); // audition the new level
          },
        },
        backTo("main", 1),
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
    return [backTo("main", 2)];
    // `settingsTick` is an intentional invalidation key: the menu reads the
    // non-React settings store through getSettings(), so bumping the tick after
    // updateSettings is what rebuilds this list with the fresh values. eslint
    // can't see that dependency through getSettings(), so it wrongly flags the
    // tick as unnecessary — keep it and silence the false positive.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen, onStart, settingsTick, difficulty]);

  // The HIGH SCORES board is steered on two axes rather than a cursor list:
  // left/right walks the difficulty ladder, up/down flips the ranking. Both
  // are driven from arrows (below) and from swipes (the pointer handlers).
  const stepScoreDifficulty = useCallback((delta: number) => {
    unlockAudio();
    playUiSound(synth, "move");
    setScoreDifficulty((d) => {
      const n = DIFFICULTY_ORDER.length;
      const i = (DIFFICULTY_ORDER.indexOf(d) + delta + n) % n;
      return DIFFICULTY_ORDER[i] as Difficulty;
    });
  }, []);
  const stepScoreMetric = useCallback((delta: number) => {
    unlockAudio();
    playUiSound(synth, "move");
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
      if (screen === "scores") {
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
          setCursor(1);
        }
        return;
      }
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
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
        const back: Record<string, MenuScreen> = {
          controls: "settings",
          levels: "difficulty",
        };
        setScreen(back[screen] ?? "main");
        setCursor(0);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [entries, cursor, screen, stepScoreDifficulty, stepScoreMetric]);

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

  if (!assets) {
    return <div className="game-loading">Loading…</div>;
  }
  const font = assets.font;
  const cursorSprite = spriteDataUrl(assets.sprites, "wisp_0") ?? "";
  const scoreRows = topScores(scoreDifficulty, scoreMetric);
  const scoreDef = difficultyDef(scoreDifficulty);

  return (
    <div className="title-screen" onPointerDown={unlockAudio}>
      <div className="title-stars" aria-hidden="true" />
      {/* Asteroids drift across the backdrop now and then, so the menu feels
          alive rather than a static painting. */}
      <div className="title-asteroids" aria-hidden="true">
        <span className="title-asteroid title-asteroid-1" />
        <span className="title-asteroid title-asteroid-2" />
        <span className="title-asteroid title-asteroid-3" />
      </div>
      <div className="title-moon" aria-hidden="true" />

      <header className="title-logo">
        <h1 className="visually-hidden">{IDENTITY.title}</h1>
        <PixelText
          font={font}
          text={IDENTITY.title.toUpperCase()}
          scale={logoScale}
          color="#7ef0c8"
        />
        <PixelText
          font={font}
          text={IDENTITY.tagline.toUpperCase()}
          scale={1}
          color="#9aa3ad"
        />
      </header>

      {screen === "difficulty" && (
        <PixelText
          font={font}
          text="CHOOSE YOUR NIGHTMARE"
          scale={2}
          color="#d9a0f0"
        />
      )}
      {screen === "levels" && (
        <PixelText
          font={font}
          text="CHOOSE YOUR MISSION"
          scale={2}
          color="#d9a0f0"
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

      {screen === "help" && (
        <div className="title-help">
          {HELP_LINES.map((line, i) =>
            line === "" ? (
              <div key={i} className="intro-gap" />
            ) : (
              <PixelText key={i} font={font} text={line} scale={1} />
            ),
          )}
        </div>
      )}

      {screen === "scores" && (
        <>
          <PixelText font={font} text="HIGH SCORES" scale={2} color="#d9a0f0" />
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

            <button
              type="button"
              className="score-metric score-bob score-bob-delay"
              aria-label="score-metric"
              onClick={() => stepScoreMetric(1)}
            >
              <PixelText
                font={font}
                text={
                  SCORE_METRICS.find((m) => m.id === scoreMetric)?.label ?? ""
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
                  const primary =
                    scoreMetric === "time"
                      ? formatTime(row.timeMs)
                      : `${formatKpm(row.kpm)} KPM`;
                  const secondary =
                    scoreMetric === "time"
                      ? `${formatKpm(row.kpm)} KPM`
                      : formatTime(row.timeMs);
                  return (
                    <div className="score-row" key={i}>
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
                    </div>
                  );
                })
              )}
            </div>

            <PixelText
              font={font}
              text="SWIPE OR ARROWS TO SWITCH"
              scale={1}
              color="#7a8088"
            />
            <button
              type="button"
              className="score-back"
              aria-label="score-back"
              onClick={() => {
                playUiSound(synth, "back");
                setScreen("main");
                setCursor(1);
              }}
            >
              <PixelText font={font} text="BACK" scale={3} color="#ffd75e" />
            </button>
          </div>
        </>
      )}

      {screen !== "scores" && (
        <nav
          className={`title-menu${screen === "levels" ? " scrollable" : ""}`}
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
                // Keep the highlighted row in view as the level list scrolls.
                ref={
                  selected
                    ? (el) => el?.scrollIntoView({ block: "nearest" })
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
                  {entry.blurb && selected && (
                    <PixelText
                      font={font}
                      text={entry.blurb}
                      scale={1}
                      color="#9aa3ad"
                    />
                  )}
                </span>
              </button>
            );
          })}
        </nav>
      )}

      <footer className="title-footer">
        <span>
          v{__APP_VERSION__} · {__BUILD_COMMIT__}
        </span>
      </footer>
    </div>
  );
}
