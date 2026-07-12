// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Level-locked WORLD DROPS (config WORLD_DROP, loot.ts `maybeDropWorldUnique`):
// any enemy on a level whose `loot.worldUniques` lists relics for the rung can
// drop each one, at a chance set purely by the enemy's ROLE — a boss magnitudes
// likelier than trash, so boss runs are the efficient farm — and only once the
// hero passes the level gate. Exercised on synthetic fixtures (a fixture level +
// a fixture unique) so the rule survives content deletion.

import { describe, expect, it } from "vitest";

import { registerDefs, WORLD_DROP } from "@game/core";
import type { GameState } from "@game/core";
// Engine-internal kill funnel — the door every drop walks through.
import { hitEnemy } from "../../src/game/loot.ts";

import { FIX_LEVEL } from "./fixtures.ts";
import { makeEnemy, startGame } from "./helpers.ts";

// A fixture unique on a fixture head base that is NOT in the level's gearPool
// (["test_vest", "test_charm"]), so an item minted onto `test_helmet` can only
// be this world relic — never a regular pool drop.
const WORLD_RELIC = {
  id: "test_world_relic",
  name: "TEST WORLD RELIC",
  base: "test_helmet",
  slot: "head" as const,
  ilvl: 6,
  bonuses: [{ kind: "stat" as const, stat: "intelligence" as const, value: 3 }],
  lore: "A TEST RELIC THAT RAINS FROM THE WHOLE FLOOR.",
};

// A fixture level that lists the relic as a world drop on the default rung
// (`createGame` defaults to "medium"), so any enemy on it can roll it.
const WORLD_LEVEL = {
  ...FIX_LEVEL,
  id: "test_world_level",
  loot: { ...FIX_LEVEL.loot, worldUniques: { medium: ["test_world_relic"] } },
};

function installWorld(): void {
  registerDefs({
    levels: { test_world_level: WORLD_LEVEL },
    uniques: { test_world_relic: WORLD_RELIC },
  });
}

/** Kill a lone role-typed mob with a pinned rng, at a chosen hero level, and
 * report whether the world relic dropped. */
function killAndCheckRelic(
  defId: string,
  heroLevel: number,
  rng: () => number,
): boolean {
  installWorld();
  const state: GameState = startGame(42, "test_world_level");
  state.player.level = heroLevel;
  const mob = makeEnemy({ pos: { x: 500, y: 500 }, hp: 1, mlvl: 50 }, defId);
  mob.powerScaled = true; // keep the staged mlvl — no re-stamp on engage
  state.enemies = [mob];
  state.items = [];
  state.rng = rng;
  hitEnemy(state, mob, 99_999);
  return state.items.some(
    (i) => i.kind === "equipment" && i.equipment.defId === "test_helmet",
  );
}

describe("world drops — role-scaled, minion-gated", () => {
  it("drops from a boss when the roll clears the boss chance", () => {
    // boss chance is 3%; a 2% roll clears it.
    expect(WORLD_DROP.chanceByRole.boss).toBeGreaterThan(0.02);
    expect(killAndCheckRelic("test_boss", 40, () => 0.02)).toBe(true);
  });

  it("does NOT drop from a minion on the same roll — trash is magnitudes rarer", () => {
    // The same 2% roll that a boss pays out on fails a minion (0.015%), so the
    // relic favors boss/elite runs by orders of magnitude.
    expect(WORLD_DROP.chanceByRole.minion).toBeLessThan(0.02);
    expect(killAndCheckRelic("test_minion", 40, () => 0.02)).toBe(false);
  });

  it("a minion CAN drop it on a hot enough roll (the wild lottery ticket)", () => {
    // Hero level 40 is above the medium gate, so the minion lottery is open.
    expect(killAndCheckRelic("test_minion", 40, () => 0.00005)).toBe(true);
  });

  it("elites sit between: they pay out where a minion would not", () => {
    const between =
      (WORLD_DROP.chanceByRole.elite + WORLD_DROP.chanceByRole.minion) / 2;
    expect(killAndCheckRelic("test_elite", 40, () => between)).toBe(true);
    expect(killAndCheckRelic("test_minion", 40, () => between)).toBe(false);
  });

  // The fixture level lists its relic on the "medium" rung, so the medium gate
  // is the one that governs the MINION lottery (elites/bosses ignore it).
  const MEDIUM_GATE = WORLD_DROP.minPlayerLevel.medium ?? 0;

  it("minion lottery stays shut below the level gate", () => {
    expect(
      killAndCheckRelic("test_minion", MEDIUM_GATE - 1, () => 0.00005),
    ).toBe(false);
  });

  it("minion lottery opens exactly at the gate", () => {
    expect(killAndCheckRelic("test_minion", MEDIUM_GATE, () => 0.00005)).toBe(
      true,
    );
  });

  it("elites and bosses IGNORE the gate — relics drop during the campaign", () => {
    // Well below the minion gate, a set-piece kill still pays out.
    expect(killAndCheckRelic("test_boss", MEDIUM_GATE - 1, () => 0.02)).toBe(
      true,
    );
    expect(killAndCheckRelic("test_elite", MEDIUM_GATE - 1, () => 0.01)).toBe(
      true,
    );
  });

  it("a level with no world table never drops one, even for a high-level boss", () => {
    // The stock fixture level lists no worldUniques.
    registerDefs({
      levels: { test_plain_level: { ...FIX_LEVEL, id: "test_plain_level" } },
      uniques: { test_world_relic: WORLD_RELIC },
    });
    const state = startGame(42, "test_plain_level");
    state.player.level = 50;
    const boss = makeEnemy(
      { pos: { x: 500, y: 500 }, hp: 1, mlvl: 50 },
      "test_boss",
    );
    boss.powerScaled = true;
    state.enemies = [boss];
    state.items = [];
    state.rng = () => 0;
    hitEnemy(state, boss, 99_999);
    expect(
      state.items.some(
        (i) => i.kind === "equipment" && i.equipment.defId === "test_helmet",
      ),
    ).toBe(false);
  });
});
