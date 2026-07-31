// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE NET bridge — the WEB half of the multiplayer seam, and the FIFTH arm of
// the shape cloud save, achievements, leaderboards and mods already use.
//
//   web → shell   `postToShell(JSON { __gisNet })`  (./shell-bridge.ts)
//   shell → web   `window.__gisNetEvent(…)` (called from OUTSIDE, via
//                 `executeJavaScript`, exactly as the other four bridges are)
//
// The protocol (mirrored by electron/src/net.ts — keep the two in step):
//   → { action: "host", requestId, params }     start a session
//   → { action: "stop", requestId }             end it
//   → { action: "status", requestId }           one line for the HOST screen
//   ← { event: "hosted", requestId, ok, levelId?, reason? }
//   ← { event: "stopped", requestId, ok }
//   ← { event: "status", requestId, ok, tick, phase, enemies }
//   ← { event: "port" }                         the snapshot channel is up
//
// **ONE THING MUST NOT BE COPIED FROM THE OTHER FOUR BRIDGES: THE VOLUME.**
// They move a handful of JSON round trips per session. This one would move a
// snapshot twenty times a second if it were allowed to, so it is not: the
// snapshots travel on their own `MessagePort`, handed to the page by the shell
// (`__gisShell.onNetPort`), and `__gisNet` carries only CONTROL traffic — host,
// stop, status. Nothing here ever sees a game byte.
//
// This module is import-free apart from the shell channel and the wire's own
// leaf types, and it must stay that way: the HOST and JOIN screens are TITLE
// MENU screens, i.e. the app's startup path, where the 170 KB critical-path
// budget forbids reaching `@game/core`. The run driver that does reach it lives
// in `pwa/src/game/net/`, behind a lazy import.

import type { SessionParams } from "@game/wire/protocol.ts";

import { postToShell, shellAvailable, shellPlatform } from "./shell-bridge.ts";

declare global {
  interface Window {
    /** The shell's callback into this page (installed by `initNetBridge`). */
    __gisNetEvent?: (event: unknown) => void;
  }
}

/** How long a control round trip may take before the caller is told nothing
 * answered. Forking a process and building a level is real work on a cold
 * disk, so this is generous — but finite, because a HOST screen that hangs is
 * worse than one that says it could not start. */
const CONTROL_TIMEOUT_MS = 20_000;

export type HostResult =
  { ok: true; levelId: string } | { ok: false; reason: string };

/** What the HOST screen shows about a running session. */
export type SessionStatus = {
  running: boolean;
  tick: number;
  phase: string;
  enemies: number;
};

let nextRequestId = 1;
const waiters = new Map<number, (payload: unknown) => void>();
let portListener: ((port: MessagePort) => void) | null = null;

/**
 * True where a session can actually be hosted: a shell with its channel up, on
 * Steam.
 *
 * The mobile shells are excluded and a browser is excluded, for the same
 * reason and not from lack of ambition — a phone has no listening socket and a
 * tab is not a server (decisions 13 and 14). They can JOIN later; nothing in
 * this design forecloses it, because every join path goes through the transport
 * seam.
 */
export function netBridgeAvailable(): boolean {
  return shellAvailable() && shellPlatform() === "steam";
}

/** Install the shell's callbacks. Idempotent; safe to call on every mount. */
export function initNetBridge(): void {
  if (!netBridgeAvailable()) return;
  if (!window.__gisNetEvent) {
    window.__gisNetEvent = (event: unknown) => {
      const payload = event as { requestId?: number } | null;
      if (!payload || typeof payload.requestId !== "number") return;
      const waiter = waiters.get(payload.requestId);
      if (!waiter) return;
      waiters.delete(payload.requestId);
      waiter(payload);
    };
  }
  window.__gisShell?.onNetPort?.((port) => portListener?.(port));
}

/**
 * Be told when the snapshot channel arrives.
 *
 * Registered BEFORE `hostSession` is called, always: the shell hands the port
 * over with the same message that starts the session, and a listener installed
 * afterwards would miss the welcome and leave a run that never begins.
 */
export function onSessionPort(listener: (port: MessagePort) => void): void {
  portListener = listener;
}

/** Start a session. The shell forks the server and hands back a port. */
export async function hostSession(params: SessionParams): Promise<HostResult> {
  const reply = (await request({ action: "host", params })) as {
    ok?: boolean;
    levelId?: string;
    reason?: string;
  } | null;
  if (reply?.ok && reply.levelId) return { ok: true, levelId: reply.levelId };
  return { ok: false, reason: reply?.reason ?? "no reply" };
}

/** End the running session and kill its process. */
export async function stopSession(): Promise<void> {
  await request({ action: "stop" });
}

/** One line for the HOST screen. Null when nothing answered. */
export async function sessionStatus(): Promise<SessionStatus | null> {
  const reply = (await request({ action: "status" })) as
    (SessionStatus & { ok?: boolean }) | null;
  return reply?.ok ? reply : null;
}

/**
 * One round trip.
 *
 * A timeout resolves null rather than rejecting, exactly as the mods bridge's
 * does: every caller here is drawing a screen, and a screen that throws because
 * a process was slow to fork is worse than one that reports it could not host.
 */
function request(message: Record<string, unknown>): Promise<unknown> {
  if (!netBridgeAvailable()) return Promise.resolve(null);
  const requestId = nextRequestId++;
  return new Promise((resolve) => {
    const timer = window.setTimeout(() => {
      waiters.delete(requestId);
      resolve(null);
    }, CONTROL_TIMEOUT_MS);
    waiters.set(requestId, (payload) => {
      window.clearTimeout(timer);
      resolve(payload);
    });
    postToShell({ __gisNet: true, ...message, requestId });
  });
}
