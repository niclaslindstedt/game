// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// TWO LEVELS IN ONE SESSION — the town portal's engine half (issue #952).
//
// A real session and real clients over loopback pairs, exactly as
// net_travel_test wires one, because the claim under test is not "a field
// changed" but that ONE PROCESS can hold two carves at once with the party
// split between them: each seat steering the world it is actually standing in,
// each client receiving only that world, and a seat number meaning the same
// player in both.

import { describe, expect, it } from "vitest";

import { engineVersion, type GameState } from "@game/core";
import { decodeFrame } from "@game/wire/codec.ts";
import { FRAME, TICK_MS } from "@game/wire/frames.ts";
import { type RosterEntry, type SessionParams } from "@game/wire/protocol.ts";

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
  /** The level each `onTravel` fired on — a world change, from the client's
   * own point of view. */
  travelledFrom: string[];
  roster: RosterEntry[];
};

function rig(): { session: Session; host: Peer; joiner: Peer } {
  const session = createSession({ params: PARAMS, build: engineVersion });
  const wire = (id: number): Peer => {
    let receive: ((frame: ArrayBuffer) => void) | null = null;
    const peer: Peer = { id, travelledFrom: [], roster: [] } as unknown as Peer;
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
      onRoster: (entries) => {
        peer.roster = entries;
      },
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

/** The world the session is holding on `levelId`, as the session reports it. */
function worldOn(session: Session, levelId: string) {
  return session.worlds.find((world) => world.levelId === levelId);
}

describe("a solo crossing", () => {
  it("takes one hero off the field and leaves the party on it", () => {
    const { session, joiner } = rig();
    play(session, 3);

    joiner.client.sendCommand("travelSolo", ["test_level_2", "story"]);
    play(session, 6);

    // The session still holds the field the host is fighting on — and a second
    // world beside it.
    expect(session.state.level.id).toBe("test_level");
    expect(session.worlds).toHaveLength(2);
    expect(worldOn(session, "test_level")?.seats).toEqual([0]);
    expect(worldOn(session, "test_level_2")?.seats).toEqual([1]);
    expect(worldOn(session, "test_level")?.primary).toBe(true);

    // A seat number means the same player in both: seat 1's body on the field
    // is departed (present in the list, answered for by nobody) while seat 1 in
    // the garage is the hero actually being played.
    expect(session.state.players[1]!.departed).toBe(true);
    expect(session.state.players[0]!.departed).toBeFalsy();
    const away = worldOn(session, "test_level_2")!;
    expect(session.worlds.find((w) => w.levelId === away.levelId)!.live).toBe(
      true,
    );
  });

  it("moves only the traveller's client onto the other world", () => {
    const { session, host, joiner } = rig();
    joiner.client.sendCommand("travelSolo", ["test_level_2", "story"]);
    play(session, 9);

    expect(joiner.client.state!.level.id).toBe("test_level_2");
    expect(joiner.travelledFrom).toEqual(["test_level"]);
    // The host was never told anything moved, because from where he is
    // standing nothing did.
    expect(host.client.state!.level.id).toBe("test_level");
    expect(host.travelledFrom).toEqual([]);
    // And both still hold their own seat.
    expect(host.client.seat).toBe(0);
    expect(joiner.client.seat).toBe(1);
  });

  it("carries the hero's purse and the WOUND he left with", () => {
    const { session, joiner } = rig();
    session.state.players[1]!.coins = 777;
    session.state.players[1]!.hp = 3;
    play(session, 3);

    joiner.client.sendCommand("travelSolo", ["test_level_2", "story"]);
    play(session, 6);

    const away = session.state; // still the field
    expect(away.level.id).toBe("test_level");
    // A town portal is not a level transition: coming home wounded and back
    // healed would make the tear a free full heal on a walk's cooldown.
    const hero = (joiner.client.state as GameState).players[1]!;
    expect(hero.coins).toBe(777);
    expect(hero.hp).toBeLessThanOrEqual(3);
    expect(hero.hp).toBeGreaterThan(0);
  });

  it("refuses the level the hero is already standing on", () => {
    const { session, joiner } = rig();
    joiner.client.sendCommand("travelSolo", ["test_level", "story"]);
    play(session, 6);
    expect(session.worlds).toHaveLength(1);
  });

  it("refuses a level this build does not hold", () => {
    const { session, joiner } = rig();
    joiner.client.sendCommand("travelSolo", ["no_such_level", "story"]);
    play(session, 6);
    expect(session.worlds).toHaveLength(1);
  });
});

describe("stepping back through", () => {
  it("lands on the FIELD that was left, not a fresh carve of it", () => {
    const { session, joiner } = rig();
    play(session, 3);
    joiner.client.sendCommand("travelSolo", ["test_level_2", "story"]);
    play(session, 6);
    // Something only THIS carve has: the field is emptied while the shopper is
    // away, and a fresh carve of the same venue would be full of mobs again.
    session.state.enemies = [];
    const marker = session.state.nextId;

    joiner.client.sendCommand("travelSolo", ["test_level", "story"]);
    play(session, 9);

    expect(session.worlds).toHaveLength(1);
    expect(session.state.level.id).toBe("test_level");
    // The same world object: the id counter kept climbing rather than being
    // reset by a rebuild, and the board we cleared is still clear.
    expect(session.state.nextId).toBeGreaterThanOrEqual(marker);
    expect(session.state.enemies).toHaveLength(0);
    // Seat 1 is seat 1 again, and is being answered for.
    expect(session.state.players[1]!.departed).toBeFalsy();
    expect(joiner.client.seat).toBe(1);
    expect(joiner.client.state!.level.id).toBe("test_level");
  });

  it("keeps what the hero earned while he was away", () => {
    const { session, joiner } = rig();
    joiner.client.sendCommand("travelSolo", ["test_level_2", "story"]);
    play(session, 6);
    // Spend the trip: the hero comes into money in the garage. Reviving the
    // body still lying on the field would roll every coin of it back — the
    // exact bug a town portal exists to not have.
    worldOn(session, "test_level_2")!.state.players[1]!.coins = 4242;
    play(session, 3);

    joiner.client.sendCommand("travelSolo", ["test_level", "story"]);
    play(session, 12);

    expect(session.state.players[1]!.departed).toBeFalsy();
    expect(session.state.players[1]!.coins).toBe(4242);
  });

  it("hands the returning player the WHOLE field, not a delta into it", () => {
    const { session, host, joiner } = rig();
    host.client.sendCommand("dismissIntro");
    play(session, 3);
    joiner.client.sendCommand("travelSolo", ["test_level_2", "story"]);
    play(session, 6);

    // FIVE MINUTES OF SOMEBODY ELSE'S FIGHT, in miniature: the party moves,
    // mobs die, loot lands on the floor and the fog opens up — all of it while
    // the shopper holds no baseline for this carve at all.
    const field = session.state;
    field.players[0]!.pos = { x: field.level.width / 2, y: 60 };
    field.enemies = field.enemies.slice(0, 2);
    const dropped = field.items.length;
    for (let i = 0; i < field.explored.length; i += 3) field.explored[i] = 1;
    play(session, 9);

    joiner.client.sendCommand("travelSolo", ["test_level", "story"]);
    play(session, 12);

    const seen = joiner.client.state as GameState;
    expect(seen.level.id).toBe("test_level");
    // Every mob where it NOW stands, every item on the floor, and the teammate
    // he has not been able to see for a minute — none of which a delta against
    // his stale baseline for this world could ever have named.
    expect(seen.enemies).toHaveLength(field.enemies.length);
    expect(seen.items.length).toBe(field.items.length);
    expect(seen.items.length).toBeGreaterThanOrEqual(dropped);
    expect(seen.players[0]!.pos.y).toBeCloseTo(field.players[0]!.pos.y, 0);
    // And the fog as the PARTY explored it, as a real byte grid rather than
    // the index-keyed object a JSON round trip leaves behind.
    expect(seen.explored).toBeInstanceOf(Uint8Array);
    expect(seen.explored.length).toBe(field.explored.length);
    let lit = 0;
    for (const cell of seen.explored) if (cell) lit++;
    expect(lit).toBeGreaterThan(0);
  });

  it("lets the carve go once the last seat has left it", () => {
    const { session, joiner } = rig();
    joiner.client.sendCommand("travelSolo", ["test_level_2", "story"]);
    play(session, 6);
    expect(session.worlds).toHaveLength(2);
    joiner.client.sendCommand("travelSolo", ["test_level", "story"]);
    play(session, 6);
    expect(session.worlds).toHaveLength(1);
  });
});

describe("with the party split", () => {
  it("steers each seat in the world it is actually standing in", () => {
    const { session, host, joiner } = rig();
    host.client.sendCommand("dismissIntro");
    joiner.client.sendCommand("travelSolo", ["test_level_2", "story"]);
    play(session, 6);

    const fieldStart = { ...session.state.players[0]!.pos };
    // Both send input on the same ticks. The shopper's steering must reach the
    // garage's hero and NOT drag his own departed body around the field.
    const awayStart = { ...(joiner.client.state as GameState).players[1]!.pos };
    for (let i = 0; i < 30; i++) {
      host.client.sendInput({
        steering: true,
        target: { x: fieldStart.x + 400, y: fieldStart.y },
        jump: false,
        useItem: false,
      });
      joiner.client.sendInput({
        steering: true,
        target: { x: awayStart.x + 400, y: awayStart.y },
        jump: false,
        useItem: false,
      });
      session.advance(TICK_MS);
    }
    // The field's seat-1 body never moved: it is not being steered by anybody.
    const parked = session.state.players[1]!;
    expect(parked.departed).toBe(true);
    expect(Math.abs(parked.pos.x - fieldStart.x)).toBeLessThan(400);
  });

  it("gives each client only its OWN world's events", () => {
    const { session, joiner } = rig();
    joiner.client.sendCommand("travelSolo", ["test_level_2", "story"]);
    play(session, 9);
    // A fight two universes away must not reach the shopper: no positions, no
    // projectiles, and none of the gore, sound and haptic events for it.
    const away = joiner.client.state as GameState;
    expect(away.level.id).toBe("test_level_2");
    for (const enemy of away.enemies) {
      expect(enemy.pos.x).toBeLessThanOrEqual(away.level.width);
    }
    // The shopper's own world is what he holds — his enemy list is the
    // garage's, not the field's.
    expect(away.enemies.length).not.toBe(session.state.enemies.length + 1);
  });

  it("tells the roster which level every seat is on", () => {
    const { session, host, joiner } = rig();
    joiner.client.sendCommand("travelSolo", ["test_level_2", "story"]);
    play(session, 9);
    const entries = session.roster();
    expect(entries.find((e) => e.seat === 0)?.level).toBe("test_level");
    expect(entries.find((e) => e.seat === 1)?.level).toBe("test_level_2");
    // And it reached the clients, which is how a party frame tells "in the
    // garage" apart from "gone".
    expect(host.roster.find((e) => e.seat === 1)?.level).toBe("test_level_2");
  });

  it("leaves the shopper behind when the host takes the party through", () => {
    const { session, host, joiner } = rig();
    joiner.client.sendCommand("travelSolo", ["test_level_2", "story"]);
    play(session, 6);
    expect(session.worlds).toHaveLength(2);

    // The host crosses the party out of the field. The shopper is not one of
    // the people he is playing with until he comes back.
    host.client.sendCommand("travelTo", ["test_hub_level", "story"]);
    play(session, 9);

    expect(session.state.level.id).toBe("test_hub_level");
    expect(worldOn(session, "test_level_2")?.seats).toEqual([1]);
    expect(worldOn(session, "test_hub_level")?.seats).toEqual([0]);
    // The field nobody is on is gone rather than parked for ever.
    expect(worldOn(session, "test_level")).toBeUndefined();
    expect(session.worlds).toHaveLength(2);
    expect(joiner.client.state!.level.id).toBe("test_level_2");
  });

  it("welcomes a later joiner onto the level the PARTY is on", () => {
    const { session, joiner } = rig();
    joiner.client.sendCommand("travelSolo", ["test_level_2", "story"]);
    play(session, 6);

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

    // Their friends, never whichever level somebody happens to be shopping on.
    expect(welcomedWith).toBe("test_level");
    expect(late.state!.level.id).toBe("test_level");
    expect(late.seat).toBe(2);
    // And the chair exists in the OTHER world too, ready for the day they step
    // through a portal of their own.
    expect(session.state.players).toHaveLength(3);
  });

  it("stops the clock on a world nobody is standing in", () => {
    const { session, host, joiner } = rig();
    joiner.client.sendCommand("travelSolo", ["test_level_2", "story"]);
    play(session, 6);
    host.client.sendCommand("travelTo", ["test_level_2", "story"]);
    play(session, 9);
    // Everybody ended up in the same place, so there is one world again.
    expect(session.worlds).toHaveLength(1);
    expect(session.state.level.id).toBe("test_level_2");
    expect(session.worlds[0]!.seats).toEqual([0, 1]);
    expect(session.worlds[0]!.live).toBe(true);
  });
});

describe("a dropped shopper", () => {
  it("comes back to the counter, not to a fight he was not in", () => {
    const { session, joiner } = rig();
    joiner.client.sendCommand("travelSolo", ["test_level_2", "story"]);
    play(session, 6);
    expect(worldOn(session, "test_level_2")?.seats).toEqual([1]);

    session.removeClient(joiner.id);
    play(session, 3);
    // The body is departed in the world it was standing in — the garage — and
    // the field has held a placeholder for it since it stepped through.
    expect(worldOn(session, "test_level_2")?.seats).toEqual([1]);
    expect(session.state.players[1]!.departed).toBe(true);
    // The carve is still there for them, and still ticking: a seat is assigned
    // to it until the hold lapses.
    expect(worldOn(session, "test_level_2")?.live).toBe(true);
  });
});

describe("the snapshot frames", () => {
  it("re-baselines only the client that crossed", () => {
    const { session, host, joiner } = rig();
    play(session, 6);
    let hostFulls = 0;
    let hostDeltas = 0;
    // Count what the HOST is sent from here on: he did not move, so nothing
    // owes him a full snapshot.
    const counting = createSession({ params: PARAMS, build: engineVersion });
    expect(counting.worlds).toHaveLength(1);
    session.addClient(
      5,
      (frame) => {
        const decoded = decodeFrame(frame);
        if (decoded?.type === FRAME.snapshot) hostFulls++;
        if (decoded?.type === FRAME.delta) hostDeltas++;
      },
      false,
      "WATCH",
    );
    play(session, 6);
    const before = hostFulls;
    joiner.client.sendCommand("travelSolo", ["test_level_2", "story"]);
    play(session, 12);
    // The spectator watches the primary world, which did not move — so it was
    // never re-baselined by somebody else's crossing.
    expect(hostFulls).toBe(before);
    expect(hostDeltas).toBeGreaterThan(0);
    expect(host.client.state!.level.id).toBe("test_level");
  });
});
