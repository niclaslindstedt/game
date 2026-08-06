// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE GARAGE — the hub's wiring. The contract: home is STATIC (one pinned
// carve, whatever the seed or the size setting), nothing hostile ever stands
// in it and the run never ends on its own, the trader is parked at his
// counter from the first tick, the three doors stand where their travelDoors
// point, and the RIFT SEAM's key — THE FOUNDER's RIFT CREATOR — really drops
// where he says "keep the rift".

import { describe, expect, it } from "vitest";

import {
  advanceDialogue,
  applyRunCommand,
  createGame,
  dismissIntro,
  enemyDef,
  LEVEL_ORDER,
  LEVELS,
  MAP_BLUEPRINTS,
  markThoughtsSeen,
  nightAmount,
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

/** The hub's own place-pinned beats, in authored order. */
const PLACE_BEATS = (garage.placeThoughts ?? []).map((t) => t.thought);

/**
 * A run at home with the opening scenes cleared AND the place-pinned beats
 * already read — which is what a returning player's ledger looks like, and what
 * every assertion below about the run still `playing` needs: the arrival beat
 * lands on the first live tick and would otherwise be the thing the phase is.
 * The beats themselves are tested from a fresh ledger, below.
 */
function startHome(): GameState {
  const state = createGame(SEED, "garage", "medium");
  skipCutscene(state);
  dismissIntro(state);
  markThoughtsSeen(state, PLACE_BEATS);
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

describe("the night", () => {
  it("is the one venue in the game that stands under a sky", () => {
    expect(garage.sky).toBe("earth");
    // The claim the whole feature rests on: nothing else opted in, so no other
    // map in the campaign can be dimmed by an hour on anybody's clock.
    for (const id of [...LEVEL_ORDER, ...SECRET_LEVEL_ORDER]) {
      if (id === "garage") continue;
      expect(LEVELS[id]?.sky, `level "${id}"`).toBeUndefined();
    }
  });

  it("lights the bay as a ROOM — up to its walls, not a pool in the middle", () => {
    const lit = carved.litZones ?? [];
    expect(lit.length).toBe(1);
    // The bay's own cell, and only it: the drive, the lawn and the road are
    // open ground and go dark with the sky.
    const bay = lit[0]!;
    expect(bay.amount).toBeGreaterThan(0.5);
    expect(bay.amount).toBeLessThan(1);
    expect(bay.rect.width).toBeGreaterThan(100);
    // The hero lands in his own garage, so his landing is inside the lit room.
    expect(carved.playerSpawn.x).toBeGreaterThanOrEqual(bay.rect.x);
    expect(carved.playerSpawn.x).toBeLessThanOrEqual(
      bay.rect.x + bay.rect.width,
    );
    expect(carved.playerSpawn.y).toBeGreaterThanOrEqual(bay.rect.y);
    expect(carved.playerSpawn.y).toBeLessThanOrEqual(
      bay.rect.y + bay.rect.height,
    );
  });

  it("flanks the roll-up door with two lamps that are really there", () => {
    const lights = carved.lights ?? [];
    // The yard post on the lawn, the machine at the counter, and one barn
    // light at each end of the door's chain.
    expect(lights.length).toBe(4);
    const door = carved.doors?.find((d) => d.id === "garage_door");
    expect(door).toBeDefined();
    const flanking = carved.landmarks.filter((l) => l.sprite === "wall_lamp");
    expect(
      flanking.length,
      "the roll-up door has no lamps beside it — the drive is dark at night",
    ).toBe(2);
    // One at each END of the chain, and both OUTSIDE the bay — which is the
    // whole point: they are what lights the driveway.
    for (const lamp of flanking) {
      expect(lamp.pos.x).toBeGreaterThan(door!.from.x);
      const clearsOpening =
        lamp.pos.y < door!.from.y || lamp.pos.y > door!.to.y;
      expect(clearsOpening, "a lamp stands in the doorway itself").toBe(true);
    }
    // EVERY pool has something drawn throwing it. A light with no fixture over
    // it reads as a bug rather than as a lamp — the one exception is the
    // trader's own machine, which is drawn where it stands.
    const fixtures = carved.landmarks.filter((l) =>
      ["wall_lamp", "lamp_post"].includes(l.sprite ?? ""),
    );
    expect(fixtures.length).toBe(3);
    for (const fixture of fixtures) {
      expect(
        lights.some(
          (l) =>
            Math.abs(l.pos.x - fixture.pos.x) <= 1 &&
            Math.abs(l.pos.y - fixture.pos.y) <= 1,
        ),
        `the ${fixture.sprite} at ${fixture.pos.x},${fixture.pos.y} throws no light`,
      ).toBe(true);
    }
    // Every lamp lands on the lot rather than off the edge of it, and none is
    // so wide it lights the whole venue back to daylight.
    for (const light of lights) {
      expect(light.pos.x).toBeGreaterThanOrEqual(0);
      expect(light.pos.x).toBeLessThanOrEqual(carved.width);
      expect(light.pos.y).toBeGreaterThanOrEqual(0);
      expect(light.pos.y).toBeLessThanOrEqual(carved.height);
      expect(light.radius).toBeLessThan(carved.width / 4);
    }
  });

  it("is dark on the night the story opens, and daylight is only a parameter", () => {
    // The engine never reads a clock: a run is handed its hour, and a run
    // handed none is in full daylight (see src/game/daylight.ts).
    expect(nightAmount(startHome())).toBe(0);
    const night = startHome();
    night.daylight = 0;
    expect(nightAmount(night)).toBe(1);
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

// The hub has no horde, so it has nothing to pin a thought to but the ground
// itself — the two beats that tell a new player what the car is FOR, and what
// he is doing walking out without it (`LevelDef.placeThoughts`).
describe("the place-pinned beats", () => {
  /** Home with the opening scenes cleared and NOTHING read yet. */
  const freshHome = (): GameState => {
    const state = createGame(SEED, "garage", "medium");
    skipCutscene(state);
    dismissIntro(state);
    return state;
  };

  const said = (state: GameState): string =>
    thoughtDef((state.dialogue as { source: { defId: string } }).source.defId)
      .pages.flat()
      .join(" ")
      .toUpperCase();

  it("pins the errand on arrival and the nudge past the door, in that order", () => {
    expect(garage.placeThoughts?.map((t) => t.where)).toEqual([
      "arrival",
      "pastDoor",
    ]);
    // The nudge holds until the errand has been read — a player who is told
    // "get in the car" before he is told what the car is for is being nagged
    // about an errand he has not been given.
    expect(garage.placeThoughts?.[1]?.after).toBe(PLACE_BEATS[0]);
    for (const beat of PLACE_BEATS) expect(thoughtDef(beat)).toBeDefined();
  });

  it("thinks the errand on the first live tick at home, once ever", () => {
    const state = freshHome();
    run(state, 1);
    expect(state.phase).toBe("dialogue");
    expect(said(state)).toContain("GOODCO");
    advanceDialogue(state);
    expect(state.phase).toBe("playing");
    // Read: it never fires again, however long he stands in his own garage.
    run(state, 600);
    expect(state.phase).toBe("playing");
  });

  it("catches him walking out under the roll-up on his own feet", () => {
    const state = freshHome();
    run(state, 1);
    advanceDialogue(state); // the arrival errand
    const door = state.doors.find((d) => d.approach);
    expect(
      door,
      "the hub hangs a roll-up for him to walk out of",
    ).toBeDefined();
    // Standing INSIDE says nothing, however long he loiters.
    run(state, 120);
    expect(state.phase).toBe("playing");
    // …and stepping out the far side of the doorway from his own spawn does.
    state.players[0].pos = {
      x: door!.center.x + (door!.center.x > carved.playerSpawn.x ? 40 : -40),
      y: door!.center.y,
    };
    run(state, 1);
    expect(state.phase).toBe("dialogue");
    expect(said(state)).toContain("CAR");
    advanceDialogue(state);
    run(state, 120);
    expect(state.phase).toBe("playing"); // once, ever
  });

  it("never nags the man who took the car — a driven car crosses the same line", () => {
    const state = freshHome();
    run(state, 1);
    advanceDialogue(state); // the arrival errand
    const car = state.vehicles.find((v) => v.kind === "car")!;
    state.players[0].pos = { x: car.pos.x, y: car.pos.y };
    expect(applyRunCommand(state, "enterCar")).toBe(true);
    // Drive him out through the roll-up and on across the drive: the beat is
    // pinned to WALKING out, and the wheel is the opposite of that.
    const drive = {
      steering: true,
      target: { x: carved.width, y: car.pos.y },
      jump: false,
    };
    for (let i = 0; i < 240 && state.phase === "playing"; i++) {
      step(state, drive, DT);
    }
    expect(state.thoughtsSeen).not.toContain(PLACE_BEATS[1]);
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
