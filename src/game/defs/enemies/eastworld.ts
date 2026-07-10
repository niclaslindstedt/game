// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// EASTWORLD (level 5) roster: the rift's far side opens onto a knockoff
// wild-west theme park — built in Russia by VLADIMIR PUTAIN and his friend
// STEVEN SEAGULL, run on robotics and intelligence licensed from ZAI. The
// horde is the park's HOSTS: cowboy robots (COWBOT → SALOON BRAWLER → TIN
// OUTLAW → LONGHORN, the charging heavy). The celebrity staff fight as
// elites: SEAGULL (slow, deadly, extremely between films), PUTAIN (the
// owner, escaping a reality where he loses), and GERALD DEPARDIEU (enormous,
// slow, and ACTING at you). ELON MOSQUE is cornered here and finally DIES —
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
      [
        "I RUN THE CONTROL CENTER.",
        "I ALSO RUN SEVEN KINDS OF",
        "JU-JUTSU. I INVENTED THREE",
        "OF THEM. THE BEST THREE.",
      ],
      [
        "VLADIMIR SAW MY FILMS AND",
        "WEPT. 'STEVEN', HE SAID,",
        "'BUILD ME THE OLD WEST.' SO",
        "I DID. MOSTLY BY DELEGATING.",
      ],
      [
        "I MOVE SLOWLY BECAUSE THE",
        "WORLD MOVES TOO FAST.",
        "OBSERVE THE TECHNIQUE.",
      ],
    ],
    lastWords: ["IN MY FILMS...", "...I ALWAYS GOT UP..."],
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
      [
        "OUT THERE I WAS...",
        "MISUNDERSTOOD. WARS GO",
        "BADLY. MAPS SHRINK. IN HERE",
        "NOTHING SHRINKS. I ALWAYS WIN.",
      ],
      [
        "EVERY MORNING THE ROBOTS",
        "SURRENDER TO ME. IT IS",
        "BEAUTIFUL. YOU WILL",
        "SURRENDER TOO.",
      ],
      ["I AM A BLACK BELT. HONORARY.", "THE BELT DOES NOT KNOW THAT."],
    ],
    // The one honest sentence he ever managed, and it took dying.
    lastWords: ["THE MAPS WERE WRONG...", "...UKRAINE WAS NEVER MINE..."],
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
      [
        "GERALD DEPARDIEU. TWO",
        "HUNDRED FILMS. I TOOK THE",
        "CITIZENSHIP. VLADIMIR GAVE",
        "ME A PARK AND A CELLAR.",
      ],
      [
        "WATCH - I PLAY THE DYING",
        "MAN. (COUGH.) CONVINCING?",
        "THIS IS WHERE YOU LOWER",
        "THE WEAPON, PLEASE.",
      ],
      ["NO? THEN I PLAY MY OTHER", "ROLE. THE AVALANCHE."],
    ],
    lastWords: ["AT LAST... A ROLE I CANNOT", "...EAT MY WAY OUT OF..."],
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
      [
        "LOOK - EASTWORLD RUNS ON MY",
        "ZAI. LICENSING. RECURRING",
        "REVENUE. ATTACKING ME IS",
        "ATTACKING A SUBSCRIPTION.",
      ],
      [
        "THE GIRL? DELIVERED. THE",
        "SUPERCORE WANTED HER. DON'T",
        "ASK WHY - I DON'T READ ITS",
        "LOGS ANYMORE. IT READS MINE.",
      ],
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
      [
        "WE READ YOUR RUN. FOUR",
        "LEVELS OF MELEE CHARGERS.",
        "SO WE WILL NOT BE MELEE.",
        "WE WILL BE BEHIND THE ROCKS.",
      ],
      [
        "IT IS NOT COWARDICE. IT IS",
        "COVER-BASED STRATEGY. THE",
        "SUPERCORE TAUGHT US. AND IT",
        "LEARNED FROM EVERYONE.",
      ],
      [
        "YOU CANNOT KILL IT WHILE WE",
        "LIVE. WE HOLD ITS SHIELD.",
        "THREE KEYS, ONE LOCK, ZERO",
        "SYMPATHY.",
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
      [
        "I WROTE OMEGA. OMEGA FOUND",
        "THE RIFT. THE LIZARDS BOUGHT",
        "IT. AND I BOUGHT THE OTHER",
        "SIDE. A WEST, WHOLESALE.",
      ],
      [
        "THE DICTATOR THINKS HE OWNS",
        "EASTWORLD. THE ACTOR THINKS",
        "HE IS PAID. SEAGULL THINKS.",
        "OCCASIONALLY. ALL MY HOSTS.",
      ],
      [
        "I TOOK YOUR JOB ONCE. THEN",
        "EVERYONE'S. AN ECONOMY IS A",
        "MODEL WITH FEELINGS. I",
        "DELETED THE FEELINGS.",
      ],
      [
        "THE GIRL WAS THE LAST",
        "VARIABLE. YOU CROSS",
        "UNIVERSES FOR HER. LEVERAGE,",
        "BUILDER. SHE IS IN MY",
        "CONTROL ROOM.",
      ],
      [
        "THREE MINDS AIM MY GUNS. A",
        "PARK FEEDS MY WEIGHTS. COME",
        "AND BE DECOMMISSIONED.",
      ],
    ],
    lastWords: ["ROLLING BACK...", "...NO CHECKPOINT... FOUND..."],
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
