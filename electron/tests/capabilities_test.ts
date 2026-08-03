// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0

import { describe, expect, it } from "vitest";

import {
  ALL_CAPABILITIES,
  capabilityList,
  readBuildCapabilities,
  resolveCapabilities,
} from "../src/capabilities";

const NOTHING = { multiplayer: false, mods: false, portMap: false };

describe("the package stamp", () => {
  it("gives an unstamped build everything", () => {
    expect(readBuildCapabilities({})).toEqual(ALL_CAPABILITIES);
    expect(readBuildCapabilities(null)).toEqual(ALL_CAPABILITIES);
    expect(readBuildCapabilities({ capabilities: "yes" })).toEqual(
      ALL_CAPABILITIES,
    );
  });

  it("reads each capability off the manifest", () => {
    expect(
      readBuildCapabilities({
        capabilities: { multiplayer: false, mods: true, portMap: false },
      }),
    ).toEqual({ multiplayer: false, mods: true, portMap: false });
  });

  it("treats an absent field as on rather than off", () => {
    expect(readBuildCapabilities({ capabilities: { mods: false } })).toEqual({
      multiplayer: true,
      mods: false,
      portMap: true,
    });
  });
});

describe("what a launch may do", () => {
  it("leaves a stamped build alone when nothing is asked for", () => {
    const { capabilities } = resolveCapabilities(NOTHING, ["game"]);
    expect(capabilities.multiplayer).toBe(false);
    expect(capabilities.mods).toBe(false);
    expect(capabilities.unlocked).toBe(false);
  });

  it("takes the three multiplayer options together", () => {
    const { capabilities, refusals } = resolveCapabilities(NOTHING, [
      "game",
      "--multiplayer",
      "--udp",
      "--port",
      "27849",
      "--mods",
    ]);
    expect(capabilities).toMatchObject({
      multiplayer: true,
      mods: true,
      portMap: false,
      udp: true,
      port: 27849,
      unlocked: true,
    });
    expect(refusals).toEqual([]);
  });

  it("accepts the --port=N spelling", () => {
    const { capabilities } = resolveCapabilities(NOTHING, [
      "game",
      "--multiplayer",
      "--udp",
      "--port=27015",
    ]);
    expect(capabilities.port).toBe(27015);
  });

  it("refuses a partial set rather than half-honouring it", () => {
    const { capabilities, refusals } = resolveCapabilities(NOTHING, [
      "game",
      "--multiplayer",
      "--udp",
    ]);
    expect(capabilities.multiplayer).toBe(false);
    expect(refusals).toEqual(["--multiplayer needs --port"]);
  });

  it("refuses a port that is not one", () => {
    const { capabilities, refusals } = resolveCapabilities(NOTHING, [
      "game",
      "--multiplayer",
      "--udp",
      "--port",
      "no",
    ]);
    expect(capabilities.multiplayer).toBe(false);
    expect(refusals).toEqual(["--port no is not a port number"]);
  });

  it("says so when a door was asked for with no session to put it on", () => {
    const { refusals } = resolveCapabilities(NOTHING, [
      "game",
      "--udp",
      "--port",
      "27849",
    ]);
    expect(refusals).toEqual([
      "--udp and --port do nothing without --multiplayer",
    ]);
  });

  it("never turns the router mapping on from the command line", () => {
    const { capabilities } = resolveCapabilities(NOTHING, [
      "game",
      "--upnp",
      "--portmap",
      "--multiplayer",
      "--udp",
      "--port",
      "27849",
    ]);
    expect(capabilities.portMap).toBe(false);
  });

  it("does not call a build that already had them unlocked", () => {
    const { capabilities } = resolveCapabilities(ALL_CAPABILITIES, [
      "game",
      "--mods",
    ]);
    expect(capabilities.unlocked).toBe(false);
  });

  it("hands the page only the names it may act on", () => {
    expect(capabilityList({ ...NOTHING, unlocked: false, udp: false })).toEqual(
      [],
    );
    expect(
      capabilityList({
        multiplayer: true,
        mods: true,
        portMap: true,
        unlocked: false,
        udp: false,
      }),
    ).toEqual(["multiplayer", "mods"]);
  });
});
