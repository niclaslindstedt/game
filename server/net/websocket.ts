// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// A LOOPBACK WEBSOCKET LISTENER, in Node builtins and nothing else.
//
// It exists for one caller — `server/shell-host.ts`, the sidecar mode a shell
// with no `utilityProcess` drives the session through — and it is deliberately
// the smallest thing that can carry that traffic rather than a general-purpose
// server:
//
//   * BINARY MESSAGES ONLY, which is what a snapshot is. A text frame is
//     refused rather than decoded, because nothing on this channel sends one.
//   * ONE PATH, and a token on the query string, checked before the handshake
//     is answered. Loopback is not a permission — anything running as the
//     player can reach 127.0.0.1 — so the token is what makes the channel the
//     page's rather than any process's.
//   * NO PERMESSAGE-DEFLATE. The frames are already delta-compressed by
//     `wire/delta.ts`, and negotiating an extension would put a second
//     compressor on the hot path to save nothing.
//   * A HARD CEILING PER MESSAGE, so a hostile local process cannot ask this
//     process to allocate its way out of memory.
//
// **WHY A WEBSOCKET AT ALL** is `shell-host.ts`'s header: the short version is
// that Electron hands the renderer a `MessagePort` and Tauri's IPC has no port
// transfer, so the property that mattered — the shell is NOT in the snapshot
// path — has to be bought some other way, and a loopback socket the page opens
// itself is the only candidate that keeps it without a COOP/COEP header on the
// game's own origin.
//
// The protocol is RFC 6455 and the parts of it a browser actually uses:
// the handshake, masked client frames, continuation, ping/pong and close.
// Everything else is a refusal.

import { createHash, timingSafeEqual } from "node:crypto";
import { createServer, type IncomingMessage, type Server } from "node:http";
import type { Socket } from "node:net";
import type { Duplex } from "node:stream";

/** RFC 6455's fixed handshake salt. */
const GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";

const OP_CONTINUATION = 0x0;
const OP_TEXT = 0x1;
const OP_BINARY = 0x2;
const OP_CLOSE = 0x8;
const OP_PING = 0x9;
const OP_PONG = 0xa;

/**
 * The most one message may be.
 *
 * A snapshot is kilobytes and the biggest thing on this channel is a full
 * static tier, which `wire/split.ts` already fragments. Eight megabytes is
 * therefore two orders of magnitude of headroom and still a number a local
 * attacker cannot turn into an allocation.
 */
const MAX_MESSAGE_BYTES = 8 * 1024 * 1024;

/** One connected page, as the caller sees it. */
export type WebSocketPeer = {
  /** Send one binary message. Silent when the socket has gone. */
  send(data: Uint8Array): void;
  /** Every binary message that arrives. */
  onMessage(listener: (data: Uint8Array) => void): void;
  /** The socket ended, for any reason. Called at most once. */
  onClose(listener: () => void): void;
  /** Close it politely. */
  close(): void;
};

export type WebSocketListener = {
  /** The address the listener actually got — never the one that was asked
   * for, which for an ephemeral bind is 0. */
  readonly port: number;
  close(): void;
};

export type WebSocketListenerOptions = {
  /** Always a loopback address in this program; a parameter so a test can say
   * so out loud. */
  host: string;
  /** 0 asks the OS for a free one, which is what the sidecar does. */
  port: number;
  /** The single path an upgrade may name. */
  path: string;
  /** The secret that has to be on the query string. */
  token: string;
  /** A page connected. */
  onPeer(peer: WebSocketPeer): void;
  /** Something was refused, for the launch log. */
  onRefused(reason: string): void;
};

/**
 * Start listening, and answer where.
 *
 * The HTTP server answers NOTHING on an ordinary request — the only thing this
 * port is for is the upgrade, and a listener that served a 200 to a plain GET
 * would be a local web server the game did not mean to run.
 */
export async function listenForWebSockets(
  options: WebSocketListenerOptions,
): Promise<WebSocketListener> {
  const server = createServer((_request, response) => {
    response.writeHead(426, { "content-type": "text/plain; charset=utf-8" });
    response.end("Upgrade required");
  });

  server.on("upgrade", (request, socket) => {
    const refusal = checkUpgrade(request, options);
    if (refusal) {
      options.onRefused(refusal);
      // A bare 400 and nothing else: an upgrade this process did not want is
      // not a conversation worth continuing.
      socket.write("HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n");
      socket.destroy();
      return;
    }
    const key = request.headers["sec-websocket-key"];
    socket.write(
      "HTTP/1.1 101 Switching Protocols\r\n" +
        "Upgrade: websocket\r\n" +
        "Connection: Upgrade\r\n" +
        `Sec-WebSocket-Accept: ${acceptKey(String(key))}\r\n\r\n`,
    );
    // Nagle would hold a snapshot back waiting for company. The whole point of
    // this channel is that a frame leaves when it is made. The upgrade handler
    // is typed as a bare `Duplex`; on this server it is always a TCP socket,
    // and Nagle is a TCP setting.
    (socket as Socket).setNoDelay(true);
    options.onPeer(attach(socket));
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(options.port, options.host, () => {
      server.removeListener("error", reject);
      resolve();
    });
  });

  return {
    get port() {
      return boundPort(server);
    },
    close: () => server.close(),
  };
}

/** The handshake's answer to the client's key. */
export function acceptKey(key: string): string {
  return createHash("sha1").update(`${key}${GUID}`).digest("base64");
}

/**
 * Is this upgrade ours? The refusal, or null.
 *
 * Exported because it is the whole of the admission decision and is worth
 * asserting directly: everything else in this file is framing.
 */
export function checkUpgrade(
  request: Pick<IncomingMessage, "url" | "headers">,
  options: Pick<WebSocketListenerOptions, "path" | "token">,
): string | null {
  if (String(request.headers.upgrade ?? "").toLowerCase() !== "websocket") {
    return "not a websocket upgrade";
  }
  if (!request.headers["sec-websocket-key"]) return "no handshake key";
  // A relative URL needs a base to parse against, and the base is never used:
  // only the path and the query are read.
  let url: URL;
  try {
    url = new URL(request.url ?? "/", "http://localhost");
  } catch {
    return "an unreadable request line";
  }
  if (url.pathname !== options.path) return `an unknown path (${url.pathname})`;
  if (!sameSecret(url.searchParams.get("token") ?? "", options.token)) {
    return "the wrong token";
  }
  return null;
}

/** A comparison that does not leak the answer through its own duration. */
function sameSecret(offered: string, expected: string): boolean {
  const a = Buffer.from(offered);
  const b = Buffer.from(expected);
  // `timingSafeEqual` throws on a length mismatch, which is itself the answer
  // for a fixed-length token — and a token is fixed length here.
  return a.length === b.length && timingSafeEqual(a, b);
}

function boundPort(server: Server): number {
  const address = server.address();
  return typeof address === "object" && address !== null ? address.port : 0;
}

/**
 * Turn an upgraded socket into a message peer.
 *
 * The reader is a single growing buffer rather than a state machine over
 * chunks, because a message here is small and a snapshot arrives whole far more
 * often than not; the buffer is compacted on every complete frame so a long
 * session does not accumulate one.
 */
function attach(socket: Duplex): WebSocketPeer {
  let messageListener: ((data: Uint8Array) => void) | null = null;
  let closeListener: (() => void) | null = null;
  let closed = false;
  // Typed as the loose `Buffer`, because what arrives on `data` is a view onto
  // whatever the socket allocated and a narrower annotation would refuse it.
  let pending: Buffer = Buffer.alloc(0);
  /** The opcode a continuation belongs to, and what has arrived of it. */
  let fragmentOpcode = 0;
  let fragments: Buffer[] = [];
  let fragmentBytes = 0;

  const end = (): void => {
    if (closed) return;
    closed = true;
    socket.destroy();
    closeListener?.();
  };

  socket.on("error", end);
  socket.on("close", end);
  socket.on("data", (chunk: Buffer) => {
    pending = pending.length === 0 ? chunk : Buffer.concat([pending, chunk]);
    for (;;) {
      const frame = readFrame(pending);
      if (frame === null) return;
      if (frame === "too-big") {
        end();
        return;
      }
      pending = pending.subarray(frame.consumed);
      handleFrame(frame);
    }
  });

  function handleFrame(frame: Frame): void {
    if (frame.opcode === OP_CLOSE) {
      end();
      return;
    }
    if (frame.opcode === OP_PING) {
      socket.write(encodeFrame(OP_PONG, frame.payload));
      return;
    }
    if (frame.opcode === OP_PONG) return;
    if (frame.opcode === OP_TEXT) {
      // Nothing on this channel sends text — the control channel is the
      // sidecar's stdio. A text frame is therefore a stranger, not a bug.
      end();
      return;
    }
    if (frame.opcode === OP_BINARY) {
      fragmentOpcode = OP_BINARY;
      fragments = [];
      fragmentBytes = 0;
    } else if (frame.opcode !== OP_CONTINUATION || fragmentOpcode === 0) {
      end();
      return;
    }
    fragments.push(frame.payload);
    fragmentBytes += frame.payload.length;
    if (fragmentBytes > MAX_MESSAGE_BYTES) {
      end();
      return;
    }
    if (!frame.fin) return;
    const whole =
      fragments.length === 1 ? fragments[0]! : Buffer.concat(fragments);
    fragmentOpcode = 0;
    fragments = [];
    fragmentBytes = 0;
    messageListener?.(new Uint8Array(whole));
  }

  return {
    send(data) {
      if (closed) return;
      socket.write(encodeFrame(OP_BINARY, Buffer.from(data)));
    },
    onMessage(listener) {
      messageListener = listener;
    },
    onClose(listener) {
      closeListener = listener;
      if (closed) listener();
    },
    close: end,
  };
}

type Frame = {
  fin: boolean;
  opcode: number;
  payload: Buffer;
  /** How much of the buffer this frame took. */
  consumed: number;
};

/**
 * One frame off the front of the buffer: the frame, `null` for "not yet", or
 * `"too-big"` for a length nothing on this channel could legitimately send.
 *
 * A CLIENT frame is always masked, and an unmasked one is a protocol violation
 * rather than a convenience — but this reader accepts either, because the
 * caller is a browser in production and a test harness otherwise, and refusing
 * the unmasked case would only mean the test had to implement masking to prove
 * something about framing.
 */
export function readFrame(buffer: Buffer): Frame | null | "too-big" {
  if (buffer.length < 2) return null;
  const first = buffer[0]!;
  const second = buffer[1]!;
  const fin = (first & 0x80) !== 0;
  const opcode = first & 0x0f;
  const masked = (second & 0x80) !== 0;
  let length = second & 0x7f;
  let at = 2;
  if (length === 126) {
    if (buffer.length < at + 2) return null;
    length = buffer.readUInt16BE(at);
    at += 2;
  } else if (length === 127) {
    if (buffer.length < at + 8) return null;
    const big = buffer.readBigUInt64BE(at);
    if (big > BigInt(MAX_MESSAGE_BYTES)) return "too-big";
    length = Number(big);
    at += 8;
  }
  if (length > MAX_MESSAGE_BYTES) return "too-big";
  const maskAt = at;
  if (masked) at += 4;
  if (buffer.length < at + length) return null;

  const payload = Buffer.from(buffer.subarray(at, at + length));
  if (masked) {
    for (let i = 0; i < payload.length; i++) {
      payload[i] = payload[i]! ^ buffer[maskAt + (i % 4)]!;
    }
  }
  return { fin, opcode, payload, consumed: at + length };
}

/** One SERVER frame, which is never masked. */
export function encodeFrame(opcode: number, payload: Buffer): Buffer {
  const length = payload.length;
  let header: Buffer;
  if (length < 126) {
    header = Buffer.alloc(2);
    header[1] = length;
  } else if (length < 0x1_0000) {
    header = Buffer.alloc(4);
    header[1] = 126;
    header.writeUInt16BE(length, 2);
  } else {
    header = Buffer.alloc(10);
    header[1] = 127;
    header.writeBigUInt64BE(BigInt(length), 2);
  }
  header[0] = 0x80 | opcode;
  return Buffer.concat([header, payload]);
}
