// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Data shapes for the simulation. The state is a plain mutable object the
// renderer reads every frame; `step()` advances it and reports what happened
// as events so the app layer can drive sound and visual feedback without the
// engine knowing either exists. The state holds a seeded RNG closure for
// in-run rolls (crits, drops), so it is deterministic but not JSON-plain.
//
// Entities reference the content catalogs (defs/) by id: an Enemy carries a
// `defId` into ENEMY_DEFS, an Equipment a `defId` into WEAPON_DEFS/GEAR_DEFS.
// The catalogs scale to hundreds of entries without these shapes changing.

import type { GearDef, WeaponDef } from "./defs/equipment.ts";
import type { CutsceneState } from "@game/lib/cutscene.ts";
import type { Rng } from "@game/lib/rng.ts";
import type { Vec2 } from "@game/lib/vec.ts";

/**
 * `cutscene` plays the level's prelude scene, `intro` shows the story text
 * box, `title` flashes the level name alone before the drop, `levelup` waits
 * for a stat choice, `inventory` pauses for bag management, `map` pauses over
 * the fog-of-war level map, `dialogue` holds the world while a character (or
 * a found story item) speaks; the simulation only advances while `playing`.
 */
export type GamePhase =
  | "cutscene"
  | "intro"
  | "title"
  | "playing"
  | "paused"
  | "levelup"
  | "respec"
  | "inventory"
  | "map"
  | "shop"
  | "dialogue"
  | "victory"
  | "defeat";

/**
 * A difficulty id: a key into DIFFICULTY_DEFS. Deliberately a bare `string`
 * so the ladder is pure data like every other catalog — adding a difficulty
 * means adding a def entry (and listing it in DIFFICULTY_ORDER), not editing
 * this type. The shipped ladder runs easy → medium → hard → nightmare →
 * jesus; the numbers and menu presentation live in defs/difficulties.ts.
 */
export type Difficulty = string;

/** The six trainable stats, one point awarded per level-up. */
export type StatName =
  "stamina" | "strength" | "dexterity" | "intelligence" | "speed" | "luck";

export type WeaponClass = "melee" | "ranged" | "magic";

/**
 * The four BODY slots armor is worn in. Each worn piece carries flat armor
 * points; the pieces sum, and the total turns into a physical-damage
 * reduction against the attacker's level (see `armorReduction` and config
 * `ARMOR`) — the Diablo/WoW shape where standing still means decaying.
 */
export type ArmorSlot = "head" | "chest" | "legs" | "feet";

/**
 * Item quality, lowest to highest: white regular, blue magic, yellow rare,
 * gold unique, orange legendary (the colors are the app's, see tiers.ts) —
 * the Diablo ladder. Every tier exists engine-wide, but a tier only drops
 * off a monster whose LEVEL has reached its unlock (config
 * `LOOT.tierUnlockMlvl`): magic from monster level 5, rare from 10, unique
 * from 15, legendary from 25 — so rares are the reward of the deeper levels
 * and harder difficulties, never the level-1 rank and file. Unique and
 * legendary are plumbing for now: no base rolls them until their one-of-a-kind
 * defs ship.
 */
export type Tier = "regular" | "magic" | "rare" | "unique" | "legendary";

export type EquipSlot = "weapon" | ArmorSlot | "charm" | "bag";

/**
 * Item MAKE quality, worst to best — the D2-style craftsmanship roll: every
 * PLAIN (regular-tier) weapon and armor drop rolls one at mint (see
 * `rollQuality`), and the rank scales the numbers the piece was authored
 * with (a weapon's damage, an armor piece's points, the durability — config
 * `QUALITY.mults`). Low-level monsters mostly drop broken/crude make; the
 * deeper the killer's monster level, the more superior/perfect work falls
 * (config `QUALITY.weightsLow/High`). Craftsmanship and magic are exclusive,
 * the D2 rule: a MAGIC-or-better find is always normal make (already well
 * built — unique/legendary even mint unbreakable), as are charms and bags
 * (nothing to scale).
 */
export type Quality = "broken" | "crude" | "normal" | "superior" | "perfect";

/** One rolled bonus on a magic+ item. Higher tiers roll more of them. */
export type Affix =
  | { kind: "damagePct"; value: number }
  | { kind: "maxHp"; value: number }
  | { kind: "crit"; value: number }
  | { kind: "armor"; value: number }
  | { kind: "stat"; value: number; stat: StatName };

/** A droppable, equippable item instance (medkits are consumables, not this). */
export type Equipment = {
  id: number;
  /** Key into WEAPON_DEFS or GEAR_DEFS. */
  defId: string;
  slot: EquipSlot;
  tier: Tier;
  /**
   * The ITEM LEVEL this piece dropped at: the killer's monster level minus a
   * small rolled deficit (see `rollItemLevel` — rare+ drops sit closer to the
   * mob). Affix magnitudes scale with it, so a deep find genuinely outrolls
   * an early one of the same tier. Purely a birth certificate — it never
   * changes after the drop.
   */
  ilvl: number;
  /** Rolled bonuses; count is dictated by the tier, size by `ilvl`. */
  affixes: Affix[];
  /**
   * The MAKE quality this instance rolled at mint (see `Quality`): scales the
   * base's damage/armor/durability and prefixes the name (CRUDE …, PERFECT
   * …). Absent = normal — the default for hand-minted pieces (starting gear)
   * and every instance from before quality shipped, so old saves read
   * unchanged.
   */
  quality?: Quality;
  /**
   * Wear left before this piece gives out (the def carries the maximum).
   * Weapons spend one point per attack and are TRASHED at zero; armor spends
   * one per hit taken and merely goes INACTIVE at zero — it stays worn,
   * contributing nothing, until a repair kit restores it. Undefined =
   * unbreakable (the built-in sidearm, unique/legendary finds).
   */
  durability?: number;
  /**
   * Armor pieces only: the rolled armor points this instance carries — the
   * def's base value grown by the drop's item level (see `rollEquipment` and
   * config `ARMOR.armorPerIlvl`), stamped at mint and frozen for life like an
   * affix. Absent on weapons, charms, bags, and pre-revamp instances (which
   * fall back to the def's base value — see `armorValueOf`).
   */
  armor?: number;
  /**
   * A FROZEN copy of the item's catalog def, captured the instant it was
   * minted (see `rollEquipment`). This is what makes a kept item version-proof:
   * an item a test player carries keeps the stats it dropped with even after we
   * rebalance or delete its `defId` from the live catalog — only NEW drops feel
   * the change. On load, `adoptEquipment` re-homes the instance onto this
   * snapshot (registered under a synthetic frozen id), so every stat read
   * resolves the item AS DROPPED. Absent only on instances minted by a build
   * from before snapshots existed (handled best-effort on load).
   */
  def?: WeaponDef | GearDef;
};

/**
 * A running time-limited power granted by an ability pickup (fire orbs,
 * lightning storm, stasis field). `defId` keys into ABILITY_DEFS; the two
 * scratch fields mean different things per ability kind.
 */
export type ActiveAbility = {
  defId: string;
  remainingMs: number;
  /** Orbit abilities: the current sweep angle in radians. */
  angle: number;
  /** Ms until the ability's next damage tick / strike. */
  cooldownMs: number;
};

export type Player = {
  pos: Vec2;
  /** Height above the ground (world px) and vertical speed while jumping. */
  z: number;
  vz: number;
  hp: number;
  maxHp: number;
  /**
   * Current stamina — the sprint pool. Running spends it, walking/idling
   * refills it; an empty pool caps the top speed (see config `STAMINA`).
   */
  stamina: number;
  /** Max stamina, from the base pool + STAMINA stat (see `computeMaxStamina`). */
  maxStamina: number;
  /** Unit vector of the last movement direction; drives sprite facing. */
  facing: Vec2;
  /**
   * Which way the sprite mirrors. Updated with hysteresis (see
   * PLAYER.faceFlipMinX) so near-vertical movement doesn't flicker the flip.
   */
  faceLeft: boolean;
  /** Time-limited powers currently running (spent ability pickups). */
  abilities: ActiveAbility[];
  /**
   * Ability pickups carried but not yet used (ABILITY_DEFS ids, oldest
   * first). The `useItem` input spends the head; HELD_ITEMS.cap bounds it.
   */
  heldAbilities: string[];
  /** True while the player moved this step; drives the walk animation. */
  moving: boolean;
  /** Remaining ms until the weapon may fire again. */
  weaponCooldownMs: number;
  /**
   * True while the hero's weapon is holstered — set on levels with a scripted
   * `openingStrike` (SpaceZ HQ). The auto-attack sits out entirely until the
   * vanguard's soft first swing arms him (see story.ts `tryOpeningStrike`);
   * cleared for good once armed. Absent/false everywhere else — the hero opens
   * ready to fight.
   */
  disarmed?: boolean;
  /** Remaining ms of post-hit invulnerability flash (visual only). */
  hurtFlashMs: number;
  level: number;
  xp: number;
  /** XP still needed to reach the next level. */
  xpToNext: number;
  /** Stat points awarded but not yet spent (spent via `allocateStat`). */
  pendingStatPoints: number;
  /**
   * COINS — the merchant economy's currency (see merchant.ts / config
   * ECONOMY). Earned by selling loot to a discovered merchant, spent on his
   * stall; carried between levels via the loadout.
   */
  coins: number;
  stats: Record<StatName, number>;
  equipment: {
    /** Never empty — the character always fights with something. */
    weapon: Equipment;
    /** The four armor slots. Broken pieces stay worn but count for nothing
     * until repaired (see `isArmorBroken`). */
    head: Equipment | null;
    chest: Equipment | null;
    legs: Equipment | null;
    feet: Equipment | null;
    charm: Equipment | null;
    /**
     * A worn BAG that widens the carry (its `GearDef.bagSlots` add cells on
     * top of the STRENGTH-scaled floor — see `inventoryCapacity`). Null = no
     * bag; the base bag is all the hero has. More bag types arrive later.
     */
    bag: Equipment | null;
  };
  /** Fixed-size bag; `null` cells are empty. */
  inventory: (Equipment | null)[];
};

export type Enemy = {
  id: number;
  /** Key into ENEMY_DEFS (hp/speed/damage/AI live on the def). */
  defId: string;
  pos: Vec2;
  /** Spawn point: monsters return here when the player escapes their aggro. */
  home: Vec2;
  hp: number;
  maxHp: number;
  /**
   * MONSTER LEVEL, stamped at spawn: the player's level plus the difficulty's
   * `mobLevelOffset` (plus the def's own `levelBonus` — elites and bosses run
   * a few levels hot). Loot reads it for everything Diablo-shaped: which base
   * items may drop (`levelReq` gate), which tiers are unlocked
   * (`LOOT.tierUnlockMlvl`), and the dropped item's own level (see
   * `rollItemLevel`). Elites/bosses re-stamp it when their fight engages
   * (maybePowerScale), so their loot matches the hero who actually beat them.
   */
  mlvl: number;
  /** Snapshot of def speed × per-instance jitter. */
  speed: number;
  /** Remaining ms until this enemy may deal contact damage again. */
  contactCooldownMs: number;
  /**
   * Remaining ms of the "that was a CRIT" flash — the renderer blinks the
   * sprite while this runs. Visual only, set by critical player hits.
   */
  critFlashMs?: number;
  /**
   * Elites sleep at their post until the player wanders close (or wounds
   * them); once true they hunt forever — no drifting back home. Minions use
   * it as their aggro latch: waking needs line of sight (some minions
   * excepted),
   * the chase then holds even through walls, and escaping the aggro radius
   * puts them back to sleep. Unused by bosses, whose wakefulness is derived
   * per tick.
   */
  awake?: boolean;
  /**
   * True once this enemy's dialogue has played (or been skipped by killing
   * the speaker mid-rush). Speakers only ever get one scene.
   */
  spoke?: boolean;
  /**
   * Evolution stage stamped on a minion when the menace meter was high at its
   * spawn (see config MENACE). Its extra hp is already baked into `hp`/`maxHp`;
   * this field is what the loot roll reads to sweeten an evolved mob's drop,
   * and the renderer reads to mark it as evolved. 0/undefined = un-evolved.
   */
  evo?: number;
  /**
   * Elite/boss power-match bookkeeping. `powerScaled` latches true the first
   * time the fight engages so the scale is applied exactly once;
   * `contactMult` is the (softened) multiplier its contact damage carries
   * afterwards. See maybePowerScale in menace.ts.
   */
  powerScaled?: boolean;
  contactMult?: number;
  /**
   * The scripted opening striker (a level's `openingStrike`): a lone vanguard
   * that rushes ahead of the pack, and whose first contact — harmless — draws
   * the hero's holstered weapon. Set at creation; only this mob can arm him.
   */
  vanguard?: boolean;
  /**
   * An apparition's dissolve countdown (config APPARITION.lingerMs), armed on
   * the first playing tick after its scene ends. At 0 the figure leaves the
   * board with an `apparitionVanished` event. Absent on everything else.
   */
  vanishMs?: number;
};

/**
 * A black hole built from the level def (LevelDef.wells): a static gravity
 * well that drags the grounded player, enemies, and loose items toward
 * `pos`. Numbers are resolved from the config WELLS defaults at creation.
 */
export type GravityWell = {
  id: number;
  pos: Vec2;
  /** Reach of the pull (world px). */
  pullRadius: number;
  /** Inside this the hole devours minions and burns the player. */
  coreRadius: number;
  /** Peak pull at the core's edge (px/s), linear falloff to the reach. */
  pullSpeed: number;
  /** Hp per second burned while the player stands in the core. */
  coreDps: number;
};

/**
 * A flying rock (config ASTEROIDS; a level turns the rain on with
 * LevelDef.asteroids): crosses the field in a straight line, hurts the
 * player once on contact, shoves minions aside, and despawns once far
 * enough from the player. Ignores obstacles and level bounds.
 */
export type Asteroid = {
  id: number;
  pos: Vec2;
  /** Unit direction of travel. */
  dir: Vec2;
  speed: number;
  radius: number;
  /** Visual spin rate in radians/s (rolled at spawn; renderer only). */
  spin: number;
  /** Latched once it has hit the player — one blow per rock. */
  struck: boolean;
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
   * Chain-lightning leaps still owed on the first hit (see
   * `WEAPON.chainRange` / `chainDamageFrac`). Absent = no chaining.
   */
  chain?: number;
  /** Enemy ids already struck by this shot, so a piercing round never bills
   * the same body twice while passing through it. */
  hitIds?: number[];
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

export type Item =
  | { id: number; kind: "medkit"; pos: Vec2 }
  /** The golden level-up arrow: grants a share of the XP to the next level. */
  | { id: number; kind: "xp"; pos: Vec2 }
  /** A repair kit: restores the equipped weapon's durability to full. */
  | { id: number; kind: "repair"; pos: Vec2 }
  /** An energy drink: resets the sprint pool to full on touch. Like the repair
   * kit it stays grounded when there is nothing to top up (stamina already
   * full), so it is never wasted on a rested hero. */
  | { id: number; kind: "drink"; pos: Vec2 }
  | { id: number; kind: "equipment"; pos: Vec2; equipment: Equipment }
  /** A time-limited power pickup; `defId` keys into ABILITY_DEFS. */
  | { id: number; kind: "ability"; pos: Vec2; defId: string }
  /**
   * A plot piece — a keycard, a dossier, the anti-grav unit. `defId` keys
   * into STORY_ITEM_DEFS; picking one up banks it in `state.storyItems`
   * (never the bag) and plays its lore as a dialogue.
   */
  | { id: number; kind: "story"; pos: Vec2; defId: string };

/** A decorative feature scattered at level creation — rendered, no collision. */
export type Decor = {
  /** Def key for the piece (debugging/analytics); the renderer draws `sprite`. */
  kind: string;
  /** Sprite name the renderer blits — resolved from the level def. */
  sprite: string;
  pos: Vec2;
};

/**
 * A solid feature neither the player nor monsters can move through. Low ones
 * (`jumpable`) can be cleared mid-jump — monsters never jump, so a low rock
 * is a wall to the horde and a hop to the player. Tall ones block everyone.
 */
export type Obstacle = {
  id: number;
  /** Def key for the piece (analytics/debugging). */
  kind: string;
  /** Sprite name the renderer blits — resolved from the level def. */
  sprite: string;
  pos: Vec2;
  /**
   * Bounding radius in world px — the collision radius for a round obstacle,
   * and the coarse cull/spacing radius for a rectangular one (see `half`).
   */
  radius: number;
  /**
   * Rectangular footprint (half-extents in world px), present on sized rocks.
   * When set, collision, line-of-sight and shots test the box; when absent the
   * obstacle is the plain circle of `radius`.
   */
  half?: Vec2;
  /** True when a jumping player sails over it. */
  jumpable: boolean;
};

/** A fixed story prop (a lander, a flag, …) placed by the level def. */
export type Landmark = {
  kind: string;
  /** Sprite name the renderer blits — resolved from the level def. */
  sprite: string;
  /**
   * Where the sprite meets its pos: `base` pins the sprite's foot to `pos`
   * (a standing prop like a flag or mast), `center` centers it. Data, so the
   * renderer never special-cases a particular prop kind.
   */
  anchor: "base" | "center";
  pos: Vec2;
};

/**
 * How the renderer paints a level's ground. Data on the level def, so a new
 * biome is a new entry — no renderer edit. `ground.rare` scatters into
 * `ground.common` every `rareEvery`-th cell; an optional `patch` clusters a
 * second pair on a coarse grid for gravel/vent-style clumps.
 */
export type TileSpec = {
  ground: { common: string; rare: string; rareEvery: number };
  patch?: { a: string; b: string; every: number };
  /**
   * Regional overrides: inside `rect` (world px) the zone's own ground/patch
   * pair replaces the level-wide one — how a single level shifts terrain, e.g.
   * martian dust outside giving way to deck plating inside the base. Zones are
   * checked in order; the first rect containing the tile wins. Purely
   * presentational (the renderer picks tiles from it) — collision never reads
   * tiles.
   */
  zones?: {
    rect: { x: number; y: number; width: number; height: number };
    ground: { common: string; rare: string; rareEvery: number };
    patch?: { a: string; b: string; every: number };
  }[];
};

/**
 * A locked door from the level def: a wall segment of `door_locked`
 * obstacles that vanishes when the player brings the matching key (a story
 * item whose `unlocks` names this door) up to it.
 */
export type DoorState = {
  /** The LevelDef door id story items reference via `unlocks`. */
  id: string;
  /** Midpoint of the door segment (event anchor, proximity checks). */
  center: Vec2;
  /** The obstacle ids to remove from `state.obstacles` when it opens. */
  obstacleIds: number[];
  open: boolean;
};

/**
 * The running conversation while `phase === "dialogue"`: an elite or boss
 * delivering its scene, a unique mob gasping its last words as it dies, or a
 * picked-up story item revealing its lore. The pages live on the def
 * (EnemyDef.dialogue / EnemyDef.lastWords / StoryItemDef.lore); this tracks
 * only who speaks and how far the player has tapped. `enemyDeath` carries no
 * `enemyId` — the speaker is already off the board.
 */
export type DialogueState = {
  source:
    | { kind: "enemy"; enemyId: number; defId: string }
    | { kind: "enemyDeath"; defId: string }
    | { kind: "story"; defId: string }
    /**
     * The hero's own inner monologue — a story beat pinned to an event (the
     * first kill of a given enemy on a level), not to a speaker on the board.
     * `defId` keys THOUGHT_DEFS.
     */
    | { kind: "playerThought"; defId: string }
    /**
     * The wandering merchant's meeting scene — played once, the moment he is
     * first discovered. `levelId` keys the level whose `merchant` def carries
     * the greeting (each level's trader has his own story for being there).
     */
    | { kind: "merchant"; levelId: string };
  /** Index of the page currently on screen. */
  page: number;
};

/**
 * What a level-map pin commemorates: a `story` plot piece picked up, an
 * `elite` slain, a `boss` beaten (a fleeing unique counts — the fight was won
 * where it fled), or a `merchant` met (his stall stays put once discovered, so
 * the pin leads straight back to the shop).
 */
export type MapMarkerKind = "story" | "elite" | "boss" | "merchant";

/**
 * A pin on the level map (see map.ts): something memorable happened at
 * `pos`. `defId` keys the catalog its `kind` implies — STORY_ITEM_DEFS for
 * `story`, WEAPON_DEFS/GEAR_DEFS for `loot`, ENEMY_DEFS for `elite`/`boss` —
 * so the app can resolve a name or icon. Markers are shown even where the
 * fog still stands: the player was there when it happened.
 */
export type MapMarker = {
  kind: MapMarkerKind;
  pos: Vec2;
  defId: string;
};

/**
 * One entry on the merchant's stall (see merchant.ts). Powerups restock —
 * buy as many as the purse allows; a weapon is a one-off piece, latched
 * `sold` once bought (Diablo 2 style: the stall empties, the run moves on).
 */
export type MerchantStock = { id: number; price: number } & (
  | { kind: "ability"; defId: string }
  | { kind: "weapon"; equipment: Equipment; sold: boolean }
);

/**
 * The WANDERING MERCHANT: one per level, roaming until met (config
 * MERCHANT). The horde ignores him and nothing hurts him — he is a trader,
 * not a combatant. `discovered` latches on the first close encounter: he
 * stays put from then on, pinned on the level map, his stall stocked
 * against the hero he just met. `rng` is his own seeded stream so his
 * wandering never perturbs the run's roll sequence.
 */
export type Merchant = {
  pos: Vec2;
  /**
   * Sprite family the renderer draws (`<sprite>_0/_1` walk frames) — resolved
   * from the level def at creation, so the trader dresses for the venue (a
   * vendor's uniform at HQ, a patched 70s suit on the moon, …).
   */
  sprite: string;
  /** Where the current wander leg heads; null while idling (or discovered). */
  wanderTarget: Vec2 | null;
  /** Ms of idling left before the next wander leg starts. */
  idleMs: number;
  /** Ms left on the current leg — a leg blocked by terrain gives up here. */
  legMs: number;
  /** Sprite mirror, following the walk direction like the player's. */
  faceLeft: boolean;
  /** True while he walked this step; drives the walk animation. */
  moving: boolean;
  /** Latched on the first encounter: rooted, mapped, shop open for business. */
  discovered: boolean;
  /** The stall (empty until discovered — stock is rolled at the meeting). */
  stock: MerchantStock[];
  /**
   * Private seeded stream for wander legs and stall rolls, parked as its
   * plain uint32 state (not a closure) so the whole merchant serializes with
   * the run — see `createRngFromState` and saved-run.ts.
   */
  rngState: number;
};

export type GameStats = {
  kills: number;
  totalEnemies: number;
  shotsFired: number;
  damageDealt: number;
  damageTaken: number;
  itemsCollected: number;
  xpGained: number;
  /** Wall-clock ms of simulated play time. */
  timeMs: number;
};

/**
 * Something notable that happened during one `step()`, for the app layer to
 * react to (play a sound, flash the screen). Cleared at the start of every
 * step.
 */
export type GameEvent =
  /**
   * A projectile weapon fired. `pos` is the muzzle (the shooter), `dir` the
   * unit aim — the app draws a firing flash (ranged) or a cast burst (magic)
   * oriented along it.
   */
  | { type: "shot"; weaponClass: WeaponClass; pos: Vec2; dir: Vec2 }
  /**
   * A melee weapon swung. `pos` is the swinger, `dir` the unit aim, `range`
   * the effective reach, `arc` the full cone angle (radians) that the swing
   * strikes — the app sweeps a slash across that cone at that radius (a wide
   * arc for a blade, a narrow thrust for a spear).
   */
  | { type: "swing"; pos: Vec2; dir: Vec2; range: number; arc: number }
  | { type: "jump" }
  | { type: "land" }
  | {
      type: "enemyHit";
      pos: Vec2;
      crit: boolean;
      damage: number;
      defId: string;
      /** On a crit, how strong the blow was in [0, 1] (its position in the
       * weapon's damage-variance band) — the app sizes the crit popup by it, so
       * a top-of-band crit slams a bigger figure. Absent when the source has no
       * variance (abilities); ignored for non-crits. */
      critPower?: number;
    }
  | {
      type: "enemyKilled";
      pos: Vec2;
      defId: string;
      /** The killing blow, so death also pops a damage number. */
      damage: number;
      crit: boolean;
      /** See `enemyHit.critPower`. */
      critPower?: number;
      /** XP this kill awarded — the app floats it as rising blue combat text. */
      xp: number;
    }
  | { type: "playerHurt"; crit: boolean }
  /** The player sidestepped a blow entirely (see `playerDodgeChance`). `pos`
   * is the hero — the app floats a "DODGE" tag and pips a light whiff. */
  | { type: "playerDodge"; pos: Vec2 }
  /** An enemy sidestepped the player's weapon blow (see `enemyDodgeChance`).
   * `pos` is the foe — the app floats a "DODGE" tag off it. */
  | { type: "enemyDodge"; pos: Vec2; defId: string }
  /** The player's weapon blow whiffed of its own accord (see
   * `playerMissChance`). `pos` is the foe — the app floats a "MISS" tag. */
  | { type: "enemyMiss"; pos: Vec2; defId: string }
  | {
      type: "itemCollected";
      kind: Item["kind"];
      tier?: Tier;
      /** Human-readable label for the "picked up X" pickup feed. */
      name?: string;
      /**
       * The equipment's def id (equipment pickups only) — lets the app resolve
       * the piece's icon for the framed pickup card. Absent for loose pickups
       * (medkits, arrows, powerups), which never carry an inventory icon.
       */
      defId?: string;
      /**
       * The picked-up piece's stable `Equipment.id` (equipment pickups only) —
       * lets the app find it in the bag to click-equip straight from the pickup
       * card, robust to the bag being rearranged while the card is up.
       */
      itemId?: number;
      /**
       * True when the piece was good enough to be worn on the spot (the
       * auto-equip path). The pickup card reads it to badge the find
       * "EQUIPPED" rather than offering a tap-to-equip.
       */
      equipped?: boolean;
      /**
       * True when wearing this piece would improve its slot over what's there
       * now (equipment pickups only). Auto-equipped finds are always upgrades;
       * a bagged find is an upgrade only when it out-scores the worn piece yet
       * wasn't force-equipped (a passive charm, say). Drives the card's
       * "UPGRADE" marker.
       */
      upgrade?: boolean;
    }
  | { type: "itemDropped"; pos: Vec2 }
  /**
   * The player walked over loot he couldn't carry — the bag is full, so the
   * piece stays on the ground. `pos` is the hero (the app floats a "bags full"
   * thought over him and pulses the inventory button to nudge a cleanup).
   * Throttled by `LOOT.bagFullHintCooldownMs` so standing on the loot fires it
   * once, not every frame.
   */
  | { type: "pickupBlocked"; reason: "bagFull"; pos: Vec2 }
  /** A picked-up piece was better than the equipped one and replaced it. */
  | { type: "autoEquipped"; defId: string }
  /** The equipped weapon's durability ran out; `defId` is the broken one. */
  | { type: "weaponBroke"; defId: string }
  /** A worn armor piece's durability ran out. It stays worn but INACTIVE
   * (no armor, no bonuses) until a repair kit restores it. */
  | { type: "armorBroke"; defId: string }
  /** A screen-nuke pickup went off at the player's position. */
  | { type: "nuke"; pos: Vec2 }
  /** A storm ability bolt struck at `pos` (drives the flash + crack). */
  | { type: "lightning"; pos: Vec2 }
  /** An ability pickup kicked in (or refreshed its timer). */
  | { type: "abilityStarted"; defId: string }
  | { type: "abilityEnded"; defId: string }
  | { type: "levelUp"; level: number }
  /**
   * The menace meter crossed into a new evolution stage — the horde has grown
   * more dangerous in answer to the player's rampage. The app sounds the
   * escalation and can flash a "the horde evolves" cue.
   */
  | { type: "menaceRose"; stage: number }
  | { type: "bossDefeated"; pos: Vec2 }
  /**
   * A fleeing unique (see `EnemyDef.flees`) was beaten down to 0 hp and
   * escaped instead of dying — off the board, loot paid, and a landmark (the
   * rift it tore open) left at `pos`. Distinct from `bossDefeated` so the app
   * can play the escape as a warp, not a death.
   */
  | { type: "bossFled"; pos: Vec2; defId: string }
  /** A speaker took the stage: the run paused into the `dialogue` phase. */
  | { type: "dialogueStarted"; speaker: string }
  /**
   * A unique mob (elite/boss) died and its parting line took the stage — the
   * run paused into the `dialogue` phase on a `enemyDeath` source. Distinct
   * from `dialogueStarted` so the app can give the death its own somber cue
   * instead of the arrival knock.
   */
  | { type: "enemyLastWords"; defId: string }
  /** A plot piece was picked up (`defId` keys into STORY_ITEM_DEFS). */
  | { type: "storyItemCollected"; defId: string }
  /** A locked door recognized its key and slid open. */
  | { type: "doorOpened"; pos: Vec2 }
  /**
   * The hero met the wandering merchant for the first time: he stops
   * wandering, pins the level map, and his stall is now open at `pos`. The
   * app toasts the meeting and can chime a till.
   */
  | { type: "merchantDiscovered"; pos: Vec2 }
  /**
   * A minion was dragged into a black hole's core and devoured — off the
   * board with no kill, no XP and no loot. `defId` names the meal; the app
   * plays the gulp and the swirl at `pos`.
   */
  | { type: "wellSwallowed"; pos: Vec2; defId: string }
  /**
   * An apparition finished its scene, walked off, and dissolved (see
   * `EnemyDef.apparition`). The app sparkles it out at `pos`.
   */
  | { type: "apparitionVanished"; pos: Vec2; defId: string }
  | { type: "victory" }
  | { type: "defeat" };

/** Per-step player intent, produced by the app's input layer. */
export type GameInput = {
  /** True while the pointer/touch is held down. */
  steering: boolean;
  /** Steering target in world coordinates (meaningful while steering). */
  target: Vec2;
  /**
   * Walk throttle in [0, 1]: how hard the player is pushing the dpad (or how
   * far the cursor sits from the character). 1 = full speed; smaller values
   * ease the character into a gentle walk when the finger barely leaves the
   * dpad center. Absent (headless tests, bots) defaults to full speed.
   */
  throttle?: number;
  /** True on the step a jump was requested (tap / space edge, not hold). */
  jump: boolean;
  /**
   * True on the step the player asked to use a carried ability pickup
   * (mouse click / HUD button edge). Spends one held ability; a no-op with
   * empty hands. `useItemIndex` chooses which one.
   */
  useItem?: boolean;
  /**
   * When `useItem` is set, which banked ability to spend (index into
   * `heldAbilities`, oldest first). Tapping a powerup dock slot names its
   * index; click / E / auto-use omit it and spend the oldest (index 0). An
   * out-of-range index falls back to the oldest too.
   */
  useItemIndex?: number;
  /**
   * The world rect currently on screen (the camera view). When set, the
   * auto-weapon only targets monsters inside it — the character never
   * shoots at enemies the player cannot see yet. Absent (headless tests,
   * bots) targeting falls back to weapon range alone.
   */
  view?: { x: number; y: number; width: number; height: number };
  /**
   * The desktop mouse pointer's world position — the aim dimension. When set,
   * the auto-weapon prefers the monster in the pointer's direction over a
   * merely-closer one elsewhere (see `AIM.biasStrength`), so a desktop player
   * steers where the hero fires. Absent (touch, keyboard-only, bots) or
   * resting on the hero: targeting stays the plain nearest foe.
   */
  aim?: Vec2;
};

/**
 * The hero's carry-over between levels: the snapshot `extractLoadout` takes
 * from a finished run — level, stats, worn equipment, bag, pocketed
 * powerups — and `createGame` dresses the next run in via `applyLoadout`.
 * The app banks one per cleared level (per difficulty); dev jumps with
 * nothing banked use `deriveArrivalLoadout`'s stand-in instead. Plain JSON
 * data so it persists in storage as-is.
 */
export type Loadout = {
  level: number;
  /** Progress into the current level (clamped below its threshold on apply). */
  xp: number;
  stats: Record<StatName, number>;
  equipment: {
    weapon: Equipment;
    head: Equipment | null;
    chest: Equipment | null;
    legs: Equipment | null;
    feet: Equipment | null;
    charm: Equipment | null;
    bag: Equipment | null;
  };
  inventory: (Equipment | null)[];
  /** Banked ability pickups (ABILITY_DEFS ids). */
  heldAbilities: string[];
  /** The purse — merchant coins ride along between levels. Optional so
   * loadouts banked before the economy shipped load as an empty purse. */
  coins?: number;
};

/** Static facts about the running level, snapshotted from its LevelDef. */
export type LevelInfo = {
  /** Key into LEVELS. */
  id: string;
  /** Story order (1-based). */
  index: number;
  name: string;
  width: number;
  height: number;
  /** Downward acceleration in world px/s² — lower gravity floats jumps. */
  gravity: number;
  /** Tileset/mood key for the renderer. */
  biome: string;
  /** How the renderer paints the ground for this level. */
  tiles: TileSpec;
  /** What the HUD calls this level's hostiles. */
  foes: string;
};

export type GameState = {
  phase: GamePhase;
  /**
   * The running prelude scene while `phase === "cutscene"` (see
   * @game/lib/cutscene and defs/cutscenes.ts); null once it played out.
   */
  cutscene: CutsceneState | null;
  /**
   * Which page of the level's opening monologue is on screen while
   * `phase === "intro"` — the hero's black-screen briefing dialogue. Turning
   * past the last page drops into the `title` card; unused in other phases.
   */
  introPage: number;
  /**
   * A LEVEL TOKEN respec is owed at this run's start: the hero jumped a rung
   * on a spent token, so before play begins the whole banked build is refunded
   * into a pool for a from-scratch reallocation (a Diablo-style respec). Set at
   * creation, consumed by `dismissIntro` (which enters the `respec` phase in
   * its place) and cleared by `beginRespec`; false on every ordinary run.
   */
  respecPending: boolean;
  level: LevelInfo;
  /** The run's chosen difficulty (scales spawns, hp, and loot). */
  difficulty: Difficulty;
  /**
   * The escalation meter (see config MENACE). Heated by the player's rolling
   * combat output (`combatDps` / `combatKillRate`) and jolted by overpowered
   * kills; idling bleeds it off. Read as a stage that lures, evolves, and
   * scales the horde. Starts at 0.
   */
  menace: number;
  /**
   * Rolling estimate of the player's damage-per-second, an EMA smoothed over
   * MENACE.rateWindowSec and updated each step from that step's damage. The
   * main fuel the menace meter reads: sustained high DPS heats it. Starts at 0.
   */
  combatDps: number;
  /**
   * Rolling estimate of the player's kills-per-second, an EMA smoothed over
   * MENACE.rateWindowSec and updated each step from that step's kills. Heats
   * the menace meter alongside `combatDps` — a fast clear rate escalates on top
   * of raw damage output. Starts at 0.
   */
  combatKillRate: number;
  /** Where the run begins; also the origin difficulty scales out from. */
  playerSpawn: Vec2;
  /** Story props to draw (the lander, the boss's flag, …). */
  landmarks: Landmark[];
  /** The running conversation while `phase === "dialogue"`; null otherwise. */
  dialogue: DialogueState | null;
  /** Collected story items (STORY_ITEM_DEFS ids) — keys, dossiers, the lot. */
  storyItems: string[];
  /**
   * THOUGHT_DEFS ids the hero has already thought through — each first-kill
   * inner monologue plays exactly once per run.
   */
  thoughtsSeen: string[];
  /** Locked doors built from the level def, open or not. */
  doors: DoorState[];
  /** The level's wandering merchant (see merchant.ts). */
  merchant: Merchant;
  /**
   * The fog of war: one byte per `MAP.cellSize` grid cell, row-major
   * (`mapCols(level)` cells per row), 1 once the hero has walked within
   * `MAP.revealRadius` of the cell. Stamped by `revealAround` each step and
   * once at creation around the spawn; never re-fogged. See map.ts.
   */
  explored: Uint8Array;
  /** Pins on the level map: story finds, rare loot, elite/boss victories. */
  mapMarkers: MapMarker[];
  player: Player;
  enemies: Enemy[];
  projectiles: Projectile[];
  items: Item[];
  decor: Decor[];
  /** Solid features scattered at level creation — see Obstacle. */
  obstacles: Obstacle[];
  /** Black holes built from the level def's `wells` — static all run. */
  wells: GravityWell[];
  /** Rocks currently in flight (levels with LevelDef.asteroids). */
  asteroids: Asteroid[];
  /** Ms until the next asteroid spawns (levels with LevelDef.asteroids). */
  asteroidTimerMs: number;
  /** Ms until the next gravity-well core-damage tick may land. */
  wellTickMs: number;
  /**
   * Ms until another "bags are full" nudge may fire. Counts down each step;
   * a blocked pickup emits `pickupBlocked` only when this reaches 0, then
   * resets it to `LOOT.bagFullHintCooldownMs` (see `stepItems`).
   */
  bagFullHintCooldownMs: number;
  /**
   * Ms the sprint pool has sat BONE-DRY — exactly empty, not merely low. Counts
   * up each step while `player.stamina` is 0 and resets to 0 the instant any
   * stamina returns. Drives the stamina-drink MERCY DROP: the longer the hero is
   * stranded winded, the higher each kill's chance of coughing up an energy
   * drink, ramping to the rung's cap over `MERCY.staminaEmptyDrinkRampMs` (see
   * `staminaDrinkChance`).
   */
  staminaEmptyMs: number;
  /** Counts down once the objective clears; the level ends at 0. */
  victoryCountdownMs: number | null;
  /**
   * Equipment dropped by regular monsters so far — the pity counter behind
   * LOOT.minEquipmentPerLevel (boss drops don't count toward it).
   */
  minionEquipmentDrops: number;
  /**
   * Monsters spawned so far per wave-budget line (indexed like the level's
   * `waves.budget`). The spawner streams each line in until its count is
   * exhausted; empty when the level has no waves.
   */
  waveSpawned: number[];
  /**
   * World px the player has walked that the spawner hasn't converted into
   * monsters yet — moving through the level stirs more of the horde awake
   * (waves.moveSpawnEvery px each).
   */
  moveSpawnCredit: number;
  /**
   * Resolved kill thresholds for the level's `loot.earlyDrops` schedule,
   * parallel to it: a rolled `[min, max]` entry gets a concrete count here at
   * creation, a fixed entry keeps its number. Empty when the level has no
   * schedule.
   */
  earlyDropKills: number[];
  /**
   * Cursor into the `loot.earlyDrops` schedule: the index of the next unfired
   * entry (entries are authored in ascending kill order). Advances as each
   * scripted opening drop is handed over; equals the schedule length once they
   * have all dropped.
   */
  earlyDropCursor: number;
  stats: GameStats;
  /** Events emitted by the most recent `step()`. */
  events: GameEvent[];
  /** Monotonic id source for spawned entities. */
  nextId: number;
  /** Seeded stream for in-run rolls (crits, drops) — keeps runs replayable. */
  rng: Rng;
  /**
   * A SECOND seeded stream, for combat FLAVOR only — currently the per-blow
   * damage-range roll (see `rollWeaponDamage`). Kept apart from `rng` on
   * purpose: damage variance must never advance the loot/crit stream, so drop
   * determinism (and every seeded loot test) is unaffected by how a swing rolls.
   * Not serialized — re-seeded on resume; a reloaded run rolling slightly
   * different flavor damage is invisible, while a fresh run from a seed stays
   * fully reproducible.
   */
  fxRng: Rng;
};
