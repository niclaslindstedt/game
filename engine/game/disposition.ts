// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// WHO ON THE FIELD IS ACTUALLY IN THE FIGHT — the one predicate every damage
// pass, every target search and every foe tally asks before it touches a body.
//
// Until this module the answer was a bare `def.apparition` read, repeated at
// some forty sites: a dialogue-only figure is mist, so blades pass through it,
// nukes ignore it, the bot never picks it, and the HUD's foe total leaves it
// out. A NEUTRAL mob wants the identical treatment for a completely different
// reason — it is a person (or a machine) who is simply not fighting anybody —
// and the two answers have to be given in the SAME place, because a quest mob
// the player can accidentally cleave in half while swinging at the horde
// behind it is a quest chain that dead-ends with no error and no explanation.
//
// SO THE RULE IS ONE FUNCTION, `inert`, AND IT IS NOT A SYNONYM FOR
// "APPARITION". A neutral mob differs from mist in the two ways that matter:
// it never dissolves, and it can be PROVOKED. `provokeEnemy` latches
// `Enemy.hostile`, and from that instant the def's disposition stops
// answering — the same body is an ordinary monster, hittable, killable,
// counted, and hunting the hero who talked it into a corner. That is the whole
// mechanism behind a conversation whose worst branch turns a bystander into a
// fight, and it costs the combat code nothing: every site already asks `inert`.
//
// The state is a latch on the ENEMY, never on the def, because two of the same
// breed may stand on one map and only one of them be talked into it.

import type { EnemyDef } from "./defs/enemies/index.ts";
import { enemyDef } from "./defs/enemies/index.ts";
import type { Enemy, GameState } from "./types/index.ts";

/**
 * IS THIS BODY OUT OF THE FIGHT? True for an apparition (mist — see
 * `EnemyDef.apparition`) and for a neutral mob that has not been provoked.
 *
 * Every damage pass, AoE gather, target search and foe tally in the engine
 * gates on this. Both arguments are taken because nearly every caller is a hot
 * loop that already holds the def; {@link inertEnemy} is the convenience for
 * the few that hold only the body.
 */
export function inert(def: EnemyDef, enemy: Enemy): boolean {
  return (
    def.apparition === true ||
    (def.disposition === "neutral" && enemy.hostile !== true)
  );
}

/** {@link inert} for a caller that holds only the body. */
export function inertEnemy(enemy: Enemy): boolean {
  return inert(enemyDef(enemy.defId), enemy);
}

/**
 * IS THIS A BYSTANDER RIGHT NOW? Narrower than {@link inert}: true only for an
 * un-provoked neutral, never for an apparition. Read by the things that are
 * about a PERSON rather than about a body — whether a walk-up may open a
 * conversation, whether the renderer draws a talk prompt over a head.
 */
export function isNeutral(def: EnemyDef, enemy: Enemy): boolean {
  return def.disposition === "neutral" && enemy.hostile !== true;
}

/**
 * TURN A BYSTANDER INTO A FIGHT. The one way `Enemy.hostile` is ever set: a
 * conversation branch that goes badly, or a scripted beat that means it to.
 *
 * The latch is all it takes — `inert` stops excusing the body, so it is
 * hittable, killable, counted and (being awake) hunting from the next tick.
 * The mob is woken deliberately rather than left to its aggro radius, because
 * the provocation happened in a conversation at conversational range and a
 * bystander that shrugged and went back to work would read as the branch
 * having done nothing.
 *
 * Returns false for a body that was never neutral or has already turned, so a
 * repeated choice is harmless.
 */
export function provokeEnemy(state: GameState, enemy: Enemy): boolean {
  const def = enemyDef(enemy.defId);
  if (!isNeutral(def, enemy)) return false;
  enemy.hostile = true;
  enemy.awake = true;
  // It stops strolling its route the moment it turns: a mob still walking its
  // patrol while shooting at the hero reads as two mobs sharing a sprite.
  enemy.workTarget = undefined;
  enemy.workPauseMs = 0;
  state.events.push({
    type: "enemyProvoked",
    pos: { ...enemy.pos },
    defId: enemy.defId,
  });
  return true;
}

/**
 * THE FOES A LEVEL COUNTS. The HUD's total, the victory check and the wave
 * budget all mean "things that can be killed", so an inert body is left out —
 * and a neutral that is provoked joins the tally mid-run, which is correct:
 * it can be killed now, and the player made it so.
 */
export function countsAsFoe(enemy: Enemy): boolean {
  return !inertEnemy(enemy);
}
