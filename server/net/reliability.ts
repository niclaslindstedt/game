// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE RELIABILITY LAYER — a sequence number, an ack bitfield, and
// retransmission of the small half of the traffic. One instance per peer.
//
// This is the classic UDP design and it is SMALL on purpose, which is a
// consequence of the topology rather than a shortcut: the server is
// authoritative, so nothing but presentation depends on any single packet
// arriving. A dropped snapshot costs one frame of smoothness because the next
// one is coded against the same acknowledged baseline; a dropped input costs
// one tick of steering, and the next frame carries the current state of the
// stick anyway. Almost nothing here has to arrive.
//
// **WHAT DOES HAVE TO ARRIVE IS THE CONTROL TRAFFIC**, and it is a handful of
// packets per session: the welcome, a bye, a chat line, a roster. Those are
// marked reliable and retransmitted until acknowledged, and everything else is
// fired once and forgotten.
//
// THREE DECISIONS THAT LOOK ARBITRARY AND ARE NOT:
//
//  1. **A RETRANSMIT REUSES THE MESSAGE ID AND TAKES A NEW SEQUENCE.** The
//     tempting alternative — resend the same sequence and dedupe on it — puts
//     the message's fate inside the 33-slot ack window, so a message that had
//     to be retried more than a window's worth of packets could never be
//     acknowledged at all and would retransmit for ever. Separating "which
//     datagram" from "which message" is what makes the retry unbounded in time
//     and still bounded in memory.
//  2. **DUPLICATES ARE DROPPED AT THE RECEIVER, NOT PREVENTED AT THE SENDER.**
//     A retransmit that crosses its own ack is normal, not an error, so the
//     receiver keeps a small window of message ids it has already delivered.
//     Without it, a chat line appears twice on a lossy connection — which
//     looks like a bug in chat rather than in the transport.
//  3. **THE TIMEOUT IS MEASURED, NOT CHOSEN.** The retransmit interval follows
//     the smoothed round trip, floored and capped. A fixed 100 ms is a flood
//     on a satellite link and a fixed second is a visible stall on a LAN.
//
// The clock is injected, so every one of those is testable in a millisecond
// instead of in real time.

/** Bytes of reliability header in front of every datagram. */
export const RELIABILITY_HEADER_BYTES = 12;

/** How many earlier datagrams one ack reports on, beside the newest. */
const ACK_WINDOW = 32;

/** How many message ids the receiver remembers, for duplicate suppression.
 * Comfortably more than can be in flight, and a hard bound so a peer cannot
 * grow this set by sending. */
const DEDUPE_WINDOW = 256;

/**
 * The most unacknowledged reliable messages one peer may owe.
 *
 * Past it the peer is declared dead rather than queued further. A connection
 * that has failed to deliver this many small control messages is not slow, it
 * is gone — and the alternative is a queue that grows for as long as somebody
 * leaves a wedged client running.
 */
const MAX_PENDING = 64;

/** Retransmit no faster than this, however good the link looks. */
const MIN_RETRANSMIT_MS = 60;
/** …and no slower than this, however bad. */
const MAX_RETRANSMIT_MS = 1_000;
/** The retransmit interval as a multiple of the smoothed round trip. */
const RETRANSMIT_RTT_FACTOR = 1.5;
/** Before anything has been measured. */
const INITIAL_RTT_MS = 120;
/** How much of a new sample the smoothed round trip takes. The usual
 * exponential average; low enough that one late packet does not double the
 * retransmit interval for everybody. */
const RTT_SMOOTHING = 0.125;

/** How long a peer may say nothing at all before it is declared gone. */
export const PEER_TIMEOUT_MS = 10_000;

const FLAG_RELIABLE = 1;

export type ReliabilityOptions = {
  /** Hand one framed datagram to the socket. */
  send(data: Uint8Array): void;
  /** A payload arrived, in order of arrival and never twice. */
  deliver(payload: Uint8Array): void;
  /** The peer stopped answering, or owes more than it can. */
  onDead(reason: string): void;
  /** Monotonic ms. Injected so a test can drive a retransmit without waiting
   * for one. */
  now(): number;
};

export type Reliability = {
  /** Wrap and send one payload. */
  send(payload: Uint8Array, reliable: boolean): void;
  /** One datagram off the socket. Never throws — a malformed one is dropped,
   * because on an open port that is an ordinary event. */
  receive(datagram: Uint8Array): void;
  /** Retransmit what is due and check for a dead peer. Called on the session's
   * own tick; there is no timer in here. */
  update(): void;
  /** The smoothed round trip in ms, for the roster and the net graph. */
  readonly rtt: number;
  /** Datagrams sent and lost, for the same. */
  readonly stats: { sent: number; received: number; lost: number };
};

export function createReliability(options: ReliabilityOptions): Reliability {
  /** What is sent next. Wraps at 16 bits, which the comparison below handles. */
  let localSeq = 1;
  let nextMessageId = 1;
  /** The newest sequence seen from the peer, and the 32 before it. */
  let remoteSeq = 0;
  let remoteBits = 0;
  let rtt = INITIAL_RTT_MS;
  let lastHeardAt = options.now();
  let sent = 0;
  let received = 0;
  let lost = 0;

  /** An unacknowledged reliable message. */
  type Pending = {
    id: number;
    payload: Uint8Array;
    lastSentAt: number;
    /** Every datagram sequence this message has ridden on, so an ack for any
     * of them retires it. */
    seqs: Set<number>;
  };
  const pending = new Map<number, Pending>();
  /** Datagram sequence → what it carried and when it went, so an ack can both
   * retire a message and measure a round trip. */
  const inFlight = new Map<number, { at: number; messageId: number }>();
  /** Message ids already delivered, newest last. */
  const delivered: number[] = [];
  const deliveredSet = new Set<number>();

  function frame(payload: Uint8Array, messageId: number): Uint8Array {
    const datagram = new Uint8Array(
      RELIABILITY_HEADER_BYTES + payload.byteLength,
    );
    const view = new DataView(datagram.buffer);
    const seq = localSeq;
    localSeq = (localSeq + 1) & 0xffff;
    if (localSeq === 0) localSeq = 1; // 0 is "nothing yet", never a sequence
    view.setUint16(0, seq);
    view.setUint16(2, remoteSeq);
    view.setUint32(4, remoteBits >>> 0);
    view.setUint16(8, messageId);
    view.setUint16(10, messageId === 0 ? 0 : FLAG_RELIABLE);
    datagram.set(payload, RELIABILITY_HEADER_BYTES);
    inFlight.set(seq, { at: options.now(), messageId });
    // The in-flight table is bounded by the ack window it is read through:
    // anything older than that can never be acknowledged, so keeping it is
    // keeping a memory leak with a nice name.
    if (inFlight.size > ACK_WINDOW * 4) {
      const oldest = inFlight.keys().next();
      if (!oldest.done) inFlight.delete(oldest.value);
    }
    sent++;
    if (messageId !== 0) {
      const held = pending.get(messageId);
      if (held) {
        held.seqs.add(seq);
        held.lastSentAt = options.now();
      }
    }
    return datagram;
  }

  /** Fold one arrived sequence into the ack bitfield. */
  function recordArrival(seq: number): void {
    const gap = seqDelta(seq, remoteSeq);
    if (gap > 0) {
      // Newer. Shift the window along; anything that falls off was either
      // received (and already reported) or never arriving.
      remoteBits =
        gap >= 32 ? 0 : ((remoteBits << gap) | (1 << (gap - 1))) >>> 0;
      remoteSeq = seq;
      return;
    }
    // Older, or a duplicate of the newest. Set its bit if it is still in the
    // window; outside it there is nothing left to say.
    const back = -gap;
    if (back >= 1 && back <= 32)
      remoteBits = (remoteBits | (1 << (back - 1))) >>> 0;
  }

  /** Retire everything the peer has acknowledged, and measure a round trip. */
  function applyAck(ack: number, bits: number): void {
    for (let i = 0; i <= 32; i++) {
      if (i > 0 && (bits & (1 << (i - 1))) === 0) continue;
      const seq = (ack - i) & 0xffff;
      const record = inFlight.get(seq);
      if (!record) continue;
      inFlight.delete(seq);
      const sample = options.now() - record.at;
      // A retransmit's ack measures the retransmit, which is honest — the
      // alternative (attributing it to the original send) inflates the round
      // trip precisely when the link is bad and makes the retry interval run
      // away from the loss it is meant to cover.
      if (sample >= 0) rtt += (sample - rtt) * RTT_SMOOTHING;
      const message = pending.get(record.messageId);
      if (message) {
        lost += message.seqs.size - 1;
        pending.delete(record.messageId);
      }
    }
  }

  return {
    get rtt() {
      return Math.round(rtt);
    },
    get stats() {
      return { sent, received, lost };
    },

    send(payload, reliable) {
      if (!reliable) {
        options.send(frame(payload, 0));
        return;
      }
      if (pending.size >= MAX_PENDING) {
        options.onDead("too many unacknowledged messages");
        return;
      }
      const id = nextMessageId;
      nextMessageId = (nextMessageId + 1) & 0xffff;
      if (nextMessageId === 0) nextMessageId = 1;
      pending.set(id, {
        id,
        payload,
        lastSentAt: options.now(),
        seqs: new Set(),
      });
      options.send(frame(payload, id));
    },

    receive(datagram) {
      if (datagram.byteLength < RELIABILITY_HEADER_BYTES) return;
      const view = new DataView(
        datagram.buffer,
        datagram.byteOffset,
        datagram.byteLength,
      );
      const seq = view.getUint16(0);
      if (seq === 0) return; // never a sequence this layer issues
      const ack = view.getUint16(2);
      const bits = view.getUint32(4);
      const messageId = view.getUint16(8);
      const flags = view.getUint16(10);
      received++;
      lastHeardAt = options.now();
      recordArrival(seq);
      applyAck(ack, bits);
      const payload = datagram.subarray(RELIABILITY_HEADER_BYTES);
      if ((flags & FLAG_RELIABLE) !== 0 && messageId !== 0) {
        if (deliveredSet.has(messageId)) return; // a retransmit that crossed
        deliveredSet.add(messageId);
        delivered.push(messageId);
        while (delivered.length > DEDUPE_WINDOW) {
          const oldest = delivered.shift();
          if (oldest !== undefined) deliveredSet.delete(oldest);
        }
      }
      // A pure ack carries no payload, and delivering an empty one would make
      // every consumer above check for it.
      if (payload.byteLength > 0) options.deliver(payload);
    },

    update() {
      const at = options.now();
      if (at - lastHeardAt > PEER_TIMEOUT_MS) {
        options.onDead("timed out");
        return;
      }
      const due = Math.min(
        MAX_RETRANSMIT_MS,
        Math.max(MIN_RETRANSMIT_MS, rtt * RETRANSMIT_RTT_FACTOR),
      );
      for (const message of pending.values()) {
        if (at - message.lastSentAt < due) continue;
        options.send(frame(message.payload, message.id));
      }
    },
  };
}

/**
 * How far `a` is ahead of `b` in 16-bit sequence space, signed.
 *
 * Wrap-around is the whole reason this exists: after 65535 the counter starts
 * again, and a plain `a - b` calls the newest packet in the session the oldest
 * one — which on a 20 Hz publish is a bug that appears once an hour of play and
 * would be blamed on anything else.
 */
export function seqDelta(a: number, b: number): number {
  return ((a - b + 0x8000) & 0xffff) - 0x8000;
}
