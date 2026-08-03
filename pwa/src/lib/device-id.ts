// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// A stable per-INSTALL identifier, persisted in localStorage. Generic: the
// caller supplies the storage key, so nothing game-specific leaks in (see
// pwa/src/lib/README.md — this pool is what a later game reuses).
//
// It identifies the device to a merge, never a person: cloud sync uses it to
// tell "my row" apart from "the other device's row" in a mergeable counter set
// (game/cloud-save.ts). It is random, carries no personal data, and is reset by
// clearing site data — a reset device simply starts a new row.

/** A random id — `crypto.randomUUID` where present, else a timestamped
 * random fallback (older webviews). */
function randomId(): string {
  try {
    if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
      return crypto.randomUUID();
    }
  } catch {
    // fall through to the manual id
  }
  return `${Date.now().toString(36)}-${Math.floor(Math.random() * 1e9).toString(36)}`;
}

// Resolved once per session so every caller in a page sees one id even if
// storage is unavailable (private mode) and nothing can be persisted.
let cached: string | null = null;

/**
 * The device's stable id, minted on first use and stored under `key`. With
 * storage unavailable it stays session-scoped: sync still works, the device
 * just looks like a new one on the next launch (which costs nothing — its
 * counters merge as an additional row).
 */
export function getDeviceId(key: string): string {
  if (cached) return cached;
  try {
    const stored = window.localStorage.getItem(key);
    if (stored) {
      cached = stored;
      return stored;
    }
  } catch {
    // Storage unreadable — mint a session id below.
  }
  const minted = randomId();
  cached = minted;
  try {
    window.localStorage.setItem(key, minted);
  } catch {
    // Session-scoped only; see the doc comment.
  }
  return minted;
}

/** Drop the memoized id (tests). */
export function resetDeviceIdCache(): void {
  cached = null;
}
