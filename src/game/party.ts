// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE PARTY — the run's heroes, and the handful of questions the simulation is
// allowed to ask about them as a group.
//
// `GameState.players` is a LIST because a run may hold up to `MAX_CLIENTS`
// heroes (multiplayer PR 3). Single player is the one-element case and nothing
// in the engine treats it specially — which is the whole point: a pass that
// works for a party works for one hero, while a pass written against one hero
// silently means "seat 0" the day a second player arrives.
//
// Every read of the party goes through this leaf, and there are exactly two
// kinds of them (`docs/multiplayer-plan.md` §3.1 measured the split):
//
//   PRIVATE reads — the bag, the purse, the build, the talents — are asking
//   about ONE hero, and the answer is always "the one this pass is about". They
//   are a PARAMETER, not a lookup, and they do not belong here at all. A pass
//   that reaches for `primaryHero` to find a bag is a pass that has not been
//   parameterized yet.
//
//   GEOMETRY reads — where is the threat, the target, the anchor — are asking
//   about the party, and each needs a party-aware answer: nearest, any, all, or
//   centroid. Those are the functions below, and picking the wrong one is a
//   design bug rather than a typo: `anyHeroWithin` is what wakes a pack (a pack
//   half the party walked past is a pack that never fights), while
//   `nearestHero` is what a mob chases.
//
// This module is a LEAF on purpose — types and vector maths only. It is read
// from the deepest passes in the pipeline, so an import here would tangle
// everything below it.

import { distance, distanceSq, type Vec2 } from "@game/lib/vec.ts";

import type { GameState, Player } from "./types/index.ts";

/** The run's heroes, in SEAT order. Seat 0 is the host's, and it is the seat a
 * single-player run has. */
export function heroes(state: GameState): readonly Player[] {
  return state.players;
}

/**
 * SEAT 0 — the run's first hero.
 *
 * This is the honest name for "the hero" in code that genuinely has only one:
 * the headless simulator's report, a developer scenario, the autopilot's own
 * bookkeeping. It is NOT a stand-in for a parameter — see the header.
 */
export function primaryHero(state: GameState): Player {
  return state.players[0];
}

/** True while this hero is still on their feet (and therefore a target, a
 * pack's alarm clock, and a share of the horde's attention). */
export function heroAlive(hero: Player): boolean {
  return hero.hp > 0;
}

/** The heroes still standing. Empty when the party is wiped, which every
 * caller has to survive — a mob with nobody to chase simply idles. */
export function livingHeroes(state: GameState): Player[] {
  return state.players.filter(heroAlive);
}

/** True when the whole party is down — the run's defeat condition. */
export function partyWiped(state: GameState): boolean {
  return !state.players.some(heroAlive);
}

/**
 * The living hero nearest `pos`, or null when the party is wiped.
 *
 * The answer a mob's aggro, a hazard's victim search and a spawn point's
 * placement all want. It does NOT apply the aggro hysteresis — that is
 * `step/enemies.ts`'s own rule, because hysteresis needs the mob's CURRENT
 * quarry, which is a fact about the mob rather than about the party.
 */
export function nearestHero(state: GameState, pos: Vec2): Player | null {
  let best: Player | null = null;
  let bestD = Infinity;
  for (const hero of state.players) {
    if (!heroAlive(hero)) continue;
    const d = distanceSq(hero.pos, pos);
    if (d < bestD) {
      bestD = d;
      best = hero;
    }
  }
  return best;
}

/**
 * The living hero nearest `pos` that also satisfies `ok` — the seeing half of
 * "nearest VISIBLE hero". The predicate is the caller's (line of sight is
 * `obstacles.ts`'s business and this leaf may not import it), and a search that
 * finds nobody falls back to the plain nearest, so a mob behind a wall still
 * has something to walk toward rather than standing idle.
 */
export function nearestHeroWhere(
  state: GameState,
  pos: Vec2,
  ok: (hero: Player) => boolean,
): Player | null {
  let best: Player | null = null;
  let bestD = Infinity;
  for (const hero of state.players) {
    if (!heroAlive(hero) || !ok(hero)) continue;
    const d = distanceSq(hero.pos, pos);
    if (d < bestD) {
      bestD = d;
      best = hero;
    }
  }
  return best ?? nearestHero(state, pos);
}

/** Distance from `pos` to the nearest living hero, or Infinity with the party
 * down. The scalar half of `nearestHero`, for the many sites that only want to
 * know how far away the trouble is. */
export function distanceToParty(state: GameState, pos: Vec2): number {
  const hero = nearestHero(state, pos);
  return hero ? distance(hero.pos, pos) : Infinity;
}

/** `distanceToParty` squared, without the square root — the form the per-mob
 * loops want, since they compare against a squared radius anyway and run once
 * per enemy per tick. */
export function distanceSqToParty(state: GameState, pos: Vec2): number {
  let best = Infinity;
  for (const hero of state.players) {
    if (!heroAlive(hero)) continue;
    const d = distanceSq(hero.pos, pos);
    if (d < best) best = d;
  }
  return best;
}

/**
 * True when ANY living hero is within `radius` of `pos`.
 *
 * The trigger rule for everything the world does when somebody walks up to it:
 * a pack waking, a lair door banging open, a hazard arming, a merchant being
 * met, a lift being called. ANY rather than the nearest, because a fixture only
 * one of eight players has ever reached is a fixture seven of them never see.
 */
export function anyHeroWithin(
  state: GameState,
  pos: Vec2,
  radius: number,
): boolean {
  const r2 = radius * radius;
  for (const hero of state.players) {
    if (!heroAlive(hero)) continue;
    if (distanceSq(hero.pos, pos) <= r2) return true;
  }
  return false;
}

/** Every living hero within `radius` of `pos` — a hazard's blast list, an
 * AoE's victims. Damage then resolves per hero, which is why this returns the
 * list rather than a boolean. */
export function heroesWithin(
  state: GameState,
  pos: Vec2,
  radius: number,
): Player[] {
  const r2 = radius * radius;
  return state.players.filter(
    (hero) => heroAlive(hero) && distanceSq(hero.pos, pos) <= r2,
  );
}

/**
 * The party's centre of mass — where the horde is budgeted around, where the
 * camping anchor tracks, and where "the party is roughly here" is the honest
 * answer.
 *
 * Falls back to seat 0's position with the party wiped, so a caller mid-death
 * still gets a point on the map rather than a NaN.
 */
export function partyCentroid(state: GameState): Vec2 {
  let x = 0;
  let y = 0;
  let n = 0;
  for (const hero of state.players) {
    if (!heroAlive(hero)) continue;
    x += hero.pos.x;
    y += hero.pos.y;
    n += 1;
  }
  if (n === 0) return { ...state.players[0].pos };
  return { x: x / n, y: y / n };
}

/**
 * THE PARTY'S LEVEL — the highest any living hero has reached.
 *
 * What the horde is scaled and priced against (`resolveMobScaling`,
 * `mobLevelScale`, the drop ladder), and the highest rather than the average or
 * seat 0's for the reason Diablo 2 scales an area off the party: an average lets
 * a group carry a level-1 alt through a level-90 map by arithmetic, and seat 0's
 * makes the whole difficulty of a run depend on who happened to press HOST.
 *
 * Falls back to seat 0 with the party wiped, so a death mid-tick cannot make the
 * horde level 0.
 */
export function partyLevel(state: GameState): number {
  let best = 0;
  for (const hero of state.players) {
    if (heroAlive(hero) && hero.level > best) best = hero.level;
  }
  return best || state.players[0].level;
}

/** The seat a hero is sitting in, or -1 for a hero not in this run. Events and
 * commands name a seat rather than carrying a hero, because a seat survives the
 * wire and an object reference does not. */
export function seatOf(state: GameState, hero: Player): number {
  return state.players.indexOf(hero);
}

/** The hero in this seat, or null for an empty one. Every command that arrives
 * over the wire resolves its actor this way — from the seat the SERVER assigned
 * the connection, never from a seat the client named. */
export function heroAt(state: GameState, seat: number): Player | null {
  return state.players[seat] ?? null;
}
