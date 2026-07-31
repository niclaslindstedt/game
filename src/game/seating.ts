// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// SEATING A HERO — how a player who was not there when the run started gets a
// character standing on the map.
//
// One function, called from exactly two places: the session server when a
// client is admitted (`server/session.ts`), and the client's own rebuild of the
// same run, so both processes grow the same party in the same order. A joiner
// is NOT a companion and not a copy of the host — they are a full `Player`,
// built by the same `createHero` seat 0 was built by and then dressed in their
// OWN loadout, so their bag, purse, build and talents are theirs.
//
// Three rules, and each of them is a bug somebody would otherwise ship:
//
//  1. **A SEAT IS APPENDED, NEVER INSERTED, AND NEVER SPLICED OUT.** Every
//     command and every input frame in flight names a seat by INDEX; renumbering
//     the party mid-run would deliver seat 4's steering to seat 3's hero. So a
//     player who leaves is `departHero`'d rather than removed: the seat stays
//     where it is, holding a body the world no longer answers for
//     (`Player.departed`), and the NEXT arrival is seated INTO it rather than
//     past it. The list of seats therefore only ever grows to the high-water
//     mark of people who have been here at once — a session that eight players
//     have cycled through two at a time is a party of two, not of sixteen.
//
//  2. **THEY ARRIVE WHERE THE PARTY IS, NOT AT THE LEVEL'S SPAWN.** A hero
//     dropped on the authored spawn point of a map the group cleared twenty
//     minutes ago has a walk through re-emptied terrain ahead of them before
//     they are in the game at all. They land beside the party instead — offset
//     by their seat so eight arrivals do not stack into one pile.
//
//  3. **THE HORDE IS NOT RE-PRICED FOR THEM HERE.** `/players N` is the knob
//     that scales the fight, and it is deliberately separate from how many
//     people are connected (see `server/wire/players.ts`) — so seating somebody
//     does not silently change the difficulty of a run in progress.

import { PLAYER } from "./config/index.ts";
import { createHero } from "./create.ts";
import { difficultyDef } from "./defs/difficulties.ts";
import { runLevelDef } from "./defs/levels/index.ts";
import { applyLoadout } from "./arrival.ts";
import { partyCentroid } from "./party.ts";
import type { GameState, Loadout, Player } from "./types/index.ts";

/** How far from the party a fresh arrival is set down, in world px. Far enough
 * not to be inside somebody, near enough to be in the same fight. */
const ARRIVAL_RING = PLAYER.radius * 6;

/**
 * Seat one more hero in a live run and return them.
 *
 * `loadout` is the arriving player's own carry-over — the same shape a level
 * transition hands `createGame`. Null seats the authored fresh start, which is
 * what a brand-new character joining a friend's game gets.
 */
export function seatHero(state: GameState, loadout: Loadout | null): Player {
  const seat = nextFreeSeat(state);
  const def = runLevelDef(state);
  const diff = difficultyDef(state.difficulty);
  const hero = createHero(
    arrivalSpot(state, seat),
    def,
    state.difficulty,
    diff,
    () => state.nextId++,
  );
  // A hero seated mid-run is already in play: the opening beats belong to the
  // run, not to the person, and one arriving holstered would stand there unable
  // to swing because a scripted strike three districts away has not fired.
  hero.disarmed = false;
  if (seat < state.players.length) state.players[seat] = hero;
  else state.players.push(hero);
  if (loadout) applyLoadout(state, hero, loadout);
  return hero;
}

/**
 * THE SEAT THIS ARRIVAL TAKES: the lowest DEPARTED one, or a fresh seat past
 * the end of the party.
 *
 * Re-using an emptied seat is what stops a session that people have come and
 * gone from filling up with bodies nobody is behind — the party is capped, and
 * without this a group of two that four people had passed through would be
 * refused a fifth member on the strength of three abandoned corpses.
 *
 * Re-use is only safe because a departed seat's owner is GONE: their commands
 * and input frames left with them, so nothing in flight can still name this
 * index and land on the newcomer. That is the one thing to preserve here — a
 * seat vacated by anything OTHER than a disconnect (a dead hero, a player in a
 * menu) must never be handed out.
 */
export function nextFreeSeat(state: GameState): number {
  const seat = state.players.findIndex((hero) => hero.departed);
  return seat >= 0 ? seat : state.players.length;
}

/**
 * The player in this seat has left the session; their hero is no longer
 * anybody's.
 *
 * See `Player.departed` for what that MEANS — in short, the world stops
 * answering for the body: it is not chased, not counted in the party's level or
 * its centre, not a pack's alarm clock, and not alive, so the people still
 * playing can both grow past it and lose the run.
 *
 * Seat 0 is refused, and that is a rule rather than a guard: seat 0 is the
 * HOST's, the host leaving ENDS the session (there is no host migration — see
 * the plan's §4.2), and a run whose seat 0 had quietly departed would keep
 * simulating with nobody entitled to it.
 */
export function departHero(state: GameState, seat: number): boolean {
  if (seat <= 0) return false;
  const hero = state.players[seat];
  if (!hero || hero.departed) return false;
  hero.departed = true;
  return true;
}

/** Where seat `seat` is set down: on a ring around the party's middle, each
 * seat on its own bearing so a rush of arrivals does not land in one pile. */
function arrivalSpot(state: GameState, seat: number): { x: number; y: number } {
  const centre = partyCentroid(state);
  // The bearing is derived from the SEAT rather than rolled, so seating is
  // deterministic in both processes — a draw here would consume from the run's
  // rng stream on the server and not on the client, which is a desync of every
  // roll afterwards.
  const angle = (seat * Math.PI * 2) / 8;
  return {
    x: clampTo(
      centre.x + Math.cos(angle) * ARRIVAL_RING,
      PLAYER.radius,
      state.level.width - PLAYER.radius,
    ),
    y: clampTo(
      centre.y + Math.sin(angle) * ARRIVAL_RING,
      PLAYER.radius,
      state.level.height - PLAYER.radius,
    ),
  };
}

function clampTo(value: number, lo: number, hi: number): number {
  return value < lo ? lo : value > hi ? hi : value;
}
