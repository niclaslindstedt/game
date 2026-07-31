// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE RELAYED TRANSPORT — the seam's second implementation, for peers whose
// packets cannot reach this process directly.
//
// **WHY IT EXISTS AT ALL: THE STEAM CLIENT LIVES IN THE MAIN PROCESS.**
// `steamworks.init()` is a single global handshake, `electron/src/steam.ts` is
// its one owner, and `utilityProcess` is a different process — so the Steam P2P
// queue can only be pumped where the client is. The alternative would be a
// second Steam handshake in the session process, which is precisely what that
// module exists to prevent.
//
// So the shell pumps `isP2PPacketAvailable()` on its own tick and forwards
// what it finds down the control channel; this transport is the other end of
// that pipe, and the session cannot tell it from the socket. That asymmetry is
// forced rather than chosen: each half lives where the resource it needs lives,
// and the seam is what makes the session's view of the two identical.
//
// **AND IT ADDS NO RELIABILITY OF ITS OWN.** Steam's `SendType` already
// carries the distinction, so wrapping the reliability layer around a relayed
// packet would be two retransmit clocks arguing over one link — the classic
// mistake of layering a reliable protocol over a reliable protocol, where the
// two back off against each other and the connection gets worse the more it is
// helped. The mode travels with the packet and Valve honours it.

import type {
  Bound,
  Packet,
  PeerKey,
  SendMode,
  Transport,
  TransportEvents,
} from "./transport.ts";

/** How a relayed packet leaves this process. Whatever the caller does with it
 * — post it to a parent port, hand it to a test's array — is not this
 * module's business. */
export type RelaySend = (to: PeerKey, data: Uint8Array, mode: SendMode) => void;

export type RelayTransport = Transport & {
  /** A packet arrived from the shell. */
  accept(packet: Packet): void;
  /** The shell says a peer has gone. */
  lost(peer: PeerKey, reason: string): void;
};

export function createRelayTransport(send: RelaySend): RelayTransport {
  let events: TransportEvents | null = null;
  let closed = false;
  const known = new Set<PeerKey>();

  return {
    id: "steam",
    // A relayed transport has no address of its own: what a joiner is given is
    // a lobby id, and the route is Valve's. That null is what the HOST screen
    // reads to know it has nothing to print in the LAN and INTERNET rows for
    // this door — and it is also why hosting over Steam needs no port, no
    // router mapping and no firewall rule at all.
    bound: null as Bound | null,

    listen(handlers) {
      events = handlers;
      return Promise.resolve(null);
    },

    send(to, data, mode) {
      if (closed) return;
      known.add(to);
      send(to, data, mode);
    },

    ping() {
      // Valve owns the route, and the legacy P2P binding reports nothing about
      // it. -1 is the seam's word for "cannot say", and the party frame prints
      // that rather than inventing a number.
      return -1;
    },

    drop(to) {
      known.delete(to);
    },

    tick() {
      // The shell owns the pump; there is nothing to do on this side of the
      // pipe. Declared rather than omitted so the seam stays one shape.
    },

    close() {
      closed = true;
      known.clear();
    },

    accept(packet) {
      if (closed) return;
      known.add(packet.from);
      events?.onPacket(packet);
    },

    lost(peer, reason) {
      known.delete(peer);
      events?.onPeerLost(peer, reason);
    },
  };
}
