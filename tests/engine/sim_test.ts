// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The headless campaign simulator (src/sim/simulate.ts): drives the real
// engine — createGame, step, the autopilot, auto-equip, loadout carry — and
// reports what happened. These are engine-rule smoke tests on the fixture
// catalog; the balance-probing runs live in scripts/simulate-run.mjs.

import { describe, expect, it } from "vitest";

import { simulateCampaign, simulateLevel } from "../../src/sim/simulate.ts";
// Installs the fixture catalogs before any simulation builds a game.
import "./helpers.ts";

describe("simulateLevel", () => {
  it("plays a fixture level headlessly and reports the run", () => {
    const report = simulateLevel({
      levelId: "test_level",
      difficulty: "medium",
      seed: 42,
      maxMinutes: 2,
    });
    // The bot genuinely played: time passed, blows landed, mobs fell.
    expect(report.timeMs).toBeGreaterThan(0);
    expect(report.combat.kills).toBeGreaterThan(0);
    expect(report.combat.damageDealt).toBeGreaterThan(0);
    // The calibration hero cannot die — defeat is not an outcome.
    expect(["victory", "timeout"]).toContain(report.outcome);
    // The report's bookkeeping holds together.
    expect(report.levelId).toBe("test_level");
    expect(report.hero.levelEnd).toBeGreaterThanOrEqual(report.hero.levelStart);
    expect(report.snapshots.length).toBeGreaterThanOrEqual(2); // start + end
    const killedTotal = report.mobs.reduce((sum, m) => sum + m.killed, 0);
    expect(killedTotal).toBe(report.combat.kills);
    // The per-hit calibration reads: blows landed, average blow size, and
    // per-mob attribution all hold together.
    expect(report.combat.hitsLanded).toBeGreaterThanOrEqual(
      report.combat.kills,
    );
    expect(report.combat.damagePerHit).toBeGreaterThan(0);
    for (const mob of report.mobs) {
      expect(mob.killed).toBeLessThanOrEqual(mob.spawned);
      expect(mob.avgMaxHp).toBeGreaterThan(0);
      expect(mob.hitsFromHero).toBeGreaterThanOrEqual(mob.killed);
      if (mob.hitsFromHero > 0) {
        expect(mob.avgHitFromHero).toBeGreaterThan(0);
        expect(mob.hitsToKill).toBeGreaterThan(0);
      }
    }
    const mobHits = report.mobs.reduce((sum, m) => sum + m.hitsFromHero, 0);
    expect(mobHits).toBe(report.combat.hitsLanded);
    if (report.combat.hitsTaken > 0) {
      expect(report.combat.damagePerHitTaken).toBeGreaterThanOrEqual(0);
    }
    // The per-map cap rode along (fixtures run the shipped medium band).
    expect(report.xpCap.cap).toBeGreaterThan(0);
  });

  it("is deterministic — the same options replay the same run exactly", () => {
    const run = () =>
      simulateLevel({
        levelId: "test_level",
        difficulty: "medium",
        seed: 7,
        maxMinutes: 1,
      });
    expect(JSON.stringify(run())).toBe(JSON.stringify(run()));
  });
});

describe("simulateCampaign", () => {
  it("sweeps levels in order and carries the hero's loadout forward", () => {
    const report = simulateCampaign({
      difficulties: ["medium"],
      levels: ["test_level", "test_level_2"],
      seed: 11,
      maxMinutes: 2,
    });
    expect(report.runs.length).toBe(2);
    const [first, second] = report.runs;
    // The second run walks in with the first run's banked progress.
    expect(second!.hero.levelStart).toBe(first!.hero.levelEnd);
    expect(report.totalKills).toBe(first!.combat.kills + second!.combat.kills);
    expect(report.finalLevel).toBe(second!.hero.levelEnd);
  });
});
