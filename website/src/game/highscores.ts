// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The on-device high-score book (same storage policy as settings.ts /
// progress.ts). Each finished run banks its survival time, kill count, player
// level reached, and a full end-of-run session snapshot per difficulty; the
// menu's HIGH SCORES board ranks them four ways — longest survived, highest
// kills-per-minute, most mobs killed, and highest level reached — lets a row be
// opened to reveal that whole session, and the end-of-run splash still reads the
// single best survival time for the difficulty just played.

import { type Difficulty, type GameStats } from "@game/core";

import { storageKey } from "../identity.ts";

const STORAGE_KEY = storageKey("highscores");

/** How many runs to keep per difficulty, per ranking — enough to fill the
 * board without letting the store grow without bound. */
const KEEP_PER_METRIC = 10;

/**
 * The full end-of-run session banked alongside a ranked run, so a board entry
 * can be opened to reveal the whole story — a big kill count is far less
 * impressive next to a huge shots-fired or damage-taken tally. Optional: the
 * bare-time legacy format and pre-feature entries predate it, so any consumer
 * must treat it as possibly absent.
 */
export type ScoreDetail = {
  /** The complete session stats snapshot at the moment the run ended. */
  stats: GameStats;
  /** Player level reached when the run ended. */
  level: number;
  /** Which level was played (id — resolve to a name via `levelDef`). */
  levelId: string;
  /** How the run ended. */
  outcome: "victory" | "defeat";
  /** Epoch ms when the run was banked (for the detail view's date line). */
  at: number;
};

/** One banked run: how long it lasted, how many foes it felled, the player
 * level it reached, and — for runs banked since the detail feature — the full
 * session behind those headline numbers. `level` is optional: runs banked
 * before it was ranked carry it only inside `detail` (or not at all). */
export type ScoreEntry = {
  timeMs: number;
  kills: number;
  level?: number;
  detail?: ScoreDetail;
};

/** A board row: an entry with its kills-per-minute and resolved player level
 * precomputed (level falls back to the detail snapshot, then 0). */
export type ScoreRow = ScoreEntry & { kpm: number; level: number };

/** The four ways the board ranks runs. */
export type ScoreMetric = "time" | "kpm" | "kills" | "level";

/** Banked runs keyed by difficulty id; a missing key = no run yet. */
type HighScores = Record<string, ScoreEntry[]>;

/** Kills per minute for a run — 0 for a zero-length run (avoids /0). */
function killsPerMinute(entry: ScoreEntry): number {
  if (entry.timeMs <= 0) return 0;
  return entry.kills / (entry.timeMs / 60_000);
}

/** The player level a run reached: the top-level field when present, else the
 * detail snapshot's, else 0 (legacy/detail-less runs rank last on level). */
function entryLevel(entry: ScoreEntry): number {
  return entry.level ?? entry.detail?.level ?? 0;
}

/** Keep only the runs worth ranking: the top KEEP_PER_METRIC by each metric,
 * unioned — so a great sprint (high KPM) survives next to a long grind (high
 * time), a slaughter (most kills), or a deep dive (highest level) even though
 * none tops another's list. */
function trim(list: ScoreEntry[]): ScoreEntry[] {
  const byTime = [...list].sort((a, b) => b.timeMs - a.timeMs);
  const byKpm = [...list].sort((a, b) => killsPerMinute(b) - killsPerMinute(a));
  const byKills = [...list].sort((a, b) => b.kills - a.kills);
  const byLevel = [...list].sort((a, b) => entryLevel(b) - entryLevel(a));
  const kept = new Set<ScoreEntry>([
    ...byTime.slice(0, KEEP_PER_METRIC),
    ...byKpm.slice(0, KEEP_PER_METRIC),
    ...byKills.slice(0, KEEP_PER_METRIC),
    ...byLevel.slice(0, KEEP_PER_METRIC),
  ]);
  return [...kept];
}

/** The numeric fields every `GameStats` snapshot must carry — a stored detail
 * that is missing or malforms any of them is dropped rather than trusted. */
const STAT_KEYS: (keyof GameStats)[] = [
  "kills",
  "totalEnemies",
  "shotsFired",
  "damageDealt",
  "damageTaken",
  "itemsCollected",
  "xpGained",
  "timeMs",
];

function isStats(value: unknown): value is GameStats {
  if (!value || typeof value !== "object") return false;
  const stats = value as Record<string, unknown>;
  return STAT_KEYS.every(
    (key) => typeof stats[key] === "number" && Number.isFinite(stats[key]),
  );
}

function isDetail(value: unknown): value is ScoreDetail {
  if (!value || typeof value !== "object") return false;
  const { stats, level, levelId, outcome, at } = value as Record<
    string,
    unknown
  >;
  return (
    isStats(stats) &&
    typeof level === "number" &&
    Number.isFinite(level) &&
    typeof levelId === "string" &&
    (outcome === "victory" || outcome === "defeat") &&
    typeof at === "number" &&
    Number.isFinite(at)
  );
}

/** A trusted, finite, non-negative player level, or undefined if absent/bad. */
function cleanLevel(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : undefined;
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

/** Reduce an entry to just its trusted fields: the ranking numbers, the level
 * when it validates, plus the detail blob only when it fully validates (a
 * partial/corrupt detail is discarded, leaving the run itself intact). */
function sanitize(entry: ScoreEntry): ScoreEntry {
  const clean: ScoreEntry = { timeMs: entry.timeMs, kills: entry.kills };
  const level = cleanLevel(entry.level);
  if (level !== undefined) clean.level = level;
  if (isDetail(entry.detail)) clean.detail = entry.detail;
  return clean;
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
        const entries = value.filter(isEntry).map(sanitize);
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
  const entry: ScoreEntry = { timeMs: run.timeMs, kills };
  const level = cleanLevel(run.level);
  if (level !== undefined) entry.level = level;
  if (isDetail(run.detail)) entry.detail = run.detail;
  const list = scores[difficulty] ?? [];
  scores[difficulty] = trim([...list, entry]);
  persist();
  return record;
}

/** Order two rows for a ranking metric, best first. */
function compareRows(metric: ScoreMetric, a: ScoreRow, b: ScoreRow): number {
  switch (metric) {
    case "time":
      return b.timeMs - a.timeMs;
    case "kpm":
      return b.kpm - a.kpm;
    case "kills":
      return b.kills - a.kills;
    case "level":
      return b.level - a.level;
  }
}

/**
 * The board for a difficulty, ranked by `metric` (longest survival, highest
 * kills-per-minute, most mobs killed, or highest level reached), best first and
 * capped at `limit` rows.
 */
export function topScores(
  difficulty: Difficulty,
  metric: ScoreMetric,
  limit = 5,
): ScoreRow[] {
  const rows: ScoreRow[] = (scores[difficulty] ?? []).map((entry) => ({
    ...entry,
    kpm: killsPerMinute(entry),
    level: entryLevel(entry),
  }));
  rows.sort((a, b) => compareRows(metric, a, b));
  return rows.slice(0, limit);
}
