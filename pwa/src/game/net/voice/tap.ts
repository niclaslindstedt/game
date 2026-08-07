// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// SEEING WHAT CAME OUT — the receive-side recorder, and the other half of the
// file source's instrument.
//
// `file.ts` puts a known signal IN. This writes down what arrived, so the two can
// be put side by side. It records two different things, because the two questions
// people ask about a voice path have two different answers:
//
//  1. **THE PACKETS**, exactly as they arrived: per seat, in order, with their
//     lengths and a digest. This is the half that CAN be compared byte-for-byte,
//     and it is the half the game is actually responsible for — the framing, the
//     sub-header, the seat stamp, the relay, the transport, the ordering. If the
//     bytes the sender's encoder emitted are the bytes the listener's decoder was
//     handed, everything between them is correct.
//  2. **THE DECODED AUDIO**, as a .wav. This is the half that CANNOT be compared
//     byte-for-byte and never will be: Opus is lossy, so what comes out is a
//     perceptual reconstruction of what went in. Open it beside the source file
//     instead — same length, same envelope, same words — or correlate the two
//     numerically. A hash of it proves nothing except which Chromium built it.
//
// **IT IS OFF UNTIL ASKED FOR, and it is bounded.** Recording every syllable of
// every session would be both a memory leak and a thing this game has no business
// doing; `startVoiceTap` is a developer hook, it holds at most `MAX_SECONDS` of
// audio per seat, and it forgets everything when it stops.
//
// Developer tooling: reached through `window.__voiceTap()` and folded out of a
// store build with the rest of it (`__DEV_TOOLS__`).

import { warn } from "@game/core";

import { VOICE_SAMPLE_RATE, type VoicePacket } from "@game/wire/voice.ts";

/**
 * How much decoded audio is kept per seat, in seconds.
 *
 * Thirty is several sentences — long enough to judge intelligibility, a gate's
 * behaviour and a jitter buffer's clicking — and 5.8 MB of `Float32Array` per
 * seat, which is a bound rather than a leak. Past it the oldest audio is
 * dropped, so a tap left running records the last half minute rather than
 * growing until the tab dies.
 */
const MAX_SECONDS = 30;
const MAX_SAMPLES = MAX_SECONDS * VOICE_SAMPLE_RATE;

type SeatTap = {
  /** Every packet's length, in arrival order. */
  lengths: number[];
  /** A rolling digest over every packet byte, in arrival order — the number to
   * compare between two runs, or between the sender's log and this one. */
  digest: number;
  bytes: number;
  /** The decoded audio, oldest first, capped at `MAX_SAMPLES`. */
  pcm: Float32Array[];
  samples: number;
};

const taps = new Map<number, SeatTap>();
let recording = false;

/** What one seat's tap knows, as plain data. */
export type VoiceTapReport = {
  seat: number;
  packets: number;
  bytes: number;
  /** Mean packet size — the quickest read on whether the bitrate is what was
   * asked for (24 kbit/s at 20 ms frames is ~60 bytes). */
  meanBytes: number;
  /** FNV-1a over every packet byte in arrival order. Two runs of the same file
   * on the same build produce the same number; a wire that corrupted or
   * reordered a packet does not. */
  digest: string;
  /** Seconds of audio actually decoded and played. */
  seconds: number;
};

function tapFor(seat: number): SeatTap {
  let held = taps.get(seat);
  if (!held) {
    held = { lengths: [], digest: 0x811c9dc5, bytes: 0, pcm: [], samples: 0 };
    taps.set(seat, held);
  }
  return held;
}

/** Begin recording. Idempotent; starting again clears what was held. */
export function startVoiceTap(): void {
  taps.clear();
  recording = true;
  warn("voice: tap recording — window.__voiceTap() to read it back");
}

/** Stop, and forget. */
export function stopVoiceTap(): void {
  recording = false;
  taps.clear();
}

export function voiceTapRunning(): boolean {
  return recording;
}

/**
 * One arriving packet, before it is decoded.
 *
 * Called from the playback path with the bytes as the decoder will receive them —
 * which is the point: this is the far end of the byte-identity claim, so it must
 * record what was HANDED OVER rather than anything reconstructed afterwards.
 */
export function tapVoicePacket(packet: VoicePacket): void {
  if (!recording) return;
  const tap = tapFor(packet.seat);
  tap.lengths.push(packet.bytes.byteLength);
  tap.bytes += packet.bytes.byteLength;
  // FNV-1a, over the bytes in arrival order. Cheap, order-sensitive (which is
  // the property being tested) and good enough to notice a single flipped bit.
  let hash = tap.digest;
  for (const byte of packet.bytes) {
    hash = ((hash ^ byte) * 0x01000193) >>> 0;
  }
  tap.digest = hash;
}

/** One decoded frame, as it is about to be played. */
export function tapVoicePcm(seat: number, pcm: Float32Array): void {
  if (!recording) return;
  const tap = tapFor(seat);
  tap.pcm.push(pcm);
  tap.samples += pcm.length;
  // Bounded from the FRONT: a tap left running keeps the most recent audio,
  // because what somebody is investigating is almost always what just happened.
  while (tap.samples > MAX_SAMPLES && tap.pcm.length > 1) {
    tap.samples -= tap.pcm.shift()?.length ?? 0;
  }
}

/** What every seat's tap holds, for printing at a console. */
export function voiceTapReport(): VoiceTapReport[] {
  return [...taps.entries()]
    .sort(([a], [b]) => a - b)
    .map(([seat, tap]) => ({
      seat,
      packets: tap.lengths.length,
      bytes: tap.bytes,
      meanBytes: tap.lengths.length
        ? Math.round(tap.bytes / tap.lengths.length)
        : 0,
      digest: tap.digest.toString(16).padStart(8, "0"),
      seconds: Math.round((tap.samples / VOICE_SAMPLE_RATE) * 100) / 100,
    }));
}

/**
 * One seat's decoded audio as a 16-bit mono WAV, or null if nothing was heard.
 *
 * A WAV rather than the raw floats because the whole purpose is to OPEN it —
 * beside the source file, in any player or editor on the machine — and 16-bit
 * PCM is the format everything reads. The conversion is the only lossy step
 * this file performs and it is inaudible; the samples it is fed are already the
 * far end of a lossy codec.
 */
export function voiceTapWav(seat: number): Blob | null {
  const tap = taps.get(seat);
  if (!tap || tap.samples === 0) return null;
  const samples = tap.samples;
  const buffer = new ArrayBuffer(44 + samples * 2);
  const view = new DataView(buffer);
  const ascii = (at: number, text: string) => {
    for (let i = 0; i < text.length; i++)
      view.setUint8(at + i, text.charCodeAt(i));
  };
  ascii(0, "RIFF");
  view.setUint32(4, 36 + samples * 2, true);
  ascii(8, "WAVE");
  ascii(12, "fmt ");
  view.setUint32(16, 16, true); // PCM header length
  view.setUint16(20, 1, true); // format: PCM
  view.setUint16(22, 1, true); // channels: mono
  view.setUint32(24, VOICE_SAMPLE_RATE, true);
  view.setUint32(28, VOICE_SAMPLE_RATE * 2, true); // byte rate
  view.setUint16(32, 2, true); // block align
  view.setUint16(34, 16, true); // bits per sample
  ascii(36, "data");
  view.setUint32(40, samples * 2, true);
  let at = 44;
  for (const frame of tap.pcm) {
    for (const sample of frame) {
      // Clamped before scaling: a decoder may hand back a sample a shade past
      // full scale, and wrapping it would be an audible click rather than the
      // clip it should be.
      const clamped = sample > 1 ? 1 : sample < -1 ? -1 : sample;
      view.setInt16(at, Math.round(clamped * 32767), true);
      at += 2;
    }
  }
  return new Blob([buffer], { type: "audio/wav" });
}
