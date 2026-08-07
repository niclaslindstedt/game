// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE VOICE PAYLOAD — the wire's one binary payload, and the refusals a decoder
// reachable from an open UDP port has to make.
//
// Two halves, and the second is the one worth having: a round trip proves the
// packing, but what actually protects a host is that `decodeVoice` is TOTAL over
// arbitrary bytes and refuses the three shapes that would otherwise reach a
// decoder — a header with no speech behind it, a packet claiming more than
// `MAX_VOICE_BYTES`, and anything that is not bytes at all.

import { describe, expect, it } from "vitest";

import {
  decodeFrame,
  encodeFrameBytes,
  HEADER_BYTES,
} from "@game/wire/codec.ts";
import { FRAME, isFrameType } from "@game/wire/frames.ts";
import {
  decodeVoice,
  encodeVoice,
  MAX_VOICE_BYTES,
  stampVoiceSeat,
  VOICE_CODEC,
  VOICE_FRAME_SAMPLES,
  VOICE_HEADER_BYTES,
  VOICE_PACKET_RATE,
  VOICE_SEAT_UNSET,
} from "@game/wire/voice.ts";

/** A believable Opus packet: 60-odd bytes of entropy. */
function speech(length = 60): Uint8Array {
  const bytes = new Uint8Array(length);
  for (let i = 0; i < length; i++) bytes[i] = (i * 37 + 11) & 0xff;
  return bytes;
}

describe("packing one packet of voice", () => {
  it("round trips the codec, the flag and the bytes", () => {
    const bytes = speech();
    const packet = decodeVoice(
      encodeVoice({ codec: VOICE_CODEC.opus, last: true, bytes }),
    );
    expect(packet).not.toBeNull();
    expect(packet!.codec).toBe(VOICE_CODEC.opus);
    expect(packet!.last).toBe(true);
    expect([...packet!.bytes]).toEqual([...bytes]);
  });

  it("leaves the seat UNSET when a client packs one", () => {
    // THE PROTOCOL, not a default: a client does not get to say whose voice it
    // is, because the HUD draws a portrait and a name off that byte. The
    // session stamps it — see `stampVoiceSeat`.
    const packet = decodeVoice(
      encodeVoice({ codec: VOICE_CODEC.opus, bytes: speech() }),
    );
    expect(packet!.seat).toBe(VOICE_SEAT_UNSET);
  });

  it("stamps a seat in place without disturbing the speech", () => {
    const bytes = speech();
    const payload = encodeVoice({ codec: VOICE_CODEC.opus, bytes });
    const packet = decodeVoice(stampVoiceSeat(payload, 3));
    expect(packet!.seat).toBe(3);
    expect(packet!.codec).toBe(VOICE_CODEC.opus);
    expect([...packet!.bytes]).toEqual([...bytes]);
  });

  it("keeps the payload small enough to be worth not base64-ing", () => {
    // The reason this payload is binary at all. A 60-byte Opus packet costs 4
    // bytes of sub-header; through JSON it would cost base64's extra third plus
    // the object around it, 50 times a second per speaker.
    const payload = encodeVoice({ codec: VOICE_CODEC.opus, bytes: speech(60) });
    expect(payload.byteLength).toBe(60 + VOICE_HEADER_BYTES);
  });
});

describe("what a voice decoder refuses", () => {
  it("refuses a header with no speech behind it", () => {
    // Every decoder below would otherwise need its own empty-packet branch.
    expect(decodeVoice(new Uint8Array(VOICE_HEADER_BYTES))).toBeNull();
    expect(decodeVoice(new Uint8Array(0))).toBeNull();
  });

  it("refuses anything shorter than the sub-header", () => {
    for (let length = 0; length < VOICE_HEADER_BYTES; length++) {
      expect(decodeVoice(new Uint8Array(length)), `${length} bytes`).toBeNull();
    }
  });

  it("refuses a packet past the cap rather than trimming it", () => {
    // TRIMMING WOULD BE INVENTING CONTENT for a stranger: a packet this big is
    // not one this build made, so the honest answer is to drop the whole thing.
    const over = encodeVoice({
      codec: VOICE_CODEC.opus,
      bytes: speech(MAX_VOICE_BYTES),
    });
    // `encodeVoice` clamps its own output, so the oversized case has to be
    // built by hand — which is exactly what a hostile peer would do.
    const hostile = new Uint8Array(VOICE_HEADER_BYTES + MAX_VOICE_BYTES + 1);
    expect(decodeVoice(over)).not.toBeNull();
    expect(decodeVoice(hostile)).toBeNull();
  });

  it("never throws, whatever it is handed", () => {
    for (const value of [
      null,
      undefined,
      42,
      "voice",
      {},
      [],
      { bytes: 1 },
      new Uint8Array([1, 2, 3]),
    ]) {
      expect(() => decodeVoice(value), String(value)).not.toThrow();
    }
    // A real ArrayBuffer is accepted (a datagram arrives as one).
    const buffer = encodeVoice({
      codec: VOICE_CODEC.opus,
      bytes: speech(),
    }).slice().buffer;
    expect(decodeVoice(buffer)).not.toBeNull();
  });
});

describe("the voice FRAME", () => {
  it("is a frame type this build acts on", () => {
    expect(isFrameType(FRAME.voice)).toBe(true);
  });

  it("survives the frame codec WITHOUT being parsed as JSON", () => {
    // The whole exception this frame exists for. `decodeFrame` hands the payload
    // back as bytes; a JSON parse would have thrown on the first Opus packet
    // that happened not to be valid UTF-8.
    const bytes = speech();
    const payload = encodeVoice({ codec: VOICE_CODEC.opus, bytes });
    const frame = decodeFrame(
      encodeFrameBytes(
        { type: FRAME.voice, seq: 7, ack: 0, tick: 99 },
        payload,
      ),
    );
    expect(frame).not.toBeNull();
    expect(frame!.seq).toBe(7);
    expect(frame!.tick).toBe(99);
    expect(frame!.payload).toBeInstanceOf(Uint8Array);
    expect([...decodeVoice(frame!.payload)!.bytes]).toEqual([...bytes]);
  });

  it("hands back a COPY, so a reused datagram cannot rewrite queued speech", () => {
    // The lifetime bug this copy exists to prevent: the payload outlives its
    // callback (it is queued for a decoder, or relayed to seven listeners), and
    // a view over a buffer `node:dgram` reuses would play whatever landed there
    // next — a fault that sounds like a broken codec.
    const frame = encodeFrameBytes(
      { type: FRAME.voice, seq: 1, ack: 0, tick: 1 },
      encodeVoice({ codec: VOICE_CODEC.opus, bytes: speech(8) }),
    );
    const decoded = decodeFrame(frame)!;
    const held = decoded.payload as Uint8Array;
    const before = [...held];
    // Scribble over the original buffer, exactly as a socket reusing it would.
    new Uint8Array(frame).fill(0xee, HEADER_BYTES);
    expect([...held]).toEqual(before);
  });
});

describe("the numbers the rest of the design is priced against", () => {
  it("cuts speech into 20 ms frames at the voice sample rate", () => {
    expect(VOICE_FRAME_SAMPLES).toBe(960);
  });

  it("puts a talking client at 50 packets a second", () => {
    // What `PEER_PACKET_RATE` in server/net/hub.ts has to have room for on top
    // of 60 inputs and 20 acks — see the arithmetic in that constant's comment.
    expect(VOICE_PACKET_RATE).toBe(50);
  });
});
