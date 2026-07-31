// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// WHOM DOES A MOB CHASE — the first of the shared reads the party model had to
// answer (`docs/multiplayer-plan.md` §3.1), and the one every other pass in the
// combat half then reads back off the mob.
//
// The rule is NEAREST VISIBLE, WITH HYSTERESIS, and each of the three words is
// load-bearing:
//
//   NEAREST is the honest default. A mob that picked the host, or picked at
//   random, would let a party trivially park one hero at the far end of a map
//   and farm with the other seven untouched.
//
//   VISIBLE, because the horde already refuses to chase a hero it cannot see
//   (a wall breaks a minion's aggro — see `moveEnemy`), and a party-aware
//   answer that ignored sight would have mobs grinding into walls toward the
//   nearest hero while a second one stood in the open beside them. The sight
//   test is the CALLER's, passed in, because line of sight is `obstacles.ts`'s
//   business and this leaf is read from the deepest part of the enemy loop.
//   A mob that can see NOBODY keeps the nearest anyway, so it still has a
//   direction to give up on rather than freezing.
//
//   HYSTERESIS, because "nearest" alone is a coin flip between two heroes
//   standing a pixel apart, re-tossed sixty times a second: the mob juddered
//   between them, its flank offset re-picked each tick, and a pack's envelope
//   dissolved into noise. A new quarry has to be MEANINGFULLY closer — a
//   fraction nearer than the one it is already after — before the mob turns.
//   The one exception is a quarry it can no longer chase (dead, or gone from
//   the run), which is dropped at once.
//
// The answer is remembered on the mob (`Enemy.quarry`) rather than recomputed
// per read, so the whole tick — the move, the reach, the ranged lead, every
// set-piece mechanic's aim — agrees about who is being fought. That agreement
// is the point: a mob walking toward hero A while its slam telegraphs at hero B
// is not a difficulty, it is a bug nobody can read.

import { distanceSq } from "@game/lib/vec.ts";

import { ENEMY_AI } from "./config/index.ts";
import { heroInPlay, nearestHero } from "./party.ts";
import type { Enemy, GameState, Player } from "./types/index.ts";

/** How much nearer a rival hero must be before a mob turns on them, as a
 * fraction of the distance to the quarry it already has. */
const SWITCH_MARGIN = ENEMY_AI.quarrySwitchMargin;

/**
 * Resolve — and remember — which hero this mob is after.
 *
 * `sees` answers "can this mob see that hero from where it stands"; pass a
 * function that always returns true for a mob that does not care about walls (a
 * phasing ghost, a summoned runner called to the party, a hazard).
 *
 * Never returns null: a run always has seat 0, and a mob with the whole party
 * down is handed the fallen seat 0 so the passes downstream have a point to
 * walk toward rather than a branch to grow.
 */
export function quarryFor(
  state: GameState,
  enemy: Enemy,
  sees: (hero: Player) => boolean,
): Player {
  const party = state.players;
  const held = enemy.quarry;
  const current =
    held !== undefined && party[held] && heroInPlay(party[held])
      ? party[held]
      : null;

  // Nearest hero this mob can actually see. Sight is the expensive half, so it
  // is only asked of heroes that are candidates on distance at all — which for
  // a single-player run is exactly one call, the same as before the party.
  let best: Player | null = null;
  let bestD = Infinity;
  // Whether the mob can still see the hero it is already after. A quarry it has
  // LOST is given up outright, however near it still is: the horde's own aggro
  // already breaks when a wall comes between it and the hero, and a hysteresis
  // that outranked sight would leave a mob grinding into that wall while a
  // second hero stood beside it in the open.
  let holdsSight = false;
  for (const hero of party) {
    if (!heroInPlay(hero)) continue;
    if (!sees(hero)) continue;
    if (hero === current) holdsSight = true;
    const d = distanceSq(hero.pos, enemy.pos);
    if (d >= bestD) continue;
    bestD = d;
    best = hero;
  }
  // Nobody in sight: keep whoever it was after, or fall back to the plain
  // nearest so it has something to give up on.
  if (!best) {
    const fallback = current ?? nearestHero(state, enemy.pos) ?? party[0];
    enemy.quarry = party.indexOf(fallback);
    return fallback;
  }
  if (!current || current === best || !holdsSight) {
    enemy.quarry = party.indexOf(best);
    return best;
  }
  // A rival has to be meaningfully closer to pull the mob off its quarry.
  const heldD = distanceSq(current.pos, enemy.pos);
  const margin = 1 - SWITCH_MARGIN;
  if (bestD < heldD * margin * margin) {
    enemy.quarry = party.indexOf(best);
    return best;
  }
  enemy.quarry = party.indexOf(current);
  return current;
}

/**
 * The hero this mob is ALREADY after, without re-deciding.
 *
 * What every pass downstream of the move reads — the ranged lead, the contact
 * reach, a mechanic's locked bearing — so all of them aim at the same person.
 * A mob that has never looked for anybody (one that has not been stepped yet,
 * or a hazard's stand-in) gets the nearest living hero.
 */
export function quarryOf(state: GameState, enemy: Enemy): Player {
  const held = enemy.quarry;
  const party = state.players;
  if (held !== undefined) {
    const hero = party[held];
    if (hero && heroInPlay(hero)) return hero;
  }
  return nearestHero(state, enemy.pos) ?? party[0];
}
