// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The in-world dialogue box, shown while `phase === "dialogue"`: an elite
// rushing into frame, a boss at the stare-down, or a picked-up story item
// revealing its lore. Unlike the full-screen pause overlays this one barely
// dims the world — the speaker keeps bobbing behind it (the render loop
// still draws frames on the frozen state), which is the whole point of the
// idle animation. A tap anywhere turns the page; the engine resumes play
// after the last one.

import { dialogueContent, type GameState } from "@game/core";

import { PixelText } from "@ui/lib/PixelText.tsx";
import type { PixelFont } from "@ui/lib/pixel-font.ts";

import { spriteByName, type GameAssets } from "./assets.ts";

export function DialogueOverlay({
  state,
  assets,
  font,
  onAdvance,
}: {
  state: GameState;
  assets: GameAssets;
  font: PixelFont;
  /** Player tap: turn the page (the engine ends the scene on the last). */
  onAdvance: () => void;
}) {
  const dialogue = state.dialogue;
  if (!dialogue) return null;
  const content = dialogueContent(dialogue);
  const page = content.pages[dialogue.page] ?? [];
  // Enemy speakers bob live on the canvas behind the box; story items show
  // their icon as a portrait so the find stays on screen while it talks.
  const portrait =
    dialogue.source.kind === "story"
      ? spriteByName(assets.sprites, content.portrait)
      : (spriteByName(assets.sprites, `${content.portrait}_0`) ?? null);

  return (
    <div
      className="game-overlay dialogue-overlay"
      onPointerDown={onAdvance}
      role="presentation"
    >
      <div className="dialogue-box">
        <div className="dialogue-header">
          {portrait && (
            <img
              src={portrait.src}
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
          <PixelText key={i} font={font} text={row} scale={2} />
        ))}
        <div className="dialogue-continue">
          <PixelText
            font={font}
            text={
              dialogue.page + 1 < content.pages.length
                ? `TAP TO CONTINUE (${dialogue.page + 1}/${content.pages.length})`
                : "TAP TO CLOSE"
            }
            scale={1}
            color="#9aa3ad"
          />
        </div>
      </div>
    </div>
  );
}
