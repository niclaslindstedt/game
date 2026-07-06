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
 * Start (or refresh) an ability on the player. Picking up an ability that is
 * already running resets its timer instead of stacking a second copy.
 */
export function grantAbility(state: GameState, defId: string): void {
  const def = abilityDef(defId);
  const running = state.player.abilities.find((a) => a.defId === defId);
  if (running) {
    running.remainingMs = def.durationMs;
  } else {
    state.player.abilities.push({
      defId,
      remainingMs: def.durationMs,
      angle: 0,
      cooldownMs: 0,
    });
  }
  state.events.push({ type: "abilityStarted", defId });
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
