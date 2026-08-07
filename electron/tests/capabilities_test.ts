// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0

import { describe, expect, it } from "vitest";

import {
  ALL_CAPABILITIES,
  capabilityList,
  isStamped,
  NO_CAPABILITIES,
  readBuildCapabilities,
  resolveCapabilities,
} from "../src/capabilities";

const NOTHING = NO_CAPABILITIES;

describe("the package stamp", () => {
  it("gives an unstamped build nothing — the same as a download", () => {
    expect(readBuildCapabilities({})).toEqual(NO_CAPABILITIES);
    expect(readBuildCapabilities(null)).toEqual(NO_CAPABILITIES);
    expect(readBuildCapabilities({ capabilities: "yes" })).toEqual(
      NO_CAPABILITIES,
    );
  });

  it("reads each capability off the manifest", () => {
    expect(
      readBuildCapabilities({
        capabilities: { multiplayer: true, mods: true, licensed: true },
      }),
    ).toEqual({
      multiplayer: true,
      mods: true,
      portMap: false,
      voice: false,
      licensed: true,
    });
  });

  it("treats an absent field as off rather than on", () => {
    expect(readBuildCapabilities({ capabilities: { mods: true } })).toEqual({
      ...NO_CAPABILITIES,
      mods: true,
    });
  });
});

describe("telling a developer build apart", () => {
  it("counts anything nobody packaged as one", () => {
    expect(isStamped({})).toBe(false);
    expect(isStamped(null)).toBe(false);
    expect(isStamped({ capabilities: "yes" })).toBe(false);
  });

  it("does not count a packaged build, however narrow its stamp", () => {
    expect(isStamped({ capabilities: NOTHING })).toBe(true);
    expect(isStamped({ capabilities: ALL_CAPABILITIES })).toBe(true);
  });
});

describe("what a launch may do", () => {
  it("leaves a stamped build alone when nothing is asked for", () => {
    const { capabilities } = resolveCapabilities(NOTHING, ["game"]);
    expect(capabilities.multiplayer).toBe(false);
    expect(capabilities.mods).toBe(false);
    expect(capabilities.unlocked).toBe(false);
  });

  it("unlocks each feature on its own word", () => {
    const { capabilities, refusals } = resolveCapabilities(NOTHING, [
      "game",
      "--multiplayer",
      "--port",
      "27849",
      "--mods",
    ]);
    expect(capabilities).toMatchObject({
      multiplayer: true,
      mods: true,
      portMap: false,
      direct: true,
      port: 27849,
      unlocked: true,
    });
    expect(refusals).toEqual([]);
  });

  it("accepts the --port=N spelling", () => {
    const { capabilities } = resolveCapabilities(NOTHING, [
      "game",
      "--multiplayer",
      "--port=27015",
    ]);
    expect(capabilities.port).toBe(27015);
  });

  it("takes --multiplayer with no port — the HOST screen has one", () => {
    const { capabilities, refusals } = resolveCapabilities(NOTHING, [
      "game",
      "--multiplayer",
    ]);
    expect(capabilities.multiplayer).toBe(true);
    expect(capabilities.direct).toBe(false);
    expect(capabilities.port).toBeUndefined();
    expect(refusals).toEqual([]);
  });

  it("refuses a port that is not one", () => {
    const { capabilities, refusals } = resolveCapabilities(NOTHING, [
      "game",
      "--multiplayer",
      "--port",
      "no",
    ]);
    expect(capabilities.port).toBeUndefined();
    expect(refusals).toEqual(["--port no is not a port number"]);
  });

  it("says so when a door was asked for with no session to put it on", () => {
    const { refusals } = resolveCapabilities(NOTHING, [
      "game",
      "--port",
      "27849",
    ]);
    expect(refusals).toEqual(["--port does nothing without --multiplayer"]);
  });

  it("never turns the router mapping on from the command line", () => {
    const { capabilities } = resolveCapabilities(NOTHING, [
      "game",
      "--upnp",
      "--portmap",
      "--multiplayer",
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

  it("takes the licence as a word, on either the stamp or the launch", () => {
    expect(resolveCapabilities(NOTHING, ["game"]).capabilities.licensed).toBe(
      false,
    );
    expect(
      resolveCapabilities(NOTHING, ["game", "--licensed"]).capabilities
        .licensed,
    ).toBe(true);
    expect(
      resolveCapabilities({ ...NOTHING, licensed: true }, ["game"]).capabilities
        .licensed,
    ).toBe(true);
  });

  it("does not treat the licence claim as an unlock of its own", () => {
    // It opens no feature — it says a held licence covers the ones that are
    // already open — so on its own it raises nothing to acknowledge.
    const { capabilities } = resolveCapabilities(NOTHING, [
      "game",
      "--licensed",
    ]);
    expect(capabilities.multiplayer).toBe(false);
    expect(capabilities.unlocked).toBe(false);
  });

  it("leaves a depot build's own doors alone", () => {
    const { capabilities } = resolveCapabilities(ALL_CAPABILITIES, ["game"]);
    expect(capabilities).toMatchObject({
      multiplayer: true,
      mods: true,
      portMap: true,
      licensed: true,
      direct: false,
      unlocked: false,
    });
  });

  it("hands the page only the names it may act on", () => {
    expect(
      capabilityList({ ...NOTHING, unlocked: false, direct: false }),
    ).toEqual([]);
    expect(
      capabilityList({
        ...ALL_CAPABILITIES,
        unlocked: false,
        direct: false,
      }),
    ).toEqual(["multiplayer", "mods", "voice"]);
  });

  // VOICE — a capability of its own, because it opens a microphone and makes the
  // host relay every speaker to every listener. The depot build carries it; a
  // plain download does not.
  it("keeps voice off a build that was not given it", () => {
    const { capabilities } = resolveCapabilities(NOTHING, ["game"]);
    expect(capabilities.voice).toBe(false);
    expect(capabilityList(capabilities)).not.toContain("voice");
  });

  it("lets the command line turn voice on for one launch, and says so", () => {
    const { capabilities, refusals } = resolveCapabilities(NOTHING, [
      "game",
      "--multiplayer",
      "--voice",
    ]);
    expect(capabilities.voice).toBe(true);
    // `unlocked` is what makes the launch print the notice: a capability the
    // package did not carry was turned on by hand.
    expect(capabilities.unlocked).toBe(true);
    expect(refusals).toEqual([]);
  });

  // THE PAIRING. Voice travels inside a session (`FRAME.voice`, relayed by the
  // session server), so on a build that can neither host nor join one there is
  // nothing for a microphone to talk into — and granting the device anyway
  // would put a VOICE CHAT page in the settings that never carries a syllable.
  it("refuses voice without multiplayer, by name rather than silently", () => {
    const { capabilities, refusals } = resolveCapabilities(NOTHING, [
      "game",
      "--voice",
    ]);
    expect(capabilities.voice).toBe(false);
    expect(refusals).toEqual(["--voice does nothing without --multiplayer"]);
  });

  it("refuses a STAMPED voice build that carries no multiplayer", () => {
    // The same rule from the other direction: a packaging run that enabled
    // voice and forgot multiplayer must not produce a build with an open
    // microphone and nowhere to send it.
    const { capabilities } = resolveCapabilities({ ...NOTHING, voice: true }, [
      "game",
    ]);
    expect(capabilities.voice).toBe(false);
  });
});
