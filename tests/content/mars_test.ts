// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Level 3 — MARS: the secret colony. Rovers work the dust outside, robots
// and the fembot line staff the base inside (a tile-zones split at the dome
// wall), three tech billionaires carry the plot, and THE FOUNDER — the game's
// first FLEEING boss — escapes through a rift instead of dying.

import { describe, expect, it } from "vitest";

import {
  createGame,
  deriveArrivalLoadout,
  dialogueContent,
  enemyDef,
  LEVEL_ORDER,
  LEVELS,
  OBSTACLES,
  step,
  storyItemDef,
  THOUGHT_DEFS,
  totalArmor,
  type GameEvent,
  type GameState,
} from "@game/core";
import {
  clearStage,
  DT,
  idle,
  makeEnemy,
  SEED,
  settleBossRite,
  startGame,
} from "../helpers.ts";

const MARS = LEVELS.mars!;

describe("MARS level def", () => {
  it("is story level 3, after the moon", () => {
    expect(MARS.index).toBe(3);
    expect(LEVEL_ORDER[2]).toBe("mars");
    const state = startGame(SEED, "mars");
    expect(state.level.biome).toBe("mars");
    expect(state.level.foes).toBe("MACHINES");
  });

  it("fields the colony's machines: rovers outside, robots and fembots inside", () => {
    const minionIds = MARS.spawns
      .filter((s) => "band" in s)
      .map((s) => s.enemy)
      .sort();
    expect(minionIds).toEqual([
      "fembot",
      "mining_rover",
      "scout_rover",
      "servo_bot",
      "successor",
    ]);

    // The desert-to-base transition: rovers band the near (outdoor) half,
    // fembots the far (indoor) half, matching the tile-zone split.
    const rovers = MARS.spawns.find(
      (s) => s.enemy === "scout_rover" && "band" in s,
    )!;
    const fembots = MARS.spawns.find(
      (s) => s.enemy === "fembot" && "band" in s,
    )!;
    expect("band" in rovers && rovers.band[1]).toBeLessThan(
      "band" in fembots ? fembots.band[0] + 0.5 : 0,
    );

    // The base interior gets its own ground: a tile zone starting at the
    // dome wall swaps red regolith for deck plating.
    expect(MARS.tiles.zones).toHaveLength(1);
    expect(MARS.tiles.zones![0]!.rect.x).toBe(1560);
    expect(MARS.tiles.zones![0]!.ground.common).toBe("deck_0");
  });

  it("pins the four elites along the route and THE FOUNDER in the boss wing", () => {
    const elites = MARS.spawns
      .filter((s) => enemyDef(s.enemy).role === "elite")
      .map((s) => s.enemy)
      .sort();
    expect(elites).toEqual([
      "successor_prime",
      "the_indexer",
      "the_seed",
      "the_vendor",
    ]);

    const state = startGame(SEED, "mars");
    const boss = state.enemies.find((e) => enemyDef(e.defId).role === "boss")!;
    expect(boss.defId).toBe("the_founder");
  });

  it("locks the TERRARIUM behind THE SEED's keycard", () => {
    expect(MARS.doors!.some((d) => d.id === "terrarium")).toBe(true);
    expect(storyItemDef("keycard_terrarium").unlocks).toBe("terrarium");
    // ...and the keycard is really in SEAL's pockets.
    expect(enemyDef("the_seed").loot!.storyItems).toContain(
      "keycard_terrarium",
    );
    // The tribute schedule waits inside the locked room.
    expect(
      MARS.placedItems!.some(
        (p) => p.kind === "story" && p.defId === "tribute_schedule",
      ),
    ).toBe(true);
  });

  it("wires the rover and fembot first-kill monologues", () => {
    for (const trigger of MARS.firstKillThoughts!) {
      expect(THOUGHT_DEFS[trigger.thought], trigger.thought).toBeDefined();
    }
    expect(MARS.firstKillThoughts!.map((t) => t.enemy).sort()).toEqual([
      "fembot",
      "scout_rover",
    ]);
  });

  it("keeps every hop viable: jumpable obstacles clear under Mars gravity", () => {
    const peak = 240 ** 2 / (2 * MARS.gravity);
    expect(peak).toBeGreaterThan(OBSTACLES.clearHeight + 10);
  });

  it("derives a seasoned dev-jump loadout: moon kit, level from the campaign", () => {
    // With nothing banked (dev jumps, playtests) the derived stand-in makes
    // arriving on Mars realistic; a real campaign passes the ACTUAL loadout
    // banked by the moon's victory instead (see pwa progress.ts).
    const loadout = deriveArrivalLoadout("mars", "medium");
    expect(loadout).not.toBeNull();
    // Two cleared levels behind him: he arrives leveled, not a rookie (the
    // WoW-paced opening plateau prices early levels steeply, so the
    // roster-derived figure sits low — a floor, not an exact figure).
    expect(loadout!.level).toBeGreaterThan(2);
    // ...carrying the moon's signature kit and a couple of its powerups.
    expect(loadout!.equipment.weapon.defId).toBe("moons_blade");
    // The moon's best wardrobe, one piece per body slot.
    expect(loadout!.equipment.head?.defId).toBe("apollo_visor");
    expect(loadout!.equipment.chest?.defId).toBe("micrometeoroid_vest");
    expect(loadout!.equipment.legs?.defId).toBe("pressure_trousers");
    expect(loadout!.equipment.feet?.defId).toBe("moon_boots");
    // The MOON CHARM is a TRINKET: it pays out from the bag, so the derived
    // kit hands it over carried rather than worn.
    expect(loadout!.inventory[0]?.defId).toBe("moon_charm");
    expect(loadout!.heldAbilities).toEqual(["fire_orbs", "storm_cell"]);

    // And a run dressed in it arrives rested, armor worn.
    const state = createGame(SEED, "mars", "medium", loadout!);
    expect(state.players[0].level).toBe(loadout!.level);
    expect(state.players[0].hp).toBe(state.players[0].maxHp);
    expect(totalArmor(state, state.players[0])).toBeGreaterThan(0);
  });
});

describe("THE FOUNDER flees", () => {
  /** Step until THE FOUNDER is off the board, collecting every event seen. */
  function beatMosque(state: GameState): GameEvent[] {
    const seen: GameEvent[] = [];
    for (
      let i = 0;
      i < 300 && state.enemies.some((e) => e.defId === "the_founder");
      i++
    ) {
      step(state, idle, DT);
      seen.push(...state.events);
    }
    // Off the board is no longer the same moment as gone: at the threshold his
    // FLIGHT RITE opens (src/game/boss-death.ts) — he tears the rift open, runs
    // for it, and is spun through — and `bossFled`, the landmark and his
    // parting words all land at the END of that beat.
    seen.push(...settleBossRite(state));
    return seen;
  }

  it("escapes through a rift instead of dying, cowering on the way out", () => {
    const state = startGame(SEED, "mars");
    clearStage(state);
    state.enemies = [];
    state.enemies.push(
      makeEnemy(
        {
          pos: { x: state.players[0].pos.x + 30, y: state.players[0].pos.y },
          hp: 1,
          maxHp: 700,
          powerScaled: true,
          spoke: true, // arrival scene already played; the exit is under test
        },
        "the_founder",
      ),
    );

    const events = beatMosque(state);
    expect(events.some((e) => e.type === "bossFled")).toBe(true);
    expect(events.some((e) => e.type === "bossDefeated")).toBe(false);

    // The rift he zapped away through stays on the board — it is where the
    // hero is headed next.
    const rift = state.landmarks.find((l) => l.kind === "rift");
    expect(rift).toBeDefined();

    // The coward's exit plays through the death-scene box.
    expect(state.dialogue?.source).toEqual({
      kind: "enemyDeath",
      defId: "the_founder",
    });
    expect(dialogueContent(state.dialogue!).pages).toEqual([
      enemyDef("the_founder").lastWords,
    ]);

    // He drops the THE LEGAL DISTINCTION as he bolts. It may land close enough
    // that the hero walks onto it and banks it, so accept it on the ground OR
    // already carried — the guaranteed DROP is what's under test, not where it
    // came to rest.
    const onGround = state.items.some(
      (i) =>
        i.kind === "equipment" && i.equipment.defId === "legal_distinction",
    );
    const carried = state.players[0].inventory.some(
      (e) => e?.defId === "legal_distinction",
    );
    expect(onGround || carried).toBe(true);
  });
});
