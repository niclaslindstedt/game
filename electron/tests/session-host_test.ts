// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE SESSION HOST'S LIFECYCLE — spawn, talk, stop, and CRASH.
//
// The last one is why this suite exists. A supervisor's happy path is obvious
// and the exit handler is not: it fires for a clean stop and for a segfault
// alike, so the difference has to be recorded before the kill and read back
// afterwards. Get that wrong and a server that died mid-run is reported to the
// HOST screen as "stopped", which sends the player looking for a setting they
// never touched.
//
// `utilityProcess` is stubbed, along with the rest of `electron`. That is the
// same arrangement `mods_test.ts` and `webroot_test.ts` use and it is what
// keeps the desktop check job cheap — no 100 MB binary download in CI — but it
// also buys the thing that matters more: a supervisor testable without
// launching an app is a supervisor that is actually tested.

import { EventEmitter } from "node:events";
import { describe, expect, it, vi } from "vitest";

vi.mock("electron", () => ({
  app: { isPackaged: false, getPath: () => "/tmp" },
  utilityProcess: {
    fork: () => {
      throw new Error("not stubbed");
    },
  },
}));

import {
  createSessionHost,
  type ServerControl,
  type ServerReply,
} from "../src/session-host";

/** A `utilityProcess` stand-in: it records what it was sent and lets a test
 * decide when — and how — it dies. */
class FakeChild extends EventEmitter {
  readonly posted: { message: ServerControl; transfer?: unknown[] }[] = [];
  killed = false;

  postMessage(message: ServerControl, transfer?: unknown[]): void {
    this.posted.push({ message, transfer });
  }

  kill(): boolean {
    this.killed = true;
    this.emit("exit", 1);
    return true;
  }

  /** The child ends on its own — a clean exit or a crash, depending on code. */
  die(code: number): void {
    this.emit("exit", code);
  }
}

function rig() {
  const child = new FakeChild();
  const replies: ServerReply[] = [];
  const exits: { code: number; expected: boolean }[] = [];
  const host = createSessionHost({
    onReply: (reply) => replies.push(reply),
    onExit: (code, expected) => exits.push({ code, expected }),
    fork: () => child as never,
  });
  return { child, host, replies, exits };
}

describe("the session host", () => {
  it("is not running until it is started", () => {
    const { host } = rig();
    expect(host.running).toBe(false);
    host.start();
    expect(host.running).toBe(true);
  });

  it("forks at most one child", () => {
    // One process per SESSION. A second `start()` for the same session would
    // leave an orphan simulating a level nobody is watching.
    const { host } = rig();
    let forks = 0;
    const once = createSessionHost({
      onReply: () => {},
      onExit: () => {},
      fork: () => {
        forks++;
        return new FakeChild() as never;
      },
    });
    once.start();
    once.start();
    expect(forks).toBe(1);
    void host;
  });

  it("passes the server's replies straight through", () => {
    const { child, host, replies } = rig();
    host.start();
    child.emit("message", { kind: "ready", protocol: 1 });
    child.emit("message", { kind: "started", levelId: "moon" });
    expect(replies).toEqual([
      { kind: "ready", protocol: 1 },
      { kind: "started", levelId: "moon" },
    ]);
  });

  it("sends the snapshot port WITH the message that starts the session", () => {
    // Arriving together is what makes the first snapshot the first thing the
    // client sees; a port handed over afterwards leaves a window in which the
    // server has a session and nowhere to publish it.
    const { child, host } = rig();
    host.start();
    const port = { id: "port" };
    host.givePort(port as never, {
      kind: "start",
      params: { levelId: "moon" },
    });
    expect(child.posted).toHaveLength(1);
    expect(child.posted[0]!.transfer).toEqual([port]);
    expect(child.posted[0]!.message).toMatchObject({ kind: "start" });
  });

  it("ignores messages when nothing is running", () => {
    // A control message after a crash must not throw out of the bridge; the
    // page's own timeout is what reports it.
    const { host } = rig();
    expect(() => host.send({ kind: "status" })).not.toThrow();
    expect(() => host.stop()).not.toThrow();
  });

  describe("shutting down", () => {
    it("asks first", () => {
      const { child, host } = rig();
      host.start();
      host.stop();
      expect(child.posted.map((entry) => entry.message.kind)).toEqual(["stop"]);
      expect(child.killed).toBe(false);
    });

    it("reports a clean exit as expected", () => {
      const { child, host, exits } = rig();
      host.start();
      host.stop();
      child.die(0);
      expect(exits).toEqual([{ code: 0, expected: true }]);
      expect(host.running).toBe(false);
    });

    it("kills a server that will not stop", async () => {
      vi.useFakeTimers();
      try {
        const { child, host } = rig();
        host.start();
        host.stop();
        expect(child.killed).toBe(false);
        await vi.advanceTimersByTimeAsync(5_000);
        expect(child.killed).toBe(true);
      } finally {
        vi.useRealTimers();
      }
    });

    it("does not chase a child that already exited", async () => {
      // The kill timer must be cleared by the exit, or a session started
      // afterwards is killed two seconds into its life by its predecessor's
      // timer.
      vi.useFakeTimers();
      try {
        const { child, host } = rig();
        host.start();
        host.stop();
        child.die(0);
        await vi.advanceTimersByTimeAsync(5_000);
        expect(child.killed).toBe(false);
      } finally {
        vi.useRealTimers();
      }
    });
  });

  describe("crashing", () => {
    it("reports an unasked-for exit as unexpected", () => {
      // The whole reason this module records `expectedExit` before the kill:
      // otherwise a crash and a clean stop are indistinguishable in the one
      // handler that sees both.
      const { child, host, exits } = rig();
      host.start();
      child.die(139);
      expect(exits).toEqual([{ code: 139, expected: false }]);
      expect(host.running).toBe(false);
    });

    it("can be restarted after a crash", () => {
      const { child, host } = rig();
      host.start();
      child.die(139);
      host.start();
      expect(host.running).toBe(true);
    });
  });
});
