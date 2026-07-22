// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Run flow, and the derived arrival loadout for cold starts.

/** Run flow. */
export const RUN = {
  /** Grace period between clearing the objective and the victory splash —
   * time enough to scoop up what the boss dropped. */
  victoryDelayMs: 5000,
  /** How long the farm-proof survival clock (`stats.combatMs`) keeps ticking
   * after a kill once the field is otherwise clear — the "combat is still
   * live" tail. A cleared field with no fresh kill inside this window stops
   * the clock, so survival time can't be milked by loitering (see step.ts). */
  combatGraceMs: 2000,
} as const;

/**
 * The DERIVED arrival loadout (`deriveArrivalLoadout` in arrival.ts): the
 * realistic stand-in used when a mid-campaign level starts with nothing
 * banked — dev `?level=` jumps, playtest bots, wiped storage. In the real
 * campaign the player's actual progress persists instead: victory banks an
 * `extractLoadout` snapshot the app hands back to `createGame` for the next
 * level. The derivation estimates that snapshot from data alone: a player
 * level from the earlier levels' rosters (mob count × hp through the XP
 * curve), stat points auto-spent, and the previous level's signature kit.
 */
export const ARRIVAL = {
  /**
   * Fraction of the earlier levels' total roster XP the derivation assumes a
   * clear actually banked — nobody kills every last wave mob before the boss
   * falls.
   */
  clearShare: 0.5,
  /** Round-robin order the banked stat points are auto-spent in. */
  statOrder: [
    "strength",
    "dexterity",
    "stamina",
    "speed",
    "intelligence",
    "luck",
  ],
  /** How many of the previous level's abilities ride along as held powerups. */
  heldAbilities: 2,
} as const;
