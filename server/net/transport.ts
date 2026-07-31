// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE TRANSPORT SEAM — one interface, and the reason it is shaped the way it
// is rather than the way a socket would suggest.
//
// **POLLED, PACKET-SHAPED, AND EXPLICIT ABOUT RELIABILITY**, because that is
// what the NARROWER of the two implementations forces. `steamworks.js` binds
// the LEGACY `ISteamNetworking` P2P API and nothing else: no sockets, no
// callbacks, no channels — `isP2PPacketAvailable()` and `readP2PPacket()`, on
// a pump somebody else has to run. A seam designed around `node:dgram`'s
// richer shape could not accommodate that, and the whole point of having a
// seam is that both paths ride it: the Steam friend list is the frictionless
// door, and a typed address is the one that works on a LAN, on a Steam Deck
// with no internet, and — from PR 5 — against a headless dedicated server.
//
// **IT LIVES IN `server/`, NOT IN `electron/src/`, and that is a deliberate
// departure from the plan's own file list.** The plan sketched
// `electron/src/net-transport*.ts`; §5.5 of the same plan says the dedicated
// server "is the same file" as this one, minus Electron. Both cannot be true —
// a transport in the shell is a transport the standalone server does not have.
// So the seam and the UDP implementation sit here, where the session already
// is, and the STEAM one stays in the shell because only the main process may
// hold the Steam client. It reaches the session as a RELAY over the control
// channel (`relay.ts`), which is the one honest arrangement: each half lives
// where the resource it needs lives, and the session sees one interface.
//
// **NOTHING HERE INTERPRETS A BYTE.** A transport moves opaque packets between
// keyed peers and reports arrivals and departures. What a packet MEANS is the
// hub's business, and keeping that line sharp is what lets a test drive the
// whole admission path over a pair of in-memory queues with no socket at all.

/**
 * How a peer is named. Opaque to everything above the transport, and stable
 * for as long as the peer is: `"1.2.3.4:27015"` for a datagram, a Steam id for
 * a relayed one. It is what the challenge cookie is bound to, so a transport
 * that reused a key for two different peers would be handing one peer's
 * admission to another — which is why the seam demands it be stable rather
 * than merely unique.
 */
export type PeerKey = string;

/** One packet, as it arrived. */
export type Packet = {
  from: PeerKey;
  data: Uint8Array;
};

/**
 * How a packet is asked to travel.
 *
 * `unreliable` is the default for a reason worth stating: every snapshot is a
 * delta against what the client ACKNOWLEDGED, so a dropped one costs a frame
 * of smoothness and can never desync. Retransmitting it would deliver stale
 * ground late — worse than not delivering it. What is genuinely reliable is
 * the small control traffic: the welcome, the bye, a chat line, a roster.
 */
export type SendMode = "reliable" | "unreliable";

/** Where a UDP transport actually ended up. The BOUND port, never the
 * requested one — see `udp.ts` for why that distinction is a rule. */
export type Bound = {
  address: string;
  port: number;
};

/** What a transport tells the layer above it. */
export type TransportEvents = {
  /** A packet arrived from a peer, known or otherwise. Admission is not the
   * transport's business, so this fires for strangers too. */
  onPacket(packet: Packet): void;
  /**
   * A peer stopped answering, or gave up.
   *
   * The layer above has to hear it rather than discover it: a spectator whose
   * laptop shut its lid is a seat still taken, a roster entry still drawn, and
   * — once PR 3 seats heroes — a body still standing on the field. The
   * transport is what knows, because it is what was waiting for the packet
   * that never came.
   */
  onPeerLost(peer: PeerKey, reason: string): void;
  /** The transport itself failed — the socket died, the relay went away. The
   * session is expected to close, not to retry: a host whose socket vanished
   * mid-run has a problem the game cannot paper over. */
  onError(detail: string): void;
};

/** The seam itself. */
export type Transport = {
  readonly id: "udp" | "steam";
  /** Where it is listening, once it is. Null before `listen` resolves and for
   * a transport that has no address of its own (Steam's is a lobby, not a
   * port). */
  readonly bound: Bound | null;
  /** Begin accepting packets. Resolves with where it ended up. */
  listen(events: TransportEvents): Promise<Bound | null>;
  /** Hand bytes to one peer. Never throws: a send to a peer that has gone is
   * an ordinary event, and one that could stop a tick would let any client
   * take the session down by disconnecting at the wrong moment. */
  send(to: PeerKey, data: Uint8Array, mode: SendMode): void;
  /**
   * The smoothed round trip to one peer in ms, or -1 when this implementation
   * cannot measure one.
   *
   * -1 rather than 0 or null, because a party frame showing `0 MS` for a peer
   * nobody has timed is a lie and one showing nothing at all is a gap the
   * player reads as a bug. The relayed path genuinely cannot answer — Valve
   * owns the route — and saying so is the honest column.
   */
  ping(to: PeerKey): number;
  /** Forget a peer. Frees whatever per-peer state the implementation holds;
   * on a connectionless transport that is all a "disconnect" can mean. */
  drop(to: PeerKey): void;
  /**
   * Pump whatever the implementation cannot do by itself.
   *
   * There is no timer anywhere below this line, deliberately: a retransmit
   * clock of its own would run at a rate nothing else in the session agrees
   * with, and it would keep running after a stall the simulation had already
   * decided to abandon. The session ticks; the transport is ticked. The Steam
   * path's polled receive queue and the UDP path's retransmits both hang off
   * this one call, which is also why the seam has it rather than only one of
   * them declaring it.
   */
  tick(): void;
  /** Give up the socket, the lobby, the mapping. Idempotent. */
  close(): void;
};
