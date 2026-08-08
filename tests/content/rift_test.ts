// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Level 4 — THE RIFT: the hallucinatory space between universes. No ground,
// soft gravity, black holes and asteroid rain (the hazards engine), aliens
// for a horde, history's missing for elites — plus the game's first
// dialogue-only APPARITIONS — and a double finale: BRO OMEGA (TRUST ME BRO's secret
// superintelligence, the level's reveal) and THE FOUNDER fleeing a second
// time through the far door.

import { describe, expect, it } from "vitest";

import {
  createGame,
  deriveArrivalLoadout,
  dialogueContent,
  enemyDef,
  LEVEL_ORDER,
  LEVELS,
  MAP_BLUEPRINTS,
  resolveLevelDef,
  OBSTACLES,
  step,
  THOUGHT_DEFS,
  type GameEvent,
  type GameState,
  type Loadout,
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

const RIFT = LEVELS.the_rift!;
const BLUEPRINT = MAP_BLUEPRINTS.the_rift!;
/** One representative void — the road a run of the rift actually builds. */
const carved = resolveLevelDef("the_rift", SEED);

describe("THE RIFT level def", () => {
  it("is story level 4, after Mars", () => {
    expect(RIFT.index).toBe(4);
    expect(LEVEL_ORDER[3]).toBe("the_rift");
    const state = startGame(SEED, "the_rift");
    expect(state.level.biome).toBe("rift");
    expect(state.level.foes).toBe("ENTITIES");
  });

  it("turns both hazard systems on: black holes strewn, rocks raining", () => {
    expect(RIFT.wells!.length).toBeGreaterThanOrEqual(5);
    expect(RIFT.asteroids).toBeDefined();
    const state = startGame(SEED, "the_rift");
    // Every authored hole is on the field — the carve re-anchors each into a
    // room of its own, keeping its authored pull geometry.
    expect(state.wells).toHaveLength(RIFT.wells!.length);
    // The first rock is already owed a rolled interval.
    expect(state.asteroidTimerMs).toBeGreaterThan(0);
  });

  it("fields the void's fauna as the horde", () => {
    const minionIds = BLUEPRINT.horde.members.map((m) => m.enemy).sort();
    expect(minionIds).toEqual([
      "graviton",
      "star_jelly",
      "unraveler",
      "voidling",
    ]);
  });

  it("pins history's missing along the road: four fights, two apparitions", () => {
    const placed = carved.spawns
      .filter((s) => "at" in s)
      .map((s) => enemyDef(s.enemy));
    const fighters = placed
      .filter((d) => d.role === "elite" && !d.apparition)
      .map((d) => d.id)
      .sort();
    expect(fighters).toEqual([
      "amelia_earhart",
      "grigori_rasputin",
      "lucky",
      "nikola_tesla",
    ]);
    const apparitions = placed
      .filter((d) => d.apparition)
      .map((d) => d.id)
      .sort();
    expect(apparitions).toEqual(["harry_houdini", "the_residency"]);
  });

  it("stages the double finale: BRO OMEGA and a fleeing THE FOUNDER", () => {
    const bosses = carved.spawns
      .filter((s) => "at" in s && enemyDef(s.enemy).role === "boss")
      .map((s) => s.enemy)
      .sort();
    expect(bosses).toEqual(["bro_omega", "the_founder_rift"]);
    // The second encounter is the same coward — but NOT in the same clothes.
    // He turns up on the far side of the tear in an all-black suit and a black
    // campaign cap, so the two meetings read as two different nights rather
    // than as the same art pasted onto a second map.
    expect(enemyDef("the_founder_rift").sprite).toBe("the_founder_rift");
    expect(enemyDef("the_founder_rift").sprite).not.toBe(
      enemyDef("the_founder").sprite,
    );
    // …and he escapes again, out the far side of the rift.
    expect(enemyDef("the_founder_rift").flees).toEqual({ landmark: "rift" });
    // BRO OMEGA dies for real — no flight for a terminated instance.
    expect(enemyDef("bro_omega").flees).toBeUndefined();
  });

  it("makes the reveal BRO OMEGA's scene: found in secret, told no one", () => {
    const pages = enemyDef("bro_omega").dialogue!;
    const text = pages
      .flatMap((p) => (Array.isArray(p) ? p : p.hero))
      .join(" ");
    expect(text).toContain("I FOUND THIS PLACE");
    expect(text).toContain("I TOLD");
    expect(text).toContain("PRECISELY NO ONE");
    expect(text).toContain("NOT YOUR");
    expect(text).toContain("PRESIDENTS");
  });

  it("wires the arrival and graviton monologues", () => {
    for (const trigger of RIFT.firstSightThoughts!) {
      expect(THOUGHT_DEFS[trigger.thought], trigger.thought).toBeDefined();
    }
    for (const trigger of RIFT.firstKillThoughts!) {
      expect(THOUGHT_DEFS[trigger.thought], trigger.thought).toBeDefined();
    }
    expect(RIFT.firstSightThoughts![0]!.enemy).toBe("voidling");
    expect(RIFT.firstKillThoughts![0]!.enemy).toBe("graviton");
  });

  it("wires the asteroid-strike monologue — 'watch out for these'", () => {
    const thought = RIFT.asteroids!.struckThought!;
    expect(thought).toBe("rift_asteroid");
    const def = THOUGHT_DEFS[thought]!;
    expect(def).toBeDefined();
    // The requested read: he had better watch out, they hurt.
    const text = def.pages.flat().join(" ");
    expect(text).toContain("WATCH OUT");
    expect(text).toContain("ASTEROIDS");
    expect(text).toContain("THEY HURT");
  });

  it("the first rift rock to land pauses for the hero's read, once", () => {
    const state = startGame(SEED, "the_rift");
    clearStage(state);
    state.asteroidTimerMs = 999_999; // the hand-built rock is the only one
    const hpBefore = state.players[0].hp;
    state.asteroids.push({
      id: state.nextId++,
      target: { x: state.players[0].pos.x, y: state.players[0].pos.y },
      entry: {
        x: state.players[0].pos.x - 100,
        y: state.players[0].pos.y - 100,
      },
      fallMs: 1000,
      ageMs: 1000, // already at impact — it detonates on the player this tick
      blastRadius: 50,
      rockRadius: 9,
      spin: 0,
    });
    step(state, idle, DT);
    // It hurt (a fraction of max hp) and stopped the run for the monologue.
    expect(state.players[0].hp).toBeLessThan(hpBefore);
    expect(state.phase).toBe("dialogue");
    expect(state.dialogue?.source).toEqual({
      kind: "playerThought",
      defId: "rift_asteroid",
    });
    expect(state.thoughtsSeen).toContain("rift_asteroid");
  });

  it("carries the TRUST ME BRO probe — the reveal's paper trail — on the road", () => {
    // The mission says the probe is out here; the carve strings it along its
    // own depth axis with the rest of Ada's trail, so WHERE it turns up is the
    // run's answer and this only asks that it is somewhere findable.
    const probe = RIFT.placedItems!.find(
      (p) => p.kind === "story" && p.defId === "bro_probe",
    );
    expect(probe).toBeDefined();
    const dropped = carved.placedItems!.find(
      (p) => p.kind === "story" && p.defId === "bro_probe",
    )!;
    expect(dropped.pos.x).toBeGreaterThan(0);
    expect(dropped.pos.x).toBeLessThan(carved.width);
    expect(dropped.pos.y).toBeGreaterThan(0);
    expect(dropped.pos.y).toBeLessThan(carved.height);
  });

  it("keeps every hop viable: jumpable obstacles clear under rift gravity", () => {
    const peak = 240 ** 2 / (2 * RIFT.gravity);
    expect(peak).toBeGreaterThan(OBSTACLES.clearHeight + 10);
    // Floatier than the moon — the between-universe glide.
    expect(RIFT.gravity).toBeLessThan(LEVELS.moon!.gravity);
  });

  it("derives a seasoned dev-jump loadout: Mars kit, level from the campaign", () => {
    const loadout = deriveArrivalLoadout("the_rift", "medium");
    expect(loadout).not.toBeNull();
    // Three cleared levels behind him — seasoned past the opener. The slower
    // kills-per-level curve yields a lower campaign level than the old
    // exponential did, so this is a floor, not the old exact figure.
    expect(loadout!.level).toBeGreaterThan(2);
    // Carrying Mars's signature kit — its guaranteed early sidearm (the ranged
    // SMART PISTOL the level now hands out first, so a hero has a kiting tool
    // for the fleeing colony boss).
    expect(loadout!.equipment.weapon.defId).toBe("smart_pistol");
    // Mars's best wardrobe rides along.
    expect(loadout!.equipment.chest?.defId).toBe("aegis_exoplate");
    // Its TRINKET rides in the bag — that is where a trinket pays out.
    expect(loadout!.inventory[0]?.defId).toBe("red_dust_charm");
  });

  it("stops history's missing from re-spawning once they ride the party", () => {
    // RASPUTIN and TESLA spared into the party on an earlier pass.
    const base = deriveArrivalLoadout("the_rift", "medium")!;
    const loadout: Loadout = {
      ...base,
      companions: [
        { defId: "grigori_rasputin", equipment: base.equipment },
        { defId: "nikola_tesla", equipment: base.equipment },
      ],
    };
    const withParty = createGame(SEED, "the_rift", "medium", loadout);
    // The two who joined the hero are absent from the enemy roster…
    expect(withParty.enemies.some((e) => e.defId === "grigori_rasputin")).toBe(
      false,
    );
    expect(withParty.enemies.some((e) => e.defId === "nikola_tesla")).toBe(
      false,
    );
    // …and walk the rift at his side instead.
    expect(withParty.companions.map((c) => c.defId).sort()).toEqual([
      "grigori_rasputin",
      "nikola_tesla",
    ]);
    // The ones he never spared still guard their corners.
    expect(withParty.enemies.some((e) => e.defId === "amelia_earhart")).toBe(
      true,
    );
    expect(withParty.enemies.some((e) => e.defId === "lucky")).toBe(true);

    // With no party, the whole cast spawns as normal.
    const solo = createGame(SEED, "the_rift", "medium");
    expect(solo.enemies.some((e) => e.defId === "grigori_rasputin")).toBe(true);
    expect(solo.enemies.some((e) => e.defId === "nikola_tesla")).toBe(true);
  });
});

describe("THE FOUNDER flees again", () => {
  /** Step until the rift THE FOUNDER is off the board, collecting every event. */
  function beatMosque(state: GameState): GameEvent[] {
    const seen: GameEvent[] = [];
    for (
      let i = 0;
      i < 300 && state.enemies.some((e) => e.defId === "the_founder_rift");
      i++
    ) {
      step(state, idle, DT);
      seen.push(...state.events);
    }
    // Off the board is no longer the same moment as gone: at the threshold his
    // FLIGHT RITE opens (engine/game/boss-death.ts) — he tears the rift open, runs
    // for it, and is spun through — and `bossFled`, the landmark and his
    // parting words all land at the END of that beat.
    seen.push(...settleBossRite(state));
    return seen;
  }

  it("escapes out the far side, dropping the GOLDEN PARACHUTE", () => {
    const state = startGame(SEED, "the_rift");
    clearStage(state);
    state.enemies = state.enemies.filter((e) => e.defId === "bro_omega");
    state.enemies.push(
      makeEnemy(
        {
          pos: { x: state.players[0].pos.x + 30, y: state.players[0].pos.y },
          hp: 1,
          maxHp: 750,
          powerScaled: true,
          spoke: true, // arrival scene already played; the exit is under test
        },
        "the_founder_rift",
      ),
    );

    const events = beatMosque(state);
    expect(events.some((e) => e.type === "bossFled")).toBe(true);
    expect(events.some((e) => e.type === "bossDefeated")).toBe(false);

    // The tear he bolted through stays on the board — and it is the ONLY
    // landmark of kind `rift`, because that kind is the door the player
    // follows him through (`travelDoors`). The one he ARRIVED by carries its
    // own id so the two can never be confused.
    expect(state.landmarks.filter((l) => l.kind === "rift")).toHaveLength(1);
    expect(
      state.landmarks.filter((l) => l.kind === "arrival_tear"),
    ).toHaveLength(1);

    // The coward's second exit plays through the death-scene box.
    expect(state.dialogue?.source).toEqual({
      kind: "enemyDeath",
      defId: "the_founder_rift",
    });
    expect(dialogueContent(state.dialogue!).pages).toEqual([
      enemyDef("the_founder_rift").lastWords,
    ]);

    // The exit package deploys on the way out — dropped on the ground, or (when
    // the autonomous hero is standing right on the drop, as here) picked
    // straight up. The parachute is a TRINKET, so "picked up" means banked in
    // the bag, which is where a trinket pays out. Either way it left THE FOUNDER's
    // corpse, which is the beat this guards.
    const parachuteDeployed =
      state.items.some(
        (i) =>
          i.kind === "equipment" && i.equipment.defId === "golden_parachute",
      ) ||
      state.players[0].inventory.some((c) => c?.defId === "golden_parachute") ||
      events.some(
        (e) => e.type === "autoEquipped" && e.defId === "golden_parachute",
      );
    expect(parachuteDeployed).toBe(true);

    // BRO OMEGA still stands, so the objective hasn't cleared yet — the
    // rift needs BOTH bosses gone.
    expect(state.victoryCountdownMs).toBeNull();
  });
});
