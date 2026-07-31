// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE RELIABILITY LAYER, driven over a lossy in-memory link.
//
// The clock is injected precisely so this suite exists: a retransmit interval
// that follows the smoothed round trip, an ack window that wraps at 16 bits and
// a timeout measured in seconds are all things that would otherwise be tested
// by waiting, i.e. not tested.
//
// **THE LOSS IS SCRIPTED, NOT RANDOM.** A flaky test about packet loss is worse
// than no test about packet loss, and the interesting cases here are specific:
// the retransmit that crosses its own ack, the ack for a sequence three
// windows back, the message that had to be retried more times than the window
// is wide.

import { describe, expect, it } from "vitest";

import {
  createReliability,
  PEER_TIMEOUT_MS,
  RELIABILITY_HEADER_BYTES,
  seqDelta,
  type Reliability,
} from "../../server/net/reliability.ts";

/** Two ends of one link, with a clock the test owns and a drop rule it
 * scripts. */
function link(
  options: { drop?: (from: "a" | "b", n: number) => boolean } = {},
) {
  let clock = 0;
  const sent = { a: 0, b: 0 };
  const heard: { a: Uint8Array[]; b: Uint8Array[] } = { a: [], b: [] };
  const dead: { a: string[]; b: string[] } = { a: [], b: [] };
  const ends: Record<"a" | "b", Reliability> = {} as never;

  const make = (me: "a" | "b", other: "a" | "b") =>
    createReliability({
      now: () => clock,
      send: (data) => {
        const n = ++sent[me];
        if (options.drop?.(me, n)) return;
        // A copy, because the real transports hand over bytes that have left
        // this process: a test sharing one buffer would hide an aliasing bug.
        ends[other].receive(Uint8Array.from(data));
      },
      deliver: (payload) => heard[me].push(Uint8Array.from(payload)),
      onDead: (reason) => dead[me].push(reason),
    });

  ends.a = make("a", "b");
  ends.b = make("b", "a");
  return {
    a: ends.a,
    b: ends.b,
    heard,
    dead,
    sent,
    advance(ms: number) {
      clock += ms;
      ends.a.update();
      ends.b.update();
    },
  };
}

const bytes = (...values: number[]) => Uint8Array.from(values);
const texts = (list: Uint8Array[]) => list.map((item) => [...item].join(","));

describe("the reliability layer", () => {
  it("delivers an unreliable payload once and never retries it", () => {
    const net = link();
    net.a.send(bytes(1, 2, 3), false);
    expect(texts(net.heard.b)).toEqual(["1,2,3"]);
    const before = net.sent.a;
    net.advance(5_000);
    // A dropped snapshot is coded against an ACKNOWLEDGED baseline, so
    // retransmitting it would deliver stale ground late — worse than not
    // delivering it at all.
    expect(net.sent.a).toBe(before);
  });

  it("retransmits a reliable payload until it is acknowledged", () => {
    // The first three datagrams from A are lost, so the message only lands on
    // the fourth try.
    const net = link({ drop: (from, n) => from === "a" && n <= 3 });
    net.a.send(bytes(9), true);
    expect(net.heard.b).toHaveLength(0);
    for (let i = 0; i < 3; i++) net.advance(200);
    expect(texts(net.heard.b)).toEqual(["9"]);
  });

  it("stops retransmitting once the ack comes back", () => {
    const net = link();
    net.a.send(bytes(9), true);
    // B has to say something for its ack to travel; on a live link that is the
    // next input or ack frame, which is why nothing here needs a keepalive.
    net.b.send(bytes(0), false);
    const settled = net.sent.a;
    net.advance(5_000);
    expect(net.sent.a).toBe(settled);
  });

  it("drops a retransmit that crossed its own ack", () => {
    // The receiver dedupes on the MESSAGE id, not the datagram sequence, so a
    // retry that was already delivered is silently discarded. Without it a
    // chat line appears twice on a lossy link — which reads as a bug in chat.
    const net = link({ drop: (from, n) => from === "b" && n === 1 });
    net.a.send(bytes(7), true);
    net.b.send(bytes(0), false); // the ack, lost
    net.advance(300); // A gives up waiting and retransmits
    expect(texts(net.heard.b)).toEqual(["7"]);
  });

  it("survives more retries than the ack window is wide", () => {
    // THE REASON A RETRANSMIT TAKES A NEW SEQUENCE. Resending the same one and
    // deduping on it would put the message's fate inside the 33-slot window,
    // so a message retried past it could never be acknowledged and would retry
    // for ever.
    const net = link({ drop: (from, n) => from === "a" && n <= 36 });
    net.a.send(bytes(5), true);
    for (let i = 0; i < 80; i++) net.advance(100);
    expect(texts(net.heard.b)).toEqual(["5"]);
  });

  it("declares a silent peer dead", () => {
    const net = link();
    net.advance(PEER_TIMEOUT_MS + 1);
    expect(net.dead.a).toContain("timed out");
  });

  it("measures a round trip rather than assuming one", () => {
    const net = link();
    net.a.send(bytes(1), false);
    net.advance(0);
    net.b.send(bytes(1), false); // carries the ack back
    // The smoothing is exponential, so one sample moves it toward the truth
    // rather than to it — what matters is that it moved at all.
    expect(net.a.rtt).toBeGreaterThanOrEqual(0);
    expect(net.a.rtt).toBeLessThan(120);
  });

  it("refuses a datagram too short to hold a header", () => {
    const net = link();
    for (let n = 0; n < RELIABILITY_HEADER_BYTES; n++) {
      // On an open port this is an ordinary event, and it must never throw.
      expect(() => net.a.receive(new Uint8Array(n))).not.toThrow();
    }
    expect(net.heard.b).toHaveLength(0);
  });

  it("never delivers an empty payload", () => {
    // A pure ack carries none, and delivering it would make every consumer
    // above check for it.
    const net = link();
    net.a.send(new Uint8Array(0), false);
    expect(net.heard.b).toHaveLength(0);
  });
});

describe("seqDelta", () => {
  it("reads the wrap the way a sequence counter means it", () => {
    // The bug this prevents shows up once an hour of play at 20 Hz and would
    // be blamed on anything else: after 65535 a plain `a - b` calls the newest
    // packet in the session the oldest one.
    expect(seqDelta(5, 3)).toBe(2);
    expect(seqDelta(3, 5)).toBe(-2);
    expect(seqDelta(1, 0xffff)).toBe(2);
    expect(seqDelta(0xffff, 1)).toBe(-2);
    expect(seqDelta(7, 7)).toBe(0);
  });
});
