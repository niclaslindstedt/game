// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE TALK BOX — a conversation the player STEERS, shown while
// `phase === "talk"` (see engine/game/conversation.ts).
//
// IT WEARS THE QUEST BOX'S GOLD, AND THAT IS THE POINT. Every window in the
// game is on the shared steel skin except one: the errand box, which is gold
// because it is the modal the player is asked to make a DECISION in. A
// conversation tree is the same claim taken further — it is nothing BUT
// decisions — so it reuses the same frame, the same parchment wash, the same
// rail. A second gold surface does not dilute the signal; it is the signal.
//
// WHAT MAKES IT A DIFFERENT SCREEN IS THE FOOTER. Where the errand box ends in
// ACCEPT / DECLINE, this one ends in a COLUMN OF THINGS THE HERO MIGHT SAY,
// and three rules govern that column:
//
//   1. **The rows are the ENGINE's filtered list.** `talkChoices` has already
//      dropped every option the run has not earned, and the index passed back
//      indexes THAT list. Drawing the authored list and filtering here would
//      pick a different row than the one the player tapped the moment any gate
//      is in play — the classic off-by-one that only appears on the branch
//      nobody tested.
//   2. **The speaker's lines type; the hero's options do not.** The lines are
//      somebody talking, so they crawl on the same typewriter every spoken
//      line in the game uses. The options are the player's own mouth and they
//      print at once, because a menu that types itself in is a menu that makes
//      you wait to choose.
//   3. **Nothing is greyed.** A locked row is left OUT (the engine already
//      dropped it), never shown dim — a greyed row is still a sentence, and a
//      sentence the hero has not earned is a spoiler printed in the shape of a
//      locked door.

import { useCallback, useEffect, useMemo, useState } from "react";

import {
  talkChoices,
  talkNode,
  withHeroName,
  withHeroNameLines,
  type GameState,
} from "@game/core";

import { PixelText } from "@ui/lib/PixelText.tsx";
import type { PixelFont } from "@ui/lib/pixel-font.ts";
import { wrapPage } from "@ui/lib/text-pager.ts";
import { columnCapRem, useTextColumn } from "@ui/lib/use-text-column.ts";
import { useTypewriter } from "@ui/lib/typewriter.ts";

import { type GameAssets } from "../assets.ts";
import { SpritePortrait, useSpeakingBust } from "../SpritePortrait.tsx";

/** The scale every spoken and printed surface in the game shares. */
const TEXT_SCALE = 2;

/** Fallback cap until the box's column has been measured — see `columnCapRem`.
 * The box's real width is a share of the viewport, so this is the first frame's
 * bound and nothing else. It replaced a hardcoded 13rem that was applied at
 * every viewport: on anything wider than a small phone that printed a
 * half-width ragged column down the middle of a box twice its width. */
const QUEST_WRAP_REM = 20;

/** What a ROW eats before its label starts, in rem: `.quest-topic`'s padding
 * (0.7 × 2) and border (2px each side), its gap (0.6), and the mark slot
 * (0.85). A row's label is measured against its LIST's width, so this comes off
 * the top or a long sentence runs past the row it is in. Read it off
 * `.quest-topic` in styles.css if either changes. */
const ROW_INSET_REM = 0.7 * 2 + 0.25 + 0.6 + 0.85;

/** The cap for a label inside a pick-list row. */
function rowLabelCap(colFontPx: number | null, fallbackRem: number): number {
  return Math.max(
    4,
    columnCapRem(colFontPx, TEXT_SCALE, fallbackRem) - ROW_INSET_REM,
  );
}

export function TalkOverlay({
  state,
  assets,
  font,
  onAdvance,
  onPick,
  onBlip,
  onClose,
  heroName,
}: {
  state: GameState;
  assets: GameAssets;
  font: PixelFont;
  /** The name the player gave this hero — what an authored `{HERO}` in a
   * conversation resolves to (the people who ask him for things know him by
   * it). */
  heroName?: string;
  /** Page forward through the speaker's lines. */
  onAdvance: () => void;
  /** Take a branch — the index into the ENGINE's filtered choice list. */
  onPick: (index: number) => void;
  /** One typed character (the shared blip + haptic). */
  onBlip: () => void;
  onClose: () => void;
}) {
  const talk = state.talk;
  const node = talkNode(state);
  // DERIVED EVERY RENDER, AND NEVER MEMOIZED ON `state`. The run's state is
  // MUTATED IN PLACE — its object identity is fixed for the whole run — so a
  // `useMemo(…, [state])` here computed the first node's rows once and then
  // never again: every later node drew its own speech under the OPENING
  // node's buttons, while the index the player pressed was resolved against
  // the real node by the engine. (Caught eyeballing Ruth's meeting: page three
  // of the tree still offered page one's answers.) The filter is a pass over a
  // handful of authored rows, so calling it per render is cheaper than any
  // dependency list that would have to name the node AND every flag a
  // `requires:` row reads.
  const choices = talkChoices(state);
  // THE FACE, MOVING WHILE IT SPEAKS — when the art behind the speaker carries
  // a `talk:` clip (`render/clips.ts`). A hook, so it runs on every render and
  // simply hands back the still bust for a speaker with no clip, which is every
  // speaker in the shipped game. `talk` is null for exactly one render as the
  // tree closes, so the name it is given then is a dead string rather than an
  // early return — this is a hook, and hooks do not get to be conditional.
  const speakingBust = useSpeakingBust(
    assets.sprites,
    talk?.speaker.sprite ?? "",
    talk !== null,
  );
  const [cursor, setCursor] = useState(0);

  // A fresh node re-homes the cursor. Adjusted DURING RENDER (React's supported
  // "state derived from props" pattern, the same one the typewriter uses)
  // rather than in an effect: stepping from a four-row node to a two-row one
  // must not leave the highlight past the end of the list for a frame, and a
  // setState inside an effect cascades a second render to fix it.
  const [prevNode, setPrevNode] = useState(talk?.node);
  if (talk?.node !== prevNode) {
    setPrevNode(talk?.node);
    setCursor(0);
  }

  // A node's `say` is ONE page — the speaker's whole speech, typed out — so
  // the options appear the moment the crawl finishes and never before: a player
  // cannot answer a question they have not been asked yet. An authored line is
  // a PARAGRAPH, so it is flowed into the box's own measured column rather than
  // printed at whatever width it was typed at.
  const { ref: linesRef, fontPx: colFontPx } = useTextColumn(TEXT_SCALE);
  const { ref: choiceRef, fontPx: choiceColFontPx } = useTextColumn(TEXT_SCALE);
  const speech = useMemo(
    () =>
      wrapPage(
        withHeroNameLines([...(node?.say ?? [])], heroName),
        colFontPx == null ? null : (line) => font.wrap(line, colFontPx),
      ),
    [node, colFontPx, font, heroName],
  );
  const { rows, done, skip } = useTypewriter(speech, (visibleIndex) => {
    // Every other character — the same cadence the dialogue and quest boxes use.
    if (visibleIndex % 2 === 0) onBlip();
  });

  const showChoices = done && choices.length > 0;

  const advance = useCallback(() => {
    if (!done) {
      skip();
      return;
    }
    if (!showChoices) onAdvance();
  }, [done, skip, showChoices, onAdvance]);

  const pick = useCallback(
    (index: number) => {
      if (index < 0 || index >= choices.length) return;
      onPick(index);
    },
    [choices.length, onPick],
  );

  // Keyboard and gamepad (the pad is translated into these very keys — see
  // @ui/lib/gamepad-keys.ts — so this listener serves both without knowing a
  // pad exists).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }
      if (!showChoices) {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          advance();
        }
        return;
      }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setCursor((c) => (c + 1) % choices.length);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setCursor((c) => (c - 1 + choices.length) % choices.length);
      } else if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        pick(cursor);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [showChoices, choices.length, cursor, advance, pick, onClose]);

  if (!talk || !node) return null;

  return (
    <div className="game-overlay quest-overlay" role="presentation">
      <div className="quest-box">
        <div className="quest-banner">
          {/* THE BANNER IS THE QUEST BOX'S GOLD (#ffd75e), not a shade of its
              own. It was authored at #3a2a10 — a brown a step or two off the
              parchment wash behind it — which on a phone in daylight was a word
              you had to hunt for above a box that reads instantly. */}
          <PixelText text="TALKING" font={font} scale={2} color="#ffd75e" />
        </div>

        {/* THE FACE STANDS BESIDE THE SPEECH, exactly as the errand box's does:
            the portrait is `.quest-vn`'s own first child, so the name and the
            lines share one column to its right. Nesting it inside
            `.quest-speaker` instead stacked the name UNDER the face on the flex
            column's 0.4rem gap — half the air the box gives anything else, and
            a layout the sibling gold box did not share. */}
        <div className="quest-vn">
          <SpritePortrait
            src={speakingBust}
            frameClass="quest-portrait-frame"
          />
          <div className="quest-content">
            <div className="quest-speaker">
              <PixelText
                text={talk.speaker.name}
                font={font}
                scale={TEXT_SCALE}
                color="#c9a95c"
              />
            </div>
            {/* Tapping the LINES pages forward (or skips the crawl); tapping a
                row picks it. Two targets, never overlapping — a tap that both
                skipped the type-on and chose an answer would answer for the
                player before they had read the question. */}
            <div
              className="quest-lines"
              ref={linesRef}
              onPointerDown={showChoices ? undefined : advance}
            >
              {rows.map((row, i) => (
                <PixelText
                  key={i}
                  text={row}
                  font={font}
                  scale={TEXT_SCALE}
                  color="#efe6cd"
                  maxWidth={columnCapRem(colFontPx, TEXT_SCALE, QUEST_WRAP_REM)}
                />
              ))}
            </div>
          </div>
        </div>

        {showChoices ? (
          <div className="quest-topics talk-choices" ref={choiceRef}>
            {choices.map((choice, i) => (
              <button
                type="button"
                key={`${choice.text}-${i}`}
                className={`quest-topic${i === cursor ? " selected" : ""}`}
                onPointerEnter={() => setCursor(i)}
                onPointerDown={(e) => {
                  e.preventDefault();
                  pick(i);
                }}
              >
                <span className="quest-topic-mark">
                  <PixelText
                    text={i === cursor ? ">" : " "}
                    font={font}
                    scale={TEXT_SCALE}
                    color="#ffb02e"
                  />
                </span>
                <PixelText
                  text={withHeroName(choice.text, heroName)}
                  font={font}
                  scale={TEXT_SCALE}
                  color={i === cursor ? "#ffd98a" : "#c8bda0"}
                  maxWidth={rowLabelCap(choiceColFontPx, QUEST_WRAP_REM)}
                />
              </button>
            ))}
          </div>
        ) : (
          <div className="quest-actions">
            <button
              type="button"
              className="pixel-button secondary quest-button"
              onPointerDown={(e) => {
                e.preventDefault();
                advance();
              }}
            >
              {/* THE LABEL IS PIXEL ART, like every other button in the game —
                  the cutscene's own SKIP, the errand box's ACCEPT / DECLINE.
                  Left as a bare text node it fell through to the page's UI
                  font, so the one control on the box was the one thing on it
                  not written in the game's own letters. */}
              <PixelText
                text={done ? "NEXT" : "SKIP"}
                font={font}
                scale={2}
                color="#f6e3b0"
              />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
