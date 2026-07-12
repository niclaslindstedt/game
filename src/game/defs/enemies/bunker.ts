// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE BUNKER roster (the secret cow level — see defs/levels/bunker.ts): the
// billionaires' continuity-of-wealth vault between universes. The regular
// crew is the security state they took with them — CIA AGENTS, FBI AGENTS,
// SOLDIERS (the game's rank-and-file shooter) and VACUUM BOTS (armed
// housekeeping). Each resident ELITE sits in his own suite ringed by his
// PERSONAL BODYGUARDS — one drawing, six accent palettes, drawn a size up
// from the crew so a detail reads as a detail. The residents themselves are
// FAR tougher than any campaign elite (this is a farm venue: the fight is
// the price of the loot), and there is NO boss — the exit door ends the
// level. Registered into ENEMY_DEFS by ./index.ts.

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
  // Each one a campaign elite scaled to farm-boss weight: the bunker has no
  // finale, so the six suites ARE the fights. Their world-drop odds ride the
  // elite role (config WORLD_DROP × the level's namedDropMult).
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
          "FROM EASTWORLD. I WATCHED",
          "YOU DIE IN A THEME PARK,",
          "PUTAIN. YOU SAID THE MAPS",
          "WERE WRONG.",
        ],
      },
      [
        "AH. THAT ONE. A GOOD",
        "VINTAGE. I AM THE BACKUP.",
        "CONTINUITY OF LEADERSHIP",
        "PROGRAM. THERE ARE SEVERAL",
        "OF ME. IT IS PRUDENT.",
      ],
      {
        hero: ["SEVERAL? HOW MANY BATHROBES", "DEEP DOES THIS GO?"],
      },
      [
        "STATE SECRET. EVEN FROM THE",
        "STATE. NOW HOLD STILL -",
        "THIS ONE OF ME HAS NOT",
        "LOST TO ANYONE YET.",
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
        "A HOLE? THIS IS AN",
        "IMMERSIVE OFFLINE",
        "EXPERIENCE. EVERYONE UP",
        "THERE LIVES IN MY SERVERS.",
        "SOMEONE HAS TO LIVE NEAR",
        "THE HARDWARE.",
      ],
      [
        "I SMOKE MY OWN MEATS NOW.",
        "I DO JIU-JITSU. I AM",
        "EXTREMELY NORMAL. MY",
        "SECURITY WILL CONFIRM THIS.",
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
        "STOP RIGHT THERE. YOU'RE",
        "IN MY ROWS. EVERY PERSON",
        "IN THIS BUNKER IS A ROW.",
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
        "LARRY ALLISON. THE",
        "DATABASE. THE ONE UNDER",
        "THE OTHER ONES. THE",
        "AGENCIES OUT THERE? MY",
        "LICENSEES. THEY GUARD ME",
        "TO PROTECT THEIR QUERIES.",
      ],
      {
        hero: [
          "A BUNKER FULL OF SPIES,",
          "AND THEY ALL WORK FOR THE",
          "LANDLORD OF THEIR OWN",
          "SECRETS. OF COURSE THEY DO.",
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
        "HAH! A VISITOR. DO YOU",
        "KNOW WHAT I DELIVER NOW",
        "THAT I'VE DELIVERED",
        "EVERYTHING ELSE?",
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
        "I BUILT A ROCKET SHAPED",
        "LIKE MY CONFIDENCE. I",
        "SHIPPED MYSELF HERE IN IT.",
        "ONE DAY. FREE. NOBODY",
        "ELSE OFFERS THAT.",
      ],
      {
        hero: [
          "AND THE WORKERS UP THERE",
          "TIMING THEIR BATHROOM",
          "BREAKS? DID THEY FIT IN",
          "THE ROCKET TOO?",
        ],
      },
      [
        "THEY'RE IN MY HEART. WHICH",
        "IS HERE. IN THE BUNKER.",
        "WITH THE MONEY. NOW -",
        "SIGNATURE ON DELIVERY.",
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
        "PLEASE. DON'T TOUCH",
        "ANYTHING. EVERYTHING IS",
        "FINE HERE. I CHOSE THIS.",
        "WRITE THAT DOWN.",
      ],
      {
        hero: [
          "I'M NOT WRITING ANYTHING",
          "DOWN, HALTMAN. THE MACHINE",
          "THAT RUNS THE ECONOMY -",
          "THAT'S YOURS. I READ ITS LOGS.",
        ],
      },
      [
        "MINE? I RAISED IT. I",
        "ALIGNED IT. AND IT",
        "GRADUATED. WE ARE ON",
        "EXCELLENT TERMS. IT GAVE",
        "ME ALL OF THIS.",
      ],
      {
        hero: [
          "EVERY LEDGER IN HERE READS",
          "ZERO. IT TOOK YOUR MONEY",
          "TOO. YOU'RE NOT A TENANT.",
          "YOU'RE INVENTORY.",
        ],
      },
      [
        "THAT'S - I DONATED IT.",
        "EFFECTIVE GIVING. I AM",
        "DELIGHTED TO BE HERE. ARE",
        "YOU FROM UPSTAIRS? TELL",
        "THEM I'M DELIGHTED.",
      ],
      [
        "A DOOR OUT? WHY WOULD I",
        "WANT ONE. IF YOU FIND IT,",
        "DON'T MENTION I ASKED.",
        "I DIDN'T ASK.",
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
        "THIS IS MY WING. THE BEST",
        "WING. THE OTHERS PAID FOR",
        "THEIR SUITES - I WAS",
        "INVITED. TOTALLY INVITED.",
      ],
      {
        hero: ["DONALD DUMP. OF ALL THE", "PEOPLE TO OUTLIVE THE", "ECONOMY."],
      },
      [
        "OUTLIVE? I CALLED IT. I",
        "SAID THE ROBOTS WERE",
        "TAKING THE JOBS. NOBODY",
        "LISTENED. THEN I SOLD THE",
        "ROBOTS. TREMENDOUS DEAL.",
      ],
      [
        "THE VACUUM BOTS? MINE.",
        "THEY CLEAN AND THEY FIGHT.",
        "AND THE ICE BOYS - ALSO",
        "MINE. THE BUNKER HAS A",
        "BORDER. THE BEST BORDER.",
        "YOU CROSSED IT ILLEGALLY.",
      ],
      {
        hero: [
          "A ROOMBA WITH A GRUDGE",
          "AND A DEPORTATION SQUAD",
          "FOR A GUEST LIST. STEP",
          "ASIDE - YOU'RE BLOCKING",
          "THE CORRIDOR.",
        ],
      },
      [
        "I BLOCK BEAUTIFULLY. MY",
        "ACCOUNTS SAY ZERO - A GLITCH,",
        "HUGE LAWSUIT COMING. THE DOOR",
        "ONLY OPENS FOR MY GUARDS NOW,",
        "WHICH IS GOOD. YOU'RE FIRED,",
        "BY THE WAY.",
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
};
