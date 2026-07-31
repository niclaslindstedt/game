// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// WHAT A PLAYER MAY TYPE INTO "JOIN BY ADDRESS".
//
// Worth a suite of its own because the parser is in the wire so that BOTH ends
// use it — the JOIN screen validates the field before sending anything, and the
// server reads the same forms out of a config file and a `--connect` launch
// argument. Two parsers would drift on the day somebody types an IPv6 address,
// which is exactly the day nobody is testing.

import { describe, expect, it } from "vitest";

import {
  DEFAULT_PORT,
  formatAddress,
  parseAddress,
} from "@game/wire/address.ts";

describe("parseAddress", () => {
  it("takes an IPv4 literal with and without a port", () => {
    expect(parseAddress("1.2.3.4")).toEqual({
      host: "1.2.3.4",
      port: DEFAULT_PORT,
      explicitPort: false,
    });
    expect(parseAddress("1.2.3.4:27016")).toEqual({
      host: "1.2.3.4",
      port: 27016,
      explicitPort: true,
    });
  });

  it("takes a hostname", () => {
    expect(parseAddress("host.example.com:27015")?.host).toBe(
      "host.example.com",
    );
  });

  it("demands brackets on IPv6 only when a port follows", () => {
    // Unbracketed `::1:27016` is itself a valid IPv6 address, so there is no
    // way to tell which was meant — and guessing is how a parser starts
    // accepting addresses nobody typed.
    expect(parseAddress("[::1]:27016")).toEqual({
      host: "::1",
      port: 27016,
      explicitPort: true,
    });
    expect(parseAddress("::1")).toEqual({
      host: "::1",
      port: DEFAULT_PORT,
      explicitPort: false,
    });
    expect(parseAddress("fe80::1:27016")?.port).toBe(DEFAULT_PORT);
  });

  it("says whether the port was TYPED", () => {
    // The JOIN screen shows the resolved address back to the player, and
    // "I typed a port and it used another" must never be something they
    // discover later.
    expect(parseAddress("1.2.3.4")?.explicitPort).toBe(false);
    expect(parseAddress("1.2.3.4:1")?.explicitPort).toBe(true);
  });

  it("refuses what is not an address", () => {
    for (const bad of [
      "",
      "   ",
      "1.2.3.4:",
      "1.2.3.4:0",
      "1.2.3.4:70000",
      "1.2.3.4:abc",
      "[::1",
      "[]:27015",
      "http://example.com:27015",
      null,
      42,
    ]) {
      expect(parseAddress(bad)).toBeNull();
    }
  });
});

describe("formatAddress", () => {
  it("brackets IPv6 and nothing else, so it round-trips", () => {
    expect(formatAddress("1.2.3.4", 27015)).toBe("1.2.3.4:27015");
    expect(formatAddress("::1", 27015)).toBe("[::1]:27015");
    for (const [host, port] of [
      ["1.2.3.4", 27016],
      ["::1", 27016],
    ] as const) {
      expect(parseAddress(formatAddress(host, port))).toEqual({
        host,
        port,
        explicitPort: true,
      });
    }
  });
});
