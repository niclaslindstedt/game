// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE CABINET'S BOARD — the drive minigame's on-device high-score table, and
// the three letters a player signs it with.
//
// IT IS THE ARCADE ONE, NOT THE CAMPAIGN ONE, and the two are deliberately
// separate stores. `highscores.ts` beside it ranks whole HARDCORE CAMPAIGNS four
// ways, per difficulty, and is a record of a hero's life. This is a machine
// standing in the corner: ONE board, five rows, a number and three letters, and
// it does not care which hero was driving or whether he lived. Merging them
// would mean either a campaign board with a minigame in it or a minigame board
// that hid itself until somebody had died properly, and neither is the thing
// Frogger has.
//
// ONE BOARD FOR EVERY RUNG, on purpose. The drive's difficulty turns exactly one
// number — what the road WEIGHS (`impactMasses`) — so a JESUS leg is the same
// course driven against heavier traffic, which is a harder run for the same
// points rather than a different game. Splitting the board four ways would leave
// four two-row lists. The rung rides along on the entry and prints as a tag, so
// a top score still says what it was set against.
//
// SAME STORAGE POLICY AS ITS NEIGHBOURS (settings.ts, highscores.ts): one
// namespaced localStorage key, structurally validated on load, and a private-mode
// browser degrades to an in-memory board for the session rather than throwing.

import { storageKey } from "../identity.ts";

const STORAGE_KEY = storageKey("drive-scores");
/** The last name signed, so a repeat player just presses OK. Its own key: it is
 * a preference, not a score, and it must survive a board that gets beaten. */
const INITIALS_KEY = storageKey("drive-initials");

/**
 * HOW MANY ROWS THE BOARD HAS — the whole of it, displayed and stored.
 *
 * Five, which is Frogger's, and the number is doing real work: a board you can
 * take in at a glance on a 844×390 phone held sideways, and a bar low enough
 * that a second decent leg gets on it. A stored-but-unshown tail would mean a
 * player entering their initials into a row they never see.
 */
export const BOARD_SIZE = 5;

/** How many letters you sign with. Three, and it is not a parameter. */
export const INITIALS_LENGTH = 3;

/**
 * WHAT A NAME MAY SAY — every character the entry wheel cycles, in wheel order.
 *
 * Bounded by the pixel font's own glyph set (scripts/asset-tools/font.mjs): a
 * character the font cannot draw comes out as `?`, so a wheel that offered one
 * would be a wheel with a broken tooth in it. The blank sits LAST, after the
 * punctuation, because it is the one nobody is looking for and the one a player
 * lands on by holding the wheel down.
 */
export const INITIAL_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789.-!?& ";

/** What an unsigned board row prints as, and what the wheel starts on. */
const DEFAULT_INITIALS = "AAA";

/** One row of the board: a score, the trip behind it, and who signed it. */
export type DriveScoreEntry = {
  /** The three letters, already clamped to `INITIAL_CHARS`. */
  name: string;
  /** The arcade score (`driveScore`). */
  score: number;
  /** The trip time (ms) — the board's tie-breaker and its second column. */
  ms: number;
  /** The fastest the wagon went (mph). */
  topSpeedMph: number;
  /** People hit. Recorded because the card shows it; worth no points at all
   * (see `DRIVE.score`). */
  bodies: number;
  /** Which rung the road was driven on. */
  difficulty: string;
  /** Epoch ms the row was set, and the tie-break of last resort. */
  at: number;
};

/** A finite, non-negative number, or the fallback when absent/bad. */
function cleanNum(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : fallback;
}

/**
 * A name the board will accept: uppercased, anything the wheel cannot spell
 * replaced with the blank, and padded or cut to exactly three.
 *
 * Applied on the way IN and on the way OUT of storage, because a board row can
 * arrive from a hand-edited localStorage entry or another device's cloud save,
 * and a row carrying an em-dash would print as `?` forever.
 */
export function clampInitials(raw: string): string {
  const chars = [...raw.toUpperCase()].map((c) =>
    INITIAL_CHARS.includes(c) ? c : " ",
  );
  return chars.join("").slice(0, INITIALS_LENGTH).padEnd(INITIALS_LENGTH, " ");
}

function isEntry(value: unknown): value is DriveScoreEntry {
  if (!value || typeof value !== "object") return false;
  const { name, score, ms, difficulty, at } = value as Record<string, unknown>;
  return (
    typeof name === "string" &&
    typeof score === "number" &&
    Number.isFinite(score) &&
    score >= 0 &&
    typeof ms === "number" &&
    Number.isFinite(ms) &&
    ms >= 0 &&
    typeof difficulty === "string" &&
    typeof at === "number" &&
    Number.isFinite(at)
  );
}

/** Reduce a row to just its trusted fields. */
function sanitize(entry: DriveScoreEntry): DriveScoreEntry {
  return {
    name: clampInitials(entry.name),
    score: cleanNum(entry.score),
    ms: cleanNum(entry.ms),
    topSpeedMph: cleanNum(entry.topSpeedMph),
    bodies: cleanNum(entry.bodies),
    difficulty: entry.difficulty,
    at: cleanNum(entry.at),
  };
}

/** One row's identity — a row is a VALUE, not a record with an id, so two
 * devices holding the same leg dedupe on its whole content. */
export function driveScoreKey(entry: DriveScoreEntry): string {
  return [
    entry.name,
    entry.score,
    entry.ms,
    entry.topSpeedMph,
    entry.bodies,
    entry.difficulty,
    entry.at,
  ].join("|");
}

/**
 * Order two rows, best first: the higher SCORE, then the QUICKER trip, then the
 * OLDER row.
 *
 * The last term is what makes an incumbent keep its place against a tie, which
 * is the arcade rule everybody already knows — you have to BEAT the board, not
 * match it. It also makes the order a function of the SET rather than of the
 * order it was assembled in, which cloud save depends on: it compares boards as
 * text, so two devices holding the same five rows in different orders would each
 * read the other's board as new and write it back forever.
 */
function compare(a: DriveScoreEntry, b: DriveScoreEntry): number {
  return (
    b.score - a.score ||
    a.ms - b.ms ||
    a.at - b.at ||
    (driveScoreKey(a) < driveScoreKey(b) ? -1 : 1)
  );
}

/** Rank a list and cut it to the board. */
function trim(list: DriveScoreEntry[]): DriveScoreEntry[] {
  return [...list].sort(compare).slice(0, BOARD_SIZE);
}

function load(): DriveScoreEntry[] {
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

let board: DriveScoreEntry[] = load();

function persist(): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(board));
  } catch {
    // Storage unavailable (private mode) — the board stands for this session.
  }
}

/** The board, best first. A copy: the array is the store's own. */
export function topDriveScores(): DriveScoreEntry[] {
  return board.map((entry) => ({ ...entry }));
}

/** Whether the road has ever been scored — nothing on the board yet means the
 * first arrival is a #1 by default, which the screen says out loud. */
export function hasDriveScores(): boolean {
  return board.length > 0;
}

/**
 * The stand-in an UNBANKED score is compared as — a row carrying only the two
 * fields `compare` reads before the clock. `at` is the far future on purpose: it
 * makes the candidate the NEWEST row, so an incumbent holding the same score
 * over the same time keeps its seat and the challenger has to actually beat the
 * board.
 */
const CANDIDATE: DriveScoreEntry = {
  name: DEFAULT_INITIALS,
  score: 0,
  ms: 0,
  topSpeedMph: 0,
  bodies: 0,
  difficulty: "",
  at: Number.MAX_SAFE_INTEGER,
};

/**
 * WHERE THIS SCORE WOULD LAND, without banking it — a 0-based row, or `null`
 * when it misses the board entirely.
 *
 * Asked BEFORE the initials are entered, because that is the question the screen
 * has to answer first: a leg that misses the board is shown the board with its
 * own score under it and is never asked to sign anything.
 *
 * `ms` is taken for the same tie-break `compare` uses, so "would I get on" and
 * "where did I land" cannot disagree.
 */
export function driveScoreRank(score: number, ms: number): number | null {
  if (score <= 0) return null;
  const candidate = { ...CANDIDATE, score, ms };
  const index = board.findIndex((row) => compare(row, candidate) > 0);
  if (index !== -1) return index;
  // Nothing on the board is worse than this — it goes on the end, if there is
  // an end to go on.
  return board.length < BOARD_SIZE ? board.length : null;
}

/**
 * Bank a signed row. Returns the place it actually took (0-based), or `null` if
 * the board turned it away — which can only happen if something else banked in
 * between, and is handled rather than asserted because the store is shared.
 */
export function recordDriveScore(entry: DriveScoreEntry): number | null {
  const row = sanitize(entry);
  if (row.score <= 0) return null;
  board = trim([...board, row]);
  persist();
  const key = driveScoreKey(row);
  const index = board.findIndex((r) => driveScoreKey(r) === key);
  return index === -1 ? null : index;
}

/** The last name signed on this device, so the wheel starts where the player
 * left it — the whole of why an arcade regular can sign in one press. */
export function lastInitials(): string {
  try {
    const raw = window.localStorage.getItem(INITIALS_KEY);
    return raw ? clampInitials(raw) : DEFAULT_INITIALS;
  } catch {
    return DEFAULT_INITIALS;
  }
}

/** …and remember it for the next leg. */
export function rememberInitials(name: string): void {
  try {
    window.localStorage.setItem(INITIALS_KEY, clampInitials(name));
  } catch {
    // Storage unavailable — the next leg starts on AAA.
  }
}

// ---- Cloud save seam (cloud-save.ts) ---------------------------------------

/** The board, for CLOUD SAVE to carry. */
export function driveScoresSnapshot(): DriveScoreEntry[] {
  return board.map(sanitize);
}

/** Rank a merged board back to five rows (cloud-save.ts). */
export function trimDriveScores(list: DriveScoreEntry[]): DriveScoreEntry[] {
  return trim(list);
}

/**
 * Fold another device's board into this one: the union of both, ranked and cut
 * back to five. A board is append-only — a banked leg is finished history and is
 * never edited — so a union is the whole merge and nothing set offline is lost.
 * Returns true when the local board actually gained something.
 */
export function mergeDriveScores(remote: unknown): boolean {
  if (!Array.isArray(remote)) return false;
  const incoming = remote.filter(isEntry).map(sanitize);
  if (incoming.length === 0) return false;
  const seen = new Set(board.map(driveScoreKey));
  const fresh = incoming.filter((row) => !seen.has(driveScoreKey(row)));
  if (fresh.length === 0) return false;
  const merged = trim([...board, ...fresh]);
  // The union can be bigger than the board and still change nothing — five rows
  // that all out-rank the arrivals. Only a board that MOVED is worth a write.
  if (merged.map(driveScoreKey).join() === board.map(driveScoreKey).join()) {
    return false;
  }
  board = merged;
  persist();
  return true;
}
