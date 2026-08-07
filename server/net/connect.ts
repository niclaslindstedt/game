// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE JOINER'S SIDE OF THE DOOR — the half the admission desk never needed.
//
// `hub.ts` is the host's admission desk: it answers a padded `hello` with a
// challenge and turns a `join` into a seat. Nothing anywhere spoke the OTHER
// side of that conversation when the wire landed — the title-menu JOIN screens
// are where a player first gets to walk through it. This is that side, and it is
// deliberately the SMALLEST thing that can be: a state machine with three
// states, no game knowledge at all, and one job past admission — carry bytes.
//
// **IT LIVES BESIDE THE HUB, NOT IN THE SHELL OR IN THE PAGE**, for the two
// reasons the transport seam itself lives here (see `transport.ts`). The page
// cannot open a UDP socket at all, and the dedicated server has no shell to
// put one in — so the
// connector sits with the transport it drives, in the process that already
// holds one, and the renderer reaches it down the same `MessagePort` a HOST's
// renderer already uses. That is what makes the page's `NetClient` identical on
// both paths: it speaks frames to a port and never learns whether the session
// is one process away or one continent.
//
// **THE CLIENT CHECKS WHAT THE CHALLENGE TOLD IT, AND THE HOST STILL DECIDES.**
// A challenge carries the session's protocol, its build and whether a password
// is wanted, which is enough to refuse a skew in ONE round trip with the two
// numbers named — rather than sending a join the host will drop and leaving the
// player watching a spinner time out. That is not a second copy of the admission
// rules: `refuseHandshake` is the SAME function `admit` runs, called here on the
// data the host volunteered, and every refusal that matters still comes back as
// the host's own `bye`.
//
// **A `hello` IS RETRIED; A `join` IS NOT.** The probe goes out unreliable (it
// is answered unreliably too — see `onHello`), so losing either end of it is
// ordinary and the fix is to ask again. The join goes RELIABLE, which means the
// reliability layer under the transport already retransmits it until it is
// acknowledged; sending a second one would earn the duplicate-join branch the
// hub has, for nothing. What remains is a deadline, because a host that
// acknowledges a join and then says nothing is indistinguishable from one that
// crashed between the two.

import { decodeFrame, encodeFrame } from "../wire/codec.ts";
import { CHALLENGE_EPOCH_MS, passwordProof } from "../wire/handshake.ts";
import { FRAME, HELLO_MIN_BYTES } from "../wire/frames.ts";
import {
  refuseHandshake,
  type ByePayload,
  type ChallengePayload,
  type Handshake,
  type HelloPayload,
  type JoinPayload,
  type WelcomePayload,
  type RefusalReason,
} from "../wire/protocol.ts";
import type { PeerKey, Transport } from "./transport.ts";

/** How often an unanswered probe is sent again. */
const HELLO_RETRY_MS = 500;
/** How many probes go unanswered before the address is called dead. Six
 * seconds of asking: long enough for a slow route and a busy host, short enough
 * that a player who mistyped an address finds out while they still remember
 * typing it. */
const HELLO_ATTEMPTS = 12;
/** How long a session may take to answer an acknowledged join. Its own deadline
 * rather than the probe's, because by here the host is provably reachable and
 * what is being waited on is a level being built. */
const WELCOME_TIMEOUT_MS = 15_000;

/**
 * How long to wait before knocking again after a host said TOO MANY ATTEMPTS.
 *
 * The hub's connectionless bucket is keyed on the ADDRESS rather than the
 * address and port — a flood trivially varies its source port — so everyone
 * behind one address shares one allowance of five, refilled once a second. That
 * is the right rule and it makes a perfectly ordinary case fail: a household
 * where two people join the same friend, a LAN party, a dedicated server's own
 * soak driving eight clients out of one loopback. None of those is abuse, and
 * the correct answer to a rate limit has always been to WAIT, not to give up.
 *
 * Comfortably over the one-per-second refill, so a retry is met by a token that
 * exists rather than by a second refusal.
 */
const RATE_LIMIT_BACKOFF_MS = 1_500;

/**
 * How many times a BUSY host may say wait before the attempt is given up on.
 *
 * Its own budget rather than the probe's, because the two answer different
 * questions. The probe's twelve tries ask "IS ANYBODY THERE?", and its whole
 * design point is that a player who mistyped an address finds out while they
 * still remember typing it. A `rate-limited` reply has already answered that:
 * somebody is plainly there, they issued us a challenge, and the only thing
 * left is a queue. Charging the wait against the find-the-host budget made a
 * contended address indistinguishable from a wrong one — four clients out of
 * one loopback burned six seconds of retries and reported "no session".
 *
 * Twenty at a second and a half is half a minute of patience for a host that
 * keeps saying no, which is longer than any honest queue and short enough that
 * a host refusing for ever still terminates.
 */
const RATE_LIMIT_ATTEMPTS = 20;

/**
 * The padding, made once.
 *
 * `HELLO_MIN_BYTES` is measured against the whole decoded frame, so padding to
 * that many characters is comfortably over it once the header and the JSON
 * envelope are counted. Deliberately over rather than exactly at: the rule is
 * the host's and a client that sat one byte the wrong side of it would be
 * dropped in the silence the anti-reflection rule demands, which is the least
 * debuggable failure this feature can have.
 */
const HELLO_PAD = "-".repeat(HELLO_MIN_BYTES);

export type JoinLinkOptions = {
  transport: Transport;
  /** The host, as the transport names one: `"1.2.3.4:27015"` for a datagram, a
   * Steam id for a relayed peer. */
  host: PeerKey;
  /** This build's own handshake, compared with the session's. */
  handshake: Handshake;
  /** What this player is called in the roster and in chat. */
  name: string;
  /** The session's password, or "" — an empty one proves 0, which is what a
   * client that was never asked for one sends anyway. */
  password?: string;
  /**
   * A RECONNECT TICKET from an earlier welcome to this same session, or
   * undefined for a first join.
   *
   * Presenting one resumes the hero that is standing on the field rather than
   * being built a fresh one, which is the difference between a dropped packet
   * costing a frame and it costing an hour. A ticket the session no longer
   * holds is simply not one and the join proceeds as an ordinary arrival — so
   * this is always worth sending when there is one, and never worth waiting to
   * find out about.
   */
  resume?: string;
  /** The arriving character is HARDCORE. Compared against the session's
   * mode — locally off the challenge, so the mismatch is answered without a
   * join round trip, and again at the host's own door. Absent = softcore. */
  hardcore?: boolean;
  /** The hero this player brings: their banked loadout as plain JSON,
   * or null for the authored fresh start. Rides the join frame; the session
   * weighs it (`validateLoadout`) — a claim, never an authority. */
  loadout?: unknown;
  now(): number;
  /** One frame for the renderer, exactly as it arrived. */
  deliver(frame: Uint8Array): void;
  /** The session welcomed us. Fired once, with the RECONNECT TICKET the
   * welcome carried (undefined for a spectator, who has no hero to come back
   * to) so the caller can present it if this connection drops. */
  onAdmitted(resume?: string): void;
  /**
   * The attempt is over and no game will be played: a refusal from the host, a
   * skew this side spotted in the challenge, or an address nobody answered.
   *
   * The link is closed by the time this fires — there is nothing to retry with,
   * because a `join` the host refused took its peer record with it.
   */
  onClosed(reason: RefusalReason | ByePayload["reason"], detail?: string): void;
  log?(line: string): void;
};

export type JoinLink = {
  /** Open the socket and send the first probe. */
  start(): Promise<void>;
  /** One frame from the renderer, on its way to the host. Dropped before
   * admission: nothing the page can say is meaningful to a session that has not
   * seated it, and the hub would drop it unlooked-at anyway. */
  send(frame: Uint8Array): void;
  /** Retry the probe, mind the deadlines, pump the transport. Called from the
   * process's own clock — there is no timer below this line, exactly as on the
   * host path (see `transport.ts`'s `tick`). */
  tick(): void;
  close(): void;
};

export function createJoinLink(options: JoinLinkOptions): JoinLink {
  const { transport, host } = options;
  let phase: "probing" | "joining" | "busy" | "live" | "done" = "probing";
  let attempts = 0;
  let busyRetries = 0;
  let lastProbeAt = 0;
  let joinedAt = 0;
  /** The join we sent, kept so a BUSY host can be knocked at again without
   * spending a second token on a fresh challenge. See {@link RATE_LIMIT_ATTEMPTS}. */
  let pending: { join: JoinPayload; cookieAt: number } | null = null;
  let retryAt = 0;

  function finish(
    reason: RefusalReason | ByePayload["reason"],
    detail?: string,
  ): void {
    if (phase === "done") return;
    phase = "done";
    transport.close();
    options.onClosed(reason, detail);
  }

  function probe(): void {
    attempts++;
    lastProbeAt = options.now();
    const payload: HelloPayload = {
      protocol: options.handshake.protocol,
      pad: HELLO_PAD,
    };
    transport.send(
      host,
      new Uint8Array(
        encodeFrame({ type: FRAME.hello, seq: 0, ack: 0, tick: 0 }, payload),
      ),
      "unreliable",
    );
  }

  /**
   * The challenge came back: refuse a skew here, or send the join.
   *
   * A repeat challenge (the probe was retried and both answers arrived) is
   * ignored rather than answered with a second join — the cookie the first one
   * carried is good for its whole epoch, and a second join is the duplicate the
   * hub has to have a branch for.
   */
  function onChallenge(payload: ChallengePayload): void {
    if (phase !== "probing") return;
    const theirs: Handshake = {
      protocol: Number(payload.protocol) || 0,
      build: typeof payload.build === "string" ? payload.build : "",
      // A challenge does not carry the host's mod list — it is answered before
      // anything is known about the asker, and a list of ids is not something
      // to hand a stranger. The mod check is therefore the host's alone and
      // comes back as a `bye`, which is the one refusal in the order this side
      // cannot pre-empt.
      mods: options.handshake.mods,
    };
    const skew = refuseHandshake(theirs, options.handshake);
    if (skew) {
      finish(skew, detailFor(skew, theirs, options.handshake));
      return;
    }
    // The hardcore admission gate, pre-empted the way a protocol skew is: the probe
    // reply names the session's mode, so a mismatch is answered here without
    // spending the join round trip. The host still refuses it at the door —
    // this is a courtesy, not the enforcement.
    if ((payload.hardcore === true) !== (options.hardcore === true)) {
      finish("hardcore-mismatch");
      return;
    }
    const cookie = Number(payload.cookie) || 0;
    const join: JoinPayload = {
      cookie,
      handshake: options.handshake,
      proof: passwordProof(options.password ?? "", cookie),
      name: options.name,
      resume: options.resume,
      hardcore: options.hardcore === true,
      // The hero travels with the player. On a RECONNECT the session
      // ignores this by design — the hero standing on the field is the
      // authoritative one.
      loadout: options.loadout ?? null,
    };
    pending = { join, cookieAt: options.now() };
    sendJoin();
    options.log?.(`net: joining ${host}`);
  }

  /** Put the held join on the wire and start its deadline. */
  function sendJoin(): void {
    if (!pending) return;
    phase = "joining";
    joinedAt = options.now();
    transport.send(
      host,
      new Uint8Array(
        encodeFrame(
          { type: FRAME.join, seq: 0, ack: 0, tick: 0 },
          pending.join,
        ),
      ),
      "reliable",
    );
  }

  function onFrame(data: Uint8Array): void {
    const frame = decodeFrame(data);
    // Undecodable bytes are dropped in silence: this socket is open to the
    // internet and a stray datagram is an ordinary event, not an error.
    if (!frame) return;
    if (frame.type === FRAME.challenge) {
      onChallenge((frame.payload ?? {}) as ChallengePayload);
      return;
    }
    if (frame.type === FRAME.bye) {
      const bye = (frame.payload ?? {}) as ByePayload;
      // **TOO MANY ATTEMPTS IS A WAIT, NOT A REFUSAL.** It is the one `bye` that
      // says nothing about whether we may play — only that the host's
      // connectionless allowance was empty at the moment we knocked, which is
      // an ordinary thing to be when several people share an address. So it
      // goes back to probing rather than ending the attempt, and it is
      // deliberately NOT forwarded: the JOIN screen would word it as a failure
      // and the player would close a dialog over something that resolves
      // itself in a second and a half. A host that means it will simply refuse
      // again until the probe budget runs out, and THAT ending is reported.
      if (bye.reason === "rate-limited" && phase === "joining") {
        if (++busyRetries > RATE_LIMIT_ATTEMPTS) {
          options.deliver(data);
          finish("rate-limited");
          return;
        }
        // **THE JOIN IS RE-SENT, NOT THE WHOLE HANDSHAKE.** The cookie we hold
        // is good for its epoch and the one before it, so going back to the
        // probe would spend a SECOND token of the very allowance that just ran
        // out — two tokens per attempt against a bucket refilling at one a
        // second, which is a queue that never drains. Re-knocking with what we
        // already have costs one.
        phase = "busy";
        retryAt = options.now() + RATE_LIMIT_BACKOFF_MS;
        // The probe budget is RESET rather than spent: this refusal is proof
        // the host exists, which is the very question those attempts were
        // asking. The wait is bounded by {@link RATE_LIMIT_ATTEMPTS} instead.
        attempts = 0;
        options.log?.(`net: ${host} is busy — retrying`);
        return;
      }
      // FORWARDED FIRST, THEN ACTED ON. The page's own client words a refusal
      // for the JOIN screen, and a `bye` that only reached the control channel
      // would leave a live session's ending unexplained on the one surface the
      // player is looking at.
      options.deliver(data);
      finish(bye.reason ?? "shutdown", bye.detail);
      return;
    }
    if (frame.type === FRAME.welcome && phase !== "live") {
      phase = "live";
      const welcome = (frame.payload ?? {}) as WelcomePayload;
      options.onAdmitted(
        typeof welcome.resume === "string" ? welcome.resume : undefined,
      );
    }
    options.deliver(data);
  }

  return {
    async start() {
      await transport.listen({
        onPacket: (packet) => {
          // A packet from anybody but the host is dropped. The session we are
          // talking to is the one we asked for; anything else arriving on this
          // socket is a stranger scanning ports.
          if (packet.from !== host) return;
          onFrame(packet.data);
        },
        onPeerLost: (peer, reason) => {
          if (peer !== host) return;
          // **SILENCE FROM A HOST THAT TOLD US TO WAIT IS NOT A DEAD HOST.**
          // The reliability layer calls a peer dead after ten seconds without a
          // word, and a busy address can easily be quiet for longer than that
          // while its allowance refills — so eight clients out of one loopback
          // had two of them declare a perfectly healthy server unreachable.
          // The peer record is already gone by here (that is what being
          // declared dead means), so the honest move is to start the handshake
          // over: a fresh probe rebuilds both sides cleanly, and the cookie we
          // were holding is past its epoch by now anyway. Bounded by
          // `busyRetries`, so a host that is genuinely gone still ends.
          if (phase === "busy" && busyRetries <= RATE_LIMIT_ATTEMPTS) {
            pending = null;
            phase = "probing";
            attempts = 0;
            probe();
            return;
          }
          finish("no-session", reason);
        },
        onError: (detail) => finish("no-session", detail),
      });
      if (phase === "probing") probe();
    },

    send(frame) {
      if (phase !== "live") return;
      // The MODE is chosen from what the frame IS, exactly as the hub chooses
      // it in the other direction: an input frame carries the current state of
      // the stick and the next one supersedes it, so retransmitting a lost one
      // delivers stale steering late. VOICE is unreliable for the sharper
      // version of the same rule — 20 ms of speech is worth nothing after the
      // word it belonged to has been heard. Everything else the page sends — a
      // command, a chat line, the ack — has to arrive.
      const type = frame[0] ?? 0;
      transport.send(
        host,
        frame,
        type === FRAME.input || type === FRAME.ack || type === FRAME.voice
          ? "unreliable"
          : "reliable",
      );
    },

    tick() {
      if (phase === "done") return;
      transport.tick();
      const at = options.now();
      if (phase === "busy" && at >= retryAt) {
        // A cookie the host will no longer honour is worse than no cookie: the
        // join would be refused as a forgery rather than queued. Past its epoch
        // the handshake starts over, which costs the extra token but is the
        // only thing that can still work.
        if (pending && at - pending.cookieAt < CHALLENGE_EPOCH_MS) sendJoin();
        else {
          pending = null;
          phase = "probing";
          probe();
        }
        return;
      }
      if (phase === "probing" && at - lastProbeAt >= HELLO_RETRY_MS) {
        if (attempts >= HELLO_ATTEMPTS) {
          finish("no-session");
          return;
        }
        probe();
        return;
      }
      if (phase === "joining" && at - joinedAt >= WELCOME_TIMEOUT_MS) {
        finish("no-session", "the session stopped answering");
      }
    },

    close() {
      if (phase === "done") return;
      phase = "done";
      transport.close();
    },
  };
}

/** The half of a refusal only the numbers can supply. Both sides are always
 * named: a mismatch a player can act on beats one they can only report. */
function detailFor(
  reason: RefusalReason,
  theirs: Handshake,
  mine: Handshake,
): string | undefined {
  if (reason === "protocol-mismatch") {
    return `PROTOCOL ${mine.protocol} HERE, ${theirs.protocol} THERE`;
  }
  if (reason === "build-mismatch") {
    return `BUILD ${mine.build} HERE, ${theirs.build} THERE`;
  }
  return undefined;
}
