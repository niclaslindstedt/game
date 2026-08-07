// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// FRAMING — the one place bytes are made and the one place they are read.
//
// A frame is a fixed 16-byte header followed by a payload:
//
//   u8   type        (FRAME.*)
//   u8   reserved    (0 — keeps the header 4-byte aligned and leaves room)
//   u16  reserved    (0)
//   u32  seq
//   u32  ack
//   u32  tick
//   …    payload
//
// THE HEADER IS FIXED-SIZE AND VALIDATED BEFORE ANYTHING IS READ, and that is
// a security property rather than a style: the direct path opens a UDP socket,
// which means these bytes eventually arrive from strangers. A decoder that reads a length
// out of the payload before checking the buffer is long enough is the classic
// over-read, and it is much easier to never write than to find later. So
// `decodeFrame` refuses a short buffer, refuses an unknown type, and refuses a
// payload that does not parse — returning null every time rather than throwing,
// because a malformed packet is an ordinary event on an open port and must not
// be able to stop a tick.
//
// **The payload is JSON, WITH ONE EXCEPTION, and that is a deliberate decision
// worth stating
// plainly.** Hand-rolled binary packing is the obvious alternative, and it is right
// that the shapes are known at compile time — but there are ~120 of them, they
// are the engine's own live types, and a hand-written packer per type is a
// second definition of every one that drifts silently the moment a def grows a
// field. The framing above is the seam that makes packing a later, local
// change: both ends already speak "an ArrayBuffer with a typed header", the
// transferable path and the zero-copy `postMessage` are already in place, and
// swapping `JSON.stringify` for a packer touches these two functions and
// nothing else. Measure first (the snapshot rate is the risk) and pack what the
// measurement says is expensive.
//
// **AND THE EXCEPTION IS `FRAME.voice`, which is what that last sentence
// looks like when it comes true.** A voice packet's payload is already a
// compressed bitstream, so the argument above (a hand-written packer per shape
// is a second definition that drifts) simply does not apply — there is no
// shape, only bytes, and JSON's price for carrying bytes is base64's extra
// third on 50 packets a second per speaker. So voice frames carry their payload
// RAW: `encodeFrameBytes` makes them and `decodeFrame` hands the payload back
// as a `Uint8Array` instead of parsing it. `server/wire/voice.ts` owns what is
// inside, and nothing here looks.

import { FRAME, isFrameType, type FrameType } from "./frames.ts";
import type { FrameHeader } from "./protocol.ts";

/** Bytes before the payload. Read `decodeFrame` before changing it. */
export const HEADER_BYTES = 16;

const encoder = new TextEncoder();
const decoder = new TextDecoder();

/** A decoded frame: its header, and whatever its payload parsed to. */
export type Frame = FrameHeader & { payload: unknown };

/**
 * Pack one frame. The payload is any JSON-serializable value; `undefined`
 * encodes as an empty payload, which decodes back to `undefined` rather than
 * to `null` — the difference matters for a delta, where an absent field and a
 * field explicitly set to null are different instructions.
 */
export function encodeFrame(
  header: FrameHeader,
  payload?: unknown,
): ArrayBuffer {
  return encodeFrameJson(
    header,
    payload === undefined ? undefined : JSON.stringify(payload),
  );
}

/**
 * Pack one frame whose payload has ALREADY been serialized.
 *
 * The session needs the payload's text for a second purpose — it keeps what it
 * sent, so an ack can re-baseline the client against it — and serializing the
 * same patch twice per publish per client is the one avoidable cost on the hot
 * path. So the string is produced once and handed to both.
 */
export function encodeFrameJson(
  header: FrameHeader,
  json?: string,
): ArrayBuffer {
  const body = json === undefined ? new Uint8Array(0) : encoder.encode(json);
  const buffer = new ArrayBuffer(HEADER_BYTES + body.byteLength);
  const view = new DataView(buffer);
  view.setUint8(0, header.type);
  // Bytes 1..3 stay zero. They are not padding for its own sake: the header is
  // read as u32s from byte 4 on, and an unaligned DataView read is measurably
  // slower on the hot path than a reserved byte is expensive.
  view.setUint32(4, header.seq >>> 0);
  view.setUint32(8, header.ack >>> 0);
  view.setUint32(12, header.tick >>> 0);
  new Uint8Array(buffer, HEADER_BYTES).set(body);
  return buffer;
}

/**
 * Pack one frame whose payload is RAW BYTES rather than JSON.
 *
 * `FRAME.voice` and nothing else — see the header. The bytes are copied into
 * the frame, which a voice packet's own `encodeVoice` has already done once;
 * the second copy is the price of one contiguous buffer to hand a socket, and
 * at 84 bytes a packet it is not a cost worth a scatter-gather API.
 */
export function encodeFrameBytes(
  header: FrameHeader,
  body: Uint8Array,
): ArrayBuffer {
  const buffer = new ArrayBuffer(HEADER_BYTES + body.byteLength);
  const view = new DataView(buffer);
  view.setUint8(0, header.type);
  view.setUint32(4, header.seq >>> 0);
  view.setUint32(8, header.ack >>> 0);
  view.setUint32(12, header.tick >>> 0);
  new Uint8Array(buffer, HEADER_BYTES).set(body);
  return buffer;
}

/**
 * Unpack one frame, or null if these bytes are not one.
 *
 * NEVER THROWS. Every refusal is a null: too short for a header, a type this
 * build does not know, or a payload that is not JSON. The caller's job is to
 * drop the packet and carry on — on the direct-connect path that is the
 * difference between an ignored stray datagram and a crashed session.
 */
export function decodeFrame(
  buffer: ArrayBuffer | ArrayBufferView,
): Frame | null {
  const bytes = toBytes(buffer);
  if (bytes.byteLength < HEADER_BYTES) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const type = view.getUint8(0);
  if (!isFrameType(type)) return null;
  const header: FrameHeader = {
    type: type as FrameType,
    seq: view.getUint32(4),
    ack: view.getUint32(8),
    tick: view.getUint32(12),
  };
  if (bytes.byteLength === HEADER_BYTES)
    return { ...header, payload: undefined };
  // THE ONE NON-JSON PAYLOAD. Copied rather than handed over as a view,
  // deliberately: what arrives here is a view over somebody else's buffer — a
  // datagram `node:dgram` may reuse, a transferred `ArrayBuffer` — and a voice
  // packet outlives its callback (it is queued for a decoder, or relayed to
  // seven listeners). A view would play whatever landed in that memory next,
  // which is a bug that sounds like a codec fault rather than a lifetime one.
  // 60-odd bytes a packet is not a copy worth avoiding.
  if (header.type === FRAME.voice) {
    return { ...header, payload: bytes.slice(HEADER_BYTES) };
  }
  let payload: unknown;
  try {
    payload = JSON.parse(
      decoder.decode(bytes.subarray(HEADER_BYTES)),
    ) as unknown;
  } catch {
    return null; // truncated or hostile — an ordinary event on an open port
  }
  return { ...header, payload };
}

/** A view over the same bytes, whatever container they arrived in. Copies
 * nothing: a `MessagePort` hands over an `ArrayBuffer`, `node:dgram` hands over
 * a `Buffer`, and both are the same bytes. */
function toBytes(buffer: ArrayBuffer | ArrayBufferView): Uint8Array {
  return buffer instanceof ArrayBuffer
    ? new Uint8Array(buffer)
    : new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
}
