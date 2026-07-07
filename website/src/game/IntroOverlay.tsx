// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The level's story text box: why the player has arrived here. Shown while
// the engine sits in the `intro` phase; dismissing it starts the run.

import { difficultyDef, levelDef, type GameState } from "@game/core";

import { PixelText } from "@ui/lib/PixelText.tsx";
import type { PixelFont } from "@ui/lib/pixel-font.ts";

import { ENTER_LABEL } from "./copy.ts";

export function IntroOverlay({
  state,
  font,
  onBegin,
}: {
  state: GameState;
  font: PixelFont;
  onBegin: () => void;
}) {
  const def = levelDef(state.level.id);
  return (
    <div className="game-overlay intro-overlay">
      <div className="intro-box">
        <PixelText
          font={font}
          text={`LEVEL ${def.index} - ${def.name}`}
          scale={3}
          color="#7ef0c8"
        />
        <PixelText
          font={font}
          text={`DIFFICULTY - ${difficultyDef(state.difficulty).name}`}
          scale={1}
          color="#d9a0f0"
        />
        <div className="intro-lines">
          {def.intro.map((line, i) =>
            line === "" ? (
              <div key={i} className="intro-gap" />
            ) : (
              <PixelText key={i} font={font} text={line} scale={2} />
            ),
          )}
        </div>
        <button
          type="button"
          className="pixel-button"
          aria-label="start-level"
          onClick={onBegin}
        >
          <PixelText font={font} text={ENTER_LABEL} scale={3} color="#0b0d10" />
        </button>
        <PixelText
          font={font}
          text="HOLD TO WALK - TAP OR SPACE TO JUMP"
          scale={1}
          color="#9aa3ad"
        />
      </div>
    </div>
  );
}
