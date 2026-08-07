// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// WHO IS TALKING, AND HOW LOUD — the voice HUD's whole model, and deliberately
// the only part of this feature with no audio, no network and no React in it.
//
// It exists as a pure object for the same reason `server/wire/chat.ts` is a pure
// parser: everything interesting about it is a rule (when does somebody stop
// being "speaking", what does a muted speaker still show, what happens to a
// player who quits mid-word) and none of those rules need a microphone to test.
//
// **THE LIST IS A STATE; THE LEVELS ARE A STREAM. THEY ARE READ DIFFERENTLY,
// AND CONFLATING THEM WOULD COST 400 REACT RENDERS A SECOND.**
//
//  - WHO is here, who is muted, who is unheard, and who is speaking AT ALL are
//    structural facts. They change when somebody starts or stops talking, which
//    is a few times a minute, and they are pushed to subscribers.
//  - HOW LOUD is a stream: 50 samples a second per speaker, times up to seven
//    speakers. It is never pushed. The overlay polls it on its own animation
//    frame and paints it, which is what the browser is already doing anyway.
//
// So `subscribe` fires on structure only, and `level`/`bars`/`peak` are read
// imperatively. A consumer that re-rendered on every packet would be spending a
// React reconciliation per 20 ms of speech per person in the party.
//
// **THE WAVEFORM IS A HISTORY, NOT A SPECTRUM.** What the player is being asked
// is "which of these two is shouting", and the answer to that is a bar per
// recent frame at its own loudness — a strip that stays low and flat for a
// whisper and slams to the top for a shout. An FFT would be prettier and would
// answer a question nobody asked.

import { VOICE_FRAME_MS, VOICE_SEAT_UNSET } from "@game/wire/voice.ts";

/**
 * How long after somebody's last packet they stop counting as speaking, in ms.
 *
 * It is a JITTER TOLERANCE rather than a taste setting, which is why it is not
 * simply one frame: packets are unreliable and arrive in clumps, so a listener
 * that dropped somebody the instant a frame was late would flicker their card on
 * and off through every gap in a bad connection. Four frames is comfortably past
 * any ordinary jitter and still short enough that a card disappears while the
 * player is still lifting their finger off the key.
 *
 * `VOICE_FLAG_LAST` is what makes a clean release instant; this is the backstop
 * for the case where the packet carrying that flag is the one that got lost.
 */
export const VOICE_SILENCE_MS = VOICE_FRAME_MS * 4;

/**
 * How many recent loudness samples a speaker's waveform keeps.
 *
 * 32 frames is 640 ms at `VOICE_FRAME_MS` — about a spoken word. That is the
 * right window for the question the strip answers: long enough to show the
 * shape of what somebody just said (a shout has a visible attack), short enough
 * that it is about NOW rather than about the last minute.
 */
export const VOICE_BARS = 32;

/** One person, as the HUD draws them. */
export type VoiceSpeaker = {
  /** Their seat — the party's own numbering, so a portrait and a name can be
   * looked up exactly as the party frames do. */
  readonly seat: number;
  /** Loudness of their most recent frame, 0–1. */
  readonly level: number;
  /**
   * The loudest frame in the kept window, 0–1.
   *
   * THIS IS THE FIELD THAT ANSWERS "WHO IS SCREAMING". A momentary level is a
   * poor comparator — two people mid-sentence are both somewhere in the middle
   * on any given frame — while the peak over a word separates a whisper from a
   * shout at a glance and holds still long enough to read.
   */
  readonly peak: number;
  /** The recent loudness history, oldest first, always `VOICE_BARS` long. */
  readonly bars: readonly number[];
  /** A packet arrived recently enough to still count as talking. */
  readonly speaking: boolean;
  /** Silenced locally, by this player, for this session. */
  readonly muted: boolean;
  /**
   * Their packets are arriving and nothing here can decode them.
   *
   * Shown rather than swallowed, because the alternative is silence that looks
   * exactly like a mute — and a player who thinks they muted somebody by
   * accident goes looking in the wrong place for ever. See `decoderFor`.
   */
  readonly unheard: boolean;
};

/** The player's own half of the HUD — the "you are transmitting" tally. */
export type LocalVoice = {
  /** Voice is on at all (a provider opened, the mode is not OFF). */
  readonly live: boolean;
  /** Packets are going out right now. */
  readonly transmitting: boolean;
  /** What the microphone is hearing, 0–1 — moves whether or not anything is
   * being sent, which is what makes a settings-screen test bar possible. */
  readonly level: number;
  readonly bars: readonly number[];
  /** Why voice is not working, in the game's own words, or "". */
  readonly fault: string;
};

export type VoiceRoom = {
  /** Everybody currently making noise, in seat order. */
  readonly speakers: readonly VoiceSpeaker[];
  readonly local: LocalVoice;
  /** One packet of `seat`'s voice was decoded and played, at loudness 0–1. */
  heard(seat: number, level: number, atMs: number): void;
  /** One packet of `seat`'s voice arrived that nothing here can decode. */
  unheard(seat: number, atMs: number): void;
  /** The speaker said this was their last packet (`VOICE_FLAG_LAST`) — close
   * the utterance now rather than waiting out `VOICE_SILENCE_MS`. */
  finished(seat: number): void;
  /** Silence one seat locally, or let them back in. */
  setMuted(seat: number, muted: boolean): void;
  muted(seat: number): boolean;
  /** Update the local half. Any subset; only a structural change notifies. */
  setLocal(patch: Partial<Omit<LocalVoice, "bars">> & { level?: number }): void;
  /** Retire everybody who has gone quiet. Called from the drawing loop, which
   * is the only thing here with a clock. */
  sweep(atMs: number): void;
  /** A seat left the session — drop them entirely, mute included. */
  forget(seat: number): void;
  /** The session ended. */
  reset(): void;
  /** Told when the STRUCTURE changes — see the header for what that excludes. */
  subscribe(listener: () => void): () => void;
};

type Entry = {
  seat: number;
  level: number;
  bars: number[];
  speaking: boolean;
  unheard: boolean;
  lastAtMs: number;
};

export function createVoiceRoom(): VoiceRoom {
  const entries = new Map<number, Entry>();
  /**
   * WHO IS MUTED OUTLIVES WHO IS TALKING, and that is the reason this is a set
   * of its own rather than a flag on the entry.
   *
   * An entry is created when somebody speaks and retired when they stop, so a
   * mute stored on it would last exactly as long as the sentence it was applied
   * to — the player would mute somebody, the card would clear, and the next word
   * would arrive at full volume. It is keyed by SEAT and survives until that
   * seat leaves the session (`forget`), which is also correct rather than merely
   * convenient: a seat is handed out again to the next arrival
   * (`nextFreeSeat`), and inheriting a mute meant for the person who left would
   * silence a stranger for no reason.
   */
  const mutes = new Set<number>();
  const listeners = new Set<() => void>();
  let local: LocalVoice = {
    live: false,
    transmitting: false,
    level: 0,
    bars: freshBars(),
    fault: "",
  };
  /** The local meter's own history, mutated in place for the same reason a
   * speaker's is. */
  const localBars = freshBars();
  /** Bumped whenever the structure moved, so `sweep` can notify once for a
   * whole pass rather than once per speaker who fell silent. */
  let dirty = false;

  function changed(): void {
    for (const listener of listeners) listener();
  }

  /** Push one sample onto a fixed-length history, oldest out. A shift on a
   * 32-element array is cheaper than the allocation a fresh array per frame per
   * speaker would cost, and this runs 50 times a second per person. */
  function push(bars: number[], level: number): void {
    bars.shift();
    bars.push(level);
  }

  function entryFor(seat: number, atMs: number): Entry | null {
    // A SEAT THAT IS NOT A SEAT IS NOT A SPEAKER. `VOICE_SEAT_UNSET` reaching
    // here means a session forwarded a packet without stamping it, which is a
    // bug on the far end rather than something to draw a card for.
    if (!Number.isInteger(seat) || seat < 0 || seat >= VOICE_SEAT_UNSET) {
      return null;
    }
    const held = entries.get(seat);
    if (held) return held;
    const fresh: Entry = {
      seat,
      level: 0,
      bars: freshBars(),
      speaking: false,
      unheard: false,
      lastAtMs: atMs,
    };
    entries.set(seat, fresh);
    return fresh;
  }

  return {
    get speakers() {
      // Sorted by seat so the cards never reorder themselves under the
      // player's eyes: the order a packet happened to arrive in is not
      // something anybody should be asked to track visually.
      return [...entries.values()]
        .sort((a, b) => a.seat - b.seat)
        .map((entry) => ({
          seat: entry.seat,
          level: entry.level,
          peak: entry.bars.reduce((max, bar) => (bar > max ? bar : max), 0),
          bars: entry.bars,
          speaking: entry.speaking,
          muted: mutes.has(entry.seat),
          unheard: entry.unheard,
        }));
    },

    get local() {
      return local;
    },

    heard(seat, level, atMs) {
      const entry = entryFor(seat, atMs);
      if (!entry) return;
      const clamped = level > 1 ? 1 : level < 0 ? 0 : level;
      entry.level = clamped;
      entry.lastAtMs = atMs;
      push(entry.bars, clamped);
      // A speaker who WAS unheard and is now decoding (a decoder that finished
      // opening, a peer that switched provider) stops being unheard.
      const structural = !entry.speaking || entry.unheard;
      entry.speaking = true;
      entry.unheard = false;
      if (structural) changed();
    },

    unheard(seat, atMs) {
      const entry = entryFor(seat, atMs);
      if (!entry) return;
      entry.lastAtMs = atMs;
      // NO LEVEL AND NO BARS. Nothing was decoded, so there is no loudness to
      // report, and inventing one would draw a waveform for audio that was
      // never played — the one thing this card must not do is look like it is
      // working.
      const structural = !entry.speaking || !entry.unheard;
      entry.speaking = true;
      entry.unheard = true;
      if (structural) changed();
    },

    finished(seat) {
      const entry = entries.get(seat);
      if (!entry) return;
      entries.delete(seat);
      changed();
    },

    setMuted(seat, muted) {
      if (muted === mutes.has(seat)) return;
      if (muted) mutes.add(seat);
      else mutes.delete(seat);
      changed();
    },

    muted(seat) {
      return mutes.has(seat);
    },

    setLocal(patch) {
      if (patch.level !== undefined) {
        const clamped = patch.level > 1 ? 1 : patch.level < 0 ? 0 : patch.level;
        local = { ...local, level: clamped };
        push(localBars, clamped);
      }
      // The level is a STREAM and never notifies (see the header); the other
      // three are structure and always do.
      let structural = false;
      if (patch.live !== undefined && patch.live !== local.live) {
        local = { ...local, live: patch.live };
        structural = true;
      }
      if (
        patch.transmitting !== undefined &&
        patch.transmitting !== local.transmitting
      ) {
        local = { ...local, transmitting: patch.transmitting };
        structural = true;
      }
      if (patch.fault !== undefined && patch.fault !== local.fault) {
        local = { ...local, fault: patch.fault };
        structural = true;
      }
      local = { ...local, bars: localBars };
      if (structural) changed();
    },

    sweep(atMs) {
      dirty = false;
      for (const [seat, entry] of entries) {
        if (atMs - entry.lastAtMs <= VOICE_SILENCE_MS) continue;
        // RETIRED OUTRIGHT rather than kept with `speaking: false`. A card for
        // somebody who is not talking is a card that never leaves the screen,
        // and the party frames on the other rail already say who is HERE — this
        // overlay's whole job is who is talking right now.
        entries.delete(seat);
        dirty = true;
      }
      if (!local.transmitting && local.level > 0) {
        // The local meter decays to nothing when the microphone is closed, so a
        // released key does not leave a bar frozen mid-word.
        local = { ...local, level: 0 };
        push(localBars, 0);
      }
      if (dirty) changed();
    },

    forget(seat) {
      const had = entries.delete(seat);
      // THE MUTE GOES WITH THEM — see `mutes` above for why keeping it would
      // silence whoever is seated in that chair next.
      const wasMuted = mutes.delete(seat);
      if (had || wasMuted) changed();
    },

    reset() {
      const had = entries.size > 0 || mutes.size > 0;
      entries.clear();
      mutes.clear();
      local = {
        live: false,
        transmitting: false,
        level: 0,
        bars: localBars,
        fault: "",
      };
      localBars.fill(0);
      if (had) changed();
    },

    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

function freshBars(): number[] {
  return new Array<number>(VOICE_BARS).fill(0);
}
