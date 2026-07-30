// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE FRAMING, and chiefly its REFUSALS.
//
// The round trips are the easy half. The half worth having is that a decoder
// which will one day be fed bytes from an open UDP port never throws, never
// over-reads, and never mistakes a stray datagram for a frame — because PR 2
// puts this exact function behind `node:dgram` and PR 5 fuzzes it, and a
// decoder that only works on well-formed input is one that has to be rewritten
// then rather than trusted.

import { describe, expect, it } from "vitest";

import { decodeFrame, encodeFrame, HEADER_BYTES } from "@game/wire/codec.ts";
import { FRAME, isFrameType } from "@game/wire/protocol.ts";

describe("frame codec", () => {
  it("round-trips a header and its payload", () => {
    const buffer = encodeFrame(
      { type: FRAME.snapshot, seq: 7, ack: 3, tick: 421 },
      { hello: "world", n: [1, 2, 3] },
    );
    const frame = decodeFrame(buffer);
    expect(frame).toEqual({
      type: FRAME.snapshot,
      seq: 7,
      ack: 3,
      tick: 421,
      payload: { hello: "world", n: [1, 2, 3] },
    });
  });

  it("distinguishes an absent payload from a null one", () => {
    // A delta says "this field is gone" with `undefined` and "this field is
    // null" with null, so the two must survive the trip apart.
    expect(decodeFrame(encodeFrame(ack()))?.payload).toBeUndefined();
    expect(decodeFrame(encodeFrame(ack(), null))?.payload).toBeNull();
  });

  it("carries a header with no payload in exactly the header's bytes", () => {
    // An ack is the most common client→server frame there is; it must not pay
    // for a body it does not have.
    expect(encodeFrame(ack()).byteLength).toBe(HEADER_BYTES);
  });

  it("survives every sequence number a u32 can hold", () => {
    const buffer = encodeFrame({
      type: FRAME.ack,
      seq: 0xffffffff,
      ack: 0xfffffffe,
      tick: 0x7fffffff,
    });
    const frame = decodeFrame(buffer);
    expect(frame?.seq).toBe(0xffffffff);
    expect(frame?.ack).toBe(0xfffffffe);
    expect(frame?.tick).toBe(0x7fffffff);
  });

  it("reads a view over a larger buffer without copying the wrong bytes", () => {
    // `node:dgram` hands over a `Buffer`, which is a view into a pooled
    // allocation — reading it as if it started at byte zero of its own
    // ArrayBuffer is the classic way to decode somebody else's packet.
    const inner = encodeFrame(
      { type: FRAME.bye, seq: 1, ack: 0, tick: 2 },
      "x",
    );
    const padded = new Uint8Array(inner.byteLength + 8);
    padded.set(new Uint8Array(inner), 8);
    const view = padded.subarray(8);
    expect(decodeFrame(view)?.payload).toBe("x");
  });

  describe("refusals", () => {
    it("refuses a buffer shorter than a header", () => {
      expect(decodeFrame(new ArrayBuffer(0))).toBeNull();
      expect(decodeFrame(new ArrayBuffer(HEADER_BYTES - 1))).toBeNull();
    });

    it("refuses a type this build does not know", () => {
      const buffer = encodeFrame(ack());
      new DataView(buffer).setUint8(0, 200);
      expect(decodeFrame(buffer)).toBeNull();
    });

    it("refuses a truncated payload instead of throwing", () => {
      const whole = encodeFrame(
        { type: FRAME.delta, seq: 1, ack: 0, tick: 1 },
        { some: "object" },
      );
      const cut = new Uint8Array(whole).slice(0, whole.byteLength - 3);
      expect(decodeFrame(cut.buffer.slice(0, cut.byteLength))).toBeNull();
    });

    it("never throws on random bytes", () => {
      // The cheap ancestor of PR 5's fuzz test. Deterministic, so a failure is
      // reproducible rather than a flake nobody can chase.
      let seed = 0x2545f491;
      const next = () => {
        seed = (seed * 1103515245 + 12345) >>> 0;
        return seed & 0xff;
      };
      for (let round = 0; round < 500; round++) {
        const bytes = new Uint8Array(next() % 64);
        for (let i = 0; i < bytes.length; i++) bytes[i] = next();
        expect(() => decodeFrame(bytes)).not.toThrow();
      }
    });
  });

  it("knows exactly the frame types it declares", () => {
    for (const type of Object.values(FRAME))
      expect(isFrameType(type)).toBe(true);
    expect(isFrameType(0)).toBe(false);
    expect(isFrameType(99)).toBe(false);
  });
});

function ack() {
  return { type: FRAME.ack, seq: 1, ack: 1, tick: 1 } as const;
}
