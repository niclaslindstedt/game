// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE DRIVE'S ARCADE BOARD (pwa/src/game/drive-scores.ts): five rows, ranked
// best first, signed with three letters.
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
  INITIALS_LENGTH,
  INITIAL_CHARS,
  clampInitials,
  driveScoreKey,
  driveScoreRank,
  hasDriveScores,
  mergeDriveScores,
  recordDriveScore,
  topDriveScores,
  trimDriveScores,
  type DriveScoreEntry,
} from "../pwa/src/game/drive-scores.ts";

/** A banked leg with sane defaults, overridable per assertion. */
function leg(over: Partial<DriveScoreEntry> = {}): DriveScoreEntry {
  return {
    name: "ACE",
    score: 10_000,
    ms: 60_000,
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
 * Lay down a known five-row board, and return it.
 *
 * THE STORE IS A MODULE SINGLETON with no reset — deliberately, because nothing
 * in the game ever wipes a board and a test-only door into one is a door the
 * shipped code could walk through. So each call climbs a decade above the last:
 * five rows every one of which out-ranks every score any earlier test banked,
 * which displaces whatever was there and leaves the board exactly as asked for.
 */
let floorScore = 1_000_000;
function fill(): Ladder {
  floorScore += 1_000_000;
  const ladder = [
    floorScore + 50_000,
    floorScore + 40_000,
    floorScore + 30_000,
    floorScore + 20_000,
    floorScore + 10_000,
  ] as const;
  for (const [i, score] of ladder.entries()) {
    recordDriveScore(leg({ name: "PAD", score, at: floorScore + i }));
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
    // An em-dash and a lowercase thorn are both glyphs the wheel does not carry;
    // left in, they would print as `?` on the board forever.
    expect(clampInitials("A—B")).toBe("A B");
    expect(clampInitials("þøx")).toBe("  X");
  });

  it("offers only characters the wheel can spell", () => {
    for (const char of INITIAL_CHARS) {
      expect(clampInitials(char.repeat(3))).toBe(char.repeat(3));
    }
  });
});

describe("the board", () => {
  /** The five rows in place for each assertion, best first. */
  let rows: Ladder = fill();
  beforeEach(() => {
    rows = fill();
  });

  it("ranks best first and keeps exactly five rows", () => {
    expect(topDriveScores().map((row) => row.score)).toEqual([...rows]);
    recordDriveScore(leg({ name: "NEW", score: rows[0] + 1 }));
    const board = topDriveScores();
    expect(board).toHaveLength(BOARD_SIZE);
    expect(board.map((row) => row.score)).toEqual([
      rows[0] + 1,
      rows[0],
      rows[1],
      rows[2],
      rows[3],
    ]);
  });

  it("reports where a score would land before it is banked", () => {
    expect(driveScoreRank(rows[0] + 1, 60_000)).toBe(0);
    expect(driveScoreRank(rows[2] + 1, 60_000)).toBe(2);
    expect(driveScoreRank(rows[4] + 1, 60_000)).toBe(4);
  });

  it("turns away a score that misses the board", () => {
    expect(driveScoreRank(rows[4] - 1, 60_000)).toBeNull();
    expect(driveScoreRank(0, 60_000)).toBeNull();
  });

  it("banks a row at the place it was promised", () => {
    const score = rows[2] + 1;
    const rank = driveScoreRank(score, 60_000);
    expect(rank).toBe(2);
    expect(recordDriveScore(leg({ name: "BOB", score }))).toBe(rank);
    expect(topDriveScores()[rank ?? 0]?.name).toBe("BOB");
  });

  it("breaks a tied score on the quicker trip", () => {
    const score = rows[2] + 1;
    recordDriveScore(leg({ name: "SLO", score, ms: 70_000 }));
    recordDriveScore(leg({ name: "FST", score, ms: 55_000 }));
    const names = topDriveScores().map((row) => row.name);
    expect(names.indexOf("FST")).toBeLessThan(names.indexOf("SLO"));
  });

  it("makes a challenger BEAT the board rather than match it", () => {
    // Dead level with the incumbent third row, on score AND on the clock: the
    // arcade rule is that the seat stays where it is, so the challenger takes
    // the row BELOW rather than the one it matched.
    expect(driveScoreRank(rows[2], 60_000)).toBe(3);
  });

  it("refuses a scoreless leg outright", () => {
    expect(recordDriveScore(leg({ score: 0 }))).toBeNull();
  });

  it("knows whether anything has ever been scored", () => {
    expect(hasDriveScores()).toBe(true);
  });
});

describe("carrying the board between devices", () => {
  let rows: Ladder = fill();
  beforeEach(() => {
    rows = fill();
  });

  it("folds another device's rows in and keeps the best five", () => {
    expect(
      mergeDriveScores([
        leg({ name: "OTH", score: rows[0] + 1, at: 2_000 }),
        leg({ name: "OTH", score: 5, at: 2_001 }),
      ]),
    ).toBe(true);
    expect(topDriveScores().map((row) => row.score)).toEqual([
      rows[0] + 1,
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

  it("reports no change when every arriving row misses the board", () => {
    expect(mergeDriveScores([leg({ name: "LOW", score: 1, at: 3_000 })])).toBe(
      false,
    );
  });

  it("ignores a payload that is not a board at all", () => {
    expect(mergeDriveScores(null)).toBe(false);
    expect(mergeDriveScores({ nope: true })).toBe(false);
    expect(mergeDriveScores([{ name: "X" }])).toBe(false);
  });

  it("orders a merged board from its CONTENT, not its assembly order", () => {
    const incoming = [
      leg({ name: "AAA", score: 12_345, at: 5 }),
      leg({ name: "BBB", score: 12_345, at: 6 }),
      leg({ name: "CCC", score: 999, at: 7 }),
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
