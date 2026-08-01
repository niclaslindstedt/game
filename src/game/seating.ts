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
//
//  4. **SEATING IS WHERE A RUN BECOMES A PARTY RUN.** This is the one function
//     that grows a party, so it is the one place `GameState.party` is stamped
//     (see `PartyStamp` for why the mark is latched here rather than passed in
//     as a session parameter). It is what keeps the run off every leaderboard
//     from this moment on, and it never clears.

import { PLAYER } from "./config/index.ts";
import { createHero } from "./create.ts";
import { difficultyDef } from "./defs/difficulties.ts";
import { runLevelDef } from "./defs/levels/index.ts";
import { applyLoadout } from "./arrival.ts";
import { partyCentroid } from "./party.ts";
import { releaseStuckLevelup } from "./talents.ts";
import { endTradesFor } from "./trade.ts";
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
  stampParty(state);
  return hero;
}

/**
 * Mark the run as one more than one person has played (`PartyStamp`).
 *
 * Counted over the WHOLE party rather than over the heroes still in play: a
 * player who leaves does not give the run its leaderboard records back, so the
 * seat count is a high-water mark and the stamp, once set, is never cleared.
 */
function stampParty(state: GameState): void {
  const seats = state.players.length;
  if (seats < 2) return;
  state.party = { seats: Math.max(seats, state.party?.seats ?? 0) };
}

/**
 * MORE THAN ONE PERSON HAS PLAYED THIS RUN, so nothing it produces may reach a
 * ranking — the ONE predicate every board-facing record asks (see `PartyStamp`).
 *
 * It is deliberately not `state.players.length > 1`: that answers a question
 * about right now, and the run of a party whose second player quit an hour ago
 * is still a run two people played.
 */
export function isPartyRun(state: GameState): boolean {
  return state.party != null;
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
 *
 * A HELD seat is skipped, and that is the same rule read the other way: it is
 * being kept for the person who dropped out of it (`Player.held`, plan §5.4),
 * so handing it to a newcomer would give away a hero somebody is on their way
 * back to. The session releases the hold when the grace window lapses.
 */
export function nextFreeSeat(state: GameState): number {
  const seat = state.players.findIndex((hero) => hero.departed && !hero.held);
  return seat >= 0 ? seat : state.players.length;
}

/** What kind of departure this is. */
export type DepartOptions = {
  /**
   * KEEP THE SEAT for the person who left it (plan §5.4). A dropped connection
   * and a player quitting look identical from a socket, so the caller has to
   * say which it is treating this as.
   */
  hold?: boolean;
  /**
   * PERMIT SEAT 0 TO DEPART.
   *
   * Refused by default, and that is a rule rather than a guard: in the shipped
   * topology seat 0 is the HOST's, the host leaving ENDS the session (there is
   * no host migration — see the plan's §4.2), and a run whose seat 0 had
   * quietly departed would keep simulating with nobody entitled to it.
   *
   * A DEDICATED SERVER has no host, so that reasoning does not apply to it and
   * this is how it says so: seat 0 there is an ordinary seat, empty until
   * somebody joins and empty again when they go. Only an ownerless session may
   * pass true — see `server/session.ts`.
   */
  seatZero?: boolean;
};

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
export function departHero(
  state: GameState,
  seat: number,
  options: DepartOptions = {},
): boolean {
  if (seat < 0) return false;
  if (seat === 0 && !options.seatZero) return false;
  const hero = state.players[seat];
  if (!hero || hero.departed) return false;
  hero.departed = true;
  // A TRADE THIS SEAT WAS IN GOES WITH THEM (plan §5.1). Nothing has moved, so
  // nothing is undone — but leaving it open would strand the partner at a
  // table whose other side will never accept and can never settle.
  endTradesFor(state, seat);
  // `hold` says this MIGHT be a dropped connection rather than somebody
  // quitting, so the seat is kept for them — see `Player.held` and
  // `resumeHero`. The two look identical from a socket, which is the whole
  // reason the caller has to say which it is.
  if (options.hold) hero.held = true;
  // **AND THE WORLD STOPS WAITING ON THEM.** Found by the bot-client soak
  // (`scripts/bot-client.mjs`): a player who leaves while owing a LEVEL-UP
  // freezes the session for ever. The chooser is a GLOBAL phase, it lifts only
  // when the points are placed, and a departed hero will never place them — so
  // eight bots went on steering, sixty times a second, at a run whose clock had
  // stopped and whose kill count never moved again.
  //
  // The points are NOT forfeited: the seat may be held for thirty seconds and
  // the person coming back should find their level-up where they left it. What
  // is dropped is the WORLD's obligation to sit and wait — the same line
  // `heroInPlay` draws everywhere else, arrived at from the one direction that
  // had not been checked. `state.phase` losing eleven members to a per-player
  // `Player.screen` is the real fix and is the plan's §3.2; until then this is
  // the difference between one player quitting and everybody's run ending.
  releaseStuckLevelup(state);
  return true;
}

/**
 * The person who dropped out of this seat is back — hand them the hero they
 * were playing (multiplayer plan §5.4).
 *
 * The body has been standing on the field meaning nothing to the world while
 * they were gone; this is the single flag flip that makes the world start
 * answering for it again, with every point of xp, every item and every level it
 * had at the moment the connection went. That is the whole value of the
 * feature: the alternative is a fresh hero built from whatever loadout was last
 * banked, i.e. losing the run so far to a dropped packet.
 *
 * False when the seat holds nobody, holds somebody still playing, or was not
 * being held — a hold that has lapsed is a seat that may already have been
 * given away, and reviving a hero out from under its new owner would be worse
 * than making them start again.
 */
export function resumeHero(state: GameState, seat: number): Player | null {
  const hero = state.players[seat];
  if (!hero || !hero.departed || !hero.held) return null;
  hero.departed = false;
  hero.held = false;
  return hero;
}

/**
 * Stop keeping this seat — the grace window lapsed and nobody came back.
 *
 * The body stays exactly where it was and stays `departed`; all this does is
 * make the seat available again, so the next arrival is seated into it as they
 * would have been before §5.4 existed.
 */
export function releaseSeat(state: GameState, seat: number): void {
  const hero = state.players[seat];
  if (hero) hero.held = false;
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
