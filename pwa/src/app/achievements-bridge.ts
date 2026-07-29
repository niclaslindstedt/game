// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// GAME CENTER's transport — the WEB half of the native achievements seam. The
// platform's achievement service only exists inside the native shell (native/),
// so this module speaks to it over the WebView's message channel exactly like
// cloud save and the coin store do:
//
//   web → shell   `postToShell(JSON { __gisAchievements })`  (./shell-bridge.ts)
//   native → web  `webview.injectJavaScript("window.__gisAchievementsEvent(...)")`
//
// The protocol (mirrored by native/src/achievements.ts — keep the two in step):
//   → { action: "init" }                          announce the web handler is up
//   → { action: "status", requestId }             is a player signed in, and who?
//   → { action: "report", requestId, entries }    mirror a batch of badges
//   → { action: "show", requestId }               open the platform's own board
//   ← { event: "status", requestId, ok, available, provider?, player? }
//   ← { event: "report", requestId, ok }          ok: the platform took the batch
//   ← { event: "show", requestId, ok }
//
// There is no `changed` event, and deliberately so: the game's own ledger is
// the source of truth and the platform is a MIRROR of it, so nothing ever
// travels back. That is also why this bridge, unlike cloud save's, needs no
// subscription to tear down.
//
// Transport ONLY: it knows nothing about which badges exist or when one is
// earned. game/achievement-sync.ts owns that, so a second platform is a new
// native provider behind the same four messages.

import { postToShell, shellAvailable } from "./shell-bridge.ts";

declare global {
  interface Window {
    /** The native shell's callback into this page (installed by
     * `initAchievementsBridge`; called via `injectJavaScript`). */
    __gisAchievementsEvent?: (event: unknown) => void;
  }
}

/** Which platform service answered — labels the ACHIEVEMENTS shelf's row. */
export type AchievementsProviderId = "game-center" | "play-games";

/** The signed-in platform player. Purely informational: progress is keyed by
 * the platform account, not by this id. */
export type AchievementsPlayer = { id: string; name: string };

/** What the native side reports about the service right now. */
export type AchievementsStatus = {
  /** A player is signed in, so reports will stick. */
  available: boolean;
  provider?: AchievementsProviderId;
  player?: AchievementsPlayer;
};

/** One badge's progress as it goes over the wire: OUR badge id, and 0…100
 * (100 = earned). The native provider maps the id to the platform's own. */
export type AchievementReport = { id: string; percent: number };

/** How long a request may take before it reports a failure. A sign-in sheet can
 * sit on screen for as long as the player leaves it there, and the first status
 * call is what raises it — so this is generous rather than tight. */
const REQUEST_TIMEOUT_MS = 30_000;

let nextRequestId = 1;
type Waiter = (event: Record<string, unknown> | null) => void;
const waiters = new Map<number, Waiter>();

/** True where an achievements request could actually run: the native shell with
 * its message channel up. Gates the GAME CENTER row and the whole sync. */
export function achievementsBridgeAvailable(): boolean {
  return shellAvailable();
}

function post(message: Record<string, unknown>): void {
  postToShell({ __gisAchievements: true, ...message });
}

/** Announce the page to the native side. Call once at boot; a no-op in the
 * browser/PWA, where there is no platform service to talk to. */
export function initAchievementsBridge(): void {
  if (!achievementsBridgeAvailable()) return;
  installHandler();
  post({ action: "init" });
}

/** Make sure the native side has somewhere to answer. Idempotent, and called
 * before every request as well as at boot: a request sent with no handler
 * installed would simply never be answered. */
function installHandler(): void {
  if (window.__gisAchievementsEvent !== handleEvent) {
    window.__gisAchievementsEvent = handleEvent;
  }
}

/** One request/response round trip; resolves null on timeout or no bridge. */
function request(
  action: string,
  extra: Record<string, unknown> = {},
): Promise<Record<string, unknown> | null> {
  if (!achievementsBridgeAvailable()) return Promise.resolve(null);
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

/** Ask the native side whether a player is signed in, and who. */
export async function fetchAchievementsStatus(): Promise<AchievementsStatus> {
  const event = await request("status");
  if (!event || event.ok !== true) return { available: false };
  const player = event.player as AchievementsPlayer | undefined;
  return {
    available: event.available === true,
    ...(typeof event.provider === "string"
      ? { provider: event.provider as AchievementsProviderId }
      : {}),
    ...(player && typeof player.id === "string"
      ? { player: { id: player.id, name: String(player.name ?? "") } }
      : {}),
  };
}

/** Mirror a batch of badges. False means the platform did NOT take it — the
 * caller keeps the batch pending rather than marking it delivered. */
export async function reportAchievements(
  entries: readonly AchievementReport[],
): Promise<boolean> {
  if (entries.length === 0) return true;
  const event = await request("report", { entries });
  return event?.ok === true;
}

/** Open the platform's own achievements board. */
export async function showPlatformAchievements(): Promise<boolean> {
  const event = await request("show");
  return event?.ok === true;
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
