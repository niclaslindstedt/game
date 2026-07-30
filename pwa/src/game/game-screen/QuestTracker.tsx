// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE ON-SCREEN TRACKER — the WoW strip in the corner listing what is running.
//
// It answers ONE question, over and over, without the player stopping: "how
// many more". So it shows only ACTIVE and just-COMPLETED errands, never the
// whole log (that is the HUD `!` button's `QuestLogOverlay`), it never shows the
// giver, the reward, or the story, and it caps at three errands — a strip that
// grows with the log ends up covering the fight it is supposed to be read
// during.
//
// It sits under the HUD's top row and is entirely tap-transparent: on the
// reference landscape phone the right-hand third of the screen is where the
// player's thumb steers, so a tracker that swallowed a press would cost them
// the fight it is annotating.

import {
  activeQuests,
  objectiveNeed,
  questDef,
  type GameState,
} from "@game/core";

import { PixelText } from "@ui/lib/PixelText.tsx";
import type { PixelFont } from "@ui/lib/pixel-font.ts";

import { objectiveLine } from "../quest-text.ts";

/** The most errands the strip will show at once — see the note above. */
const MAX_TRACKED = 3;

export function QuestTracker({
  state,
  font,
}: {
  state: GameState;
  font: PixelFont;
}) {
  const active = activeQuests(state);
  // A finished errand stays on the strip until it is handed in, and reads
  // COMPLETE: the whole point of the `?` over a head is that the player has to
  // walk back, and a tracker that dropped the row the moment the last kill
  // landed would take away the one reminder that they owe a trip.
  const complete = Object.values(state.quests).filter(
    (q) => q.status === "complete",
  );
  const rows = [...complete, ...active].slice(0, MAX_TRACKED);
  if (rows.length === 0) return null;

  return (
    <div className="quest-tracker" aria-hidden="true">
      {rows.map((progress) => {
        const quest = questDef(progress.id);
        const done = progress.status === "complete";
        return (
          <div className="quest-tracker-row" key={progress.id}>
            <PixelText
              font={font}
              text={quest.name}
              scale={1}
              color={done ? "#7fe3a0" : "#ffd75e"}
              maxWidth={16}
            />
            {done ? (
              <PixelText
                font={font}
                text="COMPLETE - RETURN"
                scale={1}
                color="#7fe3a0"
                maxWidth={16}
              />
            ) : (
              quest.objectives.map((objective, i) => (
                <PixelText
                  key={i}
                  font={font}
                  text={objectiveLine(
                    quest.id,
                    objective,
                    progress.counts[i] ?? 0,
                  )}
                  scale={1}
                  color={
                    (progress.counts[i] ?? 0) >= objectiveNeed(objective)
                      ? "#7fe3a0"
                      : "#cfd6e0"
                  }
                  maxWidth={16}
                />
              ))
            )}
          </div>
        );
      })}
    </div>
  );
}
