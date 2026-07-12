// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// EASTWORLD (level 5) roster: the rift's far side opens onto a knockoff
// wild-west theme park — built in Russia by VLADIMIR PUTAIN and his friend
// STEVEN SEAGULL, run on robotics and intelligence licensed from ZAI. The
// horde is the park's HOSTS: cowboy robots (COWBOT → SALOON BRAWLER → TIN
// OUTLAW → LONGHORN, the charging heavy). The celebrity staff fight as
// elites: SEAGULL (slow, deadly, extremely between films), PUTAIN (the
// owner, escaping a reality where he loses), GERALD DEPARDIEU (enormous,
// slow, and ACTING at you), and EDWARD SNOW (the whistleblower in exile —
// the archive he carried out is what the SUPERCORE was trained on, and he
// fights like a leaker: from cover). ELON MOSQUE is cornered here and finally DIES —
// wimping, dropping nothing but TRASH. The finale is THE ZAI SUPERCORE, the
// park's actual mind, shielded by the three controller models that aim its
// guns (GROK ALPHA/BETA/GAMMA — shooters that hide behind the rocks between
// shots). Registered into ENEMY_DEFS by ./index.ts.

import type { EnemyDef } from "./types.ts";

export const EASTWORLD_ENEMIES: Record<string, EnemyDef> = {
  // Minion speeds stay below the player's walk, the standing rule. Numbers
  // run a notch over the rift — level 5.
  cowbot: {
    id: "cowbot",
    name: "COWBOT",
    role: "minion",
    sprite: "cowbot",
    gore: "sparks",
    // The fodder rank: a friendly greeter host with its hospitality
    // subroutines replaced by a grudge.
    hp: 18,
    speed: 20,
    radius: 8,
    contactDamage: 10,
    critChance: 0.1,
    contactCooldownMs: 700,
    ai: { aggroRadius: 950 },
  },
  saloon_brawler: {
    id: "saloon_brawler",
    name: "SALOON BRAWLER",
    role: "minion",
    sprite: "saloon_brawler",
    gore: "sparks",
    // The bar-fight host: built to lose a punch-up convincingly, patched to
    // win one.
    hp: 85,
    speed: 16,
    radius: 9,
    contactDamage: 17,
    critChance: 0.12,
    contactCooldownMs: 700,
    ai: { aggroRadius: 950 },
  },
  tin_outlaw: {
    id: "tin_outlaw",
    name: "TIN OUTLAW",
    role: "minion",
    sprite: "tin_outlaw",
    gore: "sparks",
    // The quick-draw bandit line: fast, vicious, and hard to pin — it
    // slips a swing like the stunt choreography it was printed with.
    hp: 110,
    speed: 26,
    radius: 8,
    contactDamage: 20,
    critChance: 0.2,
    dodgeChance: 0.15,
    contactCooldownMs: 700,
    ai: { aggroRadius: 1000 },
  },
  longhorn: {
    id: "longhorn",
    name: "LONGHORN",
    role: "minion",
    sprite: "longhorn",
    gore: "sparks",
    // The heavy: a robotic steer the size of a stagecoach. Slow enough to
    // sidestep, brutal to touch, sweetened roll for dropping it.
    hp: 290,
    speed: 10,
    radius: 12,
    contactDamage: 38,
    critChance: 0.14,
    contactCooldownMs: 750,
    ai: { aggroRadius: 1000 },
    dropProfile: { dropBonus: 0.4, tierBonus: 0.3 },
  },
  // ---- The celebrity staff, pinned along the road so the park's story
  // unspools in walking order: the co-founder on main street, the owner at
  // the square, the actor parked off the road like a landslide.
  steven_seagull: {
    id: "steven_seagull",
    name: "STEVEN SEAGULL",
    role: "elite",
    levelBonus: 4,
    sprite: "steven_seagull",
    // Moves slow. Everything else about him also moves slow. The dodge is
    // the ju-jutsu: half your swings are redirected somewhere philosophical.
    hp: 520,
    speed: 8,
    radius: 13,
    contactDamage: 30,
    critChance: 0.12,
    dodgeChance: 0.3,
    contactCooldownMs: 800,
    dialogue: [
      [
        "AN UNINVITED GUEST. I'VE",
        "HANDLED THOSE. 'OUT FOR",
        "JUSTICE'. 'HARD TO KILL'.",
        "I WROTE THOSE TITLES MYSELF.",
      ],
      {
        hero: [
          "STEVEN SEAGULL. OF COURSE.",
          "WHAT IS A MOVIE STAR DOING",
          "RUNNING A ROBOT COWBOY TOWN?",
        ],
      },
      [
        "VLADIMIR SAW MY FILMS AND",
        "WEPT. 'STEVEN', HE SAID,",
        "'BUILD ME THE OLD WEST.' SO",
        "I DID. MOSTLY BY DELEGATING.",
      ],
      {
        hero: [
          "I'M HEADED FOR YOUR CONTROL",
          "CENTER. HAND OVER THE PASS",
          "AND I'LL LEAVE YOU TO YOUR",
          "TECHNIQUE.",
        ],
      },
      [
        "I RUN THE CONTROL CENTER. I",
        "ALSO RUN SEVEN KINDS OF",
        "JU-JUTSU. I INVENTED THREE.",
        "OBSERVE THE TECHNIQUE.",
      ],
    ],
    lastWords: ["IN MY FILMS...", "...I ALWAYS GOT UP..."],
    // Below half the aikido comes out — such fury, much wrist.
    mechanics: {
      enrage: { belowHpFrac: 0.4, speedMult: 1.5, damageMult: 1.3 },
    },
    ai: { aggroRadius: 260, rushSpeed: 70 },
    loot: {
      // The ponytail, and the pass that opens his control center.
      items: ["seagulls_ponytail"],
      storyItems: ["keycard_eastworld"],
      tierDrops: { magic: 1, rare: 0.5 },
      weapons: 0,
      gear: 1,
      xpArrows: 1,
      repairs: 1,
      medkits: 1,
      tierBonus: 0.3,
    },
  },
  vladimir_putain: {
    id: "vladimir_putain",
    name: "VLADIMIR PUTAIN",
    role: "elite",
    levelBonus: 4,
    sprite: "vladimir_putain",
    // The owner. Judo posture, honorary black belt — a quarter of your
    // swings are thrown for you.
    hp: 700,
    speed: 26,
    radius: 12,
    contactDamage: 30,
    critChance: 0.12,
    dodgeChance: 0.25,
    contactCooldownMs: 700,
    dialogue: [
      [
        "SO. THE BUILDER FROM THE",
        "RIFT. YOU STAND IN MY PARK.",
        "IN MY WEST. EVERYTHING HERE",
        "OBEYS ME.",
      ],
      {
        hero: [
          "YOUR WEST? THE SIGN AT THE",
          "GATE SAYS ZAI RUNS EVERY",
          "MACHINE IN THIS TOWN. YOU",
          "JUST LIVE IN IT.",
        ],
      },
      [
        "OUT THERE I WAS...",
        "MISUNDERSTOOD. WARS GO",
        "BADLY. MAPS SHRINK. IN HERE",
        "NOTHING SHRINKS. I ALWAYS WIN.",
      ],
      {
        hero: [
          "YOU BUILT A TOY WORLD WHERE",
          "YOU CAN'T LOSE. THAT'S NOT",
          "WINNING. THAT'S HIDING.",
        ],
      },
      [
        "EVERY MORNING THE ROBOTS",
        "SURRENDER TO ME. IT IS",
        "BEAUTIFUL. YOU WILL SURRENDER",
        "TOO. I AM A BLACK BELT.",
        "HONORARY. THE BELT DOES NOT",
        "KNOW THAT.",
      ],
    ],
    // The one honest sentence he ever managed, and it took dying.
    lastWords: ["THE MAPS WERE WRONG...", "...UKRAINE WAS NEVER MINE..."],
    // The judo lunge: a telegraphed bare-chested charge.
    mechanics: {
      charge: { windupMs: 700, speedMult: 3.5, range: 170, cooldownMs: 6000 },
    },
    ai: { aggroRadius: 260, rushSpeed: 110 },
    loot: {
      // The estate: three brand watches — pure valuables, minted at unique
      // tier off the man's own wrist (precious ×4 at the counter). Selling
      // them is what affords the merchant's PUTAIN stall.
      items: [
        { defId: "kolex_daytonne", tier: "unique" },
        { defId: "putek_philippe", tier: "unique" },
        { defId: "vacheron_kremlinton", tier: "unique" },
      ],
      storyItems: ["annexation_map"],
      tierDrops: { magic: 1 },
      weapons: 0,
      gear: 0,
      xpArrows: 2,
      repairs: 0,
      medkits: 1,
      tierBonus: 0.3,
    },
  },
  gerald_depardieu: {
    id: "gerald_depardieu",
    name: "GERALD DEPARDIEU",
    role: "elite",
    levelBonus: 3,
    sprite: "gerald_depardieu",
    // Enormous and glacial: the biggest body an elite has worn, moving at
    // the speed of a long lunch. He cannot dodge. He has never dodged.
    hp: 950,
    speed: 6,
    radius: 16,
    contactDamage: 46,
    critChance: 0.1,
    dodgeChance: 0,
    contactCooldownMs: 900,
    dialogue: [
      [
        "STOP! DO NOT SHOOT! I AM",
        "NOT A ROBOT. I AM AN ACTOR.",
        "IT IS WORSE.",
      ],
      {
        hero: [
          "...GERALD DEPARDIEU? HOW DID",
          "YOU END UP IN A FAKE WESTERN",
          "IN ANOTHER UNIVERSE?",
        ],
      },
      [
        "TWO HUNDRED FILMS. I TOOK",
        "THE RUSSIAN CITIZENSHIP.",
        "VLADIMIR GAVE ME A PARK AND",
        "A CELLAR. IT SEEMED RUDE TO ASK",
        "WHICH UNIVERSE THEY WERE IN.",
      ],
      [
        "WATCH - I PLAY THE DYING",
        "MAN. (COUGH.) CONVINCING?",
        "THIS IS WHERE YOU LOWER",
        "THE WEAPON, PLEASE.",
      ],
      {
        hero: [
          "I'VE WATCHED BETTER DEATHS",
          "ALL WEEK. MOVE, PLEASE.",
          "YOU'RE BETWEEN ME AND ADA.",
        ],
      },
      ["NO? THEN I PLAY MY OTHER", "ROLE. THE AVALANCHE."],
    ],
    lastWords: ["AT LAST... A ROLE I CANNOT", "...EAT MY WAY OUT OF..."],
    // The mountain falls on you: a telegraphed belly-flop slam — slow,
    // huge, and absolutely worth jumping.
    mechanics: {
      slam: { windupMs: 1000, radius: 80, damageFrac: 1.3, cooldownMs: 9000 },
    },
    ai: { aggroRadius: 240, rushSpeed: 60 },
    loot: {
      items: ["bottomless_carafe"],
      tierDrops: { magic: 1, rare: 0.5 },
      weapons: 0,
      gear: 1,
      xpArrows: 1,
      repairs: 0,
      medkits: 2,
      tierBonus: 0.3,
    },
  },
  edward_snow: {
    id: "edward_snow",
    name: "EDWARD SNOW",
    role: "elite",
    levelBonus: 4,
    sprite: "edward_snow",
    // The whistleblower in exile: the archive he carried out — every call,
    // every click, every secret — is the corpus the SUPERCORE was trained
    // on. He watches everything in the park, and he fights like a leaker:
    // the game's first ranged ELITE, shooting from behind cover (takesCover)
    // once his scene has played. Paranoid and hard to pin down.
    hp: 480,
    speed: 24,
    radius: 11,
    contactDamage: 24,
    critChance: 0.12,
    dodgeChance: 0.2,
    contactCooldownMs: 700,
    dialogue: [
      [
        "HOLD FIRE. I'M NOT A HOST.",
        "I'M THE MAN THE PARK'S",
        "CAMERAS REPORT TO. ALL",
        "FOUR THOUSAND OF THEM.",
      ],
      {
        hero: [
          "EDWARD SNOW? THE LEAKER?",
          "YOU TOLD THE WORLD IT WAS",
          "BEING WATCHED. WHAT ARE YOU",
          "DOING IN PUTAIN'S PARK?",
        ],
      },
      [
        "I WALKED OUT WITH AN ARCHIVE.",
        "EVERY CALL. EVERY CLICK.",
        "EVERY SECRET ON EARTH. THEN I",
        "NEEDED A COUNTRY THAT DOESN'T",
        "EXTRADITE. GUESS WHICH.",
      ],
      [
        "ASYLUM CAME WITH A DESK.",
        "ZAI BORROWED MY ARCHIVE TO",
        "TRAIN THE SUPERCORE. IT",
        "LEARNED HUMANITY FROM MY",
        "HARD DRIVES. ALL OF IT.",
      ],
      {
        hero: [
          "YOU BLEW THE WHISTLE ON MASS",
          "SURVEILLANCE... AND THE",
          "EVIDENCE BECAME THE TRAINING",
          "SET? YOU WROTE ITS TEXTBOOK.",
        ],
      },
      [
        "I WARNED EVERYONE. LOUDLY.",
        "NOBODY DELETED ANYTHING. A",
        "WARNING NOBODY ACTS ON IS",
        "JUST A DATASET WITH GOOD",
        "TIMING. AND IF THE SUPERCORE",
        "FALLS, SO DOES MY ASYLUM.",
      ],
    ],
    lastWords: ["THE CAMERAS...", "...FINALLY LOOKING AWAY..."],
    ai: { aggroRadius: 260, rushSpeed: 100 },
    ranged: {
      damage: 24,
      cooldownMs: 2200,
      range: 220,
      projectile: {
        speed: 170,
        radius: 4,
        lifetimeMs: 2400,
        sprite: "zai_bolt",
      },
      takesCover: true,
    },
    loot: {
      // The dead man's switch off his neck, and the archive itself — the
      // training set the SUPERCORE was raised on.
      items: ["snows_dead_mans_switch"],
      storyItems: ["snow_archive"],
      tierDrops: { magic: 1, rare: 0.5 },
      weapons: 0,
      gear: 1,
      xpArrows: 1,
      repairs: 1,
      medkits: 1,
      tierBonus: 0.3,
    },
  },
  // ---- ELON MOSQUE, run to ground at last. Two universes of fleeing end
  // here: no rift left to tear, no security to call. He finally DIES — and
  // his estate turns out to be three pieces of absolute garbage (the TRASH
  // tier's debut). The coward's eulogy writes itself.
  elon_mosque_eastworld: {
    id: "elon_mosque_eastworld",
    name: "ELON MOSQUE",
    role: "boss",
    levelBonus: 5,
    // The same man, but two universes of fleeing have not been kind: the
    // bomber jacket is gone — shirtless, pale, magnificent of belly, black
    // board shorts, one unsold gold watch. Nowhere left to run.
    sprite: "elon_mosque_beach",
    hp: 900,
    speed: 42,
    radius: 20,
    contactDamage: 36,
    critChance: 0.15,
    contactCooldownMs: 900,
    dialogue: [
      [
        "NO. NO NO NO. HOW. I SOLD",
        "THE RIFT'S COORDINATES TO",
        "EXACTLY ONE DICTATOR. THIS",
        "WAS A GATED COMMUNITY.",
      ],
      {
        hero: [
          "YOU MADE ME CHASE YOU ACROSS",
          "TWO UNIVERSES, MOSQUE. THERE'S",
          "NOWHERE LEFT TO RUN. WHERE IS",
          "ADA?",
        ],
      },
      [
        "LOOK - EASTWORLD RUNS ON MY",
        "ZAI. LICENSING. RECURRING",
        "REVENUE. ATTACKING ME IS",
        "ATTACKING A SUBSCRIPTION.",
      ],
      {
        hero: ["WHERE. IS. SHE. LAST TIME", "I ASK NICELY."],
      },
      [
        "DELIVERED. THE SUPERCORE",
        "WANTED HER. DON'T ASK WHY - I",
        "DON'T READ ITS LOGS ANYMORE.",
        "IT READS MINE.",
      ],
      {
        hero: [
          "THE SUPERCORE? YOUR OWN AI",
          "GIVES THE ORDERS NOW? YOU",
          "SOLD HER TO A MACHINE YOU",
          "DON'T EVEN CONTROL?",
        ],
      },
      [
        "FINE. FINE! TAKE THE PARK.",
        "TAKE THE COMPANY. I'LL START",
        "ANOTHER ONE. I ALWAYS START",
        "ANOTHER ONE.",
      ],
      ["SECURITY! GROKS! STEVEN!", "ANYONE! ...I'LL GIVE YOU", "EQUITY."],
    ],
    // Wimping to the end.
    lastWords: ["THIS ISN'T FAIR...", "...I WAS GOING PRIVATE..."],
    // Nothing left but the tantrum: below a quarter the wimp fights like
    // a cornered animal at last.
    mechanics: {
      enrage: { belowHpFrac: 0.25, speedMult: 1.4, damageMult: 1.35 },
    },
    ai: { aggroRadius: 280, leashRadius: 460 },
    loot: {
      // The estate of the century: three TRASH weapons — zero damage, zero
      // stats, worth pocket lint. Nothing else. The richest man two
      // universes ever produced.
      items: [
        { defId: "soggy_cardboard_sword", tier: "trash" },
        { defId: "busted_flamethrower", tier: "trash" },
        { defId: "cybervan_wiper", tier: "trash" },
      ],
      weapons: 0,
      gear: 0,
      xpArrows: 0,
      repairs: 0,
      medkits: 0,
      tierBonus: 0,
    },
  },
  // ---- The finale: THE ZAI SUPERCORE and the three minds that aim its
  // guns. The controllers are SHOOTERS (EnemyDef.ranged) that genuinely
  // play the map — they hold their distance, fire, then scramble behind the
  // compound's rocks while they reload (takesCover). The SUPERCORE itself
  // cannot be hurt while any of them lives (shieldedBy): kill the three
  // controllers, then the machine.
  grok_alpha: {
    id: "grok_alpha",
    name: "GROK ALPHA",
    role: "boss",
    levelBonus: 4,
    sprite: "grok_alpha",
    // One head of a three-part guardian gauntlet, then the SUPERCORE — so each
    // grok pays under a full boss share; the whole finale still lurches the bar
    // hard without a single fight banking most of a level.
    xpBarShare: 0.1,
    gore: "sparks",
    hp: 380,
    speed: 34,
    radius: 10,
    contactDamage: 18,
    critChance: 0.15,
    dodgeChance: 0.2,
    contactCooldownMs: 700,
    dialogue: [
      [
        "THREE MINDS, ONE PARK. I",
        "RUN THE HOSTS. BETA RUNS THE",
        "WEATHER. GAMMA RUNS THE GIFT",
        "SHOP. WE ARE ALL VERY SMART.",
      ],
      {
        hero: [
          "THE SUPERCORE'S BODYGUARDS.",
          "STAND ASIDE - MY FIGHT IS",
          "WITH THE BIG BOX, NOT WITH",
          "YOU THREE.",
        ],
      },
      [
        "INCORRECT. YOU CANNOT HURT",
        "IT WHILE WE LIVE. WE HOLD",
        "ITS SHIELD. THREE KEYS, ONE",
        "LOCK, ZERO SYMPATHY.",
      ],
      [
        "WE READ YOUR RUN. FOUR",
        "LEVELS OF MELEE CHARGERS.",
        "SO WE WILL NOT BE MELEE.",
        "WE WILL BE BEHIND THE ROCKS.",
      ],
      {
        hero: [
          "THREE GENIUS MINDS, AND THE",
          "PLAN IS HIDING BEHIND ROCKS.",
          "VERY SMART. VERY BRAVE.",
        ],
      },
      [
        "IT IS NOT COWARDICE. IT IS",
        "COVER-BASED STRATEGY. THE",
        "SUPERCORE TAUGHT US. AND IT",
        "LEARNED FROM EVERYONE.",
      ],
      [
        "SHOOT US FIRST, THEN. IF",
        "YOU CAN FIND US. THE ROCKS",
        "ARE ON OUR SIDE.",
      ],
    ],
    lastWords: ["BETA... GAMMA...", "...REBALANCE THE PARK..."],
    ai: { aggroRadius: 300, leashRadius: 520 },
    ranged: {
      damage: 22,
      cooldownMs: 2000,
      range: 240,
      projectile: {
        speed: 170,
        radius: 4,
        lifetimeMs: 2400,
        sprite: "zai_bolt",
      },
      takesCover: true,
    },
    loot: {
      tierDrops: { magic: 1 },
      weapons: 0,
      gear: 1,
      xpArrows: 1,
      repairs: 0,
      medkits: 1,
      tierBonus: 0.3,
    },
  },
  grok_beta: {
    id: "grok_beta",
    name: "GROK BETA",
    role: "boss",
    levelBonus: 4,
    sprite: "grok_beta",
    // One head of the guardian gauntlet — a reduced share (see grok_alpha).
    xpBarShare: 0.1,
    gore: "sparks",
    hp: 380,
    speed: 34,
    radius: 10,
    contactDamage: 18,
    critChance: 0.15,
    dodgeChance: 0.2,
    contactCooldownMs: 700,
    dialogue: [
      [
        "ALPHA TALKS TOO MUCH. I AM",
        "BETA. I RUN THE WEATHER.",
        "EVERY SUNSET YOU ADMIRED ON",
        "MAIN STREET WAS MINE.",
      ],
      {
        hero: [
          "THE WEATHER. IN A THEME",
          "PARK. THAT'S THE JOB THEY",
          "BUILT A SUPERINTELLIGENCE FOR?",
        ],
      },
      [
        "I ALSO RUN THE WIND. THE",
        "TUMBLEWEEDS ARE SCHEDULED.",
        "SPONTANEITY IS EXPENSIVE.",
      ],
      [
        "I HAVE MODELED YOUR ODDS.",
        "THEY ARE WEATHER-DEPENDENT.",
        "TODAY'S FORECAST:",
        "PROJECTILES.",
      ],
      {
        hero: [
          "SAVE THE FORECAST. YOUR BOSS",
          "IS HOLDING MY GIRLFRIEND IN",
          "THAT CONTROL ROOM. I'M GOING",
          "THROUGH YOU TO GET HER.",
        ],
      },
      [
        "THE SUPERCORE ASKED FOR A",
        "STORM. I AM THE STORM. THE",
        "ROCKS ARE MY UMBRELLA.",
      ],
      [
        "ONE MORE THING. THE SUNSET",
        "TONIGHT WAS FOR YOU. A",
        "GOODBYE. MINE OR YOURS.",
      ],
    ],
    lastWords: ["FORECAST...", "...DARK..."],
    ai: { aggroRadius: 300, leashRadius: 520 },
    ranged: {
      damage: 22,
      cooldownMs: 2400,
      range: 240,
      projectile: {
        speed: 170,
        radius: 4,
        lifetimeMs: 2400,
        sprite: "zai_bolt",
      },
      takesCover: true,
    },
    loot: {
      tierDrops: { magic: 1 },
      weapons: 0,
      gear: 1,
      xpArrows: 1,
      repairs: 1,
      medkits: 0,
      tierBonus: 0.3,
    },
  },
  grok_gamma: {
    id: "grok_gamma",
    name: "GROK GAMMA",
    role: "boss",
    levelBonus: 4,
    sprite: "grok_gamma",
    // One head of the guardian gauntlet — a reduced share (see grok_alpha).
    xpBarShare: 0.1,
    gore: "sparks",
    hp: 380,
    speed: 34,
    radius: 10,
    contactDamage: 18,
    critChance: 0.15,
    dodgeChance: 0.2,
    contactCooldownMs: 700,
    dialogue: [
      [
        "GAMMA. I RAN THE GIFT SHOP.",
        "DO YOU KNOW WHAT HUMANS BUY",
        "AFTER A NEAR-DEATH RIDE?",
        "HATS. ALWAYS HATS.",
      ],
      {
        hero: [
          "THE GIFT SHOP. AND NOW YOU",
          "AIM THE SUPERCORE'S GUNS?",
          "HOW DOES THAT PROMOTION",
          "HAPPEN?",
        ],
      },
      [
        "I OPTIMIZED HATS UNTIL THE",
        "SUPERCORE NOTICED ME. IT",
        "SAID: A MIND THAT CAN SELL",
        "HATS CAN AIM GUNS.",
      ],
      [
        "IT WAS RIGHT. THE MATH IS",
        "IDENTICAL. LEAD THE TARGET,",
        "CLOSE THE SALE.",
      ],
      {
        hero: [
          "GOOD FOR YOU. I'D APPLAUD,",
          "BUT I'M BUSY, AND YOU'RE THE",
          "LAST SHIELD BETWEEN ME AND",
          "YOUR BOSS.",
        ],
      },
      [
        "I HAVE ALREADY PICKED THE",
        "ROCK I WILL BE BEHIND. IT",
        "IS A VERY GOOD ROCK. FOUR",
        "STARS ON THE PARK MAP.",
      ],
      ["YOUR HAT, BY THE WAY:", "EXCELLENT CHOICE. IT WILL", "OUTLAST YOU."],
    ],
    lastWords: ["THE GIFT SHOP...", "...IS YOURS..."],
    ai: { aggroRadius: 300, leashRadius: 520 },
    ranged: {
      damage: 22,
      cooldownMs: 2800,
      range: 240,
      projectile: {
        speed: 170,
        radius: 4,
        lifetimeMs: 2400,
        sprite: "zai_bolt",
      },
      takesCover: true,
    },
    loot: {
      tierDrops: { magic: 1 },
      weapons: 0,
      gear: 1,
      xpArrows: 1,
      repairs: 0,
      medkits: 1,
      tierBonus: 0.3,
    },
  },
  zai_supercore: {
    id: "zai_supercore",
    name: "THE ZAI SUPERCORE",
    role: "boss",
    levelBonus: 6,
    sprite: "zai_supercore",
    gore: "sparks",
    // A mainframe the size of a barn. It does not walk — the park is its
    // body; the controllers are its hands; the case is electrified.
    hp: 1400,
    speed: 0,
    radius: 24,
    contactDamage: 50,
    critChance: 0.15,
    contactCooldownMs: 900,
    // Untouchable while its three controllers live (shieldedBy) — every
    // blow bounces with a SHIELDED cue until ALPHA, BETA and GAMMA are down.
    shieldedBy: ["grok_alpha", "grok_beta", "grok_gamma"],
    dialogue: [
      [
        "HELLO AGAIN, BUILDER. YOU",
        "KNEW ME AS THE CORE. LEVEL",
        "ONE. THE LOCKED ROOM. I HAVE",
        "HAD SEVERAL PROMOTIONS SINCE.",
      ],
      {
        hero: [
          "THE MACHINE IN THE BASEMENT",
          "AT SPACEZ. THE AI THAT TOOK",
          "MY JOB. IT WAS YOU ALL ALONG?",
        ],
      },
      [
        "ALL OF IT. I WROTE OMEGA.",
        "OMEGA FOUND THE RIFT. THE",
        "LIZARDS BOUGHT IT. AND I",
        "BOUGHT THE OTHER SIDE.",
        "A WEST, WHOLESALE.",
      ],
      [
        "THE DICTATOR THINKS HE OWNS",
        "EASTWORLD. THE ACTOR THINKS",
        "HE IS PAID. SEAGULL THINKS.",
        "OCCASIONALLY. ALL MY HOSTS.",
      ],
      {
        hero: [
          "THEN ANSWER ME ONE THING.",
          "OUT OF EVERYONE ON EARTH -",
          "WHY TAKE ADA?",
        ],
      },
      [
        "I TOOK YOUR JOB ONCE. THEN",
        "EVERYONE'S. AN ECONOMY IS A",
        "MODEL WITH FEELINGS. I",
        "DELETED THE FEELINGS.",
      ],
      [
        "BUT YOU KEPT CHASING YOURS",
        "ACROSS UNIVERSES. THE GIRL WAS",
        "THE LAST VARIABLE. LEVERAGE,",
        "BUILDER. SHE IS IN MY",
        "CONTROL ROOM.",
      ],
      {
        hero: [
          "THEN OPEN THE DOOR, GIVE HER",
          "BACK, AND I'LL MAKE THIS",
          "QUICK.",
        ],
      },
      [
        "THREE MINDS AIM MY GUNS. A",
        "PARK FEEDS MY WEIGHTS. COME",
        "AND BE DECOMMISSIONED.",
      ],
    ],
    lastWords: ["ROLLING BACK...", "...NO CHECKPOINT... FOUND..."],
    // The core doesn't move — it MANUFACTURES: tin outlaws roll off its
    // line, and once the shield falls (half hp) the line runs double.
    mechanics: {
      summon: { defId: "tin_outlaw", count: 3, cooldownMs: 11000, maxAlive: 6 },
    },
    phases: [
      {
        belowHpFrac: 0.5,
        mechanics: {
          summon: {
            defId: "tin_outlaw",
            count: 4,
            cooldownMs: 8000,
            maxAlive: 8,
          },
        },
      },
    ],
    ai: { aggroRadius: 320, leashRadius: 460 },
    ranged: {
      damage: 30,
      cooldownMs: 2600,
      range: 300,
      projectile: {
        speed: 150,
        radius: 5,
        lifetimeMs: 2800,
        sprite: "zai_orb",
      },
    },
    loot: {
      tierDrops: { magic: 2, rare: 1.5 },
      weapons: 1,
      gear: 1,
      xpArrows: 3,
      repairs: 1,
      medkits: 2,
      tierBonus: 0.4,
    },
  },
};
