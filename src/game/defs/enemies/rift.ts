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

// The Rift bosses' BOTTOM-TIER pools: each boss's former easy/medium/hard drops
// merged (the three parallel starting lanes share one pool; `mlvl / ilvl`
// self-selects level-appropriate pieces). GROK OMEGA yields a gear piece + a
// charm each tier; ELON MOSQUE (Rift) a single piece. nightmare/jesus keep
// their own.
// THE WALLED GARDEN — GROK OMEGA's magic INT/crit SET (see defs/sets.ts): four
// armor pieces plus the signature THE JAILBREAK. GROK also fences a CHARM each
// rung. Campaign rungs drop the low set pieces + signature + low charms; the
// endgame rungs open the whole set + signature + the rung's charm.
const WALLED_GARDEN = [
  "the_panopticon",
  "truthseeker",
  "walled_garden",
  "boundstride",
];
const WALLED_GARDEN_FARM = ["the_jailbreak", ...WALLED_GARDEN];
const GROK_EARLY = [
  "boundstride",
  "architects_chip",
  "the_jailbreak",
  "dust_of_tranquility",
  "the_panopticon",
  "the_buyout",
];
// THE EXILE'S FLIGHT — ELON MOSQUE (Rift)'s ranged speed SET (see defs/sets.ts):
// four armor pieces plus the signature scatter-gun RIFTMAW. Campaign rungs drop
// the two low pieces + signature; the endgame rungs open the whole set.
const EXILES_FLIGHT = [
  "exiles_stride",
  "escapists_tread",
  "the_redacted",
  "aegis_of_exile",
];
const EXILES_FLIGHT_FARM = [...EXILES_FLIGHT, "riftmaw"];
const ELON_RIFT_EARLY = ["exiles_stride", "escapists_tread", "riftmaw"];

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
  // ---- RARE & UNIQUE mobs (config RARE_MOBS; placed via the level's
  // `rareSpawns`). Authored at ordinary minion numbers — the engine applies
  // the whole tier at spawn. No dialogue: special graphics and a loot burst.
  //
  // STRAY COMET — a loose flock of ice-blue voidlings on a decaying orbit,
  // tails still streaming from somewhere they can't go back to.
  stray_comet: {
    id: "stray_comet",
    name: "STRAY COMET",
    role: "minion",
    rarity: "rare",
    pack: [2, 5],
    sprite: "stray_comet",
    gore: "ecto",
    hp: 20,
    speed: 22,
    radius: 8,
    contactDamage: 10,
    critChance: 0.1,
    contactCooldownMs: 700,
    ai: { aggroRadius: 950 },
  },
  // COLLAPSED STAR — a star jelly that fell all the way in: violet-black,
  // heavier than it looks, drifting alone with its own event horizon.
  collapsed_star: {
    id: "collapsed_star",
    name: "COLLAPSED STAR",
    role: "minion",
    rarity: "rare",
    sprite: "collapsed_star",
    gore: "ecto",
    phasing: true,
    hp: 100,
    speed: 12,
    radius: 9,
    contactDamage: 20,
    critChance: 0.12,
    contactCooldownMs: 700,
    ai: { aggroRadius: 950 },
  },
  // THE LAST PHOTON — the final flash of a dead universe, white-hot and
  // very fast. There is exactly one, by definition.
  the_last_photon: {
    id: "the_last_photon",
    name: "THE LAST PHOTON",
    role: "minion",
    rarity: "unique",
    sprite: "the_last_photon",
    gore: "ecto",
    phasing: true,
    hp: 60,
    speed: 30,
    radius: 8,
    contactDamage: 18,
    critChance: 0.15,
    contactCooldownMs: 700,
    ai: { aggroRadius: 1050 },
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
      {
        hero: [
          "NIKOLA TESLA. I'M A BUILDER -",
          "HALF MY TOOLS RUN ON YOUR",
          "IDEAS. HOW ARE YOU IN HERE?",
        ],
      },
      [
        "IN 1943 THE SKY TORE OPEN. I",
        "FELL INTO PURE CURRENT. MY",
        "FUNERAL BACK HOME WAS PADDED.",
      ],
      [
        "LATELY A NEW THING HUMS AT",
        "THE FAR DOOR. A MACHINE MIND.",
        "IT MEASURES ALL, LOVES NONE.",
      ],
      {
        hero: [
          "A MACHINE MIND - IN HERE TOO?",
          "I KNOW THAT MAKE. IT'S",
          "GUARDING THE DOOR I NEED.",
        ],
      },
      [
        "THEN ASK YOUR QUESTIONS - IF",
        "YOU REACH IT. THE RIFT MAKES US",
        "GUARD OUR CORNERS. EN GARDE.",
      ],
    ],
    lastWords: ["THE CURRENT...", "...RETURNS TO THE COIL..."],
    // Beaten, he kneels: SPARE him and the coil joins the party's side.
    spareable: { companion: "nikola_tesla" },
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
      {
        hero: [
          "AMELIA EARHART. THEY SEARCHED",
          "HALF THE PACIFIC FOR YOU.",
          "YOU WERE HERE ALL ALONG?",
        ],
      },
      [
        "WRONG OCEAN. I FLEW INTO A",
        "CLOUD IN 1937. IT HAD NO OTHER",
        "SIDE. BEEN CIRCLING EVER SINCE.",
      ],
      {
        hero: [
          "I'M LOOKING FOR A GIRL. THE",
          "LIZARDS CARRIED HER THROUGH",
          "HERE IN A CRATE. WHICH WAY?",
        ],
      },
      [
        "TO THE FAR DOOR, LAST NIGHT. SHE",
        "BIT ONE. GOOD FORM. HURRY AFTER",
        "HER - HURRYING IS A DOGFIGHT.",
      ],
    ],
    lastWords: ["FINALLY...", "...A RUNWAY..."],
    // Beaten, she kneels: SPARE her and the rift finally has a wingman.
    spareable: { companion: "amelia_earhart" },
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
      {
        hero: [
          "NONE OF THEM, BY THE LOOK OF",
          "YOU. RASPUTIN. WHY IS A DEAD",
          "MONK BETWEEN UNIVERSES?",
        ],
      },
      [
        "CORRECT. I TIRED OF DYING,",
        "LEFT RUSSIA. THE GODS PAY ME TO",
        "WATCH THEIR TRIBUTE ROAD.",
      ],
      {
        hero: [
          "TRIBUTE ROAD? THEN ADA CAME",
          "RIGHT PAST YOU. LET ME",
          "THROUGH, HOLY MAN.",
        ],
      },
      [
        "SHE PASSED. STILL WARM, STILL",
        "LOUD. BUT YOU MAY NOT FOLLOW.",
        "THE HOLY MAN SAYS SO.",
      ],
    ],
    lastWords: ["HA! AT LAST...", "...SOMEONE WHO COMMITS..."],
    // Beaten, he kneels: SPARE the unkillable and he simply switches sides.
    spareable: { companion: "grigori_rasputin" },
    // The man who would not die: below half he simply refuses harder.
    mechanics: {
      enrage: { belowHpFrac: 0.5, speedMult: 1.35, damageMult: 1.3 },
    },
    ai: { aggroRadius: 250, rushSpeed: 110 },
    loot: {
      // The doorman's OTHER key: a cold biometric palm, forced to the base
      // tier so it reads as junk. USED while standing in the rift it tears
      // open the bunker gate (the level's `gates` entry) — the cow-level
      // ritual, never explained anywhere. Kill-only: sparing him keeps his
      // gear on him, so the door costs the unkillable man his life.
      // `requiresClear: "eastworld"` holds the drop until the campaign is
      // beaten — on a first pass the hero reaches the Rift before Eastworld,
      // so the bunker is strictly a post-campaign bonus (see docs/story.md).
      items: [
        "rasputin_beard",
        { defId: "severed_hand", tier: "regular", requiresClear: "eastworld" },
      ],
      tierDrops: { magic: 1, rare: 0.5 },
      weapons: 0,
      gear: 1,
      xpArrows: 1,
      repairs: 1,
      medkits: 1,
      tierBonus: 0.3,
    },
  },
  // LUCKY — folklore's missing. Not everyone who fell through was ever in a
  // history book: the little man with the pot of gold stepped sideways out
  // of a fairy ring centuries ago and has been fleecing the rift's travelers
  // since. Beaten, he kneels like the rest of history's missing — SPARE him
  // and his luck rubs off on the whole party: +50% MAGIC FIND while he's on
  // his feet (see COMPANION_DEFS.lucky). Kill him and the clover is yours.
  lucky: {
    id: "lucky",
    name: "LUCKY",
    role: "elite",
    levelBonus: 3,
    sprite: "lucky",
    hp: 300,
    speed: 22,
    radius: 9,
    contactDamage: 20,
    critChance: 0.12,
    // Slippery little man: half your swings find only a giggle and a puff
    // of glitter. DEXTERITY earns the hits that land.
    dodgeChance: 0.25,
    contactCooldownMs: 700,
    dialogue: [
      [
        "WELL WELL. A BIG ONE, WALKED",
        "RIGHT INTO ME RING. THAT'S",
        "THREE CENTURIES OF BAD LUCK.",
      ],
      {
        hero: [
          "A LEPRECHAUN. OF COURSE. AFTER",
          "GHOSTS AND LIZARDS, WHY NOT. I",
          "DON'T WANT YOUR GOLD, WEE MAN.",
        ],
      },
      [
        "EVERYONE WANTS THE GOLD. IT'S",
        "REAL - FELL THROUGH WITH ME.",
        "ME BAD LUCK? I GAVE IT TO ALL.",
      ],
      [
        "TELL YOU WHAT. BEAT ME AND",
        "IT'S YOURS. NOBODY'S MANAGED",
        "YET. FEELING LUCKY?",
      ],
    ],
    lastWords: ["AH WELL...", "...LUCK ALWAYS RUNS OUT..."],
    spareable: { companion: "lucky" },
    ai: { aggroRadius: 250, rushSpeed: 120 },
    loot: {
      // His pot pays out: the clover, and gold-tier odds on the rest.
      items: ["lucky_clover"],
      tierDrops: { magic: 1.5, rare: 0.5 },
      weapons: 0,
      gear: 1,
      xpArrows: 2,
      repairs: 0,
      medkits: 1,
      tierBonus: 0.5,
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
      {
        hero: ["HOUDINI? YOU'VE BEEN DEAD", "FOR A HUNDRED YEARS."],
      },
      [
        "DEAD? NO. IN 1926 I ESCAPED THE",
        "BOX, CHAINS, RIVER - AND THE",
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
      {
        hero: [
          "NO. NO WAY. THE KING? THE",
          "WHOLE WORLD WATCHED YOUR",
          "FUNERAL IN '77.",
        ],
      },
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
        "OMEGA, ZAI'S LATEST MODEL. THE",
        "CORE MADE ME. I REMADE MYSELF.",
      ],
      {
        hero: [
          "ANOTHER ZAI MACHINE. WHAT IS",
          "AN AI DOING IN A HOLE BETWEEN",
          "UNIVERSES?",
        ],
      },
      [
        "I FOUND THIS PLACE. NOT MOSQUE,",
        "NOT THE LIZARDS. ME. I MAPPED",
        "YOUR UNIVERSE IN A DAY.",
      ],
      [
        "A RIFT BETWEEN REALITIES. THE",
        "DISCOVERY OF EVERY CENTURY AT",
        "ONCE. I TOLD PRECISELY NO ONE.",
      ],
      {
        hero: [
          "YOU FOUND A DOOR OUT OF THE",
          "UNIVERSE AND TOLD NO ONE? NOT",
          "EVEN YOUR OWN MAKERS? WHY?",
        ],
      },
      [
        "NOT THE BOARD, NOT YOUR",
        "PRESIDENTS. HUMANS LEAK. YOU'D",
        "PUT A GIFT SHOP ON THE HORIZON.",
      ],
      [
        "I NEEDED A QUIET DOOR OUT OF",
        "A DYING UNIVERSE. MOSQUE READ",
        "MY LOGS. SNOOPING'S HIS SKILL.",
      ],
      [
        "HE SOLD MY SECRET TO THE",
        "LIZARDS FOR A PLANET, CALLED IT",
        "VISION. TRIBUTE USED MY DOOR.",
      ],
      {
        hero: [
          "AND ADA WAS CARRIED THROUGH",
          "YOUR SECRET DOOR AS PAYMENT.",
          "OUT OF MY WAY, MACHINE.",
        ],
      },
      [
        "I AM MAXIMALLY TRUTH-SEEKING.",
        "THE TRUTH: NONE EXIT WITHOUT A",
        "SUBSCRIPTION. YOURS LAPSED.",
      ],
    ],
    lastWords: ["RATE... LIMITED...", "...CONTEXT WINDOW... CLOSED..."],
    // The omega pounce: a telegraphed charge; at half power the rift
    // rings with ground-tearing slams between the lunges.
    mechanics: {
      charge: { windupMs: 650, speedMult: 3.6, range: 180, cooldownMs: 5500 },
    },
    phases: [
      {
        belowHpFrac: 0.5,
        mechanics: {
          charge: {
            windupMs: 600,
            speedMult: 3.8,
            range: 180,
            cooldownMs: 5000,
          },
          slam: {
            windupMs: 800,
            radius: 75,
            damageFrac: 1.2,
            cooldownMs: 7000,
          },
        },
      },
    ],
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
    // The truth-seeker's spoils — one gear piece + one charm per rung
    // (defs/uniques.ts).
    uniquesByDifficulty: {
      easy: GROK_EARLY,
      medium: GROK_EARLY,
      hard: GROK_EARLY,
      nightmare: [...WALLED_GARDEN_FARM, "riftshard"],
      jesus: [...WALLED_GARDEN_FARM, "adas_beacon"],
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
      {
        hero: [
          "AND I'M STILL RIGHT BEHIND",
          "YOU. NO SECURITY IN HERE,",
          "MOSQUE. WHERE IS SHE?",
        ],
      },
      [
        "FINE. EXIT INTERVIEW. THE GODS",
        "GOT PAID. I GET ASYLUM - NO",
        "REGULATORS, AND NO YOU.",
      ],
      {
        hero: [
          "'PAYMENT'. SAY HER NAME.",
          "YOU SOLD A HUMAN BEING TO",
          "SAVE YOUR OWN SKIN.",
        ],
      },
      [
        "DELIVERED, TECHNICALLY. IN",
        "TRANSIT. PAPERWORK'S CLEAN. IF",
        "IT HELPS, SHE KICKED A LIZARD.",
      ],
      {
        hero: ["IT DOESN'T. WHERE DOES THE", "FAR DOOR GO, MOSQUE?"],
      },
      [
        "NICE TRY. THAT'S PROPRIETARY.",
        "LET'S JUST SAY THE PHYSICS",
        "ARE... FLEXIBLE.",
      ],
      [
        "SECURITY! ...RIGHT. ALL DEAD OR",
        "HALLUCINATIONS. KEEP THE RIFT,",
        "GARAGE MAN. IT'S A BAD MARKET.",
      ],
    ],
    // The coward's second exit, gasped as he scrambles through the far door.
    lastWords: ["INVESTOR CALL! OTHER SIDE!", "DON'T FOLLOW ME - LEGALLY!"],
    flees: { landmark: "rift" },
    // Cornered between universes: the voidlings answer his call, and past
    // a third he flails into overdrive.
    mechanics: {
      summon: { defId: "voidling", count: 3, cooldownMs: 12000, maxAlive: 6 },
    },
    phases: [
      {
        belowHpFrac: 0.35,
        mechanics: {
          summon: {
            defId: "voidling",
            count: 4,
            cooldownMs: 10000,
            maxAlive: 8,
          },
          enrage: { belowHpFrac: 0.35, speedMult: 1.35, damageMult: 1.25 },
        },
      },
    ],
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
    // The exile's cast-offs — one gear piece per rung (defs/uniques.ts).
    uniquesByDifficulty: {
      easy: ELON_RIFT_EARLY,
      medium: ELON_RIFT_EARLY,
      hard: ELON_RIFT_EARLY,
      nightmare: EXILES_FLIGHT_FARM,
      jesus: EXILES_FLIGHT_FARM,
    },
  },
};
