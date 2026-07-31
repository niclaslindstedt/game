// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// EMBER TRAIL — the mob starts leaving burning ground behind it as it hunts.
// The hero's TRAIL powerup and the Archon's immolation, turned around (see
// defs/enemies/abilities.ts).
//
// It rides `state.scorches`, the SAME burning floor LASER EYES lays, and that
// reuse is the point rather than a saving: the hazard, its once-per-cadence
// bite rule, its ageing, its wire replication and its ground art all came free,
// and a player who has met ARMSTRONG already knows not to stand in it. What
// makes it read as a different move is the `look` kit the patches carry out
// with them — the same primitive laid in the caster's own colours.
//
// LIKE THE ORBIT, IT DOES NOT ROOT: `step` returns false. The whole idea is a
// mob that paints while it chases, so where the fire ends up is decided by how
// the player has been kiting it. A rooted painter would just be a slower way of
// drawing a circle.

import type { EmberTrailAbility } from "../defs/enemies/abilities.ts";
import { registerAbility, type AbilityCtx } from "./catalog.ts";
import { mobBlowDamage, pushEliteCast } from "./shared.ts";

function ready(ability: EmberTrailAbility, ctx: AbilityCtx): boolean {
  // Worth starting only when there is somebody to paint a path away from —
  // otherwise the duration burns down on an empty room. Authored per mob;
  // absent, twelve patch-widths off its own `radius`, so a wide slow trail
  // commits from further out than a mean one.
  return ctx.distance <= (ability.range ?? ability.radius * 12);
}

function cast(ability: EmberTrailAbility, ctx: AbilityCtx): void {
  ctx.mech.trailMs = ability.durationMs;
  // Drops its first patch immediately, so the cast has a visible consequence
  // rather than a `dropMs` of dead air after the windup the player just dodged.
  ctx.mech.trailDropMs = 0;
  pushEliteCast(ctx.state, ctx.enemy, ability, { ms: ability.durationMs });
}

function step(ability: EmberTrailAbility, ctx: AbilityCtx): boolean {
  const { state, enemy, mech, dtMs } = ctx;
  if (!mech.trailMs || mech.trailMs <= 0) return false;

  mech.trailMs = Math.max(0, mech.trailMs - dtMs);
  mech.trailDropMs = Math.max(0, (mech.trailDropMs ?? 0) - dtMs);

  if (mech.trailMs <= 0) {
    mech.trailDropMs = undefined;
    pushEliteCast(state, enemy, ability, { phase: "end" });
    return false;
  }
  if (mech.trailDropMs > 0) return false;

  mech.trailDropMs = ability.dropMs;
  state.scorches.push({
    pos: { ...enemy.pos },
    field: "burn",
    look: ability.look,
    radius: ability.radius,
    remainingMs: ability.patchMs,
    durationMs: ability.patchMs,
    tickMs: 0,
    intervalMs: ability.tickMs,
    damage: mobBlowDamage(enemy, ctx.def.contactDamage, ability.damageFrac),
    defId: enemy.defId,
    seed: Math.floor(state.rng() * 0x7fffffff),
  });
  // FALSE — painting is something the mob does WHILE hunting. See the header.
  return false;
}

registerAbility<EmberTrailAbility>({ id: "ember_trail", ready, cast, step });
