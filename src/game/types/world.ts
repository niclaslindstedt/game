// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The static and interactive world: ground items, decor, obstacles,
// landmarks, tiles, doors/gates, dialogue, map markers, and the merchant.

import type { Vec2 } from "@game/lib/vec.ts";

import type { AmmoType, Difficulty, Equipment } from "./core.ts";

export type Item =
  /** `tier` indexes config MEDKIT.tiers (the D2-style kit sizes) — absent
   * on items minted before tiers shipped, read as the lightest kit. */
  (
    | { id: number; kind: "medkit"; pos: Vec2; tier?: number }
    /** The golden level-up arrow: grants a few kills' worth of XP. `mlvl` is
     * the monster level of the mob that dropped it, so the payout is priced to
     * THAT mob (see `arrowXp`) — an arrow shed by a low-level mob (grinding
     * outgrown ground) is worth little, not a full at-level ding. Absent on
     * arrows minted without a source mob (read as the hero's own level). */
    | { id: number; kind: "xp"; pos: Vec2; mlvl?: number }
    /** A repair kit: restores the equipped weapon's durability to full. */
    | { id: number; kind: "repair"; pos: Vec2 }
    /** An energy drink: resets the sprint pool to full on touch. Like the repair
     * kit it stays grounded when there is nothing to top up (stamina already
     * full), so it is never wasted on a rested hero. */
    | { id: number; kind: "drink"; pos: Vec2 }
    /**
     * A box of AMMUNITION: `ammo` names the kind (config `AMMO_TYPES`) and
     * `count` how many rounds are in it. Banking tops the matching pouch stack
     * up to `AMMO.stackCap` and leaves any REMAINDER on the ground as a
     * smaller box — a nearly full pouch skims a find rather than refusing or
     * swallowing it whole.
     */
    | { id: number; kind: "ammo"; pos: Vec2; ammo: AmmoType; count: number }
    /**
     * A PILE OF GOLD shaken out of a body that had pockets (see
     * `items/gold.ts`). `amount` is the coins in it — banked straight into the
     * purse of whoever walks over it, with no bag cell, no cap and nothing to
     * refuse it, which is what separates gold from every other pickup in the
     * game: it can never be turned away and so never litters a cleared floor.
     *
     * The amount also decides which pile SPRITE it wears (config
     * `GOLD.pileTiers`), so the size of the heap on the floor is an honest
     * read of what is in it from across the room.
     */
    | { id: number; kind: "gold"; pos: Vec2; amount: number }
    | { id: number; kind: "equipment"; pos: Vec2; equipment: Equipment }
    /** A time-limited power pickup; `defId` keys into ABILITY_DEFS. */
    | { id: number; kind: "ability"; pos: Vec2; defId: string }
    /**
     * A plot piece — a keycard, a dossier, the anti-grav unit. `defId` keys
     * into STORY_ITEM_DEFS; picking one up banks it in `state.storyItems`
     * (never the bag) and plays its lore as a dialogue.
     */
    | { id: number; kind: "story"; pos: Vec2; defId: string }
    /**
     * A QUEST PIECE — the thing an errand's `collect` objective asks for. It
     * exists only while that errand is live: `questId` names the quest that
     * wants it and `defId` the entry in that quest's own `items` block (see
     * `questItemDef`), so a quest piece is never a global catalog id and two
     * mods can both ship a "spare fuse" without colliding. Picking one up
     * banks a tally on the quest — never the bag, which the hero needs for
     * loot.
     */
    | { id: number; kind: "quest"; pos: Vec2; questId: string; defId: string }
  ) & {
    /**
     * THE D2 TOSS: this drop is still in the air, thrown clear of the body it
     * came out of. `pos` is already the LANDING spot — every rule that reads a
     * drop's position (the magnet, the pickup reach, the minimap) sees where it
     * is going to be — and `toss.from` is where it left the ground, so the
     * renderer arcs it across. Airborne loot is NOT collectable and the magnet
     * leaves it alone (the same gate the angel delivery uses); `stepItems`
     * counts it down and emits `itemLanded` on touchdown, which is what makes
     * the noise. Absent on every grounded drop and on level-placed items, so a
     * find that was never thrown is `toss === undefined` from birth.
     */
    toss?: ItemToss;
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
    /**
     * WHOSE THIS IS — the SEAT entitled to pick it up, in ALLOCATED loot
     * (`GameState.lootMode`). Absent means anybody's, which is every drop in a
     * free-for-all session and every drop in a single-player run.
     *
     * A seat rather than a hero, for the reason every other cross-cutting
     * reference in the multiplayer work is: a seat survives the wire and an
     * object reference does not. It is stamped ONCE, at the moment the drop is
     * thrown (`dropItem`), and never re-decided — a drop that changed hands
     * because somebody walked past it would make "wait for me, that's mine"
     * untrue, which is the only promise allocated loot makes.
     *
     * It is NOT a privacy boundary and deliberately not in
     * `PRIVATE_PLAYER_FIELDS`: everybody SEES an allocated drop (the app tints
     * it), they simply cannot take it. Hiding it would make a party of four
     * walk over three invisible piles on the way to their own.
     */
    owner?: number;
  };

/**
 * WHAT A DROP IS MADE OF, as far as the floor is concerned — the vocabulary a
 * landing sound is picked by (`itemLanded.kind`, see `content/sounds/`).
 *
 * It is a MATERIAL, not a category: the question a landing answers is "what did
 * that sound like", so a mail hauberk and a robe part company here while a
 * hauberk and a mail coif do not. Weapons split by CLASS because that is what a
 * weapon is made of in this game — a blade rings, a gun clacks, a wand knocks.
 * `itemVoice` (items/toss.ts) is the one place an item is asked.
 */
export type ItemVoice =
  | "blade"
  | "gun"
  | "wand"
  | "plate"
  | "mail"
  | "leather"
  | "cloth"
  | "trinket"
  | "flask"
  | "scrap"
  | "spark"
  | "relic"
  /** Loose money hitting the floor — a spill of small metal, and nothing
   * else in the game sounds like it. */
  | "coin";

/**
 * A drop's flight: where it came out of the ground, and how much of the arc is
 * left. Purely a TIMER plus an origin — the engine never integrates a position,
 * because `pos` is the landing spot from the moment the item is minted. The
 * renderer derives the height, the lateral interpolation and the tumble from
 * `1 − ms/totalMs`, exactly as the angel delivery derives its descent from
 * `deliverMs`.
 */
export type ItemToss = {
  /** Where the drop burst out of — the body, the crate, the hero's own hands. */
  from: Vec2;
  /** Milliseconds of flight left. At 0 the item has landed. */
  ms: number;
  /** The flight's full duration, so the renderer can normalise `ms`. */
  totalMs: number;
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
 * A piece of the CANOPY: scenery floating BETWEEN the camera and the ground,
 * drawn over the hero and the horde rather than under them (see `LevelDef.canopy`).
 *
 * It is what gives a level a sense of being a SPACE rather than a floor — the
 * rift is a tear between universes, and a tear you look at from above through
 * nothing at all reads as a purple rug. Junk drifting overhead, out of focus and
 * sliding faster than the ground does, says there is air (or void) above the
 * hero's head.
 *
 * Deliberately NOT stepped: the drift is derived from the render clock, so a
 * canopy costs the simulation nothing, cannot desync a replay, and adds no state
 * to a save. The engine only decides WHAT is up there and where each piece
 * started.
 */
export type CanopyPiece = {
  kind: string;
  sprite: string;
  /** Where the piece sits at t=0, in level coordinates. */
  pos: Vec2;
  /** World px per second it drifts; the renderer wraps it round the level. */
  vel: Vec2;
  /**
   * How much faster than the ground it slides under the camera. Above 1 reads as
   * CLOSER to the eye than the ground plane, which is the whole illusion — a
   * piece that moved with the ground would just look like decor drawn in the
   * wrong order.
   */
  parallax: number;
  /** Blur radius in px. Distance-of-field: it is not what you are looking at. */
  blur: number;
  /** Opacity 0..1 — a canopy must never hide what the player is fighting. */
  alpha: number;
  /** Scale multiplier, so the same sprite can pass close and far. */
  scale: number;
};

/**
 * A CRITTER: living scenery — cows on the range, chickens in a yard, a jackrabbit
 * bolting across the dust.
 *
 * It is the ground-plane twin of the {@link CanopyPiece}, and it exists for the
 * same reason: a place that only contains things trying to kill you does not read
 * as a place, it reads as an arena. A field with cattle standing in it was a field
 * before the hero arrived and will be one after.
 *
 * Deliberately NOT stepped, exactly like the canopy — the wander is a closed-form
 * function of the render clock (two incommensurate sines per axis, so the path
 * never repeats and never needs integrating), which means a herd of forty costs
 * the simulation nothing, cannot desync a replay, and adds nothing to a save. It
 * also means a critter is not an ACTOR: nothing collides with it, it cannot be
 * hurt, and it never blocks a shot. It is alive, not in the way.
 */
export type Critter = {
  kind: string;
  /** Sprite name, or the base name of a two-frame walk (`<sprite>_0/_1`). */
  sprite: string;
  /** Whether `sprite` names a two-frame walk cycle to flip between. */
  animated: boolean;
  /** The centre it wanders around, in level coordinates. */
  home: Vec2;
  /** How far from home it strays, in world px. */
  range: number;
  /** Wander speed in world px/s — what the range is swept at. */
  speed: number;
  /** Per-critter phase offsets, so a herd never moves in lockstep. */
  phase: Vec2;
  /** Step period in seconds — how fast the two-frame walk flips. */
  stepSec: number;
  /** Scale multiplier, so a herd has calves in it. */
  scale: number;
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
    gear?: number;
    ammo?: number;
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
 * A LAIR (see `LevelDef.lairs`): a house with somebody in it.
 *
 * Shut until the hero comes near, then it opens ONCE and stays open — the door
 * prop swaps to its open frame and the occupant walks out to meet him. Nothing
 * ever closes it again: a door that shut behind a fight would hide the one piece
 * of evidence that the fight started somewhere.
 */
export type LairState = {
  id: string;
  /** The doorway — where the door is drawn and where the occupant emerges. */
  pos: Vec2;
  /** Whether the occupant has come out. */
  open: boolean;
  /** The sprite currently on the doorway (swapped on opening). */
  sprite: string;
  openSprite: string;
  triggerRadius: number;
};

/**
 * An ELEVATOR PAD (see `LevelDef.elevators`): step on it and the car carries the
 * hero to `to` — somewhere the map's own walls do not connect to.
 *
 * Purely a pair of coordinates plus a look; the ride itself is four lines in
 * `stepElevators`. What it buys is the one thing a doorway cannot: a destination
 * with no approach, so the minimap has nothing to show until the hero has been
 * there.
 */
export type ElevatorState = {
  id: string;
  pos: Vec2;
  to: Vec2;
  sprite: string;
  radius: number;
  label?: string;
  /** The door id this car is keyed to, if any — the hero rides only while
   * carrying the story item that `unlocks` it (see `LevelDef.elevators`). */
  opensWith?: string;
  /** Whether the hero has ridden this pad at least once (the app dims a used
   * pad's call light, and the arrival pad must not re-fire the moment he lands
   * on it — see `state.elevatorLockMs`). */
  used: boolean;
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
export type MapMarkerKind =
  | "story"
  | "elite"
  | "boss"
  | "merchant" /**
   * Somebody with an errand, pinned the moment the hero meets them — the
   * walk BACK to a giver is half of every quest, and a map that remembers
   * where the conversation started is what makes an errand a round trip
   * instead of a hunt.
   */
  | "questGiver" /**
   * A quest TARGET the hero has laid eyes on (`QUESTS.markSightRadius`) —
   * the named elite an errand sent him after, or the first of a breed it
   * asked him to thin out. Pinned on sight rather than on death, because
   * the pin's whole job is to answer "where was that thing again".
   */
  | "questTarget";

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
 * What a stall's consumable slot sells — the same three pickups the field rains
 * (see items/consumables.ts), bought over the counter instead of found: a
 * MEDKIT of a stocked quality, a weapon REPAIR KIT, an energy DRINK. Each banks
 * into its dock stack on purchase, exactly as touching one on the floor would.
 */
export type MerchantConsumable = "medkit" | "repair" | "drink";

/**
 * One entry on the merchant's stall (see merchant.ts). WHAT HE SELLS IS WHAT HE
 * SELLS: every entry carries a finite `qty`, rolled once at the meeting and
 * spent down by purchases — nothing restocks mid-level, so a stall is a shop
 * you clear out rather than a faucet you stand at (Diablo 2 style: the stall
 * empties, the run moves on). A weapon is always a single piece; consumables
 * come in a small pile.
 */
export type MerchantStock = {
  id: number;
  price: number;
  /** Units left; 0 reads as SOLD OUT and refuses further purchases. */
  qty: number;
} & (
  | { kind: "ability"; defId: string }
  | { kind: "weapon"; equipment: Equipment }
  | {
      kind: "consumable";
      item: MerchantConsumable;
      /** A medkit's quality (index into `MEDKIT.tiers`); unset for the others. */
      tier?: number;
    }
);

/**
 * The WANDERING MERCHANT: one per level, roaming until met (config
 * MERCHANT). The horde ignores him and nothing hurts him — he is a trader,
 * not a combatant. `discovered` latches on the first close encounter: he
 * stays put from then on, pinned on the level map, his stall stocked
 * against the hero he just met. `rng` is his own seeded stream so his
 * wandering never perturbs the run's roll sequence.
 */
/**
 * THE HERO'S VEHICLES — the car and the garage ship as first-class MACHINES,
 * not pictures. Each is ASSEMBLED at render time from parts so every part
 * can move on its own: the car's wheels spin from `speed` and its body rides
 * two simulated suspension springs; the ship's engine flame answers
 * `thrust`. The driving and flying minigames plug into these fields rather
 * than building systems beside them: throttle writes `speed`/`thrust`,
 * crashes and hard landings write `wear` (0 = showroom, 1 = trashed and
 * buckled — body sprite variants and stains key off it when they exist),
 * and climbing in writes `driver`.
 *
 * Minted at run creation wherever the carve pins a `car` or `rocket`
 * landmark (the landmark stays as the travel door's tap anchor; the
 * renderer draws the assembly in its place), with `kind: "vehicle"`
 * blockers under the footprint. Simulated by `stepVehicles`
 * (src/game/vehicles.ts) — deterministic clockwork, no rng.
 */
type VehicleBase = {
  /** Body center at the ground line. */
  pos: Vec2;
  /** Which way the nose points (sprites author nose-right / upright). */
  faceLeft: boolean;
  /** Ground speed (world px/s) along the facing — spins the car's wheels.
   * Parked runs hold it at 0; the minigames own it. */
  speed: number;
  /** Damage, 0 (showroom) .. 1 (trashed) — the minigames raise it. */
  wear: number;
  /** Seat index of whoever is at the wheel/stick, or null when parked. */
  driver: number | null;
};

/** The car's six body panels — each carries its own damage rung, so the
 * driving minigame crumples exactly what hit the wall. Sprite names key off
 * these ids: `car_<panel>_<rung>`. */
export type CarPanelId =
  "backside" | "doors" | "roof" | "hood" | "front_side" | "bumper" | "glass";

/** The parts that can work FREE of the body, each walking its own fix
 * ladder (see `CarVehicle.fixes`). The roof is bolted, not hinged, so it
 * skips DANGLING and tears straight off. */
export type CarDetachable = "doors" | "hood" | "bumper" | "roof";

/** The fix ladder a detachable part climbs — how attached it still is,
 * independent of how DENTED it is (that's the panel rung). */
export const CAR_FIX = {
  /** Bolted down — the panel rung draws, nothing moves. */
  attached: 0,
  /** Working free: still shut, but a bump makes it rattle a tad. */
  loose: 1,
  /** Hanging on its hinge, swinging with the suspension. */
  dangling: 2,
  /** Torn off — the bay shows, and the part lies shed on the ground. */
  gone: 3,
} as const;

export type CarVehicle = VehicleBase & {
  kind: "car";
  /** Where it was parked when the run was minted — the drive-out latch
   * measures departure from here. */
  home: Vec2;
  /** True once the drive-out has been booked (`carDeparted` fired) — the
   * latch, so the event never fires twice while the app fades out. */
  departed: boolean;
  /** Ms until the next `carEngine` rumble grain (only ticks with a driver
   * seated) — the running engine's sound cadence, stampede-rumble style. */
  engineCueMs: number;
  /** Ms until the next `carGrind` spark burst (only ticks while a bare
   * axle is dragging under way) — the grind's own cadence. */
  grindCueMs: number;
  /** Wheel roll angle (radians) — picks the spin frame per wheel. */
  wheelAngle: number;
  /** Spring compression per axle, [rear, front], world px downward. */
  suspension: [number, number];
  /** Spring velocity per axle (px/s) — the integrator's other half. */
  suspensionVel: [number, number];
  /** Per-panel damage rung, 0 (factory straight) .. 3 (broken) — picks the
   * `car_<panel>_<rung>` sprite. The minigame's crashes raise these; `wear`
   * stays the overall ladder the two of them summarize. */
  panels: Record<CarPanelId, number>;
  /** Per-wheel state, [rear, front]: 0 sound, 1 flat tire, 2 bent rim,
   * 3 GONE — the wheel tore off and is bouncing away as debris
   * (`WheelDebris`); the axle drops to the bump stop. */
  wheelStates: [number, number];
  /** How attached each detachable part still is (`CAR_FIX`): 0 attached,
   * 1 loose (rattles a tad on bumps), 2 dangling on the hinge, 3 gone.
   * `shedPart` climbs a part to gone and drops the shed piece as decor. */
  fixes: Record<CarDetachable, number>;
  /** Each part's swing away from rest (px-ish) — the dangle oscillator's
   * position, excited by the suspension and clamped tiny while only loose. */
  dangle: Record<CarDetachable, number>;
  /** The oscillator's other half (px/s). */
  dangleVel: Record<CarDetachable, number>;
};

/**
 * A wheel that tore off the car, dropped like a wheel on a highway: it
 * BOUNCES — gravity pulls `z` down, each floor hit keeps a fraction of the
 * fall and bleeds ground speed, and rolling friction walks the rest to a
 * stop. Deterministic clockwork like the car itself (no rng — the launch
 * kick comes from the crash that shed it), stepped by `stepVehicles`, and
 * left in place once settled so the wreck keeps its history.
 */
export type WheelDebris = {
  /** Ground-plane position of the wheel's contact point. */
  pos: Vec2;
  /** Ground-plane velocity (px/s). */
  vel: Vec2;
  /** Height above the floor (px) — the bounce. */
  z: number;
  /** Vertical speed (px/s, up positive). */
  vz: number;
  /** Roll angle (radians) — spins from ground speed, same as on the axle. */
  angle: number;
  /** The state the wheel wore when it left: 0 sound, 1 flat, 2 bent rim —
   * picks the same sprite ladder the axle uses. */
  wheelState: number;
  /** True once the bounce is spent — integration stops, the wheel rests. */
  settled: boolean;
};

export type ShipVehicle = VehicleBase & {
  kind: "ship";
  /** Engine output 0..1 — 0 parked and cold, above it the renderer lights
   * the flame. The flying minigame's throttle. */
  thrust: number;
};

export type Vehicle = CarVehicle | ShipVehicle;

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

/**
 * THE SESSION'S LOOT RULE (`GameState.lootMode`, multiplayer plan §4.3).
 *
 * Two answers and deliberately no third. A "need before greed" roll — the
 * third answer every MMO eventually grows — needs a modal, a timer, and a
 * quorum, all of which stop a fight the whole party is standing in; that is a
 * trade window's problem (phase 5) rather than a floor drop's.
 */
export type LootMode = "free" | "allocated";

/**
 * THE MARK A RUN CARRIES ONCE MORE THAN ONE PERSON HAS PLAYED IT
 * (`GameState.party`, multiplayer plan §5.3).
 *
 * **THE HOST IS A PLAYER, SO THE HOST CAN CHEAT** — that is the accepted cost
 * of a listen server, fine for playing with friends and fatal for a ranking. So
 * a run that more than one person has been in is MARKED, exactly as a modded
 * run's hero carries a `ModStamp`, and the boards refuse it: the four platform
 * boards rank lifetime kills, the hardest single blow, the best sustained kill
 * rate and a hardcore campaign, and every one of those is inflated by seven
 * other people helping without anybody having to cheat at all.
 *
 * **IT IS LATCHED, NOT PARAMETERIZED, AND THAT IS A DEPARTURE FROM THE PLAN'S
 * OWN SKETCH.** §5.3 says "seeded from `SessionParams` like every other run
 * parameter", and a parameter is the wrong shape here for three reasons. A run
 * is stamped by what HAPPENED to it, not by how it was opened — a host who
 * plays alone with the door open is playing solo, and a parameter set at
 * `createGame` would rank their whole session as co-op. It has three builders
 * (the app, the session, an arriving client) and a parameter is a thing one of
 * them can forget. And because it is ordinary DYNAMIC state, the latch
 * replicates for free: the server marks the run when it seats the second hero
 * and every client's next snapshot carries the mark, with no wire field, no
 * `SessionParams` row and no protocol bump.
 *
 * **IT NEVER CLEARS.** The party emptying out does not give the run its
 * records back — the same "progress only ever climbs" rule the campaign quest
 * chain follows, and for the same reason: the alternative silently hands the
 * board a run that was played by four people.
 */
/**
 * ONE SIDE OF AN OPEN TRADE (`src/game/trade.ts`, multiplayer plan §5.1).
 *
 * The offered item is named by BOTH its bag cell and its instance id, and the
 * pair is the anti-dupe rule: a cell alone is a cell whose contents may have
 * changed since the offer, and an id alone would have to be searched for —
 * which is exactly how a trade hands over something the offering player never
 * put on the table. The item STAYS in its owner's bag until it crosses, so a
 * cancelled trade costs nothing and there is never a moment when a piece of
 * gear exists in two places or in none.
 */
export type TradeSide = {
  /** The offering hero's inventory cell, or -1 for nothing. */
  cell: number;
  /** `Equipment.id` of the piece that was in that cell when it was offered. */
  itemId: number;
  /**
   * A COPY of the offered piece, for the OTHER side to look at.
   *
   * It has to travel, and the reason is the replication split: a bag is
   * PRIVATE, so the partner never receives the offering hero's inventory and
   * has no way to see what is in the cell being named. Without this a trade
   * window would show a cell index.
   *
   * **IT IS PRESENTATION AND NEVER AUTHORITY.** The swap re-reads the real cell
   * and compares the real id (see `settleTrade`); this copy is not consulted,
   * so a client that forged one would change a picture and nothing else.
   */
  item?: Equipment;
  /** Coins on the table. */
  coins: number;
  /** This side has agreed to the table AS IT STANDS. Dropped by any change to
   * either side, so an acceptance can only ever describe what was seen. */
  accepted: boolean;
};

export type PartyStamp = {
  /**
   * The most seats this run has ever held at once, host included — a fact
   * about the run worth keeping rather than a rule anything reads. Never
   * decreases: a session people have come and gone from is remembered at its
   * fullest.
   */
  seats: number;
};
