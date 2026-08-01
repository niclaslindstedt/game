// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE NET bridge — the WEB half of the multiplayer seam, and the FIFTH arm of
// the shape cloud save, achievements, leaderboards and mods already use.
//
//   web → shell   `postToShell(JSON { __gisNet })`  (./shell-bridge.ts)
//   shell → web   `window.__gisNetEvent(…)` (called from OUTSIDE, via
//                 `executeJavaScript`, exactly as the other four bridges are)
//
// The protocol (mirrored by electron/src/net.ts — keep the two in step):
//   → { action: "host", requestId, params, adopt?, password?, maxClients?, mods? }
//   → { action: "listen", requestId, port?, udp?, steam?, publicListing?, name? }
//   → { action: "stop", requestId }             end it
//   → { action: "status", requestId }           the HOST screen's status rows
//   → { action: "browse", requestId }           the server browser
//   → { action: "join", requestId, lobbyId }    join a Steam lobby
//   → { action: "connect", requestId, address? , peer?, playerName, password? }
//   → { action: "firewall" | "allow-firewall", requestId, port }
//   ← { event: "hosted", requestId, ok, levelId?, reason? }
//   ← { event: "listening", requestId, ok, bound, steam, lobbyId, reason? }
//   ← { event: "stopped", requestId, ok }
//   ← { event: "status", requestId, ok, tick, phase, enemies, clients,
//       bound, mapping, roster }
//   ← { event: "browse", requestId, ok, rows }
//   ← { event: "joined", requestId, ok, hostId?, row?, reason? }
//   ← { event: "connected", requestId, ok, reason?, detail? }
//   ← { event: "firewall", requestId, ok, state }
//   ← { event: "port" }                         the snapshot channel is up
//
// **ONE THING MUST NOT BE COPIED FROM THE OTHER FOUR BRIDGES: THE VOLUME.**
// They move a handful of JSON round trips per session. This one would move a
// snapshot twenty times a second if it were allowed to, so it is not: the
// snapshots travel on their own `MessagePort`, handed to the page by the shell
// (`__gisShell.onNetPort`), and `__gisNet` carries only CONTROL traffic — host,
// stop, status. Nothing here ever sees a game byte.
//
// This module is import-free apart from the shell channel and the wire's own
// leaf types, and it must stay that way: the HOST and JOIN screens are TITLE
// MENU screens, i.e. the app's startup path, where the 170 KB critical-path
// budget forbids reaching `@game/core`. The run driver that does reach it lives
// in `pwa/src/game/net/`, behind a lazy import.

import type { SessionParams } from "@game/wire/protocol.ts";

import { postToShell, shellAvailable, shellPlatform } from "./shell-bridge.ts";

declare global {
  interface Window {
    /** The shell's callback into this page (installed by `initNetBridge`). */
    __gisNetEvent?: (event: unknown) => void;
  }
}

/** How long a control round trip may take before the caller is told nothing
 * answered. Forking a process and building a level is real work on a cold
 * disk, so this is generous — but finite, because a HOST screen that hangs is
 * worse than one that says it could not start. */
const CONTROL_TIMEOUT_MS = 20_000;

/** …and how long a JOIN may take, which is longer for a reason no control
 * round trip on this bridge has: it waits on another machine — a probe that may
 * go unanswered and a level built on the far end. It has to outlast the
 * connector's own deadlines (`server/net/connect.ts`), so that what the player
 * reads is the host's refusal rather than this timeout. */
const CONNECT_TIMEOUT_MS = 30_000;

export type HostResult =
  { ok: true; levelId: string } | { ok: false; reason: string };

/** Where the socket ACTUALLY ended up. The HOST screen prints this and never
 * the port that was requested — a host reading 27015 off a settings page while
 * the socket is on 27016 is the exact bug that makes "direct connect doesn't
 * work" unanswerable. */
export type BoundAddress = { address: string; port: number };

/** The ROUTER row. */
export type MappingStatus =
  | { status: "idle" }
  | { status: "mapping" }
  | {
      status: "mapped";
      method: "nat-pmp" | "upnp";
      externalAddress: string | null;
      externalPort: number;
    }
  | { status: "failed"; detail: string };

/** The FIREWALL row. */
export type FirewallStatus =
  | { status: "not-needed"; detail: string }
  | { status: "allowed" }
  | { status: "blocked"; manual: string }
  | { status: "unknown"; detail: string; manual?: string };

/** One seat, as everybody else may see it. */
export type SeatEntry = {
  slot: number;
  name: string;
  playing: boolean;
  /** -1 when nothing can measure it — the host's own renderer, or a Steam
   * peer whose route Valve owns. Printed as such rather than as a flattering
   * zero. */
  ping: number;
};

/** One row in the server browser. Everything in it is what the host CLAIMED;
 * the handshake is what settles it. */
export type BrowserRow = {
  id: string;
  name: string;
  host: string;
  level: string;
  difficulty: string;
  players: number;
  maxPlayers: number;
  protocol: number;
  build: string;
  needsPassword: boolean;
  mods: string[];
  address: string | null;
};

/** What the HOST screen shows about a running session. */
export type SessionStatus = {
  running: boolean;
  tick: number;
  phase: string;
  enemies: number;
  clients: number;
  bound: BoundAddress | null;
  mapping: MappingStatus;
  roster: SeatEntry[];
};

/** What opening the doors produced. */
export type ListenResult = {
  ok: boolean;
  bound: BoundAddress | null;
  steam: boolean;
  lobbyId: string | null;
  reason?: string;
};

/** What a host is publishing. */
export type HostOptions = {
  params: SessionParams;
  password?: string;
  maxClients?: number;
  mods?: string[];
  /**
   * A run to ADOPT rather than build from `params` — a parked run, or a
   * checkpoint the player just retried into, neither of which any set of
   * parameters describes.
   *
   * Opaque here for the reason everything in this module is: the bridge moves
   * JSON and never learns what a run is. It costs the static tier (every client
   * is then sent a full first snapshot), so pass one only when there is no
   * alternative — see `SessionOptions.adopt` in `server/session.ts`.
   */
  adopt?: unknown;
};

/** Which doors to open. Both by default: Steam friends get the frictionless
 * path and everybody else gets an address. */
export type ListenOptions = {
  port?: number;
  udp?: boolean;
  steam?: boolean;
  publicListing?: boolean;
  name?: string;
};

let nextRequestId = 1;
const waiters = new Map<number, (payload: unknown) => void>();
let portListener: ((port: MessagePort) => void) | null = null;
let inviteListener: ((invite: SessionInvite) => void) | null = null;
/** An invite that arrived before anything was listening. The shell delivers it
 * on the page's first load, which can beat the title screen's own mount by a
 * frame — and an invite dropped for being early is a friend's session the
 * player never reaches. */
let pendingInvite: SessionInvite | null = null;

/** What a `+connect_lobby` / `--connect` launch asked for. Exactly one of the
 * two, mirroring `ConnectOptions`. */
export type SessionInvite = { lobbyId?: string; address?: string };

/**
 * True where a session can actually be hosted: a shell with its channel up, on
 * Steam.
 *
 * The mobile shells are excluded and a browser is excluded, for the same
 * reason and not from lack of ambition — a phone has no listening socket and a
 * tab is not a server (decisions 13 and 14). They can JOIN later; nothing in
 * this design forecloses it, because every join path goes through the transport
 * seam.
 */
export function netBridgeAvailable(): boolean {
  return shellAvailable() && shellPlatform() === "steam";
}

/** Install the shell's callbacks. Idempotent; safe to call on every mount. */
export function initNetBridge(): void {
  if (!netBridgeAvailable()) return;
  if (!window.__gisNetEvent) {
    window.__gisNetEvent = (event: unknown) => {
      const payload = event as {
        requestId?: number;
        event?: string;
        lobbyId?: string;
        address?: string;
      } | null;
      // THE ONE UNSOLICITED EVENT ON THIS BRIDGE. Everything else here is a
      // reply to a request the page made and is matched by id; an invite was
      // made on a command line before this page existed, so it has no id to
      // match and is dispatched by name.
      if (payload?.event === "invite") {
        const invite: SessionInvite = {
          lobbyId: payload.lobbyId,
          address: payload.address,
        };
        if (inviteListener) inviteListener(invite);
        else pendingInvite = invite;
        return;
      }
      if (!payload || typeof payload.requestId !== "number") return;
      const waiter = waiters.get(payload.requestId);
      if (!waiter) return;
      waiters.delete(payload.requestId);
      waiter(payload);
    };
  }
  window.__gisShell?.onNetPort?.((port) => portListener?.(port));
}

/**
 * Be told when the snapshot channel arrives.
 *
 * Registered BEFORE `hostSession` is called, always: the shell hands the port
 * over with the same message that starts the session, and a listener installed
 * afterwards would miss the welcome and leave a run that never begins.
 */
export function onSessionPort(listener: (port: MessagePort) => void): void {
  portListener = listener;
}

/**
 * Be told when the game was LAUNCHED into a session — a friend's Steam invite
 * accepted while the game was closed, or a shared address clicked.
 *
 * Registering hands over an invite that already arrived, because it usually
 * has: the shell delivers it the moment the page loads, which is before any
 * screen has mounted. Returns the unsubscribe.
 */
export function onSessionInvite(
  listener: (invite: SessionInvite) => void,
): () => void {
  inviteListener = listener;
  if (pendingInvite) {
    const held = pendingInvite;
    pendingInvite = null;
    listener(held);
  }
  return () => {
    if (inviteListener === listener) inviteListener = null;
  };
}

/** Start a session. The shell forks the server and hands back a port. */
export async function hostSession(
  options: HostOptions | SessionParams,
): Promise<HostResult> {
  // A bare `SessionParams` is still accepted, because most callers have
  // nothing to say about passwords or seats and should not have to wrap one
  // field in an object to say nothing.
  const opts: HostOptions =
    "params" in options ? options : { params: options as SessionParams };
  const reply = (await request({
    action: "host",
    params: opts.params,
    adopt: opts.adopt,
    password: opts.password,
    maxClients: opts.maxClients,
    mods: opts.mods,
  })) as { ok?: boolean; levelId?: string; reason?: string } | null;
  if (reply?.ok && reply.levelId) return { ok: true, levelId: reply.levelId };
  return { ok: false, reason: reply?.reason ?? "no reply" };
}

/**
 * Open the doors, and report which of them actually opened.
 *
 * Separate from `hostSession` on purpose: a session that simulates is a
 * different thing from a session that anybody can reach, and the HOST screen
 * has to be able to show the first while the second is still being negotiated
 * with a router. It is also what lets a purely local run — every single-player
 * game — never bind a socket at all.
 */
export async function listenSession(
  options: ListenOptions = {},
): Promise<ListenResult> {
  const reply = (await request({
    action: "listen",
    ...options,
  })) as (ListenResult & { ok?: boolean }) | null;
  return (
    reply ?? {
      ok: false,
      bound: null,
      steam: false,
      lobbyId: null,
      reason: "no reply",
    }
  );
}

/** End the running session and kill its process. */
export async function stopSession(): Promise<void> {
  await request({ action: "stop" });
}

/** One line for the HOST screen. Null when nothing answered. */
export async function sessionStatus(): Promise<SessionStatus | null> {
  const reply = (await request({ action: "status" })) as
    (SessionStatus & { ok?: boolean }) | null;
  return reply?.ok ? reply : null;
}

/**
 * The server browser: every lobby this Steam account can see.
 *
 * Rows this build cannot join are NOT filtered out by the shell, deliberately.
 * A player whose friend is on a newer build and whose list is simply empty
 * concludes the feature is broken; one who sees the session greyed with
 * "BUILD 1.4.2" goes and updates. The screen decides, with the reason in hand.
 */
export async function browseSessions(): Promise<BrowserRow[]> {
  const reply = (await request({ action: "browse" })) as {
    ok?: boolean;
    rows?: BrowserRow[];
  } | null;
  return reply?.ok ? (reply.rows ?? []) : [];
}

/** Join a lobby by id. Hands back the host's Steam id, which is the peer key
 * the relayed transport addresses. */
export async function joinSession(
  lobbyId: string,
): Promise<{ hostId: string; row: BrowserRow } | null> {
  const reply = (await request({ action: "join", lobbyId })) as {
    ok?: boolean;
    hostId?: string;
    row?: BrowserRow;
  } | null;
  if (!reply?.ok || !reply.hostId || !reply.row) return null;
  return { hostId: reply.hostId, row: reply.row };
}

/** Where a joiner is going, and as whom. Exactly one of `address` (typed, or
 * copied out of a browser row) and `peer` (a Steam id `joinSession` handed
 * back) — the transport is chosen by which one is there. */
export type ConnectOptions = {
  address?: string;
  peer?: string;
  name: string;
  password?: string;
  /** The mods this build has applied, in load order. A mismatch is what the
   * host refuses on; sending them is how it can. */
  mods?: string[];
  /** The joining character is HARDCORE (§4.2): hardcore and softcore heroes
   * never share a game, and the handshake refuses the mismatch by name. */
  hardcore?: boolean;
  /** The hero this player brings (§4.5) — their banked loadout as plain JSON,
   * or null for the authored fresh start. A claim the session weighs
   * (`validateLoadout`), never an authority. Structural: this module may not
   * import the engine. */
  loadout?: Record<string, unknown> | null;
};

export type ConnectResult =
  { ok: true } | { ok: false; reason: string; detail?: string };

/**
 * Join a session, and be told whether the door opened.
 *
 * The snapshot port arrives on the SAME channel a host's does
 * (`onSessionPort`), which is why nothing downstream of it knows which of the
 * two happened: a joiner's frames come off a socket in the session process and
 * a host's out of a simulation there, and both reach this page as bytes on a
 * `MessagePort`.
 *
 * Its own generous timeout, because this is the one control round trip whose
 * duration is somebody ELSE's machine: a probe that goes unanswered for six
 * seconds and a level being built on a cold disk on the far end. It still ends,
 * because a JOIN screen that spins for ever is worse than one that says nobody
 * answered.
 */
export async function connectSession(
  options: ConnectOptions,
): Promise<ConnectResult> {
  const reply = (await request(
    {
      action: "connect",
      address: options.address,
      peer: options.peer,
      playerName: options.name,
      password: options.password,
      mods: options.mods,
      hardcore: options.hardcore === true,
      loadout: options.loadout ?? null,
    },
    CONNECT_TIMEOUT_MS,
  )) as { ok?: boolean; reason?: string; detail?: string } | null;
  if (reply?.ok) return { ok: true };
  return {
    ok: false,
    reason: reply?.reason ?? "no-session",
    detail: reply?.detail,
  };
}

/**
 * Is UDP `port` allowed in, and — with `allow` — one press to ask for it.
 *
 * The remedy returns the VERIFICATION's answer rather than whether the command
 * exited zero: a green "opened" that is not open is worse than a red one,
 * because it sends the player looking in the wrong place.
 */
export async function firewallStatus(
  port: number,
  allow = false,
): Promise<FirewallStatus | null> {
  const reply = (await request({
    action: allow ? "allow-firewall" : "firewall",
    port,
  })) as { ok?: boolean; state?: FirewallStatus } | null;
  return reply?.ok ? (reply.state ?? null) : null;
}

/**
 * One round trip.
 *
 * A timeout resolves null rather than rejecting, exactly as the mods bridge's
 * does: every caller here is drawing a screen, and a screen that throws because
 * a process was slow to fork is worse than one that reports it could not host.
 */
function request(
  message: Record<string, unknown>,
  timeoutMs = CONTROL_TIMEOUT_MS,
): Promise<unknown> {
  if (!netBridgeAvailable()) return Promise.resolve(null);
  const requestId = nextRequestId++;
  return new Promise((resolve) => {
    const timer = window.setTimeout(() => {
      waiters.delete(requestId);
      resolve(null);
    }, timeoutMs);
    waiters.set(requestId, (payload) => {
      window.clearTimeout(timer);
      resolve(payload);
    });
    postToShell({ __gisNet: true, ...message, requestId });
  });
}
