// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The moon (level 2) roster: the haunting — wisps, moon ghosts, wraiths —
// four ghosts with unfinished business (elites), and ARMSTRONG, the giant
// astronaut ghost who guards the flag he planted (boss). Every moon mob
// phases (senses through walls, drifts through stone). Registered into
// ENEMY_DEFS by ./index.ts.

import type { EnemyDef } from "./types.ts";

export const MOON_ENEMIES: Record<string, EnemyDef> = {
  // Minion speeds sit far below the player's walk: the horde is a slow,
  // inevitable tide the player reads and routes around, not a footrace.
  // Aggro radii dwarf the screen — once a monster exists, it is coming.
  wisp: {
    id: "wisp",
    name: "WISP",
    role: "minion",
    sprite: "wisp",
    gore: "ecto",
    phasing: true,
    // One base blaster hit: wisps are the horde's fodder — the flood is
    // only survivable because its front rank evaporates on contact.
    hp: 10,
    speed: 13,
    radius: 8,
    contactDamage: 6,
    critChance: 0.1,
    contactCooldownMs: 700,
    ai: { aggroRadius: 900 },
  },
  ghost: {
    id: "ghost",
    name: "MOON GHOST",
    role: "minion",
    sprite: "ghost",
    gore: "ecto",
    phasing: true,
    hp: 45,
    speed: 16,
    radius: 9,
    contactDamage: 12,
    critChance: 0.1,
    contactCooldownMs: 700,
    ai: { aggroRadius: 950 },
  },
  wraith: {
    id: "wraith",
    name: "WRAITH",
    role: "minion",
    sprite: "wraith",
    gore: "ecto",
    phasing: true,
    hp: 90,
    speed: 22,
    radius: 9,
    contactDamage: 20,
    critChance: 0.12,
    contactCooldownMs: 700,
    ai: { aggroRadius: 1000 },
  },
  // ---- The moon's elites — four ghosts with unfinished business, pinned
  // along the walk to the flag so the conspiracy unspools in order: the
  // grave under the dust, the corporate moonbase, the clone, and Ada's
  // trail going below.
  apollo_ghost: {
    id: "apollo_ghost",
    name: "MISSION SPECIALIST",
    role: "elite",
    levelBonus: 3,
    sprite: "apollo_ghost",
    gore: "ecto",
    phasing: true,
    hp: 220,
    speed: 20,
    radius: 12,
    contactDamage: 20,
    critChance: 0.1,
    contactCooldownMs: 700,
    dialogue: [
      [
        "A LIVE ONE. BREATHING AND",
        "EVERYTHING. WE STOPPED THAT",
        "HABIT DECADES AGO.",
      ],
      {
        hero: [
          "YOU'RE AN ASTRONAUT. A DEAD",
          "ONE. HOW ARE THERE DEAD PEOPLE",
          "ON THE MOON? NOBODY DIED UP HERE.",
        ],
      },
      [
        "THAT'S WHAT THE BROADCAST SAID.",
        "ONE SMALL STEP. IT DIDN'T SAY",
        "ONTO WHAT. THERE'S A WRECKED",
        "SHIP UNDER THE DUST, KID.",
      ],
      {
        hero: [
          "A WRECK? UNDER THE SEA OF",
          "TRANQUILITY? THAT WAS NEVER IN",
          "ANY FOOTAGE I SAW.",
        ],
      },
      [
        "IT'S OLDER THAN THE DUST. WE",
        "PLANTED THE FLAG ON A GRAVE AND",
        "SMILED FOR THE CAMERA. SMILE'S OVER.",
      ],
    ],
    lastWords: ["ONE SMALL... STEP...", "ONTO A... GRAVE... HHK"],
    // A ghost with unfinished business: below a third it burns hot.
    mechanics: {
      enrage: { belowHpFrac: 0.35, speedMult: 1.4, damageMult: 1.3 },
    },
    ai: { aggroRadius: 250, rushSpeed: 115 },
    loot: {
      items: ["flare_gun"],
      tierDrops: { magic: 1 },
      storyItems: ["mission_log"],
      weapons: 0,
      gear: 0,
      xpArrows: 1,
      repairs: 0,
      medkits: 1,
      tierBonus: 0.3,
    },
  },
  prospector: {
    id: "prospector",
    name: "THE PROSPECTOR",
    role: "elite",
    levelBonus: 3,
    sprite: "prospector",
    gore: "ecto",
    phasing: true,
    hp: 240,
    speed: 22,
    radius: 12,
    contactDamage: 24,
    critChance: 0.12,
    contactCooldownMs: 700,
    dialogue: [
      [
        "CLAIM'S TAKEN. WHOLE ROCK'S",
        "TAKEN. STAMPED, FILED, AND",
        "PAID FOR BY SPACEZ.",
      ],
      {
        hero: [
          "SPACEZ OWNS THE MOON? SINCE",
          "WHEN? WHAT ARE THEY EVEN",
          "DOING UP HERE?",
        ],
      },
      [
        "BUILDING, MOSTLY. I DUG THEIR",
        "TUNNELS AT SITE T, ON THE FAR",
        "SIDE. YEARS OF SECRET FREIGHT",
        "RUNS FROM EARTH. NOBODY TRACKED THEM.",
      ],
      {
        hero: ["FREIGHT. WOULD THAT FREIGHT", "EVER INCLUDE PEOPLE?"],
      },
      [
        "LAST MONTH THE MANIFESTS",
        "CHANGED. THE CRATES COMING UP",
        "STARTED BREATHING. I QUIT. BADLY.",
      ],
    ],
    lastWords: ["THE CLAIM'S... URGH...", "...YOURS NOW, KID..."],
    // The claim-jumper's pickaxe rush: a telegraphed charge.
    mechanics: {
      charge: { windupMs: 700, speedMult: 3.5, range: 160, cooldownMs: 6500 },
    },
    ai: { aggroRadius: 250, rushSpeed: 120 },
    loot: {
      items: ["core_drill"],
      tierDrops: { magic: 1 },
      storyItems: ["spacez_blueprints"],
      weapons: 0,
      gear: 1,
      xpArrows: 1,
      repairs: 0,
      medkits: 1,
      tierBonus: 0.3,
    },
  },
  quarantine_medic: {
    id: "quarantine_medic",
    name: "QUARANTINE MEDIC",
    role: "elite",
    levelBonus: 3,
    sprite: "quarantine_medic",
    gore: "ecto",
    phasing: true,
    hp: 260,
    speed: 20,
    radius: 12,
    contactDamage: 24,
    critChance: 0.1,
    contactCooldownMs: 700,
    dialogue: [
      [
        "HOLD STILL. ROUTINE SCREENING.",
        "HEARTBEAT... PRESENT. UNUSUAL.",
        "YOU'LL WANT THAT LOOKED AT.",
      ],
      {
        hero: ["I'LL RISK IT. YOU WERE THE", "CREW DOCTOR? BACK IN '69?"],
      },
      [
        "I RAN EVERY PHYSICAL. AND THE",
        "FIRST MAN ON THE MOON HAD TWO",
        "MEDICAL CHARTS. IDENTICAL. ONLY",
        "ONE OF THEM EVER FLEW HOME.",
      ],
      {
        hero: [
          "TWO CHARTS... YOU'RE SAYING",
          "THERE WERE TWO OF HIM. THEN",
          "WHICH ONE CAME BACK TO EARTH?",
        ],
      },
      [
        "THE COPY. GROWN IN A TANK ON",
        "THE RIDE HOME. IT WAVED AT THE",
        "PARADES. THE REAL ONE IS STILL",
        "UP HERE. YOU'RE WALKING TOWARD HIM.",
      ],
    ],
    lastWords: ["TWO CHARTS... HHH...", "ONE STILL... BEAT..."],
    ai: { aggroRadius: 250, rushSpeed: 115 },
    loot: {
      items: ["geiger_wand"],
      tierDrops: { magic: 1 },
      storyItems: ["clone_dossier"],
      weapons: 0,
      gear: 0,
      xpArrows: 1,
      repairs: 1,
      medkits: 1,
      tierBonus: 0.3,
    },
  },
  cartographer: {
    id: "cartographer",
    name: "THE CARTOGRAPHER",
    role: "elite",
    levelBonus: 3,
    sprite: "cartographer",
    gore: "ecto",
    phasing: true,
    hp: 240,
    speed: 26,
    radius: 12,
    contactDamage: 22,
    critChance: 0.12,
    contactCooldownMs: 700,
    dialogue: [
      [
        "SHH. I'M CHARTING. THE MAP",
        "KEEPS CHANGING UNDERNEATH.",
        "TUNNELS WHERE NO TUNNELS WERE.",
      ],
      {
        hero: [
          "THEN MAYBE YOU'VE SEEN WHAT",
          "I'M TRACKING. A SMALL, WARM",
          "SIGNAL - A BEACON IN A GIRL'S",
          "JACKET. IT WENT QUIET NEAR HERE.",
        ],
      },
      [
        "IT CROSSED MY GRID LAST NIGHT.",
        "MOVING FAST. THEN IT WENT",
        "STRAIGHT DOWN - INTO THE WRECK",
        "UNDER THE FLAG.",
      ],
      {
        hero: [
          "DOWN INTO THE WRECK? THEN",
          "THAT'S WHERE I'M GOING. HOW",
          "DO I FOLLOW HER?",
        ],
      },
      [
        "YOU DON'T, FRIEND. EVERYTHING",
        "GOES BELOW. NOTHING COMES BACK",
        "UP. NOBODY MAPS BELOW.",
      ],
    ],
    lastWords: ["SHE WENT... STRAIGHT...", "...DOWN... OFF MY MAP..."],
    ai: { aggroRadius: 250, rushSpeed: 125 },
    loot: {
      items: ["surveyors_pick"],
      tierDrops: { magic: 1 },
      weapons: 0,
      gear: 0,
      xpArrows: 1,
      repairs: 1,
      medkits: 1,
      tierBonus: 0.3,
    },
  },
  armstrong: {
    id: "armstrong",
    name: "ARMSTRONG",
    role: "boss",
    levelBonus: 5,
    sprite: "armstrong",
    gore: "ecto",
    phasing: true,
    hp: 550,
    speed: 40,
    radius: 20,
    contactDamage: 30,
    critChance: 0.15,
    contactCooldownMs: 900,
    // The longest scene in the game so far: the level-2 reveals converge —
    // the wreck, the clone, SpaceZ's disaster — and the trail bends to Mars.
    dialogue: [
      [
        "YOU SMELL LIKE EARTH.",
        "RAIN AND CUT GRASS AND",
        "TELEVISION. GO HOME.",
      ],
      {
        hero: [
          "NOT WITHOUT ADA. YOU'RE HIM,",
          "AREN'T YOU? THE FIRST MAN ON",
          "THE MOON. YOU NEVER WENT HOME.",
        ],
      },
      [
        "I PLANTED THIS FLAG. ONE SMALL",
        "STEP. THEN THEY FOUND THE WRECK",
        "UNDER MY BOOTS AND EVERYTHING",
        "AFTER THAT WAS THEATER.",
      ],
      [
        "THEY GREW A SMILING COPY OF ME",
        "ON THE RIDE HOME. HE SHOOK THE",
        "HANDS. HE CUT THE RIBBONS. HE",
        "DIED IN A BED. LUCKY HIM.",
      ],
      {
        hero: [
          "AND YOU'VE BEEN UP HERE ALONE",
          "EVER SINCE? FIFTY YEARS?",
          "GUARDING WHAT?",
        ],
      },
      [
        "THE THING IN THE WRECK. IT",
        "SINGS, YOU KNOW. SPACEZ HEARD",
        "IT TOO - AND PLUGGED THEIR",
        "MACHINES STRAIGHT INTO IT.",
      ],
      [
        "THAT WAS THEIR GREAT MISTAKE.",
        "IT SANG, AND THE GRAVES OPENED.",
        "NOW THE COMPANY MEN CRATE UP",
        "EVERYTHING AND RUN TO MARS.",
      ],
      {
        hero: [
          "MARS? THEN THE CRATES - THEY",
          "CARRIED A GIRL THROUGH HERE",
          "LAST NIGHT. DID YOU SEE HER?",
        ],
      },
      [
        "SNEAKERS. LOUD. SHE BIT TWO OF",
        "THEM. THEY PUT HER IN A CRATE",
        "FOR THE MARS RUN, WITH",
        "EVERYTHING ELSE THEY OWN.",
      ],
      [
        "YOU WANT TO FOLLOW? THEN TAKE",
        "THE WATCH FROM ME, EARTHLING.",
        "I ONLY EVER LOSE TO THE WORTHY.",
      ],
    ],
    lastWords: ["THE WATCH... HHH...", "IT'S... YOURS... NOW..."],
    // One small stomp: a telegraphed moon-quake slam; on his last quarter
    // the giant leaps into a fury and the slams come faster.
    mechanics: {
      slam: { windupMs: 900, radius: 75, damageFrac: 1.2, cooldownMs: 8000 },
    },
    phases: [
      {
        belowHpFrac: 0.4,
        mechanics: {
          slam: { windupMs: 700, radius: 80, damageFrac: 1.3, cooldownMs: 6000 },
          enrage: { belowHpFrac: 0.4, speedMult: 1.4, damageMult: 1.25 },
        },
      },
    ],
    ai: { aggroRadius: 280, leashRadius: 460 },
    // The machete rode up in his survival kit — Apollo crews really packed
    // one for jungle splashdowns. Fifty years on, it's for the aliens.
    loot: {
      items: ["machete"],
      tierDrops: { magic: 1.5, rare: 0.5 },
      weapons: 0,
      gear: 1,
      xpArrows: 2,
      repairs: 1,
      medkits: 2,
      tierBonus: 0.35,
    },
    // The dead sentinel's watch — one gear piece per rung (defs/uniques.ts).
    uniquesByDifficulty: {
      easy: ["the_long_vigil"],
      medium: ["palegrave"],
      hard: ["sentinels_greaves"],
      nightmare: ["marewalkers"],
      jesus: ["the_fallen_standard"],
    },
  },
};
