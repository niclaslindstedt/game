// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The SHIPPED STAMINA LADDERS — the three per-rung terms of the sprint pool's
// economy, authored in content/ladder.yaml (`staminaDrain`, `staminaRefill`,
// `staminaEmptyLock`) and compiled into the difficulty catalog. These assert the real ladder's shape and the design target it is
// tuned to, so they live in tests/content/ against the shipped rungs rather
// than the fixture ones.
//
// The target: a build that spends about a fifth of its stat points on STAMINA
// gets a decent ride, and one that spends none runs dry on the high rungs.
// "Decent" is measured as the SUSTAINABLE RUN DUTY CYCLE — the share of time a
// hero can run without ever bottoming out, given that the pool only regains at
// a walk or a stand:
//
//     runSecs / (runSecs + refillSecs + the rung's empty-pool lockout)
//
// against the 70–90% the balance sim measures a real map actually demanding.

import { describe, expect, it } from "vitest";

import type { Difficulty } from "@game/core";
import { DIFFICULTY_ORDER, STAMINA, difficultyDef } from "@game/core";

/**
 * The STAMINA a build that spends a fifth of its points there has banked by
 * `level` — the design target the ladders are tuned against. Mirrors the
 * engine's own budget: one point per level, plus one more per full ten levels.
 */
function investedStamina(level: number): number {
  let points = 0;
  for (let l = 2; l <= level; l++) points += 1 + Math.floor(l / 10);
  return Math.round(0.2 * points);
}

/** The drain a hero of `staminaStat` faces on `rung`, in points per second. */
function drainPerSec(rung: Difficulty, staminaStat: number): number {
  return (
    (STAMINA.drainPerSec * difficultyDef(rung).staminaDrainMult) /
    (1 + staminaStat * STAMINA.drainReductionPerPoint)
  );
}

/** The standstill breather rate on `rung`, mirroring `staminaRegenPerSec` (a
 * live GameState isn't needed to price a rung against a hypothetical stat). */
function regenPerSec(rung: Difficulty, staminaStat: number): number {
  return (
    (STAMINA.base / difficultyDef(rung).staminaRefillSec) *
    (1 + staminaStat * STAMINA.regenPerPoint)
  );
}

/**
 * The share of time (0..1) a hero of `staminaStat` can spend RUNNING on `rung`
 * without ever bottoming the pool out — one full run, one full standstill
 * refill, and the empty-pool lockout he owes if he does run it dry.
 */
function sustainableRunShare(rung: Difficulty, staminaStat: number): number {
  const pool = STAMINA.base + staminaStat * STAMINA.maxPerPoint;
  const runSecs = pool / drainPerSec(rung, staminaStat);
  return runSecs / (runSecs + dryOutCostSec(rung, staminaStat));
}

/** What ONE dry-out costs on `rung`: the dead-still lockout plus the full
 * standstill refill it gates. */
function dryOutCostSec(rung: Difficulty, staminaStat: number): number {
  const pool = STAMINA.base + staminaStat * STAMINA.maxPerPoint;
  return (
    difficultyDef(rung).staminaEmptyLockSec +
    pool / regenPerSec(rung, staminaStat)
  );
}

describe("the shipped stamina ladder", () => {
  it("climbs with the difficulty and never eases — every term of it", () => {
    // The DRAIN (how fast a run spends the pool), the BREATHER (seconds a
    // standstill refill takes) and the LOCKOUT (dead-still owed by a dry pool)
    // all climb, so a harder rung winds the hero faster, stands him still
    // longer, AND punishes the dry-out harder.
    for (const half of [
      "staminaDrainMult",
      "staminaRefillSec",
      "staminaEmptyLockSec",
    ] as const) {
      const rungs = DIFFICULTY_ORDER.map((rung) => difficultyDef(rung)[half]);
      for (let i = 1; i < rungs.length; i++) {
        expect(rungs[i]!).toBeGreaterThanOrEqual(rungs[i - 1]!);
      }
      // And each genuinely SPREADS — a ladder whose rungs sit within a few
      // percent of each other can't make STAMINA a build decision up top.
      expect(rungs[rungs.length - 1]! / rungs[0]!).toBeGreaterThan(1.5);
    }
  });

  it("leaves the pool spendable on every rung — a hero can still run dry", () => {
    // The point of the pool is that it CAN empty. A fresh hero (no points to
    // spend yet) must sit under the ~90% a busy map demands on every rung, so
    // an unbroken sprint still bottoms out.
    for (const rung of DIFFICULTY_ORDER) {
      expect(sustainableRunShare(rung, 0)).toBeLessThan(0.9);
    }
  });

  it("pays a fifth-of-points STAMINA build a decent ride, and a stamina-less one none", () => {
    // Judged at the hero level each rung is actually PLAYED at (the ladder's
    // own `hero` anchors): the low rungs run a campaign from level 1, while
    // nightmare opens at 42 and JESUS past 55. A fifth of the points a hero has
    // banked by then is what "20% in STAMINA" really buys there.
    const bands: [Difficulty, number][] = [
      ["easy", 20],
      ["medium", 20],
      ["hard", 22],
      ["nightmare", 47],
      ["jesus", 58],
    ];
    for (const [rung, level] of bands) {
      const invested = investedStamina(level);
      // Investment lands inside the 70–90% band a real map demands, with room
      // to spare — a decent ride, not a free one.
      expect(sustainableRunShare(rung, invested)).toBeGreaterThan(0.8);
      // …and always buys a real margin over spending nothing.
      expect(sustainableRunShare(rung, invested)).toBeGreaterThan(
        sustainableRunShare(rung, 0) + 0.05,
      );
    }
    // On the HIGH rungs, skipping STAMINA has to actually hurt: a stamina-less
    // build there sits below even the gentlest demand a map puts on him.
    expect(sustainableRunShare("nightmare", 0)).toBeLessThan(0.6);
    expect(sustainableRunShare("jesus", 0)).toBeLessThan(0.45);
    // And the payoff GROWS with the rung — the higher you climb, the more the
    // same fifth of your points is worth.
    const payoff = (rung: Difficulty, level: number): number =>
      sustainableRunShare(rung, investedStamina(level)) -
      sustainableRunShare(rung, 0);
    expect(payoff("jesus", 58)).toBeGreaterThan(payoff("easy", 58));
  });

  it("makes running dry cost more the harder the rung", () => {
    // One dry-out's price — the lockout plus the refill it gates — climbs the
    // ladder, and climbs FASTER than the gentlest rung's, so a mistake on the
    // high rungs is a real setback rather than a beat.
    const costs = DIFFICULTY_ORDER.map((rung) => dryOutCostSec(rung, 0));
    for (let i = 1; i < costs.length; i++) {
      expect(costs[i]!).toBeGreaterThan(costs[i - 1]!);
    }
    expect(costs[costs.length - 1]!).toBeGreaterThan(costs[0]! * 2);
    // And the mercy ladder agrees with it: the rung that punishes a dry pool
    // hardest is also the one that never throws a rescue drink.
    expect(difficultyDef("easy").mercy.staminaDrinkChanceMax).toBeGreaterThan(
      0,
    );
    expect(difficultyDef("jesus").mercy.staminaDrinkChanceMax).toBe(0);
  });
});
