// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// What flows in and out of a run: per-tick GameInput and the Loadout
// carried between levels.

import type { Vec2 } from "@game/lib/vec.ts";

import type { Equipment, StatName } from "./core.ts";

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
   * True on the step the player asked to spend a stacked BLUE GATORADE mana
   * potion (its consumable-dock slot / key). Refills the spell pool; a no-op
   * with none held or mana already full (`consumeManaPotion`).
   */
  useManaPotion?: boolean;
  /**
   * True on the step the player tapped a spell-bar slot — a discrete EDGE (like
   * `useItem`), driven by the HUD button / cast key / bot. It ENQUEUES the slot
   * (`castSpellIndex`, index into `Player.spellSlots`); the engine then drains
   * the queue one cast per GLOBAL cooldown while mana lasts (`stepSpellQueue`).
   * A queued cast is a no-op — dropped — when the slot is empty, the spell is
   * still on its own cooldown, there's nothing to hit, or the hero's stat no
   * longer unlocks it; the first cast the pool can't afford flushes the queue.
   * Must be reset to false each tick so a single press casts exactly ONCE.
   */
  castSpell?: boolean;
  /** Which spell-bar slot `castSpell` fires (index into `Player.spellSlots`). */
  castSpellIndex?: number;
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
  /** Stacked medkits per quality (see `Player.medkits`). Optional so loadouts
   * banked before consumables stacked load with empty stacks. */
  medkits?: number[];
  /** Stacked stamina potions (see `Player.staminaPotions`). Optional for the
   * same backward-compatibility reason. */
  staminaPotions?: number;
  /** Stacked blue-gatorade mana potions (see `Player.manaPotions`). Optional so
   * loadouts banked before mana shipped load with none held. */
  manaPotions?: number;
  /** The HUD spell-bar assignment (see `Player.spellSlots`). Optional so
   * loadouts banked before spells shipped load with an empty bar (the app then
   * auto-fills it from the hero's unlocked spells). */
  spellSlots?: (string | null)[];
  /** Stacked weapon repair kits (see `Player.repairKits`). Optional so
   * loadouts banked before repair kits stacked load with none held. */
  repairKits?: number;
  /** The purse — merchant coins ride along between levels. Optional so
   * loadouts banked before the economy shipped load as an empty purse. */
  coins?: number;
  /**
   * The recruited party rides along between levels AND difficulties: each
   * companion's def, its earned LEVEL and XP (so a companion levels up forever
   * across the whole save), and its worn equipment. They arrive rested — hp
   * re-derives from the carried level on apply. Optional so loadouts banked
   * before companions shipped load as an empty party; `level`/`xp` are optional
   * so a loadout banked before companion leveling loads at the hero's level.
   */
  companions?: {
    defId: string;
    /** The companion's earned level (defaults to the hero's on an old save). */
    level?: number;
    /** XP banked toward the next level (defaults to 0 on an old save). */
    xp?: number;
    equipment: {
      weapon: Equipment;
      head: Equipment | null;
      chest: Equipment | null;
    };
  }[];
};
