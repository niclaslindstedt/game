// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE SESSION SERVER'S ENTRY POINT — what Electron's `utilityProcess` forks,
// and (past PR 5) what the standalone dedicated server runs unchanged.
//
// It is deliberately thin. Everything interesting is in `session.ts`; this file
// is the process's edges: the control channel in, the `MessagePort` that
// carries snapshots out, and an orderly death.
//
// **WHY A UTILITY PROCESS AND NOT THE MAIN ONE** — three reasons, each enough
// on its own (docs/multiplayer-plan.md §1.2). A 60 Hz simulation must not
// compete with the main process's IPC, window, Workshop-compile and Steam
// duties. The engine holds 36 process-global mutable bindings — the `BALANCE`
// tuning object, the six flags in `src/game/flags.ts`, and every `activeXDefs`
// catalog `registerDefs` swaps when a mod loads — none of it per-`GameState`,
// so a process boundary is what stops one session's `/players 8`, another's mod
// list and a third's GENERATED MAPS setting from stomping each other. And it
// leaves exactly one code path, because the host's renderer becomes just
// another client.
//
// ONE PROCESS PER SESSION, not per app: PR 5's dedicated server runs several,
// and one process per session is what makes that free.
//
// **SNAPSHOTS DO NOT TRAVEL DOWN THE CONTROL CHANNEL.** The four existing
// bridges move a handful of JSON round trips per session; this one moves a
// snapshot twenty times a second, and routing that through the main process's
// single JSON channel would put the window's own event loop between the
// simulation and the screen. So the main process hands the renderer's
// `MessagePort` straight through to this process at startup and the two talk
// directly, with the `ArrayBuffer` transferred rather than copied. The control
// channel carries only lifecycle: start, stop, status.

import { engineVersion } from "@game/core";

import { createSession, type Session } from "./session.ts";
import { decodeFrame } from "./wire/codec.ts";
import {
  PROTOCOL_VERSION,
  TICK_MS,
  type SessionParams,
} from "./wire/protocol.ts";

/** A message from the main process, down the control channel. */
type ControlMessage =
  | { kind: "start"; params: SessionParams; mods?: string[] }
  | { kind: "stop" }
  | { kind: "status" };

/** A message back up it. */
type ControlReply =
  | { kind: "ready"; protocol: number }
  | { kind: "started"; levelId: string }
  | { kind: "status"; tick: number; phase: string; enemies: number }
  | { kind: "stopped"; reason: string }
  | { kind: "error"; detail: string };

/** The port the main process posts on and this process replies to. Typed
 * structurally: `electron`'s own types are not available in this tree (the
 * server is engine code compiled for Node, and pulling Electron's types into
 * it would make the dedicated-server build need Electron). */
type ParentPort = {
  on(
    event: "message",
    listener: (event: { data: unknown; ports?: unknown[] }) => void,
  ): void;
  postMessage(message: unknown): void;
};

/** The renderer's end of the snapshot channel, once it has been handed over. */
type ClientPort = {
  postMessage(message: unknown, transfer?: unknown[]): void;
  on?(event: "message", listener: (event: { data: unknown }) => void): void;
  start?(): void;
  close?(): void;
};

/** The one client of PR 1: the host's own renderer, which owns the hero. */
const HOST_CLIENT = 1;

let session: Session | null = null;
let timer: ReturnType<typeof setInterval> | null = null;
let clientPort: ClientPort | null = null;
let lastAdvanceMs = 0;

const parent = (process as unknown as { parentPort?: ParentPort }).parentPort;

if (parent) {
  parent.on("message", (event) => {
    const port = event.ports?.[0] as ClientPort | undefined;
    if (port) attachClient(port);
    handleControl(event.data as ControlMessage, (reply) =>
      parent.postMessage(reply),
    );
  });
  parent.postMessage({ kind: "ready", protocol: PROTOCOL_VERSION });
}

/**
 * Take over the renderer's snapshot channel.
 *
 * A port arriving before a session has started is normal and is why the port
 * is held rather than used: the main process hands it over with the very
 * message that starts the session, and the order the two halves of one message
 * are processed in is not something to depend on.
 */
function attachClient(port: ClientPort): void {
  clientPort = port;
  port.on?.("message", (event) => {
    // Client → server. Nothing here reaches the simulation directly: the frame
    // is decoded, refused if it is not one, and handed to the session, which
    // owns what an input may do. That layering is what PR 5's hardening hangs
    // off — an open UDP port eventually delivers bytes from strangers to this
    // same decoder.
    const frame = decodeFrame(event.data as ArrayBuffer);
    if (!frame || !session) return;
    session.receive(HOST_CLIENT, frame.type, frame.seq, frame.payload);
  });
  port.start?.();
  if (session) joinHost();
}

function joinHost(): void {
  const port = clientPort;
  if (!session || !port) return;
  session.addClient(
    HOST_CLIENT,
    (frame) => port.postMessage(frame, [frame]),
    true,
  );
}

function handleControl(
  message: ControlMessage | undefined,
  reply: (event: ControlReply) => void,
): void {
  if (!message || typeof message !== "object") return;
  try {
    if (message.kind === "start") {
      stop("restarted");
      session = createSession({
        params: message.params,
        // The BUILD the handshake compares is the engine's own version, read
        // here rather than passed in by the shell: two places holding the same
        // string is two places that can disagree, and this one is the only one
        // that has actually loaded the engine it is describing.
        build: engineVersion,
        mods: message.mods,
      });
      if (clientPort) joinHost();
      startClock();
      reply({ kind: "started", levelId: message.params.levelId });
      return;
    }
    if (message.kind === "stop") {
      stop("stopped");
      reply({ kind: "stopped", reason: "stopped" });
      return;
    }
    if (message.kind === "status") {
      reply({
        kind: "status",
        tick: session?.tick ?? 0,
        phase: session ? session.state.phase : "idle",
        enemies: session ? session.state.enemies.length : 0,
      });
    }
  } catch (err) {
    reply({ kind: "error", detail: String(err) });
  }
}

/**
 * The wall clock, and the one place a timer exists.
 *
 * `setInterval` at the tick period, with the session paying for the REAL time
 * elapsed rather than for one tick per callback. A timer that fires late (and
 * they all do, under load) would otherwise run the simulation slow — the run
 * would still be internally consistent, but it would drift away from every
 * clock the player can see, and on the direct path away from the other seven
 * players too.
 */
function startClock(): void {
  stopClock();
  lastAdvanceMs = now();
  timer = setInterval(() => {
    const at = now();
    const elapsed = at - lastAdvanceMs;
    // Whole ticks only — the remainder is left on the clock and paid next
    // callback, which is what keeps the timestep fixed.
    const ran = session?.advance(elapsed) ?? 0;
    lastAdvanceMs += ran * TICK_MS;
    // A very long stall (a suspended laptop) would otherwise leave a debt the
    // session refuses to pay in one go and never catches up on, so the clock
    // is re-seated once the backlog passes what one advance can run.
    if (at - lastAdvanceMs > 1000) lastAdvanceMs = at;
  }, TICK_MS);
}

function stopClock(): void {
  if (timer) clearInterval(timer);
  timer = null;
}

function stop(reason: string): void {
  stopClock();
  session?.close(reason);
  session = null;
}

/** Monotonic ms. `performance.now()` where it exists (it does in Electron's
 * Node and in Node 16+), so a system clock change cannot make a tick take a
 * negative amount of time. */
function now(): number {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}

// A supervisor killing this process gets an orderly shutdown; a crash gets
// reported by the parent, which is watching for the exit either way.
process.on("exit", () => stop("exit"));
