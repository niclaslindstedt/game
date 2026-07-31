// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// SPECTATORS AND CHAT — one session, several clients, and the line between
// what a watcher may SAY and what they may CHANGE.
//
// PR 2's milestone is deliberately "eight machines, one hero": it puts real
// latency, real loss and eight real seats under the replication layer while the
// thing being replicated is still something known to work. So the properties
// worth pinning are the ones that make that milestone honest — a spectator's
// steering going nowhere, a spectator's private view containing no bag, and the
// host's commands being the host's.

import { afterEach, describe, expect, it } from "vitest";

import { engineVersion, resetBalanceTuning } from "@game/core";
import { decodeFrame } from "@game/wire/codec.ts";
import { playerScaling } from "@game/wire/players.ts";
import {
  FRAME,
  type ChatPayload,
  type RosterPayload,
  type SessionParams,
  type WelcomePayload,
} from "@game/wire/protocol.ts";
import { PRIVATE_PLAYER_FIELDS } from "@game/wire/split.ts";

import { createSession, type Session } from "../../server/session.ts";

/**
 * `/players N` writes the PROCESS-GLOBAL `BALANCE` object, which is exactly why
 * the shipped topology is one process per session — and why a test that scales
 * the horde has to put it back. Leaving it set would quietly re-tune every
 * suite that ran after this one in the same worker.
 */
afterEach(() => resetBalanceTuning());

const PARAMS: SessionParams = {
  seed: 20260731,
  levelId: "moon",
  difficulty: "medium",
  loadout: null,
  respec: false,
  clearedLevels: [],
  merchantDiscovered: false,
  generatedMaps: false,
  generatedMapSize: "random",
};

/** One connected client's inbox, decoded. */
function inbox() {
  const frames: NonNullable<ReturnType<typeof decodeFrame>>[] = [];
  return {
    frames,
    send: (frame: ArrayBuffer) => {
      const decoded = decodeFrame(frame);
      if (decoded) frames.push(decoded);
    },
    of(type: number) {
      return frames.filter((frame) => frame.type === type);
    },
    /** Every chat line this client was handed, flattened. */
    chat() {
      return this.of(FRAME.chat).flatMap(
        (frame) => (frame.payload as ChatPayload).lines ?? [],
      );
    },
    roster() {
      const rosters = this.of(FRAME.roster);
      const last = rosters[rosters.length - 1];
      return last ? (last.payload as RosterPayload).entries : [];
    },
  };
}

type Kicked = { clientId: number; reason: string };

function session(options: { invite?: boolean } = {}) {
  const kicks: Kicked[] = [];
  const invites: number[] = [];
  const live: Session = createSession({
    params: PARAMS,
    build: engineVersion,
    peers: {
      kick: (clientId, reason) => kicks.push({ clientId, reason }),
      invite: () => {
        invites.push(1);
        return options.invite ?? false;
      },
      ping: (clientId) => clientId * 10,
    },
  });
  return { live, kicks, invites };
}

/** The host, plus `n` spectators, all seated. */
function seat(live: Session, spectators: number) {
  const host = inbox();
  live.addClient(1, host.send, true, "HOST");
  const watchers = Array.from({ length: spectators }, (_, i) => {
    const watcher = inbox();
    live.addClient(100 + i, watcher.send, false, `WATCHER ${i + 1}`);
    return watcher;
  });
  return { host, watchers };
}

/** Say something as a client. */
function say(live: Session, id: number, text: string) {
  live.receive(id, FRAME.chat, 0, { text });
}

describe("seating", () => {
  it("gives every client a welcome that says whether it steers", () => {
    // Stated outright rather than inferred from `slot === 0`: the first
    // spectator to connect is also seated at slot 0 when there is nobody else,
    // and inferring it once handed a watcher the hero's whole private bag.
    const { live } = session();
    const { host, watchers } = seat(live, 1);
    const hostWelcome = host.of(FRAME.welcome)[0]!.payload as WelcomePayload;
    const watcherWelcome = watchers[0]!.of(FRAME.welcome)[0]!
      .payload as WelcomePayload;
    expect(hostWelcome.ownsPlayer).toBe(true);
    expect(watcherWelcome.ownsPlayer).toBe(false);
    expect(live.clientCount).toBe(2);
  });

  it("never sends a spectator anybody's bag", () => {
    // The anti-cheat boundary, and it is a WITHHOLDING rather than an
    // omission: a client that never RECEIVES another player's bag cannot
    // manipulate it, which is what will make PR 5's trade window honest.
    const { live } = session();
    const { watchers } = seat(live, 1);
    live.advance(100);
    const text = JSON.stringify(
      watchers[0]!.of(FRAME.delta).map((frame) => frame.payload),
    );
    for (const field of PRIVATE_PLAYER_FIELDS) {
      expect(text).not.toContain(`"${field}"`);
    }
  });

  it("seats a leaver's slot again rather than doubling up on the last one", () => {
    // `clients.size` was the PR 1 answer and it is wrong the moment anybody
    // leaves: two clients would share a seat, and (from PR 3) two heroes would
    // be steered by one input.
    const { live } = session();
    seat(live, 2);
    live.removeClient(100);
    const late = inbox();
    live.addClient(200, late.send, false, "LATE");
    const slots = live.roster().map((entry) => entry.slot);
    expect(new Set(slots).size).toBe(slots.length);
  });

  it("hands a late arrival the log so far", () => {
    // A spectator who joins an hour in and sees an empty chat box has no way
    // to tell a quiet session from a broken one.
    const { live } = session();
    const { host } = seat(live, 0);
    say(live, 1, "anybody there");
    expect(host.chat().some((line) => line.text === "anybody there")).toBe(
      true,
    );
    const late = inbox();
    live.addClient(100, late.send, false, "LATE");
    expect(late.chat().some((line) => line.text === "anybody there")).toBe(
      true,
    );
  });

  it("announces arrivals and departures, and redraws the roster", () => {
    const { live } = session();
    const { host } = seat(live, 1);
    expect(host.chat().some((line) => line.text.includes("JOINED"))).toBe(true);
    live.removeClient(100);
    expect(host.chat().some((line) => line.text.includes("LEFT"))).toBe(true);
    expect(host.roster()).toHaveLength(1);
  });

  it("reports a ping for a watcher and none for the host", () => {
    // -1 rather than 0: the host's own renderer reaches this process inside
    // the same machine and there is no wire to time. A party frame showing
    // `0 MS` for a peer nobody has timed is a lie.
    const { live } = session();
    seat(live, 1);
    const roster = live.roster();
    expect(roster.find((entry) => entry.playing)?.ping).toBe(-1);
    expect(roster.find((entry) => !entry.playing)?.ping).toBe(1000);
  });
});

describe("what a spectator may do", () => {
  it("may talk", () => {
    // The whole reason chat ships in this PR rather than in PR 4: eight people
    // watching a hardcore run in silence are eight people watching a video.
    const { live } = session();
    const { host, watchers } = seat(live, 1);
    say(live, 100, "nice shot");
    const said = host.chat().find((line) => line.text === "nice shot");
    expect(said?.name).toBe("WATCHER 1");
    expect(watchers[0]!.chat().some((line) => line.text === "nice shot")).toBe(
      true,
    );
  });

  it("may not steer, and may not run a command", () => {
    const { live } = session();
    seat(live, 1);
    const before = { ...live.state.player.pos };
    live.receive(100, FRAME.input, 1, {
      seq: 1,
      input: { steering: true, target: { x: 9999, y: 9999 } },
    });
    live.receive(100, FRAME.command, 1, { name: "skipIntro" });
    live.advance(200);
    // Nothing the watcher sent reached the simulation; the hero has only ever
    // been driven by the idle input the session supplies for an empty slot.
    expect(live.state.player.pos.x).toBe(before.x);
  });

  it("may not change the session, and is TOLD so", () => {
    // A command that silently does nothing is indistinguishable from one that
    // is broken.
    const { live, kicks } = session();
    const { host, watchers } = seat(live, 1);
    say(live, 100, "/players 8");
    say(live, 100, "/kick HOST");
    const refusals = watchers[0]!
      .chat()
      .filter((line) => line.text.includes("ONLY THE HOST"));
    expect(refusals).toHaveLength(2);
    expect(kicks).toHaveLength(0);
    // …and nobody else heard the attempt.
    expect(
      host.chat().some((line) => line.text.includes("ONLY THE HOST")),
    ).toBe(false);
  });
});

describe("the slash commands", () => {
  it("scales the horde and says by how much", () => {
    const { live } = session();
    const { host } = seat(live, 1);
    say(live, 1, "/players 4");
    const announced = host
      .chat()
      .find((line) => line.text.includes("/PLAYERS"));
    expect(announced?.kind).toBe("system");
    expect(announced?.text).toContain(`×${playerScaling(4).mobHp}`);
  });

  it("answers /who and /help to the asker alone", () => {
    // Broadcasting them would make one player's curiosity everybody's
    // interruption, which is how a chat box in a game gets muted.
    const { live } = session();
    const { host, watchers } = seat(live, 1);
    const before = watchers[0]!.chat().length;
    say(live, 1, "/who");
    say(live, 1, "/help");
    expect(host.chat().some((line) => line.text.includes("WATCHING"))).toBe(
      true,
    );
    expect(host.chat().some((line) => line.text.includes("/PLAYERS N"))).toBe(
      true,
    );
    expect(watchers[0]!.chat()).toHaveLength(before);
  });

  it("kicks by the name that is DRAWN, and never the host", () => {
    const { live, kicks } = session();
    seat(live, 1);
    say(live, 1, "/kick HOST");
    expect(kicks).toHaveLength(0);
    say(live, 1, "/kick watcher 1");
    expect(kicks).toEqual([{ clientId: 100, reason: "kicked by the host" }]);
    expect(live.clientCount).toBe(1);
  });

  it("says plainly when there is no invite panel", () => {
    const { live, invites } = session({ invite: false });
    const { host } = seat(live, 0);
    say(live, 1, "/invite");
    expect(invites).toHaveLength(1);
    expect(
      host.chat().some((line) => line.text.includes("SHARE THE ADDRESS")),
    ).toBe(true);
  });

  it("refuses an unknown slash without broadcasting it", () => {
    // A player who mistypes `/palyers 8` must not have it said to seven
    // friends.
    const { live } = session();
    const { host, watchers } = seat(live, 1);
    say(live, 1, "/palyers 8");
    expect(
      host.chat().some((line) => line.text.includes("NO SUCH COMMAND")),
    ).toBe(true);
    expect(
      watchers[0]!.chat().some((line) => line.text.includes("palyers")),
    ).toBe(false);
  });
});
