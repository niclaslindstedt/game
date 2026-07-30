// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE QUEST PROGRESS FLASH — one errand's tally, thrown over the middle of the
// field the instant it moves.
//
// The tracker in the corner is the LEDGER: it is always right, and nobody is
// looking at it. A player who just killed the thing on their list is looking at
// the thing they just killed, in the middle of the screen — so the count is
// announced there too, and only there does "one more of ten" land as progress
// rather than as a number that changed somewhere off to the side.
//
// It rides the engine's `questProgress` event (event-fx.ts), which is emitted
// from the one `bump` every kind of progress goes through, so a kill off a
// list, a named elite going down, a fetch piece walked over and an escort
// delivered are all covered without four call sites.
//
// It sits UNDER the area caption's slot rather than in it: the two can fire on
// the same tick (clear the pack holding a room while the last kill was on your
// list) and the caption is a statement about the place, so it keeps the middle.
// Remount it with a changing React `key` to replay the one-shot pop, exactly as
// the caption does.

import { PixelText } from "@ui/lib/PixelText.tsx";
import type { PixelFont } from "@ui/lib/pixel-font.ts";

/** An objective still being worked: the gold every quest surface speaks in. */
const WORKING_COLOR = "#ffd75e";
/** …and the green the log and the tracker mark a finished objective with, so
 * the last kill of a list reads as DONE without saying the word. */
const DONE_COLOR = "#7fe3a0";

export function QuestFlash({
  text,
  done,
  font,
}: {
  /** The objective's own line — `objectiveLine`, the same wording the tracker
   * and the log print, so the flash can never announce a different count. */
  text: string;
  /** This bump filled the objective (count reached the need). */
  done: boolean;
  font: PixelFont;
}) {
  return (
    <div className="quest-flash" aria-live="polite">
      <PixelText
        font={font}
        text={text}
        scale={3}
        color={done ? DONE_COLOR : WORKING_COLOR}
      />
    </div>
  );
}
