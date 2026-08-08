// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// AUTO PILOT HUD — shown while the engine autopilot flies the hero (see
// src/game/autopilot.ts and the GameScreen wiring). Three pieces:
//
// - The PANEL: a small rounded control tucked into the top-right HUD column,
//   directly BELOW the minimap/kill strip (not pinned to the top edge, where
//   it used to collide with the iOS Dynamic Island). It carries three octagon
//   chips: a speed button (tap to go faster), a stop-icon button, and a satchel
//   opening the session's LOOT history.
// - The COINS monitor: a live gold-coin readout sitting just under the panel,
//   the purse through `formatCoins` — abbreviated while it is fat (`10.5K`) and
//   spelled out digit for digit under 10,000, which is exactly when a draining
//   purse is worth watching tick by tick.
// - The HISTORY: a modal (the satchel chip / "show more") opening on a session
//   SCOREBOARD — the ride's COST under the heading, then a tile grid of its
//   tally (clears, deaths) and the progress it WON (levels climbed, stat &
//   talent points earned, coins EARNED) — above the list of every special find
//   of the session (upgrades, auto-equipped pieces, and unique-or-better
//   drops), newest first, with the level it dropped on. The world keeps running
//   behind it (the bot doesn't need the screen). That list scrolls VERTICALLY
//   ONLY — a long affix-built name folds onto a second line rather than running
//   off the box and dragging the whole modal sideways.
//
// All presentational; GameScreen owns the session state and the engine
// mutators. Finds are captured from `itemCollected` events there. The panel and
// coins monitor are rendered inside the minimap's HUD column so they align to
// it and inherit its safe-area handling.

import { useLayoutEffect, useRef, useState, type RefObject } from "react";

import { PixelText } from "@ui/lib/PixelText.tsx";
import type { PixelFont } from "@ui/lib/pixel-font.ts";
import { formatCoins } from "@ui/lib/format-number.ts";

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
const WARN = "#ff6b6b";

/**
 * The AUTO PILOT control + live coin monitor. Rendered INSIDE the minimap's HUD
 * column (below the map/kill strip) so it aligns to the minimap and clears the
 * Dynamic Island. The LOOT history is a separate `AutopilotHistory` modal (it
 * needs the full shell, which this column can't provide).
 */
export function AutopilotOverlay({
  font,
  sprites,
  coins,
  speed,
  onToggleHistory,
  onCycleSpeed,
  onStop,
}: {
  font: PixelFont;
  /** The sprite atlas — the LOOT chip draws the satchel icon from it. */
  sprites: Sprites;
  /** The live purse (hud.coins). */
  coins: number;
  /** The engaged speed rung (config `AUTOPILOT.speeds` — 1× to 16×). */
  speed: number;
  onToggleHistory: () => void;
  onCycleSpeed: () => void;
  onStop: () => void;
}) {
  const stop = (event: { stopPropagation: () => void }) =>
    event.stopPropagation();
  const bagIcon = spriteDataUrl(sprites, "icon_bag");

  return (
    <>
      {/* The control panel — a small rounded block under the minimap. Its head
          names the mode; the button row carries three matched octagon chips:
          the speed rung (tap = faster), STOP, and the satchel that opens the
          LOOT history. */}
      <div className="autopilot-panel" onPointerDown={stop}>
        <div className="autopilot-panel-head">
          <PixelText font={font} text="AUTO PILOT" scale={2} color={AMBER} />
        </div>
        {/* Octagon chips — see .autopilot-speed/.autopilot-stop/.autopilot-loot. */}
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
          <button
            type="button"
            className="pixel-button secondary autopilot-loot"
            aria-label="autopilot-loot"
            onClick={onToggleHistory}
          >
            {bagIcon && (
              <img
                src={bagIcon}
                alt=""
                className="pixel-img autopilot-loot-icon"
                draggable={false}
              />
            )}
          </button>
        </div>
      </div>

      {/* The live gold-coin monitor. `formatCoins` keeps it at most four glyphs
          wide however rich the hero is (`10.5K`), and spells the purse out
          digit for digit below 10,000 — so the engine's per-tick drain reads as
          the number counting down exactly when the ride is running out. */}
      <div className="autopilot-coins" onPointerDown={stop}>
        <PixelText
          font={font}
          text={formatCoins(Math.floor(coins))}
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
 * through faster than real ones. Its footer pairs CANCEL with a STORE button
 * (where the build has a store) opening the in-run COIN STORE, so a purse too
 * thin to fly can be topped up without abandoning the run. Rendered at the
 * game-shell root so it covers the pause overlay and its buttons take the
 * pointer.
 */
export function AutopilotStartModal({
  font,
  sprites,
  coins,
  rungs,
  onPick,
  onStore,
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
  /** Open the in-run COIN STORE (buy coins without leaving the run). Absent
   * where this build has no store at all — see `coinStoreAvailable`. */
  onStore?: () => void;
  /** Dismiss without engaging (CANCEL / backdrop tap). */
  onClose: () => void;
}) {
  const stop = (event: { stopPropagation: () => void }) =>
    event.stopPropagation();
  // The purse can't fund even a single game-second at the CHEAPEST rung — the
  // ride is out of reach entirely. Call it out plainly and point the player at
  // the fix (sell gear for coins) rather than leaving a wall of greyed rungs.
  const cannotAfford =
    rungs.length > 0 && rungs.every((rung) => !rung.affordable);
  const coinIcon = spriteDataUrl(sprites, "icon_coin");
  const clockIcon = spriteDataUrl(sprites, "icon_stopwatch");

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
            text={formatCoins(Math.floor(coins))}
            scale={2}
            color={COIN}
          />
        </div>
        <div className="autopilot-rungs">
          <div className="autopilot-rungs-head">
            {/* Scale 2, not 1: these name the three columns the player picks a
                rung on — the number they read to choose. Scale 1 is for true
                captions, and at ~7 CSS px on a phone these were unreadable. */}
            <PixelText font={font} text="SPEED" scale={2} color={GREY} />
            <PixelText font={font} text="COINS/S" scale={2} color={GREY} />
            <PixelText font={font} text="GAME TIME" scale={2} color={GREY} />
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
              {/* The multiplier carries NO icon. It used to wear the stopwatch
                  — the same glyph the GAME TIME column on the right uses — so
                  two unrelated columns read as the same thing. The "×" and the
                  SPEED header already say what this number is. */}
              <span className="autopilot-cell">
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
                  text={formatCoins(rung.cost)}
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
        {cannotAfford ? (
          // The purse can't fund any rung — the generic real-vs-game-time note
          // isn't the point; say plainly that the ride is out of reach and how
          // to fix it (sell gear for coins). Swapping (not stacking) the note
          // keeps the modal within the 390px landscape phone.
          <div className="autopilot-start-warn" role="alert">
            <PixelText
              font={font}
              text="CAN'T AFFORD AUTO PILOT"
              scale={2}
              color={WARN}
            />
            <PixelText
              font={font}
              // With a store to hand, buying is the other way out — say so
              // rather than pointing only at the merchant.
              text={
                onStore ? "SELL GEAR OR BUY COINS" : "SELL GEAR TO EARN COINS"
              }
              scale={2}
              color={AMBER}
            />
          </div>
        ) : (
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
        )}
        {/* The footer: STORE (where the build has one) sits LEFT of CANCEL —
            a thin purse is exactly the moment coins are worth buying, and the
            title menu's store is a whole run away from here. */}
        <div className="autopilot-start-actions">
          {onStore && (
            <button
              type="button"
              className="pixel-button modal-action autopilot-start-store"
              aria-label="autopilot-start-store"
              onClick={onStore}
            >
              <PixelText font={font} text="STORE" scale={3} color="#0b0d10" />
            </button>
          )}
          <button
            type="button"
            className="pixel-button secondary modal-action autopilot-start-cancel"
            aria-label="autopilot-start-cancel"
            onClick={onClose}
          >
            <PixelText font={font} text="CANCEL" scale={3} />
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * THE LAST CALL — raised between picking a speed rung and engaging the ride,
 * whenever the LOST & FOUND still holds something.
 *
 * A new flight clears the vault (items/vault.ts `clearVault`), and the pieces in
 * it are exactly the ones the LAST flight decided were worth keeping out of the
 * bin — up to an artifact. Engaging used to bin them silently the moment the
 * player picked a rung, which is the one way a player should never discover the
 * rule. So the count (and what the best piece in there is) is put in front of
 * them with a way OUT: BUY BACK opens the run's own LOST & FOUND, and only
 * TRASH & FLY starts the ride.
 */
export function AutopilotTrashConfirm({
  font,
  sprites,
  count,
  best,
  bestColor,
  onBuyBack,
  onConfirm,
  onClose,
}: {
  font: PixelFont;
  /** The atlas — the bin heading wears the satchel the LOST & FOUND row does. */
  sprites: Sprites;
  /** How many pieces the ride would trash. */
  count: number;
  /** The most precious piece's name — what the player would actually mourn. */
  best: string;
  /** Its tier color, so the loss is weighed at a glance. */
  bestColor: string;
  /** Open the run's LOST & FOUND to buy something back first. */
  onBuyBack: () => void;
  /** Engage the ride, binning whatever is left. */
  onConfirm: () => void;
  /** Back to the speed picker without engaging. */
  onClose: () => void;
}) {
  const stop = (event: { stopPropagation: () => void }) =>
    event.stopPropagation();
  const bagIcon = spriteDataUrl(sprites, "icon_bag");

  return (
    <div className="game-overlay" onPointerDown={onClose} role="presentation">
      <div className="intro-box autopilot-trash" onPointerDown={stop}>
        <div className="autopilot-trash-head">
          {bagIcon && (
            <img
              src={bagIcon}
              alt=""
              className="pixel-img autopilot-trash-bag"
            />
          )}
          <PixelText font={font} text="LOST & FOUND" scale={3} color={AMBER} />
        </div>
        <PixelText
          font={font}
          text={
            count === 0
              ? "NOTHING LEFT TO TRASH"
              : count === 1
                ? "1 PIECE WILL BE TRASHED"
                : `${count} PIECES WILL BE TRASHED`
          }
          scale={2}
          color={count === 0 ? GREEN : WARN}
        />
        {count > 0 && (
          // The name alone under the count reads as a caption for nothing —
          // say it is the pick of what's being binned, in its tier color so the
          // weight of the loss lands without opening the list.
          <div className="autopilot-trash-best">
            <PixelText font={font} text="INCLUDING" scale={2} color={GREY} />
            <PixelText font={font} text={best} scale={2} color={bestColor} />
          </div>
        )}
        <PixelText
          font={font}
          // Buying the last piece back leaves the modal standing with nothing
          // to warn about — say what it now means instead of a stale threat.
          text={
            count === 0 ? "THE VAULT IS EMPTY" : "A NEW RIDE EMPTIES THE VAULT"
          }
          scale={2}
          color={GREY}
        />
        <div className="autopilot-start-actions">
          {count > 0 && (
            <button
              type="button"
              className="pixel-button autopilot-trash-buy"
              aria-label="autopilot-trash-buyback"
              onClick={onBuyBack}
            >
              <PixelText
                font={font}
                text="BUY BACK"
                scale={3}
                color="#0b0d10"
              />
            </button>
          )}
          <button
            type="button"
            className={`pixel-button ${count > 0 ? "secondary autopilot-trash-fly" : "autopilot-trash-buy"}`}
            aria-label="autopilot-trash-confirm"
            onClick={onConfirm}
          >
            <PixelText
              font={font}
              text={count > 0 ? "TRASH & FLY" : "FLY NOW"}
              scale={3}
              color={count > 0 ? WARN : "#0b0d10"}
            />
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * The AUTO PILOT session modal — the ride's scoreboard over its special finds,
 * newest first. Rendered at the game-shell root (not the HUD column) so it
 * covers the full screen and its buttons take the pointer.
 *
 * The ride's two coin figures are deliberately kept apart. What the flight
 * EARNED — the loot it hauled to the counter and sold — is a win, so it sits on
 * the scoreboard grid beside the levels and points it won. What the flight COST
 * is not a win at all, so it reads as a `COST` line under the heading instead,
 * at the middle glyph size: present, but never mistaken for the takings.
 */
const LEVEL_TINT = "#8fb7ff";
const STAT_TINT = "#5fd0d9";
const TALENT_TINT = "#c79bff";

/** CSS px per rem at the default root font-size — PixelText's own rem base. */
const REM_BASE_PX = 16;

/** Wrap width used for the first paint, before the list has been measured —
 * the modal's inner column minus the find icon, at the narrow end. */
const FIND_TEXT_FALLBACK_REM = 18;

/**
 * The wrap width, in PixelText rem, of a find row's text column.
 *
 * The haul list scrolls VERTICALLY and must never scroll sideways: a name is
 * data-driven (affixes build things like REINFORCED LUNAR OVERSHOES OF THE
 * BULWARK) and `PixelText` draws one un-reflowable canvas per line, so without a
 * cap the widest name sets the list's scroll width and the whole box gains a
 * horizontal scrollbar. Measured rather than a constant so it tracks the modal's
 * `min(30rem, 94vw)` width (a portrait phone is the pinch), orientation changes,
 * and the large-screen root-font bump — `PixelText` reads `maxWidth` in rem-at-16,
 * and rem = px / rootPx. The measured element is `flex: 1 1 0`, so its width is
 * the free space left by the icon and never depends on the text inside it; that
 * is what keeps this from chasing its own tail.
 */
function useFindTextRem(findCount: number): {
  listRef: RefObject<HTMLDivElement>;
  textRem: number;
} {
  const listRef = useRef<HTMLDivElement>(null);
  const [rem, setRem] = useState<number | null>(null);

  useLayoutEffect(() => {
    const el = listRef.current;
    if (!el) return;
    const measure = () => {
      const text = el.querySelector<HTMLElement>(".autopilot-find-text");
      const w = text?.clientWidth ?? 0;
      const rootPx =
        parseFloat(getComputedStyle(document.documentElement).fontSize) ||
        REM_BASE_PX;
      if (w > 0 && rootPx > 0) {
        const next = w / rootPx;
        setRem((prev) =>
          prev !== null && Math.abs(prev - next) < 0.25 ? prev : next,
        );
      }
    };
    measure();
    window.addEventListener("resize", measure);
    return () => {
      window.removeEventListener("resize", measure);
    };
  }, [findCount]);

  return { listRef, textRem: rem ?? FIND_TEXT_FALLBACK_REM };
}

/** One tile of the LOOT history's session scoreboard: a big value over a small
 * grey caption, drawn so every tile aligns to a shared grid (see
 * `.autopilot-session-stats`). Gain tiles read a hair dim at 0 so a productive
 * ride's numbers pop. */
function SessionStat({
  font,
  label,
  value,
  color,
}: {
  font: PixelFont;
  label: string;
  value: string;
  color: string;
}) {
  return (
    <div className="autopilot-stat">
      <PixelText font={font} text={value} scale={3} color={color} />
      {/* Scale 2: the caption is what tells the player WHICH number they are
          looking at — six unlabelled figures in a grid say nothing. */}
      <PixelText font={font} text={label} scale={2} color={GREY} />
    </div>
  );
}

export function AutopilotHistory({
  font,
  finds,
  clears,
  deaths,
  levels,
  statPoints,
  talentPoints,
  coinsSpent,
  coinsEarned,
  onClose,
}: {
  font: PixelFont;
  /** The session's special finds, oldest first (rendered newest first). */
  finds: AutopilotFind[];
  clears: number;
  deaths: number;
  /** Levels the ride has climbed since it engaged. */
  levels: number;
  /** Stat points the ride earned (the pool the STOP hands back to place). */
  statPoints: number;
  /** Talent points the ride's stat growth unlocked. */
  talentPoints: number;
  /** Coins the whole session has burned (across restarts/advances) — the
   * ride's PRICE, shown as the `COST` line under the heading. */
  coinsSpent: number;
  /** Coins the whole session has EARNED — loot the ride sold at the counter.
   * The takings, shown as the scoreboard's COINS tile. */
  coinsEarned: number;
  onClose: () => void;
}) {
  const stop = (event: { stopPropagation: () => void }) =>
    event.stopPropagation();
  // How wide a find's name/status may run before it folds to a second line —
  // the haul scrolls up and down only, never sideways. See `useFindTextRem`.
  const { listRef, textRem } = useFindTextRem(finds.length);
  // A "+N" gain reads green when it moved and dim-grey at 0, so a fruitful
  // ride's numbers stand out from the untouched ones.
  const gain = (n: number, tint: string) => ({
    value: `+${n}`,
    color: n > 0 ? tint : GREY,
  });
  const level = gain(levels, LEVEL_TINT);
  const stats = gain(statPoints, STAT_TINT);
  const talents = gain(talentPoints, TALENT_TINT);

  return (
    <div className="game-overlay" onPointerDown={onClose} role="presentation">
      <div className="intro-box autopilot-history" onPointerDown={stop}>
        <PixelText font={font} text="AUTO PILOT" scale={3} color={AMBER} />
        {/* What the ride has BILLED so far — the one figure here that isn't a
            win, so it sits under the heading rather than among the scoreboard's
            gains, at the middle glyph size (between the heading and the tile
            captions) so it reads as a subtitle. */}
        <div className="autopilot-cost">
          <PixelText font={font} text="COST:" scale={2} color={GREY} />
          <PixelText
            font={font}
            text={formatCoins(coinsSpent)}
            scale={2}
            color={COIN}
          />
        </div>
        {/* The session scoreboard: a fixed grid of tiles so labels and numbers
            line up in columns. Progress the ride WON (levels, stat & talent
            points, the coins its loot sold for) sits beside the run tally
            (clears, deaths). */}
        <div className="autopilot-session-stats">
          <SessionStat
            font={font}
            label="CLEARS"
            value={`${clears}`}
            color={GREEN}
          />
          <SessionStat
            font={font}
            label="DEATHS"
            value={`${deaths}`}
            color={deaths > 0 ? WARN : GREY}
          />
          <SessionStat
            font={font}
            label="LEVELS"
            value={level.value}
            color={level.color}
          />
          <SessionStat
            font={font}
            label="STATS"
            value={stats.value}
            color={stats.color}
          />
          <SessionStat
            font={font}
            label="TALENTS"
            value={talents.value}
            color={talents.color}
          />
          <SessionStat
            font={font}
            label="COINS"
            value={formatCoins(coinsEarned)}
            color={coinsEarned > 0 ? COIN : GREY}
          />
        </div>
        {/* The haul. An empty ride gets a single centred line INSTEAD of the
            list — the scrolling list reserves room for rows that aren't there,
            which left a band of dead space between the scoreboard and CLOSE. */}
        {finds.length === 0 ? (
          <div className="autopilot-find-empty">
            <PixelText
              font={font}
              text="NO SPECIAL LOOT YET"
              scale={2}
              color={GREY}
            />
          </div>
        ) : (
          <div className="autopilot-find-list" ref={listRef}>
            {[...finds].reverse().map((find) => (
              <div key={find.id} className="autopilot-find">
                {/* The slot is always drawn, empty or not: it keeps the names
                    in one column, and it makes every row's text column exactly
                    as wide as the one `useFindTextRem` measures. */}
                {find.icon ? (
                  <img
                    src={find.icon}
                    alt=""
                    className="pixel-img autopilot-find-icon"
                  />
                ) : (
                  <span className="autopilot-find-icon" aria-hidden="true" />
                )}
                {/* Both lines wrap to the measured column: an affix-built name
                    is long enough to run off the box, and a canvas that spills
                    turns the list's vertical scroll into a sideways one. */}
                <div className="autopilot-find-text">
                  <PixelText
                    font={font}
                    text={find.name}
                    scale={2}
                    color={find.color}
                    maxWidth={textRem}
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
                    maxWidth={textRem}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
        {/* Full-width like the START picker's footer, so the two AUTO PILOT
            modals dismiss through the same shape of button. */}
        <button
          type="button"
          className="pixel-button modal-action autopilot-history-close"
          aria-label="autopilot-history-close"
          onClick={onClose}
        >
          <PixelText font={font} text="CLOSE" scale={3} color="#0b0d10" />
        </button>
      </div>
    </div>
  );
}
