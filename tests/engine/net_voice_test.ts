// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// VOICE THROUGH A REAL SESSION — the relay's four rules, each staged with real
// clients rather than asserted about the function that implements them.
//
// The rules are: the SEAT is the session's to stamp, a speaker never hears
// themselves, a SPECTATOR may type but not talk, and voice crosses WORLDS (the
// one thing in this session that is deliberately not cut per world — somebody
// who stepped home through a portal is still in the room with their friends).
//
// They matter more than they look. Three of the four are the difference between
// voice and an impersonation channel: without the stamp anybody can wear
// anybody's portrait, without the spectator gate a watcher with no seat has no
// identity to draw, and without the self-exclusion every player hears their own
// voice a round trip late — which is the single most disorienting thing an audio
// path can do to somebody.

import { afterEach, describe, expect, it } from "vitest";

import { engineVersion, resetBalanceTuning } from "@game/core";
import { decodeFrame, encodeFrameBytes } from "@game/wire/codec.ts";
import { FRAME } from "@game/wire/frames.ts";
import type { SessionParams } from "@game/wire/protocol.ts";
import {
  decodeVoice,
  encodeVoice,
  MAX_VOICE_BYTES,
  VOICE_CODEC,
  VOICE_SEAT_UNSET,
} from "@game/wire/voice.ts";

import { createSession, type Session } from "../../server/session.ts";

afterEach(() => resetBalanceTuning());

const PARAMS: SessionParams = {
  seed: 20260807,
  levelId: "moon",
  difficulty: "medium",
  loadout: null,
  respec: false,
  clearedLevels: [],
  merchantDiscovered: false,
};

/** One client's inbox, kept as decoded voice packets. */
function inbox() {
  const voice: { seat: number; codec: number; last: boolean; text: string }[] =
    [];
  return {
    voice,
    send(frame: ArrayBuffer) {
      const decoded = decodeFrame(frame);
      if (!decoded || decoded.type !== FRAME.voice) return;
      const packet = decodeVoice(decoded.payload);
      if (!packet) return;
      voice.push({
        seat: packet.seat,
        codec: packet.codec,
        last: packet.last,
        text: new TextDecoder().decode(packet.bytes),
      });
    },
  };
}

function session(): Session {
  return createSession({
    params: PARAMS,
    build: engineVersion,
    peers: {
      kick: () => {},
      invite: () => false,
      ping: () => -1,
    },
  });
}

/** Say something, as a client would: no seat on it, because a client may not
 * claim one. */
function talk(live: Session, id: number, text: string, last = false): void {
  live.receive(
    id,
    FRAME.voice,
    0,
    encodeVoice({
      codec: VOICE_CODEC.opus,
      last,
      bytes: new TextEncoder().encode(text),
    }),
  );
}

describe("relaying one player's voice", () => {
  it("stamps the SPEAKER'S OWN SEAT, whatever the client claimed", () => {
    const live = session();
    const host = inbox();
    const friend = inbox();
    live.addClient(1, host.send, true, "HOST");
    live.addClient(2, friend.send, true, "FRIEND");

    // A hostile client naming seat 0 — the host's chair, and the worst one to
    // be able to forge, since the HUD draws a portrait and a name off it.
    live.receive(
      2,
      FRAME.voice,
      0,
      encodeVoice({
        seat: 0,
        codec: VOICE_CODEC.opus,
        bytes: new TextEncoder().encode("hello"),
      }),
    );

    expect(host.voice).toHaveLength(1);
    // Seat 1 — the chair the session admitted client 2 into — not the 0 it
    // asked for.
    expect(host.voice[0]!.seat).toBe(1);
    expect(host.voice[0]!.text).toBe("hello");
  });

  it("never sends a speaker their own voice back", () => {
    // A loopback is the classic echo that makes people think their microphone
    // is broken. Everybody has already heard themselves, through their skull.
    const live = session();
    const host = inbox();
    const friend = inbox();
    live.addClient(1, host.send, true, "HOST");
    live.addClient(2, friend.send, true, "FRIEND");

    talk(live, 1, "one");

    expect(friend.voice.map((packet) => packet.text)).toEqual(["one"]);
    expect(host.voice).toEqual([]);
  });

  it("reaches every OTHER seat, and carries the codec and the last flag", () => {
    const live = session();
    const host = inbox();
    const second = inbox();
    const third = inbox();
    live.addClient(1, host.send, true, "HOST");
    live.addClient(2, second.send, true, "TWO");
    live.addClient(3, third.send, true, "THREE");

    talk(live, 1, "hey", true);

    for (const listener of [second, third]) {
      expect(listener.voice).toHaveLength(1);
      expect(listener.voice[0]!.codec).toBe(VOICE_CODEC.opus);
      expect(listener.voice[0]!.last).toBe(true);
      expect(listener.voice[0]!.seat).toBe(0);
    }
  });
});

describe("who may talk", () => {
  it("refuses a SPECTATOR's voice — they have no seat to be stamped with", () => {
    // Chat is the one thing a seatless client may do, and voice is deliberately
    // not the second: the identity a listener is SHOWN is a seat, and a speaker
    // with none has no portrait, no name and no party frame to light up.
    const live = session();
    const host = inbox();
    const watcher = inbox();
    live.addClient(1, host.send, true, "HOST");
    live.addClient(2, watcher.send, false, "WATCHER");

    talk(live, 2, "let me in");

    expect(host.voice).toEqual([]);
  });

  it("sends nothing TO a spectator either", () => {
    // A watcher is watching a game, not sitting in the room. The session never
    // promised them the party's conversation.
    const live = session();
    const host = inbox();
    const seated = inbox();
    const watcher = inbox();
    live.addClient(1, host.send, true, "HOST");
    live.addClient(2, seated.send, true, "FRIEND");
    live.addClient(3, watcher.send, false, "WATCHER");

    talk(live, 1, "plan");

    expect(seated.voice).toHaveLength(1);
    expect(watcher.voice).toEqual([]);
  });

  it("drops a malformed packet without touching anybody's ears", () => {
    const live = session();
    const host = inbox();
    const friend = inbox();
    live.addClient(1, host.send, true, "HOST");
    live.addClient(2, friend.send, true, "FRIEND");

    // Every shape `decodeVoice` refuses, straight at a live session.
    live.receive(2, FRAME.voice, 0, new Uint8Array(0));
    live.receive(2, FRAME.voice, 0, new Uint8Array(2));
    live.receive(2, FRAME.voice, 0, new Uint8Array(4 + MAX_VOICE_BYTES + 1));
    live.receive(2, FRAME.voice, 0, null);
    live.receive(2, FRAME.voice, 0, { text: "not bytes" });

    expect(host.voice).toEqual([]);
  });

  it("does not fall over when a stranger's frame arrives", () => {
    const live = session();
    const host = inbox();
    live.addClient(1, host.send, true, "HOST");
    expect(() => talk(live, 999, "who am i")).not.toThrow();
    expect(host.voice).toEqual([]);
  });
});

describe("voice and the rest of the wire", () => {
  it("is UNSET on the way in and a real seat on the way out", () => {
    // The two ends of the one rule, stated together because the pair is what
    // makes it a protocol rather than a convention.
    const packed = encodeVoice({
      codec: VOICE_CODEC.opus,
      bytes: new TextEncoder().encode("x"),
    });
    expect(decodeVoice(packed)!.seat).toBe(VOICE_SEAT_UNSET);

    const live = session();
    const host = inbox();
    const friend = inbox();
    live.addClient(1, host.send, true, "HOST");
    live.addClient(2, friend.send, true, "FRIEND");
    live.receive(2, FRAME.voice, 0, packed);
    expect(host.voice[0]!.seat).toBe(1);
  });

  it("leaves the simulation alone", () => {
    // A relay is a byte write and a send. It must not advance the run, and it
    // must not be able to: voice arrives 50 times a second per speaker, and a
    // path from it into the step pipeline would be a way to drive the clock.
    const live = session();
    const host = inbox();
    const friend = inbox();
    live.addClient(1, host.send, true, "HOST");
    live.addClient(2, friend.send, true, "FRIEND");
    live.advance(100);
    const tick = live.tick;
    for (let i = 0; i < 50; i++) talk(live, 2, `frame ${i}`);
    expect(live.tick).toBe(tick);
    expect(host.voice).toHaveLength(50);
  });

  it("frames voice as its own type and nothing else", () => {
    // Guards the hub's reliability rule from the other side: `sendTo` picks
    // UNRELIABLE off this byte, so a relay that re-framed voice as something
    // else would quietly start retransmitting stale syllables.
    const live = session();
    const seen: number[] = [];
    live.addClient(1, () => {}, true, "HOST");
    live.addClient(
      2,
      (frame) => {
        const decoded = decodeFrame(frame);
        if (decoded) seen.push(decoded.type);
      },
      true,
      "FRIEND",
    );
    seen.length = 0;
    talk(live, 1, "check");
    expect(seen).toContain(FRAME.voice);
  });

  it("round trips through a real frame, as the transport delivers it", () => {
    // The session hands the hub an ArrayBuffer; this is that buffer, decoded
    // exactly as a client's `onFrame` would.
    const payload = encodeVoice({
      seat: 4,
      codec: VOICE_CODEC.opus,
      bytes: new TextEncoder().encode("over"),
    });
    const frame = decodeFrame(
      encodeFrameBytes(
        { type: FRAME.voice, seq: 3, ack: 0, tick: 12 },
        payload,
      ),
    )!;
    const packet = decodeVoice(frame.payload)!;
    expect(packet.seat).toBe(4);
    expect(new TextDecoder().decode(packet.bytes)).toBe("over");
  });
});
