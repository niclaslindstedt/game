// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE ROCKET CABINET'S LADDER (pwa/src/game/rocket-scores.ts) — one store,
// TWO boards: the whole trip's and the MOON LANDING drop's, split by
// `FlightScoreEntry.leg`, because a drop's clock (~30 s) would head a mixed
// ladder forever and no whole trip could ever rank again.
//
// Runs in plain Node (no `window`), so the store degrades to an in-memory
// board — the drive board's own arrangement. The board is a shared module
// singleton, so every assertion here is a relationship, never an absolute row.

import { describe, expect, it } from "vitest";

import {
  boardLeg,
  flightScoreKey,
  flightTimeRank,
  recordFlightScore,
  topFlightScores,
  type FlightScoreEntry,
} from "../pwa/src/game/rocket-scores.ts";

/** A banked flight with sane defaults — the default clock is a crawl, so a
 * row that forgets its own time sinks instead of silently leading. */
function row(over: Partial<FlightScoreEntry> = {}): FlightScoreEntry {
  return {
    name: "AAA",
    score: 1000,
    ms: 30 * 60_000,
    topSpeedMph: 900,
    trash: 3,
    difficulty: "medium",
    at: 1_700_000_000_000,
    ...over,
  };
}

describe("the two ladders", () => {
  it("a legacy row with no leg is a whole trip", () => {
    expect(boardLeg(row())).toBe("trip");
    expect(boardLeg(row({ leg: "landing" }))).toBe("landing");
  });

  it("the leg is part of a row's identity", () => {
    const trip = row();
    const drop = row({ leg: "landing" });
    expect(flightScoreKey(trip)).not.toBe(flightScoreKey(drop));
  });

  it("a quick drop never ranks in the trip's ladder, nor shows on its board", () => {
    recordFlightScore(row({ name: "TRP", ms: 25 * 60_000, at: 1 }));
    recordFlightScore(row({ name: "DRP", ms: 20_000, at: 2, leg: "landing" }));
    // The drop's 20 s would head a mixed ladder; the trip's ladder never
    // sees it, and each board prints only its own rows.
    const tripRank = flightTimeRank(24 * 60_000, "trip");
    expect(tripRank).not.toBeNull();
    expect(
      topFlightScores(100, "trip").every((r) => boardLeg(r) === "trip"),
    ).toBe(true);
    expect(
      topFlightScores(100, "landing").every((r) => boardLeg(r) === "landing"),
    ).toBe(true);
    expect(topFlightScores(100, "landing").some((r) => r.name === "DRP")).toBe(
      true,
    );
    expect(topFlightScores(100, "trip").some((r) => r.name === "DRP")).toBe(
      false,
    );
  });

  it("a landing rank counts only landings", () => {
    recordFlightScore(row({ name: "DR2", ms: 40_000, at: 3, leg: "landing" }));
    // 30 s beats the 40 s drop and loses to the 20 s one — a rank inside the
    // landing ladder alone, wherever the trips sit.
    const rank = flightTimeRank(30_000, "landing");
    expect(rank).not.toBeNull();
    const landings = topFlightScores(100, "landing");
    const faster = landings.filter((r) => r.ms < 30_000).length;
    expect(rank).toBe(faster);
  });
});
