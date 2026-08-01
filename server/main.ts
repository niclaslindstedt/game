// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE SESSION SERVER'S ENTRY POINT — what Electron's `utilityProcess` forks,
// and what the standalone dedicated server runs unchanged.
//
// **TWO ENTRIES, ONE SERVER, AND THE FORK IS THE ONLY THING THAT TELLS THEM
// APART.** With a `parentPort` this process is the game's own session server,
// driven down a control channel. Without one, nobody forked it — so it is a
// person at a terminal, and it hands over to `dedicated.ts`. Everything that
// makes a session (the simulation, the admission desk, the sockets, the router
// mapping and the one fixed-timestep clock) is `host.ts`, used identically by
// both, which is what makes the plan's §5.5 "it is the same file" true rather
// than aspirational.
//
// It is deliberately thin. Everything interesting is in `session.ts`; this file
// is the process's edges: the control channel in, the `MessagePort` that
// carries snapshots out, and an orderly death.
//
// **WHY A UTILITY PROCESS AND NOT THE MAIN ONE** — three reasons, each enough
// on its own (docs/multiplayer-plan.md §1.2). A 60 Hz simulation must not
// compete with the main process's IPC, window, Workshop-compile and Steam
// duties. The engine holds 36 process-global mutable bindings — the `BALANCE`
// tuning object, the six flags in `src/game/flags.ts`, and every `activeXDefs`
// catalog `registerDefs` swaps when a mod loads — none of it per-`GameState`,
// so a process boundary is what stops one session's `/players 8`, another's mod
// list and a third's GENERATED MAPS setting from stomping each other. And it
// leaves exactly one code path, because the host's renderer becomes just
// another client.
//
// ONE PROCESS PER SESSION, not per app: phase 5's dedicated server runs several,
// and one process per session is what makes that free.
//
// **AND IT HAS TWO ROLES, WHICH IS ONE FORK AND ONE PORT EITHER WAY.** `start`
// makes this process a HOST: it simulates, and the renderer at the other end of
// the `MessagePort` is its first client. `connect` makes it a JOINER: nothing
// simulates here, a socket is opened outward, and the same port carries
// somebody else's frames to the same renderer. The page's client cannot tell
// the two apart — it speaks frames to a port — which is exactly why joining
// cost one small module (`net/connect.ts`) rather than a second client.
//
// **SNAPSHOTS DO NOT TRAVEL DOWN THE CONTROL CHANNEL.** The four existing
// bridges move a handful of JSON round trips per session; this one moves a
// snapshot twenty times a second, and routing that through the main process's
// single JSON channel would put the window's own event loop between the
// simulation and the screen. So the main process hands the renderer's
// `MessagePort` straight through to this process at startup and the two talk
// directly, with the `ArrayBuffer` transferred rather than copied. The control
// channel carries only lifecycle: start, stop, status.

import { lookup } from "node:dns/promises";

import {
  engineVersion,
  registerDefs,
  type DefOverrides,
  type FrozenRun,
} from "@game/core";

import { createJoinLink, type JoinLink } from "./net/connect.ts";
import { main as dedicated } from "./dedicated.ts";
import { createHost, type Host } from "./host.ts";
import { createRelayTransport, type RelayTransport } from "./net/relay.ts";
import type { Bound, SendMode } from "./net/transport.ts";
import { createUdpTransport, keyFor } from "./net/udp.ts";
import type { MappingState } from "./net/upnp.ts";
import { parseAddress } from "./wire/address.ts";
import { decodeFrame, encodeFrame } from "./wire/codec.ts";
import {
  FRAME,
  PROTOCOL_VERSION,
  TICK_MS,
  type ByePayload,
  type RosterEntry,
  type SessionParams,
} from "./wire/protocol.ts";

/** A message from the main process, down the control channel. */
type ControlMessage =
  | {
      kind: "start";
      params: SessionParams;
      mods?: string[];
      /**
       * THE CATALOG OVERRIDES THE PAGE'S MODS REGISTERED (§4.4). This process
       * SIMULATES, and the page's own `registerDefs` never reached it — so
       * without this a modded host's horde would spawn from the shipped
       * catalogs while the renderer drew the mod's. Registered before the run
       * is built, and never restored: a session process lives exactly one
       * session, which is what makes the swap safe (plan §1.2, reason 2).
       */
      modDefs?: DefOverrides | null;
      password?: string;
      maxClients?: number;
      /** A run to ADOPT rather than build — a parked run or a checkpoint the
       * player just retried into (see `SessionOptions.adopt`). Opaque on this
       * hop; the session is what reads it. */
      adopt?: FrozenRun | null;
    }
  | { kind: "stop" }
  | { kind: "status" }
  /** Open the doors. `port` is what to TRY; what was got comes back in the
   * reply, and the two are not the same thing — see `net/udp.ts`. */
  | { kind: "listen"; port?: number; udp?: boolean; steam?: boolean }
  /**
   * The OTHER direction: this process is a JOINER rather than a host.
   *
   * The same fork, the same `MessagePort` to the renderer, the same frames on
   * it — only nothing simulates here and the bytes come off a socket instead of
   * out of a session. That symmetry is the whole reason the page's `NetClient`
   * needs no join-specific code: it speaks to a port either way.
   */
  | {
      kind: "connect";
      /** `host:port` as the player typed it, for the direct path. */
      address?: string;
      /** A relayed peer key (a Steam id) instead, with the shell pumping. */
      peer?: string;
      name: string;
      password?: string;
      /** This client's mods, in load order — the host refuses a mismatch. */
      mods?: string[];
      /** The joining character is HARDCORE (§4.2) — compared against the
       * session's mode at the door; the mismatch is refused by name. */
      hardcore?: boolean;
      /** The hero this player brings (§4.5): their banked loadout as plain
       * JSON, or null for the authored fresh start. Rides the join frame;
       * the session weighs it (`validateLoadout`) before seating anybody. */
      loadout?: unknown;
    }
  /** One packet the shell pumped off the Steam P2P queue. */
  | { kind: "peer"; from: string; data: ArrayBuffer | Uint8Array | number[] }
  /** The shell says a relayed peer has gone. */
  | { kind: "peer-lost"; from: string; reason: string };

/** A message back up it. */
type ControlReply =
  | { kind: "ready"; protocol: number }
  | { kind: "started"; levelId: string }
  | {
      kind: "status";
      tick: number;
      phase: string;
      enemies: number;
      clients: number;
      /** Where the socket ACTUALLY ended up, or null when it never bound.
       * The HOST screen prints this and never the requested port. */
      bound: Bound | null;
      mapping: MappingState;
      roster: RosterEntry[];
    }
  | {
      kind: "listening";
      bound: Bound | null;
      steam: boolean;
      /** What a lobby row must advertise, sent from the one process that has
       * actually loaded the engine it is describing — the shell holds neither
       * number and must not invent either. */
      protocol: number;
      build: string;
      detail?: string;
    }
  /** The join settled: admitted, or refused with the host's own reason. One
   * reply per `connect`, and never a second — a session that ends AFTER
   * admission is reported to the page as a `bye` frame down the port, because
   * that is the surface the player is looking at. */
  | { kind: "connected"; ok: boolean; reason?: string; detail?: string }
  /** One packet for the shell to put on the Steam P2P queue. */
  | { kind: "peer-send"; to: string; data: number[]; mode: SendMode }
  /** The session asked for the platform's invite panel. */
  | { kind: "invite" }
  /** One line for the host's own log. Its OWN kind rather than an `error`,
   * because the bridge above matches replies to waiters by order and a chatty
   * log would otherwise settle whatever request happened to be in flight with
   * a refusal. */
  | { kind: "log"; line: string }
  | { kind: "stopped"; reason: string }
  | { kind: "error"; detail: string };

/** The port the main process posts on and this process replies to. Typed
 * structurally: `electron`'s own types are not available in this tree (the
 * server is engine code compiled for Node, and pulling Electron's types into
 * it would make the dedicated-server build need Electron). */
type ParentPort = {
  on(
    event: "message",
    listener: (event: { data: unknown; ports?: unknown[] }) => void,
  ): void;
  postMessage(message: unknown): void;
};

/** The renderer's end of the snapshot channel, once it has been handed over. */
type ClientPort = {
  postMessage(message: unknown, transfer?: unknown[]): void;
  on?(event: "message", listener: (event: { data: unknown }) => void): void;
  start?(): void;
  close?(): void;
};

/** The one client of phase 1: the host's own renderer, which owns the hero. */
const HOST_CLIENT = 1;

/**
 * THE HOSTED SESSION, when this process is a HOST.
 *
 * The session, the admission desk, the sockets, the router mapping and the one
 * clock that drives them are all `host.ts`'s — which is what makes the plan's
 * §5.5 claim true rather than aspirational: the dedicated server is that same
 * module with a different entry on top of it, and the fixed-timestep loop
 * exists once. What is left here is this process's own edges.
 */
let host: Host | null = null;
let clientPort: ClientPort | null = null;
let relay: RelayTransport | null = null;
let steamOpen = false;
/** Set only in the JOINER role, and mutually exclusive with `session`: this
 * process either simulates a run or carries somebody else's, never both. */
let link: JoinLink | null = null;
let linkTimer: ReturnType<typeof setInterval> | null = null;
let admitted = false;

/**
 * THE RECONNECT TICKET LAST HANDED OUT BY EACH HOST WE JOINED (plan §5.4),
 * keyed by peer.
 *
 * In memory and for the life of this process alone, which is the span the
 * feature is about: the case it exists for is a connection dropping inside one
 * sitting, and a ticket written to disk would be a credential for a session
 * that has almost certainly ended. Bounded by how many distinct hosts one
 * process joins, which is a handful.
 */
const resumeTickets = new Map<string, string>();

const parent = (process as unknown as { parentPort?: ParentPort }).parentPort;

if (parent) {
  parent.on("message", (event) => {
    const port = event.ports?.[0] as ClientPort | undefined;
    if (port) attachClient(port);
    handleControl(event.data as ControlMessage, (reply) =>
      parent.postMessage(reply),
    );
  });
  parent.postMessage({ kind: "ready", protocol: PROTOCOL_VERSION });
} else {
  // NO PARENT MEANS NOBODY FORKED US, so this is a person running the server
  // from a terminal — the plan's §5.5 dedicated server. It is the same process
  // over the same `host.ts`; what differs is only where the instructions come
  // from (a config file and a signal, rather than a control channel) and where
  // the log goes. Making it the same ENTRY as well as the same code is what
  // stops the two drifting: there is no second binary to forget to update.
  void dedicated(process.argv.slice(2));
}

/**
 * Take over the renderer's snapshot channel.
 *
 * A port arriving before a session has started is normal and is why the port
 * is held rather than used: the main process hands it over with the very
 * message that starts the session, and the order the two halves of one message
 * are processed in is not something to depend on.
 */
function attachClient(port: ClientPort): void {
  clientPort = port;
  port.on?.("message", (event) => {
    // IN THE JOINER ROLE THE PORT IS A PIPE, and the bytes are passed on
    // UNREAD. There is nothing here entitled to an opinion about them: the
    // session that will act on them is on another machine, and decoding them
    // twice would only add a second place for the two ends to disagree about
    // what a frame is.
    if (link) {
      link.send(new Uint8Array(event.data as ArrayBuffer));
      return;
    }
    // Client → server. Nothing here reaches the simulation directly: the frame
    // is decoded, refused if it is not one, and handed to the session, which
    // owns what an input may do. That layering is what phase 5's hardening hangs
    // off — an open UDP port eventually delivers bytes from strangers to this
    // same decoder.
    const frame = decodeFrame(event.data as ArrayBuffer);
    if (!frame || !host) return;
    host.session.receive(HOST_CLIENT, frame.type, frame.seq, frame.payload);
  });
  port.start?.();
  if (host) joinHost();
}

function joinHost(): void {
  const port = clientPort;
  if (!host || !port) return;
  host.session.addClient(
    HOST_CLIENT,
    (frame) => port.postMessage(frame, [frame]),
    true,
  );
}

/** Send something nobody asked for — an outbound relayed packet, an invite
 * request. The request/reply queue in `electron/src/net.ts` matches replies to
 * waiters by ORDER, so an unsolicited message must never wear a kind that
 * anything is waiting on. */
function post(event: ControlReply): void {
  parent?.postMessage(event);
}

function handleControl(
  message: ControlMessage | undefined,
  reply: (event: ControlReply) => void,
): void {
  if (!message || typeof message !== "object") return;
  try {
    if (message.kind === "start") {
      stop("restarted");
      // The mods' catalogs, before anything builds a run from them (§4.4).
      if (message.modDefs) registerDefs(message.modDefs);
      host = createHost({
        params: message.params,
        adopt: message.adopt,
        mods: message.mods,
        password: message.password,
        maxClients: message.maxClients,
        peers: {
          kick: (clientId, reason) => host?.hub.kick(clientId, reason),
          // The invite panel is the SHELL's — only the main process holds the
          // Steam client. The answer has to be synchronous for the chat reply
          // that quotes it, so what is returned is whether a Steam door is
          // open at all, and the panel itself is asked for on the way past.
          invite: () => {
            if (!steamOpen) return false;
            post({ kind: "invite" });
            return true;
          },
          ping: (clientId) => host?.hub.pingOf(clientId) ?? -1,
        },
        log: (line) => post({ kind: "log", line }),
        now,
      });
      if (clientPort) joinHost();
      host.start();
      reply({ kind: "started", levelId: message.params.levelId });
      return;
    }
    if (message.kind === "listen") {
      void openDoors(message, reply);
      return;
    }
    if (message.kind === "connect") {
      void joinSession(message, reply);
      return;
    }
    if (message.kind === "peer") {
      relay?.accept({ from: message.from, data: toBytes(message.data) });
      return;
    }
    if (message.kind === "peer-lost") {
      relay?.lost(message.from, message.reason);
      return;
    }
    if (message.kind === "stop") {
      stop("stopped");
      reply({ kind: "stopped", reason: "stopped" });
      return;
    }
    if (message.kind === "status") {
      reply({
        kind: "status",
        tick: host?.session.tick ?? 0,
        phase: host ? host.session.state.phase : "idle",
        enemies: host ? host.session.state.enemies.length : 0,
        clients: host?.session.clientCount ?? 0,
        bound: host?.bound ?? null,
        mapping: host?.mapping ?? { status: "idle" },
        roster: host?.session.roster() ?? [],
      });
    }
  } catch (err) {
    reply({ kind: "error", detail: String(err) });
  }
}

/**
 * Bind the socket, open the relay, and ask the router — in that order, because
 * only the first of the three can fail in a way that stops a session.
 *
 * The router mapping is asked for AFTER the reply is sent, deliberately: it
 * takes up to two seconds against an unresponsive gateway, and a HOST screen
 * that showed nothing at all for two seconds while a discovery timed out would
 * read as a game that had hung. The ROUTER row starts as MAPPING and updates
 * itself on the next status poll, which is what a status row is for.
 */
async function openDoors(
  message: ControlMessage & { kind: "listen" },
  reply: (event: ControlReply) => void,
): Promise<void> {
  const open = host;
  if (!open) {
    reply({
      kind: "listening",
      bound: null,
      steam: false,
      protocol: PROTOCOL_VERSION,
      build: engineVersion,
      detail: "no session",
    });
    return;
  }
  if (message.steam) {
    relay = createRelayTransport((to, data, mode) => {
      // `postMessage` structured-clones, and a `Uint8Array` over a shared
      // buffer would clone the WHOLE buffer; a plain array of bytes is what
      // survives the trip predictably for the handful of small control-plane
      // packets the relay carries.
      post({ kind: "peer-send", to, data: [...data], mode });
    });
    await open.addTransport(relay);
    steamOpen = true;
  }
  if (message.udp !== false) await open.openUdp(message.port);
  reply({
    kind: "listening",
    bound: open.bound,
    steam: steamOpen,
    protocol: PROTOCOL_VERSION,
    build: engineVersion,
    detail: open.bound ? undefined : "could not bind a UDP port",
  });
  await open.mapPort();
}

/**
 * JOIN somebody else's session: the other role this process can be forked into.
 *
 * Nothing simulates here. The renderer's `NetClient` builds the world from the
 * welcome and this end is a pipe with a handshake in front of it — which is why
 * the whole joiner is one small module (`net/connect.ts`) plus this function,
 * rather than a second copy of the session.
 *
 * **THE ADDRESS IS RESOLVED BEFORE THE SOCKET IS TOUCHED.** A peer key is the
 * string a transport names one peer by, and `node:dgram` reports arrivals by
 * IP — so a link keyed on the hostname the player typed would send fine and
 * then drop every packet that came back as a stranger's. Resolving here also
 * turns "that name does not exist" into an immediate, legible refusal instead
 * of six seconds of probing.
 */
async function joinSession(
  message: ControlMessage & { kind: "connect" },
  reply: (event: ControlReply) => void,
): Promise<void> {
  stop("restarted");
  admitted = false;
  let transport: RelayTransport | ReturnType<typeof createUdpTransport>;
  let peerKey: string;
  if (message.peer) {
    relay = createRelayTransport((to, data, mode) => {
      post({ kind: "peer-send", to, data: [...data], mode });
    });
    steamOpen = true;
    transport = relay;
    peerKey = message.peer;
  } else {
    const target = parseAddress(message.address);
    if (!target) {
      reply({ kind: "connected", ok: false, reason: "bad-address" });
      return;
    }
    let address: string;
    try {
      address = (await lookup(target.host)).address;
    } catch {
      reply({
        kind: "connected",
        ok: false,
        reason: "no-session",
        detail: `COULD NOT FIND ${target.host.toUpperCase()}`,
      });
      return;
    }
    // Port 0: a joiner asks the OS for whatever is free rather than walking the
    // host range. Binding 27015 here would take the port a session on this very
    // machine wants to host on, which is how "I can join but not host" happens.
    transport = createUdpTransport({ port: 0, maxPort: 0, now });
    peerKey = keyFor(address, target.port);
  }
  let settled = false;
  const settle = (event: ControlReply): void => {
    if (settled) return;
    settled = true;
    reply(event);
  };
  link = createJoinLink({
    transport,
    host: peerKey,
    handshake: {
      protocol: PROTOCOL_VERSION,
      build: engineVersion,
      mods: message.mods ?? [],
    },
    name: message.name,
    password: message.password,
    // §4.2's hardcore gate — the mode of the character this player is coming
    // with, compared against the session's at both ends of the handshake.
    hardcore: message.hardcore === true,
    // §4.5: the hero this player brings, riding the join frame for the
    // session to weigh and seat.
    loadout: message.loadout ?? null,
    // THE TICKET BACK INTO THE SEAT WE LAST HELD AT THIS ADDRESS (plan §5.4).
    // Held per host for the life of this process, which is exactly the span
    // that matters: the case the grace window exists for is a wifi hiccup
    // inside one sitting, and a ticket that outlived the app would be a
    // credential on disk for a session that no longer exists.
    resume: resumeTickets.get(peerKey),
    now,
    deliver: (frame) => {
      // A COPY, because the renderer's end takes ownership: the buffer is
      // transferred, and handing over a view onto the socket's own scratch
      // would neuter memory the transport is still holding.
      const copy = frame.slice().buffer;
      clientPort?.postMessage(copy, [copy]);
    },
    onAdmitted: (resume) => {
      admitted = true;
      // Every welcome issues a FRESH ticket and spends the one that got us in,
      // so this is a replacement rather than an addition.
      if (resume) resumeTickets.set(peerKey, resume);
      else resumeTickets.delete(peerKey);
      settle({ kind: "connected", ok: true });
    },
    onClosed: (reason, detail) => {
      // AFTER admission the page has already been told, by the `bye` the link
      // forwarded — or by nothing at all, when the host simply stopped
      // answering, which is the case this synthesizes one for. A run whose
      // session died in silence must not sit there looking playable.
      if (admitted) {
        if (reason !== "shutdown" || detail) sendBye(reason, detail);
        stopLinkClock();
        return;
      }
      settle({ kind: "connected", ok: false, reason, detail });
      stopLinkClock();
    },
    log: (line) => post({ kind: "log", line }),
  });
  await link.start();
  startLinkClock();
}

/** Tell the page the session ended, in the frame it already knows how to
 * read. The link is gone by here, so this is manufactured rather than
 * forwarded — the one frame in the whole feature that no host sent. */
function sendBye(reason: string, detail?: string): void {
  const payload = { reason, detail } as ByePayload;
  const frame = encodeFrame(
    { type: FRAME.bye, seq: 0, ack: 0, tick: 0 },
    payload,
  );
  clientPort?.postMessage(frame, [frame]);
}

/** The joiner's clock. Its own rather than the session's, because in this role
 * there is no session — what has to be pumped is the probe's retry, the
 * reliability layer's retransmits and the socket. */
function startLinkClock(): void {
  stopLinkClock();
  linkTimer = setInterval(() => link?.tick(), TICK_MS);
}

function stopLinkClock(): void {
  if (linkTimer) clearInterval(linkTimer);
  linkTimer = null;
}

/** Bytes, whatever shape they survived the structured clone in. */
function toBytes(data: ArrayBuffer | Uint8Array | number[]): Uint8Array {
  if (data instanceof Uint8Array) return data;
  if (Array.isArray(data)) return Uint8Array.from(data);
  return new Uint8Array(data);
}

function stop(reason: string): void {
  stopLinkClock();
  // A joiner's link is closed WITHOUT a bye to the page: this path is the page
  // asking, and answering its own request with a refusal would put "the session
  // ended" on a screen the player just left.
  link?.close();
  link = null;
  admitted = false;
  // The session, the hub, the clock and the ROUTER MAPPING all go together —
  // `host.close` releases the mapping rather than merely forgetting it, since a
  // mapping left behind is a port open on the player's router for as long as
  // its lease runs, and a game that leaks one every time it is played is a game
  // that quietly opens a machine up.
  void host?.close(reason);
  host = null;
  relay = null;
  steamOpen = false;
}

/** Monotonic ms. `performance.now()` where it exists (it does in Electron's
 * Node and in Node 16+), so a system clock change cannot make a tick take a
 * negative amount of time. */
function now(): number {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}

// A supervisor killing this process gets an orderly shutdown; a crash gets
// reported by the parent, which is watching for the exit either way.
process.on("exit", () => stop("exit"));
