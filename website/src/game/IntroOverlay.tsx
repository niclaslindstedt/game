// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The level's opening monologue: the hero, alone on a black screen, saying why
// he came here. He stands above a JRPG dialogue box that prints his briefing
// letter by letter with a 16-bit blip and dramatic pauses — a tap finishes the
// crawl, the next turns the page, and the last one flashes the level name (the
// `title` phase) before the drop. A SKIP button bails the whole monologue.

import { useEffect, type MutableRefObject } from "react";

import { levelDef, playerAppearance, type GameState } from "@game/core";

import { PixelText } from "@ui/lib/PixelText.tsx";
import type { PixelFont } from "@ui/lib/pixel-font.ts";
import { useTypewriter } from "@ui/lib/typewriter.ts";

import { spriteDataUrl, type GameAssets } from "./assets.ts";

/** The reveal state the overlay publishes so the app's keyboard advance can
 * share the tap's two-step semantics (finish the crawl, then turn the page). */
export type IntroReveal = { done: boolean; skip: () => void };

const EMPTY_PAGE: readonly string[] = [];

/**
 * Wrap width for the monologue text, in rem: the box caps at 36rem, less its
 * 1.2rem side padding — this box carries no portrait, so the text owns the full
 * width. Authored briefings (already fitting) keep their line breaks; a stray
 * over-long line folds instead of running off. Keep in step with
 * `.dialogue-box` in styles.css.
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
}) {
  const pages = levelDef(state.level.id).intro;
  const page = pages[state.introPage] ?? EMPTY_PAGE;

  // Blip on every other printed character — a dense-enough "typing" chatter
  // without a machine-gun at the per-character crawl rate.
  const { rows, done, skip } = useTypewriter(page, (visibleIndex) => {
    if (visibleIndex % 2 === 0) onBlip?.();
  });

  // Publish the reveal so keyboard advance matches the tap: the first input
  // finishes the crawl, the next turns the page.
  useEffect(() => {
    if (revealRef) revealRef.current = { done, skip };
  }, [revealRef, done, skip]);

  // The hero stands over the box in whatever he's wearing this level (plain
  // clothes at SpaceZ HQ, the EVA suit on the moon) — his idle frame, bobbing.
  const hero = spriteDataUrl(assets.sprites, `${playerAppearance(state)}_0`);

  return (
    <div
      className="game-overlay intro-overlay"
      onPointerDown={() => (done ? onAdvance() : skip())}
      role="presentation"
    >
      <div className="intro-stage">
        {hero && <img src={hero} alt="" className="pixel-img intro-hero" />}
      </div>
      <div className="dialogue-box intro-dialogue-box">
        <div className="dialogue-header">
          <PixelText font={font} text="ME" scale={2} color="#7ef0c8" />
        </div>
        <div className="dialogue-body">
          {/* Stack the lines in a flex column: a bare PixelText <canvas> is
              inline and taller than the default line-height, so laying the rows
              out on shared line-boxes prints them on top of each other (the same
              overlap `.dialogue-lines` fixes for the in-world box). */}
          <div className="dialogue-lines">
            {page.map((row, i) => (
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
