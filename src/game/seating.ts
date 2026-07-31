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
//     the party mid-run would deliver seat 4's steering to seat 3's hero. A
//     player who leaves keeps their hero standing where they left it (PR 4 owns
//     what happens to it) — the list only ever grows for the life of a run.
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
  const seat = state.players.length;
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
  state.players.push(hero);
  if (loadout) applyLoadout(state, hero, loadout);
  return hero;
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
