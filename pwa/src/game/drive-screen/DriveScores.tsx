// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE END OF THE ROAD — the arcade high-score board the drive finishes on, and
// the three letters you sign it with.
//
// IT IS A CABINET SCREEN, AND IT IS MEANT TO BE. Everything else the game shows
// wears the FF6 window skin and speaks in the hero's voice; this one is the
// machine talking, so it counts the bonuses up in a column, ranks five rows,
// flashes the one you just took and asks for three letters. That is the whole
// vocabulary Frogger had and it still works, because it answers the only two
// questions a player has at the end of a run — how did I do, and can I do
// better — in one glance and with no prose at all.
//
// A COMPONENT RATHER THAN HUD CONTENT, deliberately. `content/hud/` owns the
// DASHBOARD — the dials that read a live road, republished sixty times a second
// — and this is not one: it is a screen raised over a stopped road with its own
// focus, its own key handling and a text field, which is the same shape
// `DrivePause` beside it is and for the same reasons.
//
// AND IT NEVER APPEARS WHEN NOBODY IS PLAYING. The attract loop, a `?bot=`
// playtest and every screenshot recipe drive the road with the engine's own
// driver, and a board waiting on a keypress would park the demo forever
// (`DriveScreen`, which is where that gate lives — this component is only ever
// mounted for a player who actually drove).

import type { ReactElement } from "react";
import { useCallback, useEffect, useRef, useState } from "react";

import { PixelText } from "@ui/lib/PixelText.tsx";
import type { PixelFont } from "@ui/lib/pixel-font.ts";
import { formatCompact } from "@ui/lib/format-number.ts";
import type { DriveScorecard } from "@game/core";

import { synth } from "../audio.ts";
import {
  BOARD_SIZE,
  INITIALS_LENGTH,
  INITIAL_CHARS,
  clampInitials,
  driveScoreRank,
  lastInitials,
  recordDriveScore,
  rememberInitials,
  topDriveScores,
  type DriveScoreEntry,
} from "../drive-scores.ts";
import { playUiSound } from "../sfx/ui.ts";

/** What a row that has never been set prints as. */
const EMPTY_NAME = "---";
/** …and the score beside it. */
const EMPTY_SCORE = "-----";

/** The board's colours: the incumbent rows, the one you just took, and the
 * quiet furniture between them. */
const INK = "#e8e4d8";
const DIM = "#7c8592";
const GOLD = "#ffd75e";
const MINT = "#7ef0c8";

/** mm:ss.t — a trip time, read the way a lap time is. */
export function driveClock(ms: number): string {
  const total = Math.max(0, ms) / 1000;
  const minutes = Math.floor(total / 60);
  const seconds = Math.floor(total % 60);
  const tenths = Math.floor((total * 10) % 10);
  return `${minutes}:${String(seconds).padStart(2, "0")}.${tenths}`;
}

/**
 * WHAT THE SCREEN IS SHOWING — settled once, when the road hands over, and then
 * held.
 *
 * The rank is resolved BEFORE the initials are entered because it is what
 * decides whether there is anything to enter: a leg that missed the board is
 * shown the board with its own score beneath it and is never asked to sign.
 * Settled once so that a second component render cannot re-ask a store that has
 * meanwhile been written to.
 */
export type DriveBoardResult = {
  card: DriveScorecard;
  /** The rung the road was driven on, for the row's tag. */
  difficulty: string;
  /** The row this score takes (0-based), or null when it missed the board. */
  rank: number | null;
  /** The board as it stood BEFORE this leg. */
  before: DriveScoreEntry[];
};

/** Read the board and work out where this leg lands on it. */
export function driveBoardResult(
  card: DriveScorecard,
  difficulty: string,
): DriveBoardResult {
  return {
    card,
    difficulty,
    rank: driveScoreRank(card.score, card.ms),
    before: topDriveScores(),
  };
}

/**
 * One line of the board as it will be DRAWN: an incumbent, the row this leg just
 * took, or a slot nobody has claimed. Three cases rather than a nullable entry,
 * because "nobody has ever scored here" and "this is yours, and you are typing
 * into it" print completely differently and are trivially confused.
 */
type BoardRow =
  { kind: "set"; entry: DriveScoreEntry } | { kind: "new" } | { kind: "empty" };

/** Step a wheel by `delta`, wrapping both ways. */
function cycle(char: string, delta: number): string {
  const at = INITIAL_CHARS.indexOf(char);
  const from = at === -1 ? 0 : at;
  const next = (from + delta + INITIAL_CHARS.length * 2) % INITIAL_CHARS.length;
  return INITIAL_CHARS[next] ?? "A";
}

export function DriveScores({
  font,
  result,
  onDone,
}: {
  font: PixelFont;
  result: DriveBoardResult;
  /** Sign off: bank the row (when there is one) and give the road back. */
  onDone: () => void;
}): ReactElement {
  const { card, rank, before } = result;
  const entering = rank !== null;
  const [letters, setLetters] = useState<string[]>(() => [
    ...clampInitials(lastInitials()),
  ]);
  const [slot, setSlot] = useState(0);
  /** ONE WAY OUT, HOWEVER IT IS TAKEN. The button, the ENTER key and the road's
   * own timeout all land here, and the row must be banked exactly once — a
   * double-tap on a phone is two events inside 80 ms. */
  const doneRef = useRef(false);

  const finish = useCallback(() => {
    if (doneRef.current) return;
    doneRef.current = true;
    if (entering) {
      const name = clampInitials(letters.join(""));
      rememberInitials(name);
      recordDriveScore({
        name,
        score: card.score,
        ms: card.ms,
        topSpeedMph: card.topSpeedMph,
        bodies: card.bodies,
        difficulty: result.difficulty,
        at: Date.now(),
      });
      playUiSound(synth, "start");
    } else {
      playUiSound(synth, "back");
    }
    onDone();
  }, [card, entering, letters, onDone, result.difficulty]);

  const turn = useCallback(
    (index: number, delta: number) => {
      setSlot(index);
      setLetters((prev) =>
        prev.map((c, i) => (i === index ? cycle(c, delta) : c)),
      );
      playUiSound(synth, "move");
    },
    [setSlot],
  );

  // THE JOYSTICK AND THE KEYBOARD, on one listener. Up/down turn the wheel
  // under the cursor and left/right move it, which is the cabinet's own
  // mapping; typing a letter sets it and steps on, which is what everybody
  // actually does on a keyboard. ENTER signs off from either.
  //
  // ON `window` AND IN THE CAPTURE PHASE, because the road's own key handler is
  // still bound underneath (`DriveScreen`) and a W typed into the wheel must
  // not also be a steering input. Every key this screen understands is stopped
  // here; ESCAPE is deliberately let through to the pause handler, which is the
  // one control that still makes sense over a finished road.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") return;
      const stop = () => {
        e.preventDefault();
        e.stopPropagation();
      };
      if (e.key === "Enter" || e.code === "Space") {
        stop();
        finish();
        return;
      }
      if (!entering) return;
      if (e.key === "ArrowUp" || e.key === "ArrowDown") {
        stop();
        turn(slot, e.key === "ArrowUp" ? 1 : -1);
        return;
      }
      if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
        stop();
        setSlot((s) =>
          Math.min(
            INITIALS_LENGTH - 1,
            Math.max(0, s + (e.key === "ArrowRight" ? 1 : -1)),
          ),
        );
        playUiSound(synth, "move");
        return;
      }
      if (e.key === "Backspace") {
        stop();
        setSlot((s) => Math.max(0, s - 1));
        playUiSound(synth, "back");
        return;
      }
      // A typed character, if the wheel can spell it. `e.key` is a single
      // character for a printable key and a word ("Shift", "Tab") for the rest,
      // which is the whole test.
      const typed = e.key.length === 1 ? e.key.toUpperCase() : "";
      if (typed && INITIAL_CHARS.includes(typed)) {
        stop();
        setLetters((prev) => prev.map((c, i) => (i === slot ? typed : c)));
        setSlot((s) => Math.min(INITIALS_LENGTH - 1, s + 1));
        playUiSound(synth, "blip");
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [entering, finish, slot, turn]);

  // The rows as they will READ: the board before this leg, with the new row
  // spliced into the place it took, then padded out so an empty machine shows
  // five empty rows rather than a short list — which is what tells a first
  // player there is something here to fill in.
  const rows: BoardRow[] = before.map((entry) => ({ kind: "set", entry }));
  if (rank !== null) rows.splice(rank, 0, { kind: "new" });
  while (rows.length < BOARD_SIZE) rows.push({ kind: "empty" });
  rows.length = BOARD_SIZE;

  const headline =
    rank === 0 ? "NEW HIGH SCORE" : rank !== null ? "ON THE BOARD" : "ARRIVED";
  const headlineColor = rank === 0 ? GOLD : rank !== null ? MINT : INK;

  return (
    <div
      className="game-overlay drive-scores"
      role="dialog"
      aria-label="drive-high-scores"
    >
      <div className="intro-box drive-scores-box">
        <div className={`drive-scores-title${rank === 0 ? " is-record" : ""}`}>
          <PixelText
            font={font}
            text={headline}
            scale={4}
            color={headlineColor}
          />
        </div>

        <div className="drive-scores-cols">
          {/* THE TALLY — what the leg was worth, counted up one line at a time,
              with the trip's own numbers under it. BODIES is on this card and
              carries no points, which is the joke the whole road is built on
              said in a column (see `DRIVE.score`). */}
          <div className="drive-tally">
            {/* "ARRIVAL" rather than "ARRIVED", which is what the headline
                over it says when the leg missed the board — one word twice in
                two lines reads as a mistake. */}
            <Tally font={font} label="ARRIVAL" value={card.arrival} />
            <Tally font={font} label="TIME BONUS" value={card.time} />
            <Tally font={font} label="TOP SPEED" value={card.speed} />
            <Tally font={font} label="PAINTWORK" value={card.paint} />
            {card.damage > 0 && (
              <Tally font={font} label="DAMAGE" value={-card.damage} />
            )}
            <div className="drive-tally-rule" aria-hidden="true" />
            <Tally font={font} label="SCORE" value={card.score} big />
            <div className="drive-tally-stats">
              <Stat font={font} label="TIME" value={driveClock(card.ms)} />
              <Stat font={font} label="TOP" value={`${card.topSpeedMph} MPH`} />
              <Stat
                font={font}
                label="WRECKED"
                value={`${card.wearPercent}%`}
              />
              <Stat font={font} label="BODIES" value={String(card.bodies)} />
            </div>
          </div>

          {/* THE BOARD. Five rows, always five — an empty machine shows its
              empty rows rather than a short list, which is what tells a first
              player there is something to fill in. */}
          <div className="drive-board">
            <div className="drive-board-head">
              <PixelText font={font} text="HIGH SCORES" scale={2} color={DIM} />
            </div>
            {rows.map((row, i) => (
              <div
                key={i}
                className={`drive-board-row${row.kind === "new" ? " is-new" : ""}`}
              >
                <span className="drive-board-rank">
                  <PixelText
                    font={font}
                    text={`${i + 1}`}
                    scale={3}
                    color={row.kind === "new" ? GOLD : DIM}
                  />
                </span>
                <span className="drive-board-name">
                  {row.kind === "new" ? (
                    <Wheel
                      font={font}
                      letters={letters}
                      slot={slot}
                      onTurn={turn}
                      onPick={setSlot}
                    />
                  ) : (
                    <PixelText
                      font={font}
                      text={row.kind === "set" ? row.entry.name : EMPTY_NAME}
                      scale={3}
                      color={row.kind === "set" ? INK : DIM}
                    />
                  )}
                </span>
                <span className="drive-board-score">
                  <PixelText
                    font={font}
                    text={
                      row.kind === "new"
                        ? formatCompact(card.score)
                        : row.kind === "set"
                          ? formatCompact(row.entry.score)
                          : EMPTY_SCORE
                    }
                    scale={3}
                    color={
                      row.kind === "new" ? GOLD : row.kind === "set" ? INK : DIM
                    }
                  />
                </span>
              </div>
            ))}
            {!entering && (
              <div className="drive-board-row is-miss">
                <span className="drive-board-rank" />
                <span className="drive-board-name">
                  <PixelText font={font} text="YOU" scale={3} color={DIM} />
                </span>
                <span className="drive-board-score">
                  <PixelText
                    font={font}
                    text={formatCompact(card.score)}
                    scale={3}
                    color={DIM}
                  />
                </span>
              </div>
            )}
          </div>
        </div>

        <button
          type="button"
          className="pixel-button"
          aria-label="drive-scores-done"
          onClick={finish}
        >
          <PixelText
            font={font}
            text={entering ? "▶ ENTER" : "▶ DRIVE ON"}
            scale={3}
            color="#0b0d10"
          />
        </button>
      </div>
    </div>
  );
}

/** One line of the tally: a label on the left, its points on the right. */
function Tally({
  font,
  label,
  value,
  big = false,
}: {
  font: PixelFont;
  label: string;
  value: number;
  big?: boolean;
}): ReactElement {
  const scale = big ? 4 : 3;
  const color = big ? GOLD : value < 0 ? "#f08a7e" : INK;
  return (
    <div className={`drive-tally-row${big ? " is-total" : ""}`}>
      <PixelText
        font={font}
        text={label}
        scale={scale}
        color={big ? GOLD : DIM}
      />
      <PixelText
        font={font}
        text={value < 0 ? `-${formatCompact(-value)}` : formatCompact(value)}
        scale={scale}
        color={color}
      />
    </div>
  );
}

/**
 * One of the trip's own readings — a fact about the drive, not a bonus.
 *
 * SCALE 2 IS THE FLOOR ON THIS SCREEN. A 3x5 glyph drawn at 1x is five device
 * pixels tall on the reference phone, which is a caption you have to lean into —
 * fine for a workbench watermark and wrong for a results card somebody is
 * actually reading. The label sits one tier under its value rather than at the
 * bottom of the ladder.
 */
function Stat({
  font,
  label,
  value,
}: {
  font: PixelFont;
  label: string;
  value: string;
}): ReactElement {
  return (
    <div className="drive-stat">
      <PixelText font={font} text={label} scale={2} color={DIM} />
      <PixelText font={font} text={value} scale={3} color={INK} />
    </div>
  );
}

/**
 * THE THREE WHEELS. Each is a column — a nudge up, the letter, a nudge down —
 * because that is what the machine had and because it is the only layout that
 * gives a thumb something to hit: two 2.75rem targets per letter, which clears
 * the 44 px floor on the reference phone with room over.
 *
 * The DOWN arrow is the UP one flipped in CSS. The pixel font ships a ▲ and no
 * ▼ (scripts/asset-tools/font.mjs), and a glyph it cannot draw comes out as a
 * `?` — a transform is the honest fix, where adding a second glyph for one
 * screen would put a new tooth on every font atlas in the game.
 */
function Wheel({
  font,
  letters,
  slot,
  onTurn,
  onPick,
}: {
  font: PixelFont;
  letters: string[];
  slot: number;
  onTurn: (index: number, delta: number) => void;
  onPick: (index: number) => void;
}): ReactElement {
  return (
    <span className="drive-wheel">
      {letters.map((char, i) => (
        <span
          key={i}
          className={`drive-wheel-slot${i === slot ? " is-active" : ""}`}
        >
          <button
            type="button"
            className="drive-wheel-step"
            aria-label={`letter-${i + 1}-up`}
            onClick={() => onTurn(i, 1)}
          >
            <PixelText font={font} text="▲" scale={3} color={MINT} />
          </button>
          <button
            type="button"
            className="drive-wheel-char"
            aria-label={`letter-${i + 1}`}
            onClick={() => onPick(i)}
          >
            {/* A BLANK IS A BLANK, not a gap. The space glyph draws nothing, so
                a wheel parked on it would read as a letter that failed to
                render — the underscore is what a cabinet prints there. */}
            <PixelText
              font={font}
              text={char === " " ? "-" : char}
              scale={4}
              color={i === slot ? GOLD : INK}
            />
          </button>
          <button
            type="button"
            className="drive-wheel-step is-down"
            aria-label={`letter-${i + 1}-down`}
            onClick={() => onTurn(i, -1)}
          >
            <PixelText font={font} text="▲" scale={2} color={MINT} />
          </button>
        </span>
      ))}
    </span>
  );
}
