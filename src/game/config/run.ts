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
   * the clock, so survival time can't be milked by loitering (see step/). */
  combatGraceMs: 2000,
} as const;

/**
 * The DEATH SCENE — the dramatic tableau that plays when the hero falls, before
 * the YOU DIED modal (see `death-scene.ts`). The run drops into the `dying`
 * phase: the horde stops attacking, backs off, and rings the fallen hero, more
 * mobs wander in from the screen edges to swell the crowd, clouds roll across
 * the field, and only then does the defeat splash rise. A tap anywhere skips
 * straight to the modal.
 */
export const DEATH_SCENE = {
  /** How long the whole scene plays before the modal auto-rises (ms) — tuned
   * for a ~8s beat inside the brief the design calls for (7–10s). */
  durationMs: 8000,
  /** The radius (world px) the gathered horde rings the corpse at: mobs pack in
   * toward the fallen hero but never closer than this, leaving him lying alone
   * in the middle of the ring. */
  ringRadius: 24,
  /** How fast a mob advances toward its place in the ring ONCE it is on screen
   * (world px/s) — an ABSOLUTE pace, not a fraction of the mob's own speed, so
   * a slow shambler (an intern crawls at 14 px/s) still packs the ring at a
   * consistent, purposeful closing-in before it stops and stands. */
  gatherSpeed: 60,
  /** How fast a still-OFF-SCREEN mob rushes in toward the crowd (world px/s) —
   * faster than the on-screen `gatherSpeed`, so it hurries out of the dark, then
   * slows to the menacing shuffle the moment it reaches the field. The ring
   * swells fast; the crowd around the corpse reads deliberate. */
  approachSpeed: 150,
  /** Ms between spawn pulses that wander fresh mobs in from the screen edges. */
  spawnEveryMs: 110,
  /** How many mobs each spawn pulse wanders in — a couple per pulse so the
   * screen fills within the first few seconds. */
  spawnPerPulse: 2,
  /** The most mobs the scene will let stand on the field at once — the swarm
   * fills the screen but is capped so it can't grow without bound. */
  maxCrowd: 150,
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
  statOrder: ["strength", "dexterity", "stamina", "intelligence", "luck"],
  /** How many of the previous level's abilities ride along as held powerups. */
  heldAbilities: 2,
} as const;
