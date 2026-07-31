// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// NET — the SHELL half of the multiplayer seam, and the fifth arm of the shape
// cloud save, achievements, leaderboards and mods already use. Keep the
// protocol here in step with the one documented in `pwa/src/app/net-bridge.ts`.
//
// It is the peer of `mods.ts` — a bridge that does REAL WORK in the main
// process rather than merely forwarding JSON — with one difference that shapes
// the whole file: **the traffic this feature actually generates does not go
// through it.**
//
//   CONTROL   host / listen / stop / status / browse / join. JSON, a handful
//             of round trips per session, down the shared `gis:post` channel
//             like everything else. That is what this module routes.
//   GAME      a snapshot twenty times a second. It travels on a `MessagePort`
//             pair whose two ends go to the RENDERER and to the utility
//             process, so the frames never enter this process at all.
//
// **ONE EXCEPTION, AND IT IS FORCED.** Packets from STEAM peers do pass through
// here, because `steamworks.init()` is a single global handshake this process
// owns and the session runs in another one (see `net-steam-p2p.ts`). They are
// relayed as small control-channel messages to `server/net/relay.ts`, which
// presents them to the session as an ordinary transport. UDP peers do not: that
// socket is bound inside the session process itself, so the direct path — the
// one that carries the bulk of any real session — never touches this event
// loop, and PR 5's dedicated server inherits it with no shell at all.
//
// **The port is minted here and immediately given away.** `MessageChannelMain`
// is a main-process object; one end goes to the server with the message that
// starts it, the other to the renderer over `ipcRenderer`'s port transfer. This
// process holds neither afterwards, which is exactly the intent — a main
// process that kept a handle would be tempted to read it.

import { MessageChannelMain, type BrowserWindow } from "electron";

import {
  allowFirewall,
  checkFirewall,
  type FirewallState,
} from "./net-firewall";
import {
  browseLobbies,
  hostLobby,
  joinLobby,
  type Lobby,
  type LobbyRow,
} from "./net-lobby";
import { createSteamP2P, type SteamP2P } from "./net-steam-p2p";
import { output } from "./output";
import {
  createSessionHost,
  UNSOLICITED,
  type ServerBound,
  type ServerMapping,
  type ServerReply,
  type ServerRosterEntry,
  type SessionHost,
} from "./session-host";

/** The channel the renderer's end of the snapshot port is delivered on. */
export const NET_PORT_CHANNEL = "gis:net-port";

/** A message from the web side (already parsed; `__gisNet` checked). */
export type NetRequest = {
  action?:
    | "host"
    | "listen"
    | "stop"
    | "status"
    | "browse"
    | "join"
    | "firewall"
    | "allow-firewall";
  requestId?: number;
  params?: unknown;
  /** `host`: the session's password, seats, and mod list. */
  password?: string;
  maxClients?: number;
  mods?: string[];
  /** `listen`: which doors to open, and which port to try first. */
  port?: number;
  udp?: boolean;
  steam?: boolean;
  publicListing?: boolean;
  name?: string;
  /** `join`: the lobby id. */
  lobbyId?: string;
};

/** An event to inject back into the page (see the web bridge's protocol). */
export type NetEvent =
  | {
      event: "hosted";
      requestId: number;
      ok: boolean;
      levelId?: string;
      reason?: string;
    }
  | {
      event: "listening";
      requestId: number;
      ok: boolean;
      bound: ServerBound | null;
      steam: boolean;
      lobbyId: string | null;
      reason?: string;
    }
  | { event: "stopped"; requestId: number; ok: boolean }
  | {
      event: "status";
      requestId: number;
      ok: boolean;
      running: boolean;
      tick: number;
      phase: string;
      enemies: number;
      clients: number;
      bound: ServerBound | null;
      mapping: ServerMapping;
      roster: ServerRosterEntry[];
    }
  | { event: "browse"; requestId: number; ok: boolean; rows: LobbyRow[] }
  | {
      event: "joined";
      requestId: number;
      ok: boolean;
      hostId?: string;
      row?: LobbyRow;
      reason?: string;
    }
  | {
      event: "firewall";
      requestId: number;
      ok: boolean;
      state: FirewallState;
    };

export type NetBridge = {
  handle: (request: NetRequest) => void;
  /** Kill any running session. Called when the window goes away — a server
   * outliving the only client it had is an orphan holding a level in memory. */
  shutdown: () => void;
};

/** How long the server may take to answer a control message. The page has its
 * own, longer timeout; this one exists so a wedged server produces a refusal
 * here rather than a silence the page can only guess at. */
const REPLY_TIMEOUT_MS = 15_000;

/** Binding a socket, opening a lobby and asking a router can all be slow, and
 * the router half is deliberately not waited on inside the server — but a
 * `listen` still has more to do than a `status`. */
const LISTEN_TIMEOUT_MS = 20_000;

export function createNetBridge(
  window: BrowserWindow,
  emit: (event: NetEvent) => void,
): NetBridge {
  let host: SessionHost | null = null;
  let steam: SteamP2P | null = null;
  let lobby: Lobby | null = null;
  /** What the running session was started with. Held because the LOBBY row
   * needs the level and the difficulty and `listen` is a separate request that
   * does not carry them — asking the page to send the params twice is asking
   * for the two copies to disagree. */
  let started: unknown = null;
  /** Control requests waiting on a reply, oldest first. The server answers in
   * order, so a queue is enough and no correlation id has to cross — which
   * keeps `server/main.ts` free of request bookkeeping it would otherwise need
   * for the dedicated-server case too. */
  const pending: {
    kind: ServerReply["kind"];
    settle: (reply: ServerReply | null) => void;
  }[] = [];

  function settleNext(reply: ServerReply | null): void {
    const waiter = pending.shift();
    waiter?.settle(reply);
  }

  function await_(
    kind: ServerReply["kind"],
    timeoutMs = REPLY_TIMEOUT_MS,
  ): Promise<ServerReply | null> {
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        const index = pending.findIndex((entry) => entry.settle === settle);
        if (index >= 0) pending.splice(index, 1);
        resolve(null);
      }, timeoutMs);
      const settle = (reply: ServerReply | null) => {
        clearTimeout(timer);
        resolve(reply);
      };
      pending.push({ kind, settle });
    });
  }

  /**
   * The unsolicited half of the server's replies.
   *
   * Every one of these arrives whenever the session feels like it, so none may
   * settle a waiter — see `UNSOLICITED` in `session-host.ts` for what goes
   * wrong when that list is incomplete.
   */
  function handleUnsolicited(reply: ServerReply): void {
    if (reply.kind === "ready") {
      output.info(`session server ready (protocol ${reply.protocol})`);
      return;
    }
    if (reply.kind === "log") {
      output.info(reply.line);
      return;
    }
    if (reply.kind === "invite") {
      lobby?.invite();
      return;
    }
    if (reply.kind === "peer-send") {
      steam?.send(
        reply.to,
        Uint8Array.from(reply.data),
        reply.mode === "reliable",
      );
    }
  }

  function ensureHost(): SessionHost {
    if (host) return host;
    host = createSessionHost({
      onReply: (reply) => {
        if (UNSOLICITED.has(reply.kind)) {
          handleUnsolicited(reply);
          return;
        }
        settleNext(reply);
      },
      onExit: (code, expected) => {
        host = null;
        closeDoors();
        // Everything still waiting is answered with a refusal rather than left
        // to time out: a crashed fork should reach the HOST screen in
        // milliseconds, not in fifteen seconds of apparent hang.
        while (pending.length) settleNext(null);
        if (!expected) output.warn(`session server crashed (code ${code})`);
      },
    });
    host.start();
    return host;
  }

  /** Give up the Steam half. The UDP socket lives in the session process and
   * dies with it; this is everything this process was holding. */
  function closeDoors(): void {
    steam?.close();
    steam = null;
    lobby?.close();
    lobby = null;
  }

  return {
    handle(request) {
      const requestId = request.requestId ?? 0;
      if (request.action === "host") {
        void startSession(requestId, request);
        return;
      }
      if (request.action === "listen") {
        void openDoors(requestId, request);
        return;
      }
      if (request.action === "stop") {
        closeDoors();
        host?.stop();
        host = null;
        started = null;
        emit({ event: "stopped", requestId, ok: true });
        return;
      }
      if (request.action === "status") {
        void status(requestId);
        return;
      }
      if (request.action === "browse") {
        void browse(requestId);
        return;
      }
      if (request.action === "join") {
        void join(requestId, request.lobbyId);
        return;
      }
      if (
        request.action === "firewall" ||
        request.action === "allow-firewall"
      ) {
        void firewall(requestId, request);
      }
    },

    shutdown() {
      closeDoors();
      host?.stop();
      host = null;
    },
  };

  async function startSession(
    requestId: number,
    request: NetRequest,
  ): Promise<void> {
    const params = request.params;
    if (!params || typeof params !== "object") {
      emit({ event: "hosted", requestId, ok: false, reason: "bad-params" });
      return;
    }
    try {
      const running = ensureHost();
      started = params;
      // Mint the pair, hand one end to each side, hold neither.
      const channel = new MessageChannelMain();
      running.givePort(channel.port1, {
        kind: "start",
        params,
        mods: request.mods,
        password: request.password,
        maxClients: request.maxClients,
      });
      window.webContents.postMessage(NET_PORT_CHANNEL, null, [channel.port2]);
      const reply = await await_("started");
      if (reply?.kind === "started") {
        emit({ event: "hosted", requestId, ok: true, levelId: reply.levelId });
        return;
      }
      emit({
        event: "hosted",
        requestId,
        ok: false,
        reason: reply?.kind === "error" ? reply.detail : "no-reply",
      });
    } catch (err) {
      output.error(`could not host a session: ${String(err)}`);
      emit({ event: "hosted", requestId, ok: false, reason: String(err) });
    }
  }

  /**
   * Open the doors: the UDP socket in the session process, and — if this build
   * has Steam — the P2P pump and the lobby here.
   *
   * A host listens on BOTH by default, and should: Steam friends get the
   * frictionless path (nothing inbound is ever bound, so no port, no router
   * mapping and no firewall rule are involved at all) and everyone else gets an
   * address. A joiner picks whichever the lobby row offers.
   */
  async function openDoors(
    requestId: number,
    request: NetRequest,
  ): Promise<void> {
    const running = host;
    if (!running?.running) {
      emit({
        event: "listening",
        requestId,
        ok: false,
        bound: null,
        steam: false,
        lobbyId: null,
        reason: "no-session",
      });
      return;
    }
    const wantsSteam = request.steam !== false;
    if (wantsSteam) {
      steam = createSteamP2P({
        onPacket: (from, data) =>
          running.send({ kind: "peer", from, data: [...data] }),
        onPeerLost: (from, reason) =>
          running.send({ kind: "peer-lost", from, reason }),
      });
    }
    running.send({
      kind: "listen",
      port: request.port,
      udp: request.udp !== false,
      // The relay is only worth opening when something is pumping it.
      steam: steam !== null,
    });
    const reply = await await_("listening", LISTEN_TIMEOUT_MS);
    const listening = reply?.kind === "listening" ? reply : null;
    const bound = listening?.bound ?? null;
    if (steam) {
      lobby = await hostLobby({
        name: request.name ?? "GONE IN SPACE",
        level: readString(request.params ?? started, "levelId"),
        difficulty: readString(request.params ?? started, "difficulty"),
        players: 1,
        maxPlayers: request.maxClients ?? 8,
        // Both come from the SESSION, which is the only process that has
        // loaded the engine it is describing. A shell that filled these in
        // itself would be a second copy of two numbers the handshake refuses a
        // mismatch on.
        protocol: listening?.protocol ?? 0,
        build: listening?.build ?? "",
        needsPassword: Boolean(request.password),
        mods: request.mods ?? [],
        // THE PORT THE SOCKET ACTUALLY GOT, never the one that was asked for.
        // A lobby row advertising the requested port is the exact bug that
        // makes "direct connect doesn't work" unanswerable.
        address: bound ? formatAddress(bound.address, bound.port) : null,
        publicListing: request.publicListing,
      });
    }
    emit({
      event: "listening",
      requestId,
      ok: listening !== null && (bound !== null || steam !== null),
      bound,
      steam: steam !== null,
      lobbyId: lobby?.id ?? null,
      reason: listening ? listening.detail : "no-reply",
    });
  }

  async function status(requestId: number): Promise<void> {
    if (!host?.running) {
      emit({
        event: "status",
        requestId,
        ok: true,
        running: false,
        tick: 0,
        phase: "idle",
        enemies: 0,
        clients: 0,
        bound: null,
        mapping: { status: "idle" },
        roster: [],
      });
      return;
    }
    host.send({ kind: "status" });
    const reply = await await_("status");
    const live = reply?.kind === "status" ? reply : null;
    // The lobby row is rewritten from the same poll that draws the HOST
    // screen, so what the browser shows and what the host sees can never be
    // two different numbers.
    if (live) lobby?.update({ players: live.clients });
    emit({
      event: "status",
      requestId,
      ok: live !== null,
      running: true,
      tick: live?.tick ?? 0,
      phase: live?.phase ?? "unknown",
      enemies: live?.enemies ?? 0,
      clients: live?.clients ?? 0,
      bound: live?.bound ?? null,
      mapping: live?.mapping ?? { status: "idle" },
      roster: live?.roster ?? [],
    });
  }

  async function browse(requestId: number): Promise<void> {
    const rows = await browseLobbies();
    emit({ event: "browse", requestId, ok: true, rows });
  }

  async function join(requestId: number, lobbyId?: string): Promise<void> {
    if (!lobbyId) {
      emit({ event: "joined", requestId, ok: false, reason: "no-lobby" });
      return;
    }
    const found = await joinLobby(lobbyId);
    if (!found) {
      emit({ event: "joined", requestId, ok: false, reason: "no-session" });
      return;
    }
    emit({
      event: "joined",
      requestId,
      ok: true,
      hostId: found.hostId,
      row: found.row,
    });
  }

  async function firewall(
    requestId: number,
    request: NetRequest,
  ): Promise<void> {
    const port = request.port ?? 0;
    const state =
      request.action === "allow-firewall"
        ? await allowFirewall(port)
        : await checkFirewall(port);
    emit({ event: "firewall", requestId, ok: true, state });
  }
}

/** The canonical text for an address — the same shape `JOIN BY ADDRESS` parses,
 * because the lobby row's address is pasted straight into that field. Spelled
 * here rather than imported from `@game/wire/address.ts` for the reason this
 * whole tree stands apart: the shell has its own dependency graph and does not
 * reach into the engine's. */
function formatAddress(host: string, port: number): string {
  return host.includes(":") ? `[${host}]:${port}` : `${host}:${port}`;
}

/** One string field off the opaque session params, for a lobby row. The params
 * are the wire's shape and this process deliberately does not import it — the
 * server owns what they mean. */
function readString(params: unknown, field: string): string {
  const value = (params as Record<string, unknown> | null)?.[field];
  return typeof value === "string" ? value : "";
}
