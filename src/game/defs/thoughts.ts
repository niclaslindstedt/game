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
  // rooms later. Portrait is "hero" (plain clothes) — the EVA suit is loot
  // he hasn't found yet; the overlay resolves it live regardless.
  spacez_staff: {
    id: "spacez_staff",
    speaker: "ME",
    portrait: "hero",
    pages: [
      [
        "LOOK AT THIS PLACE. PAST",
        "MIDNIGHT, AND EVERY DESK'S",
        "MANNED. EVERY LAB LIT.",
      ],
      [
        "WE NEVER RAN NIGHTS LIKE THIS.",
        "SOMETHING'S GOT THE WHOLE",
        "BUILDING UP AFTER DARK.",
      ],
    ],
  },
  // The scripted first strike: a lone scientist breaks from the pack and
  // takes a harmless swing (see the level's `openingStrike`). It doesn't hurt
  // — but staff don't fight, so the swing tells the hero the night shift has
  // teeth now. This is the beat that ARMS his weapon; the "good thing I came
  // armed" line lands here, as a reaction, not a boast. Weapon-agnostic on
  // purpose — the piece off the wall differs per difficulty. Portrait is
  // "hero" (still unsuited at HQ).
  spacez_armed: {
    id: "spacez_armed",
    speaker: "ME",
    portrait: "hero",
    pages: [
      [
        "A SCIENTIST JUST TOOK A SWING",
        "AT ME. BARELY FELT IT - BUT",
        "THEY DON'T FIGHT. NEVER DID.",
      ],
      ["SO THE NIGHT SHIFT BITES NOW.", "GOOD THING I CAME ARMED."],
    ],
  },
  // Sighting the first OPTIMUSK at SpaceZ HQ: he was on the team that built
  // the first one, before the AI redrew the line (the CORE LOG's "IT DREW
  // THE OPTIMUSK LINE") and the machines started walking everyone's jobs out
  // the door — his own story in miniature. Now one is between him and Ada,
  // and the tables turn.
  spacez_optimusk: {
    id: "spacez_optimusk",
    speaker: "ME",
    portrait: "hero",
    pages: [
      [
        "AN OPTIMUSK. I WAS ON THE",
        "TEAM THAT BUILT THE FIRST",
        "ONE. I TUNED ITS BALANCE.",
      ],
      [
        "THEN THE AI REDREW IT, AND",
        "THE LINE STARTED WALKING",
        "EVERYONE'S JOBS OUT THE DOOR.",
      ],
      ["FUNNY THING, PROGRESS.", "MY TURN TO MAKE SOMETHING", "OBSOLETE."],
    ],
  },
  // Sighting the first wisp on the moon: the dead walking the dust is the
  // hero's first proof the broadcast history is a lie — somebody knew.
  moon_wisp_sight: {
    id: "moon_wisp_sight",
    speaker: "ME",
    portrait: "player",
    pages: [
      ["IT CAME OUT OF THE DUST.", "NO SUIT. NO SHIP.", "NO FOOTPRINTS."],
      [
        "NOBODY EVER SAID THE MOON",
        "HAD DEAD PEOPLE ON IT.",
        "SOMEBODY MUST HAVE KNOWN.",
      ],
    ],
  },
  // Downing the first wisp: the payoff of the sighting beat above (its
  // `after` gate keeps this from ever playing first) — the dead can fall,
  // and that will have to be enough.
  moon_wisp_kill: {
    id: "moon_wisp_kill",
    speaker: "ME",
    portrait: "player",
    pages: [
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
        "THEY DIDN'T JUST SHIP HER UP.",
        "THEY BUILT A STAFF TO MEET HER.",
        "COMPANY METAL GUARDS THE PIT.",
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
  // Sighting the first voidling in the rift: the hero's arrival read — he
  // is standing on nothing, and the nothing holds.
  rift_arrival: {
    id: "rift_arrival",
    speaker: "ME",
    portrait: "player",
    pages: [
      [
        "I'M WALKING ON NOTHING.",
        "NO GROUND. NO SKY. AND MY",
        "BOOTS DON'T SEEM TO CARE.",
      ],
      ["THE RIFT DOESN'T FOLLOW THE", "RULES. GOOD. LATELY,", "NEITHER DO I."],
    ],
  },
  // The first asteroid to land on the hero in the rift: the rock rain has
  // teeth, and he only learns it the hard way. Fires once, on the strike.
  rift_asteroid: {
    id: "rift_asteroid",
    speaker: "ME",
    portrait: "player",
    pages: [
      [
        "SOMETHING CAME OUT OF THE",
        "DARK AND HIT LIKE A TRUCK.",
        "A ROCK. A FLYING ROCK.",
      ],
      ["BETTER WATCH OUT FOR THESE", "ASTEROIDS. THEY HURT."],
    ],
  },
  // Downing the first graviton: the physics of this place, in one grudge.
  rift_graviton: {
    id: "rift_graviton",
    speaker: "ME",
    portrait: "player",
    pages: [
      [
        "THAT LITTLE THING WEIGHED",
        "MORE THAN MY SHIP. SPACE IN",
        "HERE BENDS AROUND A GRUDGE.",
      ],
      [
        "NOTED. DON'T STAND STILL.",
        "DON'T TRUST THE FLOOR.",
        "THERE ISN'T ONE.",
      ],
    ],
  },
  // Sighting the first COWBOT in Eastworld: the drop-in arrival read — the
  // rift's far side is a wild-west theme park, and the town is a machine
  // pretending it's 1880. Wide radius so it lands as the town comes on
  // screen. Portrait is "hero" — the park is habitable, the EVA suit is
  // stowed (the level runs `heroSuited: false`).
  eastworld_arrival: {
    id: "eastworld_arrival",
    speaker: "ME",
    portrait: "hero",
    pages: [
      [
        "A COWBOY JUST TIPPED ITS",
        "HAT AT ME. SERVOS IN THE",
        "WRIST. TICKING IN THE JAW.",
      ],
      [
        "THE WHOLE TOWN IS A MACHINE",
        "PLAYING AT 1880. ADA'S BEACON",
        "POINTS DOWN MAIN STREET.",
      ],
    ],
  },
  // Downing the first COWBOT: they're ZAI hosts — the same brain that took
  // his job back home, wearing spurs. The two-part beat orders itself with
  // `after` (see the town, then down a host).
  eastworld_hosts: {
    id: "eastworld_hosts",
    speaker: "ME",
    portrait: "hero",
    pages: [
      ["IT DIED APOLOGIZING. 'YOUR", "EXPERIENCE MATTERS TO US.'"],
      [
        "ZAI HOSTS. THE SAME BRAIN THAT",
        "TOOK MY JOB, NOW IN SPURS.",
        "GOOD. NO GUILT, THEN.",
      ],
    ],
  },
  // Sighting the first CIA AGENT in THE BUNKER: the arrival read — the
  // security state didn't collapse with the economy, it just changed
  // employers and postcodes. Wide drop-in radius, like the other surveys.
  bunker_arrival: {
    id: "bunker_arrival",
    speaker: "ME",
    portrait: "hero",
    pages: [
      [
        "BLACK SUITS. EARPIECES.",
        "THE ALPHABET, ALL DOWN HERE,",
        "DRAWING A PRIVATE SALARY.",
      ],
      [
        "THE WORLD LOST ITS JOBS.",
        "THESE GUYS KEPT THEIRS -",
        "GUARDING THE ONES WHO DID IT.",
      ],
    ],
  },
  // Sighting the first VACUUM BOT, once the arrival read has landed: the
  // housekeeping gag — even the cleaning staff got automated, and armed.
  bunker_vacuum: {
    id: "bunker_vacuum",
    speaker: "ME",
    portrait: "hero",
    pages: [
      [
        "A VACUUM ROBOT. WITH A",
        "TASER. THE FLOORS ARE",
        "SPOTLESS AND HOSTILE.",
      ],
      [
        "OF COURSE THEY AUTOMATED",
        "THE HELP. CAN'T HAVE A",
        "CLEANER WHO TALKS.",
      ],
    ],
  },
  // Sighting the first ICE AGENT in THE BUNKER, once the arrival read has
  // landed: the place has no address, but it has a border patrol — and for
  // once, the hero really is the illegal immigrant.
  bunker_ice: {
    id: "bunker_ice",
    speaker: "ME",
    portrait: "hero",
    pages: [
      ["ICE. IN A BUNKER OUTSIDE", "THE UNIVERSE. STILL", "CHECKING PAPERS."],
      [
        "TECHNICALLY I DID CROSS A",
        "BORDER WITHOUT ASKING.",
        "SEVERAL. COME AND DEPORT ME.",
      ],
    ],
  },
  // The RECURRING cap-farm mutters (see `CAP_THOUGHT_IDS` and `maybeCapThought`
  // in story.ts): once the hero has out-levelled a map — level ≥ its
  // `xpLevelCap`, so the kills barely pay anymore — he catches himself grinding
  // and remembers what he came for. Unlike every pinned beat above these are
  // NOT one-shot: the engine rotates through them and replays them on a
  // cooldown for as long as he keeps farming a capped map, so there are several
  // so it never reads like a broken record. Every one lands the same two beats
  // — these fights give me nothing now / go find Ada — in a different mood.
  cap_pathetic_1: {
    id: "cap_pathetic_1",
    speaker: "ME",
    portrait: "player",
    pages: [
      [
        "THESE THINGS BARELY SLOW ME",
        "DOWN ANYMORE. I'M NOT",
        "LEARNING A THING OUT HERE.",
      ],
      ["QUIT FARMING SCRAP, BUILDER.", "ADA'S STILL OUT THERE."],
    ],
  },
  cap_pathetic_2: {
    id: "cap_pathetic_2",
    speaker: "ME",
    portrait: "player",
    pages: [
      [
        "PATHETIC. THEY LINE UP AND",
        "FALL OVER. I COULD DO THIS",
        "IN MY SLEEP.",
      ],
      ["EVERY MINUTE HERE IS A", "MINUTE ADA DOESN'T HAVE.", "MOVE."],
    ],
  },
  cap_pathetic_3: {
    id: "cap_pathetic_3",
    speaker: "ME",
    portrait: "player",
    pages: [
      ["I'VE WRUNG THIS PLACE DRY.", "NOTHING LEFT TO PROVE HERE."],
      ["STOP CIRCLING. THE ONLY", "THING THAT MATTERS IS", "FINDING HER. GO."],
    ],
  },
  cap_pathetic_4: {
    id: "cap_pathetic_4",
    speaker: "ME",
    portrait: "player",
    pages: [
      [
        "WHEN DID THIS GET EASY?",
        "THEY DON'T EVEN REGISTER.",
        "JUST NOISE ON THE WAY.",
      ],
      ["ENOUGH WARMUP. ADA FIRST.", "ALWAYS ADA."],
    ],
  },
  cap_pathetic_5: {
    id: "cap_pathetic_5",
    speaker: "ME",
    portrait: "player",
    pages: [
      [
        "I'M SWATTING FLIES AND",
        "CALLING IT PROGRESS. THIS",
        "ISN'T GETTING ME CLOSER.",
      ],
      ["SHE NEEDS ME MOVING, NOT", "GRINDING. FIND THE WAY OUT.", "FIND ADA."],
    ],
  },
};

/**
 * The RECURRING cap-farm monologue ids, in rotation order (see
 * `maybeCapThought` in story.ts). The engine cycles these — one per firing,
 * round-robin — so a hero farming an out-levelled map hears a fresh variation
 * each time rather than the same line on repeat. Extend the list to add moods;
 * order is the rotation, nothing else keys off it.
 */
export const CAP_THOUGHT_IDS = [
  "cap_pathetic_1",
  "cap_pathetic_2",
  "cap_pathetic_3",
  "cap_pathetic_4",
  "cap_pathetic_5",
] as const;

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
