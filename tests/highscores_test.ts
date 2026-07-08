// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The on-device high-score book behind the menu's HIGH SCORES board: runs are
// banked per difficulty, ranked four ways (longest survival, highest
// kills-per-minute, most mobs killed, highest level reached), and the end-of-run
// splash learns whether a run set a new best time. Runs in plain Node (no
// window) — the store degrades to an in-memory session, which is exactly what
// these assertions exercise. Each test uses its own difficulty so the shared
// singleton never bleeds across.

import { describe, expect, it } from "vitest";

import {
  bestTime,
  recordRun,
  topScores,
  type ScoreDetail,
} from "../website/src/game/highscores.ts";

/** A full end-of-run session snapshot for the detail-banking tests. */
function detail(over: Partial<ScoreDetail> = {}): ScoreDetail {
  return {
    stats: {
      kills: 12,
      totalEnemies: 30,
      shotsFired: 88,
      damageDealt: 640,
      damageTaken: 210,
      itemsCollected: 4,
      xpGained: 320,
      timeMs: 120_000,
    },
    level: 6,
    levelId: "moon",
    outcome: "victory",
    at: 1_700_000_000_000,
    ...over,
  };
}

describe("high scores", () => {
  it("banks runs and ranks them by survival time, longest first", () => {
    recordRun("easy", { timeMs: 60_000, kills: 10 });
    recordRun("easy", { timeMs: 180_000, kills: 5 });
    recordRun("easy", { timeMs: 120_000, kills: 8 });

    expect(bestTime("easy")).toBe(180_000);
    const board = topScores("easy", "time");
    expect(board.map((r) => r.timeMs)).toEqual([180_000, 120_000, 60_000]);
  });

  it("ranks by kills-per-minute independently of raw time", () => {
    // A one-minute sprint outkills a ten-minute grind per minute, but the
    // grind still survived longer — the two rankings disagree, by design.
    recordRun("medium", { timeMs: 60_000, kills: 60 }); // 60 KPM
    recordRun("medium", { timeMs: 600_000, kills: 120 }); // 12 KPM

    expect(topScores("medium", "time").map((r) => r.timeMs)).toEqual([
      600_000, 60_000,
    ]);
    expect(topScores("medium", "kpm").map((r) => Math.round(r.kpm))).toEqual([
      60, 12,
    ]);
  });

  it("ranks by mobs killed independently of survival time", () => {
    // The longest run is not the deadliest: a short, frantic run can out-kill a
    // long, cautious one — the two rankings disagree, by design.
    recordRun("kills-rank", { timeMs: 300_000, kills: 20 });
    recordRun("kills-rank", { timeMs: 60_000, kills: 75 });
    recordRun("kills-rank", { timeMs: 120_000, kills: 40 });

    expect(topScores("kills-rank", "time").map((r) => r.timeMs)).toEqual([
      300_000, 120_000, 60_000,
    ]);
    expect(topScores("kills-rank", "kills").map((r) => r.kills)).toEqual([
      75, 40, 20,
    ]);
  });

  it("ranks by player level reached, resolving from the detail when needed", () => {
    recordRun("level-rank", { timeMs: 60_000, kills: 5, level: 3 });
    // A run banked with the level only inside its detail still ranks by it.
    recordRun("level-rank", {
      timeMs: 90_000,
      kills: 8,
      detail: detail({ level: 11 }),
    });
    recordRun("level-rank", { timeMs: 30_000, kills: 2, level: 7 });

    expect(topScores("level-rank", "level").map((r) => r.level)).toEqual([
      11, 7, 3,
    ]);
  });

  it("ranks a detail-less, level-less run last on level (resolves to 0)", () => {
    recordRun("level-zero", { timeMs: 60_000, kills: 5, level: 4 });
    recordRun("level-zero", { timeMs: 90_000, kills: 8 });
    expect(topScores("level-zero", "level").map((r) => r.level)).toEqual([
      4, 0,
    ]);
  });

  it("flags a new record only when the best survival time is beaten", () => {
    expect(recordRun("hard", { timeMs: 5_000, kills: 1 })).toBe(true);
    expect(recordRun("hard", { timeMs: 3_000, kills: 9 })).toBe(false);
    expect(recordRun("hard", { timeMs: 8_000, kills: 2 })).toBe(true);
  });

  it("ignores runs with a non-positive survival time", () => {
    expect(recordRun("nightmare", { timeMs: 0, kills: 5 })).toBe(false);
    expect(recordRun("nightmare", { timeMs: -1, kills: 5 })).toBe(false);
    expect(topScores("nightmare", "time")).toHaveLength(0);
    expect(bestTime("nightmare")).toBe(0);
  });

  it("banks the full session detail and returns it on the board row", () => {
    recordRun("detail-full", {
      timeMs: 120_000,
      kills: 12,
      detail: detail({ level: 9, outcome: "defeat" }),
    });
    const [row] = topScores("detail-full", "time");
    if (!row) throw new Error("expected a banked row");
    expect(row.detail?.level).toBe(9);
    expect(row.detail?.outcome).toBe("defeat");
    expect(row.detail?.levelId).toBe("moon");
    expect(row.detail?.stats.damageDealt).toBe(640);
    expect(row.detail?.stats.shotsFired).toBe(88);
  });

  it("banks a detail-less run and leaves its row without detail", () => {
    recordRun("detail-none", { timeMs: 30_000, kills: 5 });
    const [row] = topScores("detail-none", "time");
    if (!row) throw new Error("expected a banked row");
    expect(row.timeMs).toBe(30_000);
    expect(row.detail).toBeUndefined();
  });

  it("drops a malformed detail but still banks the run", () => {
    recordRun("detail-bad", {
      timeMs: 45_000,
      kills: 7,
      // A partial/corrupt snapshot must not be trusted onto the board.
      detail: { level: 3 } as unknown as ScoreDetail,
    });
    const [row] = topScores("detail-bad", "time");
    if (!row) throw new Error("expected a banked row");
    expect(row.kills).toBe(7);
    expect(row.detail).toBeUndefined();
  });

  it("caps the board at the requested limit", () => {
    for (let i = 1; i <= 8; i++) {
      recordRun("jesus", { timeMs: i * 1_000, kills: i });
    }
    expect(topScores("jesus", "time", 3).map((r) => r.timeMs)).toEqual([
      8_000, 7_000, 6_000,
    ]);
  });
});
