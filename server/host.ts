// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// HOSTING A SESSION — the session, the admission desk, the sockets, the router
// mapping and the one clock that drives all four, wired together once.
//
// **THIS MODULE EXISTS SO THE PLAN'S §5.5 CAN BE TRUE.** It says the dedicated
// server "is the same file" as the utility-process one, and the only way to make
// that hold rather than merely claim it is to have one implementation with two
// thin entries on top: `main.ts` when Electron forked this process and handed it
// a control channel, `dedicated.ts` when a person ran it from a terminal. What
// would otherwise be duplicated is precisely the part that must not be — a
// FIXED-TIMESTEP LOOP, whose second copy drifts from the first silently and only
// under load.
//
// **NOTHING HERE KNOWS WHY IT IS RUNNING.** No Electron, no control channel, no
// `MessagePort`, no Steam. The two entries supply what differs: how a client's
// bytes arrive (a port, or a socket), where a log line goes, and — the only
// genuinely platform-shaped one — the STEAM relay, which stays in the shell
// because `steamworks.init()` is a single global handshake the main process
// owns. A dedicated server simply never adds one, which is the whole of what
// "no Steam dependency" means here.
//
// **AND IT OWNS THE ONLY TIMER ABOVE THE TRANSPORT.** The session's `advance`
// pays for REAL elapsed time rather than one tick per callback, because a timer
// that fires late — and they all do under load — would otherwise run the
// simulation slow: internally consistent, and drifting away from every clock the
// player can see and from the other seven players besides. The retransmits, the
// rate limiter's expiry, the reconnect sweep and the router lease all hang off
// this same call; nothing below it owns a timer of its own (see
// `net/transport.ts`).

import { engineVersion, type FrozenRun } from "@game/core";

import { createPeerHub, type PeerHub } from "./net/hub.ts";
import type { Bound, Transport } from "./net/transport.ts";
import { createUdpTransport } from "./net/udp.ts";
import {
  behindNat,
  createPortMapper,
  type MappingState,
  type PortMapper,
} from "./net/upnp.ts";
import { createSession, type Session, type SessionPeers } from "./session.ts";
import {
  MAX_CLIENTS,
  PROTOCOL_VERSION,
  TICK_MS,
  type SessionParams,
} from "./wire/protocol.ts";

export type HostOptions = {
  params: SessionParams;
  /** The session's mod ids, in load order. Both ends compare them. */
  mods?: string[];
  /** The session's password, or "" for an open game. */
  password?: string;
  /**
   * Admit peers over a transport that is not Steam's — see
   * `HubOptions.allowUnlicensedTransport`. Multiplayer is licensed through
   * Steam and nowhere else (decision 15), so the shipped game never sets this;
   * it exists for the repo's suites and the headless soak.
   */
  allowUnlicensedTransport?: boolean;
  /** Seats, host included. */
  maxClients?: number;
  /** A run to ADOPT rather than build — a parked run or a checkpoint. */
  adopt?: FrozenRun | null;
  /** NOBODY OWNS THIS SESSION — it is a dedicated server's, standing empty
   * until players connect. See `SessionOptions.ownerless`, which is where the
   * three rules that follow from it are written. */
  ownerless?: boolean;
  /** What the session may ask of whatever owns the peers. Every member has a
   * no-op default; a dedicated server supplies none of them, which is right —
   * it has no invite panel and no Steam. */
  peers?: Partial<SessionPeers>;
  /** Where a line about this session goes. */
  log?(message: string): void;
  /** Monotonic ms. Injected so a test can drive a whole session by hand. */
  now(): number;
};

export type Host = {
  readonly session: Session;
  readonly hub: PeerHub;
  /** Where the socket ACTUALLY ended up, or null while nothing is bound. Never
   * the requested port — see `net/udp.ts` for why that is a rule. */
  readonly bound: Bound | null;
  readonly mapping: MappingState;
  /** Bind a UDP socket and take it under the hub. `port` is what to TRY. */
  openUdp(port?: number): Promise<Bound | null>;
  /** Take some other transport under the hub — the Steam relay, in the shell. */
  addTransport(transport: Transport): Promise<void>;
  /** Ask the router for a mapping, if this machine looks to be behind one.
   * Never throws: a router that refuses is a status row, not an exception. */
  mapPort(): Promise<void>;
  /** Start the fixed-timestep clock. */
  start(): void;
  /** Advance and pump once, by hand. Exposed for a caller that owns its own
   * loop — the tests, and anything that wants the session on its own schedule. */
  pump(): void;
  /** Stop everything, tell every client why, and give the router mapping back. */
  close(reason: string): Promise<void>;
};

/**
 * The per-session secret the challenge cookies and the reconnect tickets are
 * both derived from.
 *
 * Rolled HERE rather than in either leaf, because both of those are pure by
 * design — which is what lets a test drive the cookie scheme across an epoch
 * boundary deterministically. And it is emphatically NOT the engine's seeded
 * rng: that stream is the simulation's, every draw from it is load-bearing for a
 * replay, and a secret taken from a seed a client was TOLD is not a secret.
 */
function rollSecret(): number {
  return (Math.random() * 0xffffffff) >>> 0;
}

export function createHost(options: HostOptions): Host {
  const maxClients = options.maxClients ?? MAX_CLIENTS;
  const secret = rollSecret();
  const { now } = options;

  const session = createSession({
    params: options.params,
    adopt: options.adopt,
    // The BUILD the handshake compares is the engine's own version, read here
    // rather than passed in: two places holding the same string is two places
    // that can disagree, and this process is the only one that has actually
    // loaded the engine it is describing.
    build: engineVersion,
    mods: options.mods,
    maxClients,
    peers: options.peers,
    log: options.log,
    ownerless: options.ownerless,
    secret,
    now,
  });

  const hub = createPeerHub({
    session,
    // Decision 15: multiplayer is licensed through Steam. The host passes the
    // escape straight through rather than deciding it, so the ONE place that
    // may switch it on is whatever built the host — the repo's own suites and
    // the headless soak, never a shipped path.
    allowUnlicensedTransport: options.allowUnlicensedTransport,
    handshake: {
      protocol: PROTOCOL_VERSION,
      build: engineVersion,
      mods: options.mods ?? [],
    },
    password: options.password,
    maxClients,
    secret,
    now,
    log: options.log,
  });

  let bound: Bound | null = null;
  let mapper: PortMapper | null = null;
  let timer: ReturnType<typeof setInterval> | null = null;
  let lastAdvanceMs = 0;
  let closed = false;

  function pump(): void {
    const at = now();
    const elapsed = at - lastAdvanceMs;
    // Whole ticks only — the remainder is left on the clock and paid next
    // callback, which is what keeps the timestep fixed.
    const ran = session.advance(elapsed);
    lastAdvanceMs += ran * TICK_MS;
    hub.tick();
    mapper?.renew(Date.now());
    // A very long stall (a suspended laptop, a host that was swapped out)
    // would otherwise leave a debt the session refuses to pay in one go and
    // never catches up on, so the clock is re-seated past what one advance can
    // possibly run.
    if (at - lastAdvanceMs > 1000) lastAdvanceMs = at;
  }

  return {
    session,
    hub,
    get bound() {
      return bound;
    },
    get mapping() {
      return mapper?.state ?? { status: "idle" };
    },

    async openUdp(port) {
      const udp = createUdpTransport({ port, now });
      await hub.add(udp);
      bound = udp.bound;
      return bound;
    },

    addTransport(transport) {
      return hub.add(transport);
    },

    async mapPort() {
      if (!bound || !behindNat()) return;
      mapper = createPortMapper();
      await mapper.map(bound.port);
    },

    start() {
      if (timer) clearInterval(timer);
      lastAdvanceMs = now();
      timer = setInterval(pump, TICK_MS);
    },

    pump,

    async close(reason) {
      if (closed) return;
      closed = true;
      if (timer) clearInterval(timer);
      timer = null;
      session.close(reason);
      hub.close();
      bound = null;
      // RELEASED, not merely forgotten. A mapping left behind is a port open on
      // the player's router for as long as its lease runs, and a game that
      // leaks one every time it is played is a game that quietly opens a
      // machine up. Awaited here — unlike in the utility process, a dedicated
      // server's exit is the last thing that happens and nothing else will get
      // round to it.
      await mapper?.release();
      mapper = null;
    },
  };
}
