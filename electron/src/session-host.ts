// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE SESSION HOST — the utilityProcess's whole lifecycle, and nothing else.
//
// One process per SESSION, not per app. The dedicated server runs several,
// and one process per session is what makes that free; it is also what keeps
// the engine's 36 process-global mutable bindings — the `BALANCE` tuning
// object, the six flags in `engine/game/flags.ts`, every `activeXDefs` catalog
// `registerDefs` swaps when a mod loads — from being shared between two runs
// that disagree about them.
//
// `utilityProcess` rather than the main process, and rather than a
// `BrowserWindow`: it is a real Node child with an IPC channel and, crucially,
// the ability to be handed a `MessagePort` that reaches the RENDERER directly.
// That port is the whole reason snapshots do not cost the main process
// anything — see `net.ts` for the split between control and game traffic.
//
// **A crashed session must look like a crashed session.** The exit handler
// fires for a clean stop and for a segfault alike, so the reason is recorded
// BEFORE the kill and read back in the handler; without that, a server that
// died mid-run and one the player asked to stop are indistinguishable, and the
// HOST screen would say "stopped" over a crash.

import {
  utilityProcess,
  type MessagePortMain,
  type UtilityProcess,
} from "electron";

import { output } from "./output";
import { serverEntryPath } from "./resources";

/** Where a socket ACTUALLY ended up. Never the port that was requested — see
 * `server/net/udp.ts` for why that distinction is a rule rather than a detail. */
export type ServerBound = { address: string; port: number };

/** What the ROUTER row on the HOST screen reads. Mirrors `MappingState` in
 * `server/net/upnp.ts`. */
export type ServerMapping =
  | { status: "idle" }
  | { status: "mapping" }
  | {
      status: "mapped";
      method: "nat-pmp" | "upnp";
      externalAddress: string | null;
      externalPort: number;
    }
  | { status: "failed"; detail: string };

/** One seat, as everybody else may see it. Mirrors `RosterEntry` in
 * `server/wire/protocol.ts`. */
export type ServerRosterEntry = {
  slot: number;
  name: string;
  playing: boolean;
  ping: number;
  rate: number;
};

/** A message down the control channel to the server. Mirrors `ControlMessage`
 * in `server/main.ts` — keep the two in step. */
export type ServerControl =
  | {
      kind: "start";
      params: unknown;
      mods?: string[];
      /** The catalog overrides those mods registered, opaque like
       * `adopt` — the session registers them before it builds. */
      modDefs?: unknown;
      password?: string;
      maxClients?: number;
      /** Seats to fill with the session's own AUTOPILOT heroes. A session fact
       * like `maxClients` beside it — never on the params, which describe the
       * run itself. */
      bots?: number;
      /** A run the session should ADOPT rather than build. Opaque here — this
       * process never learns what a run is, which is the point of the two
       * channels (see net.ts). */
      adopt?: unknown;
      /** Whether the hub may admit peers over a transport other than the
       * Steam relay. The shell decides it from what the build permits. */
      allowDirect?: boolean;
    }
  | { kind: "stop" }
  | { kind: "status" }
  | {
      kind: "listen";
      port?: number;
      udp?: boolean;
      steam?: boolean;
      /** Whether the session may ask the router to forward the bound port. */
      map?: boolean;
    }
  /** The other role: JOIN somebody else's session instead of hosting one. The
   * same fork, the same port to the renderer — see `server/main.ts`. */
  | {
      kind: "connect";
      address?: string;
      peer?: string;
      name: string;
      password?: string;
      mods?: string[];
      hardcore?: boolean;
      /** The hero this player brings, opaque here like `adopt`. */
      loadout?: unknown;
    }
  | { kind: "peer"; from: string; data: number[] }
  | { kind: "peer-lost"; from: string; reason: string };

/** A message back up it. Mirrors `ControlReply` in `server/main.ts`. */
export type ServerReply =
  | { kind: "ready"; protocol: number }
  | { kind: "started"; levelId: string }
  | {
      kind: "status";
      tick: number;
      phase: string;
      enemies: number;
      clients: number;
      bound: ServerBound | null;
      mapping: ServerMapping;
      roster: ServerRosterEntry[];
    }
  | {
      kind: "listening";
      bound: ServerBound | null;
      steam: boolean;
      protocol: number;
      build: string;
      detail?: string;
    }
  | { kind: "connected"; ok: boolean; reason?: string; detail?: string }
  | {
      kind: "peer-send";
      to: string;
      data: number[];
      mode: "reliable" | "unreliable";
    }
  | { kind: "invite" }
  | { kind: "log"; line: string }
  | { kind: "stopped"; reason: string }
  | { kind: "error"; detail: string };

/**
 * The replies nothing is ever WAITING on.
 *
 * The bridge above matches replies to requests by ORDER — the server answers in
 * order, so a queue is enough and no correlation id has to cross. That only
 * holds if unsolicited messages are excluded, and getting this list wrong is
 * silent: a log line would settle whatever request happened to be in flight,
 * and the HOST screen would report a refusal it was never sent.
 */
export const UNSOLICITED: ReadonlySet<ServerReply["kind"]> = new Set([
  "ready",
  "peer-send",
  "invite",
  "log",
]);

export type SessionHostOptions = {
  /** Every reply the server sends, in order. */
  onReply: (reply: ServerReply) => void;
  /** The process ended. `expected` is false for a crash. */
  onExit: (code: number, expected: boolean) => void;
  /** Fork a child. Injected so the lifecycle is testable without an Electron
   * runtime — the desktop check job deliberately installs no 100 MB binary
   * (see electron/tests/), and a supervisor that can only be tested by
   * launching the app is a supervisor that is never tested. */
  fork?: ForkFn;
};

/** The one thing this module needs from Electron, narrowed to what it uses. */
export type ForkFn = (entry: string) => UtilityProcess;

export type SessionHost = {
  /** True between `start()` and the process exiting. */
  readonly running: boolean;
  start(): void;
  /** Send one control message. A no-op when nothing is running. */
  send(message: ServerControl): void;
  /** Hand the server the renderer's end of the snapshot channel. */
  givePort(port: MessagePortMain, message: ServerControl): void;
  /** Ask for an orderly shutdown, then kill if it does not come. */
  stop(): void;
};

/** How long a `stop` may take to be honoured before the process is killed.
 * Short: the server's own stop is synchronous, so anything past this is a
 * process that is no longer answering, and a host that will not quit is worse
 * than one that is killed. */
const SHUTDOWN_GRACE_MS = 2_000;

export function createSessionHost(options: SessionHostOptions): SessionHost {
  const fork: ForkFn = options.fork ?? ((entry) => utilityProcess.fork(entry));
  let child: UtilityProcess | null = null;
  let expectedExit = false;
  let killTimer: ReturnType<typeof setTimeout> | null = null;

  function clearKillTimer(): void {
    if (killTimer) clearTimeout(killTimer);
    killTimer = null;
  }

  return {
    get running() {
      return child !== null;
    },

    start() {
      if (child) return;
      expectedExit = false;
      const entry = serverEntryPath();
      output.info(`session server: forking ${entry}`);
      child = fork(entry);
      child.on("message", (message: unknown) => {
        options.onReply(message as ServerReply);
      });
      child.on("exit", (code: number) => {
        clearKillTimer();
        const wasExpected = expectedExit;
        child = null;
        if (!wasExpected) {
          output.warn(`session server exited unexpectedly (code ${code})`);
        }
        options.onExit(code, wasExpected);
      });
    },

    send(message) {
      child?.postMessage(message);
    },

    givePort(port, message) {
      // The port travels WITH the message that starts the session, so the
      // server has it before there is anything to send down it. The server
      // tolerates either order (it holds an early port), but arriving together
      // is what makes the first snapshot the first thing the client sees.
      child?.postMessage(message, [port]);
    },

    stop() {
      if (!child) return;
      expectedExit = true;
      child.postMessage({ kind: "stop" } satisfies ServerControl);
      clearKillTimer();
      killTimer = setTimeout(() => {
        killTimer = null;
        if (!child) return;
        output.warn("session server did not stop; killing it");
        child.kill();
      }, SHUTDOWN_GRACE_MS);
    },
  };
}
