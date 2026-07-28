// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// GAME CENTER — the game's badges mirrored onto the platform's achievement
// service (Game Center on iOS today; Google Play Games is the drop-in behind
// the very same bridge).
//
// NATIVE APP ONLY. A browser has no platform achievement service, so
// `achievementsBridgeAvailable()` reads false there and every entry point below
// is a no-op — the website keeps its badges in localStorage exactly as before.
//
// THE MIRROR ONLY EVER RUNS ONE WAY. The game's own ledger
// (achievements.ts, carried between the player's devices by cloud save) is the
// source of truth; the platform is a copy of it kept for the player's profile,
// their friends, and the trophy case outside the game. Nothing is ever read
// BACK — a platform that disagreed would otherwise be able to grant a badge the
// game never awarded, and the shelf, the toast, and the point total would all
// have to answer for it.
//
// That direction is what makes the sync trivial: reporting is idempotent and
// monotone (both platforms keep the highest percentage they have seen for an
// id), so a duplicate report costs nothing, a failed one is simply retried, and
// nothing can un-earn a badge. What this module adds on top is restraint:
//
//   * only the CURATED list travels (platform-achievements.ts — the platforms
//     cap how many entries a game may have),
//   * a percentage is reported when it crosses a 5-point step, so a ladder at
//     347/1000 kills doesn't put a network call behind every kill,
//   * what was delivered is remembered ACROSS LAUNCHES, so opening the app
//     doesn't replay the whole catalog, and
//   * a batch the platform refused leaves those marks untouched, so it goes
//     out again on the next sync instead of being silently dropped.

import {
  achievementsBridgeAvailable,
  fetchAchievementsStatus,
  initAchievementsBridge,
  reportAchievements,
  showPlatformAchievements,
  type AchievementsPlayer,
  type AchievementsProviderId,
  type AchievementReport,
} from "../app/achievements-bridge.ts";
import { storageKey } from "../identity.ts";

import {
  platformProgress,
  type PlatformProgressSource,
} from "./platform-achievements.ts";

/** Percentage points a ladder must climb before it is worth a report. 100 is
 * always reported the moment it is reached, whatever the step. */
const REPORT_STEP = 5;

/** How long to wait for the dust to settle before pushing after a local
 * change, so a burst of unlocks is one round trip. */
const PUSH_DEBOUNCE_MS = 5_000;

/** …but never wait longer than this: a long unbroken fight keeps nudging the
 * debounce, and the player who just earned something should see it on their
 * profile without having to stop playing first. */
const MAX_PUSH_WAIT_MS = 30_000;

/** What this device has already delivered: badge id → percentage last taken by
 * the platform. Persisted, so a relaunch replays nothing. */
const REPORTED_KEY = storageKey("achievements-platform");

export type PlatformAchievementsState = {
  /** A player is signed in, so what we report will stick. */
  available: boolean;
  provider?: AchievementsProviderId;
  player?: AchievementsPlayer;
};

let state: PlatformAchievementsState = { available: false };
const listeners = new Set<(state: PlatformAchievementsState) => void>();

/** The current mirror state (the ACHIEVEMENTS shelf's platform row reads it). */
export function platformAchievementsState(): PlatformAchievementsState {
  return state;
}

/** Watch the mirror state; returns an unsubscribe. */
export function subscribePlatformAchievements(
  listener: (state: PlatformAchievementsState) => void,
): () => void {
  listeners.add(listener);
  return () => void listeners.delete(listener);
}

function setState(patch: Partial<PlatformAchievementsState>): void {
  state = { ...state, ...patch };
  for (const listener of listeners) listener(state);
}

// ---- What has already been delivered -------------------------------------------

function loadReported(): Record<string, number> {
  try {
    const raw = window.localStorage.getItem(REPORTED_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const out: Record<string, number> = {};
    for (const [id, percent] of Object.entries(parsed)) {
      if (typeof percent === "number" && Number.isFinite(percent)) {
        out[id] = percent;
      }
    }
    return out;
  } catch {
    return {}; // private mode / corrupt JSON — this launch re-reports, harmlessly
  }
}

let reported: Record<string, number> | null = null;

function reportedMarks(): Record<string, number> {
  reported ??= loadReported();
  return reported;
}

function persistReported(): void {
  try {
    window.localStorage.setItem(REPORTED_KEY, JSON.stringify(reportedMarks()));
  } catch {
    // Storage unavailable — the marks live on in memory for this session.
  }
}

/**
 * The entries worth sending right now: a badge whose percentage has climbed a
 * whole step since it was last taken, or reached 100. Pure — the caller marks
 * them delivered only once the platform says it took them.
 */
export function pendingReports(
  save: PlatformProgressSource,
  marks: Record<string, number> = reportedMarks(),
): AchievementReport[] {
  const out: AchievementReport[] = [];
  for (const [id, percent] of Object.entries(platformProgress(save))) {
    const sent = marks[id] ?? 0;
    if (percent <= sent) continue; // never walk a percentage backwards
    if (percent < 100 && percent - sent < REPORT_STEP) continue;
    out.push({ id, percent });
  }
  return out;
}

// ---- The sync ------------------------------------------------------------------

/** Where the live ledger comes from, handed in at boot so this module never
 * imports the store that schedules it (and the two can't form a cycle). */
let source: (() => PlatformProgressSource) | null = null;

let pushTimer: number | null = null;
let pendingSince = 0;
let inFlight: Promise<boolean> | null = null;

/** Push whatever is pending, now. Resolves true when the platform took a batch
 * (or there was nothing to send). Single-flight: a second caller joins the run
 * already going rather than racing it. */
export function syncPlatformAchievements(): Promise<boolean> {
  inFlight ??= runSync().finally(() => {
    inFlight = null;
  });
  return inFlight;
}

async function runSync(): Promise<boolean> {
  if (!achievementsBridgeAvailable() || !source) return false;

  const status = await fetchAchievementsStatus();
  setState({
    available: status.available,
    ...(status.provider ? { provider: status.provider } : {}),
    ...(status.player ? { player: status.player } : {}),
  });
  if (!status.available) return false;

  // Snapshot AFTER the status round trip: it can raise a sign-in sheet and sit
  // there for as long as the player leaves it, and anything earned meanwhile
  // belongs in this batch rather than waiting for the next one.
  const entries = pendingReports(source());
  if (entries.length === 0) return true;

  const ok = await reportAchievements(entries);
  if (!ok) return false; // marks untouched — the same batch goes out next time
  const marks = reportedMarks();
  for (const entry of entries) marks[entry.id] = entry.percent;
  persistReported();
  return true;
}

/**
 * Mirror soon — the trigger for a local change (an unlock, a counter that
 * moved). Debounced so a burst is one round trip, with a hard ceiling on the
 * wait so an unbroken fight can't defer it forever.
 */
export function scheduleAchievementSync(): void {
  if (!achievementsBridgeAvailable()) return;
  const now = Date.now();
  if (pendingSince === 0) pendingSince = now;
  if (pushTimer !== null) {
    // Already waited as long as we're willing to — let the armed timer fire
    // rather than pushing the deadline out again.
    if (now - pendingSince >= MAX_PUSH_WAIT_MS) return;
    window.clearTimeout(pushTimer);
  }
  pushTimer = window.setTimeout(() => {
    pushTimer = null;
    pendingSince = 0;
    void syncPlatformAchievements();
  }, PUSH_DEBOUNCE_MS);
}

/** Open the platform's own achievements board (the shelf's GAME CENTER row). */
export function openPlatformAchievements(): Promise<boolean> {
  return showPlatformAchievements();
}

/**
 * Boot the mirror: install the bridge, sign in, and push whatever this device
 * has earned but never delivered. Call once at app start (App.tsx) when running
 * natively; a no-op elsewhere, where there is no platform service.
 *
 * `ledger` reads the live achievements save — passed in rather than imported so
 * the store can schedule a sync without importing this module's importer.
 *
 * Beyond the boot push, one more trigger: coming back to the foreground, which
 * is when a player who signed into Game Center from Settings finally becomes
 * reportable.
 */
export function initAchievementSync(
  ledger: () => PlatformProgressSource,
): () => void {
  source = ledger;
  initAchievementsBridge();
  if (!achievementsBridgeAvailable()) return () => {};
  void syncPlatformAchievements();
  const onVisible = () => {
    if (document.visibilityState === "visible") {
      void syncPlatformAchievements();
    }
  };
  document.addEventListener("visibilitychange", onVisible);
  return () => document.removeEventListener("visibilitychange", onVisible);
}

/** Test hook: forget this device's delivery marks and the live state. */
export function resetAchievementSyncForTest(): void {
  reported = {};
  source = null;
  state = { available: false };
  if (pushTimer !== null) window.clearTimeout(pushTimer);
  pushTimer = null;
  pendingSince = 0;
  try {
    window.localStorage.removeItem(REPORTED_KEY);
  } catch {
    // No storage — the in-memory reset is the whole job.
  }
}
