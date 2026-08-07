// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// LOWER WHATEVER WINDOW IS UP — the `closeMenu` verb, behind one table.
//
// Every window in the run has an engine verb that closes it, and until the
// windows were content each was written out beside the panel it closed. An
// authored row cannot do that: a mod's own CLOSE button does not know which
// window it will end up in, and asking it to name the verb would mean a
// different button per window.
//
// So the table is here, and `closeMenu` is one name that means the right thing
// wherever it is pressed.
//
// THREE SCREENS ARE DELIBERATELY ABSENT, and each is a rule rather than an
// omission: the level-up chooser closes by SPENDING the banked points, the
// respec by putting every refunded point back down (`confirmRespec`), and the
// trade table by settling, cancelling or one side leaving. A `closeMenu` on any
// of them would be a way out of a decision the run is waiting on, so the verb
// refuses and the row that carried it does nothing.

import type { GameState, RunCommandName } from "@game/core";

import { localScreen } from "../local-seat.ts";
import { runCommand } from "../run-commands.ts";

/** Which verb lowers which of the run's screens. */
const CLOSERS: Partial<Record<string, RunCommandName>> = {
  paused: "resumeGame",
  inventory: "closeInventory",
  map: "closeMap",
  questLog: "closeQuestLog",
  shop: "closeShop",
  cache: "closeCache",
  companion: "closeCompanionPanel",
  quest: "closeQuestDialogue",
  talk: "closeTalk",
};

/**
 * Close the local hero's own window, whichever it is.
 *
 * @returns whether anything was closed — false when the hero is on the field,
 *          and false for the three screens that must be answered rather than
 *          dismissed.
 */
export function closeLocalScreen(state: GameState | null): boolean {
  if (!state) return false;
  const screen = localScreen(state);
  const command = screen === undefined ? undefined : CLOSERS[screen];
  if (!command) return false;
  runCommand(state, command);
  return true;
}
