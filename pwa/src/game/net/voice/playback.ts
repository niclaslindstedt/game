// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// HEARING THE OTHERS — the provider-agnostic half of voice: a decoder per
// speaker, a jitter buffer per speaker, and one mixing graph.
//
// **ONE DECODER PER SEAT, NOT ONE PER CODEC**, and it is not an optimization
// that was skipped. A decoder is a pipeline whose `output` callback says nothing
// about which packet it came from, so two speakers fed into one decoder come out
// as one interleaved stream with no way to tell whose syllable is whose. Per
// seat is the only arrangement that can route the result.
//
// **THE JITTER BUFFER IS THE WHOLE DIFFERENCE BETWEEN "IT WORKS" AND "IT WORKS
// ON A REAL NETWORK".** Packets are sent every 20 ms and arrive whenever they
// arrive — early, late, out of order, sometimes not at all. Playing each one the
// moment it lands means a click at every irregularity. So each speaker has a
// PLAYOUT CLOCK a little ahead of now, every frame is scheduled at it, and the
// clock advances by exactly one frame per frame. Three rules keep it honest:
//
//  - **It starts `JITTER_MS` in the future.** That delay is the price of
//    smoothness and is paid once per utterance, not per packet.
//  - **An underrun RESETS it rather than catching up.** If the clock has fallen
//    behind real time (a gap in the speech, a stall), scheduling the next frame
//    "where the sequence says" would schedule it in the past — which the
//    platform plays immediately, all of it, at once. Restarting the clock costs
//    one gap, which is the gap that already happened.
//  - **An overrun DROPS.** If the buffer has grown past `MAX_BUFFER_MS` the
//    listener is receiving faster than it is playing (a burst after a stall, two
//    clocks disagreeing), and queueing it all would add permanent delay to
//    every word from then on. Voice is worth more fresh than complete.
//
// **VOICE HAS ITS OWN AUDIO CONTEXT AND ITS OWN VOLUME, DELIBERATELY.** It is
// not routed through `audio.ts`, so the SFX slider does not move it and — the
// decision worth stating — **MUTE does not silence it**. A player who mutes the
// game is turning off blasters and music, not their friends; a mute switch that
// also cut voice would make the game's own audio settings a way to accidentally
// leave a conversation. Voice has its own level and its own OFF, one screen away
// (SETTINGS → VOICE CHAT).

import { warn } from "@game/core";

import {
  VOICE_FRAME_MS,
  VOICE_SAMPLE_RATE,
  type VoicePacket,
} from "@game/wire/voice.ts";

import { decoderFor, type VoiceDecoder, type VoicePcm } from "./codecs.ts";
import type { VoiceRoom } from "./room.ts";
// The developer's recorder — a no-op until `startVoiceTap()`. Imported directly
// rather than injected because it is two module-level functions with no state of
// their own here, and threading a recorder through the graph would put test
// scaffolding in the shape of the shipped path.
import { tapVoicePacket, tapVoicePcm } from "./tap.ts";

/**
 * How far ahead of now a speaker's first frame is scheduled, in ms.
 *
 * Three frames. It is the one number that trades latency against smoothness
 * directly, and the trade is not symmetric: 60 ms of extra delay is below what
 * anybody notices in conversation (a metre of air is 3 ms; a phone call is 150+),
 * while 60 ms of tolerance absorbs the ordinary jitter of a home connection
 * completely. Going lower buys nothing a player can hear and costs a click per
 * late packet.
 */
const JITTER_MS = VOICE_FRAME_MS * 3;

/**
 * How much queued speech is too much, in ms.
 *
 * Past this the excess is dropped rather than played — see the header. Half a
 * second is comfortably more than any jitter and comfortably less than the delay
 * at which people start talking over each other.
 */
const MAX_BUFFER_MS = 500;

/**
 * How many packets are held for a seat whose decoder is still being built.
 *
 * Opening a decoder is asynchronous and the first packets of the first word of a
 * session arrive during it. Five frames is 100 ms — enough that a conversation
 * starts cleanly, small enough that a codec which never opens cannot accumulate.
 */
const PENDING_MAX = 5;

export type VoicePlayback = {
  /** One arriving packet: decode it, schedule it, and tell the room. */
  play(packet: VoicePacket, atMs: number): void;
  /**
   * Re-read the output volume.
   *
   * PULLED on the link's own tick rather than pushed from the settings screen,
   * for the same reason the levels are polled rather than published: the slider
   * is one of several live numbers this feature reads per frame, and a setter
   * per knob is a subscription per knob to keep in step. It is one float
   * assignment on a gain node that is already there.
   */
  tick(): void;
  /** A seat left — drop their decoder and their playout clock. */
  forget(seat: number): void;
  close(): void;
};

export type VoicePlaybackOptions = {
  /** Where the levels and the speaking flags go. */
  room: VoiceRoom;
  /** 0–1 output volume for voices, read per frame so the slider is live. */
  volume(): number;
};

type Seat = {
  codec: number;
  decoder: VoiceDecoder | null;
  /** Packets waiting for `decoder` to finish opening. */
  pending: Uint8Array[];
  /** This speaker's own gain node, so one person can be turned down without
   * touching the others. */
  gain: GainNode;
  /** The playout clock, in this context's own time base. */
  playAt: number;
  /** True once we know nothing here can decode this speaker. */
  unsupported: boolean;
};

export function createVoicePlayback(
  options: VoicePlaybackOptions,
): VoicePlayback {
  const { room } = options;
  let context: AudioContext | null = null;
  let master: GainNode | null = null;
  let closed = false;
  const seats = new Map<number, Seat>();

  /** The graph, built on the first packet rather than at construction: a player
   * in a session where nobody talks should never open an audio context. */
  function graph(): { context: AudioContext; master: GainNode } | null {
    if (closed) return null;
    if (context && master) return { context, master };
    try {
      context = new AudioContext({
        sampleRate: VOICE_SAMPLE_RATE,
        latencyHint: "interactive",
      });
      master = context.createGain();
      master.gain.value = options.volume();
      master.connect(context.destination);
      // A context created outside a gesture starts suspended. By the time
      // anybody is in a session the game has had plenty, so this resolves at
      // once; it is awaited by nobody because a frame scheduled into a
      // suspended context plays when it resumes.
      if (context.state === "suspended") void context.resume().catch(() => {});
      return { context, master };
    } catch (err) {
      warn(`voice: no output context — ${String(err)}`);
      closed = true;
      return null;
    }
  }

  function seatFor(packet: VoicePacket): Seat | null {
    const built = graph();
    if (!built) return null;
    const held = seats.get(packet.seat);
    // A CHANGED CODEC IS A NEW DECODER. It happens when a peer's provider
    // changes under them (a Steam client that started, a device that finally
    // answered), and feeding the old decoder the new codec's bytes would be a
    // stream of decode errors that reads as a broken microphone.
    if (held && held.codec === packet.codec) return held;
    held?.decoder?.close();
    if (held) held.gain.disconnect();
    const gain = built.context.createGain();
    gain.gain.value = 1;
    gain.connect(built.master);
    const seat: Seat = {
      codec: packet.codec,
      decoder: null,
      pending: [],
      gain,
      playAt: 0,
      unsupported: false,
    };
    seats.set(packet.seat, seat);
    void decoderFor(packet.codec, {
      onPcm: (pcm) => schedule(packet.seat, pcm),
      onError: (detail) => {
        // Reported once per fault rather than per packet: a peer with a bad
        // stream would otherwise write 50 lines a second into the log.
        warn(`voice: seat ${packet.seat} decode failed — ${detail}`);
      },
    }).then((decoder) => {
      const live = seats.get(packet.seat);
      if (!live || live !== seat) {
        decoder?.close();
        return;
      }
      if (!decoder) {
        // NOTHING HERE SPEAKS THIS CODEC. Marked so every later packet is
        // dropped for the price of a map lookup, and the room is told — the
        // speaker's card reads UNHEARD, which is a fact the player can act on.
        seat.unsupported = true;
        seat.pending.length = 0;
        return;
      }
      seat.decoder = decoder;
      for (const bytes of seat.pending) decoder.decode(bytes);
      seat.pending.length = 0;
    });
    return seat;
  }

  /** One decoded frame: put it on this speaker's playout clock, and report how
   * loud it was. */
  function schedule(seatIndex: number, pcm: VoicePcm): void {
    const built = graph();
    const seat = seats.get(seatIndex);
    if (!built || !seat || closed || pcm.length === 0) return;
    const { context: ctx } = built;

    // THE LEVEL IS MEASURED FROM THE AUDIO ACTUALLY PLAYED, and that is a
    // deliberate refusal to let the sender say how loud it is. A level field on
    // the wire would be a number a client could set to 255 for ever, and the
    // waveform's whole job is to let a player tell a whisper from a shout — so
    // it is derived from the samples this machine is about to put through its
    // own speakers, where nobody can lie about it.
    let sum = 0;
    for (let i = 0; i < pcm.length; i++) sum += pcm[i]! * pcm[i]!;
    room.heard(seatIndex, Math.sqrt(sum / pcm.length), performance.now());
    // WHAT THIS LISTENER ACTUALLY HEARD, when somebody is recording. Taken here
    // rather than inside the decoder so it captures the audio that is genuinely
    // about to be played — including a frame the overrun rule below is about to
    // drop, which is itself worth seeing.
    tapVoicePcm(seatIndex, pcm);

    const frameSeconds = pcm.length / VOICE_SAMPLE_RATE;
    const now = ctx.currentTime;
    // UNDERRUN: the clock is in the past (a new utterance, or a gap). Restart it
    // rather than catching up — see the header.
    if (seat.playAt < now + frameSeconds) {
      seat.playAt = now + JITTER_MS / 1000;
    }
    // OVERRUN: more queued than `MAX_BUFFER_MS`. Drop this frame; a permanent
    // delay is worse than one missing 20 ms.
    if (seat.playAt - now > MAX_BUFFER_MS / 1000) return;

    const buffer = ctx.createBuffer(1, pcm.length, VOICE_SAMPLE_RATE);
    buffer.copyToChannel(pcm, 0);
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(seat.gain);
    source.start(seat.playAt);
    seat.playAt += frameSeconds;
  }

  return {
    play(packet, atMs) {
      if (closed) return;
      // THE FAR END OF THE BYTE-IDENTITY CLAIM: recorded as the bytes ARRIVED,
      // before anything decodes or copies them, so a digest taken here can be
      // compared with what the sender emitted. See `tap.ts`.
      tapVoicePacket(packet);
      // MUTED: NOT DECODED, BUT STILL SHOWN. Skipping the decode is the point of
      // a mute (it costs nothing and plays nothing), while still registering the
      // speaker keeps their card on screen with a MUTED badge and a flat line —
      // so "I muted this person and they are talking" is legible, instead of
      // looking exactly like a person who has gone quiet.
      if (room.muted(packet.seat)) {
        room.heard(packet.seat, 0, atMs);
        return;
      }
      const seat = seatFor(packet);
      if (!seat) return;
      if (seat.unsupported) {
        room.unheard(packet.seat, atMs);
        return;
      }
      // The talker's release marker carries no speech — it is the utterance's
      // full stop, so it closes the card and is never fed to a decoder.
      if (packet.last && packet.bytes.byteLength === 0) {
        room.finished(packet.seat);
        return;
      }
      const bytes = packet.bytes;
      if (seat.decoder) {
        seat.decoder.decode(bytes);
        return;
      }
      if (seat.pending.length < PENDING_MAX) seat.pending.push(bytes);
    },

    tick() {
      if (closed || !master) return;
      const wanted = Math.max(0, Math.min(1, options.volume()));
      if (master.gain.value !== wanted) master.gain.value = wanted;
    },

    forget(seat) {
      const held = seats.get(seat);
      if (!held) return;
      held.decoder?.close();
      held.gain.disconnect();
      seats.delete(seat);
      room.forget(seat);
    },

    close() {
      if (closed) return;
      closed = true;
      for (const seat of seats.values()) {
        seat.decoder?.close();
        seat.gain.disconnect();
      }
      seats.clear();
      master?.disconnect();
      const dying = context;
      context = null;
      master = null;
      void dying?.close().catch(() => {
        // Already gone; not a failure.
      });
    },
  };
}
