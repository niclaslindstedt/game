// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Level furniture and geometry: obstacles, crates, design zones, tempo,
// chests, the intended path, doors, travel gates, and the fog-of-war map.

/**
 * Solid obstacles. Levels scatter them at creation (see LevelDef.obstacles);
 * nothing walks through one, and only jumpable ones can be cleared mid-air.
 */
export const OBSTACLES = {
  /** A jumpable obstacle is cleared while the player's z exceeds this. */
  clearHeight: 14,
  /** Keep obstacles at least this far from the player spawn (world px). */
  spawnClearance: 140,
  /** Minimum gap between two obstacles' edges, so lanes always exist. */
  spacing: 28,
} as const;

/**
 * CRATES — the breakable loot boxes scattered on levels (see crates.ts). A
 * crate is an ordinary jumpable obstacle (cover you can hop) that also carries
 * `hp`: the hero's autonomous weapon SMASHES it — his melee cone and his shots
 * damage it, and with no foe in reach the auto-attack turns on the nearest
 * crate — so a struck crate keels over like a slain mob and bursts, ALWAYS
 * spilling loot. The haul leans on healing and stamina (a reliable field
 * resource), sometimes pays gear, and — its whole point over a plain kill —
 * pays it GUARANTEED and rolls that gear HOTTER than a mob's, so a crate's
 * unique is meaningfully likelier than a regular kill's.
 */
export const CRATES = {
  /**
   * A crate's hp as a fraction of the current REFERENCE minion's bar
   * (`LEVELING.refMobHp` on the menace hp curve — the same anchor mob hp
   * scales against). Since the hero's own damage tracks that same bar all
   * campaign, this keeps a crate smashing open in about as many blows as a
   * weak trash mob takes, early game to endgame — never a chore, never free.
   */
  hpFraction: 0.6,
  /** Floor so an opening-level crate still takes a hit or two (world hp). */
  minHp: 12,
  /**
   * The GUARANTEED drop's category weights — exactly one primary drop is paid
   * every break, picked here. Healing and stamina dominate (the field
   * resource); gear is the rarer prize (rolled via `gearTierBonus`).
   */
  drop: {
    /** A medkit (the best tier the mob level has unlocked — `rollMedkitTier`). */
    health: 5,
    /** An energy drink (refills the sprint pool). */
    stamina: 4,
    /** A full equipment roll (see `gearTierBonus`). */
    gear: 3,
  },
  /**
   * Crate gear rolls HOTTER than a mob's: this tier-chance bonus sweetens the
   * rarity roll so a crate reaches magic/rare/unique more often, and the
   * natural unique FOLD (`rollEquipment`) fires more often — the reason a
   * crate's unique is "more likely than a regular mob". A mob's plain drop
   * gets only the small level-scaled bonus; a crate gets this on top.
   */
  gearTierBonus: 0.6,
  /**
   * After the guaranteed primary drop, the chance of ONE bonus consumable
   * (a second health/stamina pickup) on top, so cracking a crate feels like a
   * small haul rather than a single pickup.
   */
  bonusDropChance: 0.4,
  /** Scatter of a crate's drops around the break point (world px, each axis). */
  lootScatter: 26,
} as const;

/**
 * DESIGN ZONES (see src/game/zones.ts / the `level-design` skill): the shared
 * tuning for `LevelDef.safeZones` (no spawns + repel) and `quietZones` (no
 * ambient spawns). Only the repel margin is a number — the exclusion itself is
 * geometry.
 */
export const ZONES = {
  /**
   * How far past a safe zone's edge the horde is ejected each tick (world px),
   * added to the enemy radius by `repelFromZones`. A touch of slack so a mob
   * pinned at the boundary reads as kept-out, not glued to the line.
   */
  repelMargin: 6,
} as const;

/**
 * TEMPO (see `LevelDef.tempo` / `tempoIntensity` in step/): the clamp on the
 * interpolated wave-pressure multiplier, so an authored curve can't drive the
 * horde to zero or to a runaway flood.
 */
export const TEMPO = {
  /** Lowest pressure multiplier a tempo curve can dip to (a genuine lull). */
  min: 0.2,
  /** Highest pressure multiplier a tempo curve can peak at (a hard surge). */
  max: 3,
} as const;

/**
 * SPECIAL CHESTS (see `LevelDef.chests` / crates.ts): a placed reward container
 * — smashed open like a crate, but hardier and with a richer, guaranteed haul.
 * The payoff that makes a `quietZone` dead area worth the detour.
 */
export const CHESTS = {
  /** Break hp as a multiple of a crate's (a chest is a tougher nut). */
  hpMult: 2,
  /** Default sprite when a chest names none (the SpaceZ staff locker). */
  sprite: "locker",
  /**
   * Collision/cover radius (world px). Larger than a crate — a chest is a
   * landmark you can hide behind.
   */
  radius: 9,
  /**
   * The chest's gear tier bonus (hotter than a crate's `gearTierBonus`) — a
   * chest reaches magic/rare/unique and folds a natural unique far more often,
   * so its haul feels like a real find.
   */
  gearTierBonus: 1.1,
  /**
   * Chance the chest spills its MARQUEE equipment item — a Diablo-2 chest: the
   * prize drops most of the time (rolled hot enough to reach rare/unique), and
   * on the rare miss the container still gives up its guaranteed supplies. This
   * is the "80% item guarantee" a SpaceZ locker advertises.
   */
  itemChance: 0.8,
  /**
   * Chance at a SECOND bonus equipment item, rolled only when the marquee item
   * dropped — so a lucky locker occasionally coughs up two pieces of gear.
   */
  bonusItemChance: 0.35,
  /**
   * Guaranteed consumables (health/stamina) spilled regardless of the item
   * rolls — the "some other items" that make cracking a locker always worth it.
   */
  consumables: 2,
} as const;

/**
 * THE INTENDED PATH (`LevelDef.path` / path.ts): the authored waypoint route the
 * hero is meant to walk. A pure navigation aid the autopilot follows and the app
 * points a guidance arrow at.
 */
export const PATH = {
  /**
   * How close (world px) the hero must get to a waypoint to count it reached and
   * advance to the next. Generous — a bit under a phone half-view (≈211×97) — so
   * brushing through a corridor node counts even when the hero cuts the corner,
   * and the arrow flips to the next leg before he's on top of the old one.
   */
  reachRadius: 90,
  /**
   * Keep-clear margin (world px) around the path polyline: no scattered obstacle
   * is placed within this of the route, so the authored legs stay walkable and a
   * no-pathfinding runner marching between waypoints never wedges on furniture.
   * A clear lane ~2× this wide down the whole path.
   */
  clearance: 44,
} as const;

/** Locked doors (LevelDef.doors), opened by story-item keys. */
export const DOORS = {
  /** Carrying the key within this distance of the door slides it open. */
  openRadius: 40,
} as const;

/**
 * Travel gates (LevelDef.gates) — doorways to ANOTHER LEVEL, unlocked by a
 * story item (`requires`) the way keycards open doors. The engine only books
 * the crossing (`gateEntered`); the app owns the actual travel, carrying the
 * hero's build into a run of the destination level.
 */
export const GATES = {
  /** Stepping this close to an OPEN gate crosses it (world px). */
  enterRadius: 22,
  /** Default `reachExit` objective radius: standing this close to the exit
   * ends the level (world px) — deliberate contact, not a walk-by graze. */
  exitRadius: 30,
  /** How far ahead of the hero a used key tears its gate open (world px) —
   * past `enterRadius`, so crossing is a deliberate step, never a same-tick
   * surprise. */
  summonDistance: 48,
} as const;

/** The level map and its fog of war (see map.ts). */
export const MAP = {
  /** Fog-of-war grid cell size (world px). Coarse on purpose: the map reads
   * as chunky pixel terrain, and the whole grid stays a few thousand cells
   * even on the widest level. */
  cellSize: 32,
  /** Radius around the hero PERMANENTLY uncovered as he moves (world px) — the
   * fog lifts as a circle sweeping his path (Warcraft-style, no re-fogging), so
   * the map (and minimap) show exactly where he has been, not the whole camera
   * view. Roughly the phone's near view, so "walked past it" ≈ "on the map". */
  revealRadius: 160,
  /**
   * Width (world px) of the Warcraft-2 fog's TRANSITION band — the graded
   * ordered-dither frontier between the CLEAR terrain the hero has uncovered
   * and the solid-black terrain he never has. Everything he has explored reads
   * fully clear; only this thin outer rim of the exploration frontier stipples,
   * dense black against the dark and thinning to nothing as it meets the clear.
   * Mobs standing inside the band (or the dark beyond) are not drawn — the
   * horde only appears on ground the hero can actually see. Roughly a cell and
   * a half so the stipple reads as a soft edge, not a hard line.
   */
  fogBand: 48,
} as const;
