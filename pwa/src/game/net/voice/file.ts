// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// A FILE INSTEAD OF A MICROPHONE — the developer's way to put a KNOWN signal
// through the comms and hear what comes out the far end.
//
// **WHY THIS EXISTS.** Everything else in this feature can be tested from CI
// except the part that matters most: what a person actually hears. That test
// needs two machines, two people and two microphones, and it is not repeatable —
// nobody says the same sentence twice at the same volume. A file is the missing
// instrument. Point one machine at a .wav or .mp3 and the input becomes exact
// and repeatable, so the questions that were previously a matter of opinion get
// answers you can compare between two runs: is it intelligible, is the jitter
// buffer clicking, did the gate cut the first syllable, is the level right, does
// the waveform on the HUD look like the sound.
//
// **IT IS A PROVIDER, NOT A HOOK INTO THE MICROPHONE**, and that is the whole
// reason the seam in `codecs.ts` was written before it was needed: this file adds
// a `VoiceProvider` and changes nothing else. The wire does not know, the session
// does not know, the jitter buffer does not know, and the listener's HUD draws
// the same card it always would. Whatever this puts on the wire is what a
// microphone would have put there — which is precisely what makes it a valid
// instrument rather than a parallel code path that proves things about itself.
//
// **AND IT SHARES THE ENCODER, DELIBERATELY** (`opus-encode.ts`). A test tool
// with its own encoder tests its own encoder.
//
// **DEVELOPER TOOLING.** Gated on `__DEV_TOOLS__` at its one call site, so the
// store build does not contain it. It is reached by `?voice=<url>` or
// `window.__voiceFile(url)` — see `docs/configuration.md`.
//
// ---
//
// **ON "BYTE-IDENTICAL OUTPUT", WHICH IS THE FIRST THING ANYBODY ASKS AND IS
// HALF POSSIBLE.**
//
// Opus is a LOSSY codec. Encode → decode does not return the samples that went
// in, and no setting makes it: what comes out is a perceptual reconstruction, so
// comparing input and output audio byte-for-byte will always fail and proves
// nothing when it does.
//
// What IS byte-identical, and is worth pinning, is the PACKET STREAM: the bytes
// this encoder emitted must arrive at the far end's decoder unchanged and in
// order. That covers everything the game is actually responsible for — the
// framing, the 4-byte sub-header, the seat stamp, the relay, the transport, the
// jitter buffer's ordering — and it is asserted over a real session in
// `tests/engine/net_voice_test.ts`. The codec itself is Chromium's; the wire is
// ours.
//
// The audio can still be judged, just not by equality. `tap.ts` writes what a
// listener DECODED to a .wav you can open beside the source file: same length,
// same envelope, same words. For a numeric answer use correlation or RMS error
// against the source, never a hash — and expect a digest of the encoded stream
// to be stable only for one Chromium build, since libopus' output is
// deterministic for a fixed version and settings and Electron upgrades move
// both.

import { warn } from "@game/core";

import { describeError } from "@ui/lib/describe-error.ts";

import {
  VOICE_CODEC,
  VOICE_FRAME_MS,
  VOICE_FRAME_SAMPLES,
  VOICE_SAMPLE_RATE,
} from "@game/wire/voice.ts";

import type {
  VoicePcm,
  VoiceProvider,
  VoiceSource,
  VoiceSourceOptions,
} from "./codecs.ts";
import { opusProvider } from "./opus.ts";
import { openOpusEncoder } from "./opus-encode.ts";

/** What the file source is currently pointed at, or null for none. Module state
 * because the provider is selected by the registry and cannot be handed an
 * argument — see `useVoiceFile`. */
let source: string | Blob | null = null;
/** Play the file once and stop, rather than looping. */
let once = false;

/**
 * Point the file source at an audio file, and prefer it over the microphone.
 *
 * A URL (same-origin, or any the page can `fetch`) or a `Blob`/`File` from a
 * picker. Null puts the microphone back. Takes effect on the next open, so a
 * caller mid-session should turn voice off and on again — which the debug hook
 * does for you.
 */
export function useVoiceFile(
  next: string | Blob | null,
  options: { once?: boolean } = {},
): void {
  source = next;
  once = options.once === true;
}

/** Whether a file is currently standing in for the microphone. */
export function voiceFileActive(): boolean {
  return source !== null;
}

async function available(): Promise<boolean> {
  // Two things, and the second is why this cannot simply answer `true`: there
  // has to be a file to play, and the platform still has to be able to ENCODE
  // Opus. The second is exactly what `opusProvider.available()` asks, so it is
  // asked rather than restated — a file source on a machine with no encoder is
  // just as unable to talk as a microphone is.
  if (source === null) return false;
  return opusProvider.available();
}

async function createSource(
  options: VoiceSourceOptions,
): Promise<VoiceSource | null> {
  const held = source;
  if (held === null) return null;
  let transmitting = false;
  let level = 0;
  let closed = false;
  let timer = 0;
  /** Where in the decoded file the next frame comes from, in samples. */
  let at = 0;

  try {
    const bytes =
      held instanceof Blob
        ? await held.arrayBuffer()
        : await (await fetch(held)).arrayBuffer();

    // DECODED BY THE PLATFORM, which is what buys .wav AND .mp3 (and .ogg, and
    // .flac, and anything else the browser reads) for no code at all. It also
    // RESAMPLES to the context's rate on the way, which is the awkward half of
    // this job done for free: a 44.1 kHz mp3 has to reach a 48 kHz encoder, and
    // hand-written resampling is exactly the sort of thing that would make the
    // instrument itself the reason the audio sounded wrong.
    const context = new AudioContext({ sampleRate: VOICE_SAMPLE_RATE });
    const decoded = await context.decodeAudioData(bytes);
    // MIXED DOWN TO MONO, because that is what the encoder is configured for.
    // Averaging the channels rather than taking the left one: a file mastered
    // with the voice panned right would otherwise arrive silent, which looks
    // exactly like a broken instrument.
    const mono = new Float32Array(decoded.length) as VoicePcm;
    for (let channel = 0; channel < decoded.numberOfChannels; channel++) {
      const data = decoded.getChannelData(channel);
      for (let i = 0; i < mono.length; i++) {
        mono[i] = (mono[i] ?? 0) + (data[i] ?? 0);
      }
    }
    if (decoded.numberOfChannels > 1) {
      for (let i = 0; i < mono.length; i++) {
        mono[i] = (mono[i] ?? 0) / decoded.numberOfChannels;
      }
    }
    // The context was only ever a decoder; it is not part of the graph.
    void context.close().catch(() => {});

    const encoder = openOpusEncoder({
      onPacket: (packet) => options.onPacket(packet, false),
      onError: options.onError,
      wanted: () => !closed && transmitting,
    });
    if (!encoder) return null;

    warn(
      `voice: streaming a file instead of the microphone — ` +
        `${decoded.duration.toFixed(1)}s, ${decoded.numberOfChannels}ch ` +
        `@${decoded.sampleRate}Hz${once ? "" : ", looping"}`,
    );

    /**
     * Hand the encoder one frame, on the wall clock.
     *
     * A TIMER rather than an audio-graph node, and it is the one place this
     * source deliberately differs from the microphone: there is no device to
     * pace it, so `VOICE_FRAME_MS` of speech is pushed every `VOICE_FRAME_MS`.
     * A timer drifts against real time by a few percent, which does not matter
     * at all here — the listener's jitter buffer is built for exactly that, and
     * the encoder's timestamps come from the SAMPLES rather than from this
     * clock, so the stream stays gap-free however late a tick fires.
     */
    const pump = () => {
      if (closed) return;
      const frame = new Float32Array(VOICE_FRAME_SAMPLES) as VoicePcm;
      const remaining = mono.length - at;
      if (remaining <= 0) {
        if (once) {
          // The utterance's full stop, so the listener's card closes at once
          // rather than waiting out the silence timeout.
          options.onPacket(new Uint8Array(0), true);
          closed = true;
          return;
        }
        at = 0;
      }
      const take = Math.min(VOICE_FRAME_SAMPLES, mono.length - at);
      frame.set(mono.subarray(at, at + take));
      // A short final frame is ZERO-PADDED rather than skipped: the encoder is
      // configured for one frame size, and the padding is 20 ms of silence at
      // the seam of a loop.
      at += take;
      const gain = Math.max(0, Math.min(2, options.gain()));
      let sum = 0;
      for (let i = 0; i < frame.length; i++) sum += frame[i]! * frame[i]!;
      // The same meter the microphone reports, measured the same way, so the
      // HUD bar and the settings-page level mean the same thing whichever
      // source is behind them.
      level = Math.min(1, Math.sqrt(sum / frame.length) * gain);
      if (transmitting) encoder.encode(frame, gain);
    };

    timer = window.setInterval(pump, VOICE_FRAME_MS);

    return {
      codec: VOICE_CODEC.opus,
      get transmitting() {
        return transmitting;
      },
      setTransmitting(on) {
        if (closed || transmitting === on) return;
        transmitting = on;
        if (!on) options.onPacket(new Uint8Array(0), true);
      },
      level() {
        return level;
      },
      close() {
        if (closed) return;
        closed = true;
        transmitting = false;
        window.clearInterval(timer);
        encoder.close();
      },
    };
  } catch (err) {
    window.clearInterval(timer);
    options.onError(describeError(err));
    return null;
  }
}

/**
 * THE FILE PROVIDER.
 *
 * `openMic` is true because it does measure its input, so the open-mic gate
 * works against a file — which is itself a useful test: a recording with pauses
 * in it will show you exactly where the gate opens and closes.
 */
export const fileVoiceProvider: VoiceProvider = {
  // THE SAME CODEC ID AS THE MICROPHONE, because it IS the same codec: this
  // provider swaps where the samples come from, not what happens to them. A
  // listener cannot tell the two apart, which is the property that makes the
  // instrument worth having.
  id: VOICE_CODEC.opus,
  name: "FILE",
  openMic: true,
  available,
  createSource,
  // Never reached — the registry only ever asks the provider whose id matches an
  // arriving packet, and the mic provider is ahead of this one in the list for
  // `VOICE_CODEC.opus`. Declared rather than thrown so the seam stays one shape.
  createDecoder: (options) => opusProvider.createDecoder(options),
};

/** How many samples of speech one frame carries — re-exported so a test or a
 * script can reason about a file's length in frames without importing the wire.
 */
export const VOICE_FILE_FRAME_SAMPLES = VOICE_FRAME_SAMPLES;
export { VOICE_SAMPLE_RATE };
