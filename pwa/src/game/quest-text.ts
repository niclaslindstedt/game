// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// HOW AN ERRAND'S PROGRESS IS WORDED — the one place a `THING: 3/8` line is
// written, read by every surface that shows one: the offer box, the full log,
// the on-screen tracker, and the flash the field throws when a tally moves.
//
// It is a LEAF (no React, no overlay) precisely because of that last caller:
// the run loop's event pass reaches it every time the engine bumps an
// objective, and a wording helper living inside a modal component would drag
// the modal into the loop to get at it. Four callers, one wording — a second
// copy anywhere is how the flash starts disagreeing with the strip it is
// announcing.

import { questItemDef, type QuestObjective } from "@game/core";

/**
 * One objective as a line of text — the WoW shape, `THING: 3/8`, with the
 * count dropped on the singular ones (there is no 0/1 way to slay a boss).
 * The names come from the catalogs so a mod's monster reads correctly here
 * without the app knowing anything about it.
 */
export function objectiveLine(
  questId: string,
  objective: QuestObjective,
  count: number,
): string {
  if (objective.kind === "kill") {
    return `${label(objective.enemy)}: ${count}/${objective.count}`;
  }
  if (objective.kind === "killNamed") {
    return count > 0
      ? `${label(objective.enemy)}: SLAIN`
      : label(objective.enemy);
  }
  if (objective.kind === "collect") {
    const item = questItemDef(questId, objective.item);
    return `${item?.name ?? label(objective.item)}: ${count}/${objective.count}`;
  }
  return count > 0 ? "DELIVERED" : `ESCORT: ${label(objective.escort)}`;
}

/** An id turned into something a person can read: `night_manager` → NIGHT
 * MANAGER. Deliberately mechanical — an enemy's display name lives on its def,
 * but reaching the enemy catalog from the app's quest UI would drag the whole
 * roster onto a screen that only needs a caption. Exported because the offer
 * box's REWARD rows name uniques and powers by id and must read the same way. */
export function label(id: string): string {
  return id.replace(/_/g, " ").toUpperCase();
}
