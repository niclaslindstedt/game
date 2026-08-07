// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE PARTY SCOREBOARD's rows — QuakeWorld's player list, built out of the two
// halves nothing else joins up.
//
// **THE ROSTER IS THE LIST, THE RUN IS THE NUMBERS.** Who is in the session is
// a fact only the roster carries (the engine's `Player` has no name, and a seat
// standing in another world is a departed body here); what each of them has
// DONE is a fact only the run carries (level, frags, whether they are down). So
// a row is one of each, paired on the seat — and every field the pairing cannot
// answer is `null` rather than a flattering zero, because a scoreboard that
// prints 0 KILLS for somebody it simply cannot see is worse than one that
// prints a dash.
//
// **IT IS A HIGHSCORE LIST, SO IT SORTS ON THE SCORE.** Frags first, exactly as
// QuakeWorld's does — the ranking IS the readout, and a board in seat order is a
// roster with extra columns. Spectators sink to the bottom whatever they have:
// they are watching, and a watcher at the top of a kill table is a lie about
// what the column means.
//
// Pure and DOM-free on purpose: this is the whole of the board's judgement, and
// it is worth being able to test it without a canvas, a session or a run.

import type { GameState } from "@game/core";
import type { RosterEntry } from "@game/wire/protocol.ts";

/** One line of the board. */
export type ScoreRow = {
  /** The roster slot — stable per connection, and the row's React key. */
  slot: number;
  /** The seat this client steers, or null for a spectator. The portrait and
   * every run-side number are read through it. */
  seat: number | null;
  name: string;
  /** This client is the one reading the board. */
  self: boolean;
  /** A session bot filling an empty chair rather than a person. */
  bot: boolean;
  /** Watching without a seated hero. */
  spectating: boolean;
  /**
   * THE RUN CANNOT ANSWER FOR THIS SEAT — they are standing on another level
   * (a town portal: `server/worlds.ts`) or their body has left the party. Every
   * run-side field below is null, and the board says so rather than reporting
   * the fresh zeroes the departed placeholder in this world happens to hold.
   */
  away: boolean;
  level: number | null;
  kills: number | null;
  /** Down where they fell — the row greys, exactly as their party frame does. */
  downed: boolean;
  /** How long this client has been in the SESSION, or null from a server too
   * old to say (the roster field is optional; see `RosterEntry.joinedMs`). */
  timeMs: number | null;
  /** Round trip in ms, or -1 where there is no wire to measure — the host's own
   * renderer and the session's own bots. */
  ping: number;
};

/**
 * Build the board.
 *
 * `levelId` is the level the READER's own world is carving; a roster entry
 * standing on a different one is `away`. An entry with no `level` at all is a
 * spectator, who watches the primary world by definition and so is never away
 * on that count.
 */
export function scoreRows(opts: {
  roster: readonly RosterEntry[];
  state: GameState;
  /** The reader's own seat, or null when they only watch. */
  mySeat: number | null;
  levelId: string;
  /**
   * MS SINCE THE ROSTER LANDED, added onto every row's `joinedMs` so the TIME
   * column ticks between broadcasts (see `SessionLink.rosterAt`). Zero is the
   * honest answer for a caller with no clock — a board that reads a second or
   * two stale, rather than one that has to be re-sent to move.
   */
  sinceRoster?: number;
}): ScoreRow[] {
  const { roster, state, mySeat, levelId } = opts;
  const since = Math.max(0, opts.sinceRoster ?? 0);
  const rows = roster.map((entry): ScoreRow => {
    const hero = entry.seat === null ? undefined : state.players[entry.seat];
    // "Standing in MY world, and still somebody the world answers for." Both
    // halves are needed and each catches a case the other misses: a level
    // mismatch is the town portal, and a departed body is a seat whose owner
    // dropped between roster frames.
    const here =
      hero !== undefined &&
      hero.departed !== true &&
      (entry.level === undefined || entry.level === levelId);
    return {
      slot: entry.slot,
      seat: entry.seat,
      name: entry.name,
      self: entry.seat !== null && entry.seat === mySeat,
      bot: entry.bot === true,
      spectating: !entry.playing,
      away: entry.playing && !here,
      level: here ? (hero?.level ?? null) : null,
      kills: here ? (hero?.kills ?? 0) : null,
      downed: here && hero?.downed === true,
      timeMs: entry.joinedMs === undefined ? null : entry.joinedMs + since,
      ping: entry.ping,
    };
  });
  return rows.sort(compareRows);
}

/**
 * The ranking: players over spectators, then frags, then level, then the
 * longest-serving, then the slot so the order is total.
 *
 * A total order matters more than it looks — the board redraws on every roster
 * frame, and two rows that tie on every column would otherwise swap places
 * under the player's eyes each second on nothing but sort instability.
 */
function compareRows(a: ScoreRow, b: ScoreRow): number {
  if (a.spectating !== b.spectating) return a.spectating ? 1 : -1;
  const kills = (b.kills ?? -1) - (a.kills ?? -1);
  if (kills !== 0) return kills;
  const level = (b.level ?? -1) - (a.level ?? -1);
  if (level !== 0) return level;
  const time = (b.timeMs ?? -1) - (a.timeMs ?? -1);
  if (time !== 0) return time;
  return a.slot - b.slot;
}

/**
 * The TIME column, `M:SS` up to an hour and `H:MM:SS` past it.
 *
 * Its own formatter rather than the HUD's `formatTime`: that one is a level
 * timer and tops out in the minutes it was written for, and a session is a
 * thing people sit in all evening — `184:07` is not a reading, it is arithmetic
 * homework.
 */
export function formatSessionTime(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const seconds = String(total % 60).padStart(2, "0");
  const minutes = Math.floor(total / 60) % 60;
  const hours = Math.floor(total / 3600);
  if (hours === 0) return `${minutes}:${seconds}`;
  return `${hours}:${String(minutes).padStart(2, "0")}:${seconds}`;
}
