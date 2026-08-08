// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE SIDECAR MODE — how a shell with no `utilityProcess` drives a session.
//
// `main.ts` has two entries already: a `parentPort` (Electron forked us) and no
// parent at all (a person at a terminal — `dedicated.ts`). This is the third,
// and it exists because the Tauri shell is a Rust process that can spawn a
// child and nothing more: there is no `utilityProcess.fork`, no Node IPC
// channel, and — the part that shapes this whole file — no way to transfer a
// `MessagePort` to the page.
//
// **THE SPLIT IS THE SAME SPLIT, REACHED WITH TWO PIPES INSTEAD OF ONE.**
//
//   CONTROL   host / listen / stop / status / connect, plus the relayed Steam
//             packets. A handful of small JSON messages. They travel on this
//             process's own STDIO as newline-delimited JSON — the plainest
//             thing a parent process can read, needing no library on either
//             side, and exactly the traffic `parentPort` carries under
//             Electron.
//   GAME      a snapshot twenty times a second. It travels on a LOOPBACK
//             WEBSOCKET the PAGE opens directly to this process, so the shell
//             is not in the path — which is the one property Electron's
//             `MessagePort` bought and the only one worth paying for.
//
// **WHY THE WEBSOCKET WON** (`docs/desktop-shells.md` records the same
// argument). The alternatives were Tauri's own IPC with a
// binary channel, which puts the shell's event loop between the simulation and
// the screen for every frame — the exact cost the `MessagePort` was chosen to
// avoid — and a `SharedArrayBuffer` ring, which needs COOP/COEP on the game's
// own origin and would therefore change how the WEBSITE is served to suit one
// shell. A socket the page opens itself changes neither: the page's contract is
// still a `MessagePort` (the shell's initialization script mints the pair and
// bridges one end), the site is served exactly as before, and no game byte
// enters the shell.
//
// **WHAT IT COSTS is a listening socket, and the cost is answered rather than
// waved at.** It binds 127.0.0.1 on an EPHEMERAL port, it answers 426 to
// everything that is not the one upgrade path, and the upgrade carries a
// single-use secret this process mints and reports on stdout — so the only
// thing that can open it is something the shell told, which is the page. That
// is a strictly smaller door than the UDP socket a host already opens to the
// internet.
//
// **AND STDIN'S END IS THE ORPHAN REAPER.** Electron kills its utility process
// in `before-quit`; a spawned child has no such handler to inherit. Here the
// shell dying closes this process's stdin, and EOF on the control channel means
// nobody is driving — so the session stops and the process exits, rather than
// holding a level in memory for the rest of the login session.

import { randomBytes } from "node:crypto";
import type { Readable } from "node:stream";

import { listenForWebSockets, type WebSocketPeer } from "./net/websocket.ts";

/** The one path an upgrade may name. */
export const SNAPSHOT_PATH = "/snapshot";

/** Loopback only, and named rather than spelled inline: the whole security
 * argument above rests on this constant. */
export const SNAPSHOT_HOST = "127.0.0.1";

/** The renderer's end of the snapshot channel, in the shape `main.ts` already
 * hands to a session. Structural, exactly as the `MessagePort` one is. */
export type ClientPortLike = {
  postMessage(message: unknown, transfer?: unknown[]): void;
  on?(event: "message", listener: (event: { data: unknown }) => void): void;
  start?(): void;
  close?(): void;
};

export type ShellHostOptions = {
  /** One control message arrived. `reply` answers it, in order, exactly as the
   * `parentPort` entry does. */
  onControl(message: unknown, reply: (event: unknown) => void): void;
  /** The page opened (or re-opened) the snapshot channel. */
  onClient(port: ClientPortLike): void;
  /** Nobody is driving any more — the shell went away. */
  onOrphaned(): void;
  /** Where the control channel reads and writes. Injected so the whole mode is
   * testable without a real process's stdio. */
  input?: Readable;
  output?: { write(chunk: string): void };
};

export type ShellHost = {
  /** Send something nobody asked for — a relayed packet, a log line. */
  post(event: unknown): void;
  /** Where the page must connect, and with what. */
  readonly snapshot: { port: number; token: string; path: string };
  close(): void;
};

/**
 * Start the sidecar's two channels.
 *
 * The snapshot listener is bound BEFORE the ready line is written, so the
 * endpoint the shell reads is one that already exists — a page told to connect
 * to a port that is still binding is a race with no upside.
 */
export async function startShellHost(
  options: ShellHostOptions,
): Promise<ShellHost> {
  const input = options.input ?? process.stdin;
  const output = options.output ?? process.stdout;
  // 24 bytes of urlsafe base64. Long enough that guessing is not a strategy,
  // short enough to sit on a query string without wrapping a log line.
  const token = randomBytes(18).toString("base64url");

  /** The page, when it is connected. At most one: a reload replaces it, and
   * the previous socket is closed rather than left to be written to. */
  let peer: WebSocketPeer | null = null;

  const listener = await listenForWebSockets({
    host: SNAPSHOT_HOST,
    port: 0,
    path: SNAPSHOT_PATH,
    token,
    onRefused: (reason) =>
      write(output, {
        kind: "log",
        line: `snapshot channel refused ${reason}`,
      }),
    onPeer: (connected) => {
      peer?.close();
      peer = connected;
      options.onClient(portFor(connected, () => peer === connected));
      connected.onClose(() => {
        if (peer === connected) peer = null;
      });
    },
  });

  readLines(input, {
    onLine: (line) => {
      const message = parse(line);
      if (message === undefined) return;
      options.onControl(message, (event) => write(output, event));
    },
    // EOF on stdin IS the shell going away — see the header.
    onEnd: options.onOrphaned,
  });

  const snapshot = { port: listener.port, token, path: SNAPSHOT_PATH };
  return {
    post: (event) => write(output, event),
    snapshot,
    close: () => {
      peer?.close();
      peer = null;
      listener.close();
    },
  };
}

/**
 * The websocket, dressed as the port `main.ts` expects.
 *
 * `postMessage`'s transfer list is DROPPED rather than honoured, and that is
 * the one honest difference from the `MessagePort` path: a socket copies. The
 * caller transfers so that Electron's structured clone does not copy twice, and
 * a buffer it has given away is one it will not touch again either way — so
 * reading it here is safe and the transfer is simply moot.
 */
function portFor(peer: WebSocketPeer, current: () => boolean): ClientPortLike {
  return {
    postMessage(message) {
      if (!current()) return;
      peer.send(bytesOf(message));
    },
    on(_event, listener) {
      peer.onMessage((data) => {
        // The session's own reader takes an `ArrayBuffer`, and a view onto a
        // pooled socket buffer would be read after the pool moved on. The
        // slice is what makes the bytes the session's.
        listener({ data: data.slice().buffer });
      });
    },
    start() {
      /* a socket is already flowing */
    },
    close() {
      peer.close();
    },
  };
}

/** Whatever the session handed us, as bytes. */
function bytesOf(message: unknown): Uint8Array {
  if (message instanceof Uint8Array) return message;
  if (message instanceof ArrayBuffer) return new Uint8Array(message);
  // Nothing else reaches this channel — every frame is encoded by
  // `wire/codec.ts` — but an empty write beats a throw on the send path.
  return new Uint8Array(0);
}

/** One NDJSON line out. */
function write(output: { write(chunk: string): void }, event: unknown): void {
  try {
    output.write(`${JSON.stringify(event)}\n`);
  } catch {
    // A closed stdout means the shell is already gone; the EOF handler is
    // what acts on that, and throwing from a log line would take the session
    // down noisily instead.
  }
}

/** …and one back in, or `undefined` for a line that is not ours. */
function parse(line: string): unknown {
  const trimmed = line.trim();
  if (!trimmed) return undefined;
  try {
    const value: unknown = JSON.parse(trimmed);
    // An OBJECT, and an array is not one for this purpose: every control
    // message is `{ kind: … }`, and letting a bare `[]` through would put
    // something with no `kind` in front of the router for no reason.
    return typeof value === "object" && value !== null && !Array.isArray(value)
      ? value
      : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Newline-delimited reading, without `node:readline`.
 *
 * Deliberately hand-rolled: `readline` is fine and this needs one behaviour it
 * does not give plainly — a line longer than any control message could be is a
 * stream that is not ours, and dropping the accumulator rather than growing it
 * is what keeps a wrong pipe from becoming an allocation.
 */
function readLines(
  input: Readable,
  handlers: { onLine(line: string): void; onEnd(): void },
): void {
  /** No control message is anywhere near this; a relayed Steam packet is the
   * biggest and it is a few kilobytes of JSON digits. */
  const MAX_LINE = 4 * 1024 * 1024;
  let buffer = "";
  input.setEncoding?.("utf8");
  input.on("data", (chunk: string) => {
    buffer += chunk;
    if (buffer.length > MAX_LINE && !buffer.includes("\n")) {
      buffer = "";
      return;
    }
    let at = buffer.indexOf("\n");
    while (at >= 0) {
      handlers.onLine(buffer.slice(0, at));
      buffer = buffer.slice(at + 1);
      at = buffer.indexOf("\n");
    }
  });
  input.on("end", handlers.onEnd);
  input.on("close", handlers.onEnd);
}
