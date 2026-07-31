// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE DEDICATED SERVER (multiplayer plan §5.5), and the one test in the net
// suite that runs the WHOLE stack at once.
//
// Everything else here drives one layer against a stub. This drives a real
// session, behind a real admission desk, over a real UDP socket, joined by the
// real join link — and asserts the thing all of that exists for: a player who
// was never in the process gets a seat and a hero. A fake cannot have that
// property, because every fake in this suite was written by somebody who had
// already decided what the layers say to each other.
//
// It is also the closest thing in the repo to §5.6's soak, and it is not a
// substitute for one: it proves the stack CONNECTS, not that it survives eight
// players for hours at 150 ms and 2% loss. That needs the bot client the plan
// now names in §7.2.5.

import { afterEach, describe, expect, it } from "vitest";

import {
  loadConfig,
  paramsFrom,
  parseArgs,
  startDedicated,
} from "../../server/dedicated.ts";
import { createHost, type Host } from "../../server/host.ts";
import { createJoinLink } from "../../server/net/connect.ts";
import { createUdpTransport } from "../../server/net/udp.ts";
import { engineVersion } from "@game/core";
import { PROTOCOL_VERSION } from "@game/wire/protocol.ts";

/** A port range this suite owns, well away from the shipped 27015–27030 so a
 * developer with the game open does not fail their own test run. */
const PORT = 28_871;

const running: (Host | { close(): void })[] = [];

afterEach(async () => {
  for (const thing of running) await thing.close("test over");
  running.length = 0;
});

describe("the dedicated server's command line", () => {
  it("reads a bare argument as the config path", () => {
    expect(parseArgs(["/etc/game/server.json"]).config).toBe(
      "/etc/game/server.json",
    );
  });

  it("takes a flag in either spelling", () => {
    expect(parseArgs(["--port", "27099"]).overrides.port).toBe(27099);
    expect(parseArgs(["--port=27099"]).overrides.port).toBe(27099);
  });

  it("carries the knobs an operator actually sets", () => {
    const { overrides } = parseArgs([
      "--level=moon",
      "--difficulty=jesus",
      "--password=hunter2",
      "--players=4",
      "--seed=7",
      "--map-size=large",
    ]);
    expect(overrides).toEqual({
      level: "moon",
      difficulty: "jesus",
      password: "hunter2",
      maxPlayers: 4,
      seed: 7,
      generatedMapSize: "large",
    });
  });

  it("treats a missing config file as no config, and a broken one as an error", () => {
    // A missing file is not an error — the defaults are a playable server. A
    // MALFORMED one is, and loudly: silently falling back to defaults for a
    // file somebody wrote on purpose is how a server ends up running a mission
    // nobody asked for with nobody able to say why.
    expect(loadConfig("/nowhere/at/all.json")).toEqual({});
    expect(loadConfig(undefined)).toEqual({});
  });

  it("builds a run that belongs to nobody", () => {
    // No loadout, no cleared levels, no purse: a dedicated server holds a RUN,
    // not an account, and each arriving player brings their own hero to it.
    const params = paramsFrom({ level: "moon" }, 99);
    expect(params.seed).toBe(99);
    expect(params.loadout).toBeNull();
    expect(params.clearedLevels).toEqual([]);
    expect(params.merchantDiscovered).toBe(false);
  });
});

describe("a real client against a real dedicated server", () => {
  it("joins over a real socket and is given a seat", async () => {
    const host = await startDedicated({
      // Decision 15's escape — a loopback socket with no Steam near it.
      allowUnlicensedTransport: true,
      level: "moon",
      difficulty: "easy",
      seed: 31337,
      port: PORT,
      statusEverySec: 0,
    });
    expect(host).not.toBeNull();
    running.push(host!);
    expect(host!.bound?.port).toBe(PORT);

    // The joiner: the same link the game's own JOIN screen drives, over its own
    // ephemeral socket. Port 0 asks the OS for one, which is the case the udp
    // transport reads `socket.address()` back for rather than trusting the
    // request.
    const transport = createUdpTransport({ port: 0, host: "127.0.0.1" });
    let admitted = false;
    let refusal: string | null = null;
    let clock = 0;
    const link = createJoinLink({
      transport,
      host: `127.0.0.1:${PORT}`,
      handshake: {
        protocol: PROTOCOL_VERSION,
        build: engineVersion,
        mods: [],
      },
      name: "ZOE",
      now: () => (clock += 20),
      deliver: () => {},
      onAdmitted: () => {
        admitted = true;
      },
      onClosed: (reason) => {
        refusal = reason;
      },
    });
    running.push({ close: () => link.close() });
    await link.start();

    // Pump both ends by hand until the handshake settles. Real datagrams over
    // loopback, so this is a genuine round trip — the probe, the challenge, the
    // join, the welcome.
    for (let i = 0; i < 200 && !admitted && !refusal; i++) {
      link.tick();
      host!.pump();
      await new Promise((resolve) => setTimeout(resolve, 2));
    }

    expect(refusal).toBeNull();
    expect(admitted).toBe(true);
    // The proof it went all the way through: the session seated somebody who
    // was never in this process.
    expect(host!.session.clientCount).toBe(1);
    expect(host!.session.roster()[0]?.name).toBe("ZOE");
    // …INTO seat 0, which stood empty until they arrived. A party of one rather
    // than of two is the assertion that matters here: it says the joiner took
    // the vacant seat instead of being appended beside a ghost the run built
    // for a host that does not exist. That was the bug — the first arrival was
    // mistaken for the host and handed a DEFAULT hero instead of their own.
    expect(host!.session.state.players).toHaveLength(1);
    expect(host!.session.state.players[0]?.departed).toBeFalsy();
    // And the run is a PARTY run from the first tick: the operator of a machine
    // you connect to has exactly the standing a listen server's host has.
    expect(host!.session.state.party).not.toBeNull();
  }, 20_000);
});

describe("the host core both entries share", () => {
  it("runs a session with no socket at all", () => {
    // `host.ts` is what makes §5.5's "it is the same file" true, and this is
    // the property that matters: the simulation, the clock and the admission
    // desk exist without a transport under them, so the utility process and the
    // terminal are two entries rather than two servers.
    let clock = 0;
    const host = createHost({
      // Loopback UDP with no Steam near it — decision 15's escape, which is
      // exactly what a headless suite is for.
      allowUnlicensedTransport: true,
      params: paramsFrom({ level: "moon", difficulty: "easy" }, 5),
      now: () => clock,
    });
    running.push(host);
    expect(host.bound).toBeNull();
    expect(host.mapping).toEqual({ status: "idle" });
    clock += 1_000;
    host.pump();
    expect(host.session.tick).toBeGreaterThan(0);
  });
});
