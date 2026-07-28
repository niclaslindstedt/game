// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE LEADERBOARD CATALOG — what the game publishes to the platform's public
// boards. These pin the invariants that can't be caught by looking at the
// running game, because the other half of this feature lives in a store
// portal: a board whose key drifts stops matching its configured id, a value
// that isn't whole is truncated by the platform, and a scale that disagrees
// with the portal's score format makes every score on that board wrong by a
// factor of a hundred.
//
// Runs in plain Node (no window) — the ledger and the score book both degrade
// to in-memory sessions, which is what these assertions exercise.

import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { LEADERBOARD_KEYS } from "../pwa/src/app/scores-bridge.ts";
import { resetAchievementsForTest } from "../pwa/src/game/achievements.ts";
import { recordCampaign } from "../pwa/src/game/highscores.ts";
import { leaderboardEntries } from "../pwa/src/game/leaderboards.ts";
import {
  FORMAT_SCALE,
  leaderboardManifest,
  PLATFORM_LEADERBOARD_LIMIT,
  PLATFORM_LEADERBOARDS,
} from "../pwa/src/game/platform-leaderboards.ts";

describe("leaderboard catalog", () => {
  it("publishes exactly the declared board keys, once each", () => {
    // The keys are the game's half of a contract whose other half is typed
    // into App Store Connect. A catalog holding a key the union doesn't — or
    // two entries for one board — publishes to an id nobody configured, which
    // fails silently on the device.
    const keys = PLATFORM_LEADERBOARDS.map((board) => board.key);
    expect([...keys].sort()).toEqual([...LEADERBOARD_KEYS].sort());
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("stays inside the platform's board allowance", () => {
    expect(PLATFORM_LEADERBOARDS.length).toBeLessThanOrEqual(
      PLATFORM_LEADERBOARD_LIMIT,
    );
  });

  it("gives every board a name and a description", () => {
    for (const board of PLATFORM_LEADERBOARDS) {
      expect(board.name.length).toBeGreaterThan(0);
      expect(board.blurb.length).toBeGreaterThan(0);
      expect(FORMAT_SCALE[board.format]).toBeGreaterThan(0);
    }
  });

  it("submits nothing for a player with no records", () => {
    resetAchievementsForTest();
    // A fresh account stands on no board. Publishing zeroes would SEAT the
    // player at the bottom of every ranking rather than leaving them off it.
    expect(leaderboardEntries()).toEqual([]);
  });

  it("scales every value to a whole number", () => {
    resetAchievementsForTest();
    // A platform board stores an Int64, so a fractional metric has to arrive
    // pre-scaled — the portal's score format is what draws the point back in.
    recordCampaign("jesus", {
      name: "AZRAEL",
      kills: 4321,
      combatMs: 1_234_567,
      peakMenace: 7,
      levels: 6,
      outcome: "fell",
      at: 1_700_000_000_000,
    });
    const entries = leaderboardEntries();
    for (const entry of entries) {
      expect(Number.isInteger(entry.value)).toBe(true);
      expect(entry.value).toBeGreaterThan(0);
    }
    const byKey = new Map(entries.map((e) => [e.key, e.value]));
    expect(byKey.get("jesus_kills")).toBe(4321);
    // Whole seconds — the "Elapsed Time" format the portal is told to draw.
    expect(byKey.get("jesus_survival")).toBe(1235);
  });

  it("keeps the committed portal manifest in step with the catalog", () => {
    // The manifest is what App Store Connect was filled in from; a drift here
    // means entries to create in the portal, not a snapshot to bless blindly —
    // regenerate with `node scripts/game-center-leaderboards.mjs`.
    const committed = JSON.parse(
      readFileSync(
        new URL(
          "../native/store/game-center-leaderboards.json",
          import.meta.url,
        ),
        "utf8",
      ),
    ) as { count: number; leaderboards: unknown[] };
    const rows = leaderboardManifest();
    expect(committed.leaderboards).toEqual(rows);
    expect(committed.count).toBe(rows.length);
  });

  it("declares a scale the portal's own format can read back", () => {
    // The pair that silently breaks a board: a rate submitted ×100 under an
    // Integer format reads as a hundred times too big, and a duration
    // submitted in milliseconds under Elapsed Time reads as a thousand hours.
    for (const row of leaderboardManifest()) {
      const board = PLATFORM_LEADERBOARDS.find((b) => b.key === row.id);
      expect(board).toBeDefined();
      expect(row.scale).toBe(FORMAT_SCALE[board!.format]);
    }
  });
});
