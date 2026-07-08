// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The player-thought catalog: the hero's own inner monologues, played through
// the dialogue box when a level's `firstKillThoughts` fires (the first time he
// kills a given enemy there). Unlike an elite's arrival scene there is no
// speaker on the board — the box shows the hero's face and his private read on
// what he just saw. Adding a beat = adding an entry here + referencing its id
// from a LevelDef; no engine changes.

export type ThoughtDef = {
  id: string;
  /** Name shown in the dialogue header — the hero's own voice ("ME"). */
  speaker: string;
  /** Portrait sprite family (frame `<portrait>_0`) drawn beside the words. */
  portrait: string;
  /** What he thinks, one entry per page, one string per line. */
  pages: string[][];
};

export const THOUGHT_DEFS: Record<string, ThoughtDef> = {
  // Killing the first OPTIMUS on the moon: the night-shift tin men from SpaceZ
  // HQ have followed the trail all the way up here — the conspiracy isn't just
  // shipping Ada moonward, it built a garrison to receive her.
  moon_optimus: {
    id: "moon_optimus",
    speaker: "ME",
    portrait: "player",
    pages: [
      [
        "A SPACEZ UNIT. UP HERE.",
        "SAME TIN MAN FROM THE NIGHT",
        "SHIFT, WALKING THE DUST.",
      ],
      [
        "THEY DIDN'T JUST SHIP HER",
        "MOONWARD. THEY BUILT A STAFF",
        "TO MEET HER. COMPANY METAL,",
        "GUARDING WHATEVER'S DOWN THERE.",
      ],
      ["OKAY. ONE BOLT AT A TIME.", "KEEP MOVING. FIND ADA."],
    ],
  },
};

// Active registry the accessor reads (defaults to the shipped catalog).
let activeThoughtDefs: Record<string, ThoughtDef> = THOUGHT_DEFS;

/** Test/authoring hook: replace the active player-thought catalog. */
export function setThoughtDefs(defs: Record<string, ThoughtDef>): void {
  activeThoughtDefs = defs;
}

/** Look up a player thought's def; throws on a broken id so bugs surface. */
export function thoughtDef(defId: string): ThoughtDef {
  const def = activeThoughtDefs[defId];
  if (!def) throw new Error(`unknown thought def "${defId}"`);
  return def;
}
