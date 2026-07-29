// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// CALL OF INCELS — the boss calls its followers, and they arrive at a dead run.
//
// The engine already owns a charging herd: a wall of runners that mints past
// the screen edge, telegraphs itself with a line of approach dust down the lane
// it will take, tramples the horde aside and knocks the grounded hero flat
// (`LevelDef.stampedes`). But it was WEATHER — a thing a MAP switched on, that
// happened on a timer, that nobody chose.
//
// Handing the trigger to a boss changes what it means without changing a line
// of how it works. It stops being background and becomes a move with an author
// behind it: he calls them, they come, and the reason they came is him. That is
// the entire ability, and it is why this module is thirty lines — the right
// thing to build was already there, pointed slightly the wrong way.
//
// The answer is the one the stampede has already taught anybody who has played
// Eastworld: get out of the lane. A move that reuses an answer the player
// already owns is a move they can beat the first time they see it, which is
// exactly what a NIGHTMARE-gated addition should be.

import type { CallHordeAbility } from "../defs/enemies/abilities.ts";
import { spawnCalledHerd } from "../hazards.ts";
import { registerAbility, type AbilityCtx } from "./catalog.ts";

/**
 * Worth calling whenever nothing he called is still running. A second herd on
 * top of the first would read as one indivisible wall rather than as two waves
 * to step between, and the gap between waves is where the move is actually
 * played.
 */
function ready(_ability: CallHordeAbility, ctx: AbilityCtx): boolean {
  return ctx.state.stampedes.length === 0;
}

function cast(ability: CallHordeAbility, ctx: AbilityCtx): void {
  const { state, enemy } = ctx;
  // The first wave is here NOW; the rest are owed, and arrive on the herd
  // hazard's own timer (`stampedeTimerMs`), which is already the thing that
  // paces waves onto the field.
  spawnCalledHerd(state, ability.runnerSprite);
  if (ability.waves > 1) state.stampedeTimerMs = ability.waveGapMs;
  state.events.push({
    type: "bossHorde",
    pos: { ...enemy.pos },
    defId: enemy.defId,
  });
}

registerAbility<CallHordeAbility>({ id: "call_horde", ready, cast });
