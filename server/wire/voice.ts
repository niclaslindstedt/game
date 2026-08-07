// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// VOICE — the frame's own payload format, and the one place the bytes of a
// spoken syllable are made and read.
//
// **THIS IS THE WIRE'S ONE BINARY PAYLOAD, and the exception is deliberate.**
// Everything else on this wire is JSON (`codec.ts` explains why, and the answer
// is still right: ~120 live engine shapes have no business being hand-packed).
// Voice is the case that argument does not cover. Its payload is ALREADY a
// compressed bitstream — an Opus packet is 60-ish bytes of entropy — so putting
// it through JSON means base64, which inflates every syllable by a third for
// nothing, and 50 packets a second per speaker is exactly the traffic where a
// third matters. There is no schema drift risk to weigh against it either: this
// payload is four bytes of header and an opaque blob, which is a shape that
// cannot grow a field by accident.
//
// **THE PAYLOAD NAMES ITS CODEC, AND THAT IS WHAT MAKES A SECOND
// IMPLEMENTATION POSSIBLE.** The bytes after the header are meaningless without
// knowing who made them, and "the build is the same on both ends so it must be
// the same codec" is FALSE even though the handshake pins the build: which
// implementation a machine actually got depends on what that machine can do —
// whether the browser engine exposes an encoder, whether a Steam client is
// running, whether the player's own device answered. So the codec travels with
// every packet and a listener that cannot decode one says so (the speaker's
// card reads UNHEARD) rather than sitting in silence that looks like a mute.
//
// **THE SEAT IS THE SESSION'S TO WRITE, NEVER THE SPEAKER'S TO CLAIM.** A
// client sends `VOICE_SEAT_UNSET` and the session stamps the seat it admitted
// that client into, exactly as `FRAME.command` takes its acting hero from the
// admitted seat rather than from a field on the frame. A voice packet that
// could name its own seat would let anybody wear anybody's face and name on
// seven other players' screens, which is a worse hole than it first sounds:
// the HUD draws a PORTRAIT off the seat, so spoofing one is impersonation with
// art on it.
//
// A LEAF, like every other module in `server/wire/` — no engine import, no app
// import, nothing but numbers and two total functions.

/**
 * WHICH IMPLEMENTATION MADE A PACKET'S BYTES.
 *
 * One byte on the wire, and an OPEN registry rather than a closed union of
 * "the codec we ship": the whole point of naming it is that the answer is
 * expected to grow, and a build that meets a number it does not know must
 * behave itself. See `pwa/src/game/net/voice/codecs.ts` for the provider seam
 * these ids are the wire half of.
 *
 * `opus` is what ships: WebCodecs' own Opus encoder, which every Chromium the
 * shell embeds has, at `VOICE_SAMPLE_RATE` mono in `VOICE_FRAME_MS` frames.
 *
 * `steam` is RESERVED, unallocated, and named here on purpose — it is the
 * number a future `ISteamUser::GetVoice` provider takes, so the day that lands
 * it is a new provider and a `case`, not a protocol change with a version bump
 * and a refusal for everybody mid-session. Nothing may send it yet:
 * `steamworks.js` binds no voice API at all today (no `voice` namespace, no
 * `friends`), so reaching it means an N-API addon and the prebuilt binaries
 * that make this shell installable without a Rust toolchain — the same trade
 * `electron/src/steam.ts` records for the missing networking sockets.
 */
export const VOICE_CODEC = {
  opus: 1,
  /** Reserved for ISteamUser voice. Never sent by this build — see above. */
  steam: 2,
} as const;

export type VoiceCodecId = (typeof VOICE_CODEC)[keyof typeof VOICE_CODEC];

/** Bytes of sub-header before a voice packet's opaque payload. */
export const VOICE_HEADER_BYTES = 4;

/**
 * What a client writes in the seat byte: "I do not get to say."
 *
 * 0xFF rather than 0 or -1, because 0 is the HOST's real seat and a bug that
 * defaulted to it would put every stranger's voice behind the host's portrait
 * — the single most confusing possible failure. An out-of-range value is
 * unmistakable in a log and cannot be a real seat at any party size.
 */
export const VOICE_SEAT_UNSET = 0xff;

/** Bit 0 of the flags byte: the last packet of this utterance. A courtesy, not
 * a promise — a released talk key that never arrives is covered by the
 * listener's own silence timeout, because the packet carrying it may be the one
 * the network drops. */
export const VOICE_FLAG_LAST = 1;

/**
 * The sample rate every provider speaks, in Hz.
 *
 * 48 kHz because that is Opus' native rate and WebCodecs' default: anything
 * else means a resample on both ends to reach the same place. It is also what
 * an `AudioContext` on a desktop almost always runs at, so the capture graph
 * usually costs no conversion at all.
 */
export const VOICE_SAMPLE_RATE = 48_000;

/**
 * How much speech is in one packet, in ms.
 *
 * 20 ms is the voice-chat default everywhere (Opus' own default frame, every
 * SIP stack, Steam's own voice) and it is a three-way trade: shorter frames
 * mean more packets for the same speech (each with 16 bytes of frame header
 * and 4 of ours) and longer frames mean a listener waits longer before hearing
 * a syllable start. At 20 ms one second of speech is 50 packets, which is what
 * `VOICE_PACKET_RATE` below prices, and the mouth-to-ear delay this contributes
 * is small next to the network's own.
 */
export const VOICE_FRAME_MS = 20;

/** Samples in one frame, at the rate above — the block size the capture graph
 * accumulates and the encoder is fed. */
export const VOICE_FRAME_SAMPLES = (VOICE_SAMPLE_RATE * VOICE_FRAME_MS) / 1000;

/**
 * What a voice stream is asked to cost, in bits per second.
 *
 * 24 kbit/s is comfortably transparent for speech in mono Opus (Opus' own
 * recommendation for wideband voice starts around 16), which puts a packet at
 * roughly 60 bytes and a talking player at ~3 KB/s each way before framing.
 * The number that actually matters is the HOST's, because a listen server
 * relays every speaker to every listener: eight people all talking at once is
 * this figure times 8×7, and it is why transmitting is push-to-talk by default
 * and why silence sends nothing at all rather than sending quiet frames.
 */
export const VOICE_BITRATE = 24_000;

/** Packets one talking client sends per second — what the admitted-peer budget
 * in `server/net/hub.ts` has to price, and the only reason this constant is in
 * the wire rather than in the app. */
export const VOICE_PACKET_RATE = 1000 / VOICE_FRAME_MS;

/**
 * The most a single voice packet's payload may be, in bytes.
 *
 * A SECURITY BOUND rather than a codec fact, which is why it is generous: it
 * has to fit any provider's 20 ms of speech (Opus at this bitrate is ~60 bytes;
 * Steam's own codec is bigger, and a future provider at a higher bitrate
 * bigger still) while refusing a client that has noticed voice is a channel
 * with 50 packets a second of allowance and would like to push a megabyte
 * through each one. Everything above the decoder — the relay, the jitter
 * buffer, the per-speaker queue — sizes itself off arriving packets, so the cap
 * is what keeps all of it bounded by arithmetic instead of by trust.
 */
export const MAX_VOICE_BYTES = 512;

/** One voice packet, decoded far enough to route and no further. The `bytes`
 * are the provider's own and are never looked inside here. */
export type VoicePacket = {
  /** The speaker's seat, or `VOICE_SEAT_UNSET` on the way IN to a session. */
  seat: number;
  codec: number;
  /** The last packet of an utterance (`VOICE_FLAG_LAST`). */
  last: boolean;
  bytes: Uint8Array;
};

/**
 * Pack one voice packet.
 *
 * The bytes are COPIED into the result rather than referenced, because the
 * caller's buffer is usually a codec's reused output view — an encoder hands
 * the same memory back for the next frame, and a queue holding a view of it
 * would play the same 20 ms of speech for as long as somebody kept talking.
 */
export function encodeVoice(packet: {
  seat?: number;
  codec: number;
  last?: boolean;
  bytes: Uint8Array;
}): Uint8Array {
  const body = packet.bytes.subarray(0, MAX_VOICE_BYTES);
  const out = new Uint8Array(VOICE_HEADER_BYTES + body.byteLength);
  out[0] = packet.seat ?? VOICE_SEAT_UNSET;
  out[1] = packet.codec & 0xff;
  out[2] = packet.last ? VOICE_FLAG_LAST : 0;
  // Byte 3 stays zero — room for a field, and it keeps the opaque payload
  // 4-byte aligned so a decoder can hand it straight to a typed-array view.
  out.set(body, VOICE_HEADER_BYTES);
  return out;
}

/**
 * Read one voice packet, or null if these bytes are not one.
 *
 * NEVER THROWS, and every refusal is a null — the same contract `decodeFrame`
 * keeps, for the same reason: these bytes arrive from an open UDP port, and a
 * malformed one is an ordinary event that must not be able to stop a tick. Two
 * refusals matter beyond "too short": an EMPTY payload (a header with no
 * speech behind it, which every decoder below would have to special-case) and
 * one PAST THE CAP, which is refused here rather than trimmed — a packet that
 * big is not a packet this build made, and quietly playing the first 512 bytes
 * of it would be inventing content for a stranger.
 */
export function decodeVoice(payload: unknown): VoicePacket | null {
  const bytes =
    payload instanceof Uint8Array
      ? payload
      : payload instanceof ArrayBuffer
        ? new Uint8Array(payload)
        : null;
  if (!bytes) return null;
  if (bytes.byteLength <= VOICE_HEADER_BYTES) return null;
  const length = bytes.byteLength - VOICE_HEADER_BYTES;
  if (length > MAX_VOICE_BYTES) return null;
  return {
    seat: bytes[0] ?? VOICE_SEAT_UNSET,
    codec: bytes[1] ?? 0,
    last: ((bytes[2] ?? 0) & VOICE_FLAG_LAST) !== 0,
    bytes: bytes.subarray(VOICE_HEADER_BYTES),
  };
}

/**
 * Rewrite a packet's seat in place, and hand back the same bytes.
 *
 * The session's one job on the forwarding path, and it is a byte write rather
 * than a decode-and-re-encode on purpose: relaying voice is the hottest thing
 * a session does per packet (one speaker, seven listeners, fifty times a
 * second), and the only field that has to change is this one. The frame around
 * it — its header, its sequence, its tick — travels exactly as it arrived.
 */
export function stampVoiceSeat(payload: Uint8Array, seat: number): Uint8Array {
  payload[0] = seat & 0xff;
  return payload;
}
