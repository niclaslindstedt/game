// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE JOINER'S SIDE OF THE DOOR — `server/net/connect.ts`, driven against the
// REAL hub over a pair of in-memory transports.
//
// **THE TWO HALVES ARE TESTED TOGETHER ON PURPOSE.** A connector checked
// against a stub of the admission rules would pass while speaking a dialect the
// host refuses, which is exactly the failure this feature cannot afford: the
// handshake's whole job is to turn version skew into a legible message rather
// than into "random crashes", and a test that mocked the other side would prove
// only that the mock agreed with itself. So the hub here is the one the session
// runs, cookies and all.

import { describe, expect, it } from "vitest";

import { createJoinLink } from "../../server/net/connect.ts";
import { createPeerHub, type HubSession } from "../../server/net/hub.ts";
import type {
  Packet,
  PeerKey,
  Transport,
  TransportEvents,
} from "../../server/net/transport.ts";
import { decodeFrame, encodeFrame } from "@game/wire/codec.ts";
import {
  FRAME,
  HELLO_MIN_BYTES,
  type ByePayload,
  type Handshake,
  type WelcomePayload,
} from "@game/wire/protocol.ts";

const HOST_KEY = "203.0.113.7:27015";
const CLIENT_KEY = "198.51.100.4:51000";
const SECRET = 0xbadf00d;
const HOST: Handshake = { protocol: 7, build: "1.2.3", mods: [] };

/** A clock the test moves by hand: the connector's retries and deadlines are
 * measured in seconds, and nobody should wait for them. */
function clock() {
  let now = 1_000;
  return {
    now: () => now,
    advance(ms: number) {
      now += ms;
    },
  };
}

/**
 * Two transports wired to each other.
 *
 * `deliver` is explicit rather than automatic so a test can DROP a packet — the
 * probe going missing is the ordinary case the retry exists for, and a harness
 * that could not lose one would never exercise it.
 */
function wire() {
  const inflight: { from: "host" | "client"; packet: Packet }[] = [];
  let hostEvents: TransportEvents | null = null;
  let clientEvents: TransportEvents | null = null;
  const hostTransport: Transport = {
    id: "udp",
    bound: { address: "0.0.0.0", port: 27015 },
    listen: (handlers) => {
      hostEvents = handlers;
      return Promise.resolve(hostTransport.bound);
    },
    send: (to: PeerKey, data) =>
      inflight.push({ from: "host", packet: { from: HOST_KEY, data } }) &&
      void to,
    ping: () => 12,
    drop: () => {},
    tick: () => {},
    close: () => {},
  };
  const clientTransport: Transport = {
    id: "udp",
    bound: null,
    listen: (handlers) => {
      clientEvents = handlers;
      return Promise.resolve(null);
    },
    send: (to: PeerKey, data) =>
      inflight.push({ from: "client", packet: { from: CLIENT_KEY, data } }) &&
      void to,
    ping: () => 12,
    drop: () => {},
    tick: () => {},
    close: () => {},
  };
  return {
    hostTransport,
    clientTransport,
    /** Move everything in flight, in order. */
    flush() {
      const carried = inflight.splice(0, inflight.length);
      for (const entry of carried) {
        if (entry.from === "client") hostEvents?.onPacket(entry.packet);
        else clientEvents?.onPacket(entry.packet);
      }
    },
    /** Throw away what is in flight — a lossy link. */
    lose() {
      inflight.length = 0;
    },
    pending: () => inflight.length,
    /** What the client sent, decoded. */
    fromClient: () =>
      inflight
        .filter((entry) => entry.from === "client")
        .map((entry) => decodeFrame(entry.packet.data)),
  };
}

function stubSession() {
  const seated: { id: number; name?: string }[] = [];
  const session: HubSession = {
    addClient: (id, send, _owns, name) => {
      seated.push({ id, name });
      // The real session's first act: a welcome. The connector's admission
      // hangs off exactly this frame arriving.
      const welcome: WelcomePayload = {
        handshake: HOST,
        params: {
          seed: 1,
          levelId: "moon",
          difficulty: "medium",
          loadout: null,
          respec: false,
          clearedLevels: [],
          merchantDiscovered: false,
          generatedMapSize: "medium",
        },
        slot: 1,
        seat: null,
      };
      send(
        encodeFrame({ type: FRAME.welcome, seq: 1, ack: 0, tick: 0 }, welcome),
      );
    },
    removeClient: () => {},
    receive: () => {},
    get clientCount() {
      return seated.length;
    },
  };
  return { session, seated };
}

/** A hub and a connector talking to each other over `wire()`. */
async function pair(opts: { password?: string; joiner?: Handshake } = {}) {
  const time = clock();
  const link = wire();
  const { session, seated } = stubSession();
  const hub = createPeerHub({
    // Loopback UDP, with no Steam anywhere near it — the licence escape
    // (decision 15) is exactly what this suite is for.
    allowUnlicensedTransport: true,
    session,
    handshake: HOST,
    password: opts.password,
    secret: SECRET,
    now: time.now,
  });
  await hub.add(link.hostTransport);
  const closed: { reason: string; detail?: string }[] = [];
  const delivered: number[] = [];
  let admitted = false;
  const joiner = createJoinLink({
    transport: link.clientTransport,
    host: HOST_KEY,
    handshake: opts.joiner ?? HOST,
    name: "NIGHTHAWK",
    password: opts.password,
    now: time.now,
    deliver: (frame) => {
      const decoded = decodeFrame(frame);
      if (decoded) delivered.push(decoded.type);
    },
    onAdmitted: () => {
      admitted = true;
    },
    onClosed: (reason, detail) => closed.push({ reason, detail }),
  });
  await joiner.start();
  return {
    time,
    link,
    joiner,
    seated,
    closed,
    delivered,
    isAdmitted: () => admitted,
  };
}

describe("joining a session", () => {
  it("probes, answers the challenge, and is welcomed", async () => {
    const world = await pair();
    // The probe is out already — `start` sends it, so a join costs one round
    // trip rather than waiting for the first tick.
    const [hello] = world.link.fromClient();
    expect(hello?.type).toBe(FRAME.hello);
    world.link.flush(); // hello → challenge
    world.link.flush(); // challenge → join
    world.link.flush(); // join → seated, welcome queued
    world.link.flush(); // welcome → this end
    expect(world.seated).toHaveLength(1);
    expect(world.seated[0]?.name).toBe("NIGHTHAWK");
    expect(world.isAdmitted()).toBe(true);
    // The welcome is FORWARDED, not consumed: the page's own client is what
    // builds the world from it, and this end never interprets a game frame.
    expect(world.delivered).toContain(FRAME.welcome);
  });

  it("pads the probe past the anti-reflection floor", async () => {
    const world = await pair();
    const [hello] = world.link.fromClient();
    expect(hello).not.toBeNull();
    // Re-encoded rather than measured off the wire, because that is what the
    // hub measures: a probe the host drops in silence is the least debuggable
    // failure this feature can have, so the padding is asserted rather than
    // assumed.
    const bytes = encodeFrame(
      { type: FRAME.hello, seq: 0, ack: 0, tick: 0 },
      hello?.payload,
    );
    expect(bytes.byteLength).toBeGreaterThanOrEqual(HELLO_MIN_BYTES);
  });

  it("asks again when the probe goes missing, and gives up eventually", async () => {
    const world = await pair();
    world.link.lose();
    world.time.advance(600);
    world.joiner.tick();
    expect(world.link.fromClient()[0]?.type).toBe(FRAME.hello);
    // …and it does not ask for ever. Twelve probes is six seconds of asking,
    // which is a player who mistyped an address finding out while they still
    // remember typing it.
    for (let at = 0; at < 20; at++) {
      world.link.lose();
      world.time.advance(600);
      world.joiner.tick();
    }
    expect(world.closed[0]?.reason).toBe("no-session");
  });

  it("refuses a build skew off the CHALLENGE, without sending a join", async () => {
    // The saving in round trips is the point: the challenge already carries the
    // host's build, so a joiner three versions behind is told to update instead
    // of sending a join the host will drop and waiting out a silence.
    const world = await pair({
      joiner: { protocol: 7, build: "9.9.9", mods: [] },
    });
    world.link.flush(); // hello → challenge
    world.link.flush(); // challenge → (refused here)
    expect(world.closed[0]?.reason).toBe("build-mismatch");
    expect(world.closed[0]?.detail).toContain("1.2.3");
    expect(world.seated).toHaveLength(0);
  });

  it("carries the host's own refusal back, and forwards the bye", async () => {
    const world = await pair({ password: "swordfish" });
    world.link.flush();
    world.link.flush();
    world.link.flush();
    world.link.flush();
    expect(world.seated).toHaveLength(1);

    // …and with the wrong one, the host refuses and the page is told in the
    // frame it already knows how to read.
    const wrong = await pairWithPassword("swordfish", "hunter2");
    expect(wrong.closed[0]?.reason).toBe("bad-password");
    expect(wrong.delivered).toContain(FRAME.bye);
  });
});

/** A session with `hostPassword` joined with `typed`. */
async function pairWithPassword(hostPassword: string, typed: string) {
  const time = clock();
  const link = wire();
  const { session } = stubSession();
  const hub = createPeerHub({
    // Loopback UDP, with no Steam anywhere near it — the licence escape
    // (decision 15) is exactly what this suite is for.
    allowUnlicensedTransport: true,
    session,
    handshake: HOST,
    password: hostPassword,
    secret: SECRET,
    now: time.now,
  });
  await hub.add(link.hostTransport);
  const closed: { reason: string; detail?: string }[] = [];
  const delivered: number[] = [];
  const joiner = createJoinLink({
    transport: link.clientTransport,
    host: HOST_KEY,
    handshake: HOST,
    name: "NIGHTHAWK",
    password: typed,
    now: time.now,
    deliver: (frame) => {
      const decoded = decodeFrame(frame);
      if (decoded) {
        delivered.push(decoded.type);
        if (decoded.type === FRAME.bye) {
          expect((decoded.payload as ByePayload).reason).toBe("bad-password");
        }
      }
    },
    onAdmitted: () => {},
    onClosed: (reason, detail) => closed.push({ reason, detail }),
  });
  await joiner.start();
  link.flush();
  link.flush();
  link.flush();
  link.flush();
  return { closed, delivered };
}
