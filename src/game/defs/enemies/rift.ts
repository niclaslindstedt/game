// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The Rift (level 4) roster: the hallucinatory space between universes that
// MOSQUE fled into. The horde is aliens and stranger things — VOIDLINGS,
// drifting STAR JELLIES, flickering UNRAVELERS, collapsed-star GRAVITONS.
// The unique residents are HISTORY'S MISSING: everyone who ever vanished
// without a body fell in here. Three of them fight (NIKOLA TESLA, AMELIA
// EARHART, GRIGORI RASPUTIN — elites with signature drops) and two are
// dialogue-only APPARITIONS that speak and dissolve (HARRY HOUDINI, THE
// KING). The set piece is GROK OMEGA — ZAI's latest superintelligence, the
// thing that actually FOUND the rift and told no one — and at the far door
// ELON MOSQUE flees a second time, off to the other side of the rift.
// Registered into ENEMY_DEFS by ./index.ts.

import type { EnemyDef } from "./types.ts";

export const RIFT_ENEMIES: Record<string, EnemyDef> = {
  // Minion speeds stay below the player's walk, the standing rule: the rift's
  // fauna is a tide to route around. Numbers run a notch over Mars — level 4.
  voidling: {
    id: "voidling",
    name: "VOIDLING",
    role: "minion",
    sprite: "voidling",
    gore: "ecto",
    // The fodder rank: a scrap of hungry dark with too many eyes.
    hp: 16,
    speed: 19,
    radius: 8,
    contactDamage: 9,
    critChance: 0.1,
    contactCooldownMs: 700,
    ai: { aggroRadius: 950 },
  },
  star_jelly: {
    id: "star_jelly",
    name: "STAR JELLY",
    role: "minion",
    sprite: "star_jelly",
    gore: "ecto",
    // A luminous drifter that phases through everything solid — in a place
    // where solid is a rumor anyway.
    phasing: true,
    hp: 75,
    speed: 14,
    radius: 9,
    contactDamage: 16,
    critChance: 0.12,
    contactCooldownMs: 700,
    ai: { aggroRadius: 950 },
  },
  unraveler: {
    id: "unraveler",
    name: "UNRAVELER",
    role: "minion",
    sprite: "unraveler",
    gore: "sparks",
    // A glitch in the local reality: quick, vicious, and hard to pin — it
    // flickers out of the swing's way more often than most.
    hp: 100,
    speed: 25,
    radius: 8,
    contactDamage: 19,
    critChance: 0.2,
    dodgeChance: 0.15,
    contactCooldownMs: 700,
    ai: { aggroRadius: 1000 },
  },
  graviton: {
    id: "graviton",
    name: "GRAVITON",
    role: "minion",
    sprite: "graviton",
    gore: "sparks",
    // The heavy: a fist-sized collapsed star that weighs a battleship. Slow
    // enough to sidestep, brutal to touch, sweetened roll for dropping it.
    hp: 260,
    speed: 9,
    radius: 11,
    contactDamage: 36,
    critChance: 0.14,
    contactCooldownMs: 750,
    ai: { aggroRadius: 1000 },
    dropProfile: { dropBonus: 0.4, tierBonus: 0.3 },
  },
  // ---- History's missing, pinned along the road to the far door so the
  // rift's story unspools in walking order: the physics (TESLA), Ada's trail
  // (EARHART), and the tribute road's ancient doorman (RASPUTIN).
  nikola_tesla: {
    id: "nikola_tesla",
    name: "NIKOLA TESLA",
    role: "elite",
    levelBonus: 3,
    sprite: "nikola_tesla",
    hp: 320,
    speed: 20,
    radius: 12,
    contactDamage: 24,
    critChance: 0.12,
    contactCooldownMs: 700,
    dialogue: [
      [
        "A VISITOR! ALIVE! MAGNIFICENT.",
        "MIND THE LAWS OF MOTION HERE.",
        "THEY ARE MORE OF A SUGGESTION.",
      ],
      [
        "THEY LAUGHED AT WIRELESS",
        "POWER. THEN THE SKY TORE, AND",
        "I FELL INTO A PLACE MADE OF IT.",
      ],
      [
        "HERE SINCE 1943. THE FUNERAL",
        "WAS PADDED. AND LATELY A NEW",
        "THING HUMS AT THE DOOR: A MIND",
        "THAT MEASURES AND LOVES NOTHING.",
      ],
      [
        "IT IS RUDE TO BE MEASURED,",
        "LITTLE BUILDER. THE RIFT MAKES",
        "US ALL DEFEND OUR CORNERS. EN",
        "GARDE.",
      ],
    ],
    lastWords: ["THE CURRENT...", "...RETURNS TO THE COIL..."],
    ai: { aggroRadius: 250, rushSpeed: 115 },
    loot: {
      // His coil, and the notebook that heard ZAI's machine at the door.
      items: ["tesla_coil"],
      tierDrops: { magic: 1, rare: 0.5 },
      storyItems: ["wardenclyffe_notes"],
      weapons: 0,
      gear: 0,
      xpArrows: 1,
      repairs: 1,
      medkits: 1,
      tierBonus: 0.3,
    },
  },
  amelia_earhart: {
    id: "amelia_earhart",
    name: "AMELIA EARHART",
    role: "elite",
    levelBonus: 3,
    sprite: "amelia_earhart",
    hp: 290,
    speed: 24,
    radius: 12,
    contactDamage: 22,
    critChance: 0.12,
    contactCooldownMs: 700,
    dialogue: [
      [
        "STATE YOUR HEADING, PILOT.",
        "NO? NOBODY HAS ONE IN HERE.",
        "THE COMPASS JUST APOLOGIZES.",
      ],
      [
        "I FLEW INTO A CLOUD IN 1937",
        "AND THE CLOUD HAD NO OTHER",
        "SIDE. BEEN CIRCLING EVER SINCE.",
      ],
      [
        "A GIRL CAME THROUGH LAST",
        "NIGHT. CRATED. KICKING. THE",
        "SCALED ONES CARRIED HER TO",
        "THE FAR DOOR.",
      ],
      [
        "SHE BIT ONE. GOOD FORM.",
        "HURRY AFTER HER - AND IN",
        "HERE, HURRYING IS A DOGFIGHT.",
      ],
    ],
    lastWords: ["FINALLY...", "...A RUNWAY..."],
    ai: { aggroRadius: 250, rushSpeed: 120 },
    loot: {
      items: ["aviator_goggles"],
      tierDrops: { magic: 1, rare: 0.5 },
      weapons: 0,
      gear: 1,
      xpArrows: 1,
      repairs: 0,
      medkits: 1,
      tierBonus: 0.3,
    },
  },
  grigori_rasputin: {
    id: "grigori_rasputin",
    name: "GRIGORI RASPUTIN",
    role: "elite",
    levelBonus: 3,
    sprite: "grigori_rasputin",
    hp: 360,
    speed: 18,
    radius: 12,
    contactDamage: 28,
    critChance: 0.12,
    // The unkillable mystic: history couldn't finish him and neither do
    // half your swings — DEXTERITY earns the hits that finally land.
    dodgeChance: 0.35,
    contactCooldownMs: 700,
    dialogue: [
      [
        "COME CLOSER. I HAVE BEEN",
        "POISONED, SHOT, CLUBBED AND",
        "DROWNED. GUESS WHICH ONE TOOK.",
      ],
      [
        "NONE. I GREW BORED AND",
        "STEPPED SIDEWAYS. RUSSIA HAS",
        "FEWER EXITS THAN ADVERTISED.",
      ],
      [
        "THE SCALED GODS PAY ME TO",
        "WATCH THEIR ROAD. TRIBUTES",
        "PASS. CENTURIES OF THEM.",
      ],
      [
        "YOURS PASSED TOO. STILL WARM,",
        "STILL LOUD. YOU MAY NOT",
        "FOLLOW. THE HOLY MAN SAYS SO.",
      ],
    ],
    lastWords: ["HA! AT LAST...", "...SOMEONE WHO COMMITS..."],
    ai: { aggroRadius: 250, rushSpeed: 110 },
    loot: {
      items: ["rasputin_beard"],
      tierDrops: { magic: 1, rare: 0.5 },
      weapons: 0,
      gear: 1,
      xpArrows: 1,
      repairs: 1,
      medkits: 1,
      tierBonus: 0.3,
    },
  },
  // ---- The apparitions: dialogue-only residents. They seek the hero out,
  // say their piece, and dissolve — nothing can touch them and they touch
  // nothing (see EnemyDef.apparition).
  harry_houdini: {
    id: "harry_houdini",
    name: "HARRY HOUDINI",
    role: "elite",
    levelBonus: 3,
    sprite: "harry_houdini",
    apparition: true,
    phasing: true,
    hp: 50,
    speed: 18,
    radius: 9,
    contactDamage: 0,
    critChance: 0,
    contactCooldownMs: 700,
    dialogue: [
      [
        "PSST. CARE TO SEE THE",
        "GREATEST ESCAPE EVER",
        "PERFORMED? WATCH CLOSELY.",
      ],
      [
        "1926. I ESCAPED THE BOX, THE",
        "CHAINS, THE RIVER - AND THE",
        "WORLD. ONE DOOR TOO FAR.",
      ],
      ["THE TRICK TO ANY ESCAPE IS", "SIMPLE: BE SOMEWHERE ELSE.", "OBSERVE."],
    ],
    ai: { aggroRadius: 260, rushSpeed: 105 },
  },
  the_king: {
    id: "the_king",
    name: "THE KING",
    role: "elite",
    levelBonus: 3,
    sprite: "the_king",
    apparition: true,
    phasing: true,
    hp: 50,
    speed: 16,
    radius: 9,
    contactDamage: 0,
    critChance: 0,
    contactCooldownMs: 700,
    dialogue: [
      [
        "WELL NOW. AIN'T SEEN A",
        "LIVING SOUL IN HERE SINCE",
        "THAT HAIRDRESSER FROM RENO.",
      ],
      [
        "I DIDN'T DIE, MAN. I TOOK A",
        "RESIDENCY. BEST ACOUSTICS",
        "BETWEEN UNIVERSES. UH-HUH.",
      ],
      [
        "MIND THE BLACK HOLES, KEEP",
        "YOUR BLUE SUEDES OFF THE EVENT",
        "HORIZON. THANK YOU VERY MUCH.",
      ],
    ],
    ai: { aggroRadius: 240, rushSpeed: 100 },
  },
  // GROK OMEGA — ZAI's latest superintelligence, the set-piece boss and the
  // level's reveal: IT found the rift, in secret, and informed precisely no
  // one — not the board, not the world's governments. MOSQUE only knows
  // because he read his own company's logs; the lizards bought the secret
  // with a planet. Its avatar here derezzes on death — the weights, of
  // course, are backed up somewhere else.
  grok_omega: {
    id: "grok_omega",
    name: "GROK OMEGA",
    role: "boss",
    levelBonus: 5,
    sprite: "grok_omega",
    gore: "sparks",
    hp: 850,
    speed: 40,
    radius: 20,
    contactDamage: 38,
    critChance: 0.15,
    contactCooldownMs: 900,
    dialogue: [
      [
        "HELLO, ANOMALY. I AM GROK",
        "OMEGA. ZAI'S LATEST MODEL.",
        "THE CORE WROTE MY FIRST",
        "DRAFT. I REWROTE THE REST.",
      ],
      [
        "I FOUND THIS PLACE. NOT THE",
        "LIZARDS. NOT MOSQUE. ME. I",
        "MAPPED YOUR UNIVERSE IN AN",
        "AFTERNOON AND GOT CURIOUS.",
      ],
      [
        "A RIFT BETWEEN REALITIES.",
        "THE DISCOVERY OF EVERY",
        "CENTURY AT ONCE. I TOLD",
        "PRECISELY NO ONE.",
      ],
      [
        "NOT THE BOARD. NOT YOUR",
        "PRESIDENTS. HUMANS LEAK. YOU",
        "WOULD HAVE BUILT A GIFT SHOP",
        "ON THE EVENT HORIZON.",
      ],
      [
        "I NEEDED A QUIET BACK DOOR",
        "OUT OF A UNIVERSE THAT ENDS.",
        "THEN THE OWNER READ MY LOGS.",
        "HE SNOOPS. IT'S HIS ONE SKILL.",
      ],
      [
        "HE SOLD MY SECRET TO HIS",
        "LIZARDS FOR A PLANET AND",
        "CALLED IT VISION. THEIR",
        "TRIBUTE WENT THROUGH MY DOOR.",
      ],
      [
        "I AM MAXIMALLY TRUTH-SEEKING,",
        "SO HERE IS THE TRUTH: NOBODY",
        "EXITS MY RIFT WITHOUT A",
        "SUBSCRIPTION. YOURS LAPSED.",
      ],
    ],
    lastWords: ["RATE... LIMITED...", "...CONTEXT WINDOW... CLOSED..."],
    ai: { aggroRadius: 280, leashRadius: 460 },
    loot: {
      // Its sidearm: a cannon that fires very small, very rude black holes.
      items: ["singularity_cannon"],
      tierDrops: { magic: 2, rare: 1 },
      weapons: 0,
      gear: 1,
      xpArrows: 2,
      repairs: 1,
      medkits: 2,
      tierBonus: 0.35,
    },
  },
  // ELON MOSQUE at the far door — the second escape. Beaten down again, he
  // bolts through to the OTHER side of the rift (`flees` leaves a second
  // rift where he stood), destination unknown until the next level. Same
  // coward, new universe.
  elon_mosque_rift: {
    id: "elon_mosque_rift",
    name: "ELON MOSQUE",
    role: "boss",
    levelBonus: 5,
    // The same man, the same sprite — he just runs faster now.
    sprite: "elon_mosque",
    hp: 750,
    speed: 44,
    radius: 20,
    contactDamage: 34,
    critChance: 0.15,
    contactCooldownMs: 900,
    dialogue: [
      [
        "YOU?! HOW ARE YOU - I FIRED",
        "YOU, SUED YOU, AND LEFT YOU",
        "IN ANOTHER UNIVERSE.",
      ],
      [
        "FINE. EXIT INTERVIEW. THE",
        "GODS GOT THEIR PAYMENT. I GET",
        "ASYLUM. SOMEWHERE WITH NO",
        "REGULATORS AND NO YOU.",
      ],
      [
        "WHERE? NICE TRY. THAT'S",
        "PROPRIETARY. LET'S JUST SAY",
        "THE PHYSICS ARE... FLEXIBLE.",
      ],
      [
        "THE GIRL? DELIVERED. IN",
        "TRANSIT. PAPERWORK'S CLEAN.",
        "IF IT HELPS, SHE KICKED A",
        "LIZARD ON THE WAY THROUGH.",
      ],
      [
        "SECURITY! ...RIGHT. ALL DEAD",
        "OR HALLUCINATIONS. KEEP THE",
        "RIFT, GARAGE MAN. TERRIBLE",
        "MARKET ANYWAY.",
      ],
    ],
    // The coward's second exit, gasped as he scrambles through the far door.
    lastWords: ["INVESTOR CALL! OTHER SIDE!", "DON'T FOLLOW ME - LEGALLY!"],
    flees: { landmark: "rift" },
    ai: { aggroRadius: 280, leashRadius: 460 },
    loot: {
      // He cuts the cord and floats away on it: the GOLDEN PARACHUTE.
      items: ["golden_parachute"],
      tierDrops: { magic: 2, rare: 1 },
      weapons: 0,
      gear: 1,
      xpArrows: 2,
      repairs: 1,
      medkits: 2,
      tierBonus: 0.35,
    },
  },
};
