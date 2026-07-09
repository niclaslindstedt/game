// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Ability helpers shared by the step pipeline and the renderer: activating a
// pickup, where orbit orbs sit right now, and how hard a stasis field slows
// a monster. The per-tick behavior itself lives in step.ts (stepAbilities)
// so all combat flows through one hitEnemy path.

import { distance, type Vec2 } from "@game/lib/vec.ts";
import { abilityDef, type AbilityDef } from "./defs/abilities.ts";
import { effectiveStat } from "./items.ts";
import type { ActiveAbility, GameState, Player } from "./types.ts";

/**
 * Activate an ability on the player. A `stackable` power adds a fresh copy on
 * every activation, so two STORM CELLs strike twice as often and two rings of
 * FIRE ORBS interleave into a denser sweep. A non-stackable power refuses to
 * start a second copy while one is still running (the MAGNET — its pull can't
 * stack), leaving nothing changed. Returns whether a copy actually started, so
 * the caller can keep a refused pickup banked instead of consuming it.
 *
 * `slot` links the copy back to the dock slot it was spent from — that slot
 * keeps the powerup, counting down in place, until the copy lapses (see
 * ActiveAbility.slot). Omit it for a scripted grant with no dock slot.
 */
export function grantAbility(
  state: GameState,
  defId: string,
  slot?: number,
): boolean {
  const def = abilityDef(defId);
  const running = state.player.abilities.filter((a) => a.defId === defId);
  if (running.length > 0 && !def.stackable) return false;
  state.player.abilities.push({
    defId,
    remainingMs: def.durationMs,
    // Phase a stacked orbit half a step off the copies already up so its orbs
    // interleave with the existing ring instead of hiding right behind it.
    angle: def.orbit
      ? ((Math.PI / def.orbit.count) * running.length) % (Math.PI * 2)
      : 0,
    cooldownMs: 0,
    slot,
  });
  state.events.push({ type: "abilityStarted", defId });
  return true;
}

/**
 * Pull the dock slot at `index` out of `heldAbilities` and close the row up,
 * keeping every running copy's `slot` link pointed at its powerup as the tail
 * shifts down. Returns the removed def-id (or null when `index` is empty /
 * out of range). The one place `heldAbilities` shrinks — a lapsed power, a
 * spent nuke, or a discard all route through here so the links never drift.
 */
export function removeHeldSlot(state: GameState, index: number): string | null {
  const held = state.player.heldAbilities;
  if (index < 0 || index >= held.length) return null;
  const [defId] = held.splice(index, 1);
  for (const ability of state.player.abilities) {
    if (ability.slot !== undefined && ability.slot > index) ability.slot -= 1;
  }
  return defId ?? null;
}

/** Whether the dock slot at `index` is holding a power that is running now. */
export function isSlotActive(state: GameState, index: number): boolean {
  return state.player.abilities.some((a) => a.slot === index);
}

/**
 * Permanently drop the banked ability pickup in dock slot `index` — the "drag
 * it out of its slot to make room for new loot" gesture. The rest of the row
 * shifts down so the dock stays packed oldest-first. Returns the discarded
 * def-id (so the UI can announce/poof it), or null on an empty or out-of-range
 * slot. A slot whose power is already running can't be discarded (it counts
 * down in place until it lapses) — that returns null too. There is no undo and
 * nothing is left on the ground: the powerup is gone for good. Safe to call
 * outside step() (the dock discards while paused-free play continues).
 */
export function discardHeldAbility(
  state: GameState,
  index: number,
): string | null {
  if (isSlotActive(state, index)) return null;
  return removeHeldSlot(state, index);
}

/** World positions of an orbit ability's orbs, spread evenly on the ring. */
export function orbPositions(player: Player, ability: ActiveAbility): Vec2[] {
  const orbit = abilityDef(ability.defId).orbit;
  if (!orbit) return [];
  const positions: Vec2[] = [];
  for (let i = 0; i < orbit.count; i++) {
    const angle = ability.angle + (i * Math.PI * 2) / orbit.count;
    positions.push({
      x: player.pos.x + Math.cos(angle) * orbit.radius,
      y: player.pos.y + Math.sin(angle) * orbit.radius,
    });
  }
  return positions;
}

/**
 * A magnet ability's effective pull radius for this player: the def's base
 * widened by INTELLIGENCE. Shared by the item-pull step and the renderer's
 * field ring.
 */
export function magnetRadius(state: GameState, def: AbilityDef): number {
  if (!def.magnet) return 0;
  return (
    def.magnet.radius +
    effectiveStat(state, "intelligence") * def.magnet.radiusPerInt
  );
}

/**
 * The combined slow multiplier stasis fields apply to a monster at `pos`
 * (1 = unaffected). Fields don't stack below the strongest one.
 */
export function stasisFactorAt(player: Player, pos: Vec2): number {
  let factor = 1;
  for (const ability of player.abilities) {
    const stasis = abilityDef(ability.defId).stasis;
    if (!stasis) continue;
    if (distance(player.pos, pos) <= stasis.radius) {
      factor = Math.min(factor, stasis.slowFactor);
    }
  }
  return factor;
}
