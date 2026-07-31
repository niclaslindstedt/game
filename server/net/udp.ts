// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE DIRECT PATH — `node:dgram`, one socket, the reliability layer above it.
//
// **THE DIRECT PATH IS NOT A NICE-TO-HAVE.** It is the insurance policy on the
// whole topology: `steamworks.js` binds only the LEGACY, deprecated
// `ISteamNetworking` P2P API, and if that proves flaky under load the fallback
// is landing `ISteamNetworkingSockets` upstream or writing an N-API addon — the
// latter costing the prebuilt binaries that make the desktop shell installable
// without a Rust toolchain. It is also, on its own, the feature that makes a
// LAN party, a Steam Deck with the internet off, and PR 5's headless dedicated
// server all work with no Steam client on either end.
//
// **THE BOUND PORT IS NOT THE REQUESTED PORT, AND THE DIFFERENCE IS A RULE.**
// On `EADDRINUSE` the socket walks up from 27015 to 27030 and takes the first
// one it gets. What the HOST screen must then show is the port the socket
// ACTUALLY GOT — this module's `bound`, never the settings page's number —
// because the alternative is the exact bug that makes "direct connect doesn't
// work" unanswerable: the host reads 27015 off a settings page, the joiner
// types 27015, and the socket is on 27016 because a second copy of the game was
// already running.
//
// **NOTHING HERE KNOWS WHAT A PACKET MEANS.** A datagram arrives, its
// reliability header is stripped, and the payload goes up. Admission, the
// challenge cookie and the rate limits are the hub's; keeping that line sharp
// is what lets the whole admission path be tested over in-memory queues with no
// socket at all, and it is also what stops this file from growing a second,
// weaker copy of the security rules.

import { createSocket, type Socket } from "node:dgram";
import { networkInterfaces } from "node:os";

import { DEFAULT_PORT, MAX_PORT } from "../wire/address.ts";
import { createReliability, type Reliability } from "./reliability.ts";
import type {
  Bound,
  PeerKey,
  Transport,
  TransportEvents,
} from "./transport.ts";

export type UdpTransportOptions = {
  /** The port to try first. The walk starts here rather than at 27015 so a
   * player who set one in SETTINGS gets theirs tried first. */
  port?: number;
  /** The last port the walk will try. */
  maxPort?: number;
  /** The interface to bind. Left unset it binds every one, which is what a
   * listen server wants; a dedicated server may want to be specific. */
  host?: string;
  /** Monotonic ms. Injected for the same reason the reliability layer's is. */
  now?: () => number;
};

/**
 * A UDP transport, not yet listening.
 *
 * Split from `listen` because binding can fail in a way the caller has to
 * report rather than throw over — a busy machine, a locked-down port range, a
 * host with no permission to bind at all — and a constructor that may or may
 * not have produced a working object is worse than one that always produces an
 * object which may or may not bind.
 */
export function createUdpTransport(
  options: UdpTransportOptions = {},
): Transport {
  const now = options.now ?? monotonic;
  const first = options.port ?? DEFAULT_PORT;
  const last = options.maxPort ?? MAX_PORT;
  let socket: Socket | null = null;
  let bound: Bound | null = null;
  let events: TransportEvents | null = null;
  let closed = false;
  const peers = new Map<PeerKey, Reliability>();

  /** The reliability layer for one peer, made on demand. A stranger's first
   * packet creates one — which is safe precisely because it holds no memory
   * worth attacking: the challenge cookie above it is stateless, so nothing
   * here is allocated per half-open connection beyond one small record the
   * timeout reaps. */
  function peerFor(key: PeerKey): Reliability {
    const held = peers.get(key);
    if (held) return held;
    const made = createReliability({
      now,
      send: (data) => sendRaw(key, data),
      deliver: (payload) => events?.onPacket({ from: key, data: payload }),
      onDead: (reason) => {
        peers.delete(key);
        events?.onPeerLost(key, reason);
      },
    });
    peers.set(key, made);
    return made;
  }

  function sendRaw(key: PeerKey, data: Uint8Array): void {
    const target = splitKey(key);
    if (!socket || !target) return;
    // The callback swallows the error deliberately: an ICMP port-unreachable
    // for a peer that has quit surfaces here as a send error, and a throw on
    // the session's own tick would let any client take the host down by
    // closing their game at the wrong moment.
    socket.send(data, target.port, target.address, () => {});
  }

  return {
    id: "udp",
    get bound() {
      return bound;
    },

    async listen(handlers) {
      events = handlers;
      for (let port = first; port <= last; port++) {
        try {
          socket = await bindOnce(port, options.host);
          bound = { address: options.host ?? localAddress(), port };
          socket.on("message", (data, rinfo) => {
            const key = keyFor(rinfo.address, rinfo.port);
            peerFor(key).receive(new Uint8Array(data));
          });
          socket.on("error", (err) => {
            handlers.onError(err.message);
          });
          return bound;
        } catch (err) {
          // Anything but "somebody else has it" is a real failure and walking
          // on would only turn one legible error into sixteen.
          if (!isAddressInUse(err)) {
            handlers.onError(describe(err));
            return null;
          }
        }
      }
      handlers.onError(
        `no free UDP port between ${first} and ${last} — is the game already running?`,
      );
      return null;
    },

    send(to, data, mode) {
      if (closed) return;
      peerFor(to).send(data, mode === "reliable");
    },

    ping(to) {
      return peers.get(to)?.rtt ?? -1;
    },

    drop(to) {
      peers.delete(to);
    },

    tick() {
      for (const peer of peers.values()) peer.update();
    },

    close() {
      if (closed) return;
      closed = true;
      peers.clear();
      try {
        socket?.close();
      } catch {
        // Closing a socket that never bound, or one already closed by an
        // error, is not something a shutdown path may throw over.
      }
      socket = null;
      bound = null;
    },
  };
}

/** How a datagram peer is named. Bracketed for IPv6, so the key round-trips
 * through `splitKey` — the challenge cookie is bound to this string, so a key
 * that could not be taken apart again would admit the wrong peer. */
export function keyFor(address: string, port: number): PeerKey {
  return address.includes(":") ? `[${address}]:${port}` : `${address}:${port}`;
}

/** The inverse. Null when the key was not one this module made. */
export function splitKey(
  key: PeerKey,
): { address: string; port: number } | null {
  if (key.startsWith("[")) {
    const close = key.indexOf("]:");
    if (close < 0) return null;
    const port = Number.parseInt(key.slice(close + 2), 10);
    return Number.isFinite(port)
      ? { address: key.slice(1, close), port }
      : null;
  }
  const at = key.lastIndexOf(":");
  if (at < 0) return null;
  const port = Number.parseInt(key.slice(at + 1), 10);
  return Number.isFinite(port) ? { address: key.slice(0, at), port } : null;
}

/**
 * The address a joiner on the same network would use.
 *
 * The LAN row on the HOST screen, and the one line of this whole feature that
 * can be answered without asking anybody anything. Loopback and internal
 * interfaces are skipped; a machine with several real ones gets the first,
 * which is a guess — the row is copyable text rather than a promise, and a
 * player with two networks knows which one their friend is on.
 */
export function localAddress(): string {
  const interfaces = networkInterfaces();
  for (const entries of Object.values(interfaces)) {
    for (const entry of entries ?? []) {
      if (entry.internal) continue;
      if (entry.family === "IPv4") return entry.address;
    }
  }
  return "0.0.0.0";
}

/** Bind once, or reject. Resolves only after the socket is actually listening,
 * so the caller's `bound` is never a hope. */
function bindOnce(port: number, host?: string): Promise<Socket> {
  return new Promise((resolve, reject) => {
    // `udp6` with `ipv6Only: false` would serve both families from one socket,
    // and does not on every platform this ships to. One family, honestly, and
    // an IPv6 host binds its own.
    const socket = createSocket({ type: "udp4", reuseAddr: false });
    const onError = (err: Error) => {
      socket.removeAllListeners();
      try {
        socket.close();
      } catch {
        // It never bound; there is nothing to close and nothing to report.
      }
      reject(err);
    };
    socket.once("error", onError);
    socket.bind(port, host, () => {
      socket.removeListener("error", onError);
      resolve(socket);
    });
  });
}

function isAddressInUse(err: unknown): boolean {
  return (err as { code?: string } | null)?.code === "EADDRINUSE";
}

function describe(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function monotonic(): number {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}
