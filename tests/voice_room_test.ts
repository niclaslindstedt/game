// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE VOICE ROOM — the HUD's model, tested without a microphone, a network or a
// browser, which is the whole reason it was written as a pure object.
//
// What is worth pinning here is not "a level goes in and comes out". It is the
// handful of rules that are invisible until they are wrong: that a MUTE outlives
// the sentence it was applied to, that it does NOT outlive the seat, that a
// speaker who goes quiet is retired rather than left on screen for ever, and —
// the one that costs 400 React renders a second if it regresses — that a LEVEL
// does not notify subscribers while a STRUCTURAL change does.

import { describe, expect, it } from "vitest";

import {
  createVoiceRoom,
  VOICE_BARS,
  VOICE_SILENCE_MS,
} from "../pwa/src/game/net/voice/room.ts";

describe("who is talking", () => {
  it("raises a speaker on their first packet and reports their level", () => {
    const room = createVoiceRoom();
    room.heard(2, 0.4, 1_000);
    expect(room.speakers).toHaveLength(1);
    expect(room.speakers[0]!.seat).toBe(2);
    expect(room.speakers[0]!.level).toBeCloseTo(0.4);
    expect(room.speakers[0]!.speaking).toBe(true);
  });

  it("keeps the cards in SEAT order, not arrival order", () => {
    // Cards that reordered themselves as packets happened to arrive would ask
    // the player to re-find the same person several times a second.
    const room = createVoiceRoom();
    room.heard(5, 0.2, 1_000);
    room.heard(1, 0.2, 1_000);
    room.heard(3, 0.2, 1_000);
    expect(room.speakers.map((speaker) => speaker.seat)).toEqual([1, 3, 5]);
  });

  it("retires a speaker who has gone quiet", () => {
    const room = createVoiceRoom();
    room.heard(1, 0.5, 1_000);
    room.sweep(1_000 + VOICE_SILENCE_MS);
    expect(room.speakers).toHaveLength(1);
    room.sweep(1_000 + VOICE_SILENCE_MS + 1);
    expect(room.speakers).toEqual([]);
  });

  it("closes an utterance at once when the speaker says it is their last", () => {
    // `VOICE_FLAG_LAST` is what makes a released talk key prompt; the silence
    // timeout above is only the backstop for when that packet is the one lost.
    const room = createVoiceRoom();
    room.heard(1, 0.5, 1_000);
    room.finished(1);
    expect(room.speakers).toEqual([]);
  });

  it("tolerates jitter rather than flickering a card on every late packet", () => {
    const room = createVoiceRoom();
    room.heard(1, 0.5, 1_000);
    // A packet arriving three frames late — ordinary on a home connection.
    room.sweep(1_060);
    expect(room.speakers).toHaveLength(1);
  });
});

describe("how loud", () => {
  it("keeps a fixed-length history, oldest first", () => {
    const room = createVoiceRoom();
    for (let i = 0; i < VOICE_BARS * 2; i++)
      room.heard(1, i / (VOICE_BARS * 2), i);
    const bars = room.speakers[0]!.bars;
    expect(bars).toHaveLength(VOICE_BARS);
    // Newest at the end: the strip reads left-to-right as time.
    expect(bars[VOICE_BARS - 1]!).toBeGreaterThan(bars[0]!);
  });

  it("reports a PEAK over the window, which is what separates a shout", () => {
    // A momentary level cannot answer "who is screaming" — two people mid
    // sentence are both somewhere in the middle on any given frame.
    const room = createVoiceRoom();
    room.heard(1, 0.9, 1_000);
    for (let i = 1; i < 5; i++) room.heard(1, 0.1, 1_000 + i);
    expect(room.speakers[0]!.level).toBeCloseTo(0.1);
    expect(room.speakers[0]!.peak).toBeCloseTo(0.9);
  });

  it("clamps a level that arrives out of range", () => {
    const room = createVoiceRoom();
    room.heard(1, 4, 1_000);
    room.heard(2, -1, 1_000);
    expect(room.speakers[0]!.level).toBe(1);
    expect(room.speakers[1]!.level).toBe(0);
  });
});

describe("muting somebody", () => {
  it("survives the sentence it was applied to", () => {
    // THE BUG THIS EXISTS TO PREVENT: a mute stored on the speaker's entry
    // would last exactly as long as that entry — the player mutes somebody, the
    // card clears when they pause, and the next word arrives at full volume.
    const room = createVoiceRoom();
    room.heard(3, 0.5, 1_000);
    room.setMuted(3, true);
    room.sweep(1_000 + VOICE_SILENCE_MS + 1);
    expect(room.speakers).toEqual([]);
    room.heard(3, 0.5, 5_000);
    expect(room.speakers[0]!.muted).toBe(true);
  });

  it("does NOT survive the seat", () => {
    // A seat is handed out again to the next arrival (`nextFreeSeat`), so a
    // mute meant for the person who left would silence a stranger.
    const room = createVoiceRoom();
    room.setMuted(3, true);
    room.forget(3);
    room.heard(3, 0.5, 5_000);
    expect(room.speakers[0]!.muted).toBe(false);
  });

  it("answers `muted` for a seat that has never spoken", () => {
    // The playback path asks BEFORE it decodes, which is the point of the mute.
    const room = createVoiceRoom();
    room.setMuted(6, true);
    expect(room.muted(6)).toBe(true);
    expect(room.muted(7)).toBe(false);
  });
});

describe("a speaker nothing here can decode", () => {
  it("is shown as UNHEARD rather than silently dropped", () => {
    // Silence would be indistinguishable from a mute, and a player who thinks
    // they muted somebody by accident goes looking in the wrong place for ever.
    const room = createVoiceRoom();
    room.unheard(2, 1_000);
    expect(room.speakers[0]!.unheard).toBe(true);
    expect(room.speakers[0]!.speaking).toBe(true);
    // Nothing was decoded, so there is no loudness to draw.
    expect(room.speakers[0]!.level).toBe(0);
  });

  it("stops being unheard once something decodes", () => {
    const room = createVoiceRoom();
    room.unheard(2, 1_000);
    room.heard(2, 0.3, 1_010);
    expect(room.speakers[0]!.unheard).toBe(false);
  });
});

describe("what notifies, and what deliberately does not", () => {
  it("notifies when the CAST changes", () => {
    const room = createVoiceRoom();
    let calls = 0;
    room.subscribe(() => calls++);
    room.heard(1, 0.5, 1_000);
    expect(calls).toBe(1);
    room.sweep(1_000 + VOICE_SILENCE_MS + 1);
    expect(calls).toBe(2);
  });

  it("does NOT notify on a level — the stream is polled, never pushed", () => {
    // THE PERFORMANCE RULE, pinned as behaviour: 50 packets a second per
    // speaker times up to seven speakers is 350 React reconciliations a second
    // if this ever starts publishing. See room.ts's header.
    const room = createVoiceRoom();
    room.heard(1, 0.2, 1_000);
    let calls = 0;
    room.subscribe(() => calls++);
    for (let i = 0; i < 20; i++) room.heard(1, i / 20, 1_000 + i);
    expect(calls).toBe(0);
  });

  it("notifies on a mute, which IS structural", () => {
    const room = createVoiceRoom();
    room.heard(1, 0.2, 1_000);
    let calls = 0;
    room.subscribe(() => calls++);
    room.setMuted(1, true);
    expect(calls).toBe(1);
    // Setting it again changes nothing and says nothing.
    room.setMuted(1, true);
    expect(calls).toBe(1);
  });

  it("sweeps a whole pass into ONE notification", () => {
    const room = createVoiceRoom();
    for (const seat of [1, 2, 3]) room.heard(seat, 0.4, 1_000);
    let calls = 0;
    room.subscribe(() => calls++);
    room.sweep(1_000 + VOICE_SILENCE_MS + 1);
    expect(calls).toBe(1);
    expect(room.speakers).toEqual([]);
  });
});

describe("the player's own half", () => {
  it("moves the meter without notifying, and the flags with", () => {
    const room = createVoiceRoom();
    let calls = 0;
    room.subscribe(() => calls++);
    room.setLocal({ level: 0.5 });
    expect(room.local.level).toBeCloseTo(0.5);
    expect(calls).toBe(0);
    room.setLocal({ transmitting: true });
    expect(calls).toBe(1);
  });

  it("decays the meter once the key is released", () => {
    // Or a released key leaves a bar frozen mid-word.
    const room = createVoiceRoom();
    room.setLocal({ transmitting: true, level: 0.8 });
    room.setLocal({ transmitting: false });
    room.sweep(2_000);
    expect(room.local.level).toBe(0);
  });

  it("carries a fault the player can act on", () => {
    const room = createVoiceRoom();
    room.setLocal({ fault: "NO MICROPHONE FOUND" });
    expect(room.local.fault).toBe("NO MICROPHONE FOUND");
  });
});

describe("bad input", () => {
  it("ignores a seat that is not a seat", () => {
    // `VOICE_SEAT_UNSET` reaching here means a session forwarded a packet it
    // never stamped — a bug on the far end, not a card to draw.
    const room = createVoiceRoom();
    room.heard(255, 0.5, 1_000);
    room.heard(-1, 0.5, 1_000);
    room.heard(1.5, 0.5, 1_000);
    expect(room.speakers).toEqual([]);
  });

  it("forgets everybody on reset", () => {
    const room = createVoiceRoom();
    room.heard(1, 0.5, 1_000);
    room.setMuted(2, true);
    room.reset();
    expect(room.speakers).toEqual([]);
    expect(room.muted(2)).toBe(false);
    expect(room.local.live).toBe(false);
  });
});
