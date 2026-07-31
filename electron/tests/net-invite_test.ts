// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE INVITE LAUNCH ARGUMENTS — `+connect_lobby <id>` and `--connect <addr>`.
//
// Worth a test despite being twenty lines, because the input is a command line
// somebody ELSE writes: Steam's, when a friend accepts an invite while the game
// is closed. There is no way to try that path from a keyboard, and the failure
// mode is silent — the game opens its title menu as if nothing had happened,
// which is precisely what it did before this existed.

import { describe, expect, it } from "vitest";

import { readInvite } from "../src/net-invite";

/** What a real launch looks like: the binary, then whatever Electron and Steam
 * put after it. The flag is never argv[0], and never the last word either — a
 * parser that only handled the tidy case would pass here and fail in the wild. */
const LAUNCH = ["/opt/game/game", "--no-sandbox"];

describe("reading an invite off a command line", () => {
  it("takes Steam's own +connect_lobby", () => {
    expect(readInvite([...LAUNCH, "+connect_lobby", "109775241010"])).toEqual({
      lobbyId: "109775241010",
    });
  });

  it("takes a shared address", () => {
    expect(readInvite([...LAUNCH, "--connect", "203.0.113.7:27016"])).toEqual({
      address: "203.0.113.7:27016",
    });
  });

  it("ignores a flag with nothing after it", () => {
    // A truncated command line must not produce a join attempt against "" —
    // which would spend six seconds probing an address nobody typed and then
    // report that nobody was hosting there.
    expect(readInvite([...LAUNCH, "+connect_lobby"])).toBeNull();
    expect(readInvite([...LAUNCH, "--connect", "--fullscreen"])).toBeNull();
  });

  it("ignores an ordinary launch", () => {
    expect(readInvite(LAUNCH)).toBeNull();
  });
});
