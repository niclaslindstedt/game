// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// ADMISSION — the challenge cookie, the password proof, and the ORDER the
// refusals come in.
//
// The order is tested as hard as the decisions are, and deliberately: it is
// what decides which sentence a player is shown, and a joiner three versions
// behind who is told their password is wrong will spend the evening retyping
// it. It is also the flood defence — a protocol mismatch is refused before a
// hash is computed.

import { describe, expect, it } from "vitest";

import {
  admit,
  challengeEpoch,
  challengeFor,
  CHALLENGE_EPOCH_MS,
  hash32,
  passwordProof,
  sanitizeName,
  verifyChallenge,
} from "@game/wire/handshake.ts";
import { MAX_CLIENTS, type Handshake } from "@game/wire/protocol.ts";

const HOST: Handshake = { protocol: 2, build: "1.2.3", mods: [] };
const SECRET = 0xc0ffee;
const PEER = "203.0.113.7:27015";

/** A joiner that agrees about everything, so each test can disagree about one
 * thing and see only that refusal. */
function joiner(patch: Partial<Handshake> = {}): Handshake {
  return { ...HOST, ...patch };
}

function request(patch: Record<string, unknown> = {}) {
  const nowMs = 5_000;
  return {
    host: HOST,
    joiner: joiner(),
    secret: SECRET,
    peerKey: PEER,
    cookie: challengeFor(SECRET, PEER, challengeEpoch(nowMs)),
    nowMs,
    password: "",
    proof: 0,
    seats: 1,
    ...patch,
  };
}

describe("the challenge cookie", () => {
  it("is derived, so nothing is remembered between the probe and the join", () => {
    // The property the whole flood defence rests on: the same inputs produce
    // the same cookie, which is what lets the server verify one it never
    // stored. A random nonce would need a table, and a table is what a flood
    // exhausts.
    const first = challengeFor(SECRET, PEER, 41);
    expect(challengeFor(SECRET, PEER, 41)).toBe(first);
  });

  it("differs per peer, per epoch and per secret", () => {
    const base = challengeFor(SECRET, PEER, 41);
    expect(challengeFor(SECRET, "198.51.100.4:27015", 41)).not.toBe(base);
    expect(challengeFor(SECRET, PEER, 42)).not.toBe(base);
    expect(challengeFor(SECRET + 1, PEER, 41)).not.toBe(base);
  });

  it("cannot be replayed from another address", () => {
    // The one thing the cookie actually proves: the joiner can RECEIVE at the
    // address it claims. A cookie lifted off the wire is worthless to anybody
    // sending from somewhere else.
    const cookie = challengeFor(SECRET, PEER, challengeEpoch(5_000));
    expect(verifyChallenge(SECRET, "198.51.100.4:27015", cookie, 5_000)).toBe(
      false,
    );
  });

  it("stays good across one epoch boundary but not two", () => {
    // The previous epoch is accepted, and this is exactly why: a probe sent at
    // 9.99 s into an epoch would otherwise be answered with a cookie that
    // expires 10 ms later, and the join carrying it would be refused for a
    // reason the player could do nothing about but retry and hope.
    const issuedAt = CHALLENGE_EPOCH_MS - 10;
    const cookie = challengeFor(SECRET, PEER, challengeEpoch(issuedAt));
    expect(verifyChallenge(SECRET, PEER, cookie, issuedAt)).toBe(true);
    expect(verifyChallenge(SECRET, PEER, cookie, issuedAt + 100)).toBe(true);
    expect(
      verifyChallenge(SECRET, PEER, cookie, issuedAt + CHALLENGE_EPOCH_MS * 2),
    ).toBe(false);
  });
});

describe("the password proof", () => {
  it("is bound to the cookie, so it is useless on another connection", () => {
    expect(passwordProof("hunter2", 1)).not.toBe(passwordProof("hunter2", 2));
  });

  it("proves 0 for no password, which is what an unasked client sends", () => {
    expect(passwordProof("", 12345)).toBe(0);
  });
});

describe("admit", () => {
  it("lets a matching joiner through", () => {
    expect(admit(request())).toBeNull();
  });

  it("refuses protocol before build before mods", () => {
    // Most fundamental first, so the message names the thing the player can
    // actually fix rather than a symptom of it.
    expect(
      admit(
        request({
          joiner: joiner({ protocol: 1, build: "9.9.9", mods: ["x"] }),
        }),
      ),
    ).toBe("protocol-mismatch");
    expect(
      admit(request({ joiner: joiner({ build: "9.9.9", mods: ["x"] }) })),
    ).toBe("build-mismatch");
    expect(admit(request({ joiner: joiner({ mods: ["x"] }) }))).toBe(
      "mod-mismatch",
    );
  });

  it("refuses a version skew BEFORE it computes a hash", () => {
    // Cheapest first is the flood defence, not a micro-optimisation: garbage
    // must cost the host as little as possible. A joiner with a wrong protocol
    // AND a wrong cookie hears about the protocol.
    expect(admit(request({ joiner: joiner({ protocol: 1 }), cookie: 0 }))).toBe(
      "protocol-mismatch",
    );
  });

  it("checks the challenge before the password", () => {
    // Answering "wrong password" to a peer that has not proved it can receive
    // at the address it claims is a small oracle offered to a spoofed source
    // address for nothing.
    expect(admit(request({ cookie: 0, password: "hunter2", proof: 0 }))).toBe(
      "bad-challenge",
    );
  });

  it("refuses a wrong password and accepts a right one", () => {
    const asked = request({ password: "hunter2" });
    expect(admit({ ...asked, proof: 0 })).toBe("bad-password");
    expect(
      admit({ ...asked, proof: passwordProof("hunter2", asked.cookie) }),
    ).toBeNull();
  });

  it("refuses a full session last of all", () => {
    expect(admit(request({ seats: MAX_CLIENTS }))).toBe("session-full");
    expect(admit(request({ seats: 2, maxSeats: 2 }))).toBe("session-full");
  });
});

describe("sanitizeName", () => {
  it("strips control characters, so a name cannot forge a second log line", () => {
    expect(sanitizeName("AB\nCD", 0)).toBe("ABCD");
  });

  it("caps the length and falls back for anything unusable", () => {
    expect(sanitizeName("X".repeat(40), 0)).toHaveLength(16);
    expect(sanitizeName("   ", 2)).toBe("PLAYER 3");
    expect(sanitizeName(null, 0)).toBe("PLAYER 1");
    expect(sanitizeName(42, 7)).toBe("PLAYER 8");
  });
});

describe("hash32", () => {
  it("stays inside 32 unsigned bits, which is what makes it wire-safe", () => {
    for (const text of ["", "a", "the quick brown fox", "\u{1f680}"]) {
      const value = hash32(text);
      expect(Number.isInteger(value)).toBe(true);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(0xffffffff);
    }
  });
});
