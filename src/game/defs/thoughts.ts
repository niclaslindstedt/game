// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The player-thought catalog: the hero's own inner monologues, played through
// the dialogue box when a level's `firstKillThoughts` (the first time he kills
// a given enemy there) or `firstSightThoughts` (the first time one comes into
// view) fires. Unlike an elite's arrival scene there is no speaker on the
// board — the box shows the hero's face and his private read on what he just
// saw. Adding a beat = adding an entry here + referencing its id from a
// LevelDef; no engine changes.

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
  // Sighting the first INTERN at SpaceZ HQ: it's past midnight and the
  // building is packed like a product launch. He worked here — nights were
  // never staffed like this. Fires on view, before any blow (a sight pin),
  // and seeds the NIGHT MANAGER's reveal (the secret night shift) a few
  // rooms later.
  spacez_staff: {
    id: "spacez_staff",
    speaker: "ME",
    portrait: "player",
    pages: [
      [
        "LOOK AT THIS PLACE. PAST",
        "MIDNIGHT AND EVERY DESK IS",
        "MANNED. EVERY LAB LIT.",
      ],
      [
        "I WORKED HERE. WE NEVER",
        "STAFFED NIGHTS LIKE THIS.",
        "SOMETHING MUST BE BREWING.",
      ],
      ["OH WELL.", "GOOD THING I BROUGHT THE SWORD."],
    ],
  },
  // Killing the first wisp on the moon: the dead walking the dust is the
  // hero's first proof the broadcast history is a lie — somebody knew.
  moon_wisp: {
    id: "moon_wisp",
    speaker: "ME",
    portrait: "player",
    pages: [
      ["IT CAME OUT OF THE DUST.", "NO SUIT. NO SHIP.", "NO FOOTPRINTS."],
      [
        "NOBODY EVER SAID THE MOON",
        "HAD DEAD PEOPLE ON IT.",
        "SOMEBODY MUST HAVE KNOWN.",
      ],
      ["OKAY. THEY GO DOWN LIKE", "ANYTHING ELSE.", "THAT'LL HAVE TO DO."],
    ],
  },
  // Killing the first OPTIMUSK on the moon: the night-shift tin men from SpaceZ
  // HQ have followed the trail all the way up here — the conspiracy isn't just
  // shipping Ada moonward, it built a garrison to receive her.
  moon_optimusk: {
    id: "moon_optimusk",
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
  // Killing the first scout rover on Mars: the tire tracks say the colony
  // has been running for years while everyone watched the moon.
  mars_rover: {
    id: "mars_rover",
    speaker: "ME",
    portrait: "player",
    pages: [
      [
        "A ROVER. FRESH PAINT, WORN",
        "WHEELS. AND THE DUST IS FULL",
        "OF TIRE TRACKS. YEARS OF THEM.",
      ],
      [
        "THE PLAQUE SAYS 'FOR ALL",
        "MANKIND'. THE FIRMWARE SAYS",
        "PROPERTY OF SPACEZ. FIGURES.",
      ],
    ],
  },
  // Killing the first FEMBOT: the hero's read on the colony's... amenities.
  mars_fembot: {
    id: "mars_fembot",
    speaker: "ME",
    portrait: "player",
    pages: [
      [
        "...IT BLEW ME A KISS.",
        "THE ROBOT. IN THE NIGHTGOWN.",
        "IT BLEW ME A KISS AND FIRED.",
      ],
      [
        "WHO BUILDS A DOOMSDAY COLONY",
        "AND BUDGETS FOR... THESE?",
        "BILLIONAIRES. RIGHT.",
      ],
      [
        "EYES FRONT, BUILDER. YOU HAVE",
        "A GIRLFRIEND. SHE IS GOING TO",
        "THINK THIS IS HILARIOUS.",
      ],
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
