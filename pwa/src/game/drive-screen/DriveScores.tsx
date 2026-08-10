// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE END OF THE ROAD — the arcade RANKING board the drive finishes on, and the
// three letters you sign it with.
//
// IT IS A CABINET SCREEN, AND IT IS MEANT TO BE. Everything else the game shows
// wears the FF6 window skin and speaks in the hero's voice; this one is the
// machine talking, so it is a plaque with RANKING on it, a header rail, five
// ranked rows and a name being typed into one of them. That is the whole
// vocabulary a rally cabinet had and it still works, because it answers the only
// two questions a player has at the end of a run — how did I do, and can I do
// better — in one glance and with no prose at all.
//
// ONE COLUMN, AND IT IS THE CLOCK. The board ranks the TIME (see
// `drive-scores.ts`), so the time is the only number on it: no tally, no bonus
// lines, no top speed, no body count. A results card that itemises five figures
// is a card that has to be READ, and the one figure the ladder is actually sorted
// on gets read last. The arcade score is still banked on the row and is simply
// not printed.
//
// AND EVERY LEG HAS A PLACE ON IT. The table is the top five; the ladder behind
// it is every leg ever driven, so a run that misses the table is not turned away
// with a shrug — it prints under the rule with its real number on it and is
// signed exactly like a winning one. `768 NIC 2'14"09` is a worse result than
// nothing at all, and being told it is the entire joke.
//
// AND NO REPLAY ROW AND NO CAR COLUMN, both deliberately absent from the machine
// this is modelled on: there is no ghost to play back here, and there is exactly
// one wagon in this game, so a column naming it would say the same word five
// times.
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
import { rallyClock } from "@ui/lib/format-number.ts";
import { useAutoFocus } from "@ui/lib/auto-focus.ts";
import type { DriveScorecard } from "@game/core";

import { synth } from "../audio.ts";
import {
  BOARD_SIZE,
  INITIALS_LENGTH,
  INITIAL_CHARS,
  driveTimeRank,
  lastInitials,
  recordDriveScore,
  rememberInitials,
  signedInitials,
  topDriveScores,
  type DriveScoreEntry,
} from "../drive-scores.ts";
import { playUiSound } from "../sfx/ui.ts";

/** What a row that has never been set prints as. */
const EMPTY_NAME = "---";
/** …and the clock beside it. */
const EMPTY_TIME = `-'--"--`;
/** What an un-typed letter of the entry shows. */
const BLANK_LETTER = "-";

/** The board's colours. The cabinet's yellow carries every ranked row and the
 * plaques it is read under; the row you just took is WHITE, which is the one
 * value on this screen that has to be findable from a metre away. */
const AMBER = "#ffd400";
/** Ink on a filled plaque — the header rail, and the title's own box. */
const PLAQUE_INK = "#120b02";
const MINE = "#ffffff";
const DIM = "#6f6a52";

/**
 * WHAT THE SCREEN IS SHOWING — settled once, when the road hands over, and then
 * held.
 *
 * The rank is resolved BEFORE the initials are entered because it is what the
 * screen prints beside them, and it is a place in the WHOLE ladder rather than a
 * seat at the table: `4` sits inside the five rows, `767` under a rule below
 * them, and both are signed. Settled once so that a second component render
 * cannot re-ask a store that has meanwhile been written to.
 */
export type DriveBoardResult = {
  card: DriveScorecard;
  /** The rung the road was driven on, for the row's tag. */
  difficulty: string;
  /** This leg's place in the whole ladder (0-based), or null when its clock
   * never started and there is nothing to rank. */
  rank: number | null;
  /** The head of the ladder as it stood BEFORE this leg. */
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
    rank: driveTimeRank(card.ms),
    before: topDriveScores(),
  };
}

/**
 * One line of the board as it will be DRAWN: an incumbent, the row this leg just
 * took, or a slot nobody has claimed. Three cases rather than a nullable entry,
 * because "nobody has ever driven this" and "this is yours, and you are typing
 * into it" print completely differently and are trivially confused.
 */
type BoardRow =
  { kind: "set"; entry: DriveScoreEntry } | { kind: "new" } | { kind: "empty" };

/**
 * A NAME THE BOARD WILL TAKE, out of whatever the keyboard produced — upper
 * case, anything the pixel font cannot draw dropped rather than blanked, and cut
 * to three.
 *
 * DROPPED AND NOT BLANKED, which is where this parts company with
 * `clampInitials` beside it in the store. That one is repairing a name that has
 * already been banked (a hand-edited entry, another device's cloud save) and has
 * to keep its three columns; this one is watching somebody type, where an `Ø`
 * that silently became a space would eat the slot and the next letter would land
 * one place along.
 */
function typedName(raw: string): string {
  return [...raw.toUpperCase()]
    .filter((c) => INITIAL_CHARS.includes(c))
    .join("")
    .slice(0, INITIALS_LENGTH);
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
  // The name as it is being typed — TRIMMED of the store's padding, because a
  // field whose value is "AB " puts the caret past a space the player never
  // typed and takes no third letter.
  const [name, setName] = useState<string>(() => typedName(lastInitials()));
  const inputRef = useRef<HTMLInputElement>(null);
  /** ONE WAY OUT, HOWEVER IT IS TAKEN. The button, the ENTER key and the road's
   * own timeout all land here, and the row must be banked exactly once — a
   * double-tap on a phone is two events inside 80 ms. */
  const doneRef = useRef(false);

  // THE FIELD OWNS THE KEYBOARD THE MOMENT IT APPEARS — but only where there is
  // a keyboard to own. On a phone `focus()` outside a gesture cannot raise the
  // software one (see `auto-focus.ts`), and a field that holds focus with no
  // keyboard under it is the worst of both: the caret is there, the tap that
  // would summon the keyboard lands on an already-focused box and does nothing.
  // So a coarse pointer is left UNFOCUSED and the tap does the whole job.
  const finePointer =
    typeof window === "undefined" ||
    !window.matchMedia ||
    window.matchMedia("(pointer: fine)").matches;
  useAutoFocus(inputRef, entering && finePointer);

  // AND WHAT IT FINDS THERE IS SELECTED, NOT MERELY PRESENT — the same trap the
  // tap answers, in the one place there is no tap. A focused field already
  // holding three of three letters takes NO keystroke at all (`maxLength`), so
  // a hardware keyboard would have to backspace the previous player's name out
  // before it could type a letter. Selected, the first letter replaces it.
  useEffect(() => {
    if (!entering || !finePointer) return;
    inputRef.current?.select();
  }, [entering, finePointer]);

  const finish = useCallback(() => {
    if (doneRef.current) return;
    doneRef.current = true;
    if (entering) {
      const signed = signedInitials(name);
      rememberInitials(signed);
      recordDriveScore({
        name: signed,
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
  }, [card, entering, name, onDone, result.difficulty]);

  /** A keystroke landed in the field: keep what the board can spell, and blip
   * for a letter that actually went in. */
  const onType = useCallback((e: Event) => {
    const el = e.currentTarget as HTMLInputElement;
    const next = typedName(el.value);
    // The element is uncontrolled between renders (Preact writes `value` back
    // on the next commit), so a rejected character has to be wiped here or it
    // sits in the box invisible to the board.
    if (el.value !== next) el.value = next;
    setName((prev) => {
      if (next.length > prev.length) playUiSound(synth, "blip");
      return next;
    });
  }, []);

  /**
   * THE FIELD SPEAKS FOR ITSELF — and stops the keys it consumed from carrying
   * on into the road's own handler underneath, which is still bound to `window`
   * and answers the SCREENSHOT bind on a letter key. ENTER signs off from here
   * so a player never has to reach for the button.
   *
   * Everything the field does NOT consume is deliberately let through: that is
   * how the shutter still works over the one screen a player most wants a
   * picture of.
   */
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

  /**
   * A TAP ON THE NAME STARTS A FRESH ENTRY — it wipes the cell and takes the
   * keyboard, which is the one thing a player who wants to sign their own name
   * can do with the previous player's still sitting in it.
   *
   * THE FIELD ARRIVES PREFILLED with the last name signed on this device (an
   * arcade cabinet's own convenience: the usual player presses ENTER and is
   * gone), and prefilled it is FULL — three of three letters, `maxLength` 3 —
   * so a keystroke into it lands nowhere and the tap that was meant to clear it
   * did nothing but accept it. Erasing here is what makes the next letter the
   * first letter.
   *
   * AND THE ERASE IS WHAT THE TAP IS FOR, so it happens on every tap rather
   * than only the first: mid-entry, "start this name over" is the only thing
   * pressing a three-letter cell can sensibly mean, and it costs at most two
   * letters to undo.
   *
   * `blur()` FIRST WHEN IT ALREADY HAS FOCUS, which is the only way back from a
   * software keyboard the player swiped away: `focus()` on the already-focused
   * element is a no-op and the keyboard stays down, so focus is dropped and
   * retaken inside the same gesture — invisible where the keyboard is hardware.
   */
  const onCellTap = useCallback(() => {
    const el = inputRef.current;
    if (!el) return;
    // Wiped on the ELEMENT as well as in state: it is uncontrolled between
    // renders (see `onType`), so the letters would otherwise still be in the
    // box the caret is about to land in.
    const had = el.value.length > 0;
    el.value = "";
    setName("");
    if (had) playUiSound(synth, "back");
    if (document.activeElement === el) el.blur();
    el.focus();
  }, []);

  // THE ONE KEY THE SCREEN ANSWERS WHEN THE FIELD DOES NOT: ENTER (or SPACE) to
  // sign off. It is the whole of the handling for a leg that MISSED the board —
  // there is no field on that screen — and the fallback for a player who has
  // tapped the picture and dropped focus.
  //
  // ON `window` AND IN THE CAPTURE PHASE, because the road's own key handler is
  // still bound underneath (`DriveScreen`) and a SPACE pressed over the board
  // must not also be a handbrake. Events already headed for the field are left
  // entirely alone; ESCAPE is let through to the pause handler.
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

  // WHETHER THIS LEG IS IN THE TABLE OR UNDER IT — the one question the layout
  // turns on, asked once. A place inside the five is a row spliced into the
  // list; anything past it is the same row drawn below the rule, carrying its
  // real number.
  const onTable = rank !== null && rank < BOARD_SIZE;

  // The rows as they will READ: the table before this leg, with the new row
  // spliced into the place it took, then padded out so an empty machine shows
  // five empty rows rather than a short list — which is what tells a first
  // player there is something here to fill in.
  const rows: BoardRow[] = before.map((entry) => ({ kind: "set", entry }));
  if (onTable && rank !== null) rows.splice(rank, 0, { kind: "new" });
  while (rows.length < BOARD_SIZE) rows.push({ kind: "empty" });
  rows.length = BOARD_SIZE;

  /** The entry, wherever it is drawn — in the table or under the rule. */
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
      aria-label="drive-high-scores"
    >
      <div className="intro-box drive-scores-box">
        {/* THE PLAQUE. One word in a boxed frame, which is the whole headline a
            ranking screen has ever needed — what the player did is said by the
            row that is lit, not by a sentence over it. */}
        <div className={`drive-rank-plaque${rank === 0 ? " is-record" : ""}`}>
          <PixelText font={font} text="RANKING" scale={5} color={AMBER} />
        </div>

        <div className="drive-board">
          {/* THE HEADER RAIL — filled plaques with the ink knocked out, which
              is what separates a table's headings from its data at a glance and
              at a distance, where a colour change alone does not. */}
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

          {/* …AND THE LEG THAT DID NOT MAKE THE TABLE. Set apart under a rule,
              lit like the row it would have been if it were three seconds
              quicker, and carrying the number that says how far off that was.
              It is signed exactly like a winning row: this is a LADDER, and
              being 768th on one is a fact about you rather than a rejection. */}
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

          {/* A LEG WITH NO CLOCK ON IT AT ALL — one abandoned before the town
              gate, which the ladder cannot rank and never asks to sign. */}
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

        {entering && (
          <div className="drive-scores-hint">
            {/* WHAT TO DO WITH THE NAME ALREADY IN THE CELL, which is the only
                part of this screen a player can get stuck on. A keyboard can
                simply type over it (it arrives selected); a thumb has to be
                told the letters are a button. */}
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

/**
 * THE THREE LETTERS, TYPED.
 *
 * A REAL `<input>` LAID OVER PIXEL TEXT, which is the only arrangement that gets
 * both halves of what this needs. The letters have to be drawn in the game's own
 * font — they are a row of a table the four rows around them are drawn in — and
 * a `<input>` cannot be; a keyboard, hardware or software, only ever types into
 * a real form control. So the control is here, transparent, stretched over the
 * cell, and it is the tap target: the pixel glyphs beneath it are the picture of
 * its value.
 *
 * `font-size: 16px` is load-bearing on the field nobody can see — iOS zooms the
 * whole page in on a focused input any smaller, which on a landscape road screen
 * is a lurch that never comes back.
 */
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
  // Where the next letter lands — the slot that wears the caret. A full name
  // parks it on the LAST letter rather than past the end, because that is the
  // one another keystroke overwrites.
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
            {/* A BLANK IS A BLANK, not a gap. The space glyph draws nothing, so
                an empty slot would read as a letter that failed to render — the
                dash is what a cabinet prints there. */}
            {/* THE SAME TIER AS EVERY OTHER NAME ON THE BOARD. The row is a
                row: what marks it as yours is the band under it and the white
                ink, not a size nothing else on the table wears — a taller row
                one in from the top makes the whole ladder look mis-set. */}
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
        aria-label="drive-initials"
        onInput={onType}
        onKeyDown={onKey}
      />
    </span>
  );
}
