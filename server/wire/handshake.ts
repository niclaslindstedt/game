// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// ADMISSION — everything that happens before a stranger's bytes are allowed to
// mean anything, expressed as pure functions over plain values.
//
// This is a LEAF like the rest of `server/wire/`: no imports beyond its own
// sibling's types, no clock of its own, no randomness of its own. Both are
// passed in, and that is not fastidiousness — a challenge scheme whose clock
// and secret come from the caller is one a test can drive across an epoch
// boundary in a millisecond, and the epoch boundary is exactly where this kind
// of code goes wrong.
//
// **THE CHALLENGE IS A COOKIE, NOT A RECORD.** The obvious design — mint a
// random nonce per probe, remember it, match the join against it — hands
// anybody who can send a packet the ability to make the host allocate memory,
// which is the flood it was supposed to prevent. So the cookie is DERIVED:
// a hash of the session's secret, the peer's address and the current epoch.
// The server stores nothing at all between the probe and the join, and still
// knows the join came from the address the probe did and arrived inside the
// window. That is TCP's SYN-cookie trick, and it is the only shape that is
// stateless on the side being attacked.
//
// **WHAT IT DOES AND DOES NOT PROVE, stated plainly** — because a security
// mechanism whose limits are unwritten gets leaned on past them. It proves the
// joiner can RECEIVE at the address it claims, which is what stops a spoofed
// source address from reaching the session at all. It does not authenticate a
// person, and the password proof beside it is a speed bump rather than a wall:
// a listen server's host can read the password out of their own memory, and
// the listen-server trust model already says the host is a player and the host
// can cheat.
// What both are for is keeping a session between the people invited to it.

import { MAX_CLIENTS } from "./frames.ts";
import type { Handshake, RefusalReason } from "./protocol.ts";
import { refuseHandshake } from "./protocol.ts";

/**
 * How long a cookie stays good for, in ms.
 *
 * A cookie is accepted for its own epoch AND the one before it, so the real
 * window is between one and two of these — 10 to 20 seconds. Long enough for a
 * player on a bad connection to complete a probe-then-join round trip, short
 * enough that a cookie harvested off the wire is worthless by the time anybody
 * has done anything with it.
 */
export const CHALLENGE_EPOCH_MS = 10_000;

/** The epoch a moment falls in. Exported because the hub stamps its own
 * packets with it and a test drives it forward by hand. */
export function challengeEpoch(nowMs: number): number {
  return Math.floor(nowMs / CHALLENGE_EPOCH_MS);
}

/**
 * The cookie a peer at `peerKey` must echo, for `epoch`.
 *
 * `peerKey` is whatever the transport calls one peer — `"1.2.3.4:27015"` for a
 * datagram, a Steam id for a relayed one. It is hashed rather than compared,
 * so the seam owes no format; what matters is only that the same peer produces
 * the same key twice, which is the property the whole scheme rests on.
 */
export function challengeFor(
  secret: number,
  peerKey: string,
  epoch: number,
): number {
  return hash32(`${secret >>> 0}|${peerKey}|${epoch}`);
}

/**
 * True when `cookie` is one this session would have issued to this peer,
 * recently.
 *
 * Both the current epoch and the previous one are accepted, and that second
 * one is the whole reason the window is a range: a probe sent at 9.99 s into
 * an epoch would otherwise be answered with a cookie that expires 10 ms later,
 * and the join carrying it would be refused for a reason the player could do
 * nothing about but try again and hope for better timing.
 */
export function verifyChallenge(
  secret: number,
  peerKey: string,
  cookie: number,
  nowMs: number,
): boolean {
  const epoch = challengeEpoch(nowMs);
  return (
    cookie === challengeFor(secret, peerKey, epoch) ||
    cookie === challengeFor(secret, peerKey, epoch - 1)
  );
}

/**
 * What a client sends instead of the password.
 *
 * Bound to the cookie, so the value is good for one connection attempt from
 * one address inside one window and is useless replayed anywhere else. An
 * empty password proves 0, which is also what a client that was never asked
 * for one sends — so the no-password path needs no special case.
 */
export function passwordProof(password: string, cookie: number): number {
  if (!password) return 0;
  return hash32(`${cookie >>> 0}:${password}`);
}

/** Everything the admission decision is made from. */
export type Admission = {
  /** The session's own handshake, and the joiner's claim. */
  host: Handshake;
  joiner: Handshake;
  /** The session's secret and the key the transport knows this peer by. */
  secret: number;
  peerKey: string;
  /** The cookie the join echoed, and when it arrived. */
  cookie: number;
  nowMs: number;
  /** The session's password, or "" when it has none. */
  password: string;
  /** The proof the join carried. */
  proof: number;
  /** Seats already taken. */
  seats: number;
  /** Seats there are. Defaults to the wire's own cap. */
  maxSeats?: number;
  /** The session is a hardcore game, and the joiner's character is hardcore.
   * Both default false (softcore); a mismatch either way is refused —
   * the two modes never share a game. */
  sessionHardcore?: boolean;
  joinerHardcore?: boolean;
};

/**
 * Decide whether a join may proceed. Null means yes.
 *
 * THE ORDER IS THE DESIGN, and it runs cheapest-and-most-fundamental first for
 * two independent reasons. A protocol mismatch is refused before a hash is
 * computed, so a flood of garbage costs the host almost nothing. And the
 * message a player is shown names the thing they can actually fix rather than
 * a symptom of it — a joiner three versions behind is told to update, not told
 * their password is wrong because the field moved.
 *
 * The challenge is checked BEFORE the password, deliberately: a peer that
 * cannot echo a cookie has not proved it can receive at the address it claims,
 * and answering "wrong password" to a spoofed source address is a small oracle
 * offered for nothing.
 */
export function admit(request: Admission): RefusalReason | null {
  const versionRefusal = refuseHandshake(request.host, request.joiner);
  if (versionRefusal) return versionRefusal;
  if (
    !verifyChallenge(
      request.secret,
      request.peerKey,
      request.cookie,
      request.nowMs,
    )
  ) {
    return "bad-challenge";
  }
  if (request.password) {
    if (request.proof !== passwordProof(request.password, request.cookie)) {
      return "bad-password";
    }
  }
  // HARDCORE NEVER MIXES WITH SOFTCORE: a hardcore hero dying under a
  // softcore host's rules — or the reverse — is a support burden and a
  // betrayal, so the mismatch is refused by name. After the challenge and the
  // password on purpose: the session's mode is on the probe reply anyway, but
  // a peer that has proved nothing should be told nothing it did not already
  // have. Both sides default softcore, so every pre-flag client still admits.
  if (
    (request.sessionHardcore ?? false) !== (request.joinerHardcore ?? false)
  ) {
    return "hardcore-mismatch";
  }
  if (request.seats >= (request.maxSeats ?? MAX_CLIENTS)) return "session-full";
  return null;
}

/**
 * A display name a session is willing to print.
 *
 * A name arrives from a stranger and is drawn into a chat log and a party
 * frame, so it is trimmed, capped, stripped of control characters and given a
 * fallback — never trusted, never used as a key. The cap is the width the
 * roster can show; a longer one is not a lie, it is just cut.
 */
export const MAX_NAME_CHARS = 16;

export function sanitizeName(raw: unknown, slot: number): string {
  if (typeof raw !== "string") return `PLAYER ${slot + 1}`;
  // Control characters and the newline included: a name carrying one would
  // forge a second line in every log that prints it.
  const cleaned = raw
    .replace(/\p{Cc}/gu, "")
    .trim()
    .slice(0, MAX_NAME_CHARS);
  return cleaned || `PLAYER ${slot + 1}`;
}

/**
 * A 32-bit hash of a string — FNV-1a, with `Math.imul` for the multiply.
 *
 * Not a cryptographic hash and not pretending to be one: what it is for is
 * making a cookie unguessable without the secret to somebody who is throwing
 * packets at a port, and making a password proof opaque to a packet capture.
 * `Math.imul` is what keeps it bit-exact — the same choice `src/lib/rng.ts`
 * makes, and for the same reason: a float multiply loses the low bits and two
 * machines stop agreeing.
 */
export function hash32(text: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}
