// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// SIPHON TETHER — a drain beam that holds while the hero stands in it: he
// loses, the mob gains (see defs/enemies/abilities.ts).
//
// RECOMPILE's little sibling, and the comparison is the whole design. A boss
// puts a healing NODE on the field and the answer is in the room; an elite has
// nothing to hide behind, so the answer is the tether itself — break the line
// of sight or get out of range and it drops on the spot.
//
// THREE RULES, each of which is what stops a healing mob being the cheapest
// trick in the genre:
//
//   • IT IS A RATE, NOT A LUMP. The same reason recompile is: a rate can be
//     out-damaged, while a lump silently deletes the stretch of fight the
//     player just paid for and offers nothing to do about it.
//   • IT ONLY GAINS WHAT IT TOOK. `healFrac` is a fraction of the damage
//     actually dealt, so a hero who steps out of the beam is not funding it.
//     A heal decoupled from the drain is just regeneration with a picture.
//   • IT HOLDS THE MOB STILL. `step` returns TRUE — the one elite move that
//     roots its caster for the duration, which is what makes standing in it a
//     genuine trade rather than a punishment: the mob is not chasing, not
//     biting, and is a stationary target for as long as it drinks.

import { distance } from "@game/lib/vec.ts";
import type { SiphonTetherAbility } from "../defs/enemies/abilities.ts";
import { lineOfSight } from "../obstacles.ts";
import { registerAbility, type AbilityCtx } from "./catalog.ts";
import { landHostileBlow, mobBlowDamage, pushEliteCast } from "./shared.ts";

/** Can the tether still see and reach him? Both are checked EVERY tick rather
 * than at the cast, because "break the line" is the answer and an answer that
 * is only sampled once is not one. */
function holds(ability: SiphonTetherAbility, ctx: AbilityCtx): boolean {
  const { state, enemy } = ctx;
  if (distance(enemy.pos, state.players[0].pos) > ability.range) return false;
  return lineOfSight(state, enemy.pos, state.players[0].pos);
}

function ready(ability: SiphonTetherAbility, ctx: AbilityCtx): boolean {
  return holds(ability, ctx);
}

function cast(ability: SiphonTetherAbility, ctx: AbilityCtx): void {
  ctx.mech.siphonMs = ability.durationMs;
  ctx.mech.siphonTickMs = 0;
  pushEliteCast(ctx.state, ctx.enemy, ability, {
    to: { ...ctx.state.players[0].pos },
    ms: ability.durationMs,
  });
}

function step(ability: SiphonTetherAbility, ctx: AbilityCtx): boolean {
  const { state, enemy, mech, dtMs } = ctx;
  if (!mech.siphonMs || mech.siphonMs <= 0) return false;

  mech.siphonMs = Math.max(0, mech.siphonMs - dtMs);
  mech.siphonTickMs = Math.max(0, (mech.siphonTickMs ?? 0) - dtMs);

  // Ran out, or the hero broke it. Either way it drops and the mob is free.
  if (mech.siphonMs <= 0 || !holds(ability, ctx)) {
    mech.siphonMs = undefined;
    mech.siphonTickMs = undefined;
    pushEliteCast(state, enemy, ability, { phase: "end" });
    return false;
  }

  if (mech.siphonTickMs <= 0) {
    mech.siphonTickMs = ability.tickMs;
    const lost = landHostileBlow(
      state,
      mobBlowDamage(enemy, ctx.def.contactDamage, ability.damageFrac),
      enemy.mlvl,
      `${enemy.defId}:siphon_tether`,
      enemy,
      false,
    );
    // Only what it actually took, and never past full. A drain that could push
    // a mob above its own maximum is a healing move wearing a drain's costume.
    if (lost > 0) {
      enemy.hp = Math.min(enemy.maxHp, enemy.hp + lost * ability.healFrac);
    }
    pushEliteCast(state, enemy, ability, {
      phase: "tick",
      to: { ...state.players[0].pos },
    });
  }
  // TRUE — the tether holds the mob still while it drinks. See the header.
  return true;
}

registerAbility<SiphonTetherAbility>({
  id: "siphon_tether",
  ready,
  cast,
  step,
});
