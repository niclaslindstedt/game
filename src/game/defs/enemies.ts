// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The enemy catalog. Every monster in the game is one entry here; levels
// reference entries by id in their spawn lists (defs/levels.ts). Adding a
// monster = adding an entry + a sprite named after it — no engine changes.

export type EnemyRole = "minion" | "boss";

export type EnemyDef = {
  id: string;
  /** Display name (HUD, boss bar). */
  name: string;
  role: EnemyRole;
  /** Sprite family the renderer draws (frames `<sprite>_0`, `<sprite>_1`). */
  sprite: string;
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
  ai: {
    /** Wakes and chases when the player gets this close. */
    aggroRadius: number;
    /** Bosses never stray further than this from home; others roam free. */
    leashRadius?: number;
    /** Fraction of speed while drifting back home (default 0.5). */
    returnSpeedFactor?: number;
  };
  /** Guaranteed drops (bosses). Rolled drops are the level's loot table. */
  loot?: {
    /** Specific equipment def ids always dropped, on top of the counts. */
    items?: string[];
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
    hp: 90,
    speed: 22,
    radius: 9,
    contactDamage: 20,
    critChance: 0.12,
    contactCooldownMs: 700,
    ai: { aggroRadius: 1000 },
  },
  armstrong: {
    id: "armstrong",
    name: "ARMSTRONG",
    role: "boss",
    sprite: "armstrong",
    hp: 550,
    speed: 40,
    radius: 20,
    contactDamage: 30,
    critChance: 0.15,
    contactCooldownMs: 900,
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
