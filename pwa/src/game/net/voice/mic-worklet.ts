// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE CAPTURE WORKLET — the one piece of this feature that runs on the audio
// thread, and the reason it is a string in a TypeScript file rather than a file
// of its own.
//
// An `AudioWorklet` module is loaded by URL and evaluated in a separate global
// scope with no bundler, no imports and no `window`. Every way of shipping one
// through Vite is a build-config commitment — an entry point, a `?url` asset, a
// worker plugin — and each of them has to survive three different builds (the
// dev server, the site build, and the copy `electron/scripts/bundle-web.mjs`
// stages into the desktop app). A `Blob` URL made at runtime survives all three
// by not involving the bundler at all, and the processor is forty lines with no
// dependencies, which is exactly the size where that trade is obviously right.
//
// **WHY A WORKLET AND NOT AN ANALYSER.** Two things have to happen per 20 ms of
// microphone input: it must be cut into frames of exactly `VOICE_FRAME_SAMPLES`
// (what the encoder is specified against), and its loudness must be measured.
// `ScriptProcessorNode` is deprecated and runs on the main thread, where a
// stalled frame drops audio; `AnalyserNode` can measure but cannot deliver
// samples. The worklet does both on the audio thread, and the measurement is
// free because it is a pass over samples already in cache.
//
// **THE LEVEL IS MEASURED HERE, AT THE SOURCE, AND THAT IS THE ONLY HONEST
// PLACE FOR THE SPEAKER'S OWN METER.** It is the signal as it will be encoded —
// after the browser's own gain control, before the network — so the bar the
// player watches while testing their microphone is the bar their friends will
// hear.

import type { VoicePcm } from "./codecs.ts";

/**
 * The processor's registered name. Shared by the module source below and the
 * `AudioWorkletNode` that instantiates it — one constant, because a typo
 * between the two is a node that throws at construction with a message about a
 * name nobody searched for.
 */
export const MIC_PROCESSOR = "gis-voice-mic";

/**
 * What one message from the worklet carries: a frame of mono PCM, and how loud
 * it was.
 *
 * `rms` rather than a peak, because what the meter is for is "is this person
 * whispering or shouting" — a perceptual loudness question — and a peak is
 * dominated by transients (a keyboard press, a chair) that say nothing about
 * how loud the voice is.
 */
export type MicFrame = { pcm: VoicePcm; rms: number };

/**
 * The module source.
 *
 * Written as a plain string of ES5-ish JavaScript on purpose: it is evaluated
 * by the audio thread's own global scope, so nothing here may be transpiled,
 * bundled or type-checked, and anything clever is a runtime failure in a place
 * with no console anybody reads.
 */
const SOURCE = `
class MicFrames extends AudioWorkletProcessor {
  constructor(options) {
    super();
    const size = (options && options.processorOptions
      ? options.processorOptions.frameSamples : 0) || 960;
    this.size = size;
    this.buf = new Float32Array(size);
    this.at = 0;
  }

  process(inputs) {
    const channel = inputs[0] && inputs[0][0];
    // No input yet (the device is still starting) or a muted track. Returning
    // true keeps the processor alive — false would retire it permanently, and
    // a microphone that stops working the first time it goes quiet is a
    // microphone that works exactly once.
    if (!channel) return true;
    for (let i = 0; i < channel.length; i++) {
      this.buf[this.at++] = channel[i];
      if (this.at < this.size) continue;
      let sum = 0;
      for (let j = 0; j < this.size; j++) sum += this.buf[j] * this.buf[j];
      // COPIED, then TRANSFERRED. The copy is what lets the buffer be handed
      // over with no structured clone; transferring \`this.buf\` itself would
      // detach the very array the next 128 samples are written into.
      const out = this.buf.slice();
      this.port.postMessage(
        { pcm: out, rms: Math.sqrt(sum / this.size) },
        [out.buffer],
      );
      this.at = 0;
    }
    return true;
  }
}

registerProcessor(${JSON.stringify(MIC_PROCESSOR)}, MicFrames);
`;

let cached: string | null = null;

/**
 * A URL the audio thread can load the processor from.
 *
 * Cached for the lifetime of the page: `addModule` is idempotent per URL, and
 * minting a second `Blob` per microphone open would leak one object URL per
 * press of the voice toggle.
 */
export function micWorkletUrl(): string {
  cached ??= URL.createObjectURL(
    new Blob([SOURCE], { type: "text/javascript" }),
  );
  return cached;
}
