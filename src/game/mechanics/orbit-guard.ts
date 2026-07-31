// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// ORBIT GUARD — a ring of motes turning around the mob, biting what they sweep
// through. The hero's ORBIT powerup and the Archon's orbiting flames, pointed
// the other way (see defs/enemies/abilities.ts).
//
// TWO THINGS MAKE IT AN ELITE MOVE RATHER THAN A DAMAGE AURA, and both are
// easy to undo by "simplifying" this file:
//
//   • IT DOES NOT ROOT THE MOB. `step` returns FALSE, always. A ring is passive
//     — the mob keeps hunting while it turns — which is the entire reason it is
//     worth casting on something that wants to be in contact. Returning true
//     here would plant the caster for the ring's whole duration and turn the
//     game's most aggressive elites into statues.
//   • IT BITES ON A SHARED CADENCE, not per mote. A ring of six passing through
//     the hero at once must cost one bite, not six: billing per mote makes the
//     damage a function of how finely the ring was authored, which is a number
//     nobody tuned and the player cannot see. Same rule the beam's scorch band
//     follows.

import { distance } from "@game/lib/vec.ts";
import { PLAYER } from "../config/index.ts";
import type { OrbitGuardAbility } from "../defs/enemies/abilities.ts";
import type { Vec2 } from "@game/lib/vec.ts";
import { registerAbility, type AbilityCtx } from "./catalog.ts";
import {
  groundMoveCanTouch,
  landHostileBlow,
  mobBlowDamage,
  pushEliteCast,
} from "./shared.ts";

/**
 * Where the motes are RIGHT NOW. Exported because the app draws the ring from
 * this same function rather than from its own copy of the arithmetic — a ring
 * whose drawn motes sat anywhere but where the biting ones are would be the
 * worst kind of unfair, since the player would be dodging a picture.
 */
export function orbitMotePositions(
  centre: Vec2,
  angle: number,
  count: number,
  radius: number,
): Vec2[] {
  const motes: Vec2[] = [];
  for (let i = 0; i < count; i++) {
    const a = angle + (Math.PI * 2 * i) / count;
    motes.push({
      x: centre.x + Math.cos(a) * radius,
      y: centre.y + Math.sin(a) * radius,
    });
  }
  return motes;
}

/** Worth raising when the hero is anywhere near enough to walk into it. Far
 * enough out and the ring would simply burn its duration on empty floor. */
function ready(ability: OrbitGuardAbility, ctx: AbilityCtx): boolean {
  return ctx.distance <= ability.radius * 4;
}

function cast(ability: OrbitGuardAbility, ctx: AbilityCtx): void {
  const { mech } = ctx;
  mech.orbitMs = ability.durationMs;
  // Starts at a rolled angle so a mob casting it twice in a fight does not
  // present the identical gap in the identical place both times.
  mech.orbitAngle = ctx.state.rng() * Math.PI * 2;
  mech.orbitBiteMs = 0;
  pushEliteCast(ctx.state, ctx.enemy, ability, {
    count: ability.count,
    radius: ability.radius,
    ms: ability.durationMs,
  });
}

function step(ability: OrbitGuardAbility, ctx: AbilityCtx): boolean {
  const { state, enemy, mech, dt, dtMs } = ctx;
  if (!mech.orbitMs || mech.orbitMs <= 0) return false;

  mech.orbitMs = Math.max(0, mech.orbitMs - dtMs);
  mech.orbitAngle = (mech.orbitAngle ?? 0) + ability.angularSpeed * dt;
  mech.orbitBiteMs = Math.max(0, (mech.orbitBiteMs ?? 0) - dtMs);

  if (mech.orbitMs <= 0) {
    mech.orbitAngle = undefined;
    mech.orbitBiteMs = undefined;
    pushEliteCast(state, enemy, ability, { phase: "end" });
    return false;
  }

  // A jump clears the ring exactly as it clears a slam, a bite and burning
  // floor — one answer the player carries from move to move.
  if (mech.orbitBiteMs > 0 || !groundMoveCanTouch(state)) return false;

  const motes = orbitMotePositions(
    enemy.pos,
    mech.orbitAngle,
    ability.count,
    ability.radius,
  );
  const reach = ability.orbRadius + PLAYER.radius;
  const struck = motes.some((m) => distance(m, state.player.pos) <= reach);
  if (!struck) return false;

  mech.orbitBiteMs = ability.hitIntervalMs;
  landHostileBlow(
    state,
    mobBlowDamage(enemy, ctx.def.contactDamage, ability.damageFrac),
    enemy.mlvl,
    `${enemy.defId}:orbit_guard`,
    enemy,
    state.rng() < ctx.def.critChance,
  );
  pushEliteCast(state, enemy, ability, {
    phase: "tick",
    pos: state.player.pos,
  });
  // FALSE — the ring never owns the mob's tick. See the header.
  return false;
}

registerAbility<OrbitGuardAbility>({ id: "orbit_guard", ready, cast, step });
