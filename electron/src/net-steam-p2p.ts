// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE STEAM P2P PUMP — the shell's half of the relayed transport.
//
// It exists in the main process rather than beside the UDP transport for one
// forced reason: `steamworks.init()` is a single global handshake with the
// running Steam client, `steam.ts` is its one owner, and the session runs in a
// different process. So the queue is pumped here and what it finds is forwarded
// down the control channel to `server/net/relay.ts`, which presents it to the
// session as an ordinary transport. Neither half knows about the other's
// medium; that is what the seam is for.
//
// **IT IS A POLL, NOT A SOCKET, and the binding is why.** `steamworks.js` ^0.4
// binds the LEGACY `ISteamNetworking` API alone — `isP2PPacketAvailable()` and
// `readP2PPacket()`, with no callback to register. So something has to ask, on
// a clock, and that clock is this file's one interval. It runs at the snapshot
// rate rather than the tick rate: nothing arriving on this path is worth
// checking for sixty times a second, and a pump in the main process is exactly
// the thing that must not compete with the window.
//
// **EVERY PEER IS ACCEPTED, AND THAT IS SAFE PRECISELY BECAUSE THE HUB EXISTS.**
// `acceptP2PSession` is Steam's "will you talk to this person at all", and
// refusing there would mean re-implementing admission in a second place with a
// worse view of the session. What is accepted here is a ROUTE; whether the
// person at the other end may reach the simulation is decided once, by
// `server/net/hub.ts`, behind the challenge and the password.

import { output } from "./output";
import {
  SEND_TYPE_RELIABLE,
  SEND_TYPE_UNRELIABLE,
  steamClient,
  type SteamClient,
} from "./steam";

/** How often the queue is drained. 20 Hz — the snapshot rate. */
const PUMP_MS = 50;

/** The most packets one pump drains, so a burst cannot hold the main process's
 * event loop. Anything left is drained 50 ms later, which on a control-plane
 * channel is not a latency anybody can feel. */
const MAX_PER_PUMP = 64;

/** How long a peer may say nothing before the relay is told it is gone. Steam
 * reports no disconnection on this API, so silence is the only signal there
 * is — and a spectator whose Steam client quit must not hold a seat for ever. */
const PEER_TIMEOUT_MS = 15_000;

export type SteamP2P = {
  /** Send bytes to one peer, keyed by its Steam id as a decimal string. */
  send(to: string, data: Uint8Array, reliable: boolean): void;
  /** Stop pumping and forget every peer. */
  close(): void;
};

export type SteamP2POptions = {
  /** A packet arrived. */
  onPacket(from: string, data: Uint8Array): void;
  /** A peer went quiet for `PEER_TIMEOUT_MS`. */
  onPeerLost(from: string, reason: string): void;
  /** Injected so the pump is testable without a Steam client. */
  client?: SteamClient | null;
};

/**
 * Start pumping, or null when there is no Steam client here.
 *
 * Null rather than a no-op object, because the caller has to make a different
 * decision either way: a host with no Steam has no lobby to advertise and its
 * HOST screen must offer the address instead of an invite button.
 */
export function createSteamP2P(options: SteamP2POptions): SteamP2P | null {
  const client = options.client ?? steamClient();
  if (!client) return null;
  const lastHeard = new Map<string, number>();
  let timer: ReturnType<typeof setInterval> | null = setInterval(pump, PUMP_MS);

  function pump(): void {
    for (let i = 0; i < MAX_PER_PUMP; i++) {
      let size = 0;
      try {
        size = client!.networking.isP2PPacketAvailable();
      } catch (err) {
        output.warn(
          `steam p2p: the queue could not be read — ${describe(err)}`,
        );
        return;
      }
      if (!size) break;
      try {
        const packet = client!.networking.readP2PPacket(size);
        const from = packet.steamId.steamId64.toString();
        if (!lastHeard.has(from)) {
          // First contact. Accepting is what opens Valve's relay for this
          // pair; whether they may reach the simulation is the hub's call.
          client!.networking.acceptP2PSession(packet.steamId.steamId64);
        }
        lastHeard.set(from, Date.now());
        options.onPacket(from, new Uint8Array(packet.data));
      } catch (err) {
        // A malformed or racing read is an ordinary event on a polled queue
        // and must not stop the pump — the next packet may be fine.
        output.warn(`steam p2p: dropped a packet — ${describe(err)}`);
      }
    }
    const at = Date.now();
    for (const [peer, heard] of lastHeard) {
      if (at - heard <= PEER_TIMEOUT_MS) continue;
      lastHeard.delete(peer);
      options.onPeerLost(peer, "timed out");
    }
  }

  return {
    send(to, data, reliable) {
      try {
        client.networking.sendP2PPacket(
          BigInt(to),
          reliable ? SEND_TYPE_RELIABLE : SEND_TYPE_UNRELIABLE,
          Buffer.from(data),
        );
      } catch (err) {
        // A send to a peer that has quit fails here, and a throw on the
        // session's own forwarding path would let any client take the host
        // down by closing their game at the wrong moment.
        output.warn(`steam p2p: could not send to ${to} — ${describe(err)}`);
      }
    },

    close() {
      if (timer) clearInterval(timer);
      timer = null;
      lastHeard.clear();
    },
  };
}

function describe(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
