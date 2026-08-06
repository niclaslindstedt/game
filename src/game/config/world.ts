// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Level furniture and geometry: obstacles, crates, design zones, tempo,
// chests, the intended path, doors, travel gates, and the fog-of-war map.

/** Fog-of-war grid cell size (world px) — {@link MAP.cellSize}, named up here
 * because three of the map's other numbers are derived from it: two of the
 * fog's own, and the width of ground a lone obstacle may cover and still be
 * seen past ({@link OBSTACLES.loneSightSpan}). */
const FOG_CELL = 32;
/** Width of the fog's transition band (world px) — {@link MAP.fogBand}, named
 * for the same reason. */
const FOG_BAND = 48;

/**
 * Solid obstacles. Levels scatter them at creation (see LevelDef.obstacles);
 * nothing walks through one, and only jumpable ones can be cleared mid-air.
 */
export const OBSTACLES = {
  /** A jumpable obstacle is cleared while the player's z exceeds this. */
  clearHeight: 14,
  /** Keep obstacles at least this far from the player spawn (world px). */
  spawnClearance: 140,
  /**
   * Minimum gap between two obstacles' edges, so lanes always exist.
   *
   * It doubles as the SIGHT rule's "these two are one thing" threshold (see
   * obstacles.ts): the scatter guarantees more than this much air around every
   * piece it strews, so two obstacles standing closer than it were put there
   * deliberately — a wall's own chain, a rank of machinery — and read as a
   * LINE rather than as two loose props.
   */
  spacing: 28,
  /**
   * SIGHT: the widest a LONE obstacle may be and still be seen past (world px)
   * — one unit of ground, which is one fog cell.
   *
   * A single crate, a single scattered rock, the one boulder in the basin: the
   * player looks straight past it. Anything wider than a unit hides what is
   * behind it on its own — a building, a big sized rock, a long box wall — and
   * so does any piece standing in line with another (see `spacing` above).
   * The reasoning, and why the physical queries are unaffected, is the
   * "What blocks SIGHT" block in obstacles.ts.
   */
  loneSightSpan: FOG_CELL,
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
    /**
     * A box of AMMUNITION — the heaviest single weight in the spill, and the
     * reason a shooter crosses a room to smash a crate. Read through
     * `ammoAppetite` like the two consumables above it, so a full pouch (or a
     * hero swinging a sword) hands most of this weight back to the others
     * rather than paying out rounds he cannot carry.
     */
    ammo: 6,
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
  /** Default sprite when a chest names none (the GOODCO staff locker). */
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
   * is the "80% item guarantee" a GOODCO locker advertises.
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
 * Elevators (LevelDef.elevators) — pads that carry the hero to somewhere the
 * map's walls do not connect to (see `ElevatorState`).
 */
export const ELEVATOR = {
  /** Stepping this close to a pad calls the car (world px). Tighter than a
   * doorway on purpose: riding is a deliberate step ONTO the plate, not
   * something that happens while walking past it. */
  rideRadius: 30,
  /**
   * Grace after a ride during which no pad fires (ms).
   *
   * The car sets the hero down on the pad at the far end, which is inside its
   * own contact radius, so without this the lift bounces him between the two
   * ends forever. Long enough to step off a plate at walking pace.
   */
  lockMs: 1400,
  /** Fog lifted around the arrival point, so the hero can see the room he was
   * just dropped into (world px). */
  arrivalReveal: 260,
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

/**
 * TIME OF DAY — the clock's hours mapped onto how much daylight a venue
 * standing under a SKY is given (`LevelDef.sky`, `GameState.daylight`).
 *
 * The engine never asks what time it is: a run is handed its light level as a
 * session parameter, because the wall clock is the app's to read and a run that
 * sampled it would build a different world on each machine of a party (see
 * `RunParams.daylight`). All this block owns is the SHAPE of the day — where
 * the plateaus sit and how long the two ramps take — so the app answers with a
 * number rather than with a policy.
 *
 * The ramps are deliberately long. A garage that snapped from noon to midnight
 * on the stroke of an hour would read as a bug; three hours of dusk is a lit
 * lamp coming up under a sky that is still blue, which is the picture the hour
 * actually looks like.
 */
export const DAYLIGHT = {
  /** Full daylight from this hour (local, 0–24). */
  dayFrom: 8,
  /** …until this one, when the light starts going. */
  dayUntil: 18,
  /** Fully dark from this hour — the deep night the story's first scene is in. */
  nightFrom: 21,
  /** …until this one, when the first light shows. */
  nightUntil: 5,
} as const;

/** The level map and its fog of war (see map.ts). */
export const MAP = {
  /** Fog-of-war grid cell size (world px). Coarse on purpose: the map reads
   * as chunky pixel terrain, and the whole grid stays a few thousand cells
   * even on the widest level. */
  cellSize: FOG_CELL,
  /** Radius around the hero PERMANENTLY uncovered as he moves (world px) — the
   * fog lifts as a circle sweeping his path (Warcraft-style, no re-fogging), so
   * the map (and minimap) show exactly where he has been, not the whole camera
   * view. Roughly the phone's near view, so "walked past it" ≈ "on the map".
   * The sweep is LINE-OF-SIGHT limited: a wall inside the disc casts a shadow
   * and the ground behind it stays dark until he walks somewhere he can see it
   * from (`revealAround` in fog.ts). */
  revealRadius: 160,
  /**
   * How far PAST the thing that blocks his view the sweep still reaches (world
   * px) — the depth of the first step of a wall's shadow.
   *
   * It is not slop. A sight line that stopped exactly ON the wall would leave
   * the wall's own cells fogged, which puts a fog FRONTIER along the inside
   * face of every wall in the level — and the frontier is what {@link
   * MAP.fogBand} stipples over and what `clearOfFog` refuses to target inside
   * of. Every mob standing within a band of a wall would go undrawn and
   * unshootable, in the room the hero is standing in. So the sweep reaches a
   * band PLUS a half cell past the blocker: a band, so the drawn clear ground
   * runs all the way up to the wall rather than stopping short of it, and a
   * half cell because the grid answers per cell CENTRE and the first fogged
   * centre can sit anywhere inside its cell.
   *
   * What it costs is a sliver — under a cell — of the floor immediately behind
   * a thin wall being marked seen. The band covers it: that sliver draws as
   * stipple, and a body standing on it is still hidden and still not a target.
   */
  fogWallDepth: FOG_BAND + FOG_CELL / 2,
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
  fogBand: FOG_BAND,
} as const;
