// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The enemy catalog. Every monster in the game is one entry here; levels
// reference entries by id in their spawn lists (defs/levels.ts). Adding a
// monster = adding an entry + a sprite named after it — no engine changes.

/**
 * `minion` is the horde, `boss` guards the objective — and `elite` is a
 * unique story mob: it sleeps at a hand-placed spot, rushes into view when
 * the player nears, delivers its `dialogue`, then fights. Elites drop real
 * loot (a signature weapon, plot items) via `loot`, same as bosses.
 */
export type EnemyRole = "minion" | "elite" | "boss";

export type EnemyDef = {
  id: string;
  /** Display name (HUD, boss bar). */
  name: string;
  role: EnemyRole;
  /** Sprite family the renderer draws (frames `<sprite>_0`, `<sprite>_1`). */
  sprite: string;
  /**
   * Hit-splash family: what sprays when this enemy is struck. Ghosts
   * splash "ecto"; everything warm-blooded defaults to "blood".
   */
  gore?: "blood" | "ecto";
  hp: number;
  /** World px/s before per-instance jitter. */
  speed: number;
  /** Collision radius in world px. */
  radius: number;
  contactDamage: number;
  /** Chance a touch lands critically (2×); the player's LUCK reduces it. */
  critChance: number;
  /** Minimum ms between contact hits from the same enemy. */
  contactCooldownMs: number;
  /**
   * XP granted on kill. Omitted = proportional to max hp
   * (LEVELING.xpPerHp) — the standing rule; set only to override it.
   */
  xp?: number;
  /**
   * What this enemy says the first time it closes to DIALOGUE.speakRadius
   * of the player (elites and bosses). One entry per page, one string per
   * line; the run pauses in the `dialogue` phase until tapped through.
   */
  dialogue?: string[][];
  ai: {
    /** Wakes and chases when the player gets this close. */
    aggroRadius: number;
    /** Bosses never stray further than this from home; others roam free. */
    leashRadius?: number;
    /** Fraction of speed while drifting back home (default 0.5). */
    returnSpeedFactor?: number;
    /**
     * Elites close in at this speed (world px/s, no jitter) until their
     * dialogue has played — the "rushes into view" beat. Defaults to
     * `speed`.
     */
    rushSpeed?: number;
  };
  /** Guaranteed drops (bosses, elites). Rolled drops are the level's loot
   * table. */
  loot?: {
    /** Specific equipment def ids always dropped, on top of the counts. */
    items?: string[];
    /** Story items always dropped (STORY_ITEM_DEFS ids — keys, dossiers). */
    storyItems?: string[];
    weapons: number;
    gear: number;
    /** Golden XP arrows (see LEVELING.arrowXpShare). */
    xpArrows: number;
    /** Weapon repair kits. */
    repairs: number;
    medkits: number;
    /** Added to every tier chance when rolling this enemy's drops. */
    tierBonus: number;
  };
};

/**
 * Two rosters so far. SpaceZ HQ (level 1): the night shift, weakest to
 * strongest — interns, lab scientists, propulsion engineers, security
 * guards, hazmat techs — plus MUSKRAT, the mutant rat who ate the drive
 * ingredient. The moon (level 2): the haunting, plus ARMSTRONG, the giant
 * astronaut ghost with the enormous arms who guards the flag he planted.
 */
export const ENEMY_DEFS: Record<string, EnemyDef> = {
  // ---- SpaceZ HQ ------------------------------------------------------------
  // Staff speeds sit far below the player's 80 px/s — same rule as the moon:
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
  // ---- SpaceZ HQ elites — the four staffers who know too much. Each is a
  // hand-placed unique (LevelDef pins them), rushes the player on approach,
  // says its piece, then fights like a mid-boss. Their drops carry the plot:
  // keycards to the locked rooms and a signature weapon a notch under the
  // boss's plasma cutter.
  night_manager: {
    id: "night_manager",
    name: "THE NIGHT MANAGER",
    role: "elite",
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
    ai: { aggroRadius: 240, rushSpeed: 120 },
    loot: {
      items: ["executive_putter"],
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
    ai: { aggroRadius: 240, rushSpeed: 130 },
    loot: {
      items: ["riot_taser"],
      storyItems: ["cargo_manifest"],
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
    ai: { aggroRadius: 240, rushSpeed: 115 },
    loot: {
      items: ["overclocked_laser"],
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
    ai: { aggroRadius: 240, rushSpeed: 110 },
    loot: {
      items: ["wet_floor_sign"],
      weapons: 0,
      gear: 0,
      xpArrows: 1,
      repairs: 1,
      medkits: 2,
      tierBonus: 0.25,
    },
  },
  muskrat: {
    id: "muskrat",
    name: "MUSKRAT",
    role: "boss",
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
        "THEY KEPT THE DRIVE CORE IN A",
        "CHEESE-COLORED BOX. THAT IS ON",
        "THEM, FRANKLY.",
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
    ai: { aggroRadius: 260, leashRadius: 440 },
    // He nests under the prototype rocket, digesting the one ingredient the
    // interplanetary drive can't ship without. The plasma cutter was the
    // cleanroom's — he dragged it home as a toothpick.
    loot: {
      items: ["plasma_cutter"],
      weapons: 0,
      gear: 1,
      xpArrows: 2,
      repairs: 1,
      medkits: 2,
      tierBonus: 0.3,
    },
  },
  // ---- The moon -------------------------------------------------------------
  // Minion speeds sit far below the player's 80 px/s: the horde is a slow,
  // inevitable tide the player reads and routes around, not a footrace.
  // Aggro radii dwarf the screen — once a monster exists, it is coming.
  wisp: {
    id: "wisp",
    name: "WISP",
    role: "minion",
    sprite: "wisp",
    gore: "ecto",
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
    sprite: "apollo_ghost",
    gore: "ecto",
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
      [
        "THE BROADCAST SAID ONE SMALL STEP.",
        "IT DIDN'T SAY ONTO WHAT. THERE WAS",
        "A WRECK UNDER THE DUST, KID.",
      ],
      [
        "OLDER THAN THE DUST. WE PLANTED",
        "THE FLAG ON A GRAVE AND SMILED",
        "FOR THE CAMERA. SMILE'S OVER.",
      ],
    ],
    ai: { aggroRadius: 250, rushSpeed: 115 },
    loot: {
      items: ["flare_gun"],
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
    sprite: "prospector",
    gore: "ecto",
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
      [
        "I DUG THEIR TUNNELS AT SITE T.",
        "FAR SIDE. YEARS OF FREIGHT RUNS",
        "NOBODY DOWN THERE EVER TRACKED.",
      ],
      [
        "THEN LAST MONTH THE CARGO",
        "MANIFESTS CHANGED. THE CRATES",
        "STARTED BREATHING. I QUIT. BADLY.",
      ],
    ],
    ai: { aggroRadius: 250, rushSpeed: 120 },
    loot: {
      items: ["core_drill"],
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
    sprite: "quarantine_medic",
    gore: "ecto",
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
      [
        "I RAN THE CREW PHYSICALS IN '69.",
        "TWO CHARTS FOR THE FIRST MAN.",
        "ONLY ONE OF THEM EVER FLEW HOME.",
      ],
      [
        "THE ONE WHO WAVED AT THE PARADES",
        "GREW IN A TANK ON THE RIDE BACK.",
        "THE REAL ONE? STILL ON SHIFT.",
        "YOU'RE WALKING TOWARD HIM.",
      ],
    ],
    ai: { aggroRadius: 250, rushSpeed: 115 },
    loot: {
      items: ["geiger_wand"],
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
    sprite: "cartographer",
    gore: "ecto",
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
      [
        "A SIGNAL CROSSED MY GRID LAST",
        "NIGHT. SMALL. WARM. A JACKET",
        "BEACON, MOVING FAST - THEN DOWN.",
      ],
      [
        "STRAIGHT DOWN. INTO THE WRECK",
        "UNDER THE FLAG. THEY ALL GO",
        "BELOW, FRIEND. NOBODY MAPS BELOW.",
      ],
    ],
    ai: { aggroRadius: 250, rushSpeed: 125 },
    loot: {
      items: ["surveyors_pick"],
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
    sprite: "armstrong",
    gore: "ecto",
    hp: 550,
    speed: 40,
    radius: 20,
    contactDamage: 30,
    critChance: 0.15,
    contactCooldownMs: 900,
    // The longest scene in the game so far: the level-2 reveals converge —
    // the wreck, the clone, and where Ada went — before the fight.
    dialogue: [
      [
        "YOU SMELL LIKE EARTH.",
        "RAIN AND CUT GRASS AND",
        "TELEVISION. GO HOME.",
      ],
      [
        "I PLANTED THIS FLAG. ONE SMALL",
        "STEP. THEN THEY FOUND THE WRECK",
        "UNDER MY BOOTS AND EVERYTHING",
        "AFTER THAT WAS THEATER.",
      ],
      [
        "THEY GREW A SMILING ME ON THE",
        "RIDE HOME. HE SHOOK THE HANDS.",
        "HE CUT THE RIBBONS. HE DIED IN",
        "A BED. LUCKY HIM.",
      ],
      [
        "I STAYED. SOMEBODY HAD TO STAND",
        "WATCH OVER THE THING DOWN THERE.",
        "IT SINGS, YOU KNOW. THE COMPANY",
        "MEN DANCE TO IT NOW.",
      ],
      [
        "THEY CARRIED A GIRL PAST ME LAST",
        "NIGHT. SNEAKERS. LOUD. SHE BIT",
        "TWO OF THEM. THEY TOOK HER BELOW,",
        "TO THE SINGING THING.",
      ],
      [
        "YOU WANT TO FOLLOW? THEN TAKE",
        "THE WATCH FROM ME, EARTHLING.",
        "I ONLY EVER LOSE TO THE WORTHY.",
      ],
    ],
    ai: { aggroRadius: 280, leashRadius: 460 },
    // The machete rode up in his survival kit — Apollo crews really packed
    // one for jungle splashdowns. Fifty years on, it's for the aliens.
    loot: {
      items: ["machete"],
      weapons: 0,
      gear: 1,
      xpArrows: 2,
      repairs: 1,
      medkits: 2,
      tierBonus: 0.35,
    },
  },
};

/** Look up an enemy's def; throws on a broken id so bugs surface loudly. */
export function enemyDef(defId: string): EnemyDef {
  const def = ENEMY_DEFS[defId];
  if (!def) throw new Error(`unknown enemy def "${defId}"`);
  return def;
}
