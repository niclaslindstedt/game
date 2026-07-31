// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// RECONNECT — a dropped player comes back to the hero they were playing rather
// than to a fresh one (multiplayer plan §5.4).
//
// **THE PROPERTY UNDER TEST IS AN ABSENCE OF LOSS**, which is why the suite
// spends most of its lines putting something ON the hero before dropping it: a
// reconnect that returns a hero with the right SHAPE and none of its progress
// would pass a naive assertion and would still be the bug this feature exists
// to prevent, since the whole point is that a lost packet must not cost an hour.
//
// The clock is the test's, because the grace window is the one thing in the
// session measured in wall clock rather than in ticks — and the boundary either
// side of a window is exactly where this kind of code goes wrong.

import { describe, expect, it } from "vitest";

import {
  departHero,
  nextFreeSeat,
  releaseSeat,
  resumeHero,
  seatHero,
  type GameState,
} from "@game/core";
import { decodeFrame } from "@game/wire/codec.ts";
import {
  FRAME,
  RECONNECT_GRACE_MS,
  type SessionParams,
  type WelcomePayload,
} from "@game/wire/protocol.ts";

import { createSession, type Session } from "../../server/session.ts";
import { startGame } from "./helpers.ts";

const PARAMS: SessionParams = {
  seed: 4242,
  levelId: "test_level",
  difficulty: "easy",
  loadout: null,
  respec: false,
  clearedLevels: [],
  merchantDiscovered: false,
  generatedMaps: false,
  generatedMapSize: "random",
};

/** A session on a clock the test owns, with the host already seated. */
function rig() {
  let clock = 0;
  const welcomes = new Map<number, WelcomePayload>();
  const session: Session = createSession({
    params: PARAMS,
    build: "test",
    secret: 0xc0ffee,
    now: () => clock,
  });
  const join = (id: number) => {
    session.addClient(
      id,
      (frame) => {
        const decoded = decodeFrame(frame);
        if (decoded?.type === FRAME.welcome) {
          welcomes.set(id, decoded.payload as WelcomePayload);
        }
      },
      { play: true },
      `P${id}`,
    );
    return welcomes.get(id)!;
  };
  const rejoin = (id: number, resume?: string) => {
    session.addClient(
      id,
      (frame) => {
        const decoded = decodeFrame(frame);
        if (decoded?.type === FRAME.welcome) {
          welcomes.set(id, decoded.payload as WelcomePayload);
        }
      },
      { play: true, resume },
      `P${id}`,
    );
    return welcomes.get(id)!;
  };
  const watch = (id: number) => {
    session.addClient(
      id,
      (frame) => {
        const decoded = decodeFrame(frame);
        if (decoded?.type === FRAME.welcome) {
          welcomes.set(id, decoded.payload as WelcomePayload);
        }
      },
      false,
      `W${id}`,
    );
    return welcomes.get(id)!;
  };
  return {
    session,
    join,
    rejoin,
    watch,
    advance(ms: number) {
      clock += ms;
      // The sweep runs off the session's own clock, so the window only lapses
      // for a session that is actually being advanced — which is the honest
      // behaviour: a paused host is not holding seats for hours.
      session.advance(ms);
    },
  };
}

describe("the reconnect ticket", () => {
  it("is issued to a seated player and withheld from a spectator", () => {
    const net = rig();
    net.join(1); // the host takes seat 0
    const joiner = net.join(2);
    expect(joiner.seat).toBe(1);
    expect(typeof joiner.resume).toBe("string");
    expect(joiner.resume!.length).toBeGreaterThan(0);
    // A spectator has no hero standing on the field, so there is nothing to
    // come back to and no ticket to lose.
    const watcher = net.watch(3);
    expect(watcher.seat).toBeNull();
    expect(watcher.resume).toBeUndefined();
  });

  it("is a different string every time it is issued", () => {
    // A seat's SECOND occupant must never hold a key its first one was given:
    // the ticket is what claims a seat, so a repeated one is a way into
    // somebody else's hero.
    const net = rig();
    net.join(1);
    const first = net.join(2).resume;
    net.session.removeClient(2);
    const second = net.rejoin(2, first).resume;
    expect(second).not.toBe(first);
  });
});

describe("coming back", () => {
  it("resumes the hero as it stood, not a fresh one", () => {
    const net = rig();
    net.join(1);
    const joiner = net.join(2);
    const hero = net.session.state.players[1]!;
    // Put an hour on the hero. This is the whole feature: the assertion is
    // that NONE of it is lost, and a reconnect that handed back a correctly
    // shaped level-1 hero would be exactly the bug.
    hero.level = 27;
    hero.xp = 9_001;
    hero.coins = 555;

    net.session.removeClient(2);
    expect(net.session.state.players[1]!.departed).toBe(true);
    net.advance(1_000);

    const back = net.rejoin(4, joiner.resume);
    expect(back.seat).toBe(1);
    const resumed = net.session.state.players[1]!;
    // The same OBJECT, not a rebuilt one that happens to agree.
    expect(resumed).toBe(hero);
    expect(resumed.level).toBe(27);
    expect(resumed.xp).toBe(9_001);
    expect(resumed.coins).toBe(555);
    expect(resumed.departed).toBeFalsy();
    // …and the party did not grow a body on the way through.
    expect(net.session.state.players).toHaveLength(2);
  });

  it("ignores the loadout a reconnect claims", () => {
    // The authoritative hero is the one standing on the field. Dressing a
    // resumed hero in a claim that arrived from a stranger would hand a
    // reconnect the one thing a fresh join is checked for.
    const net = rig();
    net.join(1);
    const joiner = net.join(2);
    net.session.state.players[1]!.level = 12;
    net.session.removeClient(2);
    net.session.addClient(
      4,
      () => {},
      { play: true, resume: joiner.resume, loadout: { level: 99 } },
      "P4",
    );
    expect(net.session.state.players[1]!.level).toBe(12);
  });

  it("holds the seat against a newcomer while the window is open", () => {
    // The other half of the promise: a seat being kept is not a free seat, or
    // somebody else is handed the hero on its way back.
    const net = rig();
    net.join(1);
    net.join(2);
    net.session.removeClient(2);
    net.advance(RECONNECT_GRACE_MS - 1_000);
    const newcomer = net.join(5);
    expect(newcomer.seat).toBe(2);
    expect(net.session.state.players).toHaveLength(3);
  });

  it("gives the seat up once nobody comes back", () => {
    const net = rig();
    net.join(1);
    net.join(2);
    net.session.removeClient(2);
    net.advance(RECONNECT_GRACE_MS + 1_000);
    // The body is still standing there and still means nothing to the world —
    // releasing a hold does not undo the departure — but the seat is available
    // again, so a newcomer takes it rather than growing the party.
    const newcomer = net.join(5);
    expect(newcomer.seat).toBe(1);
    expect(net.session.state.players).toHaveLength(2);
  });

  it("refuses a ticket that was already spent", () => {
    const net = rig();
    net.join(1);
    const joiner = net.join(2);
    net.session.removeClient(2);
    net.rejoin(4, joiner.resume);
    // A ticket is good for ONE return. Left in the table it would be a second
    // way into a seat that is now occupied.
    net.session.removeClient(4);
    const impostor = net.rejoin(6, joiner.resume);
    expect(impostor.seat).not.toBe(1);
  });

  it("treats a guessed ticket as an ordinary arrival, not a refusal", () => {
    // Somebody who took too long to come back should get into the game rather
    // than be told no — and the same answer covers a guess, which is why there
    // is no refusal reason for this.
    const net = rig();
    net.join(1);
    const arrival = net.rejoin(9, "definitely-not-a-real-ticket");
    expect(arrival.seat).toBe(1);
  });
});

describe("the engine's half", () => {
  /** A run with `n` heroes seated, seat 0 included. */
  function seated(n: number): GameState {
    const state = startGame(3);
    for (let i = 1; i < n; i++) seatHero(state, null);
    return state;
  }

  it("skips a held seat when handing one out", () => {
    const state = seated(3);
    departHero(state, 1, true); // dropped — might be back
    departHero(state, 2); // quit — gone for good
    expect(nextFreeSeat(state)).toBe(2);
  });

  it("hands out a held seat again once it is released", () => {
    const state = seated(2);
    departHero(state, 1, true);
    expect(nextFreeSeat(state)).toBe(2);
    releaseSeat(state, 1);
    expect(nextFreeSeat(state)).toBe(1);
  });

  it("refuses to resume a seat that is not being held", () => {
    // A hold that has lapsed is a seat that may already have been given away,
    // and reviving a hero out from under its new owner is worse than making
    // somebody start again.
    const state = seated(2);
    departHero(state, 1); // no hold
    expect(resumeHero(state, 1)).toBeNull();
    expect(state.players[1]!.departed).toBe(true);
  });

  it("refuses to resume a seat somebody is still playing", () => {
    const state = seated(2);
    expect(resumeHero(state, 1)).toBeNull();
  });

  it("leaves the party stamp alone across a departure and a return", () => {
    // §5.3's mark never clears — a run two people played stays one, however
    // the room looks now.
    const state = seated(2);
    departHero(state, 1, true);
    expect(state.party).not.toBeNull();
    resumeHero(state, 1);
    expect(state.party?.seats).toBe(2);
  });
});
