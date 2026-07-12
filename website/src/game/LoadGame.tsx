// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// LOAD GAME — the hero roster, drawn as a column of framed SAVE SLOTS. Reached
// from the title menu by PLAY → LOAD GAME (or when a fallen hardcore hero drops
// the player back to the roster). Each slot is a save card: a dressed-hero
// portrait built from the stored build, the name, level, standing, a row of
// difficulty-progress pips, and a HARDCORE / FALLEN badge, with a delete tab
// down the right edge. Picking a living hero hands it up via `onPlay`; the
// dashed "+ NEW CHARACTER" slot routes to NEW GAME (`onNew`); BACK returns to
// the title (`onBack`).

import { useCallback, useEffect, useState, type CSSProperties } from "react";

import { DIFFICULTY_ORDER, difficultyDef } from "@game/core";

import { PixelText } from "@ui/lib/PixelText.tsx";

import {
  spriteCursor,
  spriteDataUrl,
  loadGameAssets,
  peekGameAssets,
  type GameAssets,
} from "./assets.ts";
import { synth } from "./audio.ts";
import {
  deleteCharacter,
  loadCharacters,
  type Character,
} from "./characters.ts";
import { dollDataUrl, loadoutDollLayers } from "./paper-doll.ts";
import { playUiSound } from "./sfx/index.ts";

/** The count of difficulties this hero has beaten — the roster's progress
 * read. */
function beatenCount(character: Character): number {
  return DIFFICULTY_ORDER.filter((d) => character.beaten.includes(d)).length;
}

/** The character's standing, shown under the name on their save slot: where a
 * living hero is headed next on the ladder, or that a hardcore hero fell. */
function standing(character: Character): string {
  if (character.dead) return "FALLEN IN BATTLE";
  const beaten = beatenCount(character);
  const nextRung = DIFFICULTY_ORDER[beaten];
  return nextRung ? `NEXT: ${difficultyDef(nextRung).name}` : "ALL CLEARED";
}

export function LoadGame({
  onPlay,
  onNew,
  onBack,
}: {
  /** A living hero was selected — play on with them (the app makes them active
   * and opens the difficulty ladder). */
  onPlay: (character: Character) => void;
  /** The player wants a fresh hero — route to the NEW GAME create form. */
  onNew: () => void;
  /** Leave the roster without picking anyone — back to the title menu. */
  onBack: () => void;
}) {
  const [assets, setAssets] = useState<GameAssets | null>(peekGameAssets);
  const [roster, setRoster] = useState<Character[]>(() => loadCharacters());
  // Which row the cursor rides (hover/focus), for the pointer glow.
  const [hover, setHover] = useState(0);

  useEffect(() => {
    if (assets) return;
    let live = true;
    void loadGameAssets().then((loaded) => {
      if (live) setAssets(loaded);
    });
    return () => {
      live = false;
    };
  }, [assets]);

  const remove = useCallback((id: string) => {
    playUiSound(synth, "back");
    deleteCharacter(id);
    setRoster(loadCharacters());
  }, []);

  if (!assets) return <div className="game-loading">Loading…</div>;
  const font = assets.font;
  const cursorSprite = spriteDataUrl(assets.sprites, "wisp_0") ?? "";
  // The menu's mouse pointer: a 16-bit Mickey glove, hotspot on the fingertip.
  // Fed to the whole screen through the --menu-cursor CSS var (see styles.css).
  // Must go through spriteCursor so the value carries a hotspot and fallback
  // keyword — a bare url() is an invalid CSS cursor and gets dropped.
  const menuCursor = spriteCursor(assets.sprites, "glove", {
    hotX: 3.5,
    hotY: 0.5,
    fallback: "default",
  });

  return (
    <div
      className="title-screen character-screen"
      style={{ "--menu-cursor": menuCursor } as CSSProperties}
    >
      <div className="title-stars" aria-hidden="true" />

      <div className="title-content">
        <header className="character-heading">
          <PixelText font={font} text="SELECT HERO" scale={3} color="#ffd75e" />
        </header>

        <nav className="hero-slots scrollable" aria-label="character roster">
          {roster.map((character, i) => {
            const selected = i === hover;
            const fallen = character.dead;
            const level = character.loadout?.level ?? 1;
            const portrait =
              dollDataUrl(
                assets.sprites,
                loadoutDollLayers(character.loadout),
              ) ?? cursorSprite;
            const nameColor = fallen
              ? "#7f5a5a"
              : selected
                ? "#ffd75e"
                : "#e6e8eb";
            return (
              <div
                key={character.id}
                className={`hero-slot${selected ? " selected" : ""}${
                  fallen ? " fallen" : ""
                }`}
              >
                <button
                  type="button"
                  className="hero-slot-main"
                  aria-label={`character-${character.id}`}
                  onPointerEnter={() => {
                    if (i !== hover) {
                      playUiSound(synth, "move");
                      setHover(i);
                    }
                  }}
                  onClick={() => {
                    if (fallen) {
                      playUiSound(synth, "back");
                      return;
                    }
                    playUiSound(synth, "start");
                    onPlay(character);
                  }}
                >
                  <span className="hero-slot-portrait">
                    <img src={portrait} alt="" className="pixel-img" />
                  </span>
                  <span className="hero-slot-info">
                    <span className="hero-slot-name">
                      <PixelText
                        font={font}
                        text={character.name}
                        scale={3}
                        color={nameColor}
                      />
                      {character.hardcore && (
                        <span
                          className={`hero-slot-badge${fallen ? " fallen" : ""}`}
                        >
                          <PixelText
                            font={font}
                            text={fallen ? "FALLEN" : "HARDCORE"}
                            scale={2}
                            color={fallen ? "#ff9d9d" : "#ff6d6d"}
                          />
                        </span>
                      )}
                    </span>
                    <span className="hero-slot-meta">
                      <PixelText
                        font={font}
                        text={`LVL ${level}`}
                        scale={2}
                        color={fallen ? "#7f5a5a" : "#ffd75e"}
                      />
                      <span className="hero-slot-dot" aria-hidden="true" />
                      <PixelText
                        font={font}
                        text={standing(character)}
                        scale={2}
                        color={fallen ? "#7f5a5a" : "#9aa3ad"}
                      />
                    </span>
                    <span
                      className="hero-slot-pips"
                      aria-hidden="true"
                      title="difficulties beaten"
                    >
                      {DIFFICULTY_ORDER.map((id) => {
                        const won = character.beaten.includes(id);
                        return (
                          <span
                            key={id}
                            className={`hero-slot-pip${won ? " won" : ""}`}
                            style={
                              {
                                "--pip": difficultyDef(id).color,
                              } as CSSProperties
                            }
                          />
                        );
                      })}
                    </span>
                  </span>
                </button>
                <button
                  type="button"
                  className="hero-slot-delete"
                  aria-label={`delete-${character.id}`}
                  title="DELETE"
                  onClick={() => remove(character.id)}
                >
                  <PixelText font={font} text="X" scale={2} color="#ff8a8a" />
                </button>
              </div>
            );
          })}

          <button
            type="button"
            className="hero-slot-new"
            aria-label="character-new"
            onPointerEnter={() => setHover(-1)}
            onClick={() => {
              playUiSound(synth, "confirm");
              onNew();
            }}
          >
            <PixelText
              font={font}
              text="+ NEW CHARACTER"
              scale={3}
              color="#7ef0c8"
            />
          </button>

          <button
            type="button"
            className="hero-slot-back"
            aria-label="character-back"
            onPointerEnter={() => setHover(-2)}
            onClick={() => {
              playUiSound(synth, "back");
              onBack();
            }}
          >
            <PixelText font={font} text="BACK" scale={2} color="#9aa3ad" />
          </button>
        </nav>
      </div>
    </div>
  );
}
