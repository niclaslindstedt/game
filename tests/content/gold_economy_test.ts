// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE SHIPPED ROSTER'S PURSES — the content half of the gold faucet.
//
// `tests/engine/gold_test.ts` pins the RULES on synthetic defs; this pins what
// the rules come out at when they are applied to the cast this game actually
// ships. Three questions, and each of them has already been the wrong answer at
// least once during authoring:
//
//   1. Does every BOSS pay? A boss whose whole roster is machines or hauntings
//      falls through the humanoid rule and silently drops nothing — a hole a
//      player reads as a bug, at the one fight per map where the payout is
//      supposed to land.
//   2. Does any ONE body dwarf the rest? The multipliers compound
//      (`roleMult × wealth`), and an earlier tuning had one boss kill paying
//      3,500 minions — a coin economy whose only verb was "kill the man at the
//      end", with a whole map's trash rounding to nothing beside him.
//   3. Is a `wealth:` still attached to somebody the story calls rich? The
//      field is the satire's own punchline told in loot, so it wants to stay on
//      the founders and the investors rather than drifting onto the interns.
//
// It is content-suite rather than engine-suite for the reason every suite in
// this directory is: a sequel deletes this roster and rewrites this file.

import { describe, expect, it } from "vitest";

import {
  carriesGold,
  ENEMY_DEFS,
  expectedGold,
  GOLD,
  goldValue,
} from "@game/core";

/** The mid-campaign reference level every figure below is compared at, so the
 * comparison is between BODIES rather than between the depths they turn up at. */
const AT_MLVL = 30;

const DEFS = Object.values(ENEMY_DEFS);

describe("every set piece pays", () => {
  it("gives every BOSS a purse", () => {
    // Most of this game's bosses are machines, and the humanoid rule would
    // close their pockets. Each one therefore carries an authored `wealth:` —
    // and this is the test that notices when a NEW boss forgets to.
    const broke = DEFS.filter((d) => d.role === "boss" && !carriesGold(d));
    expect(
      broke.map((d) => d.id),
      "a boss that drops no gold reads as a bug at the one fight per map " +
        "where the payout is supposed to land — give it a `wealth:`",
    ).toEqual([]);
  });

  it("pays a boss more than an elite, and an elite more than the horde", () => {
    const at = (role: string) =>
      DEFS.filter((d) => d.role === role && carriesGold(d)).map((d) =>
        expectedGold(d, AT_MLVL),
      );
    const minions = at("minion");
    const elites = at("elite");
    const bosses = at("boss");
    expect(minions.length).toBeGreaterThan(0);
    expect(elites.length).toBeGreaterThan(0);
    expect(bosses.length).toBeGreaterThan(0);
    const median = (xs: number[]) =>
      [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)] as number;
    expect(median(elites)).toBeGreaterThan(median(minions) * 4);
    expect(median(bosses)).toBeGreaterThan(median(elites));
  });
});

describe("no single body eats the whole economy", () => {
  it("keeps the richest corpse a payday rather than the map itself", () => {
    // The yardstick: a PLAIN body — no rarity tier, no hellborn gate, no
    // authored wealth — so the comparison is against the rank and file rather
    // than against another multiplier.
    const plain = DEFS.find(
      (d) =>
        d.role === "minion" &&
        carriesGold(d) &&
        d.wealth === undefined &&
        !d.rarity &&
        !d.hellborn,
    );
    expect(plain).toBeDefined();
    const trash = goldValue(plain as (typeof DEFS)[number], AT_MLVL);
    const richest = Math.max(...DEFS.map((d) => goldValue(d, AT_MLVL)));

    // A map is a few hundred rank-and-file kills, of which a fifth pay — call
    // it sixty purses. THAT is the number the richest single body has to be
    // weighed against, because it is what the compounded `roleMult × wealth`
    // is actually competing with.
    const mapTrash = 60 * trash;
    const share = richest / mapTrash;
    // It must be a genuine payday: a billionaire boss worth a tenth of the
    // trash you walked past to reach him is not the joke the field is for.
    expect(share).toBeGreaterThan(0.5);
    // …and it must not BE the map. An earlier tuning (boss 70 × wealth 50) put
    // this at forty: one kill paid forty maps of trash, every other source
    // rounded to nothing, and the coin economy's only verb was "kill the man at
    // the end".
    expect(
      share,
      "the compounded roleMult × wealth ceiling has drifted — one kill now " +
        "out-pays a map's entire rank and file several times over",
    ).toBeLessThan(6);
  });
});

describe("wealth stays on the people the story calls rich", () => {
  it("puts the campaign's biggest purse on THE FOUNDER", () => {
    const founders = DEFS.filter((d) => d.id.startsWith("the_founder"));
    expect(founders.length).toBeGreaterThan(0);
    const top = Math.max(...DEFS.map((d) => d.wealth ?? 1));
    for (const f of founders) expect(f.wealth).toBe(top);
  });

  it("leaves the rank and file's pockets ordinary", () => {
    // The joke only lands if the guard, the clerk and the intern are carrying a
    // shift's pay while the man who owns the building is carrying the building.
    for (const id of ["intern", "guard", "soldier", "night_shift_temp"]) {
      const d = ENEMY_DEFS[id];
      if (!d) continue;
      expect(d.wealth, `${id} should carry an ordinary pocket`).toBeUndefined();
    }
  });

  it("never authors a negative or absurd wealth", () => {
    for (const d of DEFS) {
      if (d.wealth === undefined) continue;
      expect(d.wealth, d.id).toBeGreaterThanOrEqual(0);
      // Past this the compounded ceiling above is the thing that breaks, and
      // it breaks silently — a number here is the earlier, clearer failure.
      expect(d.wealth, d.id).toBeLessThanOrEqual(10);
    }
  });
});

describe("the pile ladder covers what the roster actually drops", () => {
  it("uses every rung across the shipped cast", () => {
    // A ladder whose top two rungs no body in the game ever reaches is two
    // sprites nobody sees; one whose bottom rung is never used means the small
    // finds all read as the same heap.
    const used = new Set<number>();
    for (const d of DEFS) {
      if (!carriesGold(d)) continue;
      for (const mlvl of [5, 20, 40, 70, 95]) {
        const per =
          expectedGold(d, mlvl) /
          Math.max(1, GOLD.piles[d.role]) /
          // Undo the chance: a pile's SIZE is the payout, not the expectation.
          (d.role === "minion" ? GOLD.minionChance : 1);
        const rung = GOLD.pileTiers.findIndex((t) => per >= t.min);
        used.add(rung < 0 ? GOLD.pileTiers.length - 1 : rung);
      }
    }
    expect(used.size).toBe(GOLD.pileTiers.length);
  });
});
