// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The in-world dialogue box, shown while `phase === "dialogue"`: an elite
// rushing into frame, a boss at the stare-down, or a picked-up story item
// revealing its lore. Unlike the full-screen pause overlays this one barely
// dims the world — the speaker keeps bobbing behind it (the render loop
// still draws frames on the frozen state), which is the whole point of the
// idle animation. The line prints letter by letter with a 16-bit blip and
// dramatic pauses; the first tap finishes the crawl, the next scrolls to the
// rest of a long speech (or turns the page), and the engine resumes play
// after the last one.
//
// Wrapping + scrolling: an authored line is a PARAGRAPH, not a row — the box
// it lands in is a different width on every device, so the line is flowed into
// the box's *measured* text column and the folded result windowed into screens
// of at most `MAX_VISIBLE_LINES` rows. A tap reveals the next screen, so a long
// speech scrolls in place instead of overflowing a portrait phone or printing a
// ragged half-width column on a desktop. This is purely presentational: the
// engine still owns page turns (`advanceDialogue`), which only fire once the
// last screen of the last page has been read.

import { useCallback, useEffect, useState, type MutableRefObject } from "react";

import { dialogueContent, playerAppearance, type GameState } from "@game/core";

import { PixelText } from "@ui/lib/PixelText.tsx";
import type { PixelFont } from "@ui/lib/pixel-font.ts";
import { paginateLines, wrapPage } from "@ui/lib/text-pager.ts";
import { columnCapRem, useTextColumn } from "@ui/lib/use-text-column.ts";
import { useTypewriter } from "@ui/lib/typewriter.ts";

import { spriteDataUrl, type GameAssets } from "../assets.ts";
import { heroSoak } from "../game-screen/hero-soak.ts";
import { dollDataUrl } from "../paper-doll.ts";
import { playerDollLayers } from "../paper-doll-live.ts";
import { portraitSrc, SpritePortrait } from "../SpritePortrait.tsx";

/** The reveal state the overlay publishes so the app's keyboard/gamepad
 * advance can share the tap's semantics (finish, scroll, then turn). */
export type DialogueReveal = { done: boolean; skip: () => void };

const EMPTY_PAGE: string[] = [];

/** Integer pixel scale the dialogue text is drawn at — mirror of the `scale`
 * prop passed to every body `PixelText`. Used to turn the measured CSS column
 * width into the unscaled font pixels `font.wrap` speaks. */
const TEXT_SCALE = 2;

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

export function DialogueOverlay({
  state,
  assets,
  font,
  onAdvance,
  onBlip,
  onMute,
  revealRef,
}: {
  state: GameState;
  assets: GameAssets;
  font: PixelFont;
  /** Turn the page (the engine ends the scene on the last). */
  onAdvance: () => void;
  /** Play the letter-print blip — fired as characters land. */
  onBlip?: () => void;
  /** Silence dialogue for the rest of the level and dismiss this scene. */
  onMute?: () => void;
  /** Mirror of the live reveal state for out-of-overlay advance handlers. */
  revealRef?: MutableRefObject<DialogueReveal>;
}) {
  const dialogue = state.dialogue;
  const content = dialogue ? dialogueContent(dialogue) : null;
  const page = content?.pages[dialogue!.page] ?? EMPTY_PAGE;

  // The rendered text column's width, in unscaled font pixels — the unit
  // `font.wrap` measures in. Measured from the live box so wrapping tracks the
  // actual viewport, portrait or landscape, phone or desktop.
  const { ref: bodyRef, fontPx: colFontPx } = useTextColumn(TEXT_SCALE);

  // Flow each authored line into the measured column, then window the folded
  // result into screens of at most MAX_VISIBLE_LINES rows. (React Compiler
  // memoizes these plain derivations — no manual useMemo, which it can't
  // preserve over the engine-owned `page` array.)
  const visualLines = wrapPage(
    page,
    colFontPx == null ? null : (line) => font.wrap(line, colFontPx),
  );
  const screens = paginateLines(visualLines, MAX_VISIBLE_LINES);

  // Which screen of the current page is showing. Reset whenever the page (or
  // the whole scene) changes; clamp in case a resize collapsed screen count.
  const pageKey = `${dialogue?.source.kind ?? ""}:${dialogue?.page ?? -1}`;
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
  // Once the crawl is done AND there is no more to scroll, the tap is a page
  // turn (`done` true → the caller runs onAdvance instead).
  const done = crawlDone && !hasMoreScreens;
  const advance = useCallback(() => {
    if (!crawlDone) skip();
    else if (hasMoreScreens) setScreen((s) => s + 1);
  }, [crawlDone, hasMoreScreens, skip]);

  // Publish the reveal so keyboard/gamepad advance matches the tap.
  useEffect(() => {
    if (revealRef) revealRef.current = { done, skip: advance };
  }, [revealRef, done, advance]);

  if (!dialogue || !content) return null;

  // A story-item find gets a banner so the box unmistakably reads as "you
  // picked this up — here's what it is", not another mob talking at you.
  const isStoryItem = dialogue.source.kind === "story";
  // WHO IS DELIVERING THIS PAGE. The engine resolves it per page (see
  // `DialogueVoice`), so the box draws a two-way exchange without knowing which
  // KIND of scene it is in: a mob's arrival the hero answers back in, and one
  // of his own monologues somebody answers back TO, arrive here identically.
  const voice = content.voices[dialogue.page] ?? null;
  const heroSpeaks = voice?.hero ?? false;
  // The hero's inner monologue — and his replies in a two-way scene — show
  // HIM: the dressed paper-doll (worn armor + held weapon over the body), the
  // same avatar the HUD and inventory portray, so his lines are delivered by
  // the character the player actually recognizes, gear and all. Resolved live
  // from the loadout: plain clothes and empty hands until he loots them, so
  // his GOODCO-HQ appearances never flash gear he hasn't found. (This is the
  // in-world dialogue only — the level intro monologue keeps its bare hero.)
  // Enemy speakers bob live on the canvas behind the box; story items show
  // their icon so the find stays on screen.
  const portrait = heroSpeaks
    ? (dollDataUrl(
        assets.sprites,
        playerDollLayers(state, "0"),
        heroSoak(state),
      ) ??
      spriteDataUrl(assets.sprites, `${playerAppearance(state)}_0`) ??
      null)
    : // A story item names an exact icon; a character names a walk-cycle
      // family. `portraitSrc` tries the exact name first, so one call covers
      // both (see SpritePortrait.tsx).
      portraitSrc(assets.sprites, voice?.portrait ?? content.portrait);

  // Reserve a stable row count for the whole page (the tallest screen) so the
  // box never resizes as the speech scrolls; the last, short screen pads with
  // empty rows instead of shrinking the box.
  const reservedRows = Math.min(
    MAX_VISIBLE_LINES,
    Math.max(1, visualLines.length),
  );

  return (
    <div
      className="game-overlay dialogue-overlay"
      onPointerDown={() => (done ? onAdvance() : advance())}
      role="presentation"
    >
      {/* MUTE: silence every in-world scene for the rest of the level — the
          chat bubble struck through. Its taps stop at the button so they never
          fall through to the overlay's advance. Cutscenes keep their own SKIP;
          this is only for the repeatable field chatter. */}
      {onMute && (
        <button
          type="button"
          className="dialogue-mute"
          aria-label="mute-dialogue"
          onClick={(event) => {
            event.stopPropagation();
            onMute();
          }}
          onPointerDown={(event) => event.stopPropagation()}
        >
          <img
            src={spriteDataUrl(assets.sprites, "icon_dialogue_off") ?? ""}
            alt=""
            className="pixel-img dialogue-mute-icon"
          />
        </button>
      )}
      <div className="dialogue-box">
        {isStoryItem && (
          <div className="dialogue-acquired">
            <PixelText
              font={font}
              text="STORY ITEM ACQUIRED"
              scale={2}
              color="#7fe3a0"
            />
          </div>
        )}
        {/* VN layout: the speaker's face fills the box's full height on the
            left, name + line stacked beside it — no wasted rows now that the
            "tap to continue" hint is gone. */}
        <div className="dialogue-vn">
          <SpritePortrait src={portrait} frameClass="dialogue-portrait-frame" />
          <div className="dialogue-content">
            <div className="dialogue-header">
              <PixelText
                font={font}
                text={voice?.speaker ?? content.speaker}
                scale={2}
                color="#ffd75e"
                maxWidth={DIALOGUE_TEXT_REM}
              />
            </div>
            <div className="dialogue-body" ref={bodyRef}>
              {/* Keyed by screen so turning to the next screen replays the
                  scroll-in slide; the crawl then prints on top of it. */}
              <div className="dialogue-lines" key={activeScreen}>
                {Array.from({ length: reservedRows }).map((_, i) => (
                  // Reserve each row's full height (PixelText is fixed-height
                  // even when empty) so the box never reflows as it fills in.
                  <PixelText
                    key={i}
                    font={font}
                    text={rows[i] ?? ""}
                    scale={2}
                    // The column's OWN width, so `PixelText`'s second wrap is a
                    // no-op over rows already flowed to it — see `columnCapRem`
                    // for why neither a narrower constant nor no cap at all
                    // works here.
                    maxWidth={columnCapRem(colFontPx, 2, DIALOGUE_TEXT_REM)}
                  />
                ))}
              </div>
              {crawlDone && hasMoreScreens && (
                <div className="dialogue-more" aria-hidden="true" />
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
