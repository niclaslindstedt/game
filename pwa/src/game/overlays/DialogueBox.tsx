// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE DIALOGUE BOX — the window the game says everything in, on its own.
//
// WHY IT IS A COMPONENT RATHER THAN A SHAPE EACH SURFACE COPIES. What the box
// IS turns out to be six things, and every one of them is a bug the moment a
// surface reimplements it:
//
//   THE SKIN     the FF6 window (`--panel-fill`, styles.css `.dialogue-box`) —
//                the grain, the pipe rails, the grounded shadow. A surface that
//                draws its own dark rectangle with a grey border is instantly
//                a different program, which is exactly what an interlude must
//                not look like.
//   THE FLOW     an authored line is a PARAGRAPH, not a row. It is re-broken
//                into the box's MEASURED column (`useTextColumn`), which is a
//                different width on every device — and then handed to
//                `PixelText` at that very width (`columnCapRem`), because a
//                canvas allowed to grow past its parent drags the parent with
//                it and the speech runs out of the modal. Both halves of that
//                have shipped as bugs; see the hook's own note.
//   THE PAGING   the folded result windowed into screens of three rows, so a
//                long speech scrolls in place instead of overflowing a phone.
//   THE CRAWL    the letter-by-letter print, with the blip on every other
//                character — held where it stands while a screen the player
//                raised sits over it.
//   THE STAGING  one tap finishes the crawl, the next scrolls, and only when
//                both are exhausted is a tap a page turn — published on a REF
//                so the caller's own tap target and its keyboard handler share
//                the semantics exactly.
//   THE FACE     a full-height portrait beside the name, or no portrait at all
//                and the name over the lines.
//
// THE BOX DOES NOT CATCH TAPS (`pointer-events: none`). The surface around it
// does, because every surface wants a different backdrop under it — a barely
// dimmed field the speaker keeps bobbing in, a black monologue stage, a road at
// 120 mph. So the caller owns the overlay and reads `revealRef` to decide what
// its tap meant.

import { useCallback, useEffect, useState, type MutableRefObject } from "react";

import { PixelText } from "@ui/lib/PixelText.tsx";
import type { PixelFont } from "@ui/lib/pixel-font.ts";
import { paginateLines, wrapPage } from "@ui/lib/text-pager.ts";
import { columnCapRem, useTextColumn } from "@ui/lib/use-text-column.ts";
import { useTypewriter } from "@ui/lib/typewriter.ts";

import { SpritePortrait } from "../SpritePortrait.tsx";

/** The reveal state the box publishes so a caller's keyboard/gamepad advance
 * can share its tap's semantics (finish, scroll, then turn). */
export type DialogueReveal = { done: boolean; skip: () => void };

/** What a ref starts life holding — a box with nothing in it is "done", so a
 * tap before the first page falls through to the caller's advance. */
export const IDLE_REVEAL: DialogueReveal = { done: true, skip: () => {} };

const EMPTY_PAGE: string[] = [];

/** Integer pixel scale the body text is drawn at — the unit the measured column
 * is converted into font pixels with. */
export const DIALOGUE_TEXT_SCALE = 2;

/**
 * Most body rows shown at once before a speech has to scroll. Three keeps the
 * box the height it has always been on the reference landscape phone (where
 * authored pages are already ≤3 lines and nothing wraps); a portrait phone,
 * whose narrow box folds long lines into more rows, pages through them.
 */
const MAX_VISIBLE_LINES = 3;

/**
 * Loose safety cap for a single row's `PixelText`, in rem. Rows are already
 * wrapped to the column here, so this only catches a degenerate case (column
 * not yet measured) and never rewraps an authored, pre-fit line.
 */
const DIALOGUE_TEXT_REM = 28;

export function DialogueBox({
  font,
  lines,
  speaker,
  speakerColor = "#ffd75e",
  portrait,
  banner,
  bannerClass,
  pageKey,
  revealRef,
  onBlip,
  paused,
  className,
}: {
  font: PixelFont;
  /** The authored page, as PARAGRAPHS — re-broken to the live column here. */
  lines: readonly string[];
  /** Who is talking. Omitted → no name row at all. */
  speaker?: string;
  speakerColor?: string;
  /** The speaker's face, already resolved to a data URL by the caller (only it
   * knows whether this is a paper doll, a bust or an item icon). Omitted → the
   * name sits straight over the lines, with no portrait panel. */
  portrait?: string | null;
  /** An optional banner across the top of the box ("STORY ITEM ACQUIRED"). */
  banner?: string;
  bannerClass?: string;
  /**
   * A stable identity for the page being shown. When it changes the box resets
   * to its first screen — so a page turn starts at the top rather than halfway
   * down the last one's scroll.
   */
  pageKey: string;
  /** Where the box publishes its staged reveal for the caller to read. */
  revealRef: MutableRefObject<DialogueReveal>;
  /** Play the letter-print blip — fired as characters land. */
  onBlip?: () => void;
  /**
   * HOLD THE CRAWL where it stands — a screen the player raised OVER this one
   * (the pause menu, the bag at an arrival stare-down). The box is behind a
   * modal there, so letters printing on would be a speech delivered to a
   * covered stage, blips included. It picks up on the character it stopped at.
   */
  paused?: boolean;
  className?: string;
}) {
  // The rendered text column's width, in unscaled font pixels — the unit
  // `font.wrap` measures in. Measured from the live box so wrapping tracks the
  // actual viewport, portrait or landscape, phone or desktop.
  const { ref: bodyRef, fontPx: colFontPx } =
    useTextColumn(DIALOGUE_TEXT_SCALE);

  // Flow each authored line into the measured column, then window the folded
  // result into screens of at most MAX_VISIBLE_LINES rows. (React Compiler
  // memoizes these plain derivations — no manual useMemo, which it can't
  // preserve over a caller-owned `lines` array.)
  const visualLines = wrapPage(
    lines,
    colFontPx == null ? null : (line) => font.wrap(line, colFontPx),
  );
  const screens = paginateLines(visualLines, MAX_VISIBLE_LINES);

  // Which screen of the current page is showing. Reset whenever the page
  // changes; clamp in case a resize collapsed the screen count.
  const [screen, setScreen] = useState(0);
  const [prevKey, setPrevKey] = useState(pageKey);
  if (pageKey !== prevKey) {
    setPrevKey(pageKey);
    setScreen(0);
  }
  const activeScreen = Math.min(screen, screens.length - 1);
  const currentLines = screens[activeScreen] ?? EMPTY_PAGE;
  const hasMoreScreens = activeScreen < screens.length - 1;

  // Blip on every other printed character — a dense-enough "typing" chatter
  // without a machine-gun at the per-character crawl rate.
  const {
    rows,
    done: crawlDone,
    skip,
  } = useTypewriter(
    currentLines,
    (visibleIndex) => {
      if (visibleIndex % 2 === 0) onBlip?.();
    },
    { paused },
  );

  // The tap's staged action: finish the crawl, else scroll to the next screen.
  // Once the crawl is done AND there is no more to scroll, the tap belongs to
  // the caller (`done` true → it runs its own advance instead).
  const done = crawlDone && !hasMoreScreens;
  const advance = useCallback(() => {
    if (!crawlDone) skip();
    else if (hasMoreScreens) setScreen((s) => s + 1);
  }, [crawlDone, hasMoreScreens, skip]);

  useEffect(() => {
    revealRef.current = { done, skip: advance };
  }, [revealRef, done, advance]);

  // A box that has gone leaves the ref saying "nothing to reveal", so the
  // caller's next tap belongs to the caller rather than to a speech that is no
  // longer on screen.
  useEffect(
    () => () => {
      revealRef.current = IDLE_REVEAL;
    },
    [revealRef],
  );

  // Reserve a stable row count for the whole page (the tallest screen) so the
  // box never resizes as the speech scrolls; the last, short screen pads with
  // empty rows instead of shrinking the box.
  const reservedRows = Math.min(
    MAX_VISIBLE_LINES,
    Math.max(1, visualLines.length),
  );

  // WITHOUT a portrait the content block is a direct child of the box, and the
  // box is a column flex that does not stretch its children — so it has to
  // claim the width itself or the measured column collapses to min-content and
  // the speech prints one syllable a row (see `.dialogue-content-plain`).
  const body = (
    <div
      className={
        portrait === undefined
          ? "dialogue-content dialogue-content-plain"
          : "dialogue-content"
      }
    >
      {speaker !== undefined && (
        <div className="dialogue-header">
          <PixelText
            font={font}
            text={speaker}
            scale={DIALOGUE_TEXT_SCALE}
            color={speakerColor}
            maxWidth={DIALOGUE_TEXT_REM}
          />
        </div>
      )}
      <div className="dialogue-body" ref={bodyRef}>
        {/* Keyed by screen so turning to the next screen replays the
            scroll-in slide; the crawl then prints on top of it. */}
        <div className="dialogue-lines" key={activeScreen}>
          {Array.from({ length: reservedRows }).map((_, i) => (
            // Reserve each row's full height (PixelText is fixed-height even
            // when empty) so the box never reflows as it fills in.
            <PixelText
              key={i}
              font={font}
              text={rows[i] ?? ""}
              scale={DIALOGUE_TEXT_SCALE}
              // The column's OWN width, so `PixelText`'s second wrap is a
              // no-op over rows already flowed to it — see `columnCapRem`
              // for why neither a narrower constant nor no cap at all works.
              maxWidth={columnCapRem(
                colFontPx,
                DIALOGUE_TEXT_SCALE,
                DIALOGUE_TEXT_REM,
              )}
            />
          ))}
        </div>
        {crawlDone && hasMoreScreens && (
          <div className="dialogue-more" aria-hidden="true" />
        )}
      </div>
    </div>
  );

  return (
    <div className={className ? `dialogue-box ${className}` : "dialogue-box"}>
      {banner !== undefined && (
        <div className={bannerClass ?? "dialogue-acquired"}>
          <PixelText
            font={font}
            text={banner}
            scale={DIALOGUE_TEXT_SCALE}
            color="#7fe3a0"
          />
        </div>
      )}
      {portrait === undefined ? (
        body
      ) : (
        // VN layout: the speaker's face fills the box's full height on the
        // left, name + line stacked beside it.
        <div className="dialogue-vn">
          <SpritePortrait src={portrait} frameClass="dialogue-portrait-frame" />
          {body}
        </div>
      )}
    </div>
  );
}
