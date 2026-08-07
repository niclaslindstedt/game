// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE OPUS PROVIDER — the implementation that ships, behind the seam in
// `codecs.ts`, and the only file in the app that knows what a voice packet's
// bytes are.
//
// **IT IS ENTIRELY THE PLATFORM'S OWN.** `getUserMedia` opens the microphone,
// an `AudioWorklet` cuts it into frames and measures it, and WebCodecs'
// `AudioEncoder`/`AudioDecoder` do Opus. No dependency, no WASM, no native
// addon — which matters more here than it usually does: the desktop shell's
// whole installability rests on `steamworks.js` shipping prebuilt binaries, and
// a voice codec that needed a toolchain would put that back on the table for
// the sake of something Chromium already contains.
//
// **WHY OPUS AND NOT "WHATEVER THE BROWSER ENCODES".** It is the codec designed
// for exactly this — interactive speech over a lossy packet network — and the
// only widely available one whose frames are independently decodable at 20 ms.
// A container-based path (`MediaRecorder` producing WebM) would be a stream
// rather than packets: it cannot be cut at a frame boundary, cannot be decoded
// from the middle after a loss, and would arrive with a container's worth of
// overhead per syllable.
//
// **EVERY OPUS PACKET IS A KEY FRAME**, which is what makes the whole design
// safe on an unreliable transport: a listener that loses one packet decodes the
// next perfectly. That is the property `FRAME.voice`'s unreliability spends, and
// the reason a provider whose codec had interframe dependencies would need a
// different wire rule rather than merely a different `case`.
//
// **THE BROWSER'S OWN VOICE PROCESSING IS ASKED FOR AND LEFT ALONE.** Echo
// cancellation, noise suppression and auto gain are all requested from
// `getUserMedia`, because they are the platform's implementations of three
// things this file has no business writing: the game plays loud sound out of
// the same speakers the microphone is next to (which is what echo cancellation
// is FOR), a mechanical keyboard is exactly the noise a shooter's player makes,
// and a player who set their input level in Windows should not have to set it
// again here.

import { error as logError, warn } from "@game/core";

import { describeError } from "@ui/lib/describe-error.ts";

import {
  VOICE_BITRATE,
  VOICE_CODEC,
  VOICE_FRAME_MS,
  VOICE_FRAME_SAMPLES,
  VOICE_SAMPLE_RATE,
} from "@game/wire/voice.ts";

import type {
  VoicePcm,
  VoiceDecoder,
  VoiceDecoderOptions,
  VoiceProvider,
  VoiceSource,
  VoiceSourceOptions,
} from "./codecs.ts";
import { micWorkletUrl, MIC_PROCESSOR, type MicFrame } from "./mic-worklet.ts";
// The encoder is SHARED with the file source (`file.ts`) — see that module for
// why the test tool must not have an encoder of its own.
import { openOpusEncoder, OPUS_CONFIG as CONFIG } from "./opus-encode.ts";

/**
 * Is Opus voice possible here at all?
 *
 * Three independent facts, and the check asks for none of them from the player:
 * the page is in a secure context with a media device API (the desktop shell's
 * `game://` scheme is registered `secure: true` for exactly this kind of
 * reason), WebCodecs exists, and the engine will actually accept this Opus
 * configuration. That last one is asked properly — `isConfigSupported` — rather
 * than assumed from the presence of the constructor, because "the class exists"
 * and "this build can encode Opus at 48 kHz mono" are different claims on a
 * platform whose codecs are a build flag.
 *
 * NOTHING HERE PROMPTS. `getUserMedia` is deliberately not called: this runs to
 * decide whether to OFFER voice, and a microphone permission dialog raised by a
 * settings page being drawn is the rudest possible way to ask.
 */
async function available(): Promise<boolean> {
  if (typeof window === "undefined") return false;
  if (!navigator.mediaDevices?.getUserMedia) return false;
  if (typeof AudioEncoder === "undefined") return false;
  if (typeof AudioDecoder === "undefined") return false;
  try {
    const [encode, decode] = await Promise.all([
      AudioEncoder.isConfigSupported({ ...CONFIG, bitrate: VOICE_BITRATE }),
      AudioDecoder.isConfigSupported({ ...CONFIG }),
    ]);
    return encode.supported === true && decode.supported === true;
  } catch (err) {
    // A throw here is a platform that does not implement the query rather than
    // one that cannot encode; either way it is not a machine to talk on.
    warn(`voice: opus support query failed — ${describeError(err)}`);
    return false;
  }
}

async function createSource(
  options: VoiceSourceOptions,
): Promise<VoiceSource | null> {
  let context: AudioContext | null = null;
  let transmitting = false;
  let level = 0;
  let closed = false;
  // THE DEVICE FIRST, IN ITS OWN TRY, because its failure is the one that is
  // not a failure: the ordinary case is the player saying no, and that must be
  // reported rather than logged as a fault. Everything after it is real
  // machinery whose failure IS one, and the block below tears the device back
  // down if any of it breaks.
  const stream = await navigator.mediaDevices
    .getUserMedia({
      audio: {
        channelCount: 1,
        sampleRate: VOICE_SAMPLE_RATE,
        // See the header: three platform implementations of things this file
        // should not attempt. Requested rather than required — a device that
        // cannot do them still opens.
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
      video: false,
    })
    .catch((err: unknown) => {
      options.onError(describeError(err));
      return null;
    });
  if (!stream) return null;

  try {
    // THE CONTEXT IS PINNED TO THE VOICE RATE. Left to itself it would open at
    // the output device's rate (44.1 kHz on plenty of machines), and every
    // frame would then need resampling to reach the encoder's 48 kHz — a
    // conversion that costs quality and CPU to undo a mismatch nothing wanted.
    context = new AudioContext({
      sampleRate: VOICE_SAMPLE_RATE,
      latencyHint: "interactive",
    });
    await context.audioWorklet.addModule(micWorkletUrl());

    const encoder = openOpusEncoder({
      onPacket: (bytes) => options.onPacket(bytes, false),
      onError: options.onError,
      wanted: () => !closed && transmitting,
    });
    if (!encoder) throw new Error("could not open an Opus encoder");

    const node = new AudioWorkletNode(context, MIC_PROCESSOR, {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      channelCount: 1,
      processorOptions: { frameSamples: VOICE_FRAME_SAMPLES },
    });
    node.port.onmessage = (event: MessageEvent<MicFrame>) => {
      const frame = event.data;
      if (closed || !frame?.pcm) return;
      const gain = Math.max(0, Math.min(2, options.gain()));
      // THE METER READS THE SIGNAL AS IT WILL BE SENT, gain included — the
      // whole point of a level bar is that it predicts what the other end
      // hears, and a bar drawn before the slider is applied would say the
      // player is loud while their friends cannot hear them.
      level = Math.min(1, frame.rms * gain);
      // Not transmitting: the meter still moves (that is what makes the
      // settings screen's test bar work, and what an open-mic gate watches),
      // but nothing is encoded. Encoding while silent would spend the CPU and
      // then throw the packet away in `output` above.
      if (!transmitting) return;
      // The gain is applied by the encoder, in place, so the meter above and the
      // wire cannot disagree about how loud this frame was.
      encoder.encode(frame.pcm, gain);
    };

    const source = context.createMediaStreamSource(stream);
    // THE SILENT SINK IS NOT OPTIONAL. A worklet node is only pulled while it
    // is part of a graph that reaches the destination, so a capture node
    // connected to nothing is a node that never runs — and the symptom is
    // total silence with no error anywhere. The gain is zero because what
    // reaches the destination here must never be audible: routing a microphone
    // to the speakers it is sitting next to is how you build a feedback loop.
    const sink = context.createGain();
    sink.gain.value = 0;
    source.connect(node);
    node.connect(sink);
    sink.connect(context.destination);
    // Autoplay policy: a context created before any gesture starts suspended,
    // and a suspended context's worklet never runs. The game has had a gesture
    // long before anybody opens a session, so this ordinarily resolves at once.
    if (context.state === "suspended") await context.resume();

    const graph = { context, stream, encoder, node };
    return {
      codec: VOICE_CODEC.opus,
      get transmitting() {
        return transmitting;
      },
      setTransmitting(on) {
        if (closed || transmitting === on) return;
        transmitting = on;
        // THE LAST PACKET IS THE RELEASE ITSELF, not a flush. `encoder.flush()`
        // is a promise that resolves after the queue drains, and awaiting it
        // here would emit packets AFTER the player let go of the key — which is
        // the one thing a push-to-talk release must never do. The listener's
        // own silence timeout closes the utterance; `VOICE_FLAG_LAST` is a
        // courtesy that makes it prompt.
        if (!on) options.onPacket(new Uint8Array(0), true);
      },
      level() {
        return level;
      },
      close() {
        if (closed) return;
        closed = true;
        transmitting = false;
        graph.node.port.onmessage = null;
        graph.node.disconnect();
        // The TRACKS are what actually release the device — closing the context
        // alone leaves the microphone light on, which a player rightly reads as
        // the game still listening.
        for (const track of graph.stream.getTracks()) track.stop();
        // Idempotent, and it swallows an encoder already closed by its own error
        // callback — see `openOpusEncoder`.
        graph.encoder.close();
        void graph.context.close().catch(() => {
          // Tearing down a context that is already gone is not a failure.
        });
      },
    };
  } catch (err) {
    // Half-built graph: give back the device before reporting, or the player's
    // microphone light stays on after a failure they were told about.
    for (const track of stream.getTracks()) track.stop();
    void context?.close().catch(() => {});
    logError(`voice: could not open the microphone — ${describeError(err)}`);
    options.onError(describeError(err));
    return null;
  }
}

async function createDecoder(
  options: VoiceDecoderOptions,
): Promise<VoiceDecoder | null> {
  let closed = false;
  /** The decoder's own monotonic clock — see the encoder's `stamp`. A decoder
   * is fed packets from ONE speaker, so one counter per decoder is right. */
  let stamp = 0;
  try {
    const decoder = new AudioDecoder({
      output: (data) => {
        try {
          if (closed) return;
          const pcm: VoicePcm = new Float32Array(data.numberOfFrames);
          // Plane 0 of a planar frame is the mono channel. A stereo device on
          // the far end cannot happen (the encoder is configured mono), and
          // reading plane 0 of one that did would be the left channel — which
          // is a reasonable thing to hear rather than a reason to refuse.
          data.copyTo(pcm, { planeIndex: 0, format: "f32-planar" });
          options.onPcm(pcm);
        } catch (err) {
          options.onError(describeError(err));
        } finally {
          data.close();
        }
      },
      error: (err) => options.onError(describeError(err)),
    });
    decoder.configure({ ...CONFIG });
    return {
      codec: VOICE_CODEC.opus,
      decode(bytes) {
        if (closed || bytes.byteLength === 0) return;
        // EVERY OPUS PACKET IS A KEY FRAME — see the header. That is what lets
        // a decoder pick up mid-stream, which is what a joiner arriving into a
        // conversation and a listener recovering from a lost packet both are.
        const chunk = new EncodedAudioChunk({
          type: "key",
          timestamp: stamp,
          data: bytes,
        });
        stamp += VOICE_FRAME_MS * 1000;
        try {
          decoder.decode(chunk);
        } catch (err) {
          // A malformed packet — a hostile host, or bytes that lost a fight
          // with the network. Reported, not thrown: the decoder stays up and
          // the next packet is fine, which is the whole reason every frame is
          // independently decodable.
          options.onError(describeError(err));
        }
      },
      close() {
        if (closed) return;
        closed = true;
        try {
          if (decoder.state !== "closed") decoder.close();
        } catch {
          // Already closed by its own error callback.
        }
      },
    };
  } catch (err) {
    logError(`voice: could not open a decoder — ${describeError(err)}`);
    return null;
  }
}

/**
 * THE SHIPPED PROVIDER.
 *
 * `openMic` is true because this implementation genuinely measures its input
 * (the worklet's RMS), which is the fact the settings screen reads to decide
 * whether to offer the open-mic mode at all — see `VoiceProvider.openMic` for
 * why that is a capability rather than an assumption.
 */
export const opusProvider: VoiceProvider = {
  id: VOICE_CODEC.opus,
  name: "OPUS",
  openMic: true,
  available,
  createSource,
  createDecoder,
};
