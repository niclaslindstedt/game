// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The on-device high-score book behind the menu's HIGH SCORES board: HARDCORE
// campaigns are banked per difficulty and ranked four ways (most mobs killed,
// longest combat-clock survival, highest kills-per-minute, highest menace
// reached), and the end-of-run splash learns whether a campaign set a new best
// kill count. Runs in plain Node (no window) — the store degrades to an
// in-memory session, which is exactly what these assertions exercise. Each test
// uses its own difficulty key so the shared singleton never bleeds across.

import { describe, expect, it } from "vitest";

import {
  bestKills,
  recordCampaign,
  topCampaigns,
  type CampaignScore,
} from "../website/src/game/highscores.ts";

/** A banked campaign with sane defaults, overridable per assertion. */
function campaign(over: Partial<CampaignScore> = {}): CampaignScore {
  return {
    name: "AZRAEL",
    kills: 100,
    combatMs: 120_000,
    peakMenace: 3,
    levels: 5,
    outcome: "survived",
    at: 1_700_000_000_000,
    ...over,
  };
}

describe("high scores", () => {
  it("banks campaigns and ranks them by mobs killed, most first", () => {
    recordCampaign("easy", campaign({ kills: 100 }));
    recordCampaign("easy", campaign({ kills: 300 }));
    recordCampaign("easy", campaign({ kills: 200 }));

    expect(bestKills("easy")).toBe(300);
    expect(topCampaigns("easy", "kills").map((r) => r.kills)).toEqual([
      300, 200, 100,
    ]);
  });

  it("ranks by survival time independently of kills", () => {
    recordCampaign("time-rank", {
      ...campaign(),
      kills: 500,
      combatMs: 60_000,
    });
    recordCampaign("time-rank", {
      ...campaign(),
      kills: 50,
      combatMs: 600_000,
    });

    expect(topCampaigns("time-rank", "kills").map((r) => r.kills)).toEqual([
      500, 50,
    ]);
    expect(topCampaigns("time-rank", "time").map((r) => r.combatMs)).toEqual([
      600_000, 60_000,
    ]);
  });

  it("ranks by kills-per-minute independently of raw kills", () => {
    // A short, frantic campaign out-paces a long grind per minute even with
    // fewer total kills — the two rankings disagree, by design.
    recordCampaign("kpm-rank", { ...campaign(), kills: 60, combatMs: 60_000 }); // 60
    recordCampaign("kpm-rank", {
      ...campaign(),
      kills: 120,
      combatMs: 600_000,
    }); // 12

    expect(
      topCampaigns("kpm-rank", "kpm").map((r) => Math.round(r.kpm)),
    ).toEqual([60, 12]);
  });

  it("ranks by highest menace reached", () => {
    recordCampaign("menace-rank", campaign({ peakMenace: 2 }));
    recordCampaign("menace-rank", campaign({ peakMenace: 9 }));
    recordCampaign("menace-rank", campaign({ peakMenace: 5 }));

    expect(
      topCampaigns("menace-rank", "menace").map((r) => r.peakMenace),
    ).toEqual([9, 5, 2]);
  });

  it("flags a new record only when the best kill count is beaten", () => {
    expect(recordCampaign("hard", campaign({ kills: 50 }))).toBe(true);
    expect(recordCampaign("hard", campaign({ kills: 30 }))).toBe(false);
    expect(recordCampaign("hard", campaign({ kills: 80 }))).toBe(true);
  });

  it("ignores an empty campaign (no kills and no cleared levels)", () => {
    expect(recordCampaign("nightmare", campaign({ kills: 0, levels: 0 }))).toBe(
      false,
    );
    expect(topCampaigns("nightmare", "kills")).toHaveLength(0);
    expect(bestKills("nightmare")).toBe(0);
  });

  it("banks a fallen campaign with the level it fell on and returns it", () => {
    recordCampaign("fell-rank", {
      ...campaign(),
      name: "GRIMM",
      kills: 42,
      levels: 2,
      outcome: "fell",
      levelId: "mars",
    });
    const [row] = topCampaigns("fell-rank", "kills");
    if (!row) throw new Error("expected a banked campaign");
    expect(row.name).toBe("GRIMM");
    expect(row.outcome).toBe("fell");
    expect(row.levelId).toBe("mars");
    expect(row.levels).toBe(2);
    expect(Math.round(row.kpm)).toBe(21); // 42 kills over 2 minutes
  });

  it("caps the board at the requested limit", () => {
    for (let i = 1; i <= 8; i++) {
      recordCampaign("jesus", campaign({ kills: i * 100 }));
    }
    expect(topCampaigns("jesus", "kills", 3).map((r) => r.kills)).toEqual([
      800, 700, 600,
    ]);
  });
});
