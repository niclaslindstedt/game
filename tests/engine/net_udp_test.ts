// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE DIRECT PATH, over real loopback sockets.
//
// Real sockets rather than a fake, because the two things worth pinning here
// are exactly the two a fake cannot have: what happens when the port is taken,
// and that the peer key a datagram produces is one the challenge cookie can be
// bound to and taken apart again.
//
// **THE PORT WALK IS THE HEADLINE.** "The HOST screen shows the port the socket
// actually got, not the one that was requested" is stated as a rule in the plan
// because it is the exact bug that makes "direct connect doesn't work"
// unanswerable: a host reads 27015 off a settings page, a joiner types 27015,
// and the socket is on 27016 because a second copy of the game was already
// running. A `bound` that lied would be invisible until two people tried it.

import { afterEach, describe, expect, it } from "vitest";

import { keyFor, createUdpTransport, splitKey } from "../../server/net/udp.ts";
import type { Packet, Transport } from "../../server/net/transport.ts";

/** A port range this suite owns, well away from the shipped 27015–27030 so a
 * developer with the game open does not fail their own test run. */
const FIRST = 28_811;
const LAST = 28_819;

const open: Transport[] = [];

afterEach(() => {
  for (const transport of open) transport.close();
  open.length = 0;
});

/** Bind one, recording it for teardown. */
async function bind(port: number, packets: Packet[] = []) {
  const transport = createUdpTransport({
    port,
    maxPort: LAST,
    host: "127.0.0.1",
  });
  open.push(transport);
  const bound = await transport.listen({
    onPacket: (packet) => packets.push(packet),
    onPeerLost: () => {},
    onError: () => {},
  });
  return { transport, bound, packets };
}

/** Wait for a datagram to make the round trip. Loopback is fast but not
 * synchronous, and a poll is what keeps this from being a fixed sleep chosen
 * to be long enough on the slowest CI box anybody has yet used. */
async function until(predicate: () => boolean, timeoutMs = 2_000) {
  const deadline = Date.now() + timeoutMs;
  while (!predicate() && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  return predicate();
}

describe("the UDP transport", () => {
  it("reports the port it BOUND", async () => {
    const { bound } = await bind(FIRST);
    expect(bound?.port).toBe(FIRST);
  });

  it("walks past a port somebody else has, and says where it landed", async () => {
    const first = await bind(FIRST);
    const second = await bind(FIRST);
    expect(first.bound?.port).toBe(FIRST);
    expect(second.bound?.port).toBe(FIRST + 1);
    // The rule, stated as an assertion: what the transport reports is what the
    // socket got, never what was asked for.
    expect(second.transport.bound?.port).toBe(second.bound?.port);
  });

  it("gives up with a legible reason when the whole range is taken", async () => {
    const errors: string[] = [];
    const held: Transport[] = [];
    for (let port = FIRST; port <= LAST; port++) {
      const transport = createUdpTransport({
        port,
        maxPort: port,
        host: "127.0.0.1",
      });
      open.push(transport);
      held.push(transport);
      await transport.listen({
        onPacket: () => {},
        onPeerLost: () => {},
        onError: () => {},
      });
    }
    const late = createUdpTransport({
      port: FIRST,
      maxPort: LAST,
      host: "127.0.0.1",
    });
    open.push(late);
    const bound = await late.listen({
      onPacket: () => {},
      onPeerLost: () => {},
      onError: (detail) => errors.push(detail),
    });
    expect(bound).toBeNull();
    expect(errors[0]).toContain("no free UDP port");
    expect(errors[0]).toContain("already running");
  });

  it("carries a payload between two sockets", async () => {
    const server = await bind(FIRST);
    const client = await bind(FIRST + 1);
    client.transport.send(
      keyFor("127.0.0.1", server.bound!.port),
      Uint8Array.from([1, 2, 3]),
      "unreliable",
    );
    expect(await until(() => server.packets.length > 0)).toBe(true);
    expect([...server.packets[0]!.data]).toEqual([1, 2, 3]);
    // The key the server sees is the client's real address, which is what the
    // challenge cookie is bound to — a transport that reported something else
    // would admit the wrong peer.
    expect(splitKey(server.packets[0]!.from)?.port).toBe(client.bound!.port);
  });

  it("does not throw when sending to a peer that is gone", async () => {
    // An ICMP port-unreachable surfaces as a send error, and a throw on the
    // session's own tick would let any client take the host down by closing
    // their game at the wrong moment.
    const { transport } = await bind(FIRST);
    expect(() =>
      transport.send(
        keyFor("127.0.0.1", LAST),
        Uint8Array.from([1]),
        "reliable",
      ),
    ).not.toThrow();
  });
});

describe("peer keys", () => {
  it("round-trip, IPv6 included", () => {
    // The cookie is bound to this string, so a key that could not be taken
    // apart again would be a key the admission path could not answer for.
    for (const [address, port] of [
      ["1.2.3.4", 27015],
      ["::1", 27016],
    ] as const) {
      expect(splitKey(keyFor(address, port))).toEqual({ address, port });
    }
  });
});
