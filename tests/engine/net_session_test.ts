// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE WHOLE THING, END TO END: a real session and a real client, over a
// loopback pair, holding two states that must not disagree.
//
// This is the suite that would catch a replication bug, and it is written the
// way it is on purpose. It does not assert that a handful of chosen fields
// match; it hashes the CLIENT'S ENTIRE STATE against the server's, so a field
// the differ silently drops — the exact failure a hand-written packer produces
// when a def grows a member — fails here rather than in a run three rooms in.
//
// It also runs the simulation for real, with real input, on a real level, for
// hundreds of ticks: mobs spawn and die, ids are minted and retired, the fog
// fills in, events fire. Every strategy in the differ is exercised by the
// engine rather than by a fixture that was written to agree with it.
//
// The transport is a plain function pair. That is the point of putting the
// seam where it is: phase 2's Steam P2P and UDP transports satisfy the same three
// methods, so everything below keeps its meaning when there is a network.

import { canonicalJson } from "@ui/lib/canonical-json.ts";
import { describe, expect, it } from "vitest";

import {
  createRunFromParams,
  engineVersion,
  freezeRun,
  type FrozenRun,
  type GameInput,
  type GameState,
} from "@game/core";
import { decodeFrame } from "@game/wire/codec.ts";
import { FRAME, TICK_MS } from "@game/wire/frames.ts";
import { type SessionParams } from "@game/wire/protocol.ts";
import { PRIVATE_PLAYER_FIELDS, UNSENT_FIELDS } from "@game/wire/split.ts";

import { createNetClient, type NetClient } from "../../server/client.ts";
import { createSession, type Session } from "../../server/session.ts";

const PARAMS: SessionParams = {
  seed: 20260730,
  levelId: "moon",
  difficulty: "medium",
  loadout: null,
  respec: false,
  clearedLevels: [],
  merchantDiscovered: false,
  generatedMapSize: "random",
};

/** The client id the rig connects with. */
const CLIENT = 1;

type Rig = {
  session: Session;
  client: NetClient;
  /** Every frame the server sent, decoded. */
  sent: NonNullable<ReturnType<typeof decodeFrame>>[];
  /** Why the client was closed, if it was. */
  closed: { reason: string; detail?: string } | null;
};

/**
 * A session and a client wired to each other, delivering frames immediately.
 *
 * The ORDER matters and mirrors the real one: the client (and therefore its
 * frame listener) exists before `addClient` is called, because `addClient`
 * sends the welcome synchronously and a listener registered afterwards would
 * miss it — which is exactly the bug `onSessionPort` is documented to avoid on
 * the app side.
 */
function connect(
  options: {
    ownsPlayer?: boolean;
    hostBuild?: string;
    clientBuild?: string;
    /** Hand the session a run to ADOPT rather than build — a parked run or a
     * checkpoint restore, which no set of parameters describes. */
    adopt?: FrozenRun;
  } = {},
): Rig {
  const session = createSession({
    params: PARAMS,
    build: options.hostBuild ?? engineVersion,
    adopt: options.adopt,
  });
  const sent: NonNullable<ReturnType<typeof decodeFrame>>[] = [];
  const rig = { session, sent, closed: null } as Rig;
  let receive: ((frame: ArrayBuffer) => void) | null = null;

  rig.client = createNetClient({
    transport: {
      send(frame) {
        const decoded = decodeFrame(frame);
        if (decoded) {
          session.receive(CLIENT, decoded.type, decoded.seq, decoded.payload);
        }
      },
      onFrame(listener) {
        receive = listener;
      },
      close() {},
    },
    build: options.clientBuild ?? engineVersion,
    onClosed: (reason, detail) => {
      rig.closed = { reason, detail };
    },
  });

  session.addClient(
    CLIENT,
    (frame) => {
      const decoded = decodeFrame(frame);
      if (decoded) sent.push(decoded);
      receive?.(frame);
    },
    options.ownsPlayer ?? true,
  );
  return rig;
}

/** Run the simulation for `ticks`, feeding the client's input each frame. */
function play(rig: Rig, ticks: number, input?: GameInput): void {
  for (let i = 0; i < ticks; i++) {
    if (input) rig.client.sendInput(input);
    rig.session.advance(TICK_MS);
  }
}

/**
 * Get the run onto the field, the way the app does: by asking.
 *
 * A run opens on its prelude cutscene and its opening monologue, and `step()`
 * early-returns until the phase is `playing`. Those pages used to be turned by
 * the app calling `skipStoryOpening` straight onto a local `GameState`; now
 * they are COMMANDS, and this is the first thing that proves the channel
 * actually reaches the simulation.
 */
function takeTheField(rig: Rig): void {
  rig.client.sendCommand("skipStoryOpening");
  // The story skip lands on the level-name card; the card's dismissal is its
  // own verb, exactly as the app's tap is.
  rig.client.sendCommand("dismissIntro");
  play(rig, 6);
}

/**
 * Everything a client is supposed to hold, as one string.
 *
 * The rng closures and the app's own view rect are excluded because they are
 * deliberately never sent (`UNSENT_FIELDS`) — the client has its own from the
 * same seed. `events` is excluded because the two sides legitimately hold
 * different windows of it: the server clears the list every tick, while the
 * client holds the batch from the last publish. Events get their own
 * assertion below rather than being smuggled into this one.
 */
function worldOf(state: GameState): string {
  const record = { ...(state as unknown as Record<string, unknown>) };
  for (const field of UNSENT_FIELDS) delete record[field];
  delete record.events;
  return canonicalJson(record);
}

describe("a session and its client", () => {
  it("hands the client a state before a single tick has run", () => {
    // The welcome carries the SessionParams and the client builds the level
    // from them, so it has a whole world to draw the instant it connects —
    // nothing waits on a first snapshot.
    const rig = connect();
    expect(rig.client.state).not.toBeNull();
    expect(rig.client.state!.level.id).toBe("moon");
    expect(rig.client.state!.enemies.length).toBe(
      rig.session.state.enemies.length,
    );
  });

  it("never sends a full snapshot, because the client already built one", () => {
    // The static tier's whole claim. A full snapshot here would mean ~100 KB
    // of obstacles, decor and carve crossing a wire that had no need of them.
    const rig = connect();
    play(rig, 120);
    expect(rig.sent.length).toBeGreaterThan(10);
    expect(rig.sent.some((frame) => frame.type === FRAME.snapshot)).toBe(false);
  });

  it("runs a client command against the authoritative state", () => {
    // The command channel's whole point: an action the app used to perform on
    // its own `GameState` now travels, and the SERVER is what performs it.
    const rig = connect();
    expect(rig.session.state.phase).not.toBe("playing");
    takeTheField(rig);
    expect(rig.session.state.phase).toBe("playing");
    expect(rig.client.state!.phase).toBe("playing");
  });

  it("ignores a command name that is not on the list", () => {
    // The allow-list IS the security model: a channel that resolved a name
    // dynamically would hand a client `grantXp` and `mintUnique` the day phase 2
    // opens a UDP port.
    const rig = connect();
    const before = rig.session.state.players[0].xp;
    rig.client.sendCommand("grantXp" as never);
    play(rig, 6);
    expect(rig.session.state.players[0].xp).toBe(before);
  });

  it("carries a command's ARGUMENTS to the authoritative state", () => {
    // phase 1's verbs took no arguments; phase 1.5's mostly do — a bag cell, a slot,
    // a stat, a merchant row. What this proves is the whole round trip: the
    // argument survives the encode, the decode and the dispatch, and lands on
    // the SERVER's hero rather than on the client's copy of him.
    const rig = connect();
    takeTheField(rig);
    rig.session.state.players[0].pendingStatPoints = 2;
    const before = rig.session.state.players[0].stats.luck;
    rig.client.sendCommand("allocateStat", ["luck"]);
    play(rig, 6);
    expect(rig.session.state.players[0].stats.luck).toBe(before + 1);
    expect(rig.client.state!.players[0].stats.luck).toBe(before + 1);
  });

  it("ignores an argument of the wrong shape rather than throwing", () => {
    // These bytes come from a stranger on an open UDP port from phase 2 on. A
    // stat that is not a stat must be a refusal the host does not notice, not
    // a write with an attacker's key on it.
    const rig = connect();
    takeTheField(rig);
    rig.session.state.players[0].pendingStatPoints = 2;
    rig.client.sendCommand("allocateStat", ["__proto__" as never]);
    rig.client.sendCommand("allocateStat", [{} as never]);
    rig.client.sendCommand("allocateStat");
    play(rig, 6);
    expect(rig.session.state.players[0].pendingStatPoints).toBe(2);
  });

  it("holds the same world as the server after a run", () => {
    const rig = connect();
    takeTheField(rig);
    play(rig, 600);
    expect(rig.session.tick).toBe(606);
    expect(worldOf(rig.client.state!)).toBe(worldOf(rig.session.state));
  });

  it("stays in step while the player steers and fights", () => {
    const rig = connect();
    takeTheField(rig);
    const input: GameInput = {
      steering: true,
      target: { x: 400, y: 400 },
      jump: false,
      useItem: false,
    };
    play(rig, 900, input);
    // The hero actually went somewhere — otherwise this asserts that two
    // identical idle worlds are identical, which proves nothing.
    const start = rig.session.state.playerSpawn;
    const at = rig.session.state.players[0].pos;
    expect(Math.hypot(at.x - start.x, at.y - start.y)).toBeGreaterThan(20);
    expect(worldOf(rig.client.state!)).toBe(worldOf(rig.session.state));
    // Fifteen seconds of a real fight on a real map, stepped twice (the
    // session's and the client's), is more than the suite's default patience.
  }, 20_000);

  it("keeps the client's own object identity for the whole run", () => {
    // `render.ts`, the HUD model and every overlay were written against an
    // engine that MUTATES one state. Handing the app a new object per snapshot
    // would have been the one change multiplayer made that reached all of it.
    const rig = connect();
    const first = rig.client.state;
    takeTheField(rig);
    play(rig, 300);
    expect(rig.client.state).toBe(first);
  });

  it("advances only in whole ticks, whatever the clock says", () => {
    // The slice size IS the physics. A caller that owes two thirds of a tick
    // owes nothing yet.
    const session = createSession({ params: PARAMS, build: engineVersion });
    expect(session.advance(TICK_MS * 0.66)).toBe(0);
    expect(session.tick).toBe(0);
    expect(session.advance(TICK_MS * 3.5)).toBe(3);
    expect(session.tick).toBe(3);
  });

  it("refuses to pay an unbounded backlog in one call", () => {
    // The spiral-of-death backstop the browser loop already has: a host whose
    // machine hitched must not try to simulate a minute inside one callback.
    const session = createSession({ params: PARAMS, build: engineVersion });
    expect(session.advance(60_000)).toBe(240);
  });

  it("delivers every tick's events, not one tick in three", () => {
    // `step()` clears `state.events` every tick and a snapshot goes out every
    // third one, so publishing the live list would drop two ticks of sound,
    // gore, haptics and achievement bookkeeping out of every three — silently,
    // and only for the players who are not the host.
    //
    // Asserted as an EQUALITY of the two streams rather than as "the client saw
    // some events": a session that dropped two thirds of them would still pass
    // the weaker check every time.
    const rig = connect();
    takeTheField(rig);
    // Steered at the nearest KNOT rather than at a corner: the carve gives the
    // hero a quiet landing to read the map from, so a walk in an arbitrary
    // direction is fifteen seconds of nothing happening — and this test is only
    // worth anything while things are happening.
    const at = rig.session.state.players[0].pos;
    const knot = [...rig.session.state.spawners].sort(
      (a, b) =>
        Math.hypot(a.at.x - at.x, a.at.y - at.y) -
        Math.hypot(b.at.x - at.x, b.at.y - at.y),
    )[0];
    const input: GameInput = {
      steering: true,
      target: knot ? { ...knot.at } : { x: 400, y: 400 },
      jump: false,
      useItem: false,
    };
    const fromServer: unknown[] = [];
    const fromClient: unknown[] = [];
    let seenTick = rig.client.tick;
    // A whole number of publish periods, so the two streams end together
    // rather than the server holding a partial batch the client cannot have.
    for (let i = 0; i < 450; i++) {
      rig.client.sendInput(input);
      // A pinned first-sight thought stops the world the moment a wisp drifts
      // into view, and a frozen run emits nothing at all — so the walk taps
      // through whatever it meets, which is what a player would be doing.
      if (rig.session.state.dialogue) rig.client.sendCommand("advanceDialogue");
      rig.session.advance(TICK_MS);
      fromServer.push(...rig.session.state.events);
      if (rig.client.tick !== seenTick) {
        seenTick = rig.client.tick;
        fromClient.push(...rig.client.state!.events);
      }
    }
    // Not vacuous: seven seconds of walking into the nearest knot on the moon
    // produces a stream, and the equality below is only meaningful if it does.
    expect(fromServer.length).toBeGreaterThan(5);
    expect(canonicalJson(fromClient)).toBe(canonicalJson(fromServer));
    // Seven seconds of a real fight on a real map, stepped twice (the session's
    // and the client's), is more than the suite's default patience.
  }, 20_000);

  it("tells the client when the session ends, and why", () => {
    const rig = connect();
    play(rig, 30);
    rig.session.close("host-left");
    expect(rig.closed).toEqual({ reason: "host-left", detail: undefined });
  });
});

describe("a session that ADOPTED its run", () => {
  /**
   * A run that has already been played for a while — which is the whole point:
   * a parked run and a checkpoint restore are worlds no parameters describe,
   * so what is being tested is that a client which CANNOT rebuild the world is
   * given it instead.
   */
  function playedRun(): FrozenRun {
    const state = createRunFromParams({ ...PARAMS, openingSkip: "story" });
    state.players[0].pos.x += 137;
    state.players[0].hp = 42;
    state.players[0].coins = 999;
    return freezeRun(state);
  }

  it("simulates the state it was handed, not one built from the params", () => {
    const rig = connect({ adopt: playedRun() });
    expect(rig.session.state.players[0].hp).toBe(42);
    expect(rig.session.state.players[0].coins).toBe(999);
    // …and it is a LIVE state rather than a frozen record: the rng closures
    // were rebuilt from their stream positions, so it can actually be stepped.
    expect(() => play(rig, 30)).not.toThrow();
  });

  it("sends its client a FULL snapshot rather than a delta", () => {
    // The one branch `Sent.full` exists for, and which nothing had ever taken.
    const rig = connect({ adopt: playedRun() });
    play(rig, 6);
    const first = rig.sent.find(
      (frame) => frame.type === FRAME.snapshot || frame.type === FRAME.delta,
    );
    expect(first?.type).toBe(FRAME.snapshot);
  });

  it("leaves the client holding the same world after a run", () => {
    // The assertion that matters: a client whose own `createRunFromParams`
    // built a DIFFERENT world still converges, because it was sent all of it.
    const rig = connect({ adopt: playedRun() });
    play(rig, 300);
    expect(worldOf(rig.client.state!)).toBe(worldOf(rig.session.state));
  });

  it("goes back to deltas once the world has been handed over", () => {
    // The full snapshot is a ONE-OFF. A session that kept sending whole worlds
    // at 20 Hz would work perfectly and cost ~100 KB a frame, which is the
    // kind of bug that only ever shows up as somebody's bandwidth bill.
    const rig = connect({ adopt: playedRun() });
    play(rig, 60);
    const fulls = rig.sent.filter((frame) => frame.type === FRAME.snapshot);
    expect(fulls).toHaveLength(1);
  });

  it("refuses a run that belongs to a different level", () => {
    // Nothing could ever correct this: the terrain is the STATIC tier and is
    // never sent, so a client would carve one map and walk around inside
    // another for the whole run.
    const elsewhere = freezeRun(
      createRunFromParams({ ...PARAMS, levelId: "mars" }),
    );
    expect(() => connect({ adopt: elsewhere })).toThrow(/mars/);
  });
});

describe("the private split", () => {
  it("withholds the bag from a client that does not own the hero", () => {
    // The anti-cheat boundary, and the reason phase 5's trade window can be
    // honest: a client that never RECEIVES another player's bag cannot
    // manipulate it. A spectator is the first thing that tests it.
    const rig = connect({ ownsPlayer: false });
    play(rig, 300);
    const player = rig.client.state!.players[0] as unknown as Record<
      string,
      unknown
    >;
    for (const field of PRIVATE_PLAYER_FIELDS) {
      expect(player[field], field).toBeUndefined();
    }
    // What a spectator CAN see is what they could see by looking: where he is,
    // how hurt he is, and what he is wearing.
    expect(rig.client.state!.players[0].pos).toEqual(
      rig.session.state.players[0].pos,
    );
    expect(rig.client.state!.players[0].hp).toBe(
      rig.session.state.players[0].hp,
    );
    expect(rig.client.state!.players[0].equipment.weapon).toEqual(
      rig.session.state.players[0].equipment.weapon,
    );
  });

  it("gives the owner their own bag", () => {
    const rig = connect({ ownsPlayer: true });
    takeTheField(rig);
    play(rig, 120);
    expect(rig.client.state!.players[0].inventory).toEqual(
      rig.session.state.players[0].inventory,
    );
    expect(rig.client.state!.players[0].coins).toBe(
      rig.session.state.players[0].coins,
    );
  });

  it("ignores input from a client that does not own the hero", () => {
    // A spectator steering somebody else's character is the cheapest possible
    // griefing, and the check belongs on the SERVER — the only place a client
    // cannot argue with it.
    const rig = connect({ ownsPlayer: false });
    play(rig, 300, {
      steering: true,
      target: { x: 900, y: 900 },
      jump: true,
      useItem: false,
    });
    const start = rig.session.state.playerSpawn;
    const at = rig.session.state.players[0].pos;
    expect(Math.hypot(at.x - start.x, at.y - start.y)).toBeLessThan(1);
  });
});

describe("the handshake", () => {
  it("refuses a client on a different build, naming both sides", () => {
    // Version skew is the failure mode that reaches a player as "random
    // crashes". A refusal that names both numbers is one they can act on.
    const rig = connect({ hostBuild: "9.9.9" });
    expect(rig.closed?.reason).toBe("build-mismatch");
    expect(rig.closed?.detail).toContain(engineVersion);
    expect(rig.closed?.detail).toContain("9.9.9");
  });

  it("builds no world at all for a refused client", () => {
    // A refused joiner must not be left holding half a session.
    const rig = connect({ hostBuild: "9.9.9" });
    expect(rig.client.state).toBeNull();
  });
});
