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
    upgrades: number;
    medkits: number;
    /** Added to every tier chance when rolling this enemy's drops. */
    tierBonus: number;
  };
};

/**
 * The moon's haunting, weakest to strongest — plus ARMSTRONG, the giant
 * astronaut ghost with the enormous arms who guards the flag he planted.
 */
export const ENEMY_DEFS: Record<string, EnemyDef> = {
  wisp: {
    id: "wisp",
    name: "WISP",
    role: "minion",
    sprite: "wisp",
    // One base blaster hit: wisps are the horde's fodder — the flood is
    // only survivable because its front rank evaporates on contact.
    hp: 10,
    speed: 32,
    radius: 8,
    contactDamage: 6,
    critChance: 0.1,
    contactCooldownMs: 700,
    // Aggro exceeds the spawn ring: wave arrivals give chase instantly.
    ai: { aggroRadius: 360 },
  },
  ghost: {
    id: "ghost",
    name: "MOON GHOST",
    role: "minion",
    sprite: "ghost",
    hp: 45,
    speed: 42,
    radius: 9,
    contactDamage: 12,
    critChance: 0.1,
    contactCooldownMs: 700,
    ai: { aggroRadius: 380 },
  },
  wraith: {
    id: "wraith",
    name: "WRAITH",
    role: "minion",
    sprite: "wraith",
    hp: 90,
    speed: 56,
    radius: 9,
    contactDamage: 20,
    critChance: 0.12,
    contactCooldownMs: 700,
    ai: { aggroRadius: 400 },
  },
  armstrong: {
    id: "armstrong",
    name: "ARMSTRONG",
    role: "boss",
    sprite: "armstrong",
    hp: 550,
    speed: 52,
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
      upgrades: 2,
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
