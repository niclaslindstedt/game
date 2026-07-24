// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The analytic progression simulator (src/sim/analytic.ts): a paper
// playthrough that uses the real kill funnel for every mob a level fields,
// snapshotting the hero's full stat block every N kills. These are
// engine-rule smoke tests on the fixture catalog; the balance-probing runs
// live in scripts/progression-sim.mjs.

import { describe, expect, it } from "vitest";

import { simulateProgression } from "../../src/sim/analytic.ts";
import { buildStatWeights } from "@game/core";
// Installs the fixture catalogs before any simulation builds a game.
import "./helpers.ts";

const STATS = [
  "stamina",
  "strength",
  "dexterity",
  "intelligence",
  "luck",
  "spirit",
] as const;

describe("simulateProgression", () => {
  it("farms a fixture level's whole roster and snapshots the hero", () => {
    const report = simulateProgression({
      difficulties: ["medium"],
      levels: ["test_level"],
      seed: 42,
      batchSize: 25,
      targetLevel: 1, // don't farm past the single pass
    });

    expect(report.levels).toHaveLength(1);
    const lr = report.levels[0]!;

    // The whole guaranteed roster was fielded and killed (test_level pins a
    // boss and streams a 400+ wave budget), and the boss fell.
    expect(lr.mobsPlanned).toBeGreaterThan(100);
    expect(lr.mobsKilled).toBe(lr.mobsPlanned);
    expect(lr.bossKilled).toBe(true);
    expect(report.totalKills).toBe(lr.mobsKilled);

    // The clean kills paid XP and the hero climbed.
    expect(lr.xpGained).toBeGreaterThan(0);
    expect(lr.heroLevelEnd).toBeGreaterThanOrEqual(lr.heroLevelStart);
    expect(report.heroLevelEnd).toBe(lr.heroLevelEnd);

    // A snapshot at the open plus at least one batch/end snapshot, each a full
    // stat block with a live per-map cap.
    expect(lr.checkpoints.length).toBeGreaterThanOrEqual(2);
    for (const cp of lr.checkpoints) {
      expect(cp.difficulty).toBe("medium");
      expect(cp.levelId).toBe("test_level");
      expect(cp.maxHp).toBeGreaterThan(0);
      expect(cp.perHit).toBeGreaterThan(0);
      expect(cp.dps).toBeGreaterThanOrEqual(cp.perHit);
      expect(cp.armorReduction).toBeGreaterThanOrEqual(0);
      expect(cp.armorReduction).toBeLessThanOrEqual(0.75);
      expect(cp.xpCap).toBeGreaterThan(0);
      for (const stat of STATS)
        expect(cp.stats[stat]).toBeGreaterThanOrEqual(0);
    }

    // The final checkpoint agrees with the level summary.
    const last = lr.checkpoints[lr.checkpoints.length - 1]!;
    expect(last.heroLevel).toBe(lr.heroLevelEnd);
    expect(last.killsInLevel).toBe(lr.mobsKilled);
  });

  it("is deterministic — the same options replay the same run exactly", () => {
    const run = () =>
      simulateProgression({
        difficulties: ["medium"],
        levels: ["test_level"],
        seed: 7,
        targetLevel: 1,
      });
    expect(JSON.stringify(run())).toBe(JSON.stringify(run()));
  });

  it("honors the configurable stat distribution", () => {
    const build = (statWeights: Record<string, number>) =>
      simulateProgression({
        difficulties: ["medium"],
        levels: ["test_level"],
        seed: 3,
        targetLevel: 1,
        statWeights,
      });

    const strengthRun = build({ strength: 1 });
    const dexterityRun = build({ dexterity: 1 });
    const strEnd = strengthRun.levels[0]!.checkpoints.at(-1)!.stats;
    const dexEnd = dexterityRun.levels[0]!.checkpoints.at(-1)!.stats;

    // A STRENGTH-only build pours its points into strength; a DEXTERITY-only
    // build into dexterity. The chosen lane outgrows the same stat under the
    // other build (auto-growth and gear are common, so the gap is the pick).
    expect(strEnd.strength).toBeGreaterThan(dexEnd.strength);
    expect(dexEnd.dexterity).toBeGreaterThan(strEnd.dexterity);
  });

  it("carries the loadout across passes and farms toward the target level", () => {
    const report = simulateProgression({
      difficulties: ["medium"],
      levels: ["test_level"],
      seed: 11,
      targetLevel: 99,
    });
    // With a target the hero can't reach on the fixture's cap, the farm loops
    // the level a few times, then bails when a full lap adds no level — it
    // never spins forever, and every pass is booked.
    expect(report.levels.length).toBeGreaterThan(1);
    expect(report.reachedTarget).toBe(false);
    const levels = report.levels.map((l) => l.heroLevelEnd);
    for (let i = 1; i < levels.length; i++) {
      expect(levels[i]!).toBeGreaterThanOrEqual(levels[i - 1]!);
    }
  });

  it("a named build sets the stat weights from the shared catalog", () => {
    const report = simulateProgression({
      difficulties: ["medium"],
      levels: ["test_level"],
      seed: 7,
      targetLevel: 1,
      build: "magic",
    });
    // The report echoes the build, and its weights are exactly the magic
    // catalog entry — so the paper sim spends points as the autopilot does.
    expect(report.build).toBe("magic");
    expect(report.statWeights).toEqual(buildStatWeights("magic"));
    // A magic build pours the most into intelligence.
    const top = Object.entries(report.statWeights).sort(
      (a, b) => (b[1] ?? 0) - (a[1] ?? 0),
    )[0]![0];
    expect(top).toBe("intelligence");
  });

  it("an explicit statWeights overrides the build shorthand", () => {
    const report = simulateProgression({
      difficulties: ["medium"],
      levels: ["test_level"],
      seed: 7,
      targetLevel: 1,
      build: "magic",
      statWeights: { strength: 3 },
    });
    expect(report.statWeights).toEqual({ strength: 3 });
  });
});
