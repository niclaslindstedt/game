// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// LEADERBOARDS' transport — the WEB half of the native platform-scores seam.
// Public rankings can only run inside the native shell (native/), where the
// platform's game service lives (Game Center on iOS today; Play Games Services
// is the planned Android drop-in), so this module speaks to it over the
// WebView's message channel exactly like CLOUD SAVE and the coin store do:
//
//   web → native  `window.ReactNativeWebView.postMessage(JSON { __gisScores })`
//   native → web  `webview.injectJavaScript("window.__gisScoresEvent(...)")`
//
// The protocol (mirrored by native/src/leaderboards.ts — keep the two in step):
//   → { action: "status", requestId }             is a board service up?
//   → { action: "submit", requestId, entries }    entries: { key, value }[]
//   → { action: "show", requestId, key? }         open the platform's own board
//   ← { event: "status", requestId, ok, available, provider? }
//   ← { event: "submit", requestId, ok }
//   ← { event: "show",   requestId, ok }
//
// TRANSPORT ONLY, and deliberately DEPENDENCY-FREE. The board KEYS live here
// (a plain string union) while the values behind them are computed engine-side
// (game/leaderboards.ts), because the HIGH SCORES screen is on the app's
// STARTUP path: a `show` button that reached the catalog would pull the whole
// achievement ledger — and `@game/core` behind it — into the critical-path
// budget for every player who never opens a board. Opening a board needs a key
// and a channel; it does not need to know what the number means.

import { isNativeApp } from "./native.ts";

declare global {
  interface Window {
    /** The native shell's callback into this page (installed by `request`;
     * called via `injectJavaScript`). */
    __gisScoresEvent?: (event: unknown) => void;
  }
}

/**
 * The game's own board keys — STABLE STRINGS, never renamed once shipped: each
 * platform maps these to its own board id (Apple's are chosen by us, Play
 * Games' are opaque `CgkI…` strings minted by the console), and that mapping
 * lives in the native provider. A key here is the game's name for a ranking;
 * the platform id is the platform's.
 *
 * Every board ranks something UNCAPPED — a number no amount of play converges
 * on. A board whose top is reachable (highest hero level, relics recovered,
 * trophy points) fills with a hundred players tied at the ceiling and stops
 * being a ranking, so the catalog deliberately holds none.
 */
export const LEADERBOARD_KEYS = [
  "hardest_blow",
  "foes_felled",
  "kill_rate",
  "jesus_survival",
  "jesus_kills",
] as const;

export type LeaderboardKey = (typeof LEADERBOARD_KEYS)[number];

/** One score to publish: a board key and its already-scaled INTEGER value
 * (platform boards carry whole numbers — the fractional metrics are scaled by
 * their def, see game/leaderboards.ts). */
export type LeaderboardEntry = { key: LeaderboardKey; value: number };

/** Which platform service answered — labels the status line. */
export type ScoreProviderId = "game-center" | "play-games";

/** What the native side reports about the board service right now. */
export type ScoresStatus = {
  /** A board service is reachable and the player is signed in. */
  available: boolean;
  provider?: ScoreProviderId;
};

/** How long a scores request may take before it reports a failure. Generous:
 * the first call of a launch can be waiting on the platform's sign-in sheet. */
const REQUEST_TIMEOUT_MS = 30_000;

let nextRequestId = 1;
type Waiter = (event: Record<string, unknown> | null) => void;
const waiters = new Map<number, Waiter>();

/** True where a scores request could actually run: the native shell with its
 * message channel up. Gates every leaderboard row. */
export function scoresBridgeAvailable(): boolean {
  return (
    isNativeApp() &&
    typeof window !== "undefined" &&
    !!window.ReactNativeWebView
  );
}

function post(message: Record<string, unknown>): void {
  try {
    window.ReactNativeWebView?.postMessage(
      JSON.stringify({ __gisScores: true, ...message }),
    );
  } catch {
    // Channel gone (page tearing down) — waiters resolve via their timeouts.
  }
}

/** Make sure the native side has somewhere to answer. Idempotent, and called
 * before every request: a request sent with no handler installed would never
 * be answered, which is a silent stall rather than a visible failure. */
function installHandler(): void {
  if (window.__gisScoresEvent !== handleEvent) {
    window.__gisScoresEvent = handleEvent;
  }
}

/** One request/response round trip; resolves null on timeout or no bridge. */
function request(
  action: string,
  extra: Record<string, unknown> = {},
): Promise<Record<string, unknown> | null> {
  if (!scoresBridgeAvailable()) return Promise.resolve(null);
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

/** Ask the native side whether a board service is reachable and signed in. */
export async function fetchScoresStatus(): Promise<ScoresStatus> {
  const event = await request("status");
  if (!event || event.ok !== true) return { available: false };
  return {
    available: event.available === true,
    ...(typeof event.provider === "string"
      ? { provider: event.provider as ScoreProviderId }
      : {}),
  };
}

/**
 * Publish scores. The platform keeps the BEST value a player ever submitted
 * for a board, so this is idempotent by construction — re-sending a number the
 * service already holds changes nothing, which is what lets the game submit
 * its whole slate at natural moments (a run's end, a launch) without tracking
 * what it has already sent. Resolves false when nothing landed.
 */
export async function submitScores(
  entries: readonly LeaderboardEntry[],
): Promise<boolean> {
  if (entries.length === 0) return false;
  const event = await request("submit", { entries });
  return !!event && event.ok === true;
}

/**
 * Open the platform's OWN leaderboard UI (Game Center's overlay, Play Games'
 * activity) — on `key` when given, otherwise the whole board list. This is why
 * the feature needs no board UI of its own: the ranking, the player's rank,
 * their friends, and the time scopes are the platform's to draw.
 */
export async function showLeaderboards(key?: LeaderboardKey): Promise<boolean> {
  const event = await request("show", key ? { key } : {});
  return !!event && event.ok === true;
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
