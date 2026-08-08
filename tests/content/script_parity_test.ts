// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE SHIPPED SCRIPTS AGAINST THE ENGINE'S OWN ARITHMETIC.
//
// Every hook has a `fallback` at its binding (see `script/bindings.ts`) — the
// same formula in TypeScript, for the case where nothing has told the engine a
// rule at all: the `tests/engine/` suites register synthetic fixtures and never
// compile a script, the mod SDK's analyzers run against a half-built catalog,
// and a fresh clone typechecks before `npm run levels` has ever run.
//
// Two implementations of one rule is exactly the drift this repo refuses
// everywhere else, so it is pinned here instead: over the whole plausible input
// range, the Lua and the fallback must agree to the last bit. The day somebody
// edits `content/scripts/progression.lua` and forgets `leveling.ts` — or the
// other way round — this fails with the inputs that disagree, rather than the
// balance quietly depending on which code path a caller happened to take.
//
// A CONTENT test (it reads the shipped catalogs and the shipped scripts), so it
// lives in tests/content/ and a sequel deletes it with the rest.

import { describe, expect, it } from "vitest";

import {
  LEVELING,
  LOOT,
  MENACE,
  MOB_ARMOR,
  STATS,
  XP_CAP,
  diminishStat,
  mobArmorReduction,
  mobHpLevelFactor,
  mobLevelFor,
  mobLevelXp,
  overkillEfficiency,
  statCap,
  xpCapMultiplier,
  xpToLevelUp,
} from "@game/core";
import { HOOKS, SCRIPT_IDS } from "../../engine/game/script/hooks.ts";
import { GENERATED_SCRIPTS } from "../../engine/generated/scripts.ts";
import { hookIsScripted, numberHook } from "../../engine/game/script/host.ts";
import { toLuaTable, type LuaValue } from "@game/lib/lua/index.ts";
import { BALANCE } from "../../engine/game/tuning.ts";
import type { Difficulty } from "@game/core";

/** Bit-for-bit, not `toBeCloseTo`: the two paths do the same arithmetic in the
 * same order, so any difference at all is a port that drifted. */
const same = (a: number, b: number, where: string) => {
  expect(a, where).toBe(b);
};

/**
 * Call a hook and compare the SCRIPT's answer with `reference` — which is the
 * exact arithmetic the binding carries as its fallback.
 *
 * Passing `reference` as the fallback too is deliberate: if the script ever
 * stops resolving, this asserts `reference() === reference()` and would pass
 * for the wrong reason, which is why "resolves every hook to a script" above
 * runs first and is not optional.
 */
const agrees = (
  hook: string,
  args: LuaValue[],
  reference: () => number,
  where: string,
) => {
  same(numberHook(hook, args, reference), reference(), `${hook} ${where}`);
};

describe("the shipped scripts are actually the ones running", () => {
  it("ships a file for every script the hook catalog names", () => {
    for (const id of SCRIPT_IDS) {
      expect(GENERATED_SCRIPTS[id], `content/scripts/${id}.lua`).toBeDefined();
    }
  });

  it("resolves every hook to a script", () => {
    // If this fails, every parity check below is comparing the fallback with
    // itself and proving nothing.
    for (const { hook } of HOOKS) {
      expect(hookIsScripted(hook), hook).toBe(true);
    }
  });
});

describe("progression.lua", () => {
  const RUNGS: (Difficulty | undefined)[] = [
    undefined,
    "easy",
    "medium",
    "hard",
    "nightmare",
    "jesus",
  ];

  it("xp_to_level_up matches across every level and rung", () => {
    for (let level = 1; level <= LEVELING.maxLevel + 2; level++) {
      for (let tier = 0; tier <= 2; tier++) {
        for (const curveXp of [1, 250, 100_000]) {
          agrees(
            "xp_to_level_up",
            [level, curveXp, tier],
            () => {
              const over = level - LEVELING.endgameSteepenFrom;
              const steepen =
                over <= 0
                  ? 1
                  : Math.pow(
                      1 +
                        Math.max(
                          0,
                          LEVELING.endgameSteepenRate * BALANCE.endgameSteepen,
                        ),
                      over,
                    );
              const cost =
                tier === 0
                  ? 1
                  : Math.pow(
                      1 +
                        Math.max(
                          0,
                          LEVELING.tierLevelCostStep * BALANCE.levelingSlowdown,
                        ),
                      tier,
                    );
              return Math.round(curveXp * steepen * cost);
            },
            `(${level}, ${curveXp}, ${tier})`,
          );
        }
      }
    }
    for (const rung of RUNGS) {
      const scripted = xpToLevelUp(40, rung);
      expect(Number.isInteger(scripted), `integer @${rung}`).toBe(true);
    }
    // The curve is monotone in the rung: a deeper tier never costs less.
    expect(xpToLevelUp(40, "jesus")).toBeGreaterThanOrEqual(
      xpToLevelUp(40, "easy"),
    );
    // …and level 1 is the cheapest ding.
    expect(xpToLevelUp(1)).toBeLessThan(xpToLevelUp(LEVELING.maxLevel - 1));
  });

  it("mob_xp matches the reference formula over the level grid", () => {
    for (let mlvl = 1; mlvl <= 99; mlvl += 3) {
      for (let hero = 1; hero <= 99; hero += 3) {
        const baseLevel = Math.min(
          Math.max(1, mlvl),
          Math.max(1, hero) + LEVELING.xpAboveClampLevels,
        );
        const diff = Math.max(1, mlvl) - Math.max(1, hero);
        const rest = Math.max(0, BALANCE.restXp);
        const mult =
          diff >= 0
            ? Math.min(
                LEVELING.xpAboveMaxMult,
                1 + diff * LEVELING.xpAbovePlayerPerLevel * rest,
              )
            : Math.max(0, 1 + diff * LEVELING.xpBelowPlayerPerLevel * rest);
        same(
          mobLevelXp(mlvl, hero),
          LEVELING.refMobHp *
            Math.pow(1 + LEVELING.mobXpGrowthPerLevel, baseLevel - 1) *
            LEVELING.xpPerHp *
            mult,
          `mob_xp(${mlvl}, ${hero})`,
        );
      }
    }
  });

  it("mob_xp keeps the rules the curve is calibrated on", () => {
    // A mob AT the hero's level is neutral — the reference minion the whole
    // kills-per-level table is authored against.
    for (const l of [1, 10, 40, 99]) {
      same(mobLevelXp(l, l), mobLevelXp(l, l), `neutral(${l})`);
    }
    // The GREY mob pays nothing…
    const grey = Math.ceil(1 / LEVELING.xpBelowPlayerPerLevel) + 1;
    expect(mobLevelXp(1, 1 + grey)).toBe(0);
    // …and a far-above mob's premium is bounded, never compounding.
    expect(mobLevelXp(99, 10)).toBeLessThan(mobLevelXp(10, 10) * 100);
  });

  it("xp_cap_multiplier matches, and stays a slope rather than a wall", () => {
    for (let level = 1; level <= 99; level++) {
      for (const cap of [16, 40, 60, 99]) {
        const over = level - (cap - XP_CAP.fadeLevels);
        const expected =
          over <= 0
            ? 1
            : Math.max(XP_CAP.floor, Math.pow(XP_CAP.softCapDecay, over));
        same(xpCapMultiplier(level, cap), expected, `cap(${level}, ${cap})`);
      }
    }
    // Never zero: an outgrown map still creeps forward.
    expect(xpCapMultiplier(99, 16)).toBeGreaterThan(0);
  });

  it("stat_diminish matches, and is linear below the cap", () => {
    for (let level = 1; level <= 99; level += 2) {
      const cap = statCap(level);
      for (const points of [0, 1, cap - 1, cap, cap + 1, cap + 50, 1000]) {
        const expected =
          points <= cap
            ? points
            : cap + (points - cap) / (1 + STATS.statTaper * (points - cap));
        same(
          diminishStat(points, level),
          expected,
          `diminish(${points}, ${level})`,
        );
      }
      // Chosen points up to the cap pay their full raw value.
      same(diminishStat(cap, level), cap, `linear(${level})`);
    }
  });
});

describe("menace.lua", () => {
  it("mob_hp_level_factor matches, including past the knee", () => {
    for (let level = -5; level <= 140; level++) {
      const knee = MENACE.mobHpGrowthKnee;
      const g = MENACE.mobHpGrowthPerLevel;
      const base = MENACE.mobHpBase;
      const expected =
        level <= knee
          ? base * Math.pow(g, level - 1)
          : base *
            Math.pow(g, knee - 1) *
            Math.pow(1 + (g - 1) * MENACE.mobHpGrowthTailFactor, level - knee);
      same(mobHpLevelFactor(level), expected, `hpFactor(${level})`);
    }
  });

  it("mob_hp_level_factor keeps hits-to-kill climbing, then eases", () => {
    const early = mobHpLevelFactor(11) / mobHpLevelFactor(10);
    const late = mobHpLevelFactor(91) / mobHpLevelFactor(90);
    expect(early).toBeGreaterThan(1);
    expect(late).toBeGreaterThan(1);
    // Past the knee the rate is a fraction of itself — the endgame plateau.
    expect(late).toBeLessThan(early);
  });

  it("mob_level matches the reference over the offset/band grid", () => {
    for (const offset of [-3, -1, 0, 2, 5]) {
      for (const [min, max] of [
        [undefined, undefined],
        [1, 40],
        [12, 60],
        [30, undefined],
        [undefined, 99],
      ] as [number | undefined, number | undefined][]) {
        for (let hero = 1; hero <= 99; hero += 2) {
          agrees(
            "mob_level",
            [hero, offset, min, max],
            () =>
              Math.max(
                1,
                Math.min(
                  max ?? Infinity,
                  Math.max(min ?? 1, Math.round(hero + offset)),
                ),
              ),
            `(${hero}, ${offset}, ${min}, ${max})`,
          );
        }
      }
    }
  });

  it("mob_level stays inside each rung's band", () => {
    for (const difficulty of [
      "easy",
      "medium",
      "hard",
      "nightmare",
      "jesus",
    ] as Difficulty[]) {
      for (let hero = 1; hero <= 99; hero++) {
        const level = mobLevelFor(hero, difficulty);
        expect(Number.isInteger(level), `${difficulty}@${hero}`).toBe(true);
        expect(level).toBeGreaterThanOrEqual(1);
      }
      // Monotone in the hero's level: the horde never scales DOWN as he grows.
      for (let hero = 2; hero <= 99; hero++) {
        expect(mobLevelFor(hero, difficulty)).toBeGreaterThanOrEqual(
          mobLevelFor(hero - 1, difficulty),
        );
      }
    }
  });

  it("overkill_efficiency matches, and is the anti-farming hyperbola", () => {
    for (const maxHp of [0, 1, 10, 250, 5000]) {
      for (const damage of [0, 1, 9, 10, 20, 30, 99999]) {
        const expected = maxHp <= 0 || damage <= maxHp ? 1 : maxHp / damage;
        same(
          overkillEfficiency(damage, maxHp),
          expected,
          `overkill(${damage}, ${maxHp})`,
        );
      }
    }
    // A fair kill is worth full value; twice the health pays half.
    same(overkillEfficiency(100, 100), 1, "exact");
    same(overkillEfficiency(200, 100), 0.5, "double");
    same(overkillEfficiency(300, 100), 1 / 3, "triple");
  });
});

describe("combat.lua", () => {
  it("mob_armor_reduction matches the reference over the level/bonus grid", () => {
    for (const bonus of [0, 0.02, 0.05, 0.1, 0.15]) {
      for (let mlvl = -3; mlvl <= 120; mlvl++) {
        agrees(
          "mob_armor_reduction",
          [mlvl, bonus],
          () => {
            const t = Math.min(
              1,
              Math.max(0, (Math.max(1, mlvl) - 1) / (LEVELING.maxLevel - 1)),
            );
            return Math.max(
              0,
              Math.min(
                MOB_ARMOR.maxReduction,
                (MOB_ARMOR.maxLevelReduction * t + bonus) * BALANCE.mobArmor,
              ),
            );
          },
          `(${mlvl}, ${bonus})`,
        );
      }
    }
  });

  it("mob_armor_reduction stays inside its bounds on every rung", () => {
    for (const difficulty of [
      "easy",
      "medium",
      "hard",
      "nightmare",
      "jesus",
    ] as Difficulty[]) {
      for (let mlvl = -3; mlvl <= 120; mlvl++) {
        const reduction = mobArmorReduction(mlvl, difficulty);
        expect(reduction).toBeGreaterThanOrEqual(0);
        expect(reduction).toBeLessThanOrEqual(MOB_ARMOR.maxReduction);
      }
      // The ramp rises with the mob's level and never reaches immunity.
      expect(mobArmorReduction(99, difficulty)).toBeGreaterThan(
        mobArmorReduction(1, difficulty),
      );
      expect(mobArmorReduction(999, difficulty)).toBeLessThan(1);
    }
    // A level-1 mob on the gentlest rung shrugs off essentially nothing.
    expect(mobArmorReduction(1, "easy")).toBeCloseTo(0, 6);
  });

  it("mob_armor_reduction reaches the authored ceiling at the level cap", () => {
    // The ramp is defined to hit `maxLevelReduction` exactly at the cap, plus
    // the rung's flat bonus — the number the whole late game is balanced on.
    const atCap = mobArmorReduction(LEVELING.maxLevel, "easy");
    expect(atCap).toBeCloseTo(
      MOB_ARMOR.maxLevelReduction * BALANCE.mobArmor,
      6,
    );
  });
});

describe("loot.lua", () => {
  const SATURATION = LOOT.mfSaturation as Record<string, number | undefined>;
  const TIERS = ["magic", "rare", "unique", "legendary", "artifact"];
  const NAMED = new Set(["unique", "legendary", "artifact"]);

  const mfFactor = (tier: string, mf: number) => {
    if (mf <= 0) return 1;
    const cap = SATURATION[tier];
    return cap === undefined ? 1 + mf : 1 + (cap * mf) / (cap + mf);
  };

  it("drop_chance matches over the luck and difficulty grid", () => {
    for (const bonus of [0, 0.01, 0.05]) {
      for (const luck of [0, 1, 17, 250]) {
        agrees(
          "drop_chance",
          [bonus, luck],
          () =>
            (LOOT.dropChance + bonus + luck * STATS.dropChancePerLuck) *
            BALANCE.dropRate,
          `(${bonus}, ${luck})`,
        );
      }
    }
  });

  it("magic_find_factor matches, and saturates on the rare tiers", () => {
    for (const tier of TIERS) {
      for (const mf of [0, 1, 50, 400, 10_000]) {
        agrees(
          "magic_find_factor",
          [tier, mf],
          () => mfFactor(tier, mf),
          `${tier}@${mf}`,
        );
      }
    }
    // `magic` has no saturation entry, so it is 1 + mf however high mf goes…
    expect(SATURATION.magic).toBeUndefined();
    expect(mfFactor("magic", 10_000)).toBe(10_001);
    // …while a saturating tier approaches its cap and never passes it.
    expect(mfFactor("rare", 1e9)).toBeLessThan(1 + (SATURATION.rare ?? 0));
  });

  it("tier_chance matches over the whole per-kill grid", () => {
    for (const tier of TIERS) {
      for (const depth of [0, 3, 25]) {
        for (const tierBonus of [0, 0.05]) {
          for (const plainMinion of [true, false]) {
            for (const mf of [0, 120]) {
              for (const overCapMult of [1, 3]) {
                const ctx = {
                  depth,
                  difficulty_bonus: 0.01,
                  role_bonus: 0.002,
                  tier_bonus: tierBonus,
                  named_mult: 2,
                  plain_minion: plainMinion,
                  mf,
                  over_cap_mult: overCapMult,
                };
                agrees(
                  "tier_chance",
                  [tier, toLuaTable(ctx)],
                  () => {
                    const named = NAMED.has(tier);
                    let base =
                      LOOT.rarityBase[tier as keyof typeof LOOT.rarityBase] +
                      LOOT.raritySlope[tier as keyof typeof LOOT.raritySlope] *
                        depth +
                      0.01 +
                      0.002;
                    if (named) {
                      base *= 2;
                      if (plainMinion) base *= LOOT.minionNamedMult;
                    } else base += tierBonus;
                    if (base <= 0) return 0;
                    let chance =
                      base * mfFactor(tier, mf) * BALANCE.gearQuality;
                    if (named) chance *= overCapMult;
                    return Math.min(LOOT.rarityChanceMax, chance);
                  },
                  `${tier} d${depth} b${tierBonus} p${plainMinion} mf${mf} x${overCapMult}`,
                );
              }
            }
          }
        }
      }
    }
  });

  it("tier_chance returns 0 for a tier it will not offer, spending no draw", () => {
    // A zero is how the script says "skip this tier"; the caller reads it and
    // does NOT touch the rng, which is what keeps a seeded run's draw sequence
    // stable when a mod turns a tier off.
    const ctx = toLuaTable({
      depth: 0,
      difficulty_bonus: -1,
      role_bonus: 0,
      tier_bonus: 0,
      named_mult: 1,
      plain_minion: false,
      mf: 0,
      over_cap_mult: 1,
    });
    expect(numberHook("tier_chance", ["rare", ctx], () => -1)).toBe(0);
  });
});

describe("combat.lua — weapon_damage", () => {
  it("matches the reference over the build grid", () => {
    for (const damageStat of ["strength", "intelligence", "dexterity"]) {
      for (const stat of [0, 12, 250]) {
        for (const damagePct of [0, 0.35]) {
          for (const enhanced of [1, 1.8]) {
            for (const quality of [0.7, 1, 1.4]) {
              for (const surge of [1, 2]) {
                const ctx = {
                  base: 17,
                  damage_stat: damageStat,
                  stat,
                  damage_pct: damagePct,
                  enhanced,
                  quality,
                  surge,
                };
                agrees(
                  "weapon_damage",
                  [toLuaTable(ctx)],
                  () => {
                    const perPoint =
                      (
                        STATS.damageBonusPerPoint as Record<
                          string,
                          number | undefined
                        >
                      )[damageStat] ?? 0;
                    return (
                      17 *
                      (1 + stat * perPoint + damagePct) *
                      enhanced *
                      quality *
                      surge
                    );
                  },
                  `${damageStat} s${stat} p${damagePct} e${enhanced} q${quality} x${surge}`,
                );
              }
            }
          }
        }
      }
    }
  });

  it("leaves the catalog number alone for a bare hero with a white weapon", () => {
    // THE CATALOG NUMBER IS THE TRUE NUMBER: no stat, no affix, no roll, no
    // surge means the weapon swings exactly what its def authored.
    const ctx = toLuaTable({
      base: 17,
      damage_stat: "strength",
      stat: 0,
      damage_pct: 0,
      enhanced: 1,
      quality: 1,
      surge: 1,
    });
    expect(numberHook("weapon_damage", [ctx], () => -1)).toBe(17);
  });
});
