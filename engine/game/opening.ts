// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE RUN'S OPENING MONOLOGUE — what the hero says before the level is
// walkable, and whether there is anything to say at all.
//
// A LEAF ON PURPOSE. Two callers need the same answer at two different moments
// — `createGame` when a run is built, and `advanceCutsceneChain` when a prelude
// drains — and the second of those lives in `story.ts`, which is imported BY
// the module the pager lives in (`items/flow.ts`). Keeping the question here,
// above both, is what stops that pair becoming a cycle.

import { runLevelDef } from "./defs/levels/index.ts";
import type { GameState } from "./types/index.ts";

/**
 * THE OPENING MONOLOGUE THIS RUN PLAYS — the level's own, and nothing in front
 * of it.
 *
 * NOTHING A TRIP LEFT HIM WITH ARRIVES HERE, and that is a decision rather than
 * an omission. The DRIVE reads the whole journey and says what it made of it AT
 * THE WHEEL, folded into the front of the run-in's own line ("ROUGH RIDE.
 * THERE'S GOODCO." — `arrivalLine`, pwa/src/game/drive-screen/voice.ts), so the
 * road keeps its own words and the venue on the far side of the black opens on
 * the building rather than on the suspension. A carried line used to be a
 * session parameter and the first page of this list; it left with the beat.
 *
 * AND A VENUE MAY SHIP NONE AT ALL (`MissionDef.intro` is optional — the HUB is
 * the case: he walks out of the prelude's living room having just said what he
 * is going to do, and the next thing he stands in is his own garage). Then this
 * is empty, and the run opens on the level-name card instead.
 *
 * Everything that walks the intro reads it through here, which is what a
 * carried page would go back to needing.
 */
export function introPages(state: GameState): readonly (readonly string[])[] {
  return runLevelDef(state).intro ?? [];
}

/**
 * WHERE A RUN THAT HAS NOT BEEN READ YET SHOULD STAND: `intro` when there is a
 * page to turn, `title` when there is not.
 *
 * The empty case is REAL rather than defensive — a venue with no monologue has
 * nothing to put in the box, and landing in the `intro` phase would hold the
 * run behind a dialogue with no text in it. A DIALOGUE-muted run answers
 * `title` for the reason it always did: nobody is reading.
 *
 * The level-name card is kept either way — it is orientation, not story (see
 * `skipStoryOpening`).
 */
export function openingPhase(state: GameState): "intro" | "title" {
  if (state.dialogueMuted) return "title";
  return introPages(state).length > 0 ? "intro" : "title";
}
