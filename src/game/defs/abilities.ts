// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The ability catalog's TYPES and accessors: time-limited powers granted by
// pickups, Diablo-style. An ability item is banked on touch (it never enters
// the inventory) and runs for its duration when spent. A `stackable` power can
// run several copies at once — activating a second STORM CELL doubles the
// lightning; a non-stackable one (the MAGNET) refuses to re-enable while a copy
// is already running, so its pickup stays banked for later instead of being
// wasted. Levels choose which abilities can drop via their loot.abilityPool,
// and the campaign INTRODUCES TWO NEW POWERS PER MAP.
//
// The shipped catalog is CONTENT, not code: `content/powerups.yaml` is the
// single source of truth (every duration, damage figure, and radius is tuned
// there), compiled to `src/generated/powerups.ts` by
// `scripts/generate-powerups.mjs` and re-exported here as ABILITY_DEFS — so
// every existing `defs/abilities.ts` import keeps working and a rebalance
// never touches engine code. This module owns the TYPES that file is validated
// against (asset-tools/powerup-schema.mjs mirrors them); keep the two in step
// when a kind gains a field.

import { GENERATED_POWERUPS } from "../../generated/powerups.ts";

/**
 * Every EFFECT BLOCK a power may carry, in catalog order.
 *
 * A power is a COMPOSITION of effects, not a single one: it carries its
 * `kind`'s block and MAY carry any of the others. Nothing dispatches on `kind`
 * — the engine steps (`stepAbilities`/`stepPowerups`) and the app draws
 * (`drawRunningPowerups`) whichever blocks are PRESENT — so a def carrying
 * `orbit` and `pulse` orbits and pulses with no side learning a new kind.
 * Iterate this when the question is "what does this power DO" rather than
 * "what is it called".
 */
export const ABILITY_BLOCKS = [
  "orbit",
  "storm",
  "stasis",
  "nuke",
  "magnet",
  "trail",
  "barrier",
  "rain",
  "phase",
  "well",
  "surge",
  "pulse",
  "volley",
  "turret",
  "ward",
  "singularity",
  "immolation",
] as const;

export type AbilityKind = (typeof ABILITY_BLOCKS)[number];

/**
 * One power's colour kit. Every colour is an `r, g, b` triple (no alpha) so the
 * draw code can dial the alpha per layer — that is what keeps additive light
 * additive.
 */
export type AbilityLook = {
  /** The power's own hue — rims, rings, arcs. */
  core: string;
  /** The hot inner light (usually a paler version of `core`). */
  hot: string;
  /** The dark that grounds it — a scorch, a throat, a shadow. */
  deep: string;
  /** Motes/embers/grit thrown by the effect. */
  spark: string;
  /**
   * How a `well`'s core reads: `void` swallows (a black throat under a lensing
   * ring, streaks falling IN), `grit` shreds (a spinning dust column, motes
   * flung around it). Only read by the `well` block.
   */
  wellLook?: "void" | "grit";
};

export type AbilityDef = {
  id: string;
  /** Display name (pickup toast, HUD). */
  name: string;
  /**
   * WHAT THIS POWER IS, in prose — one authored paragraph, REQUIRED.
   *
   * The twin of `EnemyDef.lore`, and it exists for the same reason: nothing in
   * the game ever explains a power. It arrives as an icon on the floor, runs
   * for a few seconds and is gone, so a player who never worked out that the
   * ION WAKE wants to be run in circles never finds out. The dock has no room
   * to say so and the fight is the wrong moment to read it — which leaves the
   * LIBRARY as the only surface that can, and the only reader of this field.
   *
   * Written in the same dry register an item's `description` is, and bound by
   * the story chain exactly as a monster's lore is: it may ELABORATE what
   * `docs/story.md` and `docs/manuscript.md` already establish and must never
   * introduce a plot fact of its own.
   */
  lore: string;
  /**
   * The block this power LEADS WITH — a label, never a dispatch key. It names
   * the def's headline effect for the surfaces that need one word for a whole
   * power (the bot's valuation, the ONE NUKE loot rule, the screen aura), and
   * the def must carry the block it names. Everything that acts on what a power
   * DOES reads the blocks instead, so a composed power is stepped and drawn in
   * full while still calling itself one thing.
   */
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
  /**
   * This power's OWN sound, by id — a `content/sounds/<id>.yaml` entry, or one
   * a mod ships.
   *
   * Omitted (the shipped powers all omit it), the app plays the sound for the
   * EVENT the power throws, which is how the game has always sounded. Set, it
   * plays that instead. It exists for the same reason `WeaponDef.sfx` does: a
   * mod's power could otherwise only ever sound like whichever shipped power
   * happens to share its effect, because sounds are chosen by the event's
   * shape rather than by whose power threw it.
   */
  sfx?: string;
  /**
   * RELATIVE ODDS this power is the one a drop (or a stall slot) rolls out of
   * the level's pool — a WEIGHT, not a probability, defaulting to
   * `ABILITY_DEFAULT_RARITY` so an un-annotated catalog picks uniformly the way
   * it always did. Lower is rarer: a power weighted 25 turns up a quarter as
   * often as its 100-weight shelfmates.
   *
   * It exists because a pool is a FLAT list and the powers in it are not: a
   * campaign pool grows to fourteen entries by the bunker, and picking uniformly
   * made the run-saving ones (the death ward, the anchored black hole) exactly as
   * common as three orbiting fireballs. A power's weight is the one place to say
   * "this one is a moment, not a resource" — and the stall reads it too, both to
   * choose what it stocks and to PRICE it (`ECONOMY.abilityRarityMarkupCap`), so
   * coins can't buy past the rarity.
   */
  rarity?: number;
  /**
   * How the power LOOKS — its colour kit, and the one shape choice a kit makes.
   *
   * A power's BLOCKS decide what is drawn (a well draws a core, a trail draws
   * burning patches); this decides how it reads, which is what lets two powers
   * sharing an effect be completely different things: the DUST DEVIL is a red
   * grit column that hunts and the EVENT HORIZON is a black throat that
   * swallows, and both are nothing but a `well` with a different kit.
   *
   * Authored here rather than in the app so a MOD can reach it. Omitted, the
   * power wears the app's neutral default — so an un-styled power still draws,
   * it just doesn't yet look like itself.
   */
  look?: AbilityLook;
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
   * `nuke`: instant, not timed — using it detonates a blast over the radius
   * (roughly the visible screen) that deals 200% of the MEAN health of every
   * monster it catches — minions, elites, and bosses alike, no one exempt — so
   * the rank and file are wiped outright while the heavier foes are only
   * chunked. The blow can crit like any other.
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
  /**
   * `trail`: the hero lays a burning WAKE behind him — a patch dropped every
   * `dropMs` that keeps scorching whatever stands in it for `patchMs`. The
   * damage is the ground's, not a blow: it bills on the patch's own tick, so
   * kiting a pack across the wake cooks the whole line.
   */
  trail?: {
    /** Ms between the patches the hero sheds while he moves. */
    dropMs: number;
    /** How long one patch keeps burning after it lands. */
    patchMs: number;
    /** A patch's scorch reach (world px). */
    radius: number;
    /** Damage one scorch tick bills a foe standing in a patch. */
    damage: number;
    /** Ms between a patch's scorch ticks. */
    tickMs: number;
  };
  /**
   * `barrier`: a plated shell that EATS incoming damage until its pool is
   * spent, then shatters (the power ends early — a barrier is a budget, not a
   * timer). Sized as a fraction of the hero's max hp so it stays meaningful at
   * every level instead of decaying into a rounding error.
   */
  barrier?: {
    /** Starting pool as a fraction of the hero's max hp. */
    poolFrac: number;
  };
  /**
   * `rain`: impacts FALL around the hero on an interval — each cratering
   * everything inside `radius` of where it lands. Strikes are aimed at foes
   * within `range` (and scattered near the hero when the field is empty), so
   * the barrage tracks the fight instead of shelling empty ground.
   */
  rain?: {
    intervalMs: number;
    /** Impacts per fall. */
    count: number;
    /** One impact's blast reach (world px). */
    radius: number;
    /** Damage every foe inside the blast takes. */
    damage: number;
    /** How far from the hero an impact may land (world px). */
    range: number;
  };
  /**
   * `phase`: the hero goes SPECTRAL — contact blows and hostile shots pass
   * clean through him for the duration. It buys time, never damage: the horde
   * still walks him down, it just can't lay a hand on him.
   */
  phase?: {
    /** Walk-speed multiplier while spectral (the drift of the untethered). */
    speedMult: number;
  };
  /**
   * `well`: a gravity well — a core that HAULS the horde inward and grinds
   * everything caught inside it. `chase` roams the core toward the nearest foe
   * (a wandering cyclone); 0 anchors it where it was spent (a black hole torn
   * into one spot).
   */
  well?: {
    /** The core's reach (world px). */
    radius: number;
    /** Damage one grind tick bills every foe inside. */
    damage: number;
    /** Ms between grind ticks. */
    tickMs: number;
    /** World px/s the caught are dragged toward the core. */
    pull: number;
    /** World px/s the core itself roams toward the nearest foe (0 = anchored). */
    chase: number;
  };
  /**
   * `surge`: the hero's OWN blows run hot — every weapon hits harder and comes
   * around faster while it burns. Pure buff, no damage of its own; it reads on
   * the item card and the DPS readout exactly as it reads in the fight
   * (`weaponDamageFor` / `weaponCooldownFor` apply it).
   */
  surge?: {
    /** Multiplier on weapon damage. */
    damageMult: number;
    /** Multiplier on the weapon cooldown (<1 = faster). */
    cooldownMult: number;
  };
  /**
   * `pulse`: a ring washes OUT of the hero on an interval, billing and SHOVING
   * everything it passes through. The opposite read of the well — the crowd is
   * thrown off him instead of hauled together.
   */
  pulse?: {
    intervalMs: number;
    /** How far the wave reaches (world px). */
    radius: number;
    damage: number;
    /** How far the caught are shoved outward (world px). */
    push: number;
  };
  /**
   * `volley`: shots loose THEMSELVES at the nearest foe on an interval — the
   * hero's hands stay on his own weapon. Every field is the projectile the
   * volley pushes, so one kind covers a pair of homing phantom rounds and a
   * line of trampling heavies.
   */
  volley?: {
    intervalMs: number;
    /** Shots per volley. */
    count: number;
    /** Radians the fan spans across `count` shots. */
    spread: number;
    speed: number;
    /** Projectile collision radius (world px). */
    radius: number;
    damage: number;
    lifetimeMs: number;
    /** Sprite the renderer draws for the shot. */
    sprite: string;
    /** How far a foe may be and still draw a volley (world px). */
    range: number;
    /** Homing turn rate in radians/s; absent = it flies straight. */
    homing?: number;
    /** Bodies one shot punches THROUGH before it dies; absent = 0. */
    pierce?: number;
    /** Blast reach on impact; absent = a plain single-target shot. */
    burst?: number;
  };
  /**
   * `turret`: guns DEPLOY on a ring where the power was spent and rake the
   * field from where they stand. The hero can walk away from his own covering
   * fire — the grid holds the ground, not him.
   */
  turret?: {
    /** Guns deployed. */
    count: number;
    /** The ring they are planted on, around the spend point (world px). */
    radius: number;
    /** Ms between one gun's shots. */
    intervalMs: number;
    damage: number;
    /** How far a gun can see (world px). */
    range: number;
    speed: number;
    /** Projectile collision radius (world px). */
    projectileRadius: number;
    /** Sprite the renderer draws for the SHOT. */
    sprite: string;
    /**
     * Sprite the renderer draws for the deployed GUN itself. Optional, and the
     * app falls back to the shipped `sentry_gun` — which is what it used to
     * hardcode, so a mod's turret grid deployed GOODCO hardware whatever its
     * own art said.
     */
    gunSprite?: string;
  };
  /**
   * `ward`: while it holds, a lethal blow CANNOT land — damage that would take
   * the hero under is clipped so he is left standing on `floor` hp. It buys a
   * window, not a life: when the ward lapses the next blow kills like any
   * other.
   */
  ward?: {
    /** The hp a clipped blow leaves the hero standing on. */
    floor: number;
  };
  /**
   * `singularity`: a vortex COLLAPSES on the nearest cluster every interval,
   * dragging every body inside it toward the core and crushing them. The twin
   * of `well` and deliberately not the same effect: a well is a core placed
   * where the power was spent and dragging continuously, while a singularity
   * re-centres on the horde at every collapse — a periodic event with a
   * position rather than a thing standing on the field.
   *
   * Shared with the magic tree's ARCANE SINGULARITY, which reaches the same
   * implementation through the granted-spell carrier (see ability-effects.ts).
   */
  singularity?: {
    intervalMs: number;
    /** One collapse's reach (world px). */
    radius: number;
    /** Damage every body inside the collapse takes. */
    damage: number;
    /** World px each victim is dragged toward the core per collapse. */
    pull: number;
    /** How far a cluster may be and still draw a collapse (world px). */
    range: number;
  };
  /**
   * `immolation`: a burning ring around the HERO scorching everything whose
   * body enters it, on a fast tick. The twin of `pulse` minus the shove and the
   * wave — it holds a space rather than washing out of one, so it reads as heat
   * the hero carries instead of as a blow he throws.
   *
   * Shared with the magic tree's IMMOLATION AURA (see `singularity`).
   */
  immolation?: {
    /** The ring's reach (world px). */
    radius: number;
    /** Damage one tick bills a body standing in the ring. */
    damage: number;
    /** Ms between scorch ticks. */
    tickMs: number;
  };
};

/** The shipped catalog, compiled from `content/powerups.yaml`. */
export const ABILITY_DEFS: Record<string, AbilityDef> = GENERATED_POWERUPS;

/**
 * THE ONE POWER THE ENGINE KNOWS BY NAME — the screen-nuke.
 *
 * Every other power reaches the player exactly one way: a level's authored
 * `loot.abilityPool`, picked from by weight. The bomb is not in any pool at
 * all. It has two channels of its own written into the loot rules — a flat
 * slice of every payout (`LOOT.nukeShare`) and the packed-field mercy roll
 * (`crowdBombChance`) — plus the ONE NUKE gate that stops a second one existing
 * while one waits, and the blast the hero's own detonation reads its radius
 * from.
 *
 * So the id is a constant rather than a string literal repeated at five call
 * sites, exactly as `UNARMED_DEF_ID` is for the other thing the engine mints
 * without a catalog asking it to.
 */
export const NUKE_DEF_ID = "screen_nuke";

// Active registry the accessor reads (defaults to the shipped catalog;
// tests swap in fixtures via `registerDefs`). See src/index.ts.
let activeAbilityDefs: Record<string, AbilityDef> = ABILITY_DEFS;

/** Test/authoring hook: replace the active ability catalog. */
export function setAbilityDefs(defs: Record<string, AbilityDef>): void {
  activeAbilityDefs = defs;
}

/**
 * The effect blocks `def` actually carries, in `ABILITY_BLOCKS` order.
 *
 * The one accessor for "what does this power do". Read it rather than `kind`
 * anywhere a power's BEHAVIOUR is being judged — a composed power answers for
 * every effect it carries, where `kind` would only ever name the first.
 */
export function abilityBlocks(def: AbilityDef): AbilityKind[] {
  return ABILITY_BLOCKS.filter((block) => def[block] !== undefined);
}

/** Whether `def` carries the named effect block. */
export function hasAbilityBlock(def: AbilityDef, block: AbilityKind): boolean {
  return def[block] !== undefined;
}

/** Look up an ability def; throws on a broken id so bugs surface loudly. */
export function abilityDef(defId: string): AbilityDef {
  const def = activeAbilityDefs[defId];
  if (!def) throw new Error(`unknown ability def "${defId}"`);
  return def;
}

/**
 * The weight an un-annotated power carries (see `AbilityDef.rarity`) — the
 * yardstick every authored weight is written against, and the numerator of the
 * stall's rarity markup. 100 so a weight reads as a percentage of "ordinary".
 */
export const ABILITY_DEFAULT_RARITY = 100;

/** This power's selection weight — its authored `rarity`, else the default. */
export function abilityRarity(defId: string): number {
  return Math.max(0, abilityDef(defId).rarity ?? ABILITY_DEFAULT_RARITY);
}

/**
 * Pick one power out of `pool`, weighted by each entry's `rarity`, off a single
 * `roll` in [0,1). ONE draw, like the uniform `pool[floor(roll × n)]` it
 * replaced — the caller's rng stream keeps its exact shape, which is what lets
 * the drop ladder gain rarity weighting without reshuffling a seeded run.
 *
 * Returns null only for an empty pool (or one whose every weight is zero), so a
 * level that ships no powerups is a caller's `null` check rather than a throw.
 */
export function pickAbility(
  pool: readonly string[],
  roll: number,
): string | null {
  if (pool.length === 0) return null;
  let total = 0;
  for (const id of pool) total += abilityRarity(id);
  if (total <= 0) return null;
  let cursor = roll * total;
  let last: string | null = null;
  for (const id of pool) {
    const weight = abilityRarity(id);
    if (weight <= 0) continue; // a zero-weight power can never be picked
    last = id;
    cursor -= weight;
    if (cursor < 0) return id;
  }
  // roll === 1 (or float drift on the last step): the last WEIGHTED entry —
  // never simply the last of the pool, which may carry no weight at all.
  return last;
}
