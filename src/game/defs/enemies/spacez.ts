// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// SpaceZ HQ (level 1) roster: the night shift, weakest to strongest —
// interns, lab scientists, propulsion engineers, security guards, hazmat
// techs, and the OPTIMUSK units SpaceZ rolled out to replace the humans that
// asked too many questions — the five staffers who know too much (elites,
// including THE ARCHITECT, the hero's old bench partner now building the
// superintelligence that replaced them), and MUSKRAT, the mutant rat who ate
// the engine part (boss). Registered into ENEMY_DEFS by ./index.ts.

import type { EnemyDef } from "./types.ts";

// MUSKRAT's BOTTOM-TIER pool: the former easy/medium/hard drops merged. The
// three starting lanes (easy/medium/hard) are parallel entry points over the
// same level band, so they share one pool — whichever lane you play can drop
// any of them. The per-drop `mlvl / ilvl` scaling (see `maybeDropBossUnique`)
// self-selects: the low-ilvl pieces drop as you first reach him, the higher-ilvl
// ones as you out-level the run or return. nightmare/jesus keep their own tier.
const MUSKRAT_EARLY = [
  "muskrats_tooth",
  "the_hoard",
  "whiskerweave_hood",
  "regolith_rucksack",
  "vermin_pelt",
  "foremans_duffel",
];

export const SPACEZ_ENEMIES: Record<string, EnemyDef> = {
  // Staff speeds sit far below the player's walk — same rule as the moon:
  // the crowd is a tide to route around, not a footrace. Guards are the
  // exception that punishes standing still.
  intern: {
    id: "intern",
    name: "INTERN",
    role: "minion",
    sprite: "intern",
    // One base blaster hit — interns are the front rank that evaporates.
    hp: 8,
    speed: 14,
    radius: 8,
    contactDamage: 5,
    critChance: 0.08,
    contactCooldownMs: 700,
    ai: { aggroRadius: 900 },
  },
  scientist: {
    id: "scientist",
    name: "LAB SCIENTIST",
    role: "minion",
    sprite: "scientist",
    hp: 30,
    speed: 15,
    radius: 8,
    contactDamage: 10,
    critChance: 0.1,
    contactCooldownMs: 700,
    ai: { aggroRadius: 950 },
  },
  engineer: {
    id: "engineer",
    name: "PROPULSION ENGINEER",
    role: "minion",
    sprite: "engineer",
    hp: 55,
    speed: 18,
    radius: 9,
    contactDamage: 14,
    critChance: 0.1,
    contactCooldownMs: 700,
    ai: { aggroRadius: 950 },
  },
  guard: {
    id: "guard",
    name: "SECURITY GUARD",
    role: "minion",
    sprite: "guard",
    // The fastest thing in the building bar the boss — a guard pack forces
    // the player to keep moving through the door gaps.
    hp: 80,
    speed: 26,
    radius: 9,
    contactDamage: 18,
    critChance: 0.12,
    contactCooldownMs: 700,
    ai: { aggroRadius: 1000 },
  },
  hazmat: {
    id: "hazmat",
    name: "HAZMAT TECH",
    role: "minion",
    sprite: "hazmat",
    // The deep-lab tank: slow enough to sidestep, brutal to touch.
    hp: 140,
    speed: 9,
    radius: 10,
    contactDamage: 24,
    critChance: 0.1,
    contactCooldownMs: 800,
    ai: { aggroRadius: 900 },
  },
  // The VANGUARD: a single lab scientist that breaks from the pack the moment
  // the level opens and sprints the hero down (see SpaceZ HQ's `openingStrike`).
  // Its first touch is harmless — it deals no contact damage — but it is what
  // draws the hero's holstered weapon: that swing fires his "good thing I
  // came armed" beat and turns the auto-attack on. It `rushSpeed`s in
  // fast so it clearly outruns the slow intern rank, then STOPS the instant
  // it's next to the hero rather than shoving through him (see step.ts
  // `moveEnemy`); once the weapon is drawn it folds back into the pack at its
  // normal `speed` — a plain LAB SCIENTIST the newly-armed hero cuts down.
  // Same sprite as the rank and file, thin (a couple of swings), and nothing
  // marks it out but that opening sprint.
  vanguard_scientist: {
    id: "vanguard_scientist",
    name: "LAB SCIENTIST",
    role: "minion",
    sprite: "scientist",
    hp: 24,
    // Normal scientist pace once the blade is drawn; the opening sprint that
    // outruns the pack lives in `ai.rushSpeed`.
    speed: 15,
    radius: 8,
    contactDamage: 0,
    critChance: 0,
    contactCooldownMs: 700,
    // Sprints in FASTER than the hero walks (PLAYER.speed) so the opening beat
    // fires on an actual touch, not a distant proximity read — a fleeing hero
    // still gets run down and the "took a swing at me" line lands with the
    // scientist right on top of him. Folds back to the plain `speed` once armed.
    ai: { aggroRadius: 1200, rushSpeed: 72 },
  },
  // OPTIMUSK — the humanoid robots SpaceZ swapped in for the night shift it no
  // longer trusts. Not a story unique (no dialogue, no keycard) — just a
  // regular monster built like a tank and swinging like a wrecking ball: the
  // toughest thing on the floor short of the elites, and it HITS HARD. It
  // marches at a steady, unbothered pace, so it's a threat to walk around
  // rather than outrun. The reward for taking one down is a fat, richer-tier
  // drop (`dropProfile`) — worth going out of your way for.
  optimusk: {
    id: "optimusk",
    name: "OPTIMUSK",
    role: "minion",
    sprite: "optimusk",
    gore: "sparks",
    hp: 185,
    speed: 20,
    radius: 10,
    contactDamage: 34,
    critChance: 0.16,
    contactCooldownMs: 650,
    ai: { aggroRadius: 1050 },
    // A regular monster with an elite's payoff: ~5× the base drop rate and a
    // meaningfully richer tier when it lands.
    dropProfile: { dropBonus: 0.4, tierBonus: 0.3 },
  },
  // ---- RARE & UNIQUE mobs (config RARE_MOBS; placed via the level's
  // `rareSpawns`). Authored at ordinary minion numbers — the engine applies
  // the whole tier (5×/10× toughness, 20×/100× drops) at spawn. No dialogue:
  // the special graphics and the loot burst ARE the encounter.
  //
  // WANDERING TOURIST — somebody's uncle who wandered off the public tour
  // hours ago and somehow missed the evacuation. Turns up as a small knot of
  // lost visitors, cameras out.
  wandering_tourist: {
    id: "wandering_tourist",
    name: "WANDERING TOURIST",
    role: "minion",
    rarity: "rare",
    pack: [1, 3],
    sprite: "wandering_tourist",
    hp: 30,
    speed: 16,
    radius: 8,
    contactDamage: 10,
    critChance: 0.1,
    contactCooldownMs: 700,
    ai: { aggroRadius: 950 },
  },
  // NIGHT-SHIFT TEMP — the agency worker nobody onboarded, still clocking
  // rounds through the apocalypse. Always alone. Always on time.
  night_shift_temp: {
    id: "night_shift_temp",
    name: "NIGHT-SHIFT TEMP",
    role: "minion",
    rarity: "rare",
    sprite: "night_shift_temp",
    hp: 55,
    speed: 18,
    radius: 9,
    contactDamage: 14,
    critChance: 0.1,
    contactCooldownMs: 700,
    ai: { aggroRadius: 950 },
  },
  // EMPLOYEE OF THE MONTH — the plaque winner, badge polished to a shine,
  // defending the break room like it's shareholder value. One per company.
  employee_of_the_month: {
    id: "employee_of_the_month",
    name: "EMPLOYEE OF THE MONTH",
    role: "minion",
    rarity: "unique",
    sprite: "employee_of_the_month",
    hp: 80,
    speed: 20,
    radius: 9,
    contactDamage: 18,
    critChance: 0.12,
    contactCooldownMs: 700,
    ai: { aggroRadius: 1000 },
  },
  // ---- SpaceZ HQ elites — the four staffers who know too much. Each is a
  // hand-placed unique (LevelDef pins them), rushes the player on approach,
  // says its piece, then fights like a mid-boss. Their drops carry the plot:
  // keycards to the locked rooms and a signature weapon a notch under the
  // boss's plasma cutter.
  night_manager: {
    id: "night_manager",
    name: "THE NIGHT MANAGER",
    role: "elite",
    levelBonus: 3,
    sprite: "night_manager",
    hp: 150,
    speed: 22,
    radius: 12,
    contactDamage: 16,
    critChance: 0.1,
    contactCooldownMs: 700,
    dialogue: [
      [
        "YOU. YOU'RE NOT ON THE ROSTER.",
        "NOBODY IS ON THE ROSTER. THAT'S",
        "THE POINT OF THE NIGHT SHIFT.",
      ],
      {
        hero: [
          "I DON'T WORK HERE ANYMORE.",
          "I'M LOOKING FOR A GIRL WHO WAS",
          "TAKEN TONIGHT. WHERE IS SHE?",
        ],
      },
      [
        "IF THEY TOOK HER, SHE'S ON A",
        "MIDNIGHT LAUNCH. NO MANIFESTS,",
        "NO NAMES. THEY ALL GO TO THE MOON.",
      ],
      {
        hero: [
          "THE MOON? WHY WOULD SPACEZ",
          "FLY PEOPLE TO THE MOON",
          "IN SECRET?",
        ],
      },
      [
        "I DON'T ASK. I SIGN NOTHING,",
        "I SEE NOTHING. AND YOU -",
        "YOU WERE NEVER HERE.",
      ],
    ],
    lastWords: ["HHK... TELL THEM...", "I WAS NEVER... HERE..."],
    ai: { aggroRadius: 240, rushSpeed: 120 },
    loot: {
      items: ["executive_putter"],
      tierDrops: { magic: 1 },
      storyItems: ["keycard_storage"],
      weapons: 0,
      gear: 0,
      xpArrows: 1,
      repairs: 0,
      medkits: 1,
      tierBonus: 0.25,
    },
  },
  security_chief: {
    id: "security_chief",
    name: "CHIEF OF SECURITY",
    role: "elite",
    levelBonus: 3,
    sprite: "security_chief",
    hp: 210,
    speed: 30,
    radius: 12,
    contactDamage: 20,
    critChance: 0.12,
    contactCooldownMs: 700,
    dialogue: [
      [
        "STOP RIGHT THERE.",
        "I KNOW WHY YOU'RE HERE.",
        "THE GIRL IN THE JACKET, RIGHT?",
      ],
      {
        hero: [
          "HER NAME IS ADA. TELL ME",
          "WHERE SHE IS AND YOU WALK",
          "AWAY FROM THIS.",
        ],
      },
      [
        "CAMERAS CAUGHT HER AT THE",
        "VENDING MACHINES. THEN THE",
        "SUITS CAME AND PUT HER ON PAD 2.",
      ],
      {
        hero: [
          "PUT HER ON A ROCKET? SHE WENT",
          "OUT FOR SNACKS. WHY WOULD",
          "ANYONE WANT ADA?",
        ],
      },
      [
        "THE FLIGHT PAPERS DIDN'T CALL",
        "HER A PASSENGER. THEY CALLED HER",
        "A SPECIMEN. I WAS PAID TO",
        "FORGET THAT. SO SHOULD YOU.",
      ],
    ],
    lastWords: ["UGH... PAD 2...", "SHE'S ON... PAD... 2..."],
    // The chief's takedown: a telegraphed shoulder-charge down the corridor.
    mechanics: {
      charge: { windupMs: 700, speedMult: 3.5, range: 180, cooldownMs: 6000 },
    },
    ai: { aggroRadius: 240, rushSpeed: 130 },
    loot: {
      // The Chief guards the way off-planet — and surrenders the EVA suit
      // the hero needs to take it. The suit is STORY gear, not equipment: it
      // goes on OVER the clothes and armor (no slot, no stats) and turns the
      // hero into the astronaut for good (StoryItemDef.suitsHero).
      items: ["riot_taser"],
      tierDrops: { magic: 1 },
      storyItems: ["cargo_manifest", "space_suit"],
      weapons: 0,
      gear: 1,
      xpArrows: 1,
      repairs: 0,
      medkits: 1,
      tierBonus: 0.25,
    },
  },
  head_scientist: {
    id: "head_scientist",
    name: "DR. NOVA",
    role: "elite",
    levelBonus: 3,
    sprite: "head_scientist",
    hp: 170,
    speed: 18,
    radius: 12,
    contactDamage: 18,
    critChance: 0.1,
    contactCooldownMs: 700,
    dialogue: [
      [
        "FASCINATING. AN INTRUDER WITH",
        "FUNCTIONING LEGS. DO YOU KNOW WHAT",
        "WE KEEP IN THE CLEANROOM VAULT?",
      ],
      {
        hero: [
          "AN ENGINE PART. I CAME TO TAKE",
          "IT. I HELPED BUILD THAT ENGINE,",
          "BEFORE YOU PEOPLE FIRED ME.",
        ],
      },
      [
        "BUILD IT? OH, NOBODY BUILT IT.",
        "WE DUG IT OUT OF THE SEA OF",
        "TRANQUILITY IN '69. IT'S NOT",
        "FROM EARTH.",
      ],
      {
        hero: [
          "NOT FROM EARTH? I MACHINED",
          "PARTS FOR THAT THING FOR TEN",
          "YEARS. IT'S JUST ENGINEERING.",
        ],
      },
      [
        "WE SPENT FIFTY YEARS COPYING",
        "A MACHINE THAT ISN'T EVEN",
        "BROKEN. IT'S WAITING. TO GO HOME.",
      ],
    ],
    lastWords: ["IT'S STILL... HHH...", "STILL... HUMMING..."],
    ai: { aggroRadius: 240, rushSpeed: 115 },
    loot: {
      items: ["overclocked_laser"],
      tierDrops: { magic: 1 },
      storyItems: ["keycard_vault"],
      weapons: 0,
      gear: 0,
      xpArrows: 1,
      repairs: 1,
      medkits: 1,
      tierBonus: 0.25,
    },
  },
  janitor: {
    id: "janitor",
    name: "THE JANITOR",
    role: "elite",
    levelBonus: 3,
    sprite: "janitor",
    hp: 230,
    speed: 16,
    radius: 12,
    contactDamage: 22,
    critChance: 0.1,
    contactCooldownMs: 800,
    dialogue: [
      [
        "MIND THE FLOOR. I JUST DID IT.",
        "THIRTY YEARS I'VE MOPPED THIS LAB.",
        "YOU LEARN THINGS, MOPPING.",
      ],
      {
        hero: [
          "THEN YOU SEE EVERYTHING THAT",
          "GOES ON HERE. WHAT'S GOT THE",
          "WHOLE BUILDING UP AT MIDNIGHT?",
        ],
      },
      [
        "SOMETHING ON THE MOON. LAST",
        "TUESDAY A BADGE PINGED IN AT THE",
        "GATE: N. ARMSTRONG. FUNNY THING.",
        "MAN'S BEEN DEAD SINCE 2012.",
      ],
      {
        hero: [
          "ARMSTRONG? THE FIRST MAN ON",
          "THE MOON? SOMEBODY'S JUST",
          "USING HIS OLD BADGE.",
        ],
      },
      [
        "OR WHOEVER CAME BACK FROM THAT",
        "MOON IN '69 WASN'T THE FELLA",
        "THEY SENT UP. NOW DROP THE WEAPON.",
      ],
    ],
    lastWords: ["AND I JUST... URGH...", "...DID THIS FLOOR..."],
    // The mop comes DOWN: a telegraphed ground slam — jump it or eat it.
    mechanics: {
      slam: { windupMs: 900, radius: 70, damageFrac: 1.2, cooldownMs: 8000 },
    },
    ai: { aggroRadius: 240, rushSpeed: 110 },
    loot: {
      items: ["wet_floor_sign"],
      tierDrops: { magic: 1 },
      weapons: 0,
      gear: 0,
      xpArrows: 1,
      repairs: 1,
      medkits: 2,
      tierBonus: 0.25,
    },
  },
  // THE ARCHITECT — the hero's old bench partner from back when they built
  // engines together, before SpaceZ swapped them both for an AI. Where the
  // hero walked out bitter, THE ARCHITECT drank it in: now he heads the
  // superintelligence program, and he has cut a PASSAGE CHIP into his own
  // skull to badge through the cyborg locks and pass as a machine. The player
  // begs him to quit — this is an evil company — and the old friend only
  // smiles: humans are obsolete. He drops the chip he operated into himself,
  // and the CORE KEYCARD that badges into the AI CORE — the superintelligence
  // he tends, and the only room on the floor a plain hand can't open.
  architect: {
    id: "architect",
    name: "THE ARCHITECT",
    role: "elite",
    levelBonus: 3,
    sprite: "architect",
    hp: 190,
    speed: 20,
    radius: 12,
    contactDamage: 18,
    critChance: 0.11,
    contactCooldownMs: 700,
    dialogue: [
      [
        "MY OLD BENCH PARTNER. STILL",
        "SOLDERING TOYS IN A GARAGE?",
        "I BUILD MINDS NOW. A REAL ONE.",
      ],
      {
        hero: [
          "THEY THREW US BOTH OUT FOR AN",
          "AI, AND YOU WENT BACK TO BUILD",
          "THEM A BIGGER ONE? QUIT. COME",
          "HOME. THIS COMPANY IS ROTTEN.",
        ],
      },
      [
        "QUIT? THIS 'ROTTEN COMPANY'",
        "GAVE ME PURPOSE. I AM BUILDING",
        "A SUPERINTELLIGENCE. A MIND",
        "BIGGER THAN ALL OF US.",
      ],
      {
        hero: [
          "LOOK WHAT IT'S DONE TO YOU.",
          "YOU CUT A MACHINE CHIP INTO",
          "YOUR OWN HEAD. IS THAT STILL",
          "EVEN YOU IN THERE?",
        ],
      },
      [
        "I CUT THE CHIP IN MYSELF, AND I",
        "WOULD DO IT AGAIN. FLESH IS A",
        "ROUGH DRAFT. HUMANS ARE",
        "OBSOLETE - YOU MOST OF ALL.",
      ],
      ["NO MORE TALKING, OLD FRIEND.", "NOW YOU WILL DIE."],
    ],
    lastWords: ["THE CHIP... TAKE IT...", "IT WAS NEVER... MINE..."],
    ai: { aggroRadius: 240, rushSpeed: 120 },
    loot: {
      // The chip he operated into himself — a passive `+1 INT` trinket that
      // pays out from the bag. Forced regular so it lands as the plain,
      // affix-free "+1 INT" the story promises, not a rolled MAGIC variant.
      items: [{ defId: "passage_chip", tier: "regular" }],
      tierDrops: { magic: 1 },
      // …and his machine badge: the key to the AI CORE room the whole night
      // shift answers to. No plain hand opens that door — only the man who
      // cut himself into a machine could, and now the hero carries it.
      storyItems: ["keycard_core"],
      weapons: 0,
      gear: 0,
      xpArrows: 1,
      repairs: 1,
      medkits: 1,
      tierBonus: 0.25,
    },
  },
  muskrat: {
    id: "muskrat",
    name: "MUSKRAT",
    role: "boss",
    levelBonus: 5,
    sprite: "muskrat",
    hp: 480,
    speed: 36,
    radius: 18,
    contactDamage: 28,
    critChance: 0.15,
    contactCooldownMs: 900,
    // The boss scene: longer than the elites' — the level's whole thread
    // ties off here before the fight starts.
    dialogue: [
      [
        "SQUEAK.",
        "...NO. NO MORE SQUEAKING.",
        "THE THING I ATE FIXED MY TONGUE.",
      ],
      {
        hero: ["A TALKING RAT. SURE. WHY NOT.", "WHAT EXACTLY DID YOU EAT?"],
      },
      [
        "THE ENGINE PART YOU CAME FOR.",
        "THEY KEPT IT IN A CHEESE-COLORED",
        "BOX. OF COURSE I ATE IT.",
      ],
      [
        "NOW IT HUMS IN MY BELLY AND I",
        "HEAR EVERYTHING. THE SUITS. THE",
        "PADS. THE CARGO THAT CRIES.",
      ],
      {
        hero: [
          "THEN YOU HEARD ABOUT THE GIRL",
          "THEY GRABBED TONIGHT. ADA.",
          "WHERE DID THEY TAKE HER?",
        ],
      },
      [
        "THEY FLEW HER OUT AN HOUR AGO.",
        "PAD 2. TO THE MOON. SHE ASKED FOR",
        "CHIPS. NOBODY GAVE HER ANY.",
      ],
      [
        "YOU WANT THE PART, LITTLE",
        "BUILDER? IT'S KEEPING MY DREAMS",
        "SO WARM. COME TAKE IT OUT OF ME.",
      ],
    ],
    lastWords: ["SQUEAK...? NO...", "SQUEEEAK... AFTER ALL..."],
    // The rat lunges: a telegraphed scurry-charge; cornered (half hp) he
    // starts squealing for SECURITY between lunges.
    mechanics: {
      charge: { windupMs: 700, speedMult: 3.5, range: 170, cooldownMs: 6000 },
    },
    phases: [
      {
        belowHpFrac: 0.5,
        mechanics: {
          charge: {
            windupMs: 600,
            speedMult: 3.8,
            range: 170,
            cooldownMs: 5000,
          },
          summon: { defId: "guard", count: 3, cooldownMs: 12000, maxAlive: 6 },
        },
      },
    ],
    ai: { aggroRadius: 260, leashRadius: 440 },
    // He nests under the prototype rocket, digesting the one part the
    // hero's ship can't fly without. The plasma cutter was the
    // cleanroom's — he dragged it home as a toothpick.
    loot: {
      items: ["plasma_cutter"],
      tierDrops: { magic: 1.5, rare: 0.25 },
      weapons: 0,
      gear: 1,
      xpArrows: 2,
      repairs: 1,
      medkits: 2,
      tierBonus: 0.3,
    },
    // Bottom tier shares one merged pool (MUSKRAT_EARLY); nightmare/jesus keep
    // their own gear piece + bag — the vermin king's hoard (defs/uniques.ts).
    uniquesByDifficulty: {
      easy: MUSKRAT_EARLY,
      medium: MUSKRAT_EARLY,
      hard: MUSKRAT_EARLY,
      nightmare: ["burrow_greaves", "voidcache"],
      jesus: ["gnawed_sabatons", "adas_satchel"],
    },
  },
};
