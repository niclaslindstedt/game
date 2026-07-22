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
} as const;
