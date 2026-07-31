// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The level's opening monologue: the hero, alone on a black screen, saying why
// he came here. He stands above a JRPG dialogue box that prints his briefing
// letter by letter with a 16-bit blip and dramatic pauses — a tap finishes the
// crawl, the next turns the page, and the last one flashes the level name (the
// `title` phase) before the drop. A SKIP button bails the whole monologue.
//
// Wrapping + scrolling, exactly as the in-world box does it (DialogueOverlay):
// an authored line is a PARAGRAPH, flowed into the box's *measured* text column
// and windowed into screens of at most `MAX_VISIBLE_LINES` rows. This box
// carries no portrait, so its column is the widest in the game — printing the
// authored breaks verbatim left a monologue stacked in a ragged half-width
// column with the right half of the window empty.

import { useCallback, useEffect, useState, type MutableRefObject } from "react";

import { playerAppearance, runLevelDef, type GameState } from "@game/core";

import { PixelText } from "@ui/lib/PixelText.tsx";
import type { PixelFont } from "@ui/lib/pixel-font.ts";
import { paginateLines, wrapPage } from "@ui/lib/text-pager.ts";
import { useTextColumn } from "@ui/lib/use-text-column.ts";
import { useTypewriter } from "@ui/lib/typewriter.ts";

import { spriteDataUrl, type GameAssets } from "../assets.ts";

/** The reveal state the overlay publishes so the app's keyboard advance can
 * share the tap's two-step semantics (finish the crawl, then turn the page). */
export type IntroReveal = { done: boolean; skip: () => void };

const EMPTY_PAGE: readonly string[] = [];

/** Integer pixel scale the monologue is drawn at — mirror of the `scale` prop
 * passed to every body `PixelText`. Turns the measured CSS column width into
 * the unscaled font pixels `font.wrap` speaks. */
const TEXT_SCALE = 2;

/**
 * Most body rows shown at once before a page has to scroll — the same three
 * the in-world box reserves, so the two never disagree about how tall a
 * dialogue box is.
 */
const MAX_VISIBLE_LINES = 3;

/**
 * Loose safety cap for a single row's `PixelText`, in rem. Rows are already
 * flowed to the measured column here, so this only catches the degenerate case
 * (column not yet measured) and never re-breaks a row that already fits.
 */
const INTRO_TEXT_REM = 33;

export function IntroOverlay({
  state,
  assets,
  font,
  onAdvance,
  onSkip,
  onBlip,
  revealRef,
  variant = "intro",
}: {
  state: GameState;
  assets: GameAssets;
  font: PixelFont;
  /** Turn the page (past the last one the engine flashes the level name). */
  onAdvance: () => void;
  /** The SKIP button: cut the monologue short, straight to the title card. */
  onSkip: () => void;
  /** Play the letter-print blip — fired as briefing characters land. */
  onBlip?: () => void;
  /** Mirror of the live reveal state for the out-of-overlay advance handler. */
  revealRef?: MutableRefObject<IntroReveal>;
  /**
   * Which black-screen monologue this overlay plays: the level's opening
   * `intro` (default) or its post-victory `outro` epilogue — same hero, same
   * box, same typewriter; only the page source (and the phase mutators the
   * caller wires) differ.
   */
  variant?: "intro" | "outro";
}) {
  const def = runLevelDef(state);
  const pages = variant === "outro" ? (def.outro ?? []) : def.intro;
  const pageIndex = variant === "outro" ? state.outroPage : state.introPage;
  const page = pages[pageIndex] ?? EMPTY_PAGE;

  // Flow each authored line into the box's live text column, then window the
  // folded result into screens the player scrolls through.
  const { ref: bodyRef, fontPx: colFontPx } = useTextColumn(TEXT_SCALE);
  const visualLines = wrapPage(
    page,
    colFontPx == null ? null : (line) => font.wrap(line, colFontPx),
  );
  const screens = paginateLines(visualLines, MAX_VISIBLE_LINES);

  // Which screen of the current page is showing. Reset whenever the page (or
  // the variant) changes; clamp in case a resize collapsed the screen count.
  const pageKey = `${variant}:${pageIndex}`;
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
  } = useTypewriter(currentLines, (visibleIndex) => {
    if (visibleIndex % 2 === 0) onBlip?.();
  });

  // The tap's staged action: finish the crawl, else scroll to the next screen.
  // Only once both are exhausted is a tap a page turn (`done` → the caller
  // runs onAdvance instead).
  const done = crawlDone && !hasMoreScreens;
  const advance = useCallback(() => {
    if (!crawlDone) skip();
    else if (hasMoreScreens) setScreen((s) => s + 1);
  }, [crawlDone, hasMoreScreens, skip]);

  // Publish the reveal so keyboard advance matches the tap: the first input
  // finishes the crawl, the next scrolls, the last turns the page.
  useEffect(() => {
    if (revealRef) revealRef.current = { done, skip: advance };
  }, [revealRef, done, advance]);

  // Reserve a stable row count for the whole page (the tallest screen) so the
  // box never resizes as the monologue scrolls; the last, short screen pads
  // with empty rows instead of shrinking the box under the hero.
  const reservedRows = Math.min(
    MAX_VISIBLE_LINES,
    Math.max(1, visualLines.length),
  );

  // The hero stands over the box in whatever he's wearing this level (plain
  // clothes at SpaceZ HQ, the EVA suit on the moon) — his idle frame, bobbing.
  const hero = spriteDataUrl(assets.sprites, `${playerAppearance(state)}_0`);

  return (
    <div
      className="game-overlay intro-overlay"
      onPointerDown={() => (done ? onAdvance() : advance())}
      role="presentation"
    >
      <div className="intro-stage">
        {hero && <img src={hero} alt="" className="pixel-img intro-hero" />}
      </div>
      <div className="dialogue-box intro-dialogue-box">
        <div className="dialogue-header">
          <PixelText font={font} text="ME" scale={2} color="#7ef0c8" />
        </div>
        <div className="dialogue-body" ref={bodyRef}>
          {/* Stack the lines in a flex column: a bare PixelText <canvas> is
              inline and taller than the default line-height, so laying the rows
              out on shared line-boxes prints them on top of each other (the same
              overlap `.dialogue-lines` fixes for the in-world box). Keyed by
              screen so scrolling replays the slide-in. */}
          <div className="dialogue-lines" key={activeScreen}>
            {Array.from({ length: reservedRows }).map((_, i) => (
              // Reserve each row's full height (PixelText is fixed-height even
              // when empty) so the box never reflows as the crawl fills it in.
              <PixelText
                key={i}
                font={font}
                text={rows[i] ?? ""}
                scale={2}
                maxWidth={INTRO_TEXT_REM}
              />
            ))}
          </div>
          {crawlDone && hasMoreScreens && (
            <div className="dialogue-more" aria-hidden="true" />
          )}
        </div>
      </div>
      <button
        type="button"
        className="pixel-button secondary cutscene-skip"
        aria-label="skip-intro"
        onClick={(event) => {
          event.stopPropagation();
          onSkip();
        }}
        onPointerDown={(event) => event.stopPropagation()}
      >
        <PixelText font={font} text="SKIP" scale={2} />
      </button>
    </div>
  );
}
