// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE LOOPBACK TRANSPORT — a `MessagePort` dressed as a `ClientTransport`.
//
// This is the loopback case's whole networking, and there is deliberately none
// of it: the host's renderer and the session server are two processes on one
// machine, so the "wire" is a port the main process handed over. Real
// transports (Steam P2P, direct UDP) sit behind the same three-method shape,
// which is the only reason this file is worth having as its own module rather
// than as four lines inside the run driver.
//
// **Snapshots do not travel down the `__gisNet` control channel**, and this is
// where that decision becomes concrete. The four existing bridges move a
// handful of JSON round trips per session; this one moves a snapshot twenty
// times a second, and routing that through the main process's single JSON
// channel would put the window's own event loop between the simulation and the
// screen. The port is a direct renderer↔utility-process link. The large,
// frequent SERVER → CLIENT snapshots are transferred by the server; the tiny
// CLIENT → SERVER input/command frames are copied here. Electron hands this
// port into the page through a context-isolated preload, and a transfer list on
// that proxied `postMessage` throws instead of sending — leaving the session
// visibly alive while every keyboard and pointer input disappears.

import type { ClientTransport } from "@game/client";

/**
 * Wrap a `MessagePort` for the net client.
 *
 * The port is started here rather than by the caller, because a port that is
 * never started silently queues everything the server sends — including the
 * welcome, which means a run that simply never begins with nothing on screen
 * to say why.
 */
export function portTransport(port: MessagePort): ClientTransport {
  let listener: ((frame: ArrayBuffer) => void) | null = null;
  let open = true;

  port.onmessage = (event: MessageEvent) => {
    const data = event.data as unknown;
    if (data instanceof ArrayBuffer) listener?.(data);
  };
  port.start();

  return {
    send(frame) {
      if (!open) return;
      try {
        // Do not add `[frame]` here. In a browser-owned MessagePort that would
        // save one small copy, but Electron's contextBridge proxy cannot carry
        // the transfer list back into the isolated preload world. Input frames
        // are tiny; snapshots remain zero-copy in the other direction.
        port.postMessage(frame);
      } catch {
        // The other end went away between the check and the post. Every caller
        // already handles a session that stops answering; throwing out of an
        // input send would take the render loop's frame with it.
      }
    },
    onFrame(next) {
      listener = next;
    },
    close() {
      if (!open) return;
      open = false;
      listener = null;
      port.onmessage = null;
      port.close();
    },
  };
}
