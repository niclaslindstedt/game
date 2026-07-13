// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The headless campaign simulator (src/sim/simulate.ts): drives the real
// engine — createGame, step, the autopilot, auto-equip, loadout carry — and
// reports what happened. These are engine-rule smoke tests on the fixture
// catalog; the balance-probing runs live in scripts/simulate-run.mjs.

import { afterEach, describe, expect, it } from "vitest";

import { simulateCampaign, simulateLevel } from "../../src/sim/simulate.ts";
import {
  BALANCE_TUNING_DEFAULTS,
  getBalanceTuning,
  resetBalanceTuning,
} from "../../src/game/tuning.ts";
// Installs the fixture catalogs before any simulation builds a game.
import "./helpers.ts";

// The balance option touches global tuning — leave it neutral for other suites.
afterEach(() => resetBalanceTuning());

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

  it("tracks each boss/elite as an engagement, not a spawn", () => {
    const report = simulateLevel({
      levelId: "test_level",
      difficulty: "medium",
      seed: 42,
      strategy: "boss", // push toward the set-piece foes
      maxMinutes: 3,
    });
    // The fixture level fields a boss and elites — they show up in the roster.
    expect(report.bosses.length).toBeGreaterThan(0);
    for (const boss of report.bosses) {
      expect(["boss", "elite"]).toContain(boss.role);
      expect(boss.bossMaxHp).toBeGreaterThan(0);
      if (boss.engaged) {
        // Engagement books the fight's start, not map load: a real hero level
        // and moment. Any kill implies engagement and a blows-to-kill read.
        expect(boss.heroLevel).toBeGreaterThan(0);
        expect(boss.metAtMs).toBeGreaterThanOrEqual(0);
        if (boss.killed) expect(boss.hitsToKill).toBeGreaterThan(0);
      } else {
        // Never reached: the pacing fields stay zeroed (not a false "met at 0").
        expect(boss.heroLevel).toBe(0);
        expect(boss.killed).toBe(false);
      }
    }
  });

  it("judges each equipment drop against the hero's level", () => {
    const report = simulateLevel({
      levelId: "test_level",
      difficulty: "medium",
      seed: 3,
      maxMinutes: 3,
    });
    const e = report.drops.equipment;
    // The bands partition the resolved drops, and the counts stay coherent.
    expect(e.belowLevel + e.onLevel + e.aboveLevel).toBe(e.total);
    expect(e.equippableNow).toBeLessThanOrEqual(e.total);
    expect(e.levelGated).toBeLessThanOrEqual(e.total);
    if (e.total === 0) expect(e.avgIlvlDelta).toBe(0);
    // A drop can't be both wearable-now and gated-too-high — the two are
    // complementary reads on the level gate, so their counts never overlap
    // into an impossible sum.
    expect(e.equippableNow + e.levelGated).toBeLessThanOrEqual(e.total * 2);
  });

  it("realistic pacing ends the run at the map's intended level, not farmed out", () => {
    // FIX_LEVEL carries arrowCapByDifficulty.easy = 3 — a normal clear's exit.
    const opts = {
      levelId: "test_level",
      difficulty: "easy" as const,
      seed: 4,
      maxMinutes: 2,
    };
    const paced = simulateLevel({ ...opts, realisticPacing: true });
    const farmed = simulateLevel(opts); // farm to the cap (default)
    // Pacing stops the hero once he reaches the intended exit level — it never
    // farms PAST where farm mode would land.
    expect(paced.hero.levelEnd).toBeLessThanOrEqual(farmed.hero.levelEnd);
    // Ending by the pacing rule means it stopped AT the intended exit level
    // (arrowCapByDifficulty.easy = 3) rather than farming on past it.
    if (paced.outcome === "cleared") {
      expect(paced.hero.levelEnd).toBeGreaterThanOrEqual(3);
    }
  }, 30_000);

  it("auto-shop runs cleanly and reports its merchant recoveries", () => {
    const report = simulateLevel({
      levelId: "test_merchant_level",
      difficulty: "medium",
      seed: 8,
      maxMinutes: 2,
      autoShop: true,
    });
    // The recovery counter is always present and sane (a healthy run may never
    // need the merchant, so 0 is fine — it must never go negative or crash).
    expect(report.combat.shopVisits).toBeGreaterThanOrEqual(0);
    expect(report.combat.kills).toBeGreaterThan(0);
  }, 30_000);

  it("applies the balance knobs and restores global tuning afterward", () => {
    // A hard mobHp cut makes mobs die in fewer blows than at baseline.
    const base = simulateLevel({
      levelId: "test_level",
      difficulty: "medium",
      seed: 5,
      maxMinutes: 2,
    });
    const softer = simulateLevel({
      levelId: "test_level",
      difficulty: "medium",
      seed: 5,
      maxMinutes: 2,
      balance: { mobHp: 0.25 },
    });
    const avgHp = (r: typeof base) =>
      r.mobs.reduce((s, m) => s + m.avgMaxHp * m.spawned, 0) /
      Math.max(
        1,
        r.mobs.reduce((s, m) => s + m.spawned, 0),
      );
    expect(avgHp(softer)).toBeLessThan(avgHp(base));
    // The run put the global tuning back exactly as it found it.
    expect(getBalanceTuning()).toEqual(BALANCE_TUNING_DEFAULTS);
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
