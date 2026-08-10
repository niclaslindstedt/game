// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE CABINET'S BOARD — the drive minigame's on-device ranking table, and the
// three letters a player signs it with.
//
// IT RANKS THE CLOCK. A rally board has one column and it is the TIME: the
// fastest leg is the best leg, which is a rule a player already knows before
// the screen has finished drawing and which needs no explaining next to a
// number nobody can place. The arcade SCORE is still computed and still banked
// on the row (`driveScore`, engine/game/drive/score.ts — the bench and the
// balance passes read it, and a board that threw it away could never show a
// tally again), it simply is not what the ladder is sorted on any more.
//
// EVERY LEG IS A RECORD, and only the first five are a TABLE. The machine keeps
// what it is given (`HISTORY_SIZE`) and shows the head of it (`BOARD_SIZE`), so
// a leg that never troubles the top five still comes back with its real place
// on it — 768th, signed, under a rule. A board that threw a slow lap away told
// the player nothing except that they had failed to be told anything.
//
// IT IS THE ARCADE ONE, NOT THE CAMPAIGN ONE, and the two are deliberately
// separate stores. `highscores.ts` beside it ranks whole HARDCORE CAMPAIGNS four
// ways, per difficulty, and is a record of a hero's life. This is a machine
// standing in the corner: ONE ladder, a clock and three letters, and it does not
// care which hero was driving or whether he lived. Merging them would mean
// either a campaign board with a minigame in it or a minigame board that hid
// itself until somebody had died properly, and neither is the thing an arcade
// cabinet has.
//
// ONE BOARD FOR EVERY RUNG, on purpose. The drive's difficulty turns exactly one
// number — what the road WEIGHS (`impactMasses`) — so a JESUS leg is the same
// course driven against heavier traffic, which is a harder run for the same
// points rather than a different game. Splitting the board four ways would leave
// four two-row lists. The rung rides along on the entry, so a time still says
// what it was set against.
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
 * HOW MANY ROWS THE BOARD SHOWS.
 *
 * Five, which is Frogger's, and the number is doing real work: a table you can
 * take in at a glance on a 844×390 phone held sideways, and a bar low enough
 * that a second decent leg gets on it.
 */
export const BOARD_SIZE = 5;

/**
 * …AND HOW MANY IT KEEPS. Every leg is a record: nothing is thrown away for
 * being slow, so a bad run comes back reading `768` rather than nothing at all,
 * and the number itself is the joke — a place on the table is an achievement
 * and a place on the LADDER is just an attendance record.
 *
 * A THOUSAND, and the ceiling is the CLOUD rather than the disk. The payload
 * cloud save carries is capped at 900 000 characters (`cloud-save.ts`) against
 * a roster of a hundred heroes; a row of this shape is about 105 of them, so a
 * full history is ~105 KB — an eighth of that budget, for a player who has
 * driven the road a thousand times. localStorage would take twenty times more
 * without noticing. Past the thousandth the SLOWEST row falls off, which is the
 * only row nobody will ever look for.
 */
export const HISTORY_SIZE = 1000;

/** How many letters you sign with. Three, and it is not a parameter. */
export const INITIALS_LENGTH = 3;

/**
 * WHAT A NAME MAY SAY — every character the board will print.
 *
 * Bounded by the pixel font's own glyph set (scripts/asset-tools/font.mjs): a
 * character the font cannot draw comes out as `?`, so a name carrying one would
 * be a name with a hole in it. It is also what the entry filters a KEYBOARD
 * against, which is the whole reason a list this narrow is worth keeping — a
 * field with the alphabet of a whole language behind it can be typed full of
 * question marks in one breath.
 */
export const INITIAL_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789.-!?& ";

/** What an unsigned board row prints as, and what the entry starts on. */
const DEFAULT_INITIALS = "AAA";

/** One row of the board: a time, the trip behind it, and who signed it. */
export type DriveScoreEntry = {
  /** The three letters, already clamped to `INITIAL_CHARS`. */
  name: string;
  /** The arcade score (`driveScore`). Banked, not ranked — see the header. */
  score: number;
  /** The trip time (ms) — WHAT THE BOARD IS, and its only printed column. */
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
 * A name the board will accept: uppercased, anything it cannot spell replaced
 * with the blank, and padded or cut to exactly three.
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

/**
 * …AND THE NAME A PLAYER JUST SIGNED WITH, which is `clampInitials` plus the one
 * case only the entry screen can produce: NOTHING AT ALL.
 *
 * A tap on the name cell wipes the field so the next letter starts a fresh
 * entry (see `DriveScores`), so signing off without typing one is a keypress
 * away — and a blank clamps to three spaces, which the board would print as a
 * row with a hole where a name goes and would hand to the NEXT leg as its
 * prefill. An unsigned row prints what an unsigned row has always printed.
 */
export function signedInitials(raw: string): string {
  const name = clampInitials(raw);
  return name.trim() ? name : DEFAULT_INITIALS;
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
    // STRICTLY POSITIVE, unlike the score beside it: the clock is what this
    // board ranks, so a zero-clock row would sit at the top of it forever. Old
    // boards can carry one — the ladder used to be sorted on the score, and a
    // road that finished before the town gate still earned the arrival bonus —
    // so this is a load-time filter and not only an input check.
    ms > 0 &&
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
 * Order two rows, best first: the QUICKER trip, then the OLDER row.
 *
 * The second term is what makes an incumbent keep its place against a tie, which
 * is the arcade rule everybody already knows — you have to BEAT the board, not
 * match it. It also makes the order a function of the SET rather than of the
 * order it was assembled in, which cloud save depends on: it compares boards as
 * text, so two devices holding the same five rows in different orders would each
 * read the other's board as new and write it back forever.
 *
 * THE SCORE IS NOT A TIE-BREAK. Two identical clocks are the same lap as far as
 * this board is concerned, and reaching for the score to separate them would put
 * a hidden column back into a table whose whole point is that the one you can
 * see is the one that decides.
 */
function compare(a: DriveScoreEntry, b: DriveScoreEntry): number {
  return (
    a.ms - b.ms || a.at - b.at || (driveScoreKey(a) < driveScoreKey(b) ? -1 : 1)
  );
}

/** Rank a list and cut it to what the machine remembers. */
function trim(list: DriveScoreEntry[]): DriveScoreEntry[] {
  return [...list].sort(compare).slice(0, HISTORY_SIZE);
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

/**
 * The head of the ladder, best first — what the TABLE shows, which is a window
 * onto the history rather than the whole of it. A copy: the array is the store's
 * own.
 */
export function topDriveScores(limit = BOARD_SIZE): DriveScoreEntry[] {
  return board.slice(0, Math.max(0, limit)).map((entry) => ({ ...entry }));
}

/** How many legs the machine is holding — the denominator of a rank. */
export function driveScoreCount(): number {
  return board.length;
}

/** Whether the road has ever been driven for the record — nothing on the board
 * yet means the first arrival is a #1 by default. */
export function hasDriveScores(): boolean {
  return board.length > 0;
}

/**
 * The stand-in an UNBANKED time is compared as — a row carrying only the field
 * `compare` reads before the tie-break. `at` is the far future on purpose: it
 * makes the candidate the NEWEST row, so an incumbent holding the same time
 * keeps its seat and the challenger has to actually beat the board.
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
 * WHERE THIS TIME LANDS, without banking it — a 0-based place in the WHOLE
 * ladder, or `null` when the leg has no time to rank at all.
 *
 * Asked BEFORE the initials are entered, because it is what the screen prints
 * next to them: every leg has a place, so a run that never troubles the table
 * still comes back with a number on it and is still signed.
 *
 * A ZERO CLOCK IS NOT A TIME, and is the only `null`. The stopwatch only runs
 * inside the town (`DriveState.clockMs`), so a leg that never reached the gate —
 * the workbench's own short course, a road abandoned at the outskirts — has
 * nothing to rank and must never take a row, which it otherwise would as the
 * fastest lap ever driven.
 */
export function driveTimeRank(ms: number): number | null {
  if (ms <= 0) return null;
  const candidate = { ...CANDIDATE, ms };
  const index = board.findIndex((row) => compare(row, candidate) > 0);
  // Nothing held is slower than this — it goes on the end. Past `HISTORY_SIZE`
  // that place is real and the row still will not be KEPT (`recordDriveScore`
  // trims it straight off again); the player is told the truth about a leg
  // nobody, including them, will ever go looking for.
  return index === -1 ? board.length : index;
}

/**
 * Bank a signed row. Returns the place it actually took (0-based), or `null` if
 * the board turned it away — which can only happen if something else banked in
 * between, and is handled rather than asserted because the store is shared.
 */
export function recordDriveScore(entry: DriveScoreEntry): number | null {
  const row = sanitize(entry);
  if (row.ms <= 0) return null;
  board = trim([...board, row]);
  persist();
  const key = driveScoreKey(row);
  const index = board.findIndex((r) => driveScoreKey(r) === key);
  return index === -1 ? null : index;
}

/** The last name signed on this device, so the field starts where the player
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

/** Rank a merged history back to what the machine keeps (cloud-save.ts). */
export function trimDriveScores(list: DriveScoreEntry[]): DriveScoreEntry[] {
  return trim(list);
}

/**
 * Fold another device's ladder into this one: the union of both, ranked and cut
 * back to `HISTORY_SIZE`. A ladder is append-only — a banked leg is finished
 * history and is never edited — so a union is the whole merge and nothing driven
 * offline is lost. Returns true when the local ladder actually gained
 * something.
 */
export function mergeDriveScores(remote: unknown): boolean {
  if (!Array.isArray(remote)) return false;
  const incoming = remote.filter(isEntry).map(sanitize);
  if (incoming.length === 0) return false;
  const seen = new Set(board.map(driveScoreKey));
  const fresh = incoming.filter((row) => !seen.has(driveScoreKey(row)));
  if (fresh.length === 0) return false;
  const merged = trim([...board, ...fresh]);
  // The union can be bigger than the ladder and still change nothing — a full
  // history that out-runs every arrival. Only a ladder that MOVED is worth a
  // write.
  if (merged.map(driveScoreKey).join() === board.map(driveScoreKey).join()) {
    return false;
  }
  board = merged;
  persist();
  return true;
}
