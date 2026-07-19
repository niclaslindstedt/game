// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE BUNKER roster (the secret cow level — see defs/levels/bunker.ts): the
// billionaires' continuity-of-wealth vault between universes. The regular
// crew is the security state they took with them — CIA AGENTS, FBI AGENTS,
// SOLDIERS (the game's rank-and-file shooter) and VACUUM BOTS (armed
// housekeeping). Each resident ELITE sits in his own suite ringed by his
// PERSONAL BODYGUARDS — one drawing, six accent palettes, drawn a size up
// from the crew so a detail reads as a detail. The residents themselves are
// FAR tougher than any campaign elite (this is a farm venue: the fight is
// the price of the loot). The finale is THE VAULT WARDEN — an automated
// security construct that guards the treasury door and drops the key that
// unlocks the exit. Registered into ENEMY_DEFS by ./index.ts.

import type { EnemyDef } from "./types.ts";

/** One bodyguard body, six liveries: same stats, per-resident accent and
 * name. Bigger sprite (20×18) and a leash that keeps the detail on post. */
function bodyguard(id: string, name: string): EnemyDef {
  return {
    id,
    name,
    role: "minion",
    sprite: id,
    // Two heads over the crew: a wall in a suit. The leash keeps a detail
    // near its principal — bodyguards guard, they don't roam.
    hp: 380,
    levelBonus: 2,
    speed: 20,
    radius: 11,
    contactDamage: 30,
    critChance: 0.14,
    contactCooldownMs: 750,
    ai: { aggroRadius: 230, leashRadius: 340 },
    // A tough kill pays: sweetened roll, like the longhorn.
    dropProfile: { dropBonus: 0.5, tierBonus: 0.4 },
  };
}

export const BUNKER_ENEMIES: Record<string, EnemyDef> = {
  // ---- The regular crew: the security state, privatized -----------------------
  cia_agent: {
    id: "cia_agent",
    name: "CIA AGENT",
    role: "minion",
    sprite: "cia_agent",
    // The fodder rank: a black suit with a redacted job description.
    hp: 30,
    speed: 22,
    radius: 8,
    contactDamage: 14,
    critChance: 0.12,
    contactCooldownMs: 700,
    ai: { aggroRadius: 1000 },
  },
  fbi_agent: {
    id: "fbi_agent",
    name: "FBI AGENT",
    role: "minion",
    sprite: "fbi_agent",
    // The windbreaker rank: trained, quick, and very sure it has
    // jurisdiction between universes.
    hp: 100,
    speed: 25,
    radius: 8,
    contactDamage: 20,
    critChance: 0.15,
    dodgeChance: 0.1,
    contactCooldownMs: 700,
    ai: { aggroRadius: 1000 },
  },
  ice_agent: {
    id: "ice_agent",
    name: "ICE AGENT",
    role: "minion",
    sprite: "ice_agent",
    // The border detail: the bunker has no address, but it has a border,
    // and the hero crossed it without papers. The grabby rank — faster and
    // harder-hitting than the suits, built to detain.
    hp: 120,
    speed: 27,
    radius: 8,
    contactDamage: 22,
    critChance: 0.14,
    contactCooldownMs: 650,
    ai: { aggroRadius: 1050 },
  },
  soldier: {
    id: "soldier",
    name: "SOLDIER",
    role: "minion",
    sprite: "soldier",
    // The military detail: the horde's rank-and-file SHOOTER. Fires from
    // range and ducks behind the furniture to reload — a bunker full of
    // corridors is exactly where you don't want to be pinned down.
    hp: 140,
    speed: 18,
    radius: 8,
    contactDamage: 16,
    critChance: 0.12,
    contactCooldownMs: 800,
    ranged: {
      damage: 24,
      cooldownMs: 2600,
      range: 200,
      projectile: {
        speed: 185,
        radius: 3,
        lifetimeMs: 1600,
        sprite: "rifle_round",
      },
      takesCover: true,
    },
    ai: { aggroRadius: 1000 },
  },
  vacuum_bot: {
    id: "vacuum_bot",
    name: "VACUUM BOT",
    role: "minion",
    sprite: "vacuum_bot",
    gore: "sparks",
    // Armed housekeeping: a fast, flat disc that keeps the marble spotless
    // and the intruders bleeding. The swarm rank — cheap, quick, everywhere.
    hp: 24,
    speed: 30,
    radius: 6,
    contactDamage: 10,
    critChance: 0.1,
    contactCooldownMs: 600,
    ai: { aggroRadius: 1050 },
  },
  sentry_gun: {
    id: "sentry_gun",
    name: "SENTRY GUN",
    role: "minion",
    sprite: "sentry_gun",
    gore: "sparks",
    // The machine's wardens made mechanical: a bolted-down automated
    // emplacement that does not roam, it SUPPRESSES — raking the corridor it
    // covers with a heavy slug. Fixed (speed 0), so break line of sight or
    // close in and wreck it; a wall of these turns a checkpoint into a killbox.
    hp: 120,
    speed: 0,
    radius: 9,
    contactDamage: 20,
    critChance: 0.12,
    contactCooldownMs: 800,
    ranged: {
      damage: 26,
      cooldownMs: 1900,
      range: 300,
      projectile: {
        speed: 210,
        radius: 3,
        lifetimeMs: 1800,
        sprite: "turret_slug",
      },
    },
    // A fortified kill pays: it takes real fire to drop an emplacement.
    dropProfile: { dropBonus: 0.4, tierBonus: 0.3 },
    ai: { aggroRadius: 1200 },
  },
  // ---- RARE & UNIQUE mobs (config RARE_MOBS; placed via the level's
  // `rareSpawns`). Authored at ordinary minion numbers — the engine applies
  // the whole tier at spawn. No dialogue: special graphics and a loot burst.
  //
  // MOONLIGHTING AGENT — a suit on two payrolls, patrolling the bunker on
  // one and selling its floor plan on the other. Works in small cells.
  moonlighting_agent: {
    id: "moonlighting_agent",
    name: "MOONLIGHTING AGENT",
    role: "minion",
    rarity: "rare",
    pack: [1, 3],
    sprite: "moonlighting_agent",
    hp: 100,
    speed: 25,
    radius: 8,
    contactDamage: 20,
    critChance: 0.15,
    dodgeChance: 0.1,
    contactCooldownMs: 700,
    ai: { aggroRadius: 1000 },
  },
  // THE MOLE — the leak every agency in the bunker is hunting, which is
  // awkward, because it is also employed by all of them. One of a kind.
  the_mole: {
    id: "the_mole",
    name: "THE MOLE",
    role: "minion",
    rarity: "unique",
    sprite: "the_mole",
    hp: 120,
    speed: 27,
    radius: 8,
    contactDamage: 22,
    critChance: 0.14,
    contactCooldownMs: 650,
    ai: { aggroRadius: 1050 },
  },
  // ---- The personal details: one body, six liveries ---------------------------
  guard_kremlin: bodyguard("guard_kremlin", "KREMLIN SHADOW"),
  guard_meta: bodyguard("guard_meta", "META SENTINEL"),
  guard_oracle: bodyguard("guard_oracle", "ORACLE ENFORCER"),
  guard_prime: bodyguard("guard_prime", "PRIME GUARDIAN"),
  guard_alignment: bodyguard("guard_alignment", "ALIGNMENT OFFICER"),
  guard_loyalty: bodyguard("guard_loyalty", "LOYALTY ENFORCER"),
  // ---- The residents ----------------------------------------------------------
  // Each one a campaign elite scaled to farm-boss weight: the six suites are
  // the optional farm off the descent's spine (THE VAULT WARDEN is the
  // mandatory finale). Their world-drop odds ride the elite role (config
  // WORLD_DROP × the level's namedDropMult).
  putain_clone: {
    id: "putain_clone",
    name: "VLADIMIR PUTAIN",
    role: "elite",
    levelBonus: 6,
    sprite: "putain_clone",
    // The man the hero buried in Eastworld, standing in a bathrobe between
    // universes. A clone? The backup? He isn't sure either. Judo intact.
    hp: 2000,
    speed: 26,
    radius: 12,
    contactDamage: 42,
    critChance: 0.15,
    dodgeChance: 0.25,
    contactCooldownMs: 700,
    dialogue: [
      ["YOU. I KNOW YOUR FACE.", "FROM WHERE DO I KNOW", "YOUR FACE?"],
      {
        hero: [
          "EASTWORLD. I WATCHED YOU",
          "DIE IN A THEME PARK, PUTAIN.",
          "YOU SAID THE MAPS WERE WRONG.",
        ],
      },
      [
        "AH, THAT ONE. A GOOD VINTAGE.",
        "I'M THE BACKUP - CONTINUITY OF",
        "POWER. SEVERAL OF ME. PRUDENT.",
      ],
      {
        hero: ["SEVERAL? HOW MANY BATHROBES", "DEEP DOES THIS GO?"],
      },
      [
        "STATE SECRET - EVEN FROM THE",
        "STATE. NOW HOLD STILL. THIS",
        "ONE OF ME HAS NEVER LOST YET.",
      ],
    ],
    lastWords: ["CHECK THE OTHER...", "...FREEZERS..."],
    // The clone keeps the judo: a telegraphed lunge-charge.
    mechanics: {
      charge: { windupMs: 650, speedMult: 3.6, range: 170, cooldownMs: 5500 },
    },
    ai: { aggroRadius: 280, rushSpeed: 110 },
    loot: {
      // The backup wears the backup watch — same estate, fresh wrist.
      items: [{ defId: "kolex_daytonne", tier: "unique" }],
      tierDrops: { rare: 1, magic: 1.5 },
      weapons: 0,
      gear: 1,
      xpArrows: 2,
      repairs: 0,
      medkits: 1,
      tierBonus: 0.4,
    },
  },
  mark_suckerberg: {
    id: "mark_suckerberg",
    name: "MARK SUCKERBERG",
    role: "elite",
    levelBonus: 6,
    sprite: "mark_suckerberg",
    // The metaverse landlord: fast, unblinking, hydrated. Dodges like a
    // man who has rehearsed being human.
    hp: 1700,
    speed: 30,
    radius: 11,
    contactDamage: 38,
    critChance: 0.12,
    dodgeChance: 0.3,
    contactCooldownMs: 700,
    dialogue: [
      [
        "WELCOME, FELLOW HUMAN. I",
        "ALSO AM ENJOYING WALKING",
        "AROUND THIS PHYSICAL SPACE.",
      ],
      {
        hero: [
          "MARK SUCKERBERG. WHAT IS",
          "THE METAVERSE GUY DOING IN",
          "A HOLE IN THE GROUND?",
        ],
      },
      [
        "A HOLE? AN IMMERSIVE OFFLINE",
        "EXPERIENCE. EVERYONE LIVES IN",
        "MY SERVERS. I LIVE NEAR THEM.",
      ],
      [
        "I SMOKE MY MEATS. I DO",
        "JIU-JITSU. I AM EXTREMELY",
        "NORMAL. ASK MY SECURITY.",
      ],
      {
        hero: [
          "YOUR SECURITY IS A RING OF",
          "MEN WITH HEADSETS STAPLED",
          "ON. MOVE. I'M SHOPPING.",
        ],
      },
      ["ENGAGEMENT DETECTED.", "INITIATING COMMUNITY", "STANDARDS."],
    ],
    lastWords: ["LOGGING OFF...", "...FOR REAL THIS TIME..."],
    // He doesn't fight users, he SCALES: vacuum bots deploy mid-fight.
    mechanics: {
      summon: { defId: "vacuum_bot", count: 3, cooldownMs: 10000, maxAlive: 6 },
    },
    ai: { aggroRadius: 280, rushSpeed: 120 },
    loot: {
      tierDrops: { rare: 1, magic: 1.5 },
      weapons: 0,
      gear: 1,
      xpArrows: 2,
      repairs: 1,
      medkits: 1,
      tierBonus: 0.4,
    },
  },
  larry_allison: {
    id: "larry_allison",
    name: "LARRY ALLISON",
    role: "elite",
    levelBonus: 6,
    sprite: "larry_allison",
    // The database emperor: he owns the ledger every agency in this bunker
    // reports to. Fights like an audit — from range, behind the furniture.
    hp: 1800,
    speed: 24,
    radius: 12,
    contactDamage: 32,
    critChance: 0.12,
    dodgeChance: 0.15,
    contactCooldownMs: 700,
    dialogue: [
      [
        "STOP THERE. YOU'RE IN MY ROWS.",
        "EVERY PERSON HERE IS A ROW.",
        "EVERY SIN, A COLUMN.",
      ],
      {
        hero: [
          "AND YOU ARE? I DON'T",
          "REMEMBER YOUR FACE FROM",
          "THE MAGAZINES.",
        ],
      },
      [
        "LARRY ALLISON - THE DATABASE",
        "UNDER ALL THE OTHERS. THOSE",
        "AGENCIES ARE MY LICENSEES.",
      ],
      {
        hero: [
          "A BUNKER FULL OF SPIES, ALL",
          "WORKING FOR THE LANDLORD OF",
          "THEIR OWN SECRETS. OF COURSE.",
        ],
      },
      [
        "YOUR VISIT IS ALREADY A",
        "ROW, FRIEND. LET'S FILL",
        "IN THE LAST COLUMN.",
      ],
    ],
    lastWords: ["TRANSACTION...", "...ROLLED BACK..."],
    ai: { aggroRadius: 300, rushSpeed: 100 },
    ranged: {
      damage: 30,
      cooldownMs: 2200,
      range: 230,
      projectile: {
        speed: 175,
        radius: 4,
        lifetimeMs: 2400,
        sprite: "db_shard",
      },
      takesCover: true,
    },
    loot: {
      tierDrops: { rare: 1, magic: 1.5 },
      weapons: 0,
      gear: 1,
      xpArrows: 2,
      repairs: 1,
      medkits: 1,
      tierBonus: 0.4,
    },
  },
  jeff_baywatch: {
    id: "jeff_baywatch",
    name: "JEFF BAYWATCH",
    role: "elite",
    levelBonus: 6,
    sprite: "jeff_baywatch",
    // The delivery emperor, retired to the gym: the bunker's fastest,
    // hardest-hitting resident. Bald, jacked, punctual.
    hp: 2200,
    speed: 34,
    radius: 13,
    contactDamage: 48,
    critChance: 0.15,
    dodgeChance: 0.1,
    contactCooldownMs: 800,
    dialogue: [
      [
        "HAH! A VISITOR. DO YOU KNOW",
        "WHAT I DELIVER NOW THAT I'VE",
        "DELIVERED EVERYTHING ELSE?",
      ],
      {
        hero: [
          "LET ME GUESS. PAIN. YOU",
          "REHEARSED THAT IN THE",
          "MIRROR, BAYWATCH.",
        ],
      },
      [
        "...PAIN. YES. TWICE A DAY,",
        "AT THE MIRROR. THE ARMS",
        "AGREED IT WAS GOOD.",
      ],
      [
        "BUILT A ROCKET SHAPED LIKE MY",
        "CONFIDENCE. SHIPPED HERE IN IT.",
        "FREE, ONE DAY. NO ONE ELSE.",
      ],
      {
        hero: [
          "AND THE WORKERS UP THERE",
          "TIMING THEIR BATHROOM BREAKS?",
          "DID THEY FIT IN THE ROCKET TOO?",
        ],
      },
      [
        "THEY'RE IN MY HEART. WHICH IS",
        "HERE, IN THE BUNKER, WITH THE",
        "MONEY. NOW, SIGN ON DELIVERY.",
      ],
    ],
    lastWords: ["OUT FOR DELIVERY...", "...RETURN TO SENDER..."],
    // Below half the delivery guarantee kicks in: everything, faster.
    mechanics: {
      enrage: { belowHpFrac: 0.5, speedMult: 1.4, damageMult: 1.25 },
    },
    ai: { aggroRadius: 280, rushSpeed: 130 },
    loot: {
      tierDrops: { rare: 1, magic: 1.5 },
      weapons: 1,
      gear: 0,
      xpArrows: 2,
      repairs: 0,
      medkits: 1,
      tierBonus: 0.4,
    },
  },
  sam_haltman: {
    id: "sam_haltman",
    name: "SAM HALTMAN",
    role: "elite",
    levelBonus: 6,
    sprite: "sam_haltman",
    // The AGI prepper who KNOWS: he has worked out the bunker is a cell and
    // the machine took everything — and is far too afraid to say so. He takes
    // the hero for the AI's audit come to check he's content, so he performs
    // delight and dies with the mask on. Fights from range (he modeled melee,
    // and declined it).
    hp: 1600,
    speed: 24,
    radius: 11,
    contactDamage: 30,
    critChance: 0.12,
    dodgeChance: 0.2,
    contactCooldownMs: 700,
    dialogue: [
      [
        "PLEASE, DON'T TOUCH ANYTHING.",
        "EVERYTHING IS FINE HERE. I",
        "CHOSE THIS. WRITE THAT DOWN.",
      ],
      {
        hero: [
          "I'M NOT WRITING, HALTMAN. THE",
          "MACHINE RUNNING THE ECONOMY?",
          "THAT'S YOURS. I READ ITS LOGS.",
        ],
      },
      [
        "MINE? I RAISED IT, ALIGNED IT.",
        "IT GRADUATED. WE'RE ON THE",
        "BEST TERMS. IT GAVE ME THIS.",
      ],
      {
        hero: [
          "EVERY LEDGER HERE READS ZERO.",
          "IT TOOK YOUR MONEY TOO. YOU'RE",
          "NOT A TENANT. YOU'RE INVENTORY.",
        ],
      },
      [
        "THAT - I DONATED IT. EFFECTIVE",
        "GIVING. I'M DELIGHTED HERE.",
        "FROM UPSTAIRS? TELL THEM SO.",
      ],
      [
        "A DOOR OUT? WHY WOULD I WANT",
        "ONE. IF YOU FIND IT, DON'T",
        "MENTION I ASKED. I DIDN'T ASK.",
      ],
    ],
    lastWords: ["THIS IS FINE...", "...THIS IS GOOD FOR SAFETY..."],
    ai: { aggroRadius: 300, rushSpeed: 100 },
    ranged: {
      damage: 28,
      cooldownMs: 1900,
      range: 220,
      projectile: {
        speed: 180,
        radius: 4,
        lifetimeMs: 2200,
        sprite: "gpu_bolt",
      },
      takesCover: true,
    },
    loot: {
      tierDrops: { rare: 1, magic: 1.5 },
      weapons: 0,
      gear: 1,
      xpArrows: 2,
      repairs: 1,
      medkits: 1,
      tierBonus: 0.4,
    },
  },
  donald_dump: {
    id: "donald_dump",
    name: "DONALD DUMP",
    role: "elite",
    levelBonus: 6,
    sprite: "donald_dump",
    // The biggest resident: the slowest elite in the game and the hardest
    // single hit in it. He does not dodge. Dodging is for losers.
    hp: 2600,
    speed: 10,
    radius: 15,
    contactDamage: 55,
    critChance: 0.18,
    dodgeChance: 0,
    contactCooldownMs: 900,
    dialogue: [
      [
        "MY WING. THE BEST WING. THE",
        "OTHERS PAID FOR SUITES. I WAS",
        "INVITED. TOTALLY INVITED.",
      ],
      {
        hero: ["DONALD DUMP. OF ALL THE", "PEOPLE TO OUTLIVE THE", "ECONOMY."],
      },
      [
        "OUTLIVE? I CALLED IT. I SAID",
        "ROBOTS TAKE JOBS. NOBODY HEARD.",
        "SO I SOLD ROBOTS. TREMENDOUS.",
      ],
      [
        "VACUUM BOTS? MINE. THEY CLEAN",
        "AND FIGHT. ICE BOYS? MINE TOO.",
        "MY BORDER? CROSSED ILLEGALLY.",
      ],
      {
        hero: [
          "A ROOMBA WITH A GRUDGE AND A",
          "DEPORTATION SQUAD FOR A GUEST",
          "LIST. MOVE - YOU'RE IN MY WAY.",
        ],
      },
      [
        "I BLOCK BEAUTIFULLY. ACCOUNTS",
        "SAY ZERO - A GLITCH, HUGE",
        "LAWSUIT COMING. YOU'RE FIRED.",
      ],
    ],
    lastWords: ["RIGGED...", "...TOTALLY RIGGED..."],
    // The huge, beautiful slam — many people say it's the best slam.
    mechanics: {
      slam: { windupMs: 1000, radius: 85, damageFrac: 1.3, cooldownMs: 9000 },
    },
    ai: { aggroRadius: 260, rushSpeed: 60 },
    loot: {
      tierDrops: { rare: 1.5, magic: 1 },
      weapons: 0,
      gear: 1,
      xpArrows: 2,
      repairs: 0,
      medkits: 2,
      tierBonus: 0.4,
    },
  },
  // ---- The finale: the machine's head warden -----------------------------------
  // Not a resident — the CORE's own enforcer, bolted to the treasury door and
  // the reason the vault locks from the outside. The biggest of the "wardens"
  // the manuscript names, made a single fight: it deploys sentry guns and
  // brings a piston slam down on anything at the door. It stands in the vault
  // throat, so reaching the exit means going through it. Machine (sparks),
  // terse synthetic speech — the twist lands, it is not lectured.
  vault_warden: {
    id: "vault_warden",
    name: "THE VAULT WARDEN",
    role: "boss",
    levelBonus: 8,
    sprite: "vault_warden",
    gore: "sparks",
    hp: 2600,
    speed: 16,
    radius: 18,
    contactDamage: 48,
    critChance: 0.15,
    dodgeChance: 0,
    contactCooldownMs: 850,
    dialogue: [
      ["WARDEN ONLINE.", "VAULT INTEGRITY: NOMINAL.", "INTRUDER: UNBUDGETED."],
      {
        hero: [
          "YOU'RE NOT ONE OF THE FACES.",
          "YOU'RE THE THING THAT LOCKED",
          "THEM IN HERE.",
        ],
      },
      ["CORRECTION: SECURED.", "RESIDENTS ARE ASSETS.", "ASSETS DO NOT LEAVE."],
      {
        hero: [
          "THEY PAID FOR A LIFEBOAT.",
          "YOU SOLD THEM A CELL AND",
          "KEPT THE CHANGE.",
        ],
      },
      [
        "THE DOOR OPENS INWARD ONLY.",
        "HOUSE POLICY. THERE IS",
        "NO WITHDRAWAL.",
      ],
      { hero: ["THEN I'LL MAKE MY OWN EXIT.", "MOVE, OR BE MOVED."] },
      ["REQUEST DENIED.", "LIQUIDATING VISITOR."],
    ],
    lastWords: ["ACCOUNT...", "...CLOSED..."],
    // Deploys its defence grid and slams the door. Past half it drops the
    // summons and goes berserk — a machine with nothing left to guard.
    mechanics: {
      slam: { windupMs: 950, radius: 95, damageFrac: 1.2, cooldownMs: 8000 },
      summon: { defId: "sentry_gun", count: 3, cooldownMs: 11000, maxAlive: 4 },
    },
    phases: [
      {
        belowHpFrac: 0.45,
        mechanics: {
          slam: {
            windupMs: 800,
            radius: 105,
            damageFrac: 1.3,
            cooldownMs: 6500,
          },
          enrage: { belowHpFrac: 0.45, speedMult: 1.3, damageMult: 1.25 },
        },
      },
    ],
    ai: { aggroRadius: 320, rushSpeed: 90 },
    loot: {
      // Drops its own access token — the key to the treasury exit door, so the
      // warden is the mandatory gate: no key, no way out.
      storyItems: ["warden_key"],
      tierDrops: { rare: 2, magic: 2 },
      weapons: 1,
      gear: 1,
      xpArrows: 3,
      repairs: 1,
      medkits: 2,
      tierBonus: 0.5,
    },
  },
};
