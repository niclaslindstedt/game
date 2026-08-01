// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE GARAGE — the hub's wiring. The contract: home is STATIC (one pinned
// carve, whatever the seed or the size setting), nothing hostile ever stands
// in it and the run never ends on its own, the trader is parked at his
// counter from the first tick, the three doors stand where their travelDoors
// point, and the RIFT SEAM's key — THE FOUNDER's RIFT CREATOR — really drops
// where he says "keep the rift".

import { describe, expect, it } from "vitest";

import {
  createGame,
  dismissIntro,
  enemyDef,
  LEVEL_ORDER,
  LEVELS,
  MAP_BLUEPRINTS,
  resolveLevelDef,
  SECRET_LEVEL_ORDER,
  skipCutscene,
  step,
  storyItemDef,
  thoughtDef,
  type GameState,
} from "@game/core";

import { DT, idle, SEED } from "../helpers.ts";

const garage = LEVELS.garage!;
const BLUEPRINT = MAP_BLUEPRINTS.garage!;
const carved = resolveLevelDef("garage", SEED, "medium");

function startHome(): GameState {
  const state = createGame(SEED, "garage", "medium");
  skipCutscene(state);
  dismissIntro(state);
  return state;
}

function run(state: GameState, ticks: number): void {
  for (let i = 0; i < ticks; i++) step(state, idle, DT);
}

describe("the venue", () => {
  it("is registered off-campaign, ahead of the numbered levels", () => {
    expect(SECRET_LEVEL_ORDER).toContain("garage");
    expect(LEVEL_ORDER).not.toContain("garage");
    // Rides beside the campaign's opener, the way the bunker rides beside
    // Boot Hill — a secret's index names its campaign neighbour.
    expect(garage.index).toBe(1);
    expect(garage.objective.type).toBe("hub");
  });

  it("is STATIC: one carve, whatever the seed or the size", () => {
    const a = resolveLevelDef("garage", 11, "small");
    const b = resolveLevelDef("garage", 999_999, "large");
    expect(JSON.stringify(a)).toEqual(JSON.stringify(b));
    expect(BLUEPRINT.carveSeed).toBeDefined();
  });

  it("has no horde at all, and the run never ends on its own", () => {
    expect(carved.spawns).toHaveLength(0);
    expect(carved.spawners ?? []).toHaveLength(0);
    expect(carved.waves).toBeUndefined();
    expect(carved.packs ?? []).toHaveLength(0);
    const state = startHome();
    expect(state.enemies.filter((e) => e.hp > 0)).toHaveLength(0);
    run(state, 600);
    expect(state.phase).toBe("playing");
    expect(state.victoryCountdownMs).toBeNull();
  });

  it("plays its own sanctuary score", () => {
    expect(garage.music).toBe("bench_light");
  });
});

describe("the counter", () => {
  it("parks the trader, revealed and stocked from the first tick", () => {
    expect(garage.merchant?.parked).toBe(true);
    const state = startHome();
    expect(state.merchant.discovered).toBe(true);
    expect(state.merchant.stock.length).toBeGreaterThan(0);
    expect(state.merchant.pos).toEqual(carved.merchantSpawns?.[0]);
    // Parked is scene-free: standing beside him raises no dialogue.
    state.players[0].pos = { ...state.merchant.pos };
    run(state, 120);
    expect(state.phase).toBe("playing");
    expect(state.merchant.moving).toBe(false);
  });
});

describe("the doors", () => {
  it("declares the car, the rocket and the rift seam, each standing on its landmark", () => {
    const doors = garage.travelDoors ?? [];
    expect(doors.map((d) => d.id).sort()).toEqual([
      "car",
      "rift_seam",
      "rocket",
    ]);
    for (const door of doors) {
      const mark = carved.landmarks.find((l) => l.kind === door.id);
      expect(
        mark,
        `door "${door.id}" has no landmark to stand on`,
      ).toBeDefined();
      for (const dest of door.to) {
        expect(LEVEL_ORDER, `door "${door.id}" → "${dest}"`).toContain(dest);
      }
    }
  });

  it("routes the campaign: car to GOODCO, rocket to the voyages, seam to the deep roads", () => {
    const doorMap = new Map((garage.travelDoors ?? []).map((d) => [d.id, d]));
    expect(doorMap.get("car")?.to).toEqual(["goodco_hq"]);
    expect(doorMap.get("rocket")?.to).toEqual(["moon", "mars"]);
    expect(doorMap.get("rift_seam")?.to).toEqual(["the_rift", "boot_hill"]);
    expect(doorMap.get("rift_seam")?.requires).toBe("rift_creator");
  });

  it("grounds the rocket until the part is home, and names no road while it is", () => {
    const rocket = (garage.travelDoors ?? []).find((d) => d.id === "rocket");
    // The ship is one part short until GOODCO HQ falls, so the tap plays his
    // own read on it rather than a picker (`unready`) — the car and the seam
    // both answer differently and carry none.
    expect(rocket?.unready).toBe("garage_ship_unfinished");
    for (const id of ["car", "rift_seam"]) {
      expect((garage.travelDoors ?? []).find((d) => d.id === id)?.unready).toBe(
        undefined,
      );
    }
    // AND IT SPOILS NOTHING. The whole reason the picker is withheld is that
    // its locked rows name two chapters the player has not reached; a line
    // that named them itself would give the reveal back.
    const said = thoughtDef(rocket!.unready!)
      .pages.flat()
      .join(" ")
      .toUpperCase();
    for (const dest of rocket!.to) {
      const name = LEVELS[dest]!.name.toUpperCase();
      expect(said, `the grounded line names "${name}"`).not.toContain(name);
    }
  });

  it("comes home from every earthside victory (the town loop)", () => {
    expect(LEVELS.goodco_hq!.exitTo).toBe("garage");
    expect(LEVELS.moon!.exitTo).toBe("garage");
    expect(LEVELS.boot_hill!.exitTo).toBe("garage");
    // Mars presses INTO THE RIFT — no way home from the void, which is what
    // the rift creator exists to change.
    expect(LEVELS.mars!.exitTo).toBeUndefined();
    expect(LEVELS.the_rift!.exitTo).toBeUndefined();
  });
});

describe("the rift creator", () => {
  it("is a keepsake with THE FOUNDER's own line behind it", () => {
    const def = storyItemDef("rift_creator");
    expect(def.keepsake).toBe(true);
    expect(def.icon).toBe("icon_rift_creator");
    expect(def.lore.length).toBeGreaterThan(0);
  });

  it("drops where he says KEEP THE RIFT — the rift fight's Founder", () => {
    expect(enemyDef("the_founder_rift").loot?.storyItems).toContain(
      "rift_creator",
    );
  });
});
