// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// QUAKE LINE — the ground splits away from the mob along the bearing it locked,
// fissure by fissure. The melee tree's SEISMIC proc, turned around (see
// defs/enemies/abilities.ts).
//
// A LANE, NOT A CIRCLE, and it is read exactly the way the charge is: the
// bearing locks at the tell, and a step sideways is the whole answer. What
// makes it a different move from the charge is that nothing travels — the mob
// stays where it is and the GROUND does the work, so it is the melee elite's
// way of hitting a hero who has backed off without giving up its own position.
//
// THE FISSURES ARRIVE IN ORDER, one every `stepMs` down the line, and that
// ordering is the fairness. A distant hero watches it coming for most of a
// second; a hero standing on top of the caster gets almost no warning at all —
// which is the correct way round, because being on top of a melee elite is
// supposed to be the dangerous place to stand.
//
// It does NOT root the mob after the cast: the lane is already committed and
// travels on its own clock, so the mob is free the moment it has struck the
// ground. A lane that held its caster still would just be a slower slam.

import { direction, distance } from "@game/lib/vec.ts";
import { PLAYER } from "../config/index.ts";
import type { QuakeLineAbility } from "../defs/enemies/abilities.ts";
import { registerAbility, type AbilityCtx } from "./catalog.ts";
import {
  groundMoveCanTouch,
  landHostileBlow,
  mobBlowDamage,
  pushEliteCast,
} from "./shared.ts";

function ready(ability: QuakeLineAbility, ctx: AbilityCtx): boolean {
  // Only worth opening if the hero is somewhere along the lane's length.
  return ctx.distance <= ability.count * ability.spacing;
}

function cast(ability: QuakeLineAbility, ctx: AbilityCtx): void {
  const { state, enemy } = ctx;
  const dir = ctx.lockedDir ?? direction(enemy.pos, ctx.target.pos);
  ctx.mech.quake = {
    from: { ...enemy.pos },
    dir: { ...dir },
    opened: 0,
    // The first fissure opens on the cast itself, so the windup the player just
    // watched has an immediate consequence at the mob's own feet.
    nextMs: 0,
  };
  pushEliteCast(state, enemy, ability, { count: ability.count });
}

function step(ability: QuakeLineAbility, ctx: AbilityCtx): boolean {
  const { state, enemy, mech, dtMs } = ctx;
  const quake = mech.quake;
  if (!quake) return false;

  quake.nextMs = Math.max(0, quake.nextMs - dtMs);
  if (quake.nextMs > 0) return false;

  if (quake.opened >= ability.count) {
    mech.quake = undefined;
    return false;
  }

  // Where this fissure opens: one `spacing` further down the locked lane each
  // time. Measured from where the mob STOOD, not from where it is now — the
  // lane was struck into the ground at the cast and does not follow the caster.
  const step_ = quake.opened + 1;
  const at = {
    x: quake.from.x + quake.dir.x * ability.spacing * step_,
    y: quake.from.y + quake.dir.y * ability.spacing * step_,
  };
  quake.opened = step_;
  quake.nextMs = ability.stepMs;

  pushEliteCast(state, enemy, ability, {
    phase: "tick",
    pos: at,
    radius: ability.radius,
  });

  // A jump clears it — the ground opening is a ground move like every other.
  if (
    groundMoveCanTouch(ctx.target) &&
    distance(ctx.target.pos, at) <= ability.radius + PLAYER.radius
  ) {
    landHostileBlow(
      state,
      ctx.target,
      mobBlowDamage(enemy, ctx.def.contactDamage, ability.damageFrac),
      enemy.mlvl,
      `${enemy.defId}:quake_line`,
      enemy,
      state.rng() < ctx.def.critChance,
    );
  }
  // FALSE — the lane runs on its own; the mob is free. See the header.
  return false;
}

registerAbility<QuakeLineAbility>({ id: "quake_line", ready, cast, step });
