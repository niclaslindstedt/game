// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Level 3 — MARS: the secret colony. Rovers work the dust outside, robots
// and the fembot line staff the base inside (a tile-zones split at the dome
// wall), three tech billionaires carry the plot, and ELON MOSQUE — the game's
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
      "optimusk",
      "scout_rover",
      "servo_bot",
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

  it("pins the four elites along the route and MOSQUE in the boss wing", () => {
    const elites = MARS.spawns
      .filter((s) => enemyDef(s.enemy).role === "elite")
      .map((s) => s.enemy)
      .sort();
    expect(elites).toEqual([
      "build_gates",
      "larry_webpage",
      "optimusk_prime",
      "peter_seal",
    ]);

    const state = startGame(SEED, "mars");
    const boss = state.enemies.find((e) => enemyDef(e.defId).role === "boss")!;
    expect(boss.defId).toBe("elon_mosque");
  });

  it("locks the TERRARIUM behind PETER SEAL's keycard", () => {
    expect(MARS.doors!.some((d) => d.id === "terrarium")).toBe(true);
    expect(storyItemDef("keycard_terrarium").unlocks).toBe("terrarium");
    // ...and the keycard is really in SEAL's pockets.
    expect(enemyDef("peter_seal").loot!.storyItems).toContain(
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
    // banked by the moon's victory instead (see website progress.ts).
    const loadout = deriveArrivalLoadout("mars", "medium");
    expect(loadout).not.toBeNull();
    // Two cleared levels behind him: he arrives genuinely leveled...
    expect(loadout!.level).toBeGreaterThan(5);
    // ...carrying the moon's signature kit and a couple of its powerups.
    expect(loadout!.equipment.weapon.defId).toBe("moons_blade");
    // The moon's best wardrobe, one piece per body slot.
    expect(loadout!.equipment.head?.defId).toBe("apollo_visor");
    expect(loadout!.equipment.chest?.defId).toBe("micrometeoroid_vest");
    expect(loadout!.equipment.legs?.defId).toBe("pressure_trousers");
    expect(loadout!.equipment.feet?.defId).toBe("moon_boots");
    expect(loadout!.equipment.charm?.defId).toBe("moon_charm");
    expect(loadout!.heldAbilities).toEqual(["fire_orbs", "storm_cell"]);

    // And a run dressed in it arrives rested, armor worn.
    const state = createGame(SEED, "mars", "medium", loadout!);
    expect(state.player.level).toBe(loadout!.level);
    expect(state.player.hp).toBe(state.player.maxHp);
    expect(totalArmor(state)).toBeGreaterThan(0);
  });
});

describe("ELON MOSQUE flees", () => {
  /** Step until MOSQUE is off the board, collecting every event seen. */
  function beatMosque(state: GameState): GameEvent[] {
    const seen: GameEvent[] = [];
    for (
      let i = 0;
      i < 300 && state.enemies.some((e) => e.defId === "elon_mosque");
      i++
    ) {
      step(state, idle, DT);
      seen.push(...state.events);
    }
    return seen;
  }

  it("escapes through a rift instead of dying, cowering on the way out", () => {
    const state = startGame(SEED, "mars");
    clearStage(state);
    state.enemies = [];
    state.enemies.push(
      makeEnemy(
        {
          pos: { x: state.player.pos.x + 30, y: state.player.pos.y },
          hp: 1,
          maxHp: 700,
          powerScaled: true,
          spoke: true, // arrival scene already played; the exit is under test
        },
        "elon_mosque",
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
      defId: "elon_mosque",
    });
    expect(dialogueContent(state.dialogue!).pages).toEqual([
      enemyDef("elon_mosque").lastWords,
    ]);

    // He drops the NOT-A-FLAMETHROWER as he bolts.
    expect(
      state.items.some(
        (i) =>
          i.kind === "equipment" && i.equipment.defId === "not_a_flamethrower",
      ),
    ).toBe(true);
  });
});
