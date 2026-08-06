// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// SCREENSHOTS' transport — the WEB half of the store-shell screenshot seam,
// and the sixth protocol over the one shell channel (./shell-bridge.ts):
//
//   web → shell   `postToShell(JSON { __gisShots })`
//   shell → web   `window.__gisShotsEvent(...)` (injected from outside)
//
// The protocol (mirrored by electron/src/screenshots.ts and
// native/src/screenshots.ts — keep the three in step):
//   → { action: "init" }                                announce the web handler
//   → { action: "status", requestId }                   what can this shell do?
//   → { action: "file", requestId, name, png }          keep this picture
//   → { action: "share", requestId, name, png }         send it somewhere
//   ← { event: "status", requestId, ok, available, provider?, folder?,
//        canShare, steamOverlay? }
//   ← { event: "file",  requestId, ok, path? }
//   ← { event: "share", requestId, ok }
//
// WHY A SHELL PROTOCOL AT ALL, when the browser already has `navigator.share`
// and a download: because neither answer is right inside a store shell. A
// desktop app that "downloads" a screenshot puts it in a folder the player
// never opens, when what a desktop player wants is the file in their pictures
// and a window opened on it. And a WebView on Android has no Web Share API at
// all — the sheet is the shell's to raise, not the page's — so the SHARE button
// a phone player presses would simply not be offered.
//
// The picture crosses as BASE64 rather than as a blob, because the pipe carries
// text and nothing else (see shell-bridge.ts; the one exception is
// multiplayer's MessagePort, and it is an exception for throughput, which a
// once-per-keypress screenshot is not).
//
// Transport ONLY: what a picture is, when one is taken and what the gallery
// does with it is game/screenshots.ts's business, so a third shell is a new
// provider behind the same four messages.

import { postToShell, shellAvailable, shellPlatform } from "./shell-bridge.ts";

declare global {
  interface Window {
    /** The shell's callback into this page (installed by `initShotsBridge`). */
    __gisShotsEvent?: (event: unknown) => void;
  }
}

/** Which shell answered — what the gallery's status line names. */
export type ShotsProviderId = "steam" | "ios" | "android";

/** What the shell will do with a picture. */
export type ShotsStatus = {
  /** The shell files pictures at all. False in a browser, and in any shell
   * that could not reach a writable folder. */
  available: boolean;
  provider?: ShotsProviderId;
  /** Where filed pictures land, in a form fit to print (a desktop path, or a
   * platform's name for its own place). */
  folder?: string;
  /** The shell can raise the platform's share sheet itself. */
  canShare: boolean;
  /**
   * STEAM ONLY, and the one field that is about a system this game does not
   * drive: true when this launch has the Steam overlay injected, which means
   * Steam's OWN screenshot key files its own copy into the player's Steam
   * screenshot library. The gallery says so; see
   * electron/src/screenshots-provider.ts for why that is the whole of the
   * Steam integration and what the alternative would cost.
   */
  steamOverlay?: boolean;
};

/** Nothing here (a browser, a PWA, a shell that said no). */
const NO_SHELL: ShotsStatus = { available: false, canShare: false };

/** Generous rather than tight: a share sheet stays up for as long as the player
 * leaves it up, and the answer only arrives when they are done with it. */
const REQUEST_TIMEOUT_MS = 120_000;

let nextRequestId = 1;
type Waiter = (event: Record<string, unknown> | null) => void;
const waiters = new Map<number, Waiter>();

/** True where a screenshot request could actually be answered. */
export function shotsBridgeAvailable(): boolean {
  return shellAvailable() && shellPlatform() !== null;
}

function post(message: Record<string, unknown>): void {
  postToShell({ __gisShots: true, ...message });
}

/** Announce the page to the shell. Call once at boot; a no-op in a browser. */
export function initShotsBridge(): void {
  if (!shotsBridgeAvailable()) return;
  installHandler();
  post({ action: "init" });
}

function installHandler(): void {
  if (window.__gisShotsEvent !== handleEvent) {
    window.__gisShotsEvent = handleEvent;
  }
}

function request(
  action: string,
  extra: Record<string, unknown> = {},
): Promise<Record<string, unknown> | null> {
  if (!shotsBridgeAvailable()) return Promise.resolve(null);
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

/** What this shell will do with a picture. */
export async function fetchShotsStatus(): Promise<ShotsStatus> {
  const event = await request("status");
  if (!event || event.ok !== true) return NO_SHELL;
  return {
    available: event.available === true,
    canShare: event.canShare === true,
    ...(typeof event.provider === "string"
      ? { provider: event.provider as ShotsProviderId }
      : {}),
    ...(typeof event.folder === "string" ? { folder: event.folder } : {}),
    ...(typeof event.steamOverlay === "boolean"
      ? { steamOverlay: event.steamOverlay }
      : {}),
  };
}

/** Hand the shell a picture to keep. Resolves the path it landed on, or null
 * when the shell could not (or would not) file it. */
export async function fileShot(
  name: string,
  png: Blob,
): Promise<string | null> {
  const base64 = await toBase64(png);
  if (base64 === null) return null;
  const event = await request("file", { name, png: base64 });
  if (event?.ok !== true) return null;
  return typeof event.path === "string" ? event.path : "";
}

/** Ask the shell to send a picture somewhere — its own share sheet on a phone,
 * a reveal-in-folder plus a clipboard copy on the desktop. */
export async function shareShotViaShell(
  name: string,
  png: Blob,
): Promise<boolean> {
  const base64 = await toBase64(png);
  if (base64 === null) return false;
  const event = await request("share", { name, png: base64 });
  return event?.ok === true;
}

/** A blob as bare base64 (no data-URL prefix), or null if it cannot be read. */
async function toBase64(blob: Blob): Promise<string | null> {
  try {
    const buffer = new Uint8Array(await blob.arrayBuffer());
    // Chunked so a megabyte-sized picture cannot blow the argument limit that
    // `String.fromCharCode(...bytes)` would hit on a single spread.
    let binary = "";
    const CHUNK = 0x8000;
    for (let i = 0; i < buffer.length; i += CHUNK) {
      binary += String.fromCharCode(...buffer.subarray(i, i + CHUNK));
    }
    return btoa(binary);
  } catch {
    return null;
  }
}

function handleEvent(raw: unknown): void {
  if (!raw || typeof raw !== "object") return;
  const event = raw as Record<string, unknown>;
  const requestId = event.requestId;
  if (typeof requestId !== "number") return;
  const waiter = waiters.get(requestId);
  waiters.delete(requestId);
  waiter?.(event);
}
