// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The level's story text box: why the player has arrived here. Shown while
// the engine sits in the `intro` phase; dismissing it starts the run. The
// briefing prints letter by letter with a 16-bit blip and dramatic pauses —
// a tap finishes the crawl, the START button drops the player in.

import { difficultyDef, levelDef, type GameState } from "@game/core";

import { PixelText } from "@ui/lib/PixelText.tsx";
import type { PixelFont } from "@ui/lib/pixel-font.ts";
import { useTypewriter } from "@ui/lib/typewriter.ts";

import { ENTER_LABEL } from "./copy.ts";

export function IntroOverlay({
  state,
  font,
  onBegin,
  onBlip,
}: {
  state: GameState;
  font: PixelFont;
  onBegin: () => void;
  /** Play the letter-print blip — fired as briefing characters land. */
  onBlip?: () => void;
}) {
  const def = levelDef(state.level.id);
  // The briefing crawls in; the title, difficulty, and controls stay instant —
  // only the story lines carry the drama. Blank lines are gaps: they hold a
  // beat (the "\n" between rows) but print nothing.
  const { rows, done, skip } = useTypewriter(def.intro, (visibleIndex) => {
    if (visibleIndex % 2 === 0) onBlip?.();
  });
  return (
    <div className="game-overlay intro-overlay">
      <div
        className="intro-box"
        // A tap on the briefing finishes the crawl without starting the run
        // (the START button owns that); the pointerdown fires before the
        // button's click, so tapping START still drops straight in.
        onPointerDown={() => {
          if (!done) skip();
        }}
      >
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
              <PixelText key={i} font={font} text={rows[i] ?? ""} scale={2} />
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
