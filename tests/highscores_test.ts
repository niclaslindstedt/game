// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The on-device high-score book behind the menu's HIGH SCORES board: runs are
// banked per difficulty, ranked two ways (longest survival, highest
// kills-per-minute), and the end-of-run splash learns whether a run set a new
// best time. Runs in plain Node (no window) — the store degrades to an
// in-memory session, which is exactly what these assertions exercise. Each
// test uses its own difficulty so the shared singleton never bleeds across.

import { describe, expect, it } from "vitest";

import {
  bestTime,
  recordRun,
  topScores,
} from "../website/src/game/highscores.ts";

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

  it("caps the board at the requested limit", () => {
    for (let i = 1; i <= 8; i++) {
      recordRun("jesus", { timeMs: i * 1_000, kills: i });
    }
    expect(topScores("jesus", "time", 3).map((r) => r.timeMs)).toEqual([
      8_000, 7_000, 6_000,
    ]);
  });
});
