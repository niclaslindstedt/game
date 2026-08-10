// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE DRIVE'S ARCADE LADDER (pwa/src/game/drive-scores.ts): every leg ever
// driven, ranked on the CLOCK, fastest first, signed with three letters — with
// the best five of them being the TABLE the screen prints.
//
// Runs in plain Node (no `window`), so the store degrades to an in-memory board
// for the session — which is exactly the path these assertions exercise, and the
// same arrangement `highscores_test.ts` beside it uses. The board is a shared
// module singleton, so the tests below are written to be order-independent: each
// one either fills the board past its own reach or asserts a relationship rather
// than an absolute row.

import { beforeEach, describe, expect, it } from "vitest";

import {
  BOARD_SIZE,
  HISTORY_SIZE,
  INITIALS_LENGTH,
  INITIAL_CHARS,
  clampInitials,
  driveScoreCount,
  driveScoreKey,
  driveTimeRank,
  hasDriveScores,
  mergeDriveScores,
  recordDriveScore,
  signedInitials,
  topDriveScores,
  trimDriveScores,
  type DriveScoreEntry,
} from "../pwa/src/game/drive-scores.ts";

/**
 * A banked leg with sane defaults, overridable per assertion.
 *
 * THE DEFAULT CLOCK IS A CRAWL, on purpose. Every ladder below is faster than
 * this, so a `leg()` that forgets to name its own time lands at the bottom of
 * the board instead of silently taking the top of it.
 */
function leg(over: Partial<DriveScoreEntry> = {}): DriveScoreEntry {
  return {
    name: "ACE",
    score: 10_000,
    ms: 99_000_000,
    topSpeedMph: 120,
    bodies: 51,
    difficulty: "medium",
    at: 1_700_000_000_000,
    ...over,
  };
}

/** The board's five rows, best first — a TUPLE so an assertion can name a row
 * without the index check an array would owe. */
type Ladder = readonly [number, number, number, number, number];

/**
 * Lay down a known five-row TABLE (five trip times, fastest first) and return it.
 *
 * THE STORE IS A MODULE SINGLETON with no reset — deliberately, because nothing
 * in the game ever wipes a ladder and a test-only door into one is a door the
 * shipped code could walk through. Nothing is displaced any more either: the
 * ladder keeps everything. So each call goes a whole minute QUICKER than the
 * last, which puts its five rows in front of every time any earlier test banked
 * and leaves the TABLE exactly as asked for, whatever is piled up behind it.
 */
let floorMs = 60_000_000;
function fill(): Ladder {
  floorMs -= 1_000_000;
  const ladder = [
    floorMs - 50_000,
    floorMs - 40_000,
    floorMs - 30_000,
    floorMs - 20_000,
    floorMs - 10_000,
  ] as const;
  for (const [i, ms] of ladder.entries()) {
    recordDriveScore(leg({ name: "PAD", ms, at: floorMs + i }));
  }
  return ladder;
}

describe("signing the board", () => {
  it("takes exactly three characters, uppercased and padded", () => {
    expect(clampInitials("abc")).toBe("ABC");
    expect(clampInitials("a")).toBe("A  ");
    expect(clampInitials("abcdef")).toBe("ABC");
    expect(clampInitials("")).toBe("   ");
    expect(clampInitials("xyz")).toHaveLength(INITIALS_LENGTH);
  });

  it("replaces anything the pixel font cannot draw with a blank", () => {
    // An em-dash and a lowercase thorn are both glyphs the board does not carry;
    // left in, they would print as `?` on it forever.
    expect(clampInitials("A—B")).toBe("A B");
    expect(clampInitials("þøx")).toBe("  X");
  });

  it("offers only characters the board can spell", () => {
    for (const char of INITIAL_CHARS) {
      expect(clampInitials(char.repeat(3))).toBe(char.repeat(3));
    }
  });

  it("signs an untyped name with the unsigned row's own initials", () => {
    // A tap on the name cell wipes it (see `DriveScores`), so a player can
    // reach the ENTER button with nothing typed at all — and a row of three
    // spaces is a row with a hole where the name goes, handed on to the next
    // leg as its prefill.
    expect(signedInitials("")).toBe("AAA");
    expect(signedInitials("   ")).toBe("AAA");
    expect(signedInitials("—")).toBe("AAA");
  });

  it("otherwise signs exactly what the board would print", () => {
    for (const raw of ["abc", "a", "abcdef", "A—B", "x"]) {
      expect(signedInitials(raw)).toBe(clampInitials(raw));
    }
  });
});

describe("the board", () => {
  /** The five rows in place for each assertion, best first. */
  let rows: Ladder = fill();
  beforeEach(() => {
    rows = fill();
  });

  it("shows the five quickest trips, best first", () => {
    expect(topDriveScores().map((row) => row.ms)).toEqual([...rows]);
    recordDriveScore(leg({ name: "NEW", ms: rows[0] - 1 }));
    const board = topDriveScores();
    expect(board).toHaveLength(BOARD_SIZE);
    expect(board.map((row) => row.ms)).toEqual([
      rows[0] - 1,
      rows[0],
      rows[1],
      rows[2],
      rows[3],
    ]);
  });

  it("reports where a time would land before it is banked", () => {
    expect(driveTimeRank(rows[0] - 1)).toBe(0);
    expect(driveTimeRank(rows[2] - 1)).toBe(2);
    expect(driveTimeRank(rows[4] - 1)).toBe(4);
  });

  it("gives a leg that misses the table its real place instead of nothing", () => {
    // The whole point of keeping every row: a slow leg is not turned away, it is
    // told exactly how slow. The ladder behind the table is deeper than five, so
    // the number is bigger than the table is.
    const held = driveScoreCount();
    expect(held).toBeGreaterThan(BOARD_SIZE);
    expect(driveTimeRank(rows[4] + 1)).toBe(BOARD_SIZE);
    const last = driveTimeRank(Number.MAX_SAFE_INTEGER);
    expect(last).toBe(held);
  });

  it("banks a leg that missed the table, and still shows only five", () => {
    const before = driveScoreCount();
    const rank = driveTimeRank(rows[4] + 1);
    expect(recordDriveScore(leg({ name: "SLO", ms: rows[4] + 1 }))).toBe(rank);
    expect(driveScoreCount()).toBe(before + 1);
    expect(topDriveScores()).toHaveLength(BOARD_SIZE);
    // …and it is nowhere near the table it missed.
    expect(topDriveScores().map((row) => row.name)).not.toContain("SLO");
  });

  it("keeps a whole history, not a top five", () => {
    expect(HISTORY_SIZE).toBeGreaterThan(BOARD_SIZE);
    expect(driveScoreCount()).toBeLessThanOrEqual(HISTORY_SIZE);
  });

  it("banks a row at the place it was promised", () => {
    const ms = rows[2] - 1;
    const rank = driveTimeRank(ms);
    expect(rank).toBe(2);
    expect(recordDriveScore(leg({ name: "BOB", ms }))).toBe(rank);
    expect(topDriveScores()[rank ?? 0]?.name).toBe("BOB");
  });

  it("makes a challenger BEAT the board rather than match it", () => {
    // Dead level with the incumbent third row: the arcade rule is that the seat
    // stays where it is, so the challenger takes the row BELOW the one it
    // matched.
    expect(driveTimeRank(rows[2])).toBe(3);
  });

  it("keeps the older row in front on a tied clock", () => {
    const ms = rows[2] - 1;
    recordDriveScore(leg({ name: "OLD", ms, at: 10 }));
    recordDriveScore(leg({ name: "NEW", ms, at: 20 }));
    const names = topDriveScores().map((row) => row.name);
    expect(names.indexOf("OLD")).toBeLessThan(names.indexOf("NEW"));
  });

  it("does not let the score jump a slower row up the board", () => {
    // The score is still banked on the row and is deliberately NOT a tie-break:
    // a fat tally on a slow leg must not out-rank a lean one on a quick leg, or
    // the column the player can see stops being the column that decides.
    recordDriveScore(leg({ name: "FAT", ms: rows[1] - 1, score: 1 }));
    recordDriveScore(leg({ name: "LEA", ms: rows[1] - 2, score: 9_999_999 }));
    const names = topDriveScores().map((row) => row.name);
    expect(names.indexOf("LEA")).toBeLessThan(names.indexOf("FAT"));
  });

  it("refuses a leg whose clock never started", () => {
    // The stopwatch only runs inside the town, so a road abandoned before the
    // gate has no time to rank — and would otherwise take #1 as the quickest
    // leg ever driven.
    expect(driveTimeRank(0)).toBeNull();
    expect(recordDriveScore(leg({ ms: 0 }))).toBeNull();
    expect(topDriveScores().map((row) => row.ms)).toEqual([...rows]);
  });

  it("knows whether anything has ever been driven for the record", () => {
    expect(hasDriveScores()).toBe(true);
  });
});

describe("carrying the board between devices", () => {
  let rows: Ladder = fill();
  beforeEach(() => {
    rows = fill();
  });

  it("folds another device's rows in and shows the best five", () => {
    expect(
      mergeDriveScores([
        leg({ name: "OTH", ms: rows[0] - 1, at: 2_000 }),
        leg({ name: "OTH", ms: rows[4] + 5_000, at: 2_001 }),
      ]),
    ).toBe(true);
    expect(topDriveScores().map((row) => row.ms)).toEqual([
      rows[0] - 1,
      rows[0],
      rows[1],
      rows[2],
      rows[3],
    ]);
  });

  it("is idempotent — merging the same board twice changes nothing", () => {
    const remote = topDriveScores();
    expect(mergeDriveScores(remote)).toBe(false);
    expect(mergeDriveScores(remote)).toBe(false);
  });

  it("keeps an arriving row that misses the table — it is still a record", () => {
    const before = driveScoreCount();
    expect(
      mergeDriveScores([leg({ name: "LOW", ms: rows[4] + 1, at: 3_000 })]),
    ).toBe(true);
    expect(driveScoreCount()).toBe(before + 1);
    // The TABLE is untouched by it, though.
    expect(topDriveScores().map((row) => row.ms)).toEqual([...rows]);
  });

  it("ignores a payload that is not a board at all", () => {
    expect(mergeDriveScores(null)).toBe(false);
    expect(mergeDriveScores({ nope: true })).toBe(false);
    expect(mergeDriveScores([{ name: "X" }])).toBe(false);
  });

  it("drops an arriving row with no clock on it", () => {
    // An old board could hold one: the ladder used to be sorted on the score,
    // and a road that finished before the town gate still earned the arrival
    // bonus. Merged in as-is it would sit at the top of this board forever.
    expect(mergeDriveScores([leg({ name: "NIL", ms: 0, at: 4_000 })])).toBe(
      false,
    );
  });

  it("orders a merged board from its CONTENT, not its assembly order", () => {
    const incoming = [
      leg({ name: "AAA", ms: 12_345, at: 5 }),
      leg({ name: "BBB", ms: 12_345, at: 6 }),
      leg({ name: "CCC", ms: 999_999, at: 7 }),
    ];
    const forwards = trimDriveScores([...incoming]).map(driveScoreKey);
    const backwards = trimDriveScores([...incoming].reverse()).map(
      driveScoreKey,
    );
    // Two devices holding the same rows must lay them out identically, or each
    // reads the other's board as new and writes it back forever.
    expect(forwards).toEqual(backwards);
  });
});
