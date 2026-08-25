// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE END OF THE FLIGHT — the rocket cabinet's RANKING board, the drive's
// board (`DriveScores.tsx`) standing at the second machine.
//
// SAME VOCABULARY ON PURPOSE: a plaque, a header rail, five ranked rows, one
// column and it is the CLOCK, every flight given its real place in the whole
// ladder, and three letters to sign with. The two screens share their CSS
// (`drive-scores` / `drive-board` in styles.css — cabinet skin, not road
// content), and this one banks to its own store (`rocket-scores.ts`).
//
// A COMPONENT RATHER THAN HUD CONTENT, and never mounted for an unattended
// flight — both for the drive board's reasons, which its header owns.

import type { ReactElement } from "react";
import { useCallback, useEffect, useRef, useState } from "react";

import { PixelText } from "@ui/lib/PixelText.tsx";
import type { PixelFont } from "@ui/lib/pixel-font.ts";
import { rallyClock } from "@ui/lib/format-number.ts";
import { useAutoFocus } from "@ui/lib/auto-focus.ts";
import type { FlightScorecard } from "@game/core";

import type { FlightLeg } from "@game/core";

import { synth } from "../audio.ts";
import {
  INITIALS_LENGTH,
  INITIAL_CHARS,
  clampInitials,
  lastInitials,
  signedInitials,
} from "../drive-scores.ts";
import {
  ROCKET_BOARD_SIZE,
  flightTimeRank,
  lastFlightInitials,
  recordFlightScore,
  rememberFlightInitials,
  topFlightScores,
  type FlightScoreEntry,
} from "../rocket-scores.ts";
import { playUiSound } from "../sfx/ui.ts";

const EMPTY_NAME = "---";
const EMPTY_TIME = `-'--"--`;
const BLANK_LETTER = "-";

const AMBER = "#ffd400";
const PLAQUE_INK = "#120b02";
const MINE = "#ffffff";
const DIM = "#6f6a52";

/** What the screen is showing — settled once when the sky hands over, held. */
export type FlightBoardResult = {
  card: FlightScorecard;
  difficulty: string;
  /** Which cabinet's ladder this flight ranks in — the whole trip's or the
   * MOON LANDING drop's. The two clocks are not comparable. */
  leg: FlightLeg;
  /** This flight's place in its leg's whole ladder (0-based), or null when
   * its clock never ran. */
  rank: number | null;
  /** The head of the ladder as it stood BEFORE this flight. */
  before: FlightScoreEntry[];
};

/** Read the board and work out where this flight lands on it. */
export function flightBoardResult(
  card: FlightScorecard,
  difficulty: string,
  leg: FlightLeg = "trip",
): FlightBoardResult {
  return {
    card,
    difficulty,
    leg,
    rank: flightTimeRank(card.ms, leg),
    before: topFlightScores(ROCKET_BOARD_SIZE, leg),
  };
}

type BoardRow =
  | { kind: "set"; entry: FlightScoreEntry }
  | { kind: "new" }
  | { kind: "empty" };

/** A name the board will take, as it is being typed — dropped, not blanked
 * (`DriveScores.typedName` owns the reasoning). */
function typedName(raw: string): string {
  return [...raw.toUpperCase()]
    .filter((c) => INITIAL_CHARS.includes(c))
    .join("")
    .slice(0, INITIALS_LENGTH);
}

/** The prefill: this cabinet's last signature, else the road's — the same
 * person is standing at both machines. */
function prefillName(): string {
  const own = lastFlightInitials();
  return typedName(own ? clampInitials(own) : lastInitials());
}

export function RocketScores({
  font,
  result,
  onDone,
}: {
  font: PixelFont;
  result: FlightBoardResult;
  /** Sign off: bank the row (when there is one) and hand the crossing on. */
  onDone: () => void;
}): ReactElement {
  const { card, rank, before } = result;
  const entering = rank !== null;
  const [name, setName] = useState<string>(prefillName);
  const inputRef = useRef<HTMLInputElement>(null);
  const doneRef = useRef(false);

  // Keyboard focus rules are the drive board's, verbatim: a fine pointer gets
  // the field focused and selected, a thumb gets the tap.
  const finePointer =
    typeof window === "undefined" ||
    !window.matchMedia ||
    window.matchMedia("(pointer: fine)").matches;
  useAutoFocus(inputRef, entering && finePointer);
  useEffect(() => {
    if (!entering || !finePointer) return;
    inputRef.current?.select();
  }, [entering, finePointer]);

  const finish = useCallback(() => {
    if (doneRef.current) return;
    doneRef.current = true;
    if (entering) {
      const signed = signedInitials(name);
      rememberFlightInitials(signed);
      recordFlightScore({
        ...(result.leg === "landing" ? { leg: "landing" as const } : {}),
        name: signed,
        score: card.score,
        ms: card.ms,
        topSpeedMph: card.topSpeedMph,
        trash: card.trash,
        difficulty: result.difficulty,
        at: Date.now(),
      });
      playUiSound(synth, "start");
    } else {
      playUiSound(synth, "back");
    }
    onDone();
  }, [card, entering, name, onDone, result.difficulty, result.leg]);

  const onType = useCallback((e: Event) => {
    const el = e.currentTarget as HTMLInputElement;
    const next = typedName(el.value);
    if (el.value !== next) el.value = next;
    setName((prev) => {
      if (next.length > prev.length) playUiSound(synth, "blip");
      return next;
    });
  }, []);

  const onFieldKey = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Enter") {
        e.preventDefault();
        e.stopPropagation();
        finish();
        return;
      }
      const consumed =
        e.key.length === 1 || e.key === "Backspace" || e.key === "Delete";
      if (consumed) e.stopPropagation();
    },
    [finish],
  );

  const onCellTap = useCallback(() => {
    const el = inputRef.current;
    if (!el) return;
    const had = el.value.length > 0;
    el.value = "";
    setName("");
    if (had) playUiSound(synth, "back");
    if (document.activeElement === el) el.blur();
    el.focus();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target === inputRef.current) return;
      if (e.key === "Enter" || e.code === "Space") {
        e.preventDefault();
        e.stopPropagation();
        finish();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [finish]);

  const onTable = rank !== null && rank < ROCKET_BOARD_SIZE;
  const rows: BoardRow[] = before.map((entry) => ({ kind: "set", entry }));
  if (onTable && rank !== null) rows.splice(rank, 0, { kind: "new" });
  while (rows.length < ROCKET_BOARD_SIZE) rows.push({ kind: "empty" });
  rows.length = ROCKET_BOARD_SIZE;

  const entry = (
    <NameEntry
      font={font}
      name={name}
      inputRef={inputRef}
      onType={onType}
      onKey={onFieldKey}
      onTap={onCellTap}
    />
  );

  return (
    <div
      className="game-overlay drive-scores"
      role="dialog"
      aria-label="rocket-high-scores"
    >
      <div className="intro-box drive-scores-box">
        <div className={`drive-rank-plaque${rank === 0 ? " is-record" : ""}`}>
          <PixelText font={font} text="RANKING" scale={5} color={AMBER} />
        </div>

        <div className="drive-board">
          <div className="drive-board-row is-head">
            <span className="drive-head-cell">
              <PixelText font={font} text="RANK" scale={2} color={PLAQUE_INK} />
            </span>
            <span className="drive-head-cell">
              <PixelText font={font} text="NAME" scale={2} color={PLAQUE_INK} />
            </span>
            <span className="drive-head-cell">
              <PixelText font={font} text="TIME" scale={2} color={PLAQUE_INK} />
            </span>
          </div>

          {rows.map((row, i) => {
            const mine = row.kind === "new";
            const ink = mine ? MINE : row.kind === "set" ? AMBER : DIM;
            return (
              <div
                key={i}
                className={`drive-board-row${mine ? " is-new" : ""}${
                  row.kind === "empty" ? " is-empty" : ""
                }`}
              >
                <span className="drive-board-rank">
                  <PixelText
                    font={font}
                    text={`${i + 1}`}
                    scale={3}
                    color={ink}
                  />
                </span>
                <span className="drive-board-name">
                  {mine ? (
                    entry
                  ) : (
                    <PixelText
                      font={font}
                      text={row.kind === "set" ? row.entry.name : EMPTY_NAME}
                      scale={3}
                      color={ink}
                    />
                  )}
                </span>
                <span className="drive-board-time">
                  <PixelText
                    font={font}
                    text={
                      mine
                        ? rallyClock(card.ms)
                        : row.kind === "set"
                          ? rallyClock(row.entry.ms)
                          : EMPTY_TIME
                    }
                    scale={3}
                    color={ink}
                  />
                </span>
              </div>
            );
          })}

          {rank !== null && !onTable && (
            <div className="drive-board-row is-new is-adrift">
              <span className="drive-board-rank">
                <PixelText
                  font={font}
                  text={`${rank + 1}`}
                  scale={3}
                  color={MINE}
                />
              </span>
              <span className="drive-board-name">{entry}</span>
              <span className="drive-board-time">
                <PixelText
                  font={font}
                  text={rallyClock(card.ms)}
                  scale={3}
                  color={MINE}
                />
              </span>
            </div>
          )}

          {rank === null && (
            <div className="drive-board-row is-adrift">
              <span className="drive-board-rank" />
              <span className="drive-board-name">
                <PixelText font={font} text="YOU" scale={3} color={DIM} />
              </span>
              <span className="drive-board-time">
                <PixelText
                  font={font}
                  text={rallyClock(card.ms)}
                  scale={3}
                  color={DIM}
                />
              </span>
            </div>
          )}
        </div>

        {/* THE CABINET'S ONE FOOTNOTE — every bag the climb met hull-first,
            worth nothing, itemised anyway. The drive prints its body count
            the same way; this machine's shame is the company's garbage. The
            drop-only cabinet flies an empty sky and prints none. */}
        {result.leg !== "landing" && (
          <div className="drive-scores-hint">
            <PixelText
              font={font}
              text={`TRASH HIT: ${card.trash} · WORTH: 0`}
              scale={2}
              color={DIM}
            />
          </div>
        )}

        {entering && (
          <div className="drive-scores-hint">
            <PixelText
              font={font}
              text={finePointer ? "TYPE YOUR NAME" : "TAP NAME TO TYPE"}
              scale={2}
              color={DIM}
            />
          </div>
        )}

        <button
          type="button"
          className="pixel-button"
          aria-label="rocket-scores-done"
          onClick={finish}
        >
          <PixelText
            font={font}
            text={entering ? "▶ ENTER" : "▶ FLY ON"}
            scale={3}
            color="#0b0d10"
          />
        </button>
      </div>
    </div>
  );
}

/** The three letters, typed — the drive board's arrangement, verbatim: a real
 * transparent `<input>` over pixel glyphs (its header owns the reasoning). */
function NameEntry({
  font,
  name,
  inputRef,
  onType,
  onKey,
  onTap,
}: {
  font: PixelFont;
  name: string;
  inputRef: { current: HTMLInputElement | null };
  onType: (e: Event) => void;
  onKey: (e: KeyboardEvent) => void;
  onTap: () => void;
}): ReactElement {
  const caret = Math.min(name.length, INITIALS_LENGTH - 1);
  return (
    <span className="drive-name" onPointerDown={onTap}>
      {Array.from({ length: INITIALS_LENGTH }, (_, i) => {
        const char = name[i];
        return (
          <span
            key={i}
            className={`drive-name-slot${i === caret ? " is-caret" : ""}`}
          >
            <PixelText
              font={font}
              text={char ?? BLANK_LETTER}
              scale={3}
              color={char ? MINE : DIM}
            />
          </span>
        );
      })}
      <input
        ref={inputRef}
        className="drive-name-input"
        type="text"
        value={name}
        maxLength={INITIALS_LENGTH}
        inputMode="text"
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="characters"
        spellcheck={false}
        aria-label="rocket-initials"
        onInput={onType}
        onKeyDown={onKey}
      />
    </span>
  );
}
