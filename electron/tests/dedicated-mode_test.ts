// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0

import { describe, expect, it } from "vitest";

import type { Capabilities } from "../src/capabilities";
import { dedicatedArgs, serverArgs } from "../src/dedicated-mode";

const caps = (over: Partial<Capabilities> = {}): Capabilities => ({
  multiplayer: true,
  mods: false,
  portMap: true,
  unlocked: false,
  direct: false,
  ...over,
});

describe("the Electron dedicated-server mode", () => {
  it("leaves an ordinary game launch alone", () => {
    expect(dedicatedArgs(["electron", "."])).toBeNull();
  });

  it("passes only server arguments after the mode switch", () => {
    expect(
      dedicatedArgs(["Ada's Trail", "--dedicated", "--bots", "7"]),
    ).toEqual(["--bots", "7"]);
  });
});

describe("what the session server is handed", () => {
  it("leaves an ordinary invocation alone", () => {
    expect(serverArgs(["server.json", "--bots", "7"], caps())).toEqual([
      "server.json",
      "--bots",
      "7",
    ]);
  });

  it("takes the shell's own options back out", () => {
    // Left in, `--multiplayer` would eat the token after it — the server reads
    // an unknown flag as one that takes a value.
    expect(
      serverArgs(
        ["--multiplayer", "--mods", "--bots", "7"],
        caps({ unlocked: true, direct: true, port: 27849 }),
      ),
    ).toEqual(["--bots", "7", "--port", "27849"]);
  });

  it("passes on a port that was given before the mode switch", () => {
    expect(serverArgs([], caps({ direct: true, port: 27849 }))).toEqual([
      "--port",
      "27849",
    ]);
  });

  it("puts the unlocked port last, where it wins", () => {
    expect(
      serverArgs(["--port", "27015"], caps({ direct: true, port: 27849 })),
    ).toEqual(["--port", "27015", "--port", "27849"]);
  });

  it("adds the router refusal, and does not let it be removed", () => {
    expect(serverArgs([], caps({ portMap: false }))).toEqual(["--no-portmap"]);
    expect(serverArgs(["--no-portmap"], caps())).toEqual([]);
  });
});
