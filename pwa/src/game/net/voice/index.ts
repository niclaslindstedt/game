// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE VOICE LINK — what the run holds: one microphone, one output graph, one
// room model, and the policy that decides when the player is actually
// transmitting.
//
// Everything provider-specific is behind `codecs.ts` and everything visual is in
// `VoiceOverlay.tsx`; what lives here is the half-dozen decisions that are
// neither, and each one is a rule:
//
// **THE POLICY IS HERE, THE MECHANISM IS IN THE PROVIDER.** A source knows how
// to capture and encode; it does not know what push-to-talk is, what an open-mic
// threshold is, or that a spectator may not speak. That split is what lets the
// Steam provider — which has its own recorder and no input meter — be dropped in
// without reimplementing any of it (see `VoiceProvider.openMic`).
//
// **NOTHING OPENS THE MICROPHONE UNTIL THE PLAYER ASKS.** The device is opened
// when voice is switched on in a session and released the moment it is switched
// off or the run ends. A game that held an open microphone for the length of a
// session because the player might speak later would be a game with its
// microphone light on all evening, and the light is the promise.
//
// **THE TICK IS A TIMER, NOT AN ANIMATION FRAME.** `requestAnimationFrame` stops
// in a window nobody is looking at, and this loop carries the output volume, the
// silence sweep and the open-mic gate — a player who alt-tabs to read something
// while their friends talk must not have the conversation stop with the
// repaints.

import { warn } from "@game/core";

import type { VoicePacket } from "@game/wire/voice.ts";

import { getSettings, type VoiceSettings } from "../../settings.ts";

import { pickVoiceProvider, type VoiceSource } from "./codecs.ts";
import { createVoicePlayback, type VoicePlayback } from "./playback.ts";
import { createVoiceRoom, type VoiceRoom } from "./room.ts";

/** How often the policy runs, in ms. ~30 Hz: fast enough that an open-mic gate
 * opens within a syllable and a released key stops the wire within a frame,
 * slow enough to be free. */
const TICK_MS = 33;

/**
 * How long an open mic keeps transmitting after the level drops back under the
 * threshold, in ms.
 *
 * WITHOUT THIS AN OPEN MIC CHOPS UP EVERY SENTENCE. Ordinary speech dips below
 * any usable threshold between words and inside plosives, so a gate with no
 * hangover opens and shuts several times per sentence — and every close is a
 * clipped consonant on the listening end. A third of a second holds a sentence
 * together and still closes well inside the pause between one person finishing
 * and the next starting.
 */
const HANGOVER_MS = 350;

/** What the run's HUD and the settings screen may ask of voice. */
export type VoiceLink = {
  /** Who is talking, how loud, and what this player's own microphone is doing. */
  readonly room: VoiceRoom;
  /** One packet off the wire (`NetClientOptions.onVoice`). */
  receive(packet: VoicePacket): void;
  /**
   * The seats that still exist.
   *
   * Called from the roster, because a player who QUITS must lose their card and
   * their local mute — a mute is keyed by seat, and seats are handed out again
   * (`nextFreeSeat`), so keeping one would silence whoever sits down next.
   */
  present(seats: readonly number[]): void;
  /** True when a microphone is actually open and packets can go out. */
  readonly live: boolean;
  /** Give the device back and stop everything. */
  dispose(): void;
};

export type VoiceLinkOptions = {
  /** Put one packet of our own voice on the wire (`NetClient.sendVoice`). */
  send(bytes: Uint8Array, codec: number, last: boolean): void;
  /**
   * True while this client only WATCHES.
   *
   * A spectator has no seat, so the session has nothing to stamp their packets
   * with and refuses them (`server/wire/voice.ts`). Read as a function rather
   * than a value because a joiner starts as a spectator and is seated a moment
   * later, and voice should come up when that happens rather than at the next
   * reload.
   */
  spectating(): boolean;
  /** Voice settings, read live so a slider moves what the player hears. */
  settings?: () => VoiceSettings;
};

export function createVoiceLink(options: VoiceLinkOptions): VoiceLink {
  const room = createVoiceRoom();
  const settings = options.settings ?? (() => getSettings().voice);
  let playback: VoicePlayback | null = null;
  let source: VoiceSource | null = null;
  /** Guards against a second open while the first is still awaiting a device or
   * a permission prompt — which is exactly what a player toggling the row twice
   * produces, and two microphones both encoding is two voices on the wire. */
  let opening = false;
  let disposed = false;
  /** The talk key's physical state. */
  let talkDown = false;
  /** While the open-mic gate is holding a sentence together — see
   * `HANGOVER_MS`. */
  let holdUntil = 0;
  let timer = 0;

  /** Which mode is actually reachable: a provider that cannot measure its input
   * cannot drive an open mic, so OPEN degrades to push-to-talk rather than
   * silently never transmitting (`VoiceProvider.openMic`). */
  let openMicPossible = true;

  function wanted(): VoiceSettings {
    return settings();
  }

  async function open(): Promise<void> {
    if (opening || source || disposed) return;
    opening = true;
    try {
      const provider = await pickVoiceProvider();
      if (!provider) {
        room.setLocal({ live: false, fault: "NO MICROPHONE ON THIS MACHINE" });
        return;
      }
      openMicPossible = provider.openMic;
      const opened = await provider.createSource({
        onPacket: (bytes, last) => {
          // The gate is re-checked at the moment of sending, not only on the
          // tick that opened it: between one tick and the next up to two frames
          // are encoded, and a key released in that window must not put them on
          // the wire.
          if (disposed) return;
          if (!last && !transmitting()) return;
          options.send(bytes, provider.id, last);
        },
        onError: (detail) => {
          // A DEVICE FAULT TURNS VOICE OFF AND SAYS SO. The alternative — retry
          // quietly — is a player who thinks they are talking to their friends
          // and is not, which is the single worst state this feature can be in.
          warn(`voice: microphone fault — ${detail}`);
          room.setLocal({
            live: false,
            transmitting: false,
            fault: reason(detail),
          });
          close();
        },
        gain: () => wanted().micGain,
      });
      if (disposed) {
        opened?.close();
        return;
      }
      if (!opened) {
        // `createSource` already reported why through `onError` (a refused
        // permission is the ordinary case), so there is nothing to add here.
        return;
      }
      source = opened;
      room.setLocal({ live: true, fault: "" });
    } finally {
      opening = false;
    }
  }

  function close(): void {
    source?.close();
    source = null;
    talkDown = false;
    holdUntil = 0;
    room.setLocal({ live: false, transmitting: false, level: 0 });
  }

  /** THE POLICY, in one function: may this player's voice go out right now? */
  function transmitting(): boolean {
    if (!source || disposed) return false;
    // A SPECTATOR NEVER TRANSMITS. The session refuses it anyway; refusing here
    // too means a watcher's microphone is not even encoded.
    if (options.spectating()) return false;
    const mode = wanted().mode;
    if (mode === "off") return false;
    if (mode === "open" && openMicPossible)
      return performance.now() < holdUntil;
    return talkDown;
  }

  function tick(): void {
    if (disposed) return;
    const now = performance.now();
    playback?.tick();
    room.sweep(now);
    if (source) {
      const level = source.level();
      room.setLocal({ level });
      // THE GATE. Held open for `HANGOVER_MS` past the last loud frame so a
      // sentence survives the quiet between its words.
      if (wanted().mode === "open" && openMicPossible) {
        if (level >= wanted().threshold) holdUntil = now + HANGOVER_MS;
      }
      const on = transmitting();
      if (on !== source.transmitting) {
        source.setTransmitting(on);
        room.setLocal({ transmitting: on });
      }
    }
    // The mode can change under us at any time (the settings screen is
    // reachable mid-run), so the device follows it here rather than through a
    // subscription: one comparison per tick against one boolean.
    const on = wanted().mode !== "off";
    if (on && !source && !opening) void open();
    if (!on && source) close();
  }

  function onKeyDown(event: KeyboardEvent): void {
    if (event.code !== keyCode()) return;
    // No `preventDefault`: the talk key is a key like any other and may well be
    // bound to something else the player also wants. Voice is additive.
    talkDown = true;
  }

  function onKeyUp(event: KeyboardEvent): void {
    if (event.code !== keyCode()) return;
    talkDown = false;
  }

  /**
   * THE STUCK-KEY GUARD, and it is the bug every push-to-talk implementation
   * ships once.
   *
   * A `keyup` is delivered to the window that has focus. Alt-tab with the talk
   * key held and the key goes up somewhere else — so this page never hears it,
   * `talkDown` stays true, and the player's microphone is live in another
   * application for as long as the game is open. Every path that can take focus
   * away therefore releases it: losing focus, the page being hidden, and the
   * pointer leaving the document.
   */
  function release(): void {
    talkDown = false;
    holdUntil = 0;
  }

  function keyCode(): string {
    return getSettings().keybindings.pushToTalk;
  }

  if (typeof window !== "undefined") {
    playback = createVoicePlayback({
      room,
      volume: () => wanted().outVolume,
    });
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", release);
    document.addEventListener("visibilitychange", release);
    timer = window.setInterval(tick, TICK_MS);
  }

  return {
    room,
    receive(packet) {
      if (disposed) return;
      playback?.play(packet, performance.now());
    },
    present(seats) {
      if (disposed) return;
      const here = new Set(seats);
      for (const speaker of room.speakers) {
        if (!here.has(speaker.seat)) playback?.forget(speaker.seat);
      }
    },
    get live() {
      return source !== null;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      if (typeof window !== "undefined") {
        window.clearInterval(timer);
        window.removeEventListener("keydown", onKeyDown);
        window.removeEventListener("keyup", onKeyUp);
        window.removeEventListener("blur", release);
        document.removeEventListener("visibilitychange", release);
      }
      close();
      playback?.close();
      playback = null;
      room.reset();
    },
  };
}

/**
 * Turn a platform's error text into something a player can act on.
 *
 * The three cases worth naming are the three that actually happen, and each has
 * a different remedy: the player said no (answer the prompt, or fix it in the
 * OS), there is no device (plug one in), or the device is somebody else's right
 * now. Anything else is passed through — a wrong-but-specific line is more use
 * to a bug report than a friendly one that hides which of the above it was.
 */
function reason(detail: string): string {
  const text = detail.toLowerCase();
  if (text.includes("notallowed") || text.includes("permission")) {
    return "MICROPHONE BLOCKED - ALLOW IT IN YOUR SYSTEM SETTINGS";
  }
  if (text.includes("notfound") || text.includes("devices not found")) {
    return "NO MICROPHONE FOUND";
  }
  if (text.includes("notreadable") || text.includes("in use")) {
    return "THE MICROPHONE IS BUSY IN ANOTHER APP";
  }
  return detail.toUpperCase().slice(0, 64);
}

export type { VoiceRoom, VoiceSpeaker } from "./room.ts";
