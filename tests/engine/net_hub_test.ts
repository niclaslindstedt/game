// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE PEER HUB — the only thing standing between an open UDP port and the
// simulation, driven over an in-memory transport.
//
// **THE ASSERTIONS ARE MOSTLY ABOUT WHAT DOES *NOT* HAPPEN**, which is the
// nature of the thing being tested: a stranger's input never reaching the
// session, an unpadded probe never being answered, a flood never being replied
// to at all. Those are exactly the properties that decay silently, because
// nothing about the game gets worse when one of them is lost.

import { describe, expect, it } from "vitest";

import { createPeerHub, type HubSession } from "../../server/net/hub.ts";
import type {
  Packet,
  Transport,
  TransportEvents,
} from "../../server/net/transport.ts";
import { encodeFrame, decodeFrame } from "@game/wire/codec.ts";
import {
  challengeEpoch,
  challengeFor,
  passwordProof,
} from "@game/wire/handshake.ts";
import { FRAME, HELLO_MIN_BYTES } from "@game/wire/frames.ts";
import { type ChallengePayload, type Handshake } from "@game/wire/protocol.ts";

const HOST: Handshake = { protocol: 2, build: "1.2.3", mods: [] };
const SECRET = 0xbadf00d;
const PEER = "203.0.113.7:27015";

/** A session that records what was asked of it and simulates nothing. The
 * whole admission path is testable this way, which is the point of the hub
 * taking a structural `HubSession` rather than the real one — the alternative
 * is a test that has to build a level to check a password. */
function stubSession() {
  const added: { id: number; plays: boolean; name?: string }[] = [];
  const removed: number[] = [];
  const received: { id: number; type: number }[] = [];
  const session: HubSession = {
    addClient: (id, _send, seat, name) =>
      added.push({
        id,
        plays: typeof seat === "boolean" ? seat : seat.play,
        name,
      }),
    removeClient: (id) => removed.push(id),
    receive: (id, type) => received.push({ id, type }),
    get clientCount() {
      return added.length - removed.length;
    },
  };
  return { session, added, removed, received };
}

/** A transport that carries packets between the test and the hub. */
function stubTransport(id: Transport["id"] = "udp") {
  const sent: { to: string; data: Uint8Array }[] = [];
  const dropped: string[] = [];
  let events: TransportEvents | null = null;
  const transport: Transport = {
    id,
    bound: { address: "0.0.0.0", port: 27015 },
    listen: (handlers) => {
      events = handlers;
      return Promise.resolve(transport.bound);
    },
    send: (to, data) => sent.push({ to, data }),
    ping: () => 42,
    drop: (to) => dropped.push(to),
    tick: () => {},
    close: () => {},
  };
  return {
    transport,
    sent,
    dropped,
    arrive(packet: Packet) {
      events?.onPacket(packet);
    },
    lose(peer: string, reason: string) {
      events?.onPeerLost(peer, reason);
    },
    /** The last frame sent to a peer, decoded. */
    last(to = PEER) {
      const frames = sent.filter((entry) => entry.to === to);
      const tail = frames[frames.length - 1];
      return tail ? decodeFrame(tail.data) : null;
    },
  };
}

/** A hub over one clock the test owns. */
async function harness(
  options: {
    password?: string;
    maxClients?: number;
    /** Grant the Steam-only licence gate's escape. TRUE for every test but the licence ones —
     * a headless suite has no Steam anywhere near it. */
    licensed?: boolean;
    /** What the transport calls itself, for the licence ladder. */
    transportId?: string;
  } = {},
) {
  let clock = 1_000;
  const session = stubSession();
  const wire = stubTransport((options.transportId ?? "udp") as Transport["id"]);
  const hub = createPeerHub({
    allowUnlicensedTransport: options.licensed ?? true,
    session: session.session,
    handshake: HOST,
    secret: SECRET,
    password: options.password,
    maxClients: options.maxClients,
    now: () => clock,
  });
  await hub.add(wire.transport);
  return {
    hub,
    ...session,
    ...wire,
    advance(ms: number) {
      clock += ms;
    },
    get cookie() {
      return challengeFor(SECRET, PEER, challengeEpoch(clock));
    },
  };
}

/** A padded probe — the padding is what makes the mechanism safe, not merely
 * authenticated. See `HELLO_MIN_BYTES`. */
function hello(protocol = HOST.protocol): Uint8Array {
  return new Uint8Array(
    encodeFrame(
      { type: FRAME.hello, seq: 0, ack: 0, tick: 0 },
      {
        protocol,
        pad: "x".repeat(HELLO_MIN_BYTES),
      },
    ),
  );
}

function join(payload: Record<string, unknown>): Uint8Array {
  return new Uint8Array(
    encodeFrame({ type: FRAME.join, seq: 0, ack: 0, tick: 0 }, payload),
  );
}

describe("the connectionless probe", () => {
  it("answers a padded hello with a challenge", async () => {
    const net = await harness();
    net.arrive({ from: PEER, data: hello() });
    const frame = net.last();
    expect(frame?.type).toBe(FRAME.challenge);
    const payload = frame?.payload as ChallengePayload;
    expect(payload.cookie).toBe(net.cookie);
    expect(payload.build).toBe(HOST.build);
    expect(payload.needsPassword).toBe(false);
  });

  it("says a password is wanted without saying anything about it", async () => {
    const net = await harness({ password: "hunter2" });
    net.arrive({ from: PEER, data: hello() });
    const payload = net.last()?.payload as ChallengePayload;
    expect(payload.needsPassword).toBe(true);
    expect(JSON.stringify(payload)).not.toContain("hunter2");
  });

  it("ignores an UNPADDED hello in silence", async () => {
    // THE ANTI-REFLECTION RULE. A spoofed source address must not be able to
    // make this host send more bytes than it received, and answering "you did
    // not pad it" would itself be a reply of the kind the rule forbids.
    const net = await harness();
    net.arrive({
      from: PEER,
      data: new Uint8Array(
        encodeFrame(
          { type: FRAME.hello, seq: 0, ack: 0, tick: 0 },
          {
            protocol: 2,
          },
        ),
      ),
    });
    expect(net.sent).toHaveLength(0);
  });

  it("stops answering a flood, and stops SILENTLY", async () => {
    // Silence rather than a refusal: a refusal is itself a reply worth
    // eliciting, which is the whole trick the limiter exists to defeat.
    const net = await harness();
    for (let i = 0; i < 20; i++) net.arrive({ from: PEER, data: hello() });
    expect(net.sent.length).toBeLessThanOrEqual(5);
  });

  it("counts the ADDRESS, not the address and port", async () => {
    // A flood trivially varies its source port, and a limiter that counted
    // those would hand every attacker a fresh allowance per packet.
    const net = await harness();
    for (let port = 1; port <= 20; port++) {
      net.arrive({ from: `203.0.113.7:${port}`, data: hello() });
    }
    expect(net.sent.length).toBeLessThanOrEqual(5);
  });
});

describe("admission", () => {
  it("seats a matching joiner as a SPECTATOR", async () => {
    // Replicating a hero to eight machines and seating a second hero are two
    // different features, and handing this one the owner's flag would let it
    // steer somebody else's character today.
    const net = await harness();
    net.arrive({
      from: PEER,
      data: join({
        cookie: net.cookie,
        handshake: HOST,
        proof: 0,
        name: "ZOE",
      }),
    });
    // The NAME travels with the seat: without it the roster and every chat
    // line would fall back to "PLAYER N" for somebody who told us what they
    // are called, and the fallback would look like the feature. And the joiner
    // is SEATED — they arrive to play, not to watch.
    expect(net.added).toEqual([
      { id: expect.any(Number), plays: true, name: "ZOE" },
    ]);
    expect(net.hub.nameOf(net.added[0]!.id)).toBe("ZOE");
    expect(net.hub.pingOf(net.added[0]!.id)).toBe(42);
  });

  it("refuses a skew BY NAME rather than in silence", async () => {
    // Version skew is the failure mode that reaches a player as "random
    // crashes"; a joiner told "one of you needs to update" fixes it in a
    // minute, and one told nothing files a bug.
    const net = await harness();
    net.arrive({
      from: PEER,
      data: join({
        cookie: net.cookie,
        handshake: { ...HOST, build: "9.9.9" },
        proof: 0,
      }),
    });
    const frame = net.last();
    expect(frame?.type).toBe(FRAME.bye);
    expect(frame?.payload).toMatchObject({
      reason: "build-mismatch",
      detail: "HOST BUILD 1.2.3",
    });
    expect(net.added).toHaveLength(0);
  });

  it("refuses a join with no valid cookie", async () => {
    const net = await harness();
    net.arrive({
      from: PEER,
      data: join({ cookie: 12345, handshake: HOST, proof: 0 }),
    });
    expect(net.last()?.payload).toMatchObject({ reason: "bad-challenge" });
  });

  it("refuses a wrong password and accepts a right one", async () => {
    const net = await harness({ password: "hunter2" });
    net.arrive({
      from: PEER,
      data: join({ cookie: net.cookie, handshake: HOST, proof: 1 }),
    });
    expect(net.last()?.payload).toMatchObject({ reason: "bad-password" });
    net.arrive({
      from: PEER,
      data: join({
        cookie: net.cookie,
        handshake: HOST,
        proof: passwordProof("hunter2", net.cookie),
      }),
    });
    expect(net.added).toHaveLength(1);
  });

  it("survives a malformed join without throwing", async () => {
    // One bad packet must never be able to stop a tick on the host's machine.
    const net = await harness();
    for (const payload of [null, 42, { handshake: { mods: "not-an-array" } }]) {
      expect(() =>
        net.arrive({
          from: PEER,
          data: new Uint8Array(
            encodeFrame({ type: FRAME.join, seq: 0, ack: 0, tick: 0 }, payload),
          ),
        }),
      ).not.toThrow();
    }
    expect(net.added).toHaveLength(0);
  });

  it("refuses a ninth seat", async () => {
    const net = await harness({ maxClients: 2 });
    for (const peer of ["1.1.1.1:1", "2.2.2.2:2", "3.3.3.3:3"]) {
      net.arrive({
        from: peer,
        data: join({
          cookie: challengeFor(SECRET, peer, challengeEpoch(1_000)),
          handshake: HOST,
          proof: 0,
        }),
      });
    }
    expect(net.added).toHaveLength(2);
    expect(net.last("3.3.3.3:3")?.payload).toMatchObject({
      reason: "session-full",
    });
  });
});

describe("what an unadmitted peer may do", () => {
  it("is exactly nothing", async () => {
    // The admission rule, implemented literally: input, commands and chat are only
    // parsed for a peer that has already cleared every check.
    const net = await harness();
    for (const type of [FRAME.input, FRAME.command, FRAME.chat, FRAME.ack]) {
      net.arrive({
        from: PEER,
        data: new Uint8Array(
          encodeFrame({ type, seq: 1, ack: 0, tick: 0 }, { name: "skipIntro" }),
        ),
      });
    }
    expect(net.received).toHaveLength(0);
    expect(net.sent).toHaveLength(0);
  });

  it("becomes everything the session allows once it is admitted", async () => {
    const net = await harness();
    net.arrive({
      from: PEER,
      data: join({ cookie: net.cookie, handshake: HOST, proof: 0 }),
    });
    net.arrive({
      from: PEER,
      data: new Uint8Array(
        encodeFrame(
          { type: FRAME.chat, seq: 1, ack: 0, tick: 0 },
          {
            text: "hi",
          },
        ),
      ),
    });
    // The hub forwards; what a spectator may DO is the session's own refusal
    // to make, in the one place a client cannot argue with it.
    expect(net.received).toEqual([{ id: net.added[0]!.id, type: FRAME.chat }]);
  });
});

describe("what an admitted peer may send, and how fast", () => {
  /** A hub with one peer already in, and a chat frame to spend budget with. */
  async function seated() {
    const net = await harness();
    net.arrive({
      from: PEER,
      data: join({ cookie: net.cookie, handshake: HOST, proof: 0 }),
    });
    net.received.length = 0;
    net.sent.length = 0;
    return net;
  }

  const chatter = new Uint8Array(
    encodeFrame({ type: FRAME.chat, seq: 1, ack: 0, tick: 0 }, { text: "hi" }),
  );

  it("carries an honest client's whole traffic without throttling it", async () => {
    // Sized off what a client legitimately sends — an input per tick (60/s), an
    // ack per publish (20/s), chat and commands between them. A second of that
    // must pass untouched, or the defence is a bug report.
    const net = await seated();
    for (let i = 0; i < 100; i++) {
      net.advance(10); // 100 packets across a second
      net.arrive({ from: PEER, data: chatter });
    }
    expect(net.received).toHaveLength(100);
  });

  it("drops what a flood sends past the allowance, in silence", async () => {
    // Dropping is the same answer the reliability layer already gives a lost
    // datagram, and the game is built to recover from exactly that.
    const net = await seated();
    for (let i = 0; i < 1_000; i++) net.arrive({ from: PEER, data: chatter });
    expect(net.received.length).toBeLessThan(1_000);
    expect(net.removed).toHaveLength(0); // a burst is not a kick
    expect(net.sent).toHaveLength(0); // …and never answered
  });

  it("forgives a burst once the clock has paid it back", async () => {
    // The case that must NOT be a kick: a client whose connection stalled
    // delivers everything the reliability layer was holding the instant it
    // recovers, and throttling exactly that is throttling the recovery.
    const net = await seated();
    for (let i = 0; i < 400; i++) net.arrive({ from: PEER, data: chatter });
    expect(net.removed).toHaveLength(0);
    net.advance(5_000);
    net.received.length = 0;
    net.arrive({ from: PEER, data: chatter });
    expect(net.received).toHaveLength(1);
  });

  it("drops a peer that keeps flooding, with a bye that says why", async () => {
    // The other half: a burst dips the bucket and the refill pays it back,
    // while a sustained flood drives the debt down without limit. Treating the
    // two alike either kicks a friend or tolerates an attacker.
    const net = await seated();
    for (let i = 0; i < 5_000; i++) net.arrive({ from: PEER, data: chatter });
    expect(net.removed).toEqual([net.added[0]!.id]);
    expect(net.last()?.payload).toMatchObject({ reason: "rate-limited" });
    // And it is genuinely gone: nothing it sends afterwards is parsed at all.
    net.received.length = 0;
    net.arrive({ from: PEER, data: chatter });
    expect(net.received).toHaveLength(0);
  });
});

describe("leaving", () => {
  it("frees the seat when a peer times out", async () => {
    const net = await harness();
    net.arrive({
      from: PEER,
      data: join({ cookie: net.cookie, handshake: HOST, proof: 0 }),
    });
    net.lose(PEER, "timed out");
    expect(net.removed).toEqual([net.added[0]!.id]);
    expect(net.dropped).toContain(PEER);
  });

  it("kicks with a bye and a reason", async () => {
    const net = await harness();
    net.arrive({
      from: PEER,
      data: join({ cookie: net.cookie, handshake: HOST, proof: 0 }),
    });
    net.hub.kick(net.added[0]!.id, "being a nuisance");
    expect(net.last()?.payload).toMatchObject({
      reason: "kicked",
      detail: "being a nuisance",
    });
    expect(net.removed).toEqual([net.added[0]!.id]);
  });
});

describe("multiplayer is licensed through Steam", () => {
  // DECISION 15. The game ships under PolyForm-Noncommercial and the
  // multiplayer right travels with the Steam copy, so a session carried by
  // anything other than the Steam relay is unlicensed play — whoever set it up
  // and whatever they meant by it. The hub is the one door every path into a
  // session comes through (the game's own HOST, the server browser, JOIN BY
  // ADDRESS, the dedicated server), so it is the one place the rule can live.
  //
  // Every OTHER test in this file passes `allowUnlicensedTransport`, because a
  // headless suite has no Steam anywhere near it — which is exactly why these
  // three have to exist: without them the gate could be deleted and the suite
  // would stay green.
  it("refuses a peer that did not arrive through Steam", async () => {
    const net = await harness({ licensed: false });
    net.arrive({
      from: PEER,
      data: join({ cookie: net.cookie, handshake: HOST, proof: 0 }),
    });
    const frame = net.last();
    expect(frame?.type).toBe(FRAME.bye);
    expect(frame?.payload).toMatchObject({ reason: "unlicensed" });
    expect(net.added).toHaveLength(0);
  });

  it("refuses BEFORE it looks at the build or the password", async () => {
    // The ladder's ORDER is the design: a peer that may not be here at all
    // should not have anything else about it examined, and the message it gets
    // back has to name the thing it can actually act on. A joiner on the wrong
    // build over an unlicensed transport is told about the LICENCE, not told to
    // go and update.
    const net = await harness({ licensed: false, password: "hunter2" });
    net.arrive({
      from: PEER,
      data: join({
        cookie: net.cookie,
        handshake: { ...HOST, build: "9.9.9" },
        proof: 0,
      }),
    });
    expect(net.last()?.payload).toMatchObject({ reason: "unlicensed" });
  });

  it("fails CLOSED, so a transport added later is licensed deliberately", async () => {
    // The check is `id === "steam"`, never `id !== "udp"`. The difference shows
    // up only on the day somebody adds a third transport — and by then the
    // wrong one is a hole nobody looks at again.
    const net = await harness({ licensed: false, transportId: "relay-v2" });
    net.arrive({
      from: PEER,
      data: join({ cookie: net.cookie, handshake: HOST, proof: 0 }),
    });
    expect(net.last()?.payload).toMatchObject({ reason: "unlicensed" });
    expect(net.added).toHaveLength(0);
  });

  it("lets a Steam peer straight through", async () => {
    const net = await harness({ licensed: false, transportId: "steam" });
    net.arrive({
      from: PEER,
      data: join({ cookie: net.cookie, handshake: HOST, proof: 0 }),
    });
    // Seated, which is the only assertion that matters here: without this case
    // a gate that refused EVERYBODY would pass the three above.
    expect(net.added).toHaveLength(1);
  });
});
