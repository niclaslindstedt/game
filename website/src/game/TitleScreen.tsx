// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The Doom-style splash / main menu: a starfield, the big title, and a
// keyboard-and-pointer menu — NEW GAME leads to the difficulty ladder, and
// picking a difficulty starts the run. Menu structure is data (MENU/HELP
// arrays); the wisp sprite plays the part of Doom's skull cursor.

import { useEffect, useMemo, useState } from "react";

import { DIFFICULTY_ORDER, difficultyDef, type Difficulty } from "@game/core";

import { PixelText } from "@ui/lib/PixelText.tsx";

import { IDENTITY } from "../identity.ts";

import { loadGameAssets, spriteDataUrl, type GameAssets } from "./assets.ts";
import { synth } from "./audio.ts";
import { playTitleMusic } from "./music/index.ts";
import { getSettings, updateSettings } from "./settings.ts";
import { playUiSound } from "./sfx/index.ts";

type MenuScreen = "main" | "difficulty" | "settings" | "controls" | "help";

/** Per-difficulty menu color: the ladder heats up as it descends. */
const DIFFICULTY_COLORS: Record<Difficulty, string> = {
  easy: "#7ef0c8",
  medium: "#4da6ff",
  hard: "#ffd75e",
  nightmare: "#ff8c42",
  jesus: "#d83a3a",
};

const HELP_LINES = [
  "STEER WITH THE POINTER - ON DESKTOP",
  "YOUR CHARACTER CHASES THE CURSOR. ON",
  "TOUCH, HOLD AND DRAG - A JOYSTICK",
  "APPEARS UNDER YOUR FINGER AND YOU",
  "WALK THE WAY YOU DRAG.",
  "",
  "TAP TO JUMP (WITH THE OTHER HAND",
  "WHILE STEERING) OR PRESS SPACE -",
  "MOON GRAVITY CARRIES YOU OVER THE",
  "GHOSTS.",
  "",
  "YOUR CHARACTER FIGHTS ON ITS OWN WITH",
  "WHATEVER IS EQUIPPED. LOOT THE",
  "HAUNTING, SPEND LEVEL-UPS, AND TAKE",
  "THE FIGHT TO THE OLD FLAG.",
  "",
  "CLICK (OR THE USE BUTTON, OR E) TO",
  "USE A CARRIED POWER. PRESS I FOR THE",
  "BAG. TUNE IT ALL UNDER SETTINGS.",
  "",
  "WORKS OFFLINE - INSTALL IT AS AN APP",
  "FROM YOUR BROWSER MENU.",
];

const pct = (v: number) => `${Math.round(v * 100)}%`;
/** 0 → 25 → 50 → 75 → 100 → 0, in quarter steps. */
const cycleVolume = (v: number) => ((Math.round(v * 4) + 1) % 5) / 4;

type MenuEntry = {
  label: string;
  aria: string;
  color?: string;
  blurb?: string;
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
  onStart: (difficulty: Difficulty) => void;
}) {
  const [assets, setAssets] = useState<GameAssets | null>(null);
  const [screen, setScreen] = useState<MenuScreen>("main");
  // Cursor position per screen; the difficulty list opens on MEDIUM.
  const [cursor, setCursor] = useState(0);
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
            color: DIFFICULTY_COLORS[id],
            blurb: def.tagline,
            action: () => {
              playUiSound(synth, "start");
              onStart(id);
            },
          };
        }),
        backTo("main", 0),
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
            s.itemUse === "auto"
              ? "ITEMS: USE INSTANTLY"
              : "ITEMS: USE MANUALLY",
          aria: "controls-item-use",
          blurb:
            s.itemUse === "auto"
              ? "POWERS POP THE MOMENT YOU TOUCH THEM"
              : "CLICK / THE USE BUTTON / E SPENDS ONE",
          action: () => {
            playUiSound(synth, "confirm");
            updateSettings({
              itemUse: s.itemUse === "auto" ? "manual" : "auto",
            });
            setSettingsTick((t) => t + 1);
          },
        },
        backTo("settings", 0),
      ];
    }
    return [backTo("main", 2)];
  }, [screen, onStart, settingsTick]);

  // Doom menus live on the keyboard: arrows move, Enter/Space picks,
  // Escape backs out.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
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
        setScreen(screen === "controls" ? "settings" : "main");
        setCursor(0);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [entries, cursor, screen]);

  if (!assets) {
    return <div className="game-loading">Loading…</div>;
  }
  const font = assets.font;
  const cursorSprite = spriteDataUrl(assets.sprites, "wisp_0") ?? "";

  return (
    <div className="title-screen" onPointerDown={unlockAudio}>
      <div className="title-stars" aria-hidden="true" />
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

      <nav className="title-menu" aria-label="main menu">
        {entries.map((entry, i) => {
          const selected = i === cursor;
          const color = selected ? (entry.color ?? "#ffd75e") : "#9aa3ad";
          return (
            <button
              key={entry.aria}
              type="button"
              className={`menu-item${selected ? " selected" : ""}`}
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

      <footer className="title-footer">
        <a href={IDENTITY.repoUrl} target="_blank" rel="noreferrer">
          source code
        </a>
        <span>
          v{__APP_VERSION__} · {__BUILD_COMMIT__}
        </span>
      </footer>
    </div>
  );
}
