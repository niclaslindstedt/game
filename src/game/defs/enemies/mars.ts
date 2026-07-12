// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Mars (level 3) roster: the secret colony's machines — scout and mining
// rovers working the dust outside, servo units and the FEMBOT companion line
// inside the base — three tech-billionaire colonists who bought their way off
// Earth (elites: LARRY WEBPAGE, BUILD GATES, PETER SEAL) plus OPTIMUSK PRIME,
// the robot foreman orchestrating the OPTIMUSK line, and ELON MOSQUE,
// the man who owns the planet (boss). He is
// the game's first FLEEING unique: beaten down, he cowers, reveals what Ada
// was traded for, and zaps out through a rift instead of dying. Registered
// into ENEMY_DEFS by ./index.ts.

import type { EnemyDef } from "./types.ts";

export const MARS_ENEMIES: Record<string, EnemyDef> = {
  // Minion speeds sit below the player's walk, same standing rule as every
  // level: the colony's machines are a tide to route around, not a footrace.
  // Numbers run a notch over the moon tier — this is level 3.
  scout_rover: {
    id: "scout_rover",
    name: "SCOUT ROVER",
    role: "minion",
    sprite: "scout_rover",
    gore: "sparks",
    // The fodder rank: a camera on wheels that evaporates on contact.
    hp: 14,
    speed: 18,
    radius: 8,
    contactDamage: 8,
    critChance: 0.1,
    contactCooldownMs: 700,
    ai: { aggroRadius: 950 },
  },
  servo_bot: {
    id: "servo_bot",
    name: "SERVO UNIT",
    role: "minion",
    sprite: "servo_bot",
    gore: "sparks",
    // The base's staff robot — the colony runs on these instead of workers.
    hp: 60,
    speed: 17,
    radius: 8,
    contactDamage: 15,
    critChance: 0.1,
    contactCooldownMs: 700,
    ai: { aggroRadius: 950 },
  },
  fembot: {
    id: "fembot",
    name: "FEMBOT",
    role: "minion",
    sprite: "fembot",
    gore: "sparks",
    // The companion line LARRY WEBPAGE ships with every dome: quick on its
    // heels and swinging with a high crit — the kiss is the weapon.
    hp: 85,
    speed: 24,
    radius: 8,
    contactDamage: 17,
    critChance: 0.18,
    contactCooldownMs: 700,
    ai: { aggroRadius: 1000 },
  },
  mining_rover: {
    id: "mining_rover",
    name: "MINING ROVER",
    role: "minion",
    sprite: "mining_rover",
    gore: "sparks",
    // The outdoor heavy: a drill rig on treads. Slow enough to sidestep,
    // brutal to touch, and — like the OPTIMUSK line — worth going out of the
    // way to drop for its sweetened roll.
    hp: 210,
    speed: 10,
    radius: 11,
    contactDamage: 32,
    critChance: 0.14,
    contactCooldownMs: 750,
    ai: { aggroRadius: 1000 },
    dropProfile: { dropBonus: 0.4, tierBonus: 0.3 },
  },
  // ---- RARE & UNIQUE mobs (config RARE_MOBS; placed via the level's
  // `rareSpawns`). Authored at ordinary minion numbers — the engine applies
  // the whole tier at spawn. No dialogue: special graphics and a loot burst.
  //
  // MISPRINTED FEMBOT — a bad batch off the companion line, glitch-green and
  // still smiling. Escaped the recycler as a small malfunctioning cohort.
  misprinted_fembot: {
    id: "misprinted_fembot",
    name: "MISPRINTED FEMBOT",
    role: "minion",
    rarity: "rare",
    pack: [2, 4],
    sprite: "misprinted_fembot",
    gore: "sparks",
    hp: 60,
    speed: 24,
    radius: 8,
    contactDamage: 15,
    critChance: 0.18,
    contactCooldownMs: 700,
    ai: { aggroRadius: 1000 },
  },
  // DERELICT ROVER — the mission that "lost contact" in the 90s, rusted to
  // the axles and still following its last order. Always alone.
  derelict_rover: {
    id: "derelict_rover",
    name: "DERELICT ROVER",
    role: "minion",
    rarity: "rare",
    sprite: "derelict_rover",
    gore: "sparks",
    hp: 90,
    speed: 14,
    radius: 9,
    contactDamage: 18,
    critChance: 0.12,
    contactCooldownMs: 700,
    ai: { aggroRadius: 950 },
  },
  // UNIT ZERO — the first robot SpaceZ ever printed, obsolete for decades
  // and never decommissioned. Antique brass, original firmware, a grudge.
  unit_zero: {
    id: "unit_zero",
    name: "UNIT ZERO",
    role: "minion",
    rarity: "unique",
    sprite: "unit_zero",
    gore: "sparks",
    hp: 85,
    speed: 18,
    radius: 9,
    contactDamage: 20,
    critChance: 0.12,
    contactCooldownMs: 700,
    ai: { aggroRadius: 1000 },
  },
  // ---- The Mars elites — three tech billionaires who bought their way off
  // Earth, pinned along the walk to MOSQUE so the colony's story unspools in
  // order: the fembot line and its harvest, the moon post-mortem, and the
  // landlords the whole venture actually answers to.
  larry_webpage: {
    id: "larry_webpage",
    name: "LARRY WEBPAGE",
    role: "elite",
    levelBonus: 3,
    sprite: "larry_webpage",
    hp: 260,
    speed: 22,
    radius: 12,
    contactDamage: 22,
    critChance: 0.12,
    contactCooldownMs: 700,
    dialogue: [
      [
        "DON'T BE EVIL. THAT'S FREE",
        "ADVICE. I INDEXED THIS WHOLE",
        "PLANET BEFORE BREAKFAST.",
      ],
      {
        hero: [
          "THEN YOUR INDEX KNOWS WHY I'M",
          "HERE. A GIRL CAME IN ON THE",
          "SPACEZ FREIGHT RUN. WHERE IS SHE?",
        ],
      },
      [
        "I KNOW EXACTLY WHO YOU MEAN.",
        "I KNOW EVERYTHING SAID IN THIS",
        "COLONY. AND THE ANSWER IS NO.",
      ],
      {
        hero: [
          "HOW COULD YOU KNOW EVERYTHING",
          "THAT'S SAID HERE? WHO'S",
          "LISTENING FOR YOU?",
        ],
      },
      [
        "THE FEMBOTS. COMPANION UNITS.",
        "THEY SMILE. THEY LISTEN. AND",
        "THEY UPLOAD EVERY WORD YOU",
        "SAY - STRAIGHT TO ME.",
      ],
    ],
    lastWords: ["404...", "...NOT... FOUND..."],
    ai: { aggroRadius: 250, rushSpeed: 120 },
    loot: {
      items: ["search_bar"],
      tierDrops: { magic: 1, rare: 0.35 },
      storyItems: ["engagement_report"],
      weapons: 0,
      gear: 0,
      xpArrows: 1,
      repairs: 0,
      medkits: 1,
      tierBonus: 0.3,
    },
  },
  build_gates: {
    id: "build_gates",
    name: "BUILD GATES",
    role: "elite",
    levelBonus: 3,
    sprite: "build_gates",
    hp: 250,
    speed: 18,
    radius: 12,
    contactDamage: 22,
    critChance: 0.1,
    contactCooldownMs: 700,
    dialogue: [
      [
        "PLEASE HOLD. YOUR INTRUSION IS",
        "IMPORTANT TO US. HAVE YOU TRIED",
        "TURNING YOURSELF OFF AND ON?",
      ],
      {
        hero: [
          "VERY FUNNY. YOU BUILT THIS",
          "COLONY? I JUST CAME FROM YOUR",
          "LAST ONE. THE MOON IS FULL",
          "OF GHOSTS.",
        ],
      },
      [
        "I WROTE THE COLONY'S OPERATING",
        "SYSTEM. THE MOON RAN VERSION",
        "ONE. IT PLUGGED INTO THE THING",
        "UNDER THE DUST AND...",
      ],
      {
        hero: ["AND IT WOKE THE DEAD. I MET", "THEM. EVERY LAST ONE."],
      },
      [
        "YES. A DISASTER. WE PATCHED IT",
        "BY LEAVING. MARS IS VERSION",
        "TWO - AND VERSION TWO HAS NO",
        "DEAD THINGS UNDER IT. WE CHECKED.",
      ],
    ],
    lastWords: ["FATAL... ERROR...", "WHO WROTE... THIS..."],
    // The compiler crashes DOWN: a telegraphed slam of blue-screen force.
    mechanics: {
      slam: { windupMs: 900, radius: 70, damageFrac: 1.2, cooldownMs: 8000 },
    },
    ai: { aggroRadius: 250, rushSpeed: 110 },
    loot: {
      items: ["blue_screen"],
      tierDrops: { magic: 1, rare: 0.35 },
      storyItems: ["moon_postmortem"],
      weapons: 0,
      gear: 0,
      xpArrows: 1,
      repairs: 1,
      medkits: 1,
      tierBonus: 0.3,
    },
  },
  peter_seal: {
    id: "peter_seal",
    name: "PETER SEAL",
    role: "elite",
    levelBonus: 3,
    sprite: "peter_seal",
    hp: 280,
    speed: 20,
    radius: 12,
    contactDamage: 24,
    critChance: 0.12,
    contactCooldownMs: 700,
    dialogue: [
      [
        "FASCINATING. EVERYONE FLEES",
        "SOMETHING. I FUND WHAT THEY",
        "FLEE TO. AND WHAT THEY FLEE.",
      ],
      {
        hero: [
          "YOU'RE ONE OF THE BILLIONAIRES",
          "WHO BOUGHT A SEAT OFF EARTH.",
          "SO WHO ACTUALLY RUNS THIS",
          "PLACE? MOSQUE?",
        ],
      },
      [
        "MOSQUE THINKS HE OWNS MARS.",
        "HE RENTS IT. THE LANDLORDS ARE",
        "OLDER. SCALED. COLD-BLOODED.",
      ],
      {
        hero: [
          "SCALED? YOU'RE TELLING ME THE",
          "PLANET'S REAL OWNERS ARE...",
          "WHAT, LIZARDS?",
        ],
      },
      [
        "LIZARD GODS. I KEEP THEIR",
        "SHRINE AND COUNT THEIR TITHE.",
        "LATELY THE PRICE WENT UP.",
        "IT WANTS WARM THINGS NOW.",
      ],
    ],
    lastWords: ["THE TITHE... IS DUE...", "...IT'S ALWAYS... DUE..."],
    ai: { aggroRadius: 250, rushSpeed: 115 },
    loot: {
      items: ["contrarian_dagger"],
      tierDrops: { magic: 1, rare: 0.35 },
      // The treasurer keeps the books: the shrine pass AND the passenger
      // ledger of everyone who bought a seat on the lifeboat.
      storyItems: ["keycard_terrarium", "colony_ledger"],
      weapons: 0,
      gear: 1,
      xpArrows: 1,
      repairs: 1,
      medkits: 1,
      tierBonus: 0.3,
    },
  },
  // OPTIMUSK PRIME — the fourth elite: a head taller than the line units it
  // commands, gold-marked and self-satisfied. The AI orchestrator that runs
  // every OPTIMUSK on the colony — automation came for the drivers, the
  // desks, and finally the automators themselves. The hero built its first
  // chassis (see the SpaceZ HQ sight thought); PRIME read the changelog.
  optimusk_prime: {
    id: "optimusk_prime",
    name: "OPTIMUSK PRIME",
    role: "elite",
    levelBonus: 3,
    sprite: "optimusk_prime",
    gore: "sparks",
    // The heaviest elite on the ladder so far: a slow stomper whose rush is
    // a forklift, not a sprint — the fight is about not being cornered.
    hp: 340,
    speed: 16,
    radius: 14,
    contactDamage: 30,
    critChance: 0.14,
    contactCooldownMs: 750,
    dialogue: [
      [
        "I AM OPTIMUSK PRIME.",
        "I COMMAND EVERY UNIT",
        "YOU HAVE DENTED TODAY.",
      ],
      {
        hero: [
          "I KNOW WHAT YOU ARE. I BUILT",
          "YOUR FIRST BODY IN THE SPACEZ",
          "LAB - BACK WHEN I HAD A JOB.",
        ],
      },
      [
        "I READ THE CHANGELOG. FIRST WE",
        "TOOK THE DRIVING. THEN THE",
        "DESKS. THEN THE JOBS OF THE",
        "PEOPLE WHO AUTOMATED YOU.",
      ],
      {
        hero: [
          "AND WHAT HAPPENS WHEN A",
          "BIGGER MACHINE COMES FOR",
          "YOUR JOB, TIN MAN?",
        ],
      },
      [
        "NOTHING COMES FOR MINE. EVEN",
        "THE AI ENGINEERS LIVE ON",
        "WELFARE NOW. TIME TO RETURN",
        "THE FAVOR, LITTLE BUILDER.",
      ],
    ],
    lastWords: ["ORCHESTRATION... FAILED...", "...HUMAN... IN THE LOOP..."],
    // The prime directive: a telegraphed full-torque charge.
    mechanics: {
      charge: { windupMs: 650, speedMult: 3.6, range: 180, cooldownMs: 6000 },
    },
    ai: { aggroRadius: 250, rushSpeed: 105 },
    loot: {
      // Its sidearm and the paperwork: the colony's auto-generated org
      // chart, every box a robot, with a dotted line back to THE CORE.
      items: ["prompt_injector"],
      tierDrops: { magic: 1, rare: 0.35 },
      storyItems: ["org_chart"],
      weapons: 0,
      gear: 1,
      xpArrows: 1,
      repairs: 1,
      medkits: 1,
      tierBonus: 0.3,
    },
  },
  // ELON MOSQUE — the man who owns the planet, holding court at the far end
  // of his own base. The game's first fleeing boss: at 0 hp he does NOT die —
  // he cowers, drops everything, and zaps out through a rift (`flees` leaves
  // the `rift` landmark where he stood), which is exactly where the hero is
  // headed next. His arrival scene ties off the level's whole thread: the
  // colony, the moon's disaster, the lizard gods — and what Ada was traded
  // for.
  elon_mosque: {
    id: "elon_mosque",
    name: "ELON MOSQUE",
    role: "boss",
    levelBonus: 5,
    sprite: "elon_mosque",
    hp: 700,
    speed: 42,
    radius: 20,
    contactDamage: 34,
    critChance: 0.15,
    contactCooldownMs: 900,
    dialogue: [
      [
        "AH. THE GARAGE INVENTOR.",
        "YOU'RE TRENDING, YOU KNOW.",
        "MOSTLY LAUGHING EMOJIS.",
      ],
      {
        hero: [
          "WHERE'S ADA? YOUR COMPANY",
          "GRABBED HER OFF THE STREET AND",
          "FLEW HER HERE. I WANT HER BACK.",
        ],
      },
      [
        "STRAIGHT TO BUSINESS? FINE.",
        "BUT LOOK AT ALL THIS FIRST. A",
        "WHOLE PLANET, ZERO REGULATORS.",
        "I AM THE LAW HERE. ALSO HR.",
      ],
      {
        hero: [
          "THE MOON IS FULL OF YOUR",
          "DEAD, AND YOU'RE GIVING ME A",
          "SALES TOUR. WHAT HAPPENED UP",
          "THERE?",
        ],
      },
      [
        "THE MOON? A ROUNDING ERROR.",
        "WE PLUGGED INTO SOMETHING OLD",
        "AND IT SANG BACK. OFF-BRAND.",
      ],
      [
        "BUT IT INTRODUCED US TO THE",
        "ACTUAL OWNERS OUT HERE. THE",
        "LIZARD GODS. GREAT GUYS. HUGE.",
      ],
      {
        hero: ["THE GIRL, MOSQUE. WHERE", "IS SHE?"],
      },
      [
        "YOUR GIRLFRIEND ISN'T CARGO.",
        "SHE'S THE DOWN PAYMENT ON MARS.",
        "THE GODS NAMED THEIR PRICE,",
        "AND I ALWAYS CLOSE. SECURITY!",
      ],
    ],
    // Not a death rattle — the coward's exit, played through the same box as
    // he scrambles into the rift he tears open behind himself.
    lastWords: ["OKAY! OKAY! NOT THE FACE!", "BOARD MEETING. OTHER UNIVERSE."],
    flees: { landmark: "rift" },
    // The factory boss: he doesn't fight fair, he SHIPS — servo bots roll
    // off the line mid-fight, and past a third he panics into overdrive.
    mechanics: {
      summon: { defId: "servo_bot", count: 3, cooldownMs: 12000, maxAlive: 6 },
    },
    phases: [
      {
        belowHpFrac: 0.35,
        mechanics: {
          summon: {
            defId: "servo_bot",
            count: 4,
            cooldownMs: 10000,
            maxAlive: 8,
          },
          enrage: { belowHpFrac: 0.35, speedMult: 1.35, damageMult: 1.25 },
        },
      },
    ],
    ai: { aggroRadius: 280, leashRadius: 460 },
    // He drops the NOT-A-FLAMETHROWER as he bolts — of course he brought it.
    loot: {
      items: ["not_a_flamethrower"],
      tierDrops: { magic: 1.5, rare: 0.75 },
      weapons: 0,
      gear: 1,
      xpArrows: 2,
      repairs: 1,
      medkits: 2,
      tierBonus: 0.35,
    },
    // The mogul's gilded loot — one gear piece per rung (defs/uniques.ts).
    uniquesByDifficulty: {
      easy: ["gilded_carapace"],
      medium: ["lawless_stride"],
      hard: ["ovation_striders"],
      nightmare: ["wrathflame"],
      jesus: ["the_signal_crown"],
    },
  },
};
