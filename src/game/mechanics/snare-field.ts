// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// SNARE FIELD — a patch of ground underfoot that will not let go. The hero's
// STASIS powerup, turned around (see defs/enemies/abilities.ts).
//
// IT DEALS NO DAMAGE, AND THAT IS THE DESIGN, not an omission waiting to be
// corrected. A slow is frightening in exact proportion to what else is on the
// field: cast by a lone mob it is an inconvenience, and laid under a hero who
// is already being flanked it is the reason the flank works. Giving it a damage
// tick would make it a worse burning patch instead of a different move, and the
// tier already has a burning patch.
//
// It rides `state.scorches` as a `snare` patch rather than growing a hazard
// list of its own — the list is "ground with a duration and a rule", and this
// is a second rule (see `ScorchPatch.field`). The pace multiplier is applied at
// `playerSpeed`, the one site that owns the hero's pace, so the sprint pool,
// the winded jog and every talent ride the slow instead of fighting it.
//
// The field is laid where the hero WAS when the tell started, like every other
// move here: walked out of by a player who keeps moving, stepped into by one
// who stands and trades.

import type { SnareFieldAbility } from "../defs/enemies/abilities.ts";
import { registerAbility, type AbilityCtx } from "./catalog.ts";
import { pushEliteCast } from "./shared.ts";

function ready(ability: SnareFieldAbility, ctx: AbilityCtx): boolean {
  return ctx.distance <= ability.range;
}

function cast(ability: SnareFieldAbility, ctx: AbilityCtx): void {
  const { state, enemy } = ctx;
  const at = { ...state.players[0].pos };
  state.scorches.push({
    pos: at,
    field: "snare",
    slowFactor: ability.slowFactor,
    look: ability.look,
    radius: ability.radius,
    remainingMs: ability.durationMs,
    durationMs: ability.durationMs,
    // A snare never bites, so its bite clock is inert — but the fields are not
    // optional on the patch, and a snare pretending to have a cadence would
    // read as a burn that had been mis-tuned to zero damage.
    tickMs: 0,
    intervalMs: 0,
    damage: 0,
    defId: enemy.defId,
    seed: Math.floor(state.rng() * 0x7fffffff),
  });
  pushEliteCast(state, enemy, ability, {
    pos: at,
    radius: ability.radius,
    ms: ability.durationMs,
  });
}

registerAbility<SnareFieldAbility>({ id: "snare_field", ready, cast });
