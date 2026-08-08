// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// What flows in and out of a run: per-tick GameInput and the Loadout
// carried between levels.

import type { Vec2 } from "@game/lib/vec.ts";

import type { AmmoType, Equipment, StatName, ViewRect } from "./core.ts";

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
  /**
   * THE HANDBRAKE, HELD — true for every step the player is hauling on it.
   *
   * A HOLD rather than an edge, which is what separates it from `jump` beside
   * it: a handbrake is a lever you keep hold of, so it is sampled every tick
   * like `steering` is rather than banked and spent once. It reaches the car
   * through `carControl` and means nothing at all on foot (the hero has no
   * lever), so a stray true from a second finger outside a car is harmless.
   */
  handbrake?: boolean;
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
   * Reorder the powerup dock this step: pull the slot at `from` and re-insert
   * it at `to` (indices into `heldAbilities`), running slots travelling with
   * their countdown (`moveHeldSlot`). Processed BEFORE `useItem`/`dropItemIndex`,
   * so those indices name the post-move dock. A discrete edge like `useItem` —
   * out-of-range or same-slot moves are quiet no-ops.
   */
  moveItem?: { from: number; to: number };
  /**
   * Permanently drop the powerup dock slot at this index this step
   * (`discardHeldAbility`): a banked pickup is destroyed (no undo, nothing
   * hits the ground); a RUNNING slot merely unlinks — the copy runs out its
   * countdown — and the slot frees for new loot. A discrete edge; out-of-range
   * is a quiet no-op.
   */
  dropItemIndex?: number;
  /**
   * True on the step the player asked to spend a stacked medkit (the medkit
   * consumable-dock slot / its key). Heals with the best quality held; a
   * no-op with none held or at full hp (`consumeMedkit`).
   */
  useMedkit?: boolean;
  /**
   * True on the step the player asked to spend a stacked stamina potion (the
   * stamina consumable-dock slot / its key). Refills the sprint pool; a no-op
   * with none held or already rested (`consumeStaminaPotion`).
   */
  useStaminaPotion?: boolean;
  /**
   * True on the step the player asked to spend a stacked repair kit (the repair
   * consumable-dock slot / its key). Mends the whole kit and re-equips any
   * durability-booted weapons; a no-op with none held or nothing to mend
   * (`useRepairKit`).
   */
  useRepairKit?: boolean;
  /**
   * THIS SEAT'S CAMERA — the world rect currently on its screen.
   *
   * When set, NOTHING THE GAME AIMS ON THIS PLAYER'S BEHALF may pick a mark
   * outside it: not the auto-weapon, not the conjured powers it carries, not
   * the sentry grid it deployed, not the companions walking beside it. The
   * character never strikes at what the player cannot see, and "cannot see" is
   * two facts — off the screen, or in the fog — that `game/sight.ts` answers
   * together. Stamped onto the hero each tick (`Player.view`) so the passes
   * that run outside the input's reach can still ask.
   *
   * Absent (headless tests, bots with no camera) every pick falls back to
   * weapon range and the fog alone.
   */
  view?: ViewRect;
  /**
   * The desktop mouse pointer's world position — the aim dimension. When set,
   * the auto-weapon prefers the monster in the pointer's direction over a
   * merely-closer one elsewhere (see `AIM.biasStrength`), so a desktop player
   * steers where the hero fires.
   *
   * Set by AIM & SHOOT ALONE — the one scheme whose pointer is pointing AT
   * something. FOLLOW CURSOR's pointer is a destination, so reading it as an
   * aim as well made the hero shoot whatever he was walking toward; a gamepad
   * player's mouse is not being held at all. Absent there (as for touch, bots
   * and headless tests), or resting on the hero, the pick falls back to the
   * engine's own best target — nearest, weighted by role, so an elite or a
   * boss outranks the chaff in front of it (see `TARGET_PRIORITY`).
   */
  aim?: Vec2;
  /**
   * Manual-fire gate (desktop AIM & SHOOT with AUTO-FIRE off): while `false`
   * the auto-attack holds its blow — the weapon cooldown keeps recovering, so
   * the strike is ready the instant the trigger is pressed. `true` or absent
   * (touch, bots, headless tests, every auto-fire scheme) the character
   * fights autonomously as always.
   */
  fire?: boolean;
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
  /**
   * The player's own spent stat points (see `Player.spentStats`). Optional so
   * loadouts banked before this shipped load without it — `applyLoadout` then
   * falls back to `stats`.
   */
  spentStats?: Record<StatName, number>;
  /**
   * The hero's trained passive TALENTS (id → rank; see `Player.talents`).
   * Optional so loadouts banked before talents shipped load without it —
   * `applyLoadout` then treats the hero as untrained (an adopted veteran's
   * points are minted from `spentStats` instead, see `migrateLoadout`).
   */
  talents?: Record<string, number>;
  /**
   * UNSPENT stat points the hero carries into the next run (see
   * `Player.pendingStatPoints`). Normally 0 — the level-up chooser forces a
   * ding's points to be spent before play resumes — but the AUTO PILOT REFUND
   * banks a build with the ride's allocations handed back as pending, so the
   * player re-spends them under their OWN control on the next run (the run's
   * opener greets them with the chooser; see `dismissIntro`). Optional so
   * loadouts banked before this shipped load as fully spent.
   */
  pendingStatPoints?: number;
  equipment: {
    weapon: Equipment;
    head: Equipment | null;
    chest: Equipment | null;
    legs: Equipment | null;
    feet: Equipment | null;
    amulet: Equipment | null;
    ring1: Equipment | null;
    ring2: Equipment | null;
    /**
     * LEGACY — the old single CHARM slot, before charms became carried
     * TRINKETS and the neck/finger slots took their place. Saves banked
     * before that change still carry one; `applyLoadout` moves it into the
     * BAG (where a trinket now pays out) and never writes the field again.
     */
    charm?: Equipment | null;
    /**
     * LEGACY — the old BAG-only second arm, before the slot grew to hold a
     * SHIELD as well and was renamed `offhand`. Saves banked before that
     * change still carry one; `applyLoadout` reads it as the offhand and
     * never writes the field again.
     */
    bag?: Equipment | null;
    offhand: Equipment | null;
  };
  inventory: (Equipment | null)[];
  /**
   * THE LOST & FOUND (items/vault.ts): what the AUTO PILOT threw away to keep
   * its bag workable, waiting to be bought back. Optional so loadouts banked
   * before the vault shipped load with an empty one.
   */
  vault?: Equipment[];
  /**
   * THE CACHE (engine/game/cache.ts): what the hero keeps in the garage chest.
   * It rides the loadout for the same reason the bag does — the loadout is how
   * everything a hero owns reaches the character — even though the cells are
   * only REACHABLE standing at the chest itself. Optional so loadouts banked
   * before the chest shipped load with an empty one.
   */
  cache?: (Equipment | null)[];
  /** Banked ability pickups (ABILITY_DEFS ids). */
  heldAbilities: string[];
  /** Stacked medkits per quality (see `Player.medkits`). Optional so loadouts
   * banked before consumables stacked load with empty stacks. */
  medkits?: number[];
  /** Stacked stamina potions (see `Player.staminaPotions`). Optional for the
   * same backward-compatibility reason. */
  staminaPotions?: number;
  /** Stacked weapon repair kits (see `Player.repairKits`). Optional so
   * loadouts banked before repair kits stacked load with none held. */
  repairKits?: number;
  /** The AMMUNITION POUCH (see `Player.ammo`) — rounds per kind, carried
   * between levels like every other pocket. Optional so a loadout banked
   * before ammunition shipped lands with an empty pouch, which `arrival.ts`
   * then seeds with the opening holster rather than leaving a returning hero
   * unable to fire. */
  ammo?: Partial<Record<AmmoType, number>>;
  /** CLEAN SLATES in hand (see `Player.cleanSlates`) — the respec charges THE
   * BIBLE carries. Optional so a loadout banked before the chain shipped
   * reads as none. */
  cleanSlates?: number;
  /** The purse — merchant coins ride along between levels. Optional so
   * loadouts banked before the economy shipped load as an empty purse. */
  coins?: number;
  /**
   * The recruited party rides along between levels AND difficulties: each
   * companion's def, its earned LEVEL and XP (so a companion levels up forever
   * across the whole save), whether it is DOWN, and its worn equipment. A
   * standing companion arrives rested — hp re-derives from the carried level on
   * apply. Optional so loadouts banked before companions shipped load as an
   * empty party; `level`/`xp` are optional so a loadout banked before companion
   * leveling loads at the hero's level.
   */
  companions?: {
    defId: string;
    /** The companion's earned level (defaults to the hero's on an old save). */
    level?: number;
    /** XP banked toward the next level (defaults to 0 on an old save). */
    xp?: number;
    /**
     * Carried DOWN, so a friend beaten down on the moon is still face-down when
     * the hero lands on Mars. Without it the walk between levels would be a
     * free revive — and the SMELLING SALTS the player was about to buy would be
     * a purchase for the patient only. Absent on an old loadout, which loads a
     * standing companion exactly as it always did.
     */
    downed?: boolean;
    equipment: {
      weapon: Equipment;
      head: Equipment | null;
      chest: Equipment | null;
    };
  }[];
};
