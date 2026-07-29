// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// CLOUD SAVE's transport — the WEB half of the native cloud-storage seam.
// Cross-device saving can only run inside the native shell (native/), where the
// platform's cloud lives (iCloud on iOS today; Google Play Games Saved Games is
// the planned Android drop-in), so this module speaks to it over the WebView's
// message channel exactly like the coin store's purchase bridge does:
//
//   web → shell   `postToShell(JSON { __gisCloud })`  (./shell-bridge.ts)
//   shell → web   the shell calls `window.__gisCloudEvent(...)` from outside
//                 (`injectJavaScript` on the WebView, `executeJavaScript` in
//                 Electron)
//
// The protocol (mirrored by native/src/cloud-save.ts — keep the two in step):
//   → { action: "init" }                       announce the web handler is up
//   → { action: "status", requestId }          who are we, and is a cloud up?
//   → { action: "load", requestId }            read the stored blob
//   → { action: "save", requestId, data }      write the blob
//   ← { event: "status", requestId, ok, available, provider?, player? }
//   ← { event: "load", requestId, ok, data }   data: string | null (no save yet)
//   ← { event: "save", requestId, ok, reason? }
//   ← { event: "changed" }                     the cloud changed underneath us
//                                              (another device wrote) — pull
//
// This module is transport ONLY: it knows nothing about characters, coins, or
// merging. game/cloud-save.ts owns the payload and the merge rules, so a second
// platform is a new native provider behind the same four messages.

import { postToShell, shellAvailable } from "./shell-bridge.ts";

declare global {
  interface Window {
    /** The native shell's callback into this page (installed by
     * `initCloudBridge`; called via `injectJavaScript`). */
    __gisCloudEvent?: (event: unknown) => void;
  }
}

/** Which platform cloud answered — labels the status line in SETTINGS → DATA
 * ("ICLOUD", later "GOOGLE PLAY"). */
export type CloudProviderId = "icloud" | "play-games";

/** The signed-in player behind the cloud, when the platform exposes one (Game
 * Center on iOS, Play Games on Android). Purely informational: the save is
 * keyed by the platform account, not by this id. */
export type CloudPlayer = { id: string; name: string };

/** What the native side reports about the cloud right now. */
export type CloudStatus = {
  /** A cloud is reachable and writable (signed into iCloud / Play Games). */
  available: boolean;
  provider?: CloudProviderId;
  player?: CloudPlayer;
};

/** Why a cloud write didn't land. `too-large` means the payload exceeded the
 * provider's per-key ceiling (iCloud's key-value store caps at 1 MB). */
export type CloudFailure = "unavailable" | "too-large" | "error";

/** How long a cloud request may take before it reports a failure. Cloud reads
 * hit a local mirror on iOS, so this is generous rather than tight. */
const REQUEST_TIMEOUT_MS = 20_000;

/** Called when the cloud changed underneath us (another device wrote) — the
 * sync engine pulls and merges. */
type ChangeHandler = () => void;

let changeHandler: ChangeHandler | null = null;
let nextRequestId = 1;
type Waiter = (event: Record<string, unknown> | null) => void;
const waiters = new Map<number, Waiter>();

/** True where a cloud request could actually run: the native shell with its
 * message channel up. Gates the CLOUD SAVE rows. */
export function cloudBridgeAvailable(): boolean {
  return shellAvailable();
}

function post(message: Record<string, unknown>): void {
  postToShell({ __gisCloud: true, ...message });
}

/**
 * Install the change handler and announce the page to the native side. Call
 * once at boot (App.tsx) whenever the shell is native; a no-op in the
 * browser/PWA, where there is no cloud to talk to.
 */
export function initCloudBridge(onChange: ChangeHandler): void {
  changeHandler = onChange;
  if (!cloudBridgeAvailable()) return;
  installHandler();
  post({ action: "init" });
}

/** Make sure the native side has somewhere to answer. Idempotent, and called
 * before every request as well as at boot: a request that went out with no
 * handler installed would simply never be answered (it would sit until its
 * timeout), which is a silent stall rather than a visible failure. */
function installHandler(): void {
  if (window.__gisCloudEvent !== handleEvent) {
    window.__gisCloudEvent = handleEvent;
  }
}

/** One request/response round trip; resolves null on timeout or no bridge. */
function request(
  action: string,
  extra: Record<string, unknown> = {},
): Promise<Record<string, unknown> | null> {
  if (!cloudBridgeAvailable()) return Promise.resolve(null);
  installHandler();
  return new Promise((resolve) => {
    const requestId = nextRequestId++;
    const timer = window.setTimeout(() => {
      waiters.delete(requestId);
      resolve(null);
    }, REQUEST_TIMEOUT_MS);
    waiters.set(requestId, (event) => {
      window.clearTimeout(timer);
      resolve(event);
    });
    post({ action, requestId, ...extra });
  });
}

/** Ask the native side whether a cloud is reachable, and who is signed in. */
export async function fetchCloudStatus(): Promise<CloudStatus> {
  const event = await request("status");
  if (!event || event.ok !== true) return { available: false };
  const player = event.player as CloudPlayer | undefined;
  return {
    available: event.available === true,
    ...(typeof event.provider === "string"
      ? { provider: event.provider as CloudProviderId }
      : {}),
    ...(player && typeof player.id === "string"
      ? { player: { id: player.id, name: String(player.name ?? "") } }
      : {}),
  };
}

/**
 * Read the stored blob. `null` data means "no save in the cloud yet" — a
 * first launch on a fresh account, which is NOT an error. A failed read
 * (offline, cloud down) resolves `{ ok: false }` so the caller can leave the
 * local save untouched instead of treating it as an empty cloud.
 */
export async function loadFromCloud(): Promise<
  { ok: true; data: string | null } | { ok: false }
> {
  const event = await request("load");
  if (!event || event.ok !== true) return { ok: false };
  return { ok: true, data: typeof event.data === "string" ? event.data : null };
}

/** Write the blob. Resolves ok only once the provider accepted it. */
export async function saveToCloud(
  data: string,
): Promise<{ ok: true } | { ok: false; reason: CloudFailure }> {
  const event = await request("save", { data });
  if (!event) return { ok: false, reason: "unavailable" };
  if (event.ok === true) return { ok: true };
  const reason = event.reason;
  return {
    ok: false,
    reason:
      reason === "too-large" || reason === "unavailable"
        ? reason
        : ("error" as CloudFailure),
  };
}

function handleEvent(raw: unknown): void {
  if (!raw || typeof raw !== "object") return;
  const event = raw as Record<string, unknown>;
  if (event.event === "changed") {
    changeHandler?.();
    return;
  }
  const requestId = event.requestId;
  if (typeof requestId !== "number") return;
  const waiter = waiters.get(requestId);
  waiters.delete(requestId);
  waiter?.(event);
}
