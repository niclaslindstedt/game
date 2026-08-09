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

/**
 * ONE WAY A CABINET CAN BE PLAYED — a named setting the shelf offers beside the
 * rung, and the second thing a lap is settled by.
 *
 * IT IS THE CABINET'S OWN VOCABULARY, not the shelf's. A difficulty means the
 * same thing on every machine in the arcade (it is the campaign's own ladder),
 * and a variant does not: the ROAD's two are the two ends of it, and a second
 * cabinet's would be something else entirely. So the shelf stores ONE pick and
 * every cabinet resolves it against its own list, falling back to its first —
 * exactly the shape `pickRung` already has, and the reason a cabinet that has
 * never heard of "garage" simply plays its default rather than refusing to
 * start.
 *
 * `id` is the string the SCREEN behind the cabinet is built from, so it is
 * whatever that screen's parameters want it to be — for the road it is the level
 * the leg is bound for, which is exactly what a `DriveParams` carries.
 */
export type MinigameVariant = { id: string; name: string };

export type MinigameDef = {
  id: MinigameId;
  /** The row's label, and the whole of what the row says. Upper-case and short
   * enough to sit in the menu column, exactly like an authored one — the shelf
   * carries no help lines, so the name has to be the explanation. */
  name: string;
  /** The ways it can be played, the first being what an unset shelf plays. A
   * cabinet with one is a cabinet with no choice to offer, and the shelf's
   * DIRECTION row greys out rather than pretending to cycle. */
  variants: readonly MinigameVariant[];
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
  drive: {
    id: "drive",
    // NOT "ROAD TO GOODCO" ANY MORE, because it is not only that: the same road
    // is driven home, and a cabinet named after one end of it would be a cabinet
    // whose label went stale the moment the DIRECTION row was touched. The row
    // says which way; the name says what.
    name: "THE ROAD",
    // The two ends of it. Each id is the LEVEL the leg is bound for, which is
    // what `DriveParams.to` carries and what the direction is derived from
    // (`legDirection`, drive-screen/begin.ts) — so the shelf never has to know
    // that a road has a direction at all.
    variants: [
      { id: "goodco_hq", name: "GOODCO" },
      { id: "garage", name: "GARAGE" },
    ],
  },
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

/**
 * WHICH WAY A CABINET WOULD ACTUALLY PLAY: the variant the shelf is set to, if
 * this machine has one by that name, and otherwise its first.
 *
 * The FALLBACK is the whole reason the shelf can keep one pick for every
 * cabinet. The choice is persisted (`minigameVariant`) and cabinets do not share
 * a vocabulary, so a shelf set to "garage" and then walked over to a machine
 * that has never heard of a garage has to do something — and the only sane
 * something is that machine's own default. Never a refusal: a cabinet that would
 * not start because of a setting made on a different cabinet is a dead row.
 */
export function pickVariant(
  def: MinigameDef,
  picked: string,
): MinigameVariant | null {
  return (
    def.variants.find((variant) => variant.id === picked) ??
    def.variants[0] ??
    null
  );
}

/** …and what the shelf's own DIRECTION row shows and cycles: the variants of the
 * first cabinet that offers a choice at all. Null when nothing on the shelf has
 * one, which is what greys the row out. */
export function shelfVariants(): readonly MinigameVariant[] {
  for (const id of MINIGAME_ORDER) {
    const def = MINIGAME_DEFS[id];
    if (def.variants.length > 1) return def.variants;
  }
  return [];
}
