// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// FUZZING THE WIRE — §5.2's last clause, and the one test in this feature whose
// value is entirely in what it does NOT observe.
//
// The direct-connect path means the game parses bytes from anybody on the
// internet. Every other net suite asserts that a WELL-FORMED message does the
// right thing; this one asserts that a MALFORMED one does nothing at all — no
// throw, no over-read, no reachable state change — across every layer a hostile
// datagram passes through on its way in:
//
//   the reliability header  →  the frame codec  →  the hub's admission  →
//   the session's input, command and chat handlers  →  and, on the way back,
//   the client's own delta applier, because a JOINER trusts a HOST it has no
//   more reason to trust than the host has to trust it.
//
// **THE RANDOMNESS IS SEEDED, AND THAT IS NOT A DETAIL.** A fuzz test that
// cannot reproduce its own failure is a flake with a good reputation: it fails
// once in CI, nobody can make it fail again, and it gets deleted. The seed is
// derived from the case index, so case 431 throws the same bytes for ever and
// the failure message names it.
//
// **AND "DID NOT THROW" IS ONLY HALF THE ASSERTION.** A decoder can swallow an
// over-read and hand back garbage, which is worse than a crash — so where a
// refusal is the correct answer, the suite checks that the refusal HAPPENED
// (nothing reached the session, the payload came back null) rather than merely
// that the process is still alive.

import { describe, expect, it } from "vitest";

import { createRng } from "@game/lib/rng.ts";

import { createPeerHub, type HubSession } from "../../server/net/hub.ts";
import { createReliability } from "../../server/net/reliability.ts";
import type {
  Packet,
  Transport,
  TransportEvents,
} from "../../server/net/transport.ts";
import { decodeFrame, encodeFrame, HEADER_BYTES } from "@game/wire/codec.ts";
import { patchState, type StatePatch } from "../../server/wire/delta.ts";
import { FRAME, type Handshake } from "@game/wire/protocol.ts";

const HOST: Handshake = { protocol: 9, build: "0.0.0", mods: [] };
const PEER = "198.51.100.4:27015";

/** How many hostile inputs each layer is thrown. Enough to reach every branch
 * a length check guards, small enough that the suite stays a second. */
const CASES = 2_000;

/** `n` bytes of seeded noise. The seed is the case index, so a failure names
 * the exact input that produced it. */
function noise(seed: number, length: number): Uint8Array {
  const rng = createRng(seed + 1);
  const bytes = new Uint8Array(length);
  for (let i = 0; i < length; i++) bytes[i] = Math.floor(rng() * 256);
  return bytes;
}

/** A length that lands on and around every boundary the decoders check. */
function fuzzLength(seed: number): number {
  const edges = [0, 1, 11, 12, 13, 15, 16, 17, 63, 64, 1024];
  const rng = createRng(seed * 7919 + 3);
  return rng() < 0.5
    ? (edges[Math.floor(rng() * edges.length)] ?? 0)
    : Math.floor(rng() * 2048);
}

describe("the frame codec under hostile bytes", () => {
  it("never throws, whatever arrives", () => {
    for (let seed = 0; seed < CASES; seed++) {
      const bytes = noise(seed, fuzzLength(seed));
      expect(() => decodeFrame(bytes), `case ${seed}`).not.toThrow();
    }
  });

  it("refuses anything shorter than its own fixed header", () => {
    // The classic over-read is reading a length out of a payload before
    // checking the buffer holds one. Here the header is fixed-size, so the
    // whole defence is this single comparison — and it is the one a future
    // "small optimization" removes.
    for (let length = 0; length < HEADER_BYTES; length++) {
      expect(decodeFrame(noise(length, length))).toBeNull();
    }
  });

  it("hands back no payload it could not parse", () => {
    // A decoder that swallowed a JSON error and returned a half-built frame
    // would put `undefined` where every consumer expects an object — which
    // reads as a game bug three layers up rather than as a bad packet.
    let parsed = 0;
    for (let seed = 0; seed < CASES; seed++) {
      const frame = decodeFrame(noise(seed, Math.max(16, fuzzLength(seed))));
      if (!frame) continue;
      parsed++;
      expect(Object.values(FRAME)).toContain(frame.type);
      expect(Number.isInteger(frame.seq)).toBe(true);
      expect(Number.isInteger(frame.tick)).toBe(true);
    }
    // A sanity check on the fuzzer rather than on the codec: if random bytes
    // never got past the header, this suite would be asserting nothing.
    expect(parsed).toBeGreaterThan(0);
  });

  it("reads a truncated payload as a refusal, not as a shorter message", () => {
    const whole = new Uint8Array(
      encodeFrame(
        { type: FRAME.chat, seq: 1, ack: 0, tick: 0 },
        { text: "HI" },
      ),
    );
    for (let cut = 1; cut < whole.byteLength - HEADER_BYTES; cut++) {
      const short = whole.subarray(0, whole.byteLength - cut);
      expect(() => decodeFrame(short)).not.toThrow();
      expect(decodeFrame(short)).toBeNull();
    }
  });
});

describe("the reliability layer under hostile datagrams", () => {
  it("never throws, and delivers nothing out of a malformed datagram", () => {
    const delivered: Uint8Array[] = [];
    let clock = 0;
    const layer = createReliability({
      send: () => {},
      deliver: (payload) => delivered.push(payload),
      onDead: () => {},
      now: () => clock,
    });
    for (let seed = 0; seed < CASES; seed++) {
      clock += 1;
      const bytes = noise(seed, fuzzLength(seed));
      expect(() => layer.receive(bytes), `case ${seed}`).not.toThrow();
    }
    // Random bytes DO make it through — the header is twelve bytes of numbers
    // and every one of them is legal — so what is asserted is that whatever
    // came out was a plain slice of what went in, never a read past the end.
    for (const payload of delivered) {
      expect(payload.byteLength).toBeGreaterThan(0);
      expect(payload.byteLength).toBeLessThanOrEqual(2048);
    }
  });

  it("survives a truncated header without reading past it", () => {
    let dead = false;
    const layer = createReliability({
      send: () => {},
      deliver: () => {
        throw new Error("a datagram too short to hold a header delivered one");
      },
      onDead: () => {
        dead = true;
      },
      now: () => 0,
    });
    for (let length = 0; length < 12; length++) {
      expect(() => layer.receive(noise(length, length))).not.toThrow();
    }
    expect(dead).toBe(false);
  });
});

describe("the hub under hostile packets", () => {
  /** A session that records what reached it and simulates nothing. */
  function stub() {
    const received: number[] = [];
    const session: HubSession = {
      addClient: () => {},
      removeClient: () => {},
      receive: (_id, type) => received.push(type),
      clientCount: 0,
    };
    return { session, received };
  }

  function wire() {
    let events: TransportEvents | null = null;
    const transport: Transport = {
      id: "udp",
      bound: { address: "0.0.0.0", port: 27015 },
      listen: (handlers) => {
        events = handlers;
        return Promise.resolve(transport.bound);
      },
      send: () => {},
      ping: () => 0,
      drop: () => {},
      tick: () => {},
      close: () => {},
    };
    return {
      transport,
      arrive: (packet: Packet) => events?.onPacket(packet),
    };
  }

  it("lets nothing from an unadmitted peer reach the session, ever", async () => {
    // §5.2's first rule, fuzzed: a peer that has not cleared the handshake may
    // send exactly a padded `hello` and a `join`, and every other frame from it
    // is dropped without being looked at. Two thousand random packets is a
    // cheap way to notice the day somebody adds a third.
    const { session, received } = stub();
    const link = wire();
    let clock = 0;
    const hub = createPeerHub({
      // Loopback UDP, with no Steam anywhere near it — the licence escape
      // (decision 15) is exactly what this suite is for.
      allowUnlicensedTransport: true,
      session,
      handshake: HOST,
      secret: 1,
      now: () => (clock += 5),
    });
    await hub.add(link.transport);
    for (let seed = 0; seed < CASES; seed++) {
      expect(
        () => link.arrive({ from: PEER, data: noise(seed, fuzzLength(seed)) }),
        `case ${seed}`,
      ).not.toThrow();
    }
    expect(received).toEqual([]);
  });

  it("never answers a stranger with more bytes than it sent", async () => {
    // THE ANTI-REFLECTION RULE, stated as an inequality and fuzzed against
    // every packet the hub will answer at all. A host that replies 80 bytes to
    // a 20-byte probe from a SPOOFED source address is a DDoS amplifier, and
    // the property that stops it is not "the hello is padded" — it is that no
    // reply is ever larger than its request.
    const { session } = stub();
    const link = wire();
    const replies: number[] = [];
    link.transport.send = (_to, data) => replies.push(data.byteLength);
    let clock = 0;
    const hub = createPeerHub({
      // Loopback UDP, with no Steam anywhere near it — the licence escape
      // (decision 15) is exactly what this suite is for.
      allowUnlicensedTransport: true,
      session,
      handshake: HOST,
      secret: 3,
      now: () => (clock += 1_000), // a fresh allowance each packet
    });
    await hub.add(link.transport);
    for (let seed = 0; seed < CASES; seed++) {
      const data = noise(seed, fuzzLength(seed));
      replies.length = 0;
      link.arrive({ from: PEER, data });
      for (const bytes of replies) {
        expect(
          bytes,
          `case ${seed} answered ${data.byteLength}B`,
        ).toBeLessThanOrEqual(data.byteLength);
      }
    }
  });
});

describe("the delta applier under a hostile patch", () => {
  it("never throws on a patch a malicious host could send", () => {
    // A JOINER applies whatever the host sends it, and has no more reason to
    // trust that host than the host has to trust the joiner. The applier is
    // therefore an attack surface in the OTHER direction, and the one nobody
    // thinks of.
    for (let seed = 0; seed < CASES; seed++) {
      const rng = createRng(seed + 1);
      const patch = randomPatch(rng, 0) as StatePatch;
      const state = { players: [{ hp: 10 }], enemies: [], tick: 1 };
      expect(
        () => patchState(state as never, patch),
        `case ${seed}`,
      ).not.toThrow();
    }
  });
});

/** A plausibly-shaped but arbitrary patch: nested objects, arrays, nulls and
 * primitives, to whatever depth the roll takes it. */
function randomPatch(rng: () => number, depth: number): unknown {
  const roll = rng();
  if (depth > 3 || roll < 0.2) return null;
  if (roll < 0.35) return Math.floor(rng() * 1e9) - 5e8;
  if (roll < 0.45) return rng() < 0.5;
  if (roll < 0.55) return " ￿".repeat(Math.floor(rng() * 4));
  if (roll < 0.75) {
    const list: unknown[] = [];
    const n = Math.floor(rng() * 5);
    for (let i = 0; i < n; i++) list.push(randomPatch(rng, depth + 1));
    return list;
  }
  const object: Record<string, unknown> = {};
  const keys = ["players", "enemies", "items", "explored", "__proto__", "x"];
  const n = Math.floor(rng() * 4);
  for (let i = 0; i < n; i++) {
    const key = keys[Math.floor(rng() * keys.length)] ?? "x";
    object[key] = randomPatch(rng, depth + 1);
  }
  return object;
}
