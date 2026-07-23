// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// AUTO PILOT HUD — shown while the engine autopilot flies the hero (see
// src/game/autopilot.ts and the GameScreen wiring). Three pieces:
//
// - The PANEL: a small rounded control tucked into the top-right HUD column,
//   directly BELOW the minimap/kill strip (not pinned to the top edge, where
//   it used to collide with the iOS Dynamic Island). It carries an octagonal
//   speed button (tap to go faster), an octagonal stop-icon button, and a LOOT
//   row counting the session's special finds.
// - The COINS monitor: a live gold-coin readout sitting just under the panel —
//   the purse spelled out digit for digit (never compacted), so the per-tick
//   drain is watchable in the number itself.
// - The HISTORY: a modal (the LOOT button / "show more") listing every
//   special find of the session — upgrades, auto-equipped pieces, and
//   unique-or-better drops — newest first, with the level it dropped on. The
//   world keeps running behind it (the bot doesn't need the screen).
//
// All presentational; GameScreen owns the session state and the engine
// mutators. Finds are captured from `itemCollected` events there. The panel and
// coins monitor are rendered inside the minimap's HUD column so they align to
// it and inherit its safe-area handling.

import { PixelText } from "@ui/lib/PixelText.tsx";
import type { PixelFont } from "@ui/lib/pixel-font.ts";
import { formatCompact } from "@ui/lib/format-number.ts";

import { spriteDataUrl, type Sprites } from "../assets.ts";

/** One special find banked by the session's upgrade feed. */
export type AutopilotFind = {
  /** Session-unique id (the list key). */
  id: number;
  /** Display name, tinted `color` (the tier color). */
  name: string;
  color: string;
  /** Icon data URL (spriteDataUrl), when the piece has one. */
  icon?: string;
  /** The piece was auto-equipped on pickup. */
  equipped: boolean;
  /** The piece would improve its slot (the engine's upgrade flag). */
  upgrade: boolean;
  /** Name of the level it dropped on. */
  levelName: string;
};

const AMBER = "#ffcf6b";
const COIN = "#ffd75e";
const GREEN = "#5fd97a";
const GREY = "#9aa3ad";

/**
 * The AUTO PILOT control + live coin monitor. Rendered INSIDE the minimap's HUD
 * column (below the map/kill strip) so it aligns to the minimap and clears the
 * Dynamic Island. The LOOT history is a separate `AutopilotHistory` modal (it
 * needs the full shell, which this column can't provide).
 */
export function AutopilotOverlay({
  font,
  coins,
  speed,
  findsCount,
  onToggleHistory,
  onCycleSpeed,
  onStop,
}: {
  font: PixelFont;
  /** The live purse (hud.coins). */
  coins: number;
  /** The engaged speed rung (config `AUTOPILOT.speeds` — 1× to 16×). */
  speed: number;
  /** How many special finds the session has banked (the LOOT badge). */
  findsCount: number;
  onToggleHistory: () => void;
  onCycleSpeed: () => void;
  onStop: () => void;
}) {
  const stop = (event: { stopPropagation: () => void }) =>
    event.stopPropagation();

  return (
    <>
      {/* The control panel — a small rounded block under the minimap. Its head
          names the mode; the button row carries the octagonal speed rung (tap
          = faster) and stop-icon chips; the LOOT count rides its own
          full-width row underneath. */}
      <div className="autopilot-panel" onPointerDown={stop}>
        <div className="autopilot-panel-head">
          <PixelText font={font} text="AUTO PILOT" scale={2} color={AMBER} />
        </div>
        {/* Octagon chips — see .autopilot-speed/.autopilot-stop. */}
        <div className="autopilot-panel-buttons">
          <button
            type="button"
            className="pixel-button autopilot-speed"
            aria-label="autopilot-speed"
            onClick={onCycleSpeed}
          >
            <PixelText
              font={font}
              text={`${speed}×`}
              scale={2}
              color="#0b0d10"
            />
          </button>
          <button
            type="button"
            className="pixel-button secondary autopilot-stop"
            aria-label="autopilot-stop"
            onClick={onStop}
          >
            <span className="autopilot-stop-icon" />
          </button>
        </div>
        <button
          type="button"
          className="autopilot-loot"
          aria-label="autopilot-loot"
          onClick={onToggleHistory}
        >
          <PixelText font={font} text={`LOOT ${findsCount}`} scale={2} />
        </button>
      </div>

      {/* The live gold-coin monitor — the purse spelled out digit for digit
          (never compacted), so the engine's per-tick drain reads as the number
          counting down. */}
      <div className="autopilot-coins" onPointerDown={stop}>
        <PixelText
          font={font}
          text={Math.floor(coins).toLocaleString("en-US")}
          scale={2}
          color={COIN}
        />
      </div>
    </>
  );
}

/** One speed rung offered by the START picker — the multiplier, what a
 * game-second of it costs, how many game-seconds the purse buys at it, and
 * whether the purse can cover even a single second. */
export type AutopilotRung = {
  /** The speed/cost multiplier (config `AUTOPILOT.speeds` — 1× to 16×). */
  speed: number;
  /** Coins burned per GAME second at this rung. */
  cost: number;
  /** Whole GAME seconds the current purse funds at this rung (coins ÷ cost). */
  gameSeconds: number;
  /** The purse can cover at least one game-second at this rung. */
  affordable: boolean;
};

/** A game-second count as a compact M:SS clock (e.g. 500 → "8:20"). */
function formatGameClock(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

/**
 * The AUTO PILOT START picker — the modal raised from the pause menu's AUTO
 * PILOT button. The ride's PRICE lives HERE, at the moment of enabling it (not
 * on the pause screen): a column of speed rungs, the multiplier on the left and
 * its coins-per-game-second on the right, each rung greyed when the purse can't
 * fund a second of it. Picking a rung engages the ride at that speed. The foot
 * note reminds the player the meter bills GAME seconds, which a fast rung burns
 * through faster than real ones. Rendered at the game-shell root so it covers
 * the pause overlay and its buttons take the pointer.
 */
export function AutopilotStartModal({
  font,
  sprites,
  coins,
  rungs,
  onPick,
  onClose,
}: {
  font: PixelFont;
  /** The atlas — for the coin, stopwatch, and speed-bolt column icons. */
  sprites: Sprites;
  /** The live purse, shown so the affordability of each rung reads. */
  coins: number;
  /** The offered rungs (config `AUTOPILOT.speeds`), cheapest first. */
  rungs: AutopilotRung[];
  /** Engage the ride at the chosen multiplier. */
  onPick: (speed: number) => void;
  /** Dismiss without engaging (CANCEL / backdrop tap). */
  onClose: () => void;
}) {
  const stop = (event: { stopPropagation: () => void }) =>
    event.stopPropagation();
  const coinIcon = spriteDataUrl(sprites, "icon_coin");
  const clockIcon = spriteDataUrl(sprites, "icon_stopwatch");
  const speedIcon = spriteDataUrl(sprites, "icon_stat_speed");

  return (
    <div className="game-overlay" onPointerDown={onClose} role="presentation">
      <div className="intro-box autopilot-start" onPointerDown={stop}>
        <PixelText font={font} text="AUTO PILOT" scale={4} color={AMBER} />
        <div className="autopilot-start-purse">
          <PixelText font={font} text="PURSE" scale={2} color={GREY} />
          {coinIcon && (
            <img src={coinIcon} alt="" className="pixel-img autopilot-icon" />
          )}
          <PixelText
            font={font}
            text={Math.floor(coins).toLocaleString("en-US")}
            scale={2}
            color={COIN}
          />
        </div>
        <div className="autopilot-rungs">
          <div className="autopilot-rungs-head">
            <PixelText font={font} text="SPEED" scale={1} color={GREY} />
            <PixelText font={font} text="COINS/S" scale={1} color={GREY} />
            <PixelText font={font} text="GAME TIME" scale={1} color={GREY} />
          </div>
          {rungs.map((rung) => (
            <button
              key={rung.speed}
              type="button"
              className="pixel-button secondary autopilot-rung"
              aria-label={`autopilot-speed-${rung.speed}`}
              disabled={!rung.affordable}
              onClick={() => onPick(rung.speed)}
            >
              <span className="autopilot-cell">
                {speedIcon && (
                  <img
                    src={speedIcon}
                    alt=""
                    className="pixel-img autopilot-icon"
                  />
                )}
                <PixelText
                  font={font}
                  text={`${rung.speed}×`}
                  scale={3}
                  color={rung.affordable ? AMBER : GREY}
                />
              </span>
              <span className="autopilot-cell">
                {coinIcon && (
                  <img
                    src={coinIcon}
                    alt=""
                    className="pixel-img autopilot-icon"
                  />
                )}
                <PixelText
                  font={font}
                  text={formatCompact(rung.cost)}
                  scale={2}
                  color={rung.affordable ? COIN : GREY}
                />
              </span>
              <span className="autopilot-cell">
                {rung.affordable && clockIcon && (
                  <img
                    src={clockIcon}
                    alt=""
                    className="pixel-img autopilot-icon"
                  />
                )}
                <PixelText
                  font={font}
                  text={
                    rung.affordable ? formatGameClock(rung.gameSeconds) : "—"
                  }
                  scale={2}
                  color={rung.affordable ? GREEN : GREY}
                />
              </span>
            </button>
          ))}
        </div>
        <div className="autopilot-start-note">
          <PixelText
            font={font}
            text="SPEED FAST-FORWARDS THE RUN"
            scale={2}
            color={GREY}
          />
          <PixelText
            font={font}
            text="REAL TIME ≠ GAME TIME"
            scale={2}
            color={AMBER}
          />
        </div>
        <button
          type="button"
          className="pixel-button secondary autopilot-start-cancel"
          aria-label="autopilot-start-cancel"
          onClick={onClose}
        >
          <PixelText font={font} text="CANCEL" scale={2} />
        </button>
      </div>
    </div>
  );
}

/**
 * The AUTO PILOT LOOT history modal — the session's special finds, newest
 * first. Rendered at the game-shell root (not the HUD column) so it covers the
 * full screen and its buttons take the pointer.
 */
export function AutopilotHistory({
  font,
  finds,
  clears,
  deaths,
  coinsSpent,
  onClose,
}: {
  font: PixelFont;
  /** The session's special finds, oldest first (rendered newest first). */
  finds: AutopilotFind[];
  clears: number;
  deaths: number;
  /** Coins the whole session has burned (across restarts/advances). */
  coinsSpent: number;
  onClose: () => void;
}) {
  const stop = (event: { stopPropagation: () => void }) =>
    event.stopPropagation();

  return (
    <div className="game-overlay" onPointerDown={onClose} role="presentation">
      <div className="intro-box autopilot-history" onPointerDown={stop}>
        <PixelText font={font} text="AUTO PILOT LOOT" scale={3} color={AMBER} />
        <div className="autopilot-session-stats">
          <PixelText
            font={font}
            text={`CLEARS ${clears} · DEATHS ${deaths}`}
            scale={2}
            color={GREY}
          />
          <PixelText
            font={font}
            text={`COINS SPENT ${formatCompact(coinsSpent)}`}
            scale={2}
            color={COIN}
          />
        </div>
        <div className="autopilot-find-list">
          {finds.length === 0 && (
            <PixelText
              font={font}
              text="NO SPECIAL LOOT YET"
              scale={2}
              color={GREY}
            />
          )}
          {[...finds].reverse().map((find) => (
            <div key={find.id} className="autopilot-find">
              {find.icon && (
                <img
                  src={find.icon}
                  alt=""
                  className="pixel-img autopilot-find-icon"
                />
              )}
              <div className="autopilot-find-text">
                <PixelText
                  font={font}
                  text={find.name}
                  scale={2}
                  color={find.color}
                />
                <PixelText
                  font={font}
                  text={`${
                    find.equipped
                      ? "EQUIPPED · "
                      : find.upgrade
                        ? "UPGRADE · "
                        : ""
                  }${find.levelName}`}
                  scale={2}
                  color={find.equipped || find.upgrade ? GREEN : GREY}
                />
              </div>
            </div>
          ))}
        </div>
        <button
          type="button"
          className="pixel-button"
          aria-label="autopilot-history-close"
          onClick={onClose}
        >
          <PixelText font={font} text="CLOSE" scale={3} color="#0b0d10" />
        </button>
      </div>
    </div>
  );
}
