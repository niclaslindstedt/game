// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE PARTY STAMP — the mark that keeps a co-op run off every leaderboard
// (multiplayer plan §5.3), and the four things about it that are easy to get
// wrong in a way no single-player test would ever notice.
//
// The stamp is LATCHED rather than parameterized, which is a deliberate
// departure from the plan's own sketch (see `PartyStamp`): a run is marked by
// what happened to it, not by how it was opened, so a host who plays alone with
// the door open keeps their records and a host who seats one friend loses them
// for the rest of the run.

import { describe, expect, it } from "vitest";

import { departHero, isPartyRun, seatHero, type GameState } from "@game/core";

import { startGame } from "./helpers.ts";

/** A run with `n` heroes seated, seat 0 included. */
function seated(n: number): GameState {
  const state = startGame(11);
  for (let i = 1; i < n; i++) seatHero(state, null);
  return state;
}

describe("the party stamp", () => {
  it("leaves a solo run unmarked", () => {
    const state = seated(1);
    expect(state.party ?? null).toBeNull();
    expect(isPartyRun(state)).toBe(false);
  });

  it("marks the run the moment a second hero is seated", () => {
    const state = seated(1);
    seatHero(state, null);
    expect(isPartyRun(state)).toBe(true);
    expect(state.party?.seats).toBe(2);
  });

  it("keeps the seat count at its high-water mark", () => {
    const state = seated(4);
    expect(state.party?.seats).toBe(4);
    // Two of them quit. The mark does not shrink with them: the run was played
    // by four people whatever the room looks like now.
    departHero(state, 3);
    departHero(state, 2);
    expect(state.party?.seats).toBe(4);
  });

  it("never clears once the party empties out", () => {
    const state = seated(2);
    departHero(state, 1);
    // The body is still in its seat, and even if it were not, the run does not
    // get its records back — see `PartyStamp`.
    expect(isPartyRun(state)).toBe(true);
  });

  it("is a question about the run, not about who is on the map now", () => {
    const state = seated(2);
    // The read every board-facing record makes must not be
    // `players.length > 1`: that answers "is anybody here", and an hour after a
    // second player left it answers it with "no".
    departHero(state, 1);
    state.players.length = 1;
    expect(state.players.length).toBe(1);
    expect(isPartyRun(state)).toBe(true);
  });
});
