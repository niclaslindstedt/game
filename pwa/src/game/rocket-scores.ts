// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE ROCKET CABINET'S BOARD — the flight minigame's on-device ranking table,
// beside the road's (`drive-scores.ts`) and deliberately its own store.
//
// IT RANKS THE CLOCK, the drive board's rule for the drive board's reason: the
// fastest trip is the best trip, which needs no explaining next to a number
// nobody can place. The arcade SCORE is still computed and banked on the row
// (`flightScore`, engine/game/rocket/score.ts); it simply is not the sort key.
// Every flight is a record and only the first five are a table; one board for
// every rung, with the rung riding along on the entry.
//
// TWO CABINETS, TWO MODULES, ON PURPOSE. A shared "minigame scores" store
// would need a discriminator column, a merge that understands both shapes, and
// a migration the day either cabinet grows a field — and the cloud save's
// payload carries named fields, not a registry. The drive board is the worked
// example; this one follows it, and a third cabinet would follow both.
//
// SAME STORAGE POLICY AS ITS NEIGHBOURS: one namespaced localStorage key,
// structurally validated on load, private mode degrades to memory.

import type { FlightLeg } from "@game/core";

import { storageKey } from "../identity.ts";

const STORAGE_KEY = storageKey("rocket-scores");
/** The last name signed, shared question but its own key — a preference, not a
 * score. */
const INITIALS_KEY = storageKey("rocket-initials");

/** Rows the table shows / rows the machine keeps — the drive board's numbers,
 * for the drive board's reasons. */
export const ROCKET_BOARD_SIZE = 5;
export const ROCKET_HISTORY_SIZE = 1000;

/** One row of the board: a time, the trip behind it, and who signed it. */
export type FlightScoreEntry = {
  /** Which slice of the trip the clock timed (`FlightParams.leg`). Absent on
   * rows banked before the MOON LANDING cabinet existed — those are whole
   * trips. A drop's clock and a trip's clock are not comparable, so every
   * read of the ladder filters by leg (`boardLeg`). */
  leg?: FlightLeg;
  /** The three letters, already clamped (`clampInitials`, drive-scores.ts —
   * the entry rules are the arcade's, not one cabinet's). */
  name: string;
  /** The arcade score (`flightScore`). Banked, not ranked. */
  score: number;
  /** The trip time (ms) — the board's one printed column. */
  ms: number;
  /** The fastest the ship went (mph, pegged at the dial). */
  topSpeedMph: number;
  /** Bags of GOODCO's garbage hauled to the moon. Recorded because the card
   * shows it; worth no points at all (`FLIGHT.score`). */
  trash: number;
  /** Which rung the sky was flown on. */
  difficulty: string;
  /** Epoch ms the row was set — the tie-break of last resort. */
  at: number;
};

function cleanNum(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : fallback;
}

function isEntry(value: unknown): value is FlightScoreEntry {
  if (!value || typeof value !== "object") return false;
  const { name, score, ms, difficulty, at } = value as Record<string, unknown>;
  return (
    typeof name === "string" &&
    typeof score === "number" &&
    Number.isFinite(score) &&
    score >= 0 &&
    typeof ms === "number" &&
    Number.isFinite(ms) &&
    // Strictly positive, as the drive board's is: the clock is the sort key,
    // and a zero-clock row would head the ladder forever.
    ms > 0 &&
    typeof difficulty === "string" &&
    typeof at === "number" &&
    Number.isFinite(at)
  );
}

/** The leg a row belongs to — legacy rows (no field) are whole trips. */
export function boardLeg(entry: { leg?: FlightLeg }): FlightLeg {
  return entry.leg === "landing" ? "landing" : "trip";
}

function sanitize(entry: FlightScoreEntry): FlightScoreEntry {
  return {
    ...(entry.leg === "landing" ? { leg: "landing" as const } : {}),
    name: entry.name,
    score: cleanNum(entry.score),
    ms: cleanNum(entry.ms),
    topSpeedMph: cleanNum(entry.topSpeedMph),
    trash: cleanNum(entry.trash),
    difficulty: entry.difficulty,
    at: cleanNum(entry.at),
  };
}

/** One row's identity — a row is a VALUE, deduped on its whole content, which
 * is what lets two devices hold the same flight once. */
export function flightScoreKey(entry: FlightScoreEntry): string {
  return [
    entry.name,
    entry.score,
    entry.ms,
    entry.topSpeedMph,
    entry.trash,
    entry.difficulty,
    entry.at,
    boardLeg(entry),
  ].join("|");
}

/** Best first: the quicker trip, then the older row — the incumbent keeps a
 * tie, and the order is a function of the SET (cloud save compares as text). */
function compare(a: FlightScoreEntry, b: FlightScoreEntry): number {
  return (
    a.ms - b.ms ||
    a.at - b.at ||
    (flightScoreKey(a) < flightScoreKey(b) ? -1 : 1)
  );
}

function trim(list: FlightScoreEntry[]): FlightScoreEntry[] {
  return [...list].sort(compare).slice(0, ROCKET_HISTORY_SIZE);
}

function load(): FlightScoreEntry[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return trim(parsed.filter(isEntry).map(sanitize));
  } catch {
    return []; // private mode / corrupt JSON — start fresh
  }
}

let board: FlightScoreEntry[] = load();

function persist(): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(board));
  } catch {
    // Storage unavailable (private mode) — the board stands for this session.
  }
}

/** One leg's ladder, best first — the store holds both cabinets' rows and
 * every read slices its own. */
function ladder(leg: FlightLeg): FlightScoreEntry[] {
  return board.filter((entry) => boardLeg(entry) === leg);
}

/** The head of the ladder, best first. A copy: the array is the store's own. */
export function topFlightScores(
  limit = ROCKET_BOARD_SIZE,
  leg: FlightLeg = "trip",
): FlightScoreEntry[] {
  return ladder(leg)
    .slice(0, Math.max(0, limit))
    .map((entry) => ({ ...entry }));
}

/** How many flights the machine is holding — the denominator of a rank. */
export function flightScoreCount(leg: FlightLeg = "trip"): number {
  return ladder(leg).length;
}

/** The stand-in an unbanked time ranks as — newest on purpose, so an incumbent
 * holding the same clock keeps its seat. */
const CANDIDATE: FlightScoreEntry = {
  name: "AAA",
  score: 0,
  ms: 0,
  topSpeedMph: 0,
  trash: 0,
  difficulty: "",
  at: Number.MAX_SAFE_INTEGER,
};

/** Where this time lands without banking it — 0-based in its LEG's whole
 * ladder, or null when the flight has no clock to rank. */
export function flightTimeRank(
  ms: number,
  leg: FlightLeg = "trip",
): number | null {
  if (ms <= 0) return null;
  const rows = ladder(leg);
  const candidate = { ...CANDIDATE, ms };
  const index = rows.findIndex((row) => compare(row, candidate) > 0);
  return index === -1 ? rows.length : index;
}

/** Bank a signed row. Returns the place it took, or null if it was turned
 * away. */
export function recordFlightScore(entry: FlightScoreEntry): number | null {
  const row = sanitize(entry);
  if (row.ms <= 0) return null;
  board = trim([...board, row]);
  persist();
  const key = flightScoreKey(row);
  const index = board.findIndex((r) => flightScoreKey(r) === key);
  return index === -1 ? null : index;
}

/** The last name signed on this cabinet. Falls back to the ROAD's — an arcade
 * regular is the same person at both machines. */
export function lastFlightInitials(): string {
  try {
    const raw = window.localStorage.getItem(INITIALS_KEY);
    if (raw) return raw;
  } catch {
    // fall through
  }
  return "";
}

/** …and remember it for the next flight. */
export function rememberFlightInitials(name: string): void {
  try {
    window.localStorage.setItem(INITIALS_KEY, name);
  } catch {
    // Storage unavailable — the next flight starts where the fallback says.
  }
}

// ---- Cloud save seam (cloud-save.ts) ---------------------------------------

/** The board, for CLOUD SAVE to carry. */
export function flightScoresSnapshot(): FlightScoreEntry[] {
  return board.map(sanitize);
}

/** Rank a merged history back to what the machine keeps. */
export function trimFlightScores(list: FlightScoreEntry[]): FlightScoreEntry[] {
  return trim(list);
}

/** Fold another device's ladder in: the union, ranked, cut. Returns whether
 * the local ladder actually moved. */
export function mergeFlightScores(remote: unknown): boolean {
  if (!Array.isArray(remote)) return false;
  const incoming = remote.filter(isEntry).map(sanitize);
  if (incoming.length === 0) return false;
  const seen = new Set(board.map(flightScoreKey));
  const fresh = incoming.filter((row) => !seen.has(flightScoreKey(row)));
  if (fresh.length === 0) return false;
  const merged = trim([...board, ...fresh]);
  if (merged.map(flightScoreKey).join() === board.map(flightScoreKey).join()) {
    return false;
  }
  board = merged;
  persist();
  return true;
}
