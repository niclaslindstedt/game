// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// LOAD GAME — the hero roster, drawn as a column of framed SAVE SLOTS. Reached
// from the title menu by PLAY → LOAD GAME (or when a fallen hardcore hero drops
// the player back to the roster). Each slot is a save card: a dressed-hero
// portrait built from the stored build, the name, level, standing, a row of
// difficulty-progress pips, and a HARDCORE / FALLEN badge, with a delete tab
// down the right edge. Picking a living hero hands it up via `onPlay`; BACK
// returns to the title (`onBack`), as does deleting the last hero on the
// roster — an empty roster has nothing left to do here. Minting a fresh hero
// lives on the title menu's NEW GAME entry, not here.

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";

import { DIFFICULTY_ORDER, difficultyDef } from "@game/menu";

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
  nextDifficultyFor,
  type Character,
} from "./characters.ts";
import { LoadingScreen } from "./LoadingScreen.tsx";
import { dollDataUrl, loadoutDollLayers } from "./paper-doll.ts";
import { playUiSound } from "./sfx/ui.ts";
import { MenuList } from "./title-screen/MenuList.tsx";

/** The `hover` value that means "the cursor is on the BACK row", not on a
 * roster slot — negative so it can never collide with a slot index. */
const BACK_ROW = -2;

/** The character's standing, shown under the name on their save slot: where a
 * living hero is headed next on the ladder, or that a hardcore hero fell. The
 * next rung follows the OR-gated unlock graph (`nextDifficultyFor`), so beating
 * any starting lane points at NIGHTMARE and beating NIGHTMARE at JESUS. */
function standing(character: Character): string {
  if (character.dead) return "FALLEN IN BATTLE";
  const nextRung = nextDifficultyFor(character);
  return nextRung ? `NEXT: ${difficultyDef(nextRung).name}` : "ALL CLEARED";
}

export function LoadGame({
  onPlay,
  onBack,
}: {
  /** A living hero was selected — play on with them: the app makes them active
   * and, when a campaign is under way, drops straight into the beginning of
   * their current level; a hero with nothing in progress opens the difficulty
   * ladder to pick a lane or step up a rung. */
  onPlay: (character: Character) => void;
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

  // Deleting the LAST hero leaves the screen with nothing to select and no way
  // to mint a replacement — minting lives on the title menu's NEW GAME — so an
  // empty roster shows itself out rather than parking the player on a blank
  // column above a lone BACK row. The title menu drops its own LOAD GAME row
  // the moment the roster empties, so the exit lands somewhere consistent.
  const remove = useCallback(
    (id: string) => {
      playUiSound(synth, "back");
      deleteCharacter(id);
      const remaining = loadCharacters();
      setRoster(remaining);
      if (remaining.length === 0) onBack();
    },
    [onBack],
  );

  // The BACK row is drawn by the title menu's own MenuList, so the roster
  // leaves the screen through exactly the row every other menu uses — same
  // size, same wisp/icon slot, same sounds — instead of a small bare caption.
  const backEntries = useMemo(
    () => [
      {
        label: "BACK",
        // Not a title-menu screen, so it names itself rather than borrowing a
        // tree row's id (every menu BACK is "<screen>-back").
        aria: "roster-back",
        icon: "icon_menu_back",
        action: () => {
          playUiSound(synth, "back");
          onBack();
        },
      },
    ],
    [onBack],
  );
  const backMenuRef = useRef<HTMLElement | null>(null);
  const backRowRef = useRef<HTMLButtonElement | null>(null);

  if (!assets) return <LoadingScreen />;
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
        </nav>

        <MenuList
          font={font}
          sprites={assets.sprites}
          entries={backEntries}
          cursor={hover === BACK_ROW ? 0 : -1}
          setCursor={() => setHover(BACK_ROW)}
          cursorSprite={cursorSprite}
          blurbMaxWidth={undefined}
          useHelpLine={false}
          scrollable={false}
          menuRef={backMenuRef}
          selectedRowRef={backRowRef}
          ariaLabel="roster back"
        />
      </div>
    </div>
  );
}
