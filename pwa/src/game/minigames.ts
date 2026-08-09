// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE ARCADE SHELF — the minigames a player may sit down and grind on their
// own, and what each one is called.
//
// THE WHOLE CAMPAIGN IS THE KEY, and nothing smaller. A cabinet appears on the
// shelf once a hero has BEATEN the game — every mission of one difficulty, all
// the way to the end — and the rungs the shelf will play it on are exactly the
// rungs that has been done on. So the shelf is a trophy: it says what you have
// finished, and it lets you go back and grind the parts of it that keep a
// score. Playing an interlude on the way to work unlocks nothing; finishing the
// campaign unlocks all of it.
//
// IT IS THE PLAYER'S, NOT ONE HERO'S. Any hero on the roster who has beaten a
// rung opens it — a retired hardcore hero's campaign still counts, because the
// person who drove it is the person standing in the menu. That is also why
// there is nothing stored here: `Character.beaten` already IS the record, it
// already rides cloud save, and a second copy of it in this module's own
// localStorage key would be a fact that could disagree with itself.
//
// STARTUP PATH. The main menu reads this to decide whether the MINIGAMES row
// exists at all, so it must stay a leaf: no `@game/core`, no renderer, nothing
// that drags the simulation into the entry chunk (see AGENTS.md → the 170 KB
// budget). What a cabinet IS lives behind the lazy `MinigameScreen`.

import { DIFFICULTY_ORDER, type Difficulty } from "@game/menu";

import { isDifficultyBeaten, type Character } from "./characters.ts";

/** Every minigame the game has, in shelf order. */
export const MINIGAME_ORDER = ["drive"] as const;

export type MinigameId = (typeof MINIGAME_ORDER)[number];

export type MinigameDef = {
  id: MinigameId;
  /** The row's label, and the whole of what the row says. Upper-case and short
   * enough to sit in the menu column, exactly like an authored one — the shelf
   * carries no help lines, so the name has to be the explanation. */
  name: string;
};

/**
 * THE CABINETS.
 *
 * In code rather than in `content/`, and that is the same call the title menu
 * itself makes: a minigame is app chrome with a screen behind it, not content a
 * mod may bring (`menu-tree.ts` — a mod that could author a menu could author
 * itself a door). The ROAD's own content — the town, the crowd, the traffic,
 * the wagon — is authored where the rest of the game's content is.
 */
const MINIGAME_DEFS: Record<MinigameId, MinigameDef> = {
  drive: { id: "drive", name: "ROAD TO GOODCO" },
};

/** One cabinet's definition. */
export function minigameDef(id: MinigameId): MinigameDef {
  return MINIGAME_DEFS[id];
}

/**
 * THE RUNGS THE SHELF WILL PLAY, easiest first: every difficulty somebody on
 * this roster has beaten the campaign on.
 *
 * Empty for a player who has not finished the game yet — which is the whole
 * gate: no rungs, no shelf, no row on the front door.
 */
export function arcadeRungs(roster: readonly Character[]): Difficulty[] {
  return DIFFICULTY_ORDER.filter((rung) =>
    roster.some((hero) => isDifficultyBeaten(hero, rung)),
  );
}

/** Is there a shelf at all? What the main menu's MINIGAMES row hangs on. */
export function hasArcade(roster: readonly Character[]): boolean {
  return MINIGAME_ORDER.length > 0 && arcadeRungs(roster).length > 0;
}

/**
 * Which of an offered set a shelf would actually play: the rung the player
 * picked, if it is in there, and otherwise the easiest that is.
 *
 * The FALLBACK is not paranoia. The pick is persisted (`minigameDifficulty`)
 * and the rungs are earned, so the two can legitimately disagree — a saved
 * choice of NIGHTMARE on a device whose only campaign-beating hero has since
 * been deleted, a settings blob carried over from another install, or the
 * developer shelf (which offers the whole ladder) having been used to set one.
 * A shelf that launched a rung it does not offer would be a board entry nobody
 * could have earned.
 */
export function pickRung(
  rungs: readonly Difficulty[],
  picked: Difficulty,
): Difficulty | null {
  return rungs.includes(picked) ? picked : (rungs[0] ?? null);
}

/** …and the same question asked of the PLAYER's shelf, whose offered set is the
 * campaigns this roster has beaten. */
export function arcadeRung(
  roster: readonly Character[],
  picked: Difficulty,
): Difficulty | null {
  return pickRung(arcadeRungs(roster), picked);
}
