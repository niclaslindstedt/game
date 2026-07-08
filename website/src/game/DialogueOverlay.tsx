// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The in-world dialogue box, shown while `phase === "dialogue"`: an elite
// rushing into frame, a boss at the stare-down, or a picked-up story item
// revealing its lore. Unlike the full-screen pause overlays this one barely
// dims the world — the speaker keeps bobbing behind it (the render loop
// still draws frames on the frozen state), which is the whole point of the
// idle animation. The line prints letter by letter with a 16-bit blip and
// dramatic pauses; the first tap finishes the crawl, the next turns the page,
// and the engine resumes play after the last one.

import { useEffect, type MutableRefObject } from "react";

import { dialogueContent, type GameState } from "@game/core";

import { PixelText } from "@ui/lib/PixelText.tsx";
import type { PixelFont } from "@ui/lib/pixel-font.ts";
import { useTypewriter } from "@ui/lib/typewriter.ts";

import { spriteDataUrl, type GameAssets } from "./assets.ts";

/** The reveal state the overlay publishes so the app's keyboard/gamepad
 * advance can share the tap's two-step semantics (finish, then turn). */
export type DialogueReveal = { done: boolean; skip: () => void };

const EMPTY_PAGE: string[] = [];

export function DialogueOverlay({
  state,
  assets,
  font,
  onAdvance,
  onBlip,
  revealRef,
}: {
  state: GameState;
  assets: GameAssets;
  font: PixelFont;
  /** Turn the page (the engine ends the scene on the last). */
  onAdvance: () => void;
  /** Play the letter-print blip — fired as characters land. */
  onBlip?: () => void;
  /** Mirror of the live reveal state for out-of-overlay advance handlers. */
  revealRef?: MutableRefObject<DialogueReveal>;
}) {
  const dialogue = state.dialogue;
  const content = dialogue ? dialogueContent(dialogue) : null;
  const page = content?.pages[dialogue!.page] ?? EMPTY_PAGE;

  // Blip on every other printed character — a dense-enough "typing" chatter
  // without a machine-gun at the per-character crawl rate.
  const { rows, done, skip } = useTypewriter(page, (visibleIndex) => {
    if (visibleIndex % 2 === 0) onBlip?.();
  });

  // Publish the reveal so keyboard/gamepad advance matches the tap: the first
  // input finishes the crawl, the next turns the page.
  useEffect(() => {
    if (revealRef) revealRef.current = { done, skip };
  }, [revealRef, done, skip]);

  if (!dialogue || !content) return null;

  // A story-item find gets a banner so the box unmistakably reads as "you
  // picked this up — here's what it is", not another mob talking at you.
  const isStoryItem = dialogue.source.kind === "story";
  // Enemy speakers bob live on the canvas behind the box; story items show
  // their icon as a portrait so the find stays on screen while it talks.
  const portrait =
    dialogue.source.kind === "story"
      ? spriteDataUrl(assets.sprites, content.portrait)
      : (spriteDataUrl(assets.sprites, `${content.portrait}_0`) ?? null);

  const hasNext = dialogue.page + 1 < content.pages.length;
  const continueText = !done
    ? "TAP TO SKIP"
    : hasNext
      ? `TAP TO CONTINUE (${dialogue.page + 1}/${content.pages.length})`
      : "TAP TO CLOSE";

  return (
    <div
      className="game-overlay dialogue-overlay"
      onPointerDown={() => (done ? onAdvance() : skip())}
      role="presentation"
    >
      <div className="dialogue-box">
        {isStoryItem && (
          <div className="dialogue-acquired">
            <PixelText
              font={font}
              text="STORY ITEM ACQUIRED"
              scale={1}
              color="#7fe3a0"
            />
          </div>
        )}
        <div className="dialogue-header">
          {portrait && (
            <img
              src={portrait}
              alt=""
              className="pixel-img dialogue-portrait"
            />
          )}
          <PixelText
            font={font}
            text={content.speaker}
            scale={2}
            color="#ffd75e"
          />
        </div>
        {page.map((row, i) => (
          // Reserve each row's full height (PixelText is fixed-height even when
          // empty) so the box never reflows as the crawl fills it in.
          <PixelText key={i} font={font} text={rows[i] ?? ""} scale={2} />
        ))}
        <div className="dialogue-continue">
          <PixelText
            font={font}
            text={continueText}
            scale={1}
            color="#9aa3ad"
          />
        </div>
      </div>
    </div>
  );
}
