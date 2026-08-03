// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE PEER HUB — the one place a stranger's packet turns into a client, and
// the only thing in this feature standing between an open UDP port and the
// simulation.
//
// **NOTHING REACHES THE SESSION BEFORE THE CONNECTION IS ESTABLISHED.** The
// rule, implemented literally: a peer that has not been admitted may send
// exactly two frames — a padded `hello` and a `join` — and every other frame
// from it is dropped without being looked at. Input, commands and chat are only
// parsed for a peer that has already cleared the protocol check, the build
// check, the mod check, the challenge and the password.
//
// **THE HOST IS ADMITTED WITHOUT ANY OF IT, AND THAT IS NOT AN EXCEPTION.**
// The host's own renderer reaches the session over a `MessagePort` inside the
// same machine; there is no address to verify, no version skew possible, and
// no password a player should have to type to play their own game. It is a
// different DOOR, not a privileged client — it is seated by `server/main.ts`
// exactly as a local host always has been, and everything below this line is
// about the door that faces the internet.
//
// FOUR BOUNDS, EACH ANSWERING A DIFFERENT ABUSE:
//
//  1. **A CONNECTIONLESS BUDGET PER ADDRESS.** A `hello` costs the host a
//     hash and a small reply. A million of them costs it a tick. The bucket is
//     per address and refills slowly, so an ordinary retry is free and a flood
//     is answered with silence — never with a refusal, which would itself be a
//     reply worth eliciting.
//  2. **A HALF-OPEN COUNT.** There is none, deliberately, and that is the
//     point of the cookie: nothing is remembered between a `hello` and a
//     `join`, so there is no half-open table to exhaust. If this ever grows
//     one, the flood defence is gone and this comment is the warning.
//  3. **A SEAT CAP.** `MAX_CLIENTS`, checked in `admit`, so a session cannot
//     be filled past what its publish loop was measured for.
//  4. **A PER-SESSION PACKET BUDGET**, and it is the
//     one that covers the peer who got IN. Everything above stops a stranger;
//     none of it stops an admitted client sending sixty thousand chat lines or
//     run commands a second, each of which the session parses, dispatches and
//     broadcasts to everybody else — a seat is a licence to be heard, not a
//     licence to be heard at any rate. So an admitted peer draws on a bucket of
//     its own: over it, packets are DROPPED (the same answer the reliability
//     layer already gives a lost datagram, and one the game recovers from by
//     design), and a peer that stays over it long enough to run up a real DEBT
//     is dropped with a `bye` that says why. Two thresholds rather than one,
//     because a burst on a recovering connection and a flood are different
//     things and treating them alike either kicks a friend or tolerates an
//     attacker.
//
// **AND A REFUSAL IS A `bye`, NOT A SILENCE.** Version skew is the failure mode
// that reaches a player as "random crashes"; a joiner told "one of you needs to
// update" fixes it in a minute, and a joiner told nothing at all files a bug.
// The one exception is the rate limiter above, where answering is the abuse.

import { decodeFrame, encodeFrame } from "../wire/codec.ts";
import {
  admit,
  challengeEpoch,
  challengeFor,
  sanitizeName,
} from "../wire/handshake.ts";
import { FRAME, HELLO_MIN_BYTES, MAX_CLIENTS } from "../wire/frames.ts";
import {
  type ChallengePayload,
  type Handshake,
  type JoinPayload,
  type RefusalReason,
} from "../wire/protocol.ts";
import type { Packet, PeerKey, SendMode, Transport } from "./transport.ts";

/**
 * How many connectionless frames one address may send in a burst, and how fast
 * the allowance comes back.
 *
 * Five is enough for a probe, a retry and a join with room to spare; one per
 * second back is far below what a flood needs and far above what a player's
 * second attempt costs.
 */
const CONNECTIONLESS_BURST = 5;
const CONNECTIONLESS_REFILL_MS = 1_000;

/** How long an idle rate-limit record is kept. A bound on the table, so the
 * defence against a flood is not itself a way to grow memory by flooding. */
const LIMITER_IDLE_MS = 60_000;

/**
 * What an ADMITTED peer may send, per second, before its extras are dropped.
 *
 * Sized off what a client legitimately sends rather than off a round number: an
 * input frame per simulation tick is 60/s, an ack per publish is 20/s, and chat
 * and run commands are a handful between them. 240/s is four times that
 * ceiling, so no honest client comes near it and a flood is throttled within a
 * frame of starting.
 */
const PEER_PACKET_RATE = 240;

/**
 * …and how much of that allowance may be banked and spent at once.
 *
 * A second's worth, because the traffic this covers genuinely arrives in
 * clumps: a client whose connection stalled for a moment delivers everything
 * the reliability layer was holding the instant it recovers, and throttling
 * exactly that is throttling the recovery.
 */
const PEER_PACKET_BURST = PEER_PACKET_RATE;

/**
 * How far past its allowance a peer may run before it is dropped rather than
 * merely throttled.
 *
 * The bucket is allowed to go NEGATIVE, and the debt is what separates the two
 * cases: a burst dips it and the refill pays it back within the second, while a
 * sustained flood drives it down without limit. Ten seconds' worth of excess is
 * long past anything a bad connection produces and short enough that a flood
 * costs the host a couple of thousand dropped packets rather than a session.
 */
const PEER_FLOOD_DEBT = PEER_PACKET_RATE * 10;

/** What the hub needs from the session. Structural rather than the `Session`
 * type itself so the whole admission path can be tested against a stub — the
 * alternative is a test that has to build a level to check a password. */
export type HubSession = {
  addClient(
    id: number,
    send: (frame: ArrayBuffer) => void,
    /**
     * `bot` marks one of the session's OWN autopilot seats — and the hub NEVER
     * sets it. A joiner's frames cannot claim it: the hub builds its seat
     * request by hand in `onJoin` from the fields it chooses to read, so a
     * `bot: true` riding a stranger's join payload is dropped on the floor. A
     * bot that could be claimed from outside would be a free pass out of the
     * XP split and a lever on the horde's pricing.
     */
    seat:
      | boolean
      | { play: boolean; loadout?: unknown; resume?: string; bot?: boolean },
    name?: string,
  ): void;
  removeClient(id: number): void;
  receive(id: number, type: number, seq: number, payload: unknown): void;
  /** How many seats are taken, host included. */
  readonly clientCount: number;
  /** How many of those seats are the session's own BOTS. A bot yields its seat
   * to an arriving person, so the admission desk's seat-cap check must not
   * count them — absent (a stub, an older session) means none. */
  readonly botClients?: number;
};

export type HubOptions = {
  session: HubSession;
  /** The session's own handshake — what a joiner's is compared against. */
  handshake: Handshake;
  /** The session's password, or "" for an open game. */
  password?: string;
  /** Seats, host included. */
  maxClients?: number;
  /**
   * Admit peers over a transport that is not Steam's.
   *
   * **DEFAULT FALSE, AND IT IS A LICENCE SWITCH RATHER THAN A DEBUG ONE.**
   * Multiplayer is licensed through Steam and nowhere else, so
   * the shipped game never sets this: a session carried over a raw UDP socket
   * is unlicensed play whoever set it up. It exists for the repo's own suites
   * and the headless soak, which talk to a loopback socket with no Steam
   * anywhere near them.
   *
   * It is an OPTION rather than an environment variable on purpose — an env var
   * is a thing a player can set, and this must not be one.
   */
  allowUnlicensedTransport?: boolean;
  /** The session is a HARDCORE game (`SessionParams.hardcore`): only
   * hardcore characters are admitted — and a softcore session admits only
   * softcore ones. Defaults false. */
  hardcore?: boolean;
  /** The per-session challenge secret. Passed in rather than minted here
   * because this module has no randomness of its own — see `wire/handshake.ts`
   * for why that is the rule and not an inconvenience. */
  secret: number;
  now(): number;
  /** A line for the host's own log. Refusals are worth seeing; a flood is not,
   * so the limiter is silent. */
  log?(message: string): void;
};

export type PeerHub = {
  /** Take a transport under management. It is `listen`ed immediately. */
  add(transport: Transport): Promise<void>;
  /** Pump every transport and expire the rate-limit table. */
  tick(): void;
  /** Remove one admitted peer — a kick, or a host shutting the door. */
  kick(clientId: number, reason: string): void;
  /** How the session names a peer, for the roster. */
  nameOf(clientId: number): string;
  /** Round trip to one peer in ms, or -1 when nothing can measure it. */
  pingOf(clientId: number): number;
  /** Close every transport and forget every peer. */
  close(): void;
};

export function createPeerHub(options: HubOptions): PeerHub {
  const maxClients = options.maxClients ?? MAX_CLIENTS;
  const password = options.password ?? "";
  const transports: Transport[] = [];

  /** An admitted peer. A peer that has not been admitted has no record at all
   * — see bound 2 in the header. */
  type Admitted = {
    id: number;
    key: PeerKey;
    name: string;
    transport: Transport;
    /** Packets this peer may still send. Refilled from the clock, allowed to
     * go negative — see `PEER_FLOOD_DEBT`. */
    tokens: number;
    /** When `tokens` was last topped up. */
    filledAt: number;
  };
  const byKey = new Map<PeerKey, Admitted>();
  const byId = new Map<number, Admitted>();
  /** Client ids start above the host's, which `server/main.ts` owns. */
  let nextClientId = 100;

  /** Tokens left, and when they were last topped up. */
  const limiter = new Map<string, { tokens: number; at: number }>();

  function allow(key: PeerKey): boolean {
    const at = options.now();
    // The BUCKET IS KEYED ON THE ADDRESS, NOT THE ADDRESS AND PORT: a flood
    // trivially varies its source port, and a limiter that counted those would
    // hand every attacker a fresh allowance per packet.
    const bucketKey = addressOf(key);
    const held = limiter.get(bucketKey);
    if (!held) {
      limiter.set(bucketKey, { tokens: CONNECTIONLESS_BURST - 1, at });
      return true;
    }
    const refill = Math.floor((at - held.at) / CONNECTIONLESS_REFILL_MS);
    if (refill > 0) {
      held.tokens = Math.min(CONNECTIONLESS_BURST, held.tokens + refill);
      held.at += refill * CONNECTIONLESS_REFILL_MS;
    }
    if (held.tokens <= 0) return false;
    held.tokens--;
    return true;
  }

  /**
   * Spend one packet of an admitted peer's budget.
   *
   * Returns false when the packet should be DROPPED and never reaches the
   * session. A peer that has run its debt past `PEER_FLOOD_DEBT` is dropped
   * outright — with a `bye`, because it may well be a friend whose client has
   * gone wrong, and "you were disconnected for flooding" is a bug report while
   * silence is a mystery.
   */
  function affordable(peer: Admitted): boolean {
    const at = options.now();
    const elapsed = Math.max(0, at - peer.filledAt);
    peer.filledAt = at;
    peer.tokens = Math.min(
      PEER_PACKET_BURST,
      peer.tokens + (elapsed * PEER_PACKET_RATE) / 1000,
    );
    peer.tokens--;
    if (peer.tokens >= 0) return true;
    if (peer.tokens < -PEER_FLOOD_DEBT) {
      // Named as its own thing rather than folded into `kick`: the reason
      // reaches the host's log, and a session that starts dropping people
      // should say which rule did it.
      peer.transport.send(
        peer.key,
        new Uint8Array(
          encodeFrame(
            { type: FRAME.bye, seq: 0, ack: 0, tick: 0 },
            { reason: "rate-limited" },
          ),
        ),
        "reliable",
      );
      forget(peer.key, "flooding");
    }
    return false;
  }

  /**
   * Send one frame to a peer, choosing the mode from what the frame IS.
   *
   * The session hands over bytes and has no opinion about delivery, which is
   * right: whether a snapshot may be lost is a property of the snapshot, not of
   * the session's mood. A delta is coded against the client's ACKNOWLEDGED
   * baseline, so losing one costs a frame of smoothness and can never desync —
   * and retransmitting it would deliver stale ground late, which is worse than
   * not delivering it. Everything else here is one small packet that has to
   * arrive.
   */
  function sendTo(peer: Admitted, frame: ArrayBuffer): void {
    const type = new Uint8Array(frame)[0] ?? 0;
    const mode: SendMode =
      type === FRAME.delta || type === FRAME.snapshot
        ? "unreliable"
        : "reliable";
    peer.transport.send(peer.key, new Uint8Array(frame), mode);
  }

  /**
   * `detail` travels to the joiner in the `bye`; `note` does not and goes only
   * to this server's own console. They are separate because the two audiences
   * need different sentences — the joiner needs to know they were refused, the
   * operator needs to know what to change — and a refusal that reads well on
   * one screen usually reads as noise on the other.
   */
  function refuse(
    transport: Transport,
    key: PeerKey,
    reason: RefusalReason,
    detail?: string,
    note?: string,
  ): void {
    transport.send(
      key,
      new Uint8Array(
        encodeFrame(
          { type: FRAME.bye, seq: 0, ack: 0, tick: 0 },
          {
            reason,
            detail,
          },
        ),
      ),
      "reliable",
    );
    // Dropped immediately after, which means the refusal goes out ONCE and is
    // never retransmitted. That is deliberate: keeping per-peer state alive so
    // a rejected stranger's `bye` could be retried is precisely the half-open
    // table the cookie exists to avoid, and a joiner who misses it times out
    // and sees "could not reach that session" instead of the better sentence.
    // Best-effort is the right trade; a retained record is not.
    transport.drop(key);
    options.log?.(`net: refused ${key} — ${reason}${note ? ` (${note})` : ""}`);
  }

  function onHello(
    transport: Transport,
    key: PeerKey,
    frameBytes: number,
  ): void {
    // THE ANTI-REFLECTION CHECK. An unpadded probe is dropped in silence: a
    // spoofed source address must not be able to make this host send more bytes
    // than it received, and answering "you did not pad it" would be a reply of
    // exactly the kind the rule forbids.
    if (frameBytes < HELLO_MIN_BYTES) return;
    const payload: ChallengePayload = {
      cookie: challengeFor(options.secret, key, challengeEpoch(options.now())),
      protocol: options.handshake.protocol,
      build: options.handshake.build,
      needsPassword: password.length > 0,
      players: options.session.clientCount,
      maxPlayers: maxClients,
      // On the probe so the JOIN screen can show the constraint up front; the
      // real refusal is `admit`'s hardcore gate.
      hardcore: options.hardcore ?? false,
    };
    transport.send(
      key,
      new Uint8Array(
        encodeFrame(
          { type: FRAME.challenge, seq: 0, ack: 0, tick: 0 },
          payload,
        ),
      ),
      "unreliable",
    );
  }

  /**
   * MAY A SESSION BE CARRIED OVER THIS TRANSPORT AT ALL?
   *
   * The Steam relay always; anything else only where the thing that BUILT the
   * host said so. The repo's own tests and the headless soak are the plainest
   * case — they run over a loopback UDP socket with no Steam anywhere near
   * them — and it is an OPTION on the hub rather than an environment variable
   * precisely so it stays a property of the build rather than of a file
   * somebody can edit on an installed copy.
   */
  function licensedTransport(transport: Transport): boolean {
    if (options.allowUnlicensedTransport) return true;
    return transport.id === "steam";
  }

  function onJoin(transport: Transport, key: PeerKey, payload: unknown): void {
    if (byKey.has(key)) return; // already in; a duplicate join is not a re-seat
    const join = payload as Partial<JoinPayload> | null;
    if (!join || typeof join !== "object" || !join.handshake) {
      refuse(transport, key, "protocol-mismatch", "malformed join");
      return;
    }
    // **MULTIPLAYER IS LICENSED THROUGH STEAM AND NOWHERE ELSE.**
    // The game ships under PolyForm-Noncommercial, and the multiplayer right
    // travels with the Steam copy — so a session carried by anything other than
    // the Steam relay is unlicensed play, whoever set it up and whatever they
    // meant by it. That is a licence fact rather than a security one, and it is
    // enforced HERE because the hub is the one door: every path into a session
    // — the game's own HOST, the server browser, JOIN BY ADDRESS, the dedicated
    // server — comes through this function.
    //
    // **THE CHECK IS THE TRANSPORT'S OWN NAME, NOT A TICKET.** `Transport.id`
    // already distinguishes the two, and a peer that reached us over the Steam
    // relay reached us through Steam's own matchmaking with a Steam identity
    // behind it — there is nothing to validate that Valve has not already
    // validated. A ticket scheme layered on top would be a second, weaker copy
    // of that fact, and one this repo cannot honestly test.
    //
    // It sorts FIRST because it is the most fundamental thing that can be wrong
    // and the cheapest to answer: a peer that may not be here at all should not
    // have its build, its mods or its password looked at. And it fails CLOSED —
    // an unrecognised transport is refused, so the next one added is licensed
    // deliberately rather than by having been forgotten.
    if (!licensedTransport(transport)) {
      // SAID OUT LOUD ON THE CONSOLE, because this is the one refusal whose
      // cause is not on the joiner's end at all: they did nothing wrong, the
      // server was simply never claimed for. An operator watching people fail
      // to connect needs the reason and the remedy in the same line, or the
      // only visible symptom is a server everybody bounces off.
      refuse(
        transport,
        key,
        "unlicensed",
        `transport ${transport.id}`,
        "this session holds no multiplayer licence — start it with --licensed",
      );
      return;
    }
    const refusal = admit({
      host: options.handshake,
      joiner: normalizeHandshake(join.handshake),
      secret: options.secret,
      peerKey: key,
      cookie: Number(join.cookie) || 0,
      nowMs: options.now(),
      password,
      proof: Number(join.proof) || 0,
      // Bot seats do not count against the cap: each one YIELDS to an arriving
      // person (`server/session.ts`), so a session full of the host's own
      // autopilot heroes still has room for everybody it was sized for.
      seats: options.session.clientCount - (options.session.botClients ?? 0),
      maxSeats: maxClients,
      // Hardcore never mixes with softcore. The joiner's flag is a claim
      // off the frame like the loadout beside it — coerced, never trusted
      // past what the trust model already says about a listen server — and
      // the mismatch is refused by name either way round.
      sessionHardcore: options.hardcore ?? false,
      joinerHardcore: join.hardcore === true,
    });
    if (refusal) {
      refuse(transport, key, refusal, detailFor(refusal, options.handshake));
      return;
    }
    const id = nextClientId++;
    const peer: Admitted = {
      id,
      key,
      // The slot is not known until the session seats them, and a name has to
      // exist before then for the fallback to read sensibly; the session's own
      // count is the closest honest guess and is only ever a default.
      name: sanitizeName(join.name, options.session.clientCount),
      transport,
      tokens: PEER_PACKET_BURST,
      filledAt: options.now(),
    };
    byKey.set(key, peer);
    byId.set(id, peer);
    // A JOINER IS SEATED. They arrive with the hero they brought — the
    // `loadout` on their own join frame — and the session appends a seat for
    // it and answers with the seat number in the `welcome`. The client never
    // names its own seat, which is what stops a stranger claiming somebody
    // else's character; a party already at the cap simply watches instead.
    //
    // The NAME travels with the seat. Without it the roster and every chat
    // line would fall back to "PLAYER N" for somebody who told us what they
    // are called, and the fallback would look like the feature.
    options.session.addClient(
      id,
      (frame) => sendTo(peer, frame),
      // The RESUME ticket rides the join beside the loadout (see
      // `docs/multiplayer.md` → Reconnect). The
      // hub does not read it — a ticket names a SEAT, and seats are the
      // session's business — it only refuses to lose it on the way past.
      {
        play: true,
        loadout: join.loadout ?? null,
        resume: typeof join.resume === "string" ? join.resume : undefined,
      },
      peer.name,
    );
    options.log?.(`net: ${peer.name} joined from ${key}`);
  }

  function onPacket(transport: Transport, packet: Packet): void {
    const known = byKey.get(packet.from);
    if (known) {
      // THE BUDGET IS SPENT BEFORE THE FRAME IS PARSED, which is the whole
      // point of it: a decode is the cheapest thing the session does with a
      // packet and still the thing a flood is trying to buy in bulk.
      if (!affordable(known)) return;
      const frame = decodeFrame(packet.data);
      if (!frame) return;
      // An admitted peer's frames go straight to the session, which owns what
      // an input, a command or a chat line may do. It refuses a spectator's
      // steering itself — the one place a client cannot argue with it.
      options.session.receive(known.id, frame.type, frame.seq, frame.payload);
      return;
    }
    const frame = decodeFrame(packet.data);
    if (!frame) return;
    // Not admitted: two frames are permitted and both are rate limited.
    if (frame.type !== FRAME.hello && frame.type !== FRAME.join) return;
    if (!allow(packet.from)) {
      // **A REFUSED JOIN IS TOLD; A REFUSED HELLO IS NOT**, and the asymmetry is
      // the anti-reflection rule doing its job rather than an inconsistency.
      //
      // A `hello` is answered with SILENCE because a hello is the amplification
      // vector: it is padded to `HELLO_MIN_BYTES` precisely so no reply can be
      // larger than the request, and a refusal packet sent to a spoofed source
      // address is the abuse this rule exists to prevent. A hello is also
      // retried by every joiner, so silence costs half a second.
      //
      // A `join` is a different animal. It arrives from an address that already
      // completed the challenge round trip — so it is not spoofed — it is far
      // larger than this reply, and NOTHING RETRIES IT: it travelled reliable,
      // which means the reliability layer under this one already acknowledged
      // the datagram, so dropping it here loses it for good. Left silent, a
      // legitimate player behind a busy address (a household, a LAN party, a
      // soak driving eight clients out of one loopback) waits out the joiner's
      // fifteen-second deadline and is told "the session stopped answering",
      // which is a lie about which rule refused them.
      if (frame.type === FRAME.join) {
        transport.send(
          packet.from,
          new Uint8Array(
            encodeFrame(
              { type: FRAME.bye, seq: 0, ack: 0, tick: 0 },
              { reason: "rate-limited" },
            ),
          ),
          "unreliable",
        );
      }
      return;
    }
    if (frame.type === FRAME.hello) {
      // The whole frame as it arrived — header included, reliability header
      // already stripped — which is what `HELLO_MIN_BYTES` is measured
      // against: the padding has to be in the thing the attacker had to send,
      // not in a framing this side added afterwards.
      onHello(transport, packet.from, packet.data.byteLength);
      return;
    }
    onJoin(transport, packet.from, frame.payload);
  }

  function forget(key: PeerKey, reason: string): void {
    const peer = byKey.get(key);
    if (!peer) return;
    byKey.delete(key);
    byId.delete(peer.id);
    peer.transport.drop(key);
    options.session.removeClient(peer.id);
    options.log?.(`net: ${peer.name} left — ${reason}`);
  }

  return {
    async add(transport) {
      transports.push(transport);
      await transport.listen({
        onPacket: (packet) => onPacket(transport, packet),
        onPeerLost: (peer, reason) => forget(peer, reason),
        onError: (detail) => options.log?.(`net: ${transport.id} — ${detail}`),
      });
    },

    tick() {
      for (const transport of transports) transport.tick();
      const at = options.now();
      for (const [key, entry] of limiter) {
        if (at - entry.at > LIMITER_IDLE_MS) limiter.delete(key);
      }
    },

    kick(clientId, reason) {
      const peer = byId.get(clientId);
      if (!peer) return;
      peer.transport.send(
        peer.key,
        new Uint8Array(
          encodeFrame(
            { type: FRAME.bye, seq: 0, ack: 0, tick: 0 },
            {
              reason: "kicked",
              detail: reason,
            },
          ),
        ),
        "reliable",
      );
      forget(peer.key, reason);
    },

    nameOf(clientId) {
      return byId.get(clientId)?.name ?? "";
    },

    pingOf(clientId) {
      const peer = byId.get(clientId);
      return peer ? peer.transport.ping(peer.key) : -1;
    },

    close() {
      for (const transport of transports) transport.close();
      transports.length = 0;
      byKey.clear();
      byId.clear();
      limiter.clear();
    },
  };
}

/**
 * A handshake this build is willing to compare against its own.
 *
 * The claim came from a stranger, so every field is coerced rather than
 * trusted: a `mods` that is not an array would otherwise reach `refuseHandshake`
 * and throw on `.length`, inside the host's own tick, from one malformed
 * packet.
 */
function normalizeHandshake(raw: unknown): Handshake {
  const claim = raw as Partial<Handshake> | null;
  return {
    protocol: Number(claim?.protocol) || 0,
    build: typeof claim?.build === "string" ? claim.build : "",
    mods: Array.isArray(claim?.mods)
      ? claim.mods.filter((id): id is string => typeof id === "string")
      : [],
  };
}

/** The half of a refusal only the host can supply — the numbers the player is
 * being asked to reconcile. */
function detailFor(reason: RefusalReason, host: Handshake): string | undefined {
  if (reason === "protocol-mismatch") return `HOST PROTOCOL ${host.protocol}`;
  if (reason === "build-mismatch") return `HOST BUILD ${host.build}`;
  if (reason === "mod-mismatch") {
    return host.mods.length ? host.mods.join(", ") : "THE HOST HAS NO MODS ON";
  }
  return undefined;
}

/** The address half of a peer key, for the rate limiter. */
function addressOf(key: PeerKey): string {
  if (key.startsWith("[")) {
    const close = key.indexOf("]:");
    return close < 0 ? key : key.slice(0, close + 1);
  }
  const at = key.lastIndexOf(":");
  return at < 0 ? key : key.slice(0, at);
}
