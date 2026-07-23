// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The static and interactive world: ground items, decor, obstacles,
// landmarks, tiles, doors/gates, dialogue, map markers, and the merchant.

import type { Vec2 } from "@game/lib/vec.ts";

import type { Difficulty, Equipment } from "./core.ts";

export type Item =
  /** `tier` indexes config MEDKIT.tiers (the D2-style kit sizes) — absent
   * on items minted before tiers shipped, read as the lightest kit. */
  (
    | { id: number; kind: "medkit"; pos: Vec2; tier?: number }
    /** The golden level-up arrow: grants a share of the XP to the next level. */
    | { id: number; kind: "xp"; pos: Vec2 }
    /** A repair kit: restores the equipped weapon's durability to full. */
    | { id: number; kind: "repair"; pos: Vec2 }
    /** An energy drink: resets the sprint pool to full on touch. Like the repair
     * kit it stays grounded when there is nothing to top up (stamina already
     * full), so it is never wasted on a rested hero. */
    | { id: number; kind: "drink"; pos: Vec2 }
    /** A blue gatorade: refills the mana pool on touch (banked into the dock).
     * Like the energy drink it stays grounded when there's nothing to top up
     * (mana already full), so it is never wasted on a full caster. */
    | { id: number; kind: "mana"; pos: Vec2 }
    | { id: number; kind: "equipment"; pos: Vec2; equipment: Equipment }
    /** A time-limited power pickup; `defId` keys into ABILITY_DEFS. */
    | { id: number; kind: "ability"; pos: Vec2; defId: string }
    /**
     * A plot piece — a keycard, a dossier, the anti-grav unit. `defId` keys
     * into STORY_ITEM_DEFS; picking one up banks it in `state.storyItems`
     * (never the bag) and plays its lore as a dialogue.
     */
    | { id: number; kind: "story"; pos: Vec2; defId: string }
  ) & {
    /**
     * A MERCY DROP still being flown in by its ANGEL. When set (and > 0) the
     * rescue is airborne — cradled by the guardian as it descends to `pos` (the
     * spot the mob died) — and NOT yet collectable; the magnet ignores it and
     * `stepItems` counts it down (see `MERCY.angelDeliverMs`). At 0 the gift has
     * landed and the item behaves like any other. Absent on every ordinary drop,
     * so a plain drop is `deliverMs === undefined` and grounded from birth. The
     * renderer draws the descending angel + falling pickup off this timer
     * (`render.ts`); the engine only gates the pickup and never mentions angels.
     */
    deliverMs?: number;
  };

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
  /**
   * BREAKABLE (a crate — see crates.ts): the hero's weapon smashes it. When
   * set, `hp`/`maxHp` are live and the obstacle drops loot and is removed from
   * the field once `hp` reaches 0. Absent on ordinary solid features (rocks,
   * walls, craters), which never take damage.
   */
  breakable?: boolean;
  /** Current break hp (breakable obstacles only). */
  hp?: number;
  /** Full break hp (breakable obstacles only). */
  maxHp?: number;
  /**
   * Chance the break spills anything (see `ObstacleSpec.loot` / crates.ts) —
   * the mark of a CHANCE-BASED prop (a vending machine, a wine rack). Absent
   * on a supply crate, whose spill is guaranteed.
   */
  lootChance?: number;
  /**
   * Themed primary-drop weights overriding config `CRATES.drop` (see
   * `ObstacleSpec.loot`), so a broken prop pays loot in character. Absent =
   * the standard crate weights.
   */
  lootDrop?: {
    health?: number;
    stamina?: number;
    mana?: number;
    gear?: number;
  };
  /**
   * A special CHEST (see `LevelDef.chests` / crates.ts): a breakable that spills
   * a richer, guaranteed haul than a scattered crate. Absent on plain crates.
   */
  chest?: boolean;
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
 * An OPEN travel gate — a doorway to another level, torn open by using its
 * key trinket (`spendGateKey`; the latent defs live on `LevelDef.gates`).
 * Purely logical: the visual is a landmark pushed alongside it, so the
 * renderer never learns gates exist. Stepping within GATES.enterRadius books
 * a one-shot `gateEntered` event; the app owns the actual travel.
 */
export type GateState = {
  /** The LevelDef gate id this came from. */
  id: string;
  /** Destination level id. */
  to: string;
  /** Where it stands (proximity checks, event anchor). */
  pos: Vec2;
  /** Latched once the crossing is booked, so it fires exactly once. */
  entered: boolean;
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
     * When `returning` is set (he was already met here on a prior run and is
     * revealed at map start), his shorter "welcome back" line plays instead —
     * the per-level `returnGreeting` paired with `difficulty`'s send-off.
     */
    | {
        kind: "merchant";
        levelId: string;
        returning?: boolean;
        difficulty?: Difficulty;
      }
    /**
     * A spared figure's joining scene — the thanks, the life owed, the
     * promise to follow — played the moment the SPARE verdict lands. `defId`
     * keys COMPANION_DEFS (its `joinWords` pages).
     */
    | { kind: "companionJoin"; defId: string };
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
  /**
   * True once his "welcome back" line has been delivered (or was never owed).
   * A merchant MET live this run greets through the first-meeting scene and is
   * marked true then; a merchant REVEALED at map start (met here on a prior
   * run — see `revealMerchant`) starts false and gives his return greeting the
   * first time the hero comes near.
   */
  greetedReturn: boolean;
  /** The stall (empty until discovered — stock is rolled at the meeting). */
  stock: MerchantStock[];
  /**
   * Private seeded stream for wander legs and stall rolls, parked as its
   * plain uint32 state (not a closure) so the whole merchant serializes with
   * the run — see `createRngFromState` and saved-run.ts.
   */
  rngState: number;
};
