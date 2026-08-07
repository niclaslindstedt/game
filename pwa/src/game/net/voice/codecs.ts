// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE VOICE PROVIDER SEAM — one interface, and the reason it is shaped the way
// it is rather than the way the shipped implementation would suggest.
//
// A voice provider answers two questions and nothing else: **give me encoded
// packets of MY voice** (a `VoiceSource`) and **turn SOMEBODY ELSE's packets
// back into sound I can play** (a `VoiceDecoder`). Everything around those two
// — the jitter buffer, the mixing graph, the per-speaker gain, the level
// meters, the HUD, the wire — is provider-agnostic and lives elsewhere
// (`playback.ts`, `room.ts`, `index.ts`, `server/wire/voice.ts`).
//
// **WHY A SEAM AT ALL, WHEN ONE IMPLEMENTATION SHIPS.** Because the obvious
// second one is already scoped and cannot be a rewrite of the first. Valve's
// own `ISteamUser` voice API (`StartVoiceRecording` / `GetVoice` /
// `DecompressVoice`) is a better fit for a Steam build in three ways that
// matter — it is the codec Valve tunes for game chat, it honours the player's
// Steam-wide microphone device and push-to-talk settings, and it is the only
// path that could ever respect a Steam MUTE or BLOCK, which is moderation the
// game cannot otherwise offer. It is not reachable today: `steamworks.js@0.4.0`
// binds no `voice` namespace and no `friends` namespace at all, so it means an
// N-API addon and the loss of the prebuilt binaries that let this shell install
// without a Rust toolchain — precisely the trade `electron/src/steam.ts`
// records for the missing `ISteamNetworkingSockets`. So it is a LATER provider,
// and the shape below is what keeps it a new file rather than a refactor.
//
// **THREE PROPERTIES OF THIS SEAM ARE THERE FOR THAT PROVIDER, NOT FOR THIS
// ONE**, and each one is load-bearing:
//
//  1. **EVERYTHING IS ASYNC TO CREATE.** Opening a microphone here is already
//     async (a permission prompt, a device, a worklet module), but the Steam
//     provider's is async for a harder reason: `steamworks.init()` is a single
//     global handshake the MAIN process owns, so a Steam source cannot live in
//     this renderer at all. It would be a sixth shell bridge — packets arriving
//     over `__gisVoice` the way snapshots arrive over a `MessagePort` — and
//     every call on it a round trip. A seam with a synchronous `encode()`
//     could not host it.
//  2. **CAPTURE AND ENCODE ARE ONE OBJECT.** They look separable and are not:
//     `GetVoice` hands back speech ALREADY COMPRESSED, so a seam that took PCM
//     from shared plumbing and passed it to a provider's encoder would have
//     nowhere to put Steam's recorder. `VoiceSource` is therefore "a thing that
//     emits packets", and how it got them is its own business.
//  3. **DECODING IS PER-PACKET AND SEPARATE FROM SOURCING.** A listener must
//     decode whatever arrives, which is not necessarily what it would SEND: two
//     players on the same build can pick different providers, because
//     availability is a fact about a MACHINE (does this Chromium expose an
//     encoder, is a Steam client actually running, did the player's device
//     answer) rather than about a build. So every packet names its codec
//     (`server/wire/voice.ts`) and a listener holds one decoder per codec it
//     meets — `decoderFor` below. A packet whose codec nobody here implements
//     makes its speaker UNHEARD on the HUD, which is a thing the player can
//     read and act on, rather than silence indistinguishable from a mute.
//
// **AND REPLACING THE SHIPPED ONE IS THE OTHER HALF OF THE SAME PROPERTY.**
// `opus.ts` is reached only through `PROVIDERS` below; nothing else in the app
// imports it. Swapping it for a different encoder — a WASM Opus build, a lower
// bitrate, a different frame size — is one entry in that list.

import type { VoiceCodecId } from "@game/wire/voice.ts";

/**
 * One frame of mono PCM at `VOICE_SAMPLE_RATE`, as every provider produces and
 * consumes it.
 *
 * Pinned to a real `ArrayBuffer` rather than left as a bare `Float32Array`,
 * which now means `Float32Array<ArrayBufferLike>` and therefore MIGHT be backed
 * by a `SharedArrayBuffer`. Neither `AudioData` nor `AudioBuffer.copyToChannel`
 * accepts one of those, so the distinction is the compiler catching a real
 * incompatibility rather than pedantry — and stating it once here beats a cast
 * at each of the four places PCM changes hands.
 */
export type VoicePcm = Float32Array<ArrayBuffer>;

/**
 * A live capture: the player's own voice, encoded, one packet per
 * `VOICE_FRAME_MS`.
 *
 * TRANSMITTING IS A SEPARATE STATE FROM CAPTURING, deliberately. The graph
 * stays open and the meter keeps reading while nobody is transmitting, which is
 * what lets the settings screen show a working level bar before anybody has
 * pressed talk, and what lets an open-mic gate see the syllable that is about
 * to cross its threshold. Tearing the device down between words would also mean
 * a permission-shaped stall at the start of every sentence.
 */
export type VoiceSource = {
  /** Which codec this source's packets are in — stamped on every one. */
  readonly codec: VoiceCodecId;
  /**
   * Emit packets, or stop.
   *
   * Called on every press and release of the talk key, and by the open-mic
   * gate, so it must be cheap and idempotent. `false` must silence the wire
   * immediately: a released talk key that keeps sending for another frame is a
   * word the player did not mean to say.
   */
  setTransmitting(on: boolean): void;
  /** True while packets are actually going out. */
  readonly transmitting: boolean;
  /**
   * How loud the microphone is hearing, 0–1, right now — regardless of whether
   * anything is being transmitted.
   *
   * POLLED rather than pushed, because the two things that read it (the local
   * meter on the HUD and the open-mic gate) both already run on a frame clock,
   * and a callback per 20 ms frame would be a React re-render per 20 ms frame.
   */
  level(): number;
  close(): void;
};

export type VoiceSourceOptions = {
  /** One encoded packet, ready for the wire. The bytes may be a view over a
   * buffer the source reuses — `encodeVoice` copies, which is why it may. */
  onPacket(bytes: Uint8Array, last: boolean): void;
  /** The capture died under us: the device was unplugged, the permission was
   * revoked in the OS, the encoder fell over. Voice turns itself off and says
   * so rather than pretending to work. */
  onError(detail: string): void;
  /** 0–1 microphone gain, read per frame so the slider is live. */
  gain(): number;
};

/** One codec's decoder, owned by the playback graph and fed whatever arrives
 * for it. */
export type VoiceDecoder = {
  readonly codec: VoiceCodecId;
  /** Hand over one packet's opaque bytes. PCM comes back through `onPcm`,
   * possibly on a later turn — a decoder is a pipeline, not a function. */
  decode(bytes: Uint8Array): void;
  close(): void;
};

export type VoiceDecoderOptions = {
  /** One frame of mono PCM at `VOICE_SAMPLE_RATE`, ready to be scheduled. */
  onPcm(pcm: VoicePcm): void;
  onError(detail: string): void;
};

/** One implementation of voice. */
export type VoiceProvider = {
  /** The id that travels on every packet this provider makes. */
  readonly id: VoiceCodecId;
  /** What the settings screen calls it — a word, upper case, in the game's own
   * voice. Shown so a player reporting "nobody can hear me" can say which. */
  readonly name: string;
  /**
   * Whether this provider can drive an OPEN MIC.
   *
   * A capability rather than an assumption, because the obvious second provider
   * does not have it: Valve's API reports no input level, so a Steam source can
   * only be gated by a key the player holds. The settings screen offers the
   * open-mic row only where the chosen provider answers true — the alternative
   * is a mode that silently never transmits.
   */
  readonly openMic: boolean;
  /**
   * Can this provider work on THIS machine, right now?
   *
   * Must not prompt for anything and must never throw: it is called to decide
   * whether to offer voice at all, and a permission dialog raised by a settings
   * screen merely being drawn is a permission dialog nobody asked for.
   */
  available(): Promise<boolean>;
  /** Open the microphone. Null when it could not be opened — a refused
   * permission, no device, a codec that turned out unsupported. */
  createSource(options: VoiceSourceOptions): Promise<VoiceSource | null>;
  /** A decoder for this provider's own packets. Null when one cannot be
   * built, which makes every speaker using it UNHEARD rather than silent. */
  createDecoder(options: VoiceDecoderOptions): Promise<VoiceDecoder | null>;
};

/**
 * THE REGISTRY, in PREFERENCE ORDER — the first available one is what talks.
 *
 * A plain array rather than a registration call, because the set is a fact
 * about the build: this is the app deciding what it ships with, not a plugin
 * point. Adding the Steam provider is one import and one entry at the FRONT of
 * this list (it would be preferred where it works, for the device-and-mute
 * reasons in the header) — and the entry is the whole change, because
 * everything else here reads the list rather than naming a provider.
 *
 * Lazily imported so a build nobody talks in pays nothing: `opus.ts` reaches
 * `AudioEncoder`, an `AudioWorklet` module and a `getUserMedia` call, none of
 * which belong in a chunk loaded by a player who never opens a session.
 */
const PROVIDERS: (() => Promise<VoiceProvider>)[] = [
  // THE FILE SOURCE COMES FIRST, and it is not a special case in the picker:
  // it simply reports itself UNAVAILABLE unless a developer has pointed it at an
  // audio file (`useVoiceFile`), so on every ordinary launch the loop falls
  // straight through to the microphone. Being first is what lets it stand in for
  // the device when one IS set. It folds away entirely in a store build.
  ...(__DEV_TOOLS__
    ? [async () => (await import("./file.ts")).fileVoiceProvider]
    : []),
  async () => (await import("./opus.ts")).opusProvider,
];

/** Every provider this build carries, resolved. Order is preference order. */
export async function voiceProviders(): Promise<VoiceProvider[]> {
  return Promise.all(PROVIDERS.map((load) => load()));
}

/**
 * The provider this machine should TALK with, or null when it cannot talk at
 * all.
 *
 * Null is an ordinary answer and never an error: a machine with no microphone,
 * a player who said no to the permission, an engine with no Opus encoder. What
 * it must not do is stop the player LISTENING — hearing other people needs a
 * decoder and no device at all — which is why sourcing and decoding are picked
 * separately.
 */
export async function pickVoiceProvider(): Promise<VoiceProvider | null> {
  for (const provider of await voiceProviders()) {
    if (await provider.available()) return provider;
  }
  return null;
}

/**
 * A decoder for one codec id, or null when nothing here implements it.
 *
 * The null is what the UNHEARD badge is made of. It happens for two honest
 * reasons and one dishonest one: a peer that picked a provider this machine
 * does not have, a peer on a build with a provider this one predates, and a
 * hostile host sending a codec number nobody allocated — all three answered the
 * same way, because a listener cannot tell them apart and does not need to.
 */
export async function decoderFor(
  codec: number,
  options: VoiceDecoderOptions,
): Promise<VoiceDecoder | null> {
  for (const provider of await voiceProviders()) {
    if (provider.id === codec) return provider.createDecoder(options);
  }
  return null;
}
