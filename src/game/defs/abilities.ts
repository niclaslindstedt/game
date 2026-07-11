// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The ability catalog: time-limited powers granted by pickups, Diablo-style.
// An ability item is banked on touch (it never enters the inventory) and runs
// for its duration when spent. A `stackable` power can run several copies at
// once — activating a second STORM CELL doubles the lightning; a non-stackable
// one (the MAGNET) refuses to re-enable while a copy is already running, so its
// pickup stays banked for later instead of being wasted.
// Levels choose which abilities can drop via their loot.abilityPool.

export type AbilityKind = "orbit" | "storm" | "stasis" | "nuke" | "magnet";

export type AbilityDef = {
  id: string;
  /** Display name (pickup toast, HUD). */
  name: string;
  kind: AbilityKind;
  /** How long one pickup lasts. */
  durationMs: number;
  /**
   * Whether several copies may run simultaneously. When true, each activation
   * adds a fresh instance (two STORM CELLs strike twice as often); when false
   * (the default), a copy already running blocks re-activation — the pickup is
   * kept banked rather than wasted (the MAGNET, whose pull can't stack).
   */
  stackable?: boolean;
  /**
   * Whether the powerup dock holds at most ONE of this pickup at a time. When
   * true, a second pickup is refused while one is already banked — it stays on
   * the ground (like an over-cap pickup) and the merchant won't sell one
   * either (see `canBankAbility`). The NUKE: a pocket full of screen-wipes
   * trivializes every swarm, so one is the limit.
   */
  uniqueHeld?: boolean;
  /** Ground-item icon sprite. */
  icon: string;
  /** `orbit`: projectiles circling the player, mangling what they touch. */
  orbit?: {
    count: number;
    /** Orbit distance from the player (world px). */
    radius: number;
    /** Sweep speed in radians/s. */
    angularSpeed: number;
    /** Damage per tick per orb (before the crit roll). */
    damage: number;
    /** Each orb hits at most once per this interval. */
    hitCooldownMs: number;
    /** Orb collision radius. */
    orbRadius: number;
    /** Sprite the renderer draws for each orb. */
    sprite: string;
  };
  /** `storm`: bolts periodically strike the nearest monster. */
  storm?: {
    intervalMs: number;
    damage: number;
    /** Strikes reach this far from the player. */
    range: number;
  };
  /** `stasis`: monsters inside the field crawl. */
  stasis?: {
    radius: number;
    /** Multiplier on enemy speed inside the field (0.3 = 70% slower). */
    slowFactor: number;
  };
  /**
   * `nuke`: instant, not timed — using it kills every horde minion within
   * the radius (roughly the visible screen) on the spot. Elites and bosses
   * are immune; the set-piece fights still have to be fought.
   */
  nuke?: {
    radius: number;
  };
  /** `magnet`: ground items inside the radius are pulled to the player. */
  magnet?: {
    /** Base pull radius (world px). */
    radius: number;
    /** Extra radius per point of INTELLIGENCE. */
    radiusPerInt: number;
    /** How fast caught items fly at the player (world px/s). */
    pullSpeed: number;
  };
};

export const ABILITY_DEFS: Record<string, AbilityDef> = {
  fire_orbs: {
    id: "fire_orbs",
    name: "FIRE ORBS",
    kind: "orbit",
    durationMs: 12_000,
    stackable: true,
    icon: "icon_fire_orbs",
    orbit: {
      count: 3,
      radius: 38,
      angularSpeed: 3.2,
      damage: 14,
      hitCooldownMs: 140,
      orbRadius: 8,
      sprite: "fireball",
    },
  },
  storm_cell: {
    id: "storm_cell",
    name: "STORM CELL",
    kind: "storm",
    durationMs: 10_000,
    stackable: true,
    icon: "icon_storm",
    storm: { intervalMs: 450, damage: 25, range: 220 },
  },
  stasis_field: {
    id: "stasis_field",
    name: "STASIS FIELD",
    kind: "stasis",
    durationMs: 9_000,
    icon: "icon_stasis",
    stasis: { radius: 130, slowFactor: 0.3 },
  },
  screen_nuke: {
    id: "screen_nuke",
    name: "NUKE",
    kind: "nuke",
    durationMs: 0, // instant — never becomes an ActiveAbility
    uniqueHeld: true, // one bomb in the dock at a time
    icon: "icon_nuke",
    // Radius comfortably covers the phone-landscape view (half-diagonal
    // ≈ 232 world px, see AGENTS.md) from a player at its center.
    nuke: { radius: 240 },
  },
  item_magnet: {
    id: "item_magnet",
    name: "MAGNET",
    kind: "magnet",
    durationMs: 12_000,
    icon: "icon_magnet",
    magnet: { radius: 80, radiusPerInt: 8, pullSpeed: 200 },
  },
};

// Active registry the accessor reads (defaults to the shipped catalog;
// tests swap in fixtures via `registerDefs`). See src/index.ts.
let activeAbilityDefs: Record<string, AbilityDef> = ABILITY_DEFS;

/** Test/authoring hook: replace the active ability catalog. */
export function setAbilityDefs(defs: Record<string, AbilityDef>): void {
  activeAbilityDefs = defs;
}

/** Look up an ability def; throws on a broken id so bugs surface loudly. */
export function abilityDef(defId: string): AbilityDef {
  const def = activeAbilityDefs[defId];
  if (!def) throw new Error(`unknown ability def "${defId}"`);
  return def;
}
