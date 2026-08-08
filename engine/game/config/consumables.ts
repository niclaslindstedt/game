// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Carried pickups: medkit tiers, the held-ability cap, and the consumable
// dock's stacks.

/**
 * The medkit consumable: picked up on touch, never enters the inventory.
 * D2-style TIERS — each heals a FRACTION OF THE HERO'S MAX HP, and deeper
 * content drops bigger kits: the drop rolls the deepest tier the killer's
 * monster level has unlocked most of the time and the one under it sometimes
 * (3:1, the affix bracket idiom — see `rollMedkitTier` in loot.ts). Percentage
 * heals stay meaningful against a campaign health bar at every level without a
 * static number decaying into a scratch: even the LIGHT kit is a real top-up
 * (30% of the bar), and a SUPERIOR is a full mend. All tiers share one sprite
 * for now; the drop share and the per-rung medkitDropMult stay the balance
 * lever on scarcity.
 */
export const MEDKIT = {
  tiers: [
    { name: "LIGHT MEDKIT", healPct: 0.3, minMlvl: 1 },
    { name: "MEDKIT", healPct: 0.5, minMlvl: 12 },
    { name: "LARGE MEDKIT", healPct: 0.75, minMlvl: 30 },
    { name: "SUPERIOR MEDKIT", healPct: 1, minMlvl: 46 },
  ],
  radius: 8,
  /**
   * How often a medkit drop pays the DEEPEST tier the killer's monster level
   * has unlocked rather than the one under it (the 3:1 affix-bracket idiom —
   * see `rollMedkitTier`). Shared with `medkitAppetite`, which weighs the
   * pouch's fill by these same odds so "how stocked am I on the kits that
   * would actually drop here" reads off one number.
   */
  topTierChance: 0.75,
} as const;

/**
 * Ability pickups are carried, not auto-used: touching one banks it, and the
 * `useItem` input (mouse click / the HUD button) spends the
 * oldest banked one. Timing the storm for the flood is the player's call.
 */
export const HELD_ITEMS = {
  /** How many ability pickups the player can carry; extras stay grounded. */
  cap: 3,
} as const;

/**
 * Stacked consumables (medkits, stamina potions, weapon repair kits): a touched
 * kit banks into the consumable dock rather than firing on contact, and the
 * `useMedkit` / `useStaminaPotion` / `useRepairKit` inputs (a dock-slot tap or
 * its key) spend one on the player's call — so the hero carries a reserve and
 * heals/mends when it matters. Medkits stack per quality (one `stackCap`-deep
 * stack per MEDKIT tier); stamina potions and repair kits each share one stack.
 * A pickup that would overflow its stack stays on the ground.
 */
export const CONSUMABLES = {
  /** How deep one stack goes; a full stack turns away further pickups. */
  stackCap: 5,
  /**
   * APPETITE — how much of a consumable's authored slice of the drop ladder the
   * hero's CURRENT state earns (see `medkitAppetite` / `consumableAppetite`).
   * Two factors multiply: SUPPLY (how full the pouch already is) and NEED (how
   * far the pool that consumable restores has fallen).
   *
   * SUPPLY: the pouch fill at which the slice starts thinning. A drop is
   * refused on touch once its stack is full, so a fat slice on a full pouch
   * just carpets the field with pickups the hero walks over — but a reserve is
   * the point of a stack, so the rain runs at FULL strength until the pouch is
   * this deep and only tapers over the top of it. At `stackCap` 5 the first two
   * of a kind fall at the authored rate and the next three at a fading one.
   */
  appetiteStart: 0.4,
  /**
   * …and the SUPPLY floor: what a completely full pouch still earns. NOT zero —
   * a medkit lying on the ground is a strategic asset even to a hero who can't
   * bank it, the reason to dive a pack you'd otherwise walk around ("there's a
   * free top-up waiting on the far side"), and the same holds for a drink
   * banked against a sprint burst. So a full pouch keeps a THIN rain of ground
   * bait rather than none — enough to plan around, far too little to litter.
   */
  appetiteFloor: 0.3,
  /**
   * …and the NEED lean: how much a completely EMPTY pool widens the slice, on
   * top of supply. A hero at half health finds medkits a little more often than
   * one at full, a winded hero finds drinks more often, a chewed-up kit draws
   * repairs — scaled linearly by the deficit, so merely not being at 100% ticks
   * the rate up and nothing changes for a hero who is topped off.
   *
   * Distinct from the MERCY boost, which is a DESPERATION ramp (nothing until
   * the hero is genuinely drowning) that tapers to zero by JESUS. This is the
   * gentle, always-on gradient every rung gets — the rain notices what you are
   * short of long before the game starts throwing you ropes.
   */
  appetiteNeedBonus: 0.75,
} as const;
