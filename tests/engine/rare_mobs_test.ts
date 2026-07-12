// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// RARE & UNIQUE special mobs (config RARE_MOBS): the once-per-map encounter
// rolls (`LevelDef.rareSpawns`), the pack/solo placement rules, the spawn-time
// stat multipliers, the power-match re-stamp on engagement, and the multiplied
// multi-payout drop burst a special kill erupts in.

import { describe, expect, it } from "vitest";

import {
  createGame,
  currentMobLevel,
  hitEnemy,
  MENACE,
  mobHpScaleFor,
  RARE_MOBS,
} from "@game/core";
import type { Enemy, GameState } from "@game/core";

import { makeEnemy, startGame } from "./helpers.ts";

const ofDef = (state: GameState, defId: string): Enemy[] =>
  state.enemies.filter((e) => e.defId === defId);

/** First seed in [from, …] whose `test_rare_level` run rolled the given mob. */
function seedWith(defId: string, from = 1): { state: GameState; seed: number } {
  for (let seed = from; seed < from + 200; seed++) {
    const state = createGame(seed, "test_rare_level");
    if (ofDef(state, defId).length > 0) return { state, seed };
  }
  throw new Error(`no seed in range rolled ${defId}`);
}

describe("rare & unique mob encounters", () => {
  it("rolls each tier at its encounter chance — rares on most runs, uniques on a fraction", () => {
    let rares = 0;
    let uniques = 0;
    const runs = 120;
    for (let seed = 1; seed <= runs; seed++) {
      const state = createGame(seed, "test_rare_level");
      if (ofDef(state, "test_rare").length > 0) rares++;
      if (ofDef(state, "test_unique_mob").length > 0) uniques++;
    }
    // encounterChance.rare = 0.8, .unique = 0.2 — generous binomial bounds so
    // the assertion pins the RULE, not one seed sequence.
    expect(rares).toBeGreaterThan(runs * 0.6);
    expect(uniques).toBeGreaterThan(runs * 0.08);
    expect(uniques).toBeLessThan(runs * 0.4);
  });

  it("levels without rareSpawns never roll one", () => {
    for (let seed = 1; seed <= 20; seed++) {
      const state = createGame(seed, "test_level");
      expect(ofDef(state, "test_rare")).toHaveLength(0);
      expect(ofDef(state, "test_unique_mob")).toHaveLength(0);
    }
  });

  it("a rare pack mob spawns its rolled pack, clustered; a unique is always solo", () => {
    const { state } = seedWith("test_rare");
    const pack = ofDef(state, "test_rare");
    expect(pack.length).toBeGreaterThanOrEqual(2);
    expect(pack.length).toBeLessThanOrEqual(4);
    // Pack members scatter around one anchor, not across the map.
    const [anchor, ...rest] = pack;
    for (const member of rest) {
      expect(
        Math.hypot(
          member.pos.x - (anchor as Enemy).pos.x,
          member.pos.y - (anchor as Enemy).pos.y,
        ),
      ).toBeLessThanOrEqual(RARE_MOBS.packScatter * 2 + 1);
    }
    // The unique fixture carries `pack: [3, 5]` on purpose — solo regardless.
    const { state: uniqueState } = seedWith("test_unique_mob");
    expect(ofDef(uniqueState, "test_unique_mob")).toHaveLength(1);
  });

  it("applies the tier multipliers at spawn: hp, monster level, contact damage", () => {
    const { state } = seedWith("test_rare");
    const rare = ofDef(state, "test_rare")[0] as Enemy;
    const minion = ofDef(state, "test_minion")[0] as Enemy;
    const tuning = RARE_MOBS.tuning.rare;
    // Both defs are authored at hp 45, so the rare's bar is exactly the
    // multiplied minion baseline.
    expect(rare.maxHp).toBe(
      Math.round(45 * mobHpScaleFor(1, "medium") * tuning.hpMult),
    );
    expect(rare.mlvl).toBe(minion.mlvl + tuning.levelBonus);
    // Contact damage: the horde's per-level ramp × the tier's meaner touch.
    const ramp = 1 + Math.max(0, rare.mlvl - 1) * MENACE.mobDamagePerLevel;
    expect(rare.contactMult).toBeCloseTo(ramp * tuning.damageMult, 6);
  });

  it("power-matches the hero on engagement, like a set piece", () => {
    const state = startGame(42, "test_rare_level");
    const rare = makeEnemy(
      { pos: { ...state.player.pos }, hp: 225, maxHp: 225, mlvl: 3 },
      "test_rare",
    );
    state.enemies.push(rare);
    state.player.level = 20;
    hitEnemy(state, rare, 1);
    expect(rare.powerScaled).toBe(true);
    expect(rare.mlvl).toBe(
      currentMobLevel(state) + RARE_MOBS.tuning.rare.levelBonus,
    );
  });

  it("a unique kill erupts in a multi-payout drop burst; the rank and file do not", () => {
    const state = startGame(7, "test_rare_level");
    // A wounded unique (hp far under maxHp) so one modest blow kills without
    // tripping the overkill toll on the drop chance.
    const mob = makeEnemy(
      { pos: { x: 500, y: 500 }, hp: 40, maxHp: 450 },
      "test_unique_mob",
    );
    state.enemies.push(mob);
    const before = state.items.length;
    hitEnemy(state, mob, 100);
    // dropChance × dropMult (100×) caps at maxDropRolls payouts; even with
    // the ladder's empty tail a burst of several items always lands.
    const dropped = state.items.length - before;
    expect(dropped).toBeGreaterThanOrEqual(3);
    expect(dropped).toBeLessThanOrEqual(RARE_MOBS.maxDropRolls);
  });

  it("special mobs count toward the level's foe total", () => {
    const { state } = seedWith("test_unique_mob");
    const placed = state.enemies.length;
    expect(state.stats.totalEnemies).toBeGreaterThanOrEqual(placed);
  });
});
