// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// NET — the SHELL half of the multiplayer seam, and the fifth arm of the shape
// cloud save, achievements, leaderboards and mods already use. Keep the
// protocol here in step with the one documented in `pwa/src/app/net-bridge.ts`.
//
// It is the peer of `mods.ts` — a bridge that does REAL WORK in the main
// process rather than merely forwarding JSON — with one difference that shapes
// the whole file: **the traffic this feature actually generates does not go
// through it.**
//
//   CONTROL   host / stop / status. JSON, a handful of round trips per
//             session, down the shared `gis:post` channel like everything
//             else. That is what this module routes.
//   GAME      a snapshot twenty times a second. It travels on a `MessagePort`
//             pair whose two ends go to the RENDERER and to the utility
//             process, so the frames never enter this process at all.
//
// Putting snapshots on the shared channel would have put the window's own
// event loop between the simulation and the screen, and would have made the
// main process serialize and re-serialize every mob on the field sixty times a
// second for no reason but habit.
//
// **The port is minted here and immediately given away.** `MessageChannelMain`
// is a main-process object; one end goes to the server with the message that
// starts it, the other to the renderer over `ipcRenderer`'s port transfer. This
// process holds neither afterwards, which is exactly the intent — a main
// process that kept a handle would be tempted to read it.

import { MessageChannelMain, type BrowserWindow } from "electron";

import { output } from "./output";
import {
  createSessionHost,
  type ServerReply,
  type SessionHost,
} from "./session-host";

/** The channel the renderer's end of the snapshot port is delivered on. */
export const NET_PORT_CHANNEL = "gis:net-port";

/** A message from the web side (already parsed; `__gisNet` checked). */
export type NetRequest = {
  action?: "host" | "stop" | "status";
  requestId?: number;
  params?: unknown;
};

/** An event to inject back into the page (see the web bridge's protocol). */
export type NetEvent =
  | {
      event: "hosted";
      requestId: number;
      ok: boolean;
      levelId?: string;
      reason?: string;
    }
  | { event: "stopped"; requestId: number; ok: boolean }
  | {
      event: "status";
      requestId: number;
      ok: boolean;
      running: boolean;
      tick: number;
      phase: string;
      enemies: number;
    };

export type NetBridge = {
  handle: (request: NetRequest) => void;
  /** Kill any running session. Called when the window goes away — a server
   * outliving the only client it had is an orphan holding a level in memory. */
  shutdown: () => void;
};

/** How long the server may take to answer a control message. The page has its
 * own, longer timeout; this one exists so a wedged server produces a refusal
 * here rather than a silence the page can only guess at. */
const REPLY_TIMEOUT_MS = 15_000;

export function createNetBridge(
  window: BrowserWindow,
  emit: (event: NetEvent) => void,
): NetBridge {
  let host: SessionHost | null = null;
  /** Control requests waiting on a reply, oldest first. The server answers in
   * order, so a queue is enough and no correlation id has to cross — which
   * keeps `server/main.ts` free of request bookkeeping it would otherwise need
   * for the dedicated-server case too. */
  const pending: {
    kind: ServerReply["kind"];
    settle: (reply: ServerReply | null) => void;
  }[] = [];

  function settleNext(reply: ServerReply | null): void {
    const waiter = pending.shift();
    waiter?.settle(reply);
  }

  function await_(kind: ServerReply["kind"]): Promise<ServerReply | null> {
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        const index = pending.findIndex((entry) => entry.settle === settle);
        if (index >= 0) pending.splice(index, 1);
        resolve(null);
      }, REPLY_TIMEOUT_MS);
      const settle = (reply: ServerReply | null) => {
        clearTimeout(timer);
        resolve(reply);
      };
      pending.push({ kind, settle });
    });
  }

  function ensureHost(): SessionHost {
    if (host) return host;
    host = createSessionHost({
      onReply: (reply) => {
        // `ready` is unsolicited — the server announces itself once its module
        // graph is up — so it never settles a waiter.
        if (reply.kind === "ready") {
          output.info(`session server ready (protocol ${reply.protocol})`);
          return;
        }
        settleNext(reply);
      },
      onExit: (code, expected) => {
        host = null;
        // Everything still waiting is answered with a refusal rather than left
        // to time out: a crashed fork should reach the HOST screen in
        // milliseconds, not in fifteen seconds of apparent hang.
        while (pending.length) settleNext(null);
        if (!expected) output.warn(`session server crashed (code ${code})`);
      },
    });
    host.start();
    return host;
  }

  return {
    handle(request) {
      const requestId = request.requestId ?? 0;
      if (request.action === "host") {
        void startSession(requestId, request.params);
        return;
      }
      if (request.action === "stop") {
        host?.stop();
        host = null;
        emit({ event: "stopped", requestId, ok: true });
        return;
      }
      if (request.action === "status") {
        void status(requestId);
      }
    },

    shutdown() {
      host?.stop();
      host = null;
    },
  };

  async function startSession(
    requestId: number,
    params: unknown,
  ): Promise<void> {
    if (!params || typeof params !== "object") {
      emit({ event: "hosted", requestId, ok: false, reason: "bad-params" });
      return;
    }
    try {
      const running = ensureHost();
      // Mint the pair, hand one end to each side, hold neither.
      const channel = new MessageChannelMain();
      running.givePort(channel.port1, { kind: "start", params });
      window.webContents.postMessage(NET_PORT_CHANNEL, null, [channel.port2]);
      const reply = await await_("started");
      if (reply?.kind === "started") {
        emit({ event: "hosted", requestId, ok: true, levelId: reply.levelId });
        return;
      }
      emit({
        event: "hosted",
        requestId,
        ok: false,
        reason: reply?.kind === "error" ? reply.detail : "no-reply",
      });
    } catch (err) {
      output.error(`could not host a session: ${String(err)}`);
      emit({ event: "hosted", requestId, ok: false, reason: String(err) });
    }
  }

  async function status(requestId: number): Promise<void> {
    if (!host?.running) {
      emit({
        event: "status",
        requestId,
        ok: true,
        running: false,
        tick: 0,
        phase: "idle",
        enemies: 0,
      });
      return;
    }
    host.send({ kind: "status" });
    const reply = await await_("status");
    emit({
      event: "status",
      requestId,
      ok: reply?.kind === "status",
      running: true,
      tick: reply?.kind === "status" ? reply.tick : 0,
      phase: reply?.kind === "status" ? reply.phase : "unknown",
      enemies: reply?.kind === "status" ? reply.enemies : 0,
    });
  }
}
