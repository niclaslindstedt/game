// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The CHARACTER modal — D2's character screen, raised by pressing the hero's
// PORTRAIT in the HUD (the bag pouch beside it raises the bag). It is the home
// of every number the hero carries: who he is, how far through the level he is,
// his five attributes, and the derived offense / defense / body figures that
// used to hide in a hover popover tucked under the old inventory's portrait —
// a place nobody found unless they were told it was there.
//
// It shares the engine's `inventory` phase with the bag rather than owning one
// of its own — pressing either HUD button freezes the run the same way, and the
// app decides WHICH half of the character screen is showing (see GameScreen's
// `charTab`). So the two panels are one screen with two faces: BAG swaps to the
// inventory, CLOSE leaves both.
//
// Every row comes out of char-stats.ts, the one reader of the engine's derived
// stats, so this file is pure layout: adding a figure to the hero's page is a
// row in that model, never markup here.

import { xpToLevelUp, type Difficulty, type GameState } from "@game/core";

import { formatCompact } from "@ui/lib/format-number.ts";
import type { PixelFont } from "@ui/lib/pixel-font.ts";
import { PixelText } from "@ui/lib/PixelText.tsx";

import { spriteDataUrl, type Sprites } from "./assets.ts";
import { synth } from "./audio.ts";
import { characterStatGroups, type StatReadout } from "./char-stats.ts";
import { dollDataUrl } from "./paper-doll.ts";
import { playerDollLayers } from "./paper-doll-live.ts";
import { playUiSound } from "./sfx/ui.ts";

const LABEL = "#9aa3ad";

/** One sheet line: the glyph and label pinned left, the value pinned right —
 * the character-sheet read, not a wrapping sentence. */
function SheetRow({
  font,
  sprites,
  readout,
}: {
  font: PixelFont;
  sprites: Sprites;
  readout: StatReadout;
}) {
  const icon = readout.icon ? spriteDataUrl(sprites, readout.icon) : undefined;
  return (
    <div className="sheet-row">
      <span className="sheet-row-label">
        {icon && (
          <img
            src={icon}
            alt=""
            className="pixel-img sheet-row-icon"
            draggable={false}
          />
        )}
        <PixelText font={font} text={readout.label} scale={1} color={LABEL} />
      </span>
      <span className="sheet-row-value">
        <PixelText
          font={font}
          text={readout.value}
          scale={1}
          color={readout.color}
        />
      </span>
    </div>
  );
}

export function CharacterSheet({
  state,
  font,
  sprites,
  heroName,
  hardcore,
  difficulty,
  onOpenBag,
  onClose,
}: {
  state: GameState;
  font: PixelFont;
  sprites: Sprites;
  /** The roster name of the hero playing this run (the engine never carries
   * one — a run is a build, the name lives on the character). */
  heroName: string;
  hardcore: boolean;
  difficulty: Difficulty;
  /** Swap to the other face of the character screen — the bag. */
  onOpenBag: () => void;
  onClose: () => void;
}) {
  const player = state.player;
  const groups = characterStatGroups(state);
  const toNext = xpToLevelUp(player.level, difficulty);
  const into = Math.max(0, toNext - player.xpToNext);
  const avatar =
    dollDataUrl(sprites, playerDollLayers(state, "0", { weapon: false })) ??
    undefined;

  return (
    <div
      className="game-overlay char-overlay"
      // A tap on the dark backdrop, clear of the sheet, closes it — the same
      // out-of-the-way dismissal every modal in the game offers.
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="char-panel pixel-panel">
        {/* The head plate: the dressed bust with the hero's rank on its corner
            (the HUD avatar's own look, so the player recognises what they
            pressed), the name, the run's rung, and the level bar. */}
        <div className="char-head">
          <span className="char-bust">
            {avatar && (
              <img
                src={avatar}
                alt=""
                className="pixel-img char-bust-img"
                draggable={false}
              />
            )}
            <span className="char-bust-level">
              <PixelText
                font={font}
                text={String(player.level)}
                scale={1}
                color="#ffd75e"
              />
            </span>
          </span>
          <div className="char-head-text">
            <PixelText font={font} text={heroName} scale={3} color="#f4f4f4" />
            <PixelText
              font={font}
              text={`${difficulty.toUpperCase()} - ${
                hardcore ? "HARDCORE" : "SOFTCORE"
              }`}
              scale={1}
              color={hardcore ? "#e06a6a" : LABEL}
            />
            <div className="char-xp">
              <div
                className="char-xp-fill"
                style={{ width: `${Math.min(100, (100 * into) / toNext)}%` }}
              />
            </div>
            <PixelText
              font={font}
              text={`${formatCompact(into)} / ${formatCompact(toNext)} XP`}
              scale={1}
              color={LABEL}
            />
          </div>
        </div>

        {/* The sheet proper: one framed block per group, folding from four
            columns on a desktop down to one on a narrow phone. */}
        <div className="char-groups">
          {groups.map((group) => (
            <div key={group.title} className="char-group">
              <PixelText
                font={font}
                text={group.title}
                scale={1}
                color="#6f7684"
              />
              <div className="char-group-rows">
                {group.rows.map((readout) => (
                  <SheetRow
                    key={readout.key}
                    font={font}
                    sprites={sprites}
                    readout={readout}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="char-foot">
          {/* The purse rides the sheet's foot the way D2's gold rides the
              inventory's — the one number that is neither an attribute nor a
              derived figure. */}
          <span className="char-purse">
            {(() => {
              const coin = spriteDataUrl(sprites, "icon_coins");
              return coin ? (
                <img
                  src={coin}
                  alt=""
                  className="pixel-img char-purse-icon"
                  draggable={false}
                />
              ) : null;
            })()}
            <PixelText
              font={font}
              text={formatCompact(player.coins)}
              scale={2}
              color="#ffd75e"
            />
          </span>
          <div className="char-foot-buttons">
            <button
              type="button"
              className="pixel-button secondary"
              aria-label="open-inventory"
              onClick={() => {
                playUiSound(synth, "confirm");
                onOpenBag();
              }}
            >
              <PixelText font={font} text="BAG" scale={2} color="#e6e8eb" />
            </button>
            <button
              type="button"
              className="pixel-button modal-close-btn char-close-btn"
              aria-label="close-character"
              onClick={onClose}
            >
              <PixelText font={font} text="CLOSE" scale={2} color="#0b0d10" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
