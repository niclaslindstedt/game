// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The CHARACTER roster + creation screen — reached from the title menu by PLAY
// (with no active hero) or CHARACTERS. A player picks a living hero to play on,
// creates a new one (naming it and choosing HARDCORE here, where the choice
// belongs), retires the fallen, or backs out (`onBack`) to the title. Selecting
// or creating a hero hands it up via `onPlay`; when PLAY sent them here the
// title's difficulty ladder follows for that character.

import { useCallback, useEffect, useState, type CSSProperties } from "react";

import { DIFFICULTY_ORDER, difficultyDef } from "@game/core";

import { PixelText } from "@ui/lib/PixelText.tsx";

import {
  spriteCursor,
  spriteDataUrl,
  loadGameAssets,
  type GameAssets,
} from "./assets.ts";
import { synth } from "./audio.ts";
import {
  createCharacter,
  deleteCharacter,
  loadCharacters,
  type Character,
} from "./characters.ts";
import { playUiSound } from "./sfx/index.ts";

const MAX_NAME = 14;

/** The count of difficulties this hero has beaten — the roster's progress
 * read. */
function beatenCount(character: Character): number {
  return DIFFICULTY_ORDER.filter((d) => character.beaten.includes(d)).length;
}

/** One-line roster summary: level, the rung they're on, and their state. */
function summarize(character: Character): string {
  const level = character.loadout?.level ?? 1;
  if (character.dead) return `FALLEN · LVL ${level} · HARDCORE`;
  const beaten = beatenCount(character);
  const nextRung = DIFFICULTY_ORDER[beaten];
  const where = nextRung ? `${difficultyDef(nextRung).name}` : "ALL CLEARED";
  const tag = character.hardcore ? " · HARDCORE" : "";
  return `LVL ${level} · ${where}${tag}`;
}

export function CharacterScreen({
  onPlay,
  onBack,
}: {
  /** A living hero was selected or freshly created — play on with them (the
   * app makes them active and opens the difficulty ladder). */
  onPlay: (character: Character) => void;
  /** Leave the roster without picking anyone — back to the title menu. */
  onBack: () => void;
}) {
  const [assets, setAssets] = useState<GameAssets | null>(null);
  const [roster, setRoster] = useState<Character[]>(() => loadCharacters());
  // An empty roster opens straight into creation — there is nothing to pick.
  const [creating, setCreating] = useState(() => roster.length === 0);
  const [name, setName] = useState("");
  const [hardcore, setHardcore] = useState(false);
  // Which row the cursor rides (hover/focus), for the pointer glow.
  const [hover, setHover] = useState(0);

  useEffect(() => {
    let live = true;
    void loadGameAssets().then((loaded) => {
      if (live) setAssets(loaded);
    });
    return () => {
      live = false;
    };
  }, []);

  const refresh = useCallback(() => setRoster(loadCharacters()), []);

  const create = useCallback(() => {
    playUiSound(synth, "start");
    const character = createCharacter(name, hardcore);
    onPlay(character);
  }, [name, hardcore, onPlay]);

  const remove = useCallback(
    (id: string) => {
      playUiSound(synth, "back");
      deleteCharacter(id);
      refresh();
    },
    [refresh],
  );

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

      <header className="character-heading">
        <PixelText
          font={font}
          text={creating ? "NEW HERO" : "SELECT HERO"}
          scale={3}
          color="#ffd75e"
        />
      </header>

      {creating ? (
        <div className="character-form" aria-label="create character">
          <label className="character-field">
            <PixelText font={font} text="NAME" scale={2} color="#9aa3ad" />
            <input
              className="character-name-input"
              aria-label="character-name"
              value={name}
              maxLength={MAX_NAME}
              autoFocus
              spellCheck={false}
              onChange={(e) =>
                setName(e.target.value.toUpperCase().slice(0, MAX_NAME))
              }
              onKeyDown={(e) => {
                if (e.key === "Enter" && name.trim()) create();
              }}
              placeholder="HERO"
            />
          </label>

          <button
            type="button"
            className={`menu-item character-toggle${hardcore ? " on" : ""}`}
            aria-label="character-hardcore"
            onClick={() => {
              playUiSound(synth, "confirm");
              setHardcore((h) => !h);
            }}
          >
            <span className="menu-item-text">
              <PixelText
                font={font}
                text={hardcore ? "HARDCORE: ON" : "HARDCORE: OFF"}
                scale={3}
                color={hardcore ? "#ff6d6d" : "#9aa3ad"}
              />
              <span className="menu-item-blurb">
                <PixelText
                  font={font}
                  text={
                    hardcore
                      ? "ONE LIFE - DEATH RETIRES THIS HERO FOREVER"
                      : "SOFTCORE - DEATH KEEPS YOUR PROGRESS"
                  }
                  scale={2}
                  color="#9aa3ad"
                />
              </span>
            </span>
          </button>

          <div className="character-actions">
            <button
              type="button"
              className="menu-item character-confirm"
              aria-label="character-create"
              onClick={create}
            >
              <PixelText font={font} text="CREATE" scale={3} color="#7ef0c8" />
            </button>
            <button
              type="button"
              className="menu-item character-cancel"
              aria-label="character-cancel"
              onClick={() => {
                playUiSound(synth, "back");
                // With heroes to fall back on, CANCEL returns to the roster;
                // with none (the create form opened straight up) it backs all
                // the way out to the title menu.
                if (roster.length > 0) {
                  setCreating(false);
                  setName("");
                  setHardcore(false);
                } else {
                  onBack();
                }
              }}
            >
              <PixelText font={font} text="CANCEL" scale={3} color="#9aa3ad" />
            </button>
          </div>
        </div>
      ) : (
        <nav className="title-menu scrollable" aria-label="character roster">
          {roster.map((character, i) => {
            const selected = i === hover;
            const fallen = character.dead;
            const color = fallen ? "#5a6068" : selected ? "#ffd75e" : "#9aa3ad";
            return (
              <div key={character.id} className="character-row">
                <button
                  type="button"
                  className={`menu-item${selected ? " selected" : ""}${
                    fallen ? " locked" : ""
                  }`}
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
                  <img
                    src={cursorSprite}
                    alt=""
                    className="menu-cursor"
                    style={{ visibility: selected ? "visible" : "hidden" }}
                  />
                  <span className="menu-item-text">
                    <PixelText
                      font={font}
                      text={character.name}
                      scale={3}
                      color={color}
                    />
                    <span
                      className="menu-item-blurb"
                      style={{ visibility: "visible" }}
                    >
                      <PixelText
                        font={font}
                        text={summarize(character)}
                        scale={2}
                        color={fallen ? "#5a6068" : "#9aa3ad"}
                      />
                    </span>
                  </span>
                </button>
                <button
                  type="button"
                  className="character-delete"
                  aria-label={`delete-${character.id}`}
                  title="DELETE"
                  onClick={() => remove(character.id)}
                >
                  <PixelText font={font} text="X" scale={2} color="#ff6d6d" />
                </button>
              </div>
            );
          })}

          <button
            type="button"
            className="menu-item character-new"
            aria-label="character-new"
            onPointerEnter={() => setHover(-1)}
            onClick={() => {
              playUiSound(synth, "confirm");
              setCreating(true);
              setName("");
              setHardcore(false);
            }}
          >
            <span className="menu-item-text">
              <PixelText
                font={font}
                text="+ NEW CHARACTER"
                scale={3}
                color="#7ef0c8"
              />
            </span>
          </button>

          <button
            type="button"
            className="menu-item character-back"
            aria-label="character-back"
            onPointerEnter={() => setHover(-2)}
            onClick={() => {
              playUiSound(synth, "back");
              onBack();
            }}
          >
            <span className="menu-item-text">
              <PixelText font={font} text="BACK" scale={3} color="#9aa3ad" />
            </span>
          </button>
        </nav>
      )}
    </div>
  );
}
