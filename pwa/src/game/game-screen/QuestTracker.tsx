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
import { columnCapRem, useTextColumn } from "@ui/lib/use-text-column.ts";

import { objectiveLine } from "../quest-text.ts";

/** The most errands the strip will show at once — see the note above. */
const MAX_TRACKED = 3;

/** The strip's text scale. It is the same 2 every other spoken and printed
 * surface uses, and it is not negotiable for a HUD element: this is read at a
 * glance, mid-fight, on a phone at arm's length. It shipped at 1 and was simply
 * unreadable there. */
const TEXT_SCALE = 2;

/** Fallback cap until the strip has been measured — see `columnCapRem`. The
 * strip's real bound is its own CSS width, which is viewport-relative, so the
 * constant is only ever the first frame's. */
const TRACKER_TEXT_REM = 12;

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

  // Measured rather than capped in rem: the strip's width is a share of the
  // VIEWPORT (it may not eat the steering thumb's third of the screen), and a
  // rem constant that fits a landscape phone is wider than a portrait one's
  // whole strip. Hooks run before the empty-list return, as they must.
  const { ref: stripRef, fontPx: colFontPx } = useTextColumn(TEXT_SCALE);
  const cap = columnCapRem(colFontPx, TEXT_SCALE, TRACKER_TEXT_REM);

  if (rows.length === 0) return null;

  return (
    <div className="quest-tracker" ref={stripRef} aria-hidden="true">
      {rows.map((progress) => {
        const quest = questDef(progress.id);
        const done = progress.status === "complete";
        return (
          <div className="quest-tracker-row" key={progress.id}>
            <PixelText
              font={font}
              text={quest.name}
              scale={TEXT_SCALE}
              color={done ? "#7fe3a0" : "#ffd75e"}
              maxWidth={cap}
            />
            {done ? (
              <PixelText
                font={font}
                text="COMPLETE - RETURN"
                scale={TEXT_SCALE}
                color="#7fe3a0"
                maxWidth={cap}
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
                  scale={TEXT_SCALE}
                  color={
                    (progress.counts[i] ?? 0) >= objectiveNeed(objective)
                      ? "#7fe3a0"
                      : "#cfd6e0"
                  }
                  maxWidth={cap}
                />
              ))
            )}
          </div>
        );
      })}
    </div>
  );
}
