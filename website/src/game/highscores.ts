// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The on-device high-score book (same storage policy as settings.ts /
// progress.ts). Each finished run banks its survival time and kill count per
// difficulty; the menu's HIGH SCORES board ranks them two ways — longest
// survived and highest kills-per-minute — and the end-of-run splash still
// reads the single best survival time for the difficulty just played.

import { type Difficulty } from "@game/core";

import { storageKey } from "../identity.ts";

const STORAGE_KEY = storageKey("highscores");

/** How many runs to keep per difficulty, per ranking — enough to fill the
 * board without letting the store grow without bound. */
const KEEP_PER_METRIC = 10;

/** One banked run: how long it lasted and how many foes it felled. */
export type ScoreEntry = { timeMs: number; kills: number };

/** A board row: an entry with its derived kills-per-minute precomputed. */
export type ScoreRow = ScoreEntry & { kpm: number };

/** The two ways the board ranks runs. */
export type ScoreMetric = "time" | "kpm";

/** Banked runs keyed by difficulty id; a missing key = no run yet. */
type HighScores = Record<string, ScoreEntry[]>;

/** Kills per minute for a run — 0 for a zero-length run (avoids /0). */
function killsPerMinute(entry: ScoreEntry): number {
  if (entry.timeMs <= 0) return 0;
  return entry.kills / (entry.timeMs / 60_000);
}

/** Keep only the runs worth ranking: the top KEEP_PER_METRIC by each metric,
 * unioned — so a great sprint (high KPM) survives next to a long grind (high
 * time) even though neither tops the other's list. */
function trim(list: ScoreEntry[]): ScoreEntry[] {
  const byTime = [...list].sort((a, b) => b.timeMs - a.timeMs);
  const byKpm = [...list].sort((a, b) => killsPerMinute(b) - killsPerMinute(a));
  const kept = new Set<ScoreEntry>([
    ...byTime.slice(0, KEEP_PER_METRIC),
    ...byKpm.slice(0, KEEP_PER_METRIC),
  ]);
  return [...kept];
}

function isEntry(value: unknown): value is ScoreEntry {
  if (!value || typeof value !== "object") return false;
  const { timeMs, kills } = value as Record<string, unknown>;
  return (
    typeof timeMs === "number" &&
    Number.isFinite(timeMs) &&
    timeMs >= 0 &&
    typeof kills === "number" &&
    Number.isFinite(kills) &&
    kills >= 0
  );
}

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
      // Legacy format: a bare best-time number per difficulty. Preserve it as
      // a single kill-less run so old records still show on the board.
      if (typeof value === "number" && Number.isFinite(value) && value > 0) {
        out[id] = [{ timeMs: value, kills: 0 }];
      } else if (Array.isArray(value)) {
        const entries = value.filter(isEntry);
        if (entries.length) out[id] = trim(entries);
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
  return (scores[difficulty] ?? []).reduce(
    (best, entry) => Math.max(best, entry.timeMs),
    0,
  );
}

/**
 * Bank a finished run. Returns true when it beats the previous best survival
 * time for that difficulty (a new record) — the end-of-run splash flags it.
 */
export function recordRun(difficulty: Difficulty, run: ScoreEntry): boolean {
  if (!Number.isFinite(run.timeMs) || run.timeMs <= 0) return false;
  const kills = Number.isFinite(run.kills) ? Math.max(0, run.kills) : 0;
  const record = run.timeMs > bestTime(difficulty);
  const list = scores[difficulty] ?? [];
  scores[difficulty] = trim([...list, { timeMs: run.timeMs, kills }]);
  persist();
  return record;
}

/**
 * The board for a difficulty, ranked by `metric` (longest survival, or highest
 * kills-per-minute), best first and capped at `limit` rows.
 */
export function topScores(
  difficulty: Difficulty,
  metric: ScoreMetric,
  limit = 5,
): ScoreRow[] {
  const rows: ScoreRow[] = (scores[difficulty] ?? []).map((entry) => ({
    ...entry,
    kpm: killsPerMinute(entry),
  }));
  rows.sort((a, b) =>
    metric === "time" ? b.timeMs - a.timeMs : b.kpm - a.kpm,
  );
  return rows.slice(0, limit);
}
