// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// SpaceZ HQ (level 1) roster: the night shift, weakest to strongest —
// interns, lab scientists, propulsion engineers, security guards, hazmat
// techs, and the OPTIMUSK units SpaceZ rolled out to replace the humans that
// asked too many questions — the five staffers who know too much (elites,
// including THE ARCHITECT, the hero's old bench partner now building the
// superintelligence that replaced them), and MUSKRAT, the mutant rat who ate
// the drive ingredient (boss). Registered into ENEMY_DEFS by ./index.ts.

import type { EnemyDef } from "./types.ts";

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
        "THE WHOLE POINT OF THE NIGHT SHIFT.",
      ],
      [
        "THE LAUNCHES YOU DON'T HEAR ABOUT",
        "LEAVE AFTER MIDNIGHT. NO MANIFESTS.",
        "NO NAMES. MOONWARD. ALWAYS MOONWARD.",
      ],
      ["I SIGN NOTHING. I SEE NOTHING.", "AND YOU - YOU WERE NEVER HERE."],
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
      [
        "CAMERAS CAUGHT HER AT THE VENDING",
        "MACHINES. THEN THE SUITS CAME AND",
        "THE FOOTAGE WENT TO PAD 2.",
      ],
      [
        "THE MANIFEST DIDN'T SAY PASSENGER.",
        "IT SAID SPECIMEN. NOW FORGET IT -",
        "LIKE I WAS PAID TO.",
      ],
    ],
    lastWords: ["UGH... PAD 2...", "SHE'S ON... PAD... 2..."],
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
      [
        "THE DRIVE EVERYONE CALLS OURS -",
        "WE DIDN'T BUILD IT. WE DUG IT OUT",
        "OF THE SEA OF TRANQUILITY IN '69.",
      ],
      [
        "FIFTY YEARS REVERSE-ENGINEERING",
        "A MACHINE THAT ISN'T BROKEN.",
        "IT'S JUST WAITING TO GO HOME.",
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
      [
        "LAST TUESDAY A BADGE PINGED IN:",
        "N. ARMSTRONG. FUNNY THING, THAT.",
        "MAN'S BEEN DEAD SINCE 2012.",
      ],
      [
        "WHOEVER CAME BACK FROM THAT MOON",
        "IN '69... IT WASN'T THE FELLA",
        "THEY SENT UP. NOW DROP THE WEAPON.",
      ],
    ],
    lastWords: ["AND I JUST... URGH...", "...DID THIS FLOOR..."],
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
      [
        "QUIT? YOU CAME HERE TO TELL ME",
        "TO QUIT? THIS 'EVIL COMPANY' GAVE",
        "ME PURPOSE. A SUPERINTELLIGENCE.",
      ],
      [
        "I CUT THE CHIP IN MYSELF. FLESH",
        "IS A ROUGH DRAFT. HUMANS ARE",
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
      [
        "THE INGREDIENT YOU CAME FOR?",
        "THEY KEPT IT IN A CHEESE-COLORED",
        "BOX. OF COURSE I ATE IT.",
      ],
      [
        "NOW IT HUMS IN MY BELLY AND I",
        "HEAR EVERYTHING. THE SUITS. THE",
        "PADS. THE CARGO THAT CRIES.",
      ],
      [
        "THEY FLEW YOUR GIRL OUT TONIGHT.",
        "PAD 2. MOONWARD. SHE ASKED FOR",
        "CHIPS. NOBODY GAVE HER ANY.",
      ],
      [
        "YOU WANT THE CORE, LITTLE BUILDER?",
        "IT'S KEEPING MY DREAMS SO WARM.",
        "COME TAKE IT OUT OF ME.",
      ],
    ],
    lastWords: ["SQUEAK...? NO...", "SQUEEEAK... AFTER ALL..."],
    ai: { aggroRadius: 260, leashRadius: 440 },
    // He nests under the prototype rocket, digesting the one ingredient the
    // interplanetary drive can't ship without. The plasma cutter was the
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
  },
};
