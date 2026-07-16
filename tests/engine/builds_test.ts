// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The stat-distribution BUILD catalog (src/game/builds.ts): the single source
// of truth the balance tooling compares builds against. These pin the four
// builds' shape (melee/ranged/magic focus a weapon lane; balanced spreads
// across every stat), the weight-ratio derivation, and that the autopilot
// spends the live hero's points by that same catalog.

import { describe, expect, it } from "vitest";

import {
  botAllocate,
  BUILD_ROTATION,
  buildStats,
  buildStatWeights,
  buildWeaponLane,
  createBot,
  isStatBuild,
  STAT_BUILDS,
} from "@game/core";
import { startGame } from "./helpers.ts";

describe("stat-build catalog", () => {
  it("lists the four builds and validates names", () => {
    expect(STAT_BUILDS).toEqual(["melee", "ranged", "magic", "balanced"]);
    expect(isStatBuild("melee")).toBe(true);
    expect(isStatBuild("balanced")).toBe(true);
    expect(isStatBuild("auto")).toBe(false);
    expect(isStatBuild("nonsense")).toBe(false);
  });

  it("derives each build's weight ratio from its rotation", () => {
    for (const build of STAT_BUILDS) {
      const weights = buildStatWeights(build);
      // The derived weights are exactly the beat counts of the rotation.
      const tally: Record<string, number> = {};
      for (const stat of BUILD_ROTATION[build])
        tally[stat] = (tally[stat] ?? 0) + 1;
      expect(weights).toEqual(tally);
    }
  });

  it("each lane build leans hardest on its required attribute", () => {
    const top = (build: "melee" | "ranged" | "magic") => {
      const w = buildStatWeights(build);
      return Object.entries(w).sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0))[0]![0];
    };
    expect(top("melee")).toBe("strength");
    expect(top("ranged")).toBe("dexterity");
    expect(top("magic")).toBe("intelligence");
  });

  it("balanced spreads across EVERY stat, leaning double on the attack trio", () => {
    const w = buildStatWeights("balanced");
    // Touches all six trainable attributes — a genuine generalist, not a
    // three-stat build.
    for (const stat of [
      "strength",
      "dexterity",
      "intelligence",
      "stamina",
      "spirit",
      "speed",
      "luck",
    ]) {
      expect(w[stat as keyof typeof w] ?? 0).toBeGreaterThan(0);
    }
    // The three attack stats each outweigh every support stat.
    const attack = Math.min(w.strength!, w.dexterity!, w.intelligence!);
    const support = Math.max(w.stamina!, w.spirit!, w.speed!, w.luck!);
    expect(attack).toBeGreaterThan(support);
  });

  it("a lane build pins a weapon lane; balanced pins none", () => {
    expect(buildWeaponLane("melee")).toBe("melee");
    expect(buildWeaponLane("ranged")).toBe("ranged");
    expect(buildWeaponLane("magic")).toBe("magic");
    expect(buildWeaponLane("balanced")).toBeNull();
  });

  it("buildStats lists only the stats a build spends into, in a stable order", () => {
    // magic never spends dexterity or luck.
    expect(buildStats("magic")).not.toContain("dexterity");
    // balanced spends into every stat it weights.
    expect(new Set(buildStats("balanced"))).toEqual(
      new Set(Object.keys(buildStatWeights("balanced"))),
    );
  });
});

describe("the autopilot spends points by the shared build catalog", () => {
  // Tally the stats an allocation cycle spends, advancing spentStats directly so
  // the rotation index (which keys off spent points) walks the whole cycle.
  const tally = (
    profile: "melee" | "ranged" | "magic" | "balanced",
    n = 60,
  ) => {
    const state = startGame();
    const bot = createBot("balanced", profile);
    const counts: Record<string, number> = {};
    for (let i = 0; i < n; i++) {
      const stat = botAllocate(bot, state);
      counts[stat] = (counts[stat] ?? 0) + 1;
      state.player.spentStats[stat]++;
    }
    return counts;
  };
  const top = (counts: Record<string, number>) =>
    Object.entries(counts).sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0))[0]![0];

  it("a balanced bot touches every stat", () => {
    const c = tally("balanced");
    for (const stat of [
      "strength",
      "dexterity",
      "intelligence",
      "stamina",
      "spirit",
      "speed",
      "luck",
    ]) {
      expect(c[stat] ?? 0).toBeGreaterThan(0);
    }
  });

  it("a fixed lane bot tops that lane's attribute", () => {
    expect(top(tally("melee"))).toBe("strength");
    expect(top(tally("ranged"))).toBe("dexterity");
    expect(top(tally("magic"))).toBe("intelligence");
  });
});
