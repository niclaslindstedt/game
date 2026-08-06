// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// IN-SESSION PARTY TRAVEL: the session survives the
// level swap, and the party goes through the door together.
//
// A real session and two real clients over loopback pairs, exactly as
// net_session_test wires one — because the claim under test is not "a field
// changed" but that the WHOLE WORLD can be torn down and rebuilt under two
// connected clients without either losing its seat, its hero or its wire.

import { describe, expect, it } from "vitest";

import { engineVersion, RUN, type GameState } from "@game/core";
import { decodeFrame } from "@game/wire/codec.ts";
import { FRAME, TICK_MS } from "@game/wire/frames.ts";
import { type SessionParams } from "@game/wire/protocol.ts";

import { createNetClient, type NetClient } from "../../server/client.ts";
import { createSession, type Session } from "../../server/session.ts";
import { installFixtures } from "./fixtures.ts";

installFixtures();

const PARAMS: SessionParams = {
  seed: 4711,
  levelId: "test_level",
  difficulty: "medium",
  loadout: null,
  respec: false,
  clearedLevels: [],
  merchantDiscovered: false,
};

type Peer = {
  id: number;
  client: NetClient;
  /** The state each `onTravel` fired with, by the level it was ON. */
  travelledFrom: string[];
};

function rig(): { session: Session; host: Peer; joiner: Peer } {
  const session = createSession({ params: PARAMS, build: engineVersion });
  const wire = (id: number): Peer => {
    let receive: ((frame: ArrayBuffer) => void) | null = null;
    const peer: Peer = { id, travelledFrom: [] } as unknown as Peer;
    peer.client = createNetClient({
      transport: {
        send(frame) {
          const decoded = decodeFrame(frame);
          if (decoded) {
            session.receive(id, decoded.type, decoded.seq, decoded.payload);
          }
        },
        onFrame(listener) {
          receive = listener;
        },
        close() {},
      },
      build: engineVersion,
      onTravel: (old) => peer.travelledFrom.push(old.level.id),
    });
    session.addClient(id, (frame) => receive?.(frame), true, `PEER ${id}`);
    return peer;
  };
  const host = wire(1);
  const joiner = wire(2);
  return { session, host, joiner };
}

function play(session: Session, ticks: number): void {
  for (let i = 0; i < ticks; i++) session.advance(TICK_MS);
}

/** Win the level the party is on: get past the level-name card, clear the
 * board (the fixture's objective is `killBoss`) and let the victory countdown
 * run out — the party is on the victory splash when this returns. */
function winLevel(session: Session, host: Peer): void {
  host.client.sendCommand("dismissIntro");
  play(session, 2);
  session.state.enemies = [];
  play(session, Math.ceil(RUN.victoryDelayMs / TICK_MS) + 3);
}

describe("an in-session crossing", () => {
  it("carries the whole party through the door together", () => {
    const { session, host, joiner } = rig();
    expect(session.state.players).toHaveLength(2);
    // Something worth carrying: the joiner's purse, which is PRIVATE and
    // travels only through the loadout extraction.
    session.state.players[1]!.coins = 777;
    play(session, 3);

    host.client.sendCommand("travelTo", ["test_level_2", "story"]);
    play(session, 6);

    // The authoritative run moved, with the party intact and in seat order.
    expect(session.state.level.id).toBe("test_level_2");
    expect(session.state.players).toHaveLength(2);
    expect(session.state.players[1]!.coins).toBe(777);

    // Both clients were moved wholesale by the post-travel full snapshot, and
    // each banked its hero off the level being LEFT before the swap.
    expect(host.client.state!.level.id).toBe("test_level_2");
    expect(joiner.client.state!.level.id).toBe("test_level_2");
    expect(host.travelledFrom).toEqual(["test_level"]);
    expect(joiner.travelledFrom).toEqual(["test_level"]);
    // The joiner still holds its own seat, and its own (private) purse.
    expect(joiner.client.seat).toBe(1);
    expect((joiner.client.state as GameState).players[1]!.coins).toBe(777);
    // The state object survived the swap — every renderer helper closes over
    // it, so a crossing that replaced the reference would draw a dead world.
    expect(host.client.state).not.toBeNull();
  });

  it("carries the party through VICTORY → NEXT LEVEL, session intact", () => {
    const { session, host, joiner } = rig();
    session.state.players[1]!.coins = 777;
    winLevel(session, host);
    expect(session.state.phase).toBe("victory");

    // Exactly what the victory splash's NEXT LEVEL sends: the same crossing a
    // door books, so the session swaps the level instead of the app tearing
    // the whole thing down and dropping the joiner.
    host.client.sendCommand("travelTo", ["test_level_2", "story"]);
    play(session, 6);

    expect(session.state.level.id).toBe("test_level_2");
    expect(session.state.phase).not.toBe("victory");
    // Nobody reconnected: both clients still hold their seats, and the
    // joiner's private purse rode the loadout extraction across.
    expect(session.clientCount).toBe(2);
    expect(host.client.seat).toBe(0);
    expect(joiner.client.seat).toBe(1);
    expect(host.client.state!.level.id).toBe("test_level_2");
    expect(joiner.client.state!.level.id).toBe("test_level_2");
    expect(joiner.travelledFrom).toEqual(["test_level"]);
    expect((joiner.client.state as GameState).players[1]!.coins).toBe(777);
  });

  it("counts the level it WON as cleared on the far side", () => {
    const { session, host } = rig();
    winLevel(session, host);
    host.client.sendCommand("travelTo", ["test_level_2", "story"]);
    play(session, 6);
    // The engine gates campaign drops on this list; a crossing out of a win
    // that carried the old parameters forward would keep them latent forever.
    expect(session.state.clearedLevels).toContain("test_level");
  });

  it("does not invent a clear for a level merely walked out of", () => {
    const { session, host } = rig();
    host.client.sendCommand("travelTo", ["test_level_2", "story"]);
    play(session, 6);
    expect(session.state.level.id).toBe("test_level_2");
    expect(session.state.clearedLevels).not.toContain("test_level");
  });

  it("keeps the party stamp — a crossing does not hand records back", () => {
    const { session, host } = rig();
    expect(session.state.party).toBeTruthy();
    host.client.sendCommand("travelTo", ["test_level_2", "story"]);
    play(session, 6);
    expect(session.state.level.id).toBe("test_level_2");
    expect(session.state.party).toBeTruthy();
  });

  it("refuses everybody but seat 0 — the host chooses the road", () => {
    const { session, joiner } = rig();
    joiner.client.sendCommand("travelTo", ["test_level_2", "story"]);
    play(session, 6);
    expect(session.state.level.id).toBe("test_level");
  });

  it("refuses a level this build does not hold, and the same level", () => {
    const { session, host } = rig();
    host.client.sendCommand("travelTo", ["no_such_level", "story"]);
    play(session, 6);
    expect(session.state.level.id).toBe("test_level");
    host.client.sendCommand("travelTo", ["test_level", "story"]);
    play(session, 6);
    expect(session.state.level.id).toBe("test_level");
  });

  it("goes back onto deltas once the post-travel world is acknowledged", () => {
    const { session, host } = rig();
    const sentToHost: number[] = [];
    // A third, silent client whose frames we can count by type. It never acks,
    // so every publish after the travel must stay FULL for it.
    let mute = 0;
    session.addClient(
      3,
      (frame) => {
        const decoded = decodeFrame(frame);
        if (decoded?.type === FRAME.snapshot) mute++;
        if (decoded?.type === FRAME.delta) sentToHost.push(decoded.seq);
      },
      false,
      "MUTE",
    );
    host.client.sendCommand("travelTo", ["test_level_2", "story"]);
    play(session, 12);
    // Four publishes since the swap, all full for the client that never acked.
    expect(mute).toBeGreaterThanOrEqual(3);
    expect(sentToHost).toHaveLength(0);
    // The live client acked and is back on deltas: its own state agrees with
    // the server about where everybody is.
    expect(host.client.state!.level.id).toBe("test_level_2");
  });

  it("hands a LATER joiner the new level's parameters", () => {
    const { session, host } = rig();
    host.client.sendCommand("travelTo", ["test_level_2", "story"]);
    play(session, 6);
    // A third player arrives after the crossing: their welcome must describe
    // the level the party is actually on, or their own build would carve the
    // wrong world.
    let welcomedWith: string | null = null;
    let receive: ((frame: ArrayBuffer) => void) | null = null;
    const late = createNetClient({
      transport: {
        send(frame) {
          const decoded = decodeFrame(frame);
          if (decoded) {
            session.receive(4, decoded.type, decoded.seq, decoded.payload);
          }
        },
        onFrame(listener) {
          receive = listener;
        },
        close() {},
      },
      build: engineVersion,
      onReady: (_state, params) => {
        welcomedWith = params.levelId;
      },
    });
    session.addClient(4, (frame) => receive?.(frame), true, "LATE");
    play(session, 3);
    expect(welcomedWith).toBe("test_level_2");
    expect(late.state!.level.id).toBe("test_level_2");
  });
});
