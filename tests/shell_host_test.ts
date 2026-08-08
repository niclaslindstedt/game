// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE SIDECAR'S TWO CHANNELS — the mode a shell with no `utilityProcess` drives
// a session through (`server/shell-host.ts`).
//
// Two things are worth proving here and neither can be proved from the Rust
// side, because the Rust side is the OTHER end of both pipes:
//
//   the CONTROL channel  newline-delimited JSON on stdio, and the EOF that
//                        reaps an orphaned session
//   the SNAPSHOT channel a real loopback WebSocket, opened with a real browser
//                        handshake, carrying real binary frames — which is what
//                        the page does and what nothing else in this repo does
//
// The socket half runs against `node:http`'s own client rather than a mock, so
// what is exercised is the framing a browser will actually send: masked client
// frames, an unmasked server reply, and the token on the query string.

import { createHash } from "node:crypto";
import { request as httpRequest } from "node:http";
import type { Socket } from "node:net";
import { PassThrough } from "node:stream";

import { afterEach, describe, expect, it } from "vitest";

import {
  acceptKey,
  checkUpgrade,
  encodeFrame,
  readFrame,
} from "../server/net/websocket.ts";
import {
  SNAPSHOT_HOST,
  SNAPSHOT_PATH,
  startShellHost,
  type ClientPortLike,
  type ShellHost,
} from "../server/shell-host.ts";

/** Everything a test started, closed on the way out. */
const running: { close(): void }[] = [];

afterEach(() => {
  while (running.length) running.pop()?.close();
});

type Harness = {
  host: ShellHost;
  /** Write one line into the control channel, as the shell does. */
  send(message: unknown): void;
  /** Every line the host wrote out, parsed. */
  out: unknown[];
  /** Every control message the host routed in. */
  control: unknown[];
  /** The snapshot ports the host handed over, newest last. */
  ports: ClientPortLike[];
  /** Whether stdin's EOF was seen. */
  orphaned(): boolean;
  input: PassThrough;
};

async function harness(): Promise<Harness> {
  const input = new PassThrough();
  const out: unknown[] = [];
  const control: unknown[] = [];
  const ports: ClientPortLike[] = [];
  let orphaned = false;
  let buffer = "";

  const host = await startShellHost({
    input,
    output: {
      write(chunk) {
        buffer += chunk;
        let at = buffer.indexOf("\n");
        while (at >= 0) {
          out.push(JSON.parse(buffer.slice(0, at)));
          buffer = buffer.slice(at + 1);
          at = buffer.indexOf("\n");
        }
      },
    },
    onControl: (message, reply) => {
      control.push(message);
      reply({ kind: "status", tick: control.length });
    },
    onClient: (port) => ports.push(port),
    onOrphaned: () => {
      orphaned = true;
    },
  });
  running.push(host);
  return {
    host,
    send: (message) => input.write(`${JSON.stringify(message)}\n`),
    out,
    control,
    ports,
    orphaned: () => orphaned,
    input,
  };
}

/** Open the snapshot channel the way the page's own adapter does. */
function connect(
  host: ShellHost,
  token = host.snapshot.token,
): Promise<{ socket: Socket; frames: Uint8Array[] }> {
  return new Promise((resolve, reject) => {
    const key = Buffer.from("0123456789abcdef").toString("base64");
    const req = httpRequest({
      host: SNAPSHOT_HOST,
      port: host.snapshot.port,
      path: `${SNAPSHOT_PATH}?token=${encodeURIComponent(token)}`,
      headers: {
        Connection: "Upgrade",
        Upgrade: "websocket",
        "Sec-WebSocket-Key": key,
        "Sec-WebSocket-Version": "13",
      },
    });
    req.on("upgrade", (response, socket) => {
      expect(response.headers["sec-websocket-accept"]).toBe(acceptKey(key));
      const frames: Uint8Array[] = [];
      let pending = Buffer.alloc(0);
      socket.on("data", (chunk: Buffer) => {
        pending = Buffer.concat([pending, chunk]);
        for (;;) {
          const frame = readFrame(pending);
          if (frame === null || frame === "too-big") return;
          pending = pending.subarray(frame.consumed);
          if (frame.opcode === 0x2) frames.push(new Uint8Array(frame.payload));
        }
      });
      resolve({ socket, frames });
    });
    req.on("response", () => reject(new Error("the upgrade was refused")));
    req.on("error", reject);
    req.end();
  });
}

/** A masked frame, which is what a browser always sends. */
function maskedFrame(payload: Buffer): Buffer {
  const mask = Buffer.from([1, 2, 3, 4]);
  const masked = Buffer.from(payload);
  for (let i = 0; i < masked.length; i++) {
    masked[i] = (masked[i] ?? 0) ^ (mask[i % 4] ?? 0);
  }
  const header = Buffer.from([0x82, 0x80 | masked.length]);
  return Buffer.concat([header, mask, masked]);
}

const settle = () => new Promise((done) => setTimeout(done, 30));

describe("the sidecar's control channel", () => {
  it("routes newline-delimited JSON in and answers on the same pipe", async () => {
    const shell = await harness();
    shell.send({ kind: "status" });
    shell.send({ kind: "stop" });
    await settle();

    expect(shell.control).toEqual([{ kind: "status" }, { kind: "stop" }]);
    expect(shell.out).toEqual([
      { kind: "status", tick: 1 },
      { kind: "status", tick: 2 },
    ]);
  });

  it("ignores anything on stdin that is not a control message", async () => {
    // Node writes its own diagnostics to this process's streams, and a session
    // killed by somebody else's output would be a spectacular way to lose a run.
    const shell = await harness();
    shell.input.write("\n");
    shell.input.write("Debugger attached.\n");
    shell.input.write("[]\n");
    shell.input.write("{ half an object\n");
    shell.send({ kind: "status" });
    await settle();

    expect(shell.control).toEqual([{ kind: "status" }]);
  });

  it("treats the end of stdin as the shell going away", async () => {
    // Electron reaps its utility process in `before-quit`; a spawned child has
    // to reap itself, and EOF is the signal it has. Without this a session
    // holds a whole level in memory for the rest of the login session.
    const shell = await harness();
    expect(shell.orphaned()).toBe(false);
    shell.input.end();
    await settle();
    expect(shell.orphaned()).toBe(true);
  });
});

describe("the sidecar's snapshot channel", () => {
  it("binds a loopback port the page can be told about", async () => {
    const shell = await harness();
    expect(shell.host.snapshot.port).toBeGreaterThan(0);
    expect(shell.host.snapshot.token.length).toBeGreaterThan(16);
    expect(shell.host.snapshot.path).toBe(SNAPSHOT_PATH);
  });

  it("carries frames both ways once the page connects", async () => {
    const shell = await harness();
    const { socket, frames } = await connect(shell.host);
    await settle();

    const port = shell.ports.at(-1);
    expect(port).toBeDefined();

    // Server → page: a snapshot, handed over as the session hands it over.
    const snapshot = new Uint8Array([1, 2, 3, 250]).buffer;
    port?.postMessage(snapshot, [snapshot]);
    await settle();
    expect(frames).toEqual([new Uint8Array([1, 2, 3, 250])]);

    // Page → server: an input frame, masked exactly as a browser masks it.
    const inbound: unknown[] = [];
    port?.on?.("message", (event) => inbound.push(event.data));
    socket.write(maskedFrame(Buffer.from([9, 8, 7])));
    await settle();
    expect(inbound).toHaveLength(1);
    expect(new Uint8Array(inbound[0] as ArrayBuffer)).toEqual(
      new Uint8Array([9, 8, 7]),
    );
    socket.destroy();
  });

  it("refuses an upgrade without the session's own token", async () => {
    // Loopback is not a permission — anything running as the player can reach
    // 127.0.0.1 — so the token is what makes the channel the page's.
    const shell = await harness();
    await expect(connect(shell.host, "not-the-token")).rejects.toThrow(
      /refused/,
    );
    expect(shell.ports).toHaveLength(0);
  });

  it("refuses an upgrade on any other path", async () => {
    expect(
      checkUpgrade(
        {
          url: "/anything?token=t",
          headers: { upgrade: "websocket", "sec-websocket-key": "k" },
        },
        { path: SNAPSHOT_PATH, token: "t" },
      ),
    ).toMatch(/unknown path/);
    // …and a plain request, which is what a curious local process sends first.
    expect(
      checkUpgrade(
        { url: `${SNAPSHOT_PATH}?token=t`, headers: {} },
        { path: SNAPSHOT_PATH, token: "t" },
      ),
    ).toMatch(/not a websocket/);
  });

  it("replaces the page rather than pumping into a socket nobody reads", async () => {
    // A reload, or hosting after joining. The old socket is closed rather than
    // left to receive frames the page will never see.
    const shell = await harness();
    const first = await connect(shell.host);
    await settle();
    const second = await connect(shell.host);
    await settle();

    expect(shell.ports).toHaveLength(2);
    const before = first.frames.length;
    const buffer = new Uint8Array([4]).buffer;
    shell.ports[1]?.postMessage(buffer, [buffer]);
    await settle();
    expect(first.frames.length).toBe(before);
    expect(second.frames).toEqual([new Uint8Array([4])]);
    first.socket.destroy();
    second.socket.destroy();
  });
});

describe("the frame reader", () => {
  it("waits rather than guessing when a frame arrives in pieces", () => {
    // TCP does not deliver messages, it delivers bytes; a reader that assumed
    // one chunk was one frame would drop every snapshot that crossed an MTU.
    const whole = encodeFrame(0x2, Buffer.from([1, 2, 3, 4, 5]));
    expect(readFrame(whole.subarray(0, 1))).toBeNull();
    expect(readFrame(whole.subarray(0, 4))).toBeNull();
    const frame = readFrame(whole);
    expect(frame).not.toBeNull();
    expect(frame).not.toBe("too-big");
    if (frame && frame !== "too-big") {
      expect([...frame.payload]).toEqual([1, 2, 3, 4, 5]);
      expect(frame.consumed).toBe(whole.length);
      expect(frame.fin).toBe(true);
    }
  });

  it("refuses a length no snapshot could have", () => {
    // A hostile local process must not be able to ask this one to allocate its
    // way out of memory.
    const header = Buffer.alloc(10);
    header[0] = 0x82;
    header[1] = 127;
    header.writeBigUInt64BE(1n << 40n, 2);
    expect(readFrame(header)).toBe("too-big");
  });

  it("writes the two extended length forms the way a browser reads them", () => {
    expect(encodeFrame(0x2, Buffer.alloc(10))[1]).toBe(10);
    expect(encodeFrame(0x2, Buffer.alloc(200))[1]).toBe(126);
    expect(encodeFrame(0x2, Buffer.alloc(70_000))[1]).toBe(127);
    // Never masked: masking is the CLIENT's obligation and a masked server
    // frame is a protocol error every browser closes the socket over.
    expect(encodeFrame(0x2, Buffer.alloc(1))[1]! & 0x80).toBe(0);
  });

  it("answers the handshake the way RFC 6455 spells it", () => {
    // The one value in the whole handshake a browser actually checks.
    const key = "dGhlIHNhbXBsZSBub25jZQ==";
    expect(acceptKey(key)).toBe(
      createHash("sha1")
        .update(`${key}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`)
        .digest("base64"),
    );
    expect(acceptKey(key)).toBe("s3pPLMBiTxaQ9kYGzzhZRbK+xOo=");
  });
});
