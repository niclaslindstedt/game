// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE OPUS ENCODER, on its own — the half two capture sources share.
//
// It was extracted from `opus.ts` the moment there was a SECOND thing to feed
// it: the file source (`file.ts`) that streams a .wav or .mp3 into the comms for
// testing. Both want the identical encoder — the same bitrate, the same frame
// duration, the same monotonic timestamp discipline — and the whole point of the
// file source is that what goes on the wire is what a microphone would have put
// there. A second encoder configured beside this one would be a test whose
// subject is the test's own copy of the code.
//
// **THE TIMESTAMP IS SAMPLE-DERIVED, NEVER A CLOCK.** WebCodecs uses it to
// order and to pace, so it has to be monotonic and gap-free. Counting samples
// gives exactly that; `performance.now()` would drift against the number of
// samples actually handed over (an audio device's clock is its own) and a frame
// whose timestamp went backwards is one the encoder rejects outright. It is also
// what makes the file source repeatable: the same file produces the same
// timestamps every run, because they are a function of the samples and nothing
// else.

import { warn } from "@game/core";

import { describeError } from "@ui/lib/describe-error.ts";

import {
  MAX_VOICE_BYTES,
  VOICE_BITRATE,
  VOICE_FRAME_MS,
  VOICE_SAMPLE_RATE,
} from "@game/wire/voice.ts";

import type { VoicePcm } from "./codecs.ts";

/** The config both the encoder and every decoder are built from — one object,
 * so the two can never be configured to disagree about the stream between
 * them. */
export const OPUS_CONFIG = {
  codec: "opus",
  sampleRate: VOICE_SAMPLE_RATE,
  numberOfChannels: 1,
} as const;

export type OpusEncoder = {
  /**
   * Encode one frame of mono PCM at `VOICE_SAMPLE_RATE`.
   *
   * `gain` is applied IN PLACE before encoding, which is why the caller must own
   * the buffer: the meter and the wire have to agree about how loud this frame
   * was, so the multiply happens once, here, rather than being done twice with
   * two different rounding stories.
   */
  encode(pcm: VoicePcm, gain: number): void;
  close(): void;
};

/**
 * Open an Opus encoder that hands finished packets to `onPacket`.
 *
 * `wanted()` is asked at the moment a packet is READY rather than when its
 * samples were handed over, and that ordering is load-bearing for push-to-talk:
 * the encoder is a pipeline, so up to a frame or two are in flight at any
 * moment, and a talk key released in that window must not put them on the wire.
 */
export function openOpusEncoder(options: {
  onPacket(bytes: Uint8Array): void;
  onError(detail: string): void;
  /** Should a finished packet actually be sent? See above. */
  wanted(): boolean;
}): OpusEncoder | null {
  let closed = false;
  /** Microseconds of speech encoded so far — see the header. */
  let stamp = 0;
  try {
    const encoder = new AudioEncoder({
      output: (chunk) => {
        if (closed || !options.wanted()) return;
        if (chunk.byteLength > MAX_VOICE_BYTES) {
          // Cannot happen at this bitrate and frame size, and is dropped rather
          // than trimmed if it ever does: the far end refuses an oversized
          // packet anyway (`MAX_VOICE_BYTES`), so sending a truncated one would
          // spend the bandwidth to be rejected.
          warn(`voice: dropping ${chunk.byteLength}-byte packet (over cap)`);
          return;
        }
        const bytes = new Uint8Array(chunk.byteLength);
        chunk.copyTo(bytes);
        options.onPacket(bytes);
      },
      error: (err) => options.onError(describeError(err)),
    });
    encoder.configure({
      ...OPUS_CONFIG,
      bitrate: VOICE_BITRATE,
      // Ask for OUR frame size explicitly, in microseconds. Opus' own default is
      // 20 ms, but `VOICE_FRAME_MS` is the number the whole design is priced
      // against (the packet rate the hub budgets, the jitter buffer's steps), so
      // it is stated rather than inherited.
      opus: { frameDuration: VOICE_FRAME_MS * 1000 },
    });
    return {
      encode(pcm, gain) {
        if (closed || pcm.length === 0) return;
        if (gain !== 1) {
          for (let i = 0; i < pcm.length; i++) pcm[i] = (pcm[i] ?? 0) * gain;
        }
        const data = new AudioData({
          format: "f32-planar",
          sampleRate: VOICE_SAMPLE_RATE,
          numberOfFrames: pcm.length,
          numberOfChannels: 1,
          timestamp: stamp,
          data: pcm,
        });
        stamp += Math.round((pcm.length * 1_000_000) / VOICE_SAMPLE_RATE);
        try {
          encoder.encode(data);
        } finally {
          // CLOSED WHATEVER HAPPENS. `AudioData` holds a reference the platform
          // does not collect on its own, and one leaked per 20 ms is a leak with
          // a units-per-second rate on it.
          data.close();
        }
      },
      close() {
        if (closed) return;
        closed = true;
        try {
          if (encoder.state !== "closed") encoder.close();
        } catch {
          // Already closed by its own error callback.
        }
      },
    };
  } catch (err) {
    options.onError(describeError(err));
    return null;
  }
}
