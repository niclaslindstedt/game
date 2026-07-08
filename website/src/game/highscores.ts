// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Best survival time per difficulty, persisted on-device (same policy as
// settings.ts / progress.ts). A run's score is how long the player lasted
// (GameStats.timeMs); the longest run on each difficulty is kept and shown on
// the end-of-run splash for that difficulty only.

import { type Difficulty } from "@game/core";

import { storageKey } from "../identity.ts";

const STORAGE_KEY = storageKey("highscores");

/** Best survival time (ms) keyed by difficulty id; a missing key = no run yet. */
type HighScores = Record<string, number>;

function load(): HighScores {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return {};
    const out: HighScores = {};
    for (const [id, value] of Object.entries(
      parsed as Record<string, unknown>,
    )) {
      if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
        out[id] = value;
      }
    }
    return out;
  } catch {
    return {}; // private mode / corrupt JSON — start fresh
  }
}

const scores: HighScores = load();

function persist(): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(scores));
  } catch {
    // Storage unavailable (private mode) — scores stay in-memory this session.
  }
}

/** The best survival time (ms) recorded on this difficulty, or 0 if none. */
export function bestTime(difficulty: Difficulty): number {
  return scores[difficulty] ?? 0;
}

/**
 * Record a finished run's survival time. Returns true when it beats the
 * previous best for that difficulty (a new record) — the splash flags it.
 */
export function recordTime(difficulty: Difficulty, timeMs: number): boolean {
  if (!Number.isFinite(timeMs) || timeMs <= 0) return false;
  if (timeMs <= (scores[difficulty] ?? 0)) return false;
  scores[difficulty] = timeMs;
  persist();
  return true;
}
