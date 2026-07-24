// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Environmental hazards (gravity wells, asteroids, hay balls, sand storms,
// stampedes) and the Projectile they and every weapon share.

import type { Vec2 } from "@game/lib/vec.ts";

import type { WeaponClass } from "./core.ts";

/**
 * A black hole built from the level def (LevelDef.wells): a static gravity
 * well that drags the grounded player, enemies, and loose items toward
 * `pos`. Numbers are resolved from the config WELLS defaults at creation.
 */
export type GravityWell = {
  id: number;
  pos: Vec2;
  /** Reach of the pull on the player and enemies (world px). */
  pullRadius: number;
  /** Inside this the hole devours minions and the grounded player alike. */
  coreRadius: number;
  /** Peak pull at the core's edge (px/s), linear falloff to the reach. */
  pullSpeed: number;
  /** Reach of the pull on loose loot (world px) — about a screen away, so
   * drops slide in from well beyond the player's own pull. */
  lootRadius: number;
};

/**
 * A meteor strike (config ASTEROIDS; a level turns the rain on with
 * LevelDef.asteroids): falls out of the sky on a slant toward a target patch
 * near the player and DETONATES on impact — an AoE that vaporizes minions in
 * the lethal core, flings everything else (and the grounded hero) to the
 * sides, bites the hero's hp by how near the centre he stood, and leaves a
 * crater. The engine tracks the fall by its timer (`ageMs`/`fallMs`); the
 * renderer derives the rock's air position and shadow from the same progress.
 * Ignores obstacles and level bounds.
 */
export type Asteroid = {
  id: number;
  /** Ground impact point — where the shadow sits, the telegraph firms, and the
   * blast lands. */
  target: Vec2;
  /** Ground-projected entry point, offset up-range from `target` along the
   * incoming bearing, so the rock streaks in on a slant from a varied angle. */
  entry: Vec2;
  /** Total fall time from entry (high) to impact (ms). */
  fallMs: number;
  /** Elapsed fall time (ms); at `fallMs` the rock detonates. */
  ageMs: number;
  /** Explosion (AoE) radius on impact (world px). */
  blastRadius: number;
  /** Visual rock radius (world px; the renderer sizes the sprite off it). */
  rockRadius: number;
  /** Visual spin rate in radians/s (rolled at spawn; renderer only). */
  spin: number;
};

/**
 * A crater left where a meteor struck (config ASTEROIDS): a ground scar that
 * lingers then fades once the dust settles. Purely cosmetic — it never blocks
 * movement or sight. Levels whose surface can scar name the sprite pool via
 * `asteroids.craterSprites`; a scar picks one at birth.
 */
export type Crater = {
  id: number;
  pos: Vec2;
  /** Scar radius (world px; the renderer sizes the sprite off it). */
  radius: number;
  /** Elapsed life (ms). */
  ageMs: number;
  /** Total lifetime (ms) before it is gone; the last `craterFadeMs` fade out. */
  ttlMs: number;
  /** The sprite drawn for this scar, chosen from the level's crater pool. */
  sprite: string;
  /** Visual rotation (radians; rolled at birth) so scars don't tile in
   * lockstep. */
  angle: number;
};

/**
 * A spinning HAY BALL (config HAY_BALLS; a level rolls them in with
 * LevelDef.hayBalls): mints just past the right screen edge and rolls straight
 * to the LEFT across the field, spinning and hopping (both renderer-only). It
 * costs the grounded hero a very slight flat hp once on contact and SHOVES him
 * left every tick it overlaps, plows minions aside, and despawns once past the
 * player's stage. Ignores obstacles and level bounds.
 */
export type HayBall = {
  id: number;
  pos: Vec2;
  /** Roll speed to the left (px/s). */
  speed: number;
  radius: number;
  /** Visual spin rate in radians/s (rolled at spawn; renderer only). */
  spin: number;
  /** Latched once it has taken its one slight hp bite from the hero — the
   * shove keeps coming every tick, but the bale only nicks him once. */
  struck: boolean;
};

/**
 * A drifting SAND STORM (config SANDSTORMS; a level turns the squalls on with
 * LevelDef.sandstorms): a small dust gust that crosses the field in a straight
 * line, shoves minions aside like an asteroid, and — catching the grounded
 * hero — strikes him ONCE (a scaled bite AND a knockout, `Player.knockoutMs`)
 * before drifting on and thinning out. Ignores obstacles and level bounds.
 */
export type SandStorm = {
  id: number;
  pos: Vec2;
  /** Unit direction of drift. */
  dir: Vec2;
  speed: number;
  /** Body radius (world px). */
  radius: number;
  /** Visual swirl phase (rolled at spawn; renderer only). */
  spin: number;
  /** Latched once it has caught the hero — one knockout per storm. */
  struck: boolean;
  /**
   * Ms left in the fade-out that begins when the storm strikes (config
   * SANDSTORMS.fadeMs). `null` until it strikes; once it hits 0 the storm is
   * spent and despawns. The renderer thins the gust as it counts down, so the
   * storm visibly passes over the fallen hero and vanishes.
   */
  fadeMs: number | null;
};

/**
 * One panicked staffer in a stampede herd — a renderer/spawn record only (the
 * herd's collision is a single band around the anchor, not per-runner). Its
 * offset from the herd anchor, which of the three employee sprites it wears,
 * and a bob phase so the pack's legs don't pump in lockstep.
 */
export type StampedeRunner = {
  /** Offset from the herd anchor along the charge (px) — the ragged column. */
  dx: number;
  /** Offset from the herd anchor across the charge (px) — the wall's spread. */
  dy: number;
  /** Which employee sprite (0..2 → the three runner looks). */
  variant: number;
  /** Per-runner bob phase (0..1) so the legs pump out of step. */
  phase: number;
};

/**
 * An EMPLOYEE STAMPEDE (config STAMPEDES; a level turns them on with
 * LevelDef.stampedes): a herd of `runnerCount` staffers that mints past the
 * right screen edge and charges straight LEFT at great speed as one wall,
 * trailing a dust cloud. It bowls minions in its band OVER (flung aside AND
 * knocked out for a few seconds, not killed — no farm, no thinning), shoves
 * elites/bosses, and — catching the grounded hero — strikes him ONCE (a
 * difficulty-scaled max-hp bite AND a knockdown, `Player.knockoutMs`) before
 * charging on. A jump sails clean over its thin collision line. Ignores
 * obstacles and bounds.
 */
export type Stampede = {
  id: number;
  /** Herd anchor — the collision band's centre; the runners ride offsets. */
  pos: Vec2;
  /** Charge speed to the left (px/s). */
  speed: number;
  /** The individual runners, rolled at spawn (renderer + spawn only). */
  runners: StampedeRunner[];
  /** Latched once it has trampled the hero — one knockdown per herd. */
  struck: boolean;
};

/**
 * The APPROACH TELEGRAPH for a coming EMPLOYEE STAMPEDE (config
 * STAMPEDES.telegraphMs, difficulty-scaled): over the last stretch of the spawn
 * countdown a line of DUST kicks up along the exact lane the wall will charge
 * down, so the player can read WHICH band to clear before the runners appear.
 * The lane `y` is rolled the instant the telegraph lights and the herd then
 * mints on it, so the dust and the wall never disagree. Renderer-only state
 * (like `Stampede`); the app draws the dust from it and its `ageMs / leadMs`
 * progress (fading in as the spawn nears).
 */
export type StampedeWarn = {
  /** The world-y lane centre the herd will charge down (absolute, locked at
   * telegraph time so the dust marks exactly where the wall arrives). */
  y: number;
  /** Total telegraph lead (ms) — the difficulty-scaled `STAMPEDES.telegraphMs`. */
  leadMs: number;
  /** How long the telegraph has been up (ms); `ageMs / leadMs` is its 0..1 fade. */
  ageMs: number;
};

export type Projectile = {
  id: number;
  pos: Vec2;
  /** Unit direction of travel. */
  dir: Vec2;
  speed: number;
  radius: number;
  /** Damage before the on-hit crit roll. */
  damage: number;
  /** Where `damage` landed in the weapon's variance band, in [0, 1] (see
   * `rollWeaponHit`) — carried so a crit's popup can be sized by how hard the
   * shot rolled. */
  damageRoll?: number;
  /** Remaining ms before the projectile despawns. */
  lifetimeMs: number;
  /** Which weapon class fired it (drives sound and hit resolution). */
  weaponClass: WeaponClass;
  /** The sprite the renderer draws for this shot (staple, zap, vial…). */
  sprite: string;
  /**
   * Foes this shot may still punch THROUGH (a railgun's line) — decremented
   * per body; the shot dies when a hit lands with this at 0. Absent = 0.
   */
  pierceLeft?: number;
  /** Homing turn rate in radians/s (a smart pistol's darts); absent = 0. */
  homing?: number;
  /**
   * BLAST radius (world px) this shot detonates in on impact — a SEEKER ORB's
   * arcane burst (magic-tree talent). On a hit the shot bills every foe within
   * `burst` of the impact for its full `damage` (a `nova` cue rings it) and is
   * spent. Absent = a plain single-target shot. Mutually exclusive with pierce.
   */
  burst?: number;
  /**
   * Chain-lightning leaps still owed on the first hit (see
   * `WEAPON.chainRange` / `chainDamageFrac`). Absent = no chaining.
   */
  chain?: number;
  /** Enemy ids already struck by this shot, so a piercing round never bills
   * the same body twice while passing through it. */
  hitIds?: number[];
  /** The VOLLEY this shot belongs to — one trigger pull's `count` pellets share
   * a single id (set only on the HERO's shots). Rides out on each hit's
   * `enemyHit.fromVolley` so the ranged AoE calibration can group a volley's
   * hits and count the DISTINCT foes it reached. Absent on companion shots. */
  volley?: number;
  /**
   * The COMPANION that fired this shot (a `Companion.id`) — carried so a
   * kill downstream can float its quote (see maybeCompanionQuote), and so
   * the hit skips the hero's accuracy roll (companions never miss; they
   * have no DEXTERITY to earn it back with). Absent on the hero's shots.
   */
  companionId?: number;
  /**
   * A HOSTILE shot — fired by an enemy (`EnemyDef.ranged`) at the PLAYER.
   * It never touches the horde: `stepProjectiles` moves it, walls eat it,
   * and it resolves against the hero alone (armor applies; a jump sails
   * over it like it clears enemy contact). Absent on the hero's and the
   * companions' shots.
   */
  hostile?: boolean;
  /**
   * A hostile shot's firing MONSTER LEVEL — the attacker level the hero's
   * armor reduction is judged against (see `armorReduction`), stamped from
   * the shooter's `mlvl` when it fires. Absent on friendly shots.
   */
  sourceMlvl?: number;
  /**
   * A hostile shot's firing enemy defId — stamped when it fires so a landed
   * hit can attribute its `playerHurt.cause` to the shooter (the simulator's
   * death ledger). Absent on friendly shots.
   */
  sourceDefId?: string;
  /** The firing weapon's crit-damage multiplier (see `weaponCritMult`) —
   * carried so the hit resolves with the cadence-weighted crit. Absent =
   * the global `STATS.critMultiplier`. */
  critMult?: number;
  /**
   * Height above the ground at which the shot is drawn — inherited from a
   * jumping shooter, sinking back to 0 in flight. Visual only.
   */
  z: number;
};
