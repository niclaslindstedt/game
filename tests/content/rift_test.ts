// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Level 4 — THE RIFT: the hallucinatory space between universes. No ground,
// soft gravity, black holes and asteroid rain (the hazards engine), aliens
// for a horde, history's missing for elites — plus the game's first
// dialogue-only APPARITIONS — and a double finale: GROK OMEGA (ZAI's secret
// superintelligence, the level's reveal) and ELON MOSQUE fleeing a second
// time through the far door.

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
  startGame,
} from "../helpers.ts";

const RIFT = LEVELS.the_rift!;

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
    expect(state.wells).toHaveLength(RIFT.wells!.length);
    // The first rock is already owed a rolled interval.
    expect(state.asteroidTimerMs).toBeGreaterThan(0);
  });

  it("fields the void's fauna as the horde", () => {
    const minionIds = RIFT.spawns
      .filter((s) => "band" in s)
      .map((s) => s.enemy)
      .sort();
    expect(minionIds).toEqual([
      "graviton",
      "star_jelly",
      "unraveler",
      "voidling",
    ]);
  });

  it("pins history's missing along the road: four fights, two apparitions", () => {
    const placed = RIFT.spawns
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
    expect(apparitions).toEqual(["harry_houdini", "the_king"]);
  });

  it("stages the double finale: GROK OMEGA and a fleeing MOSQUE", () => {
    const bosses = RIFT.spawns
      .filter((s) => "at" in s && enemyDef(s.enemy).role === "boss")
      .map((s) => s.enemy)
      .sort();
    expect(bosses).toEqual(["elon_mosque_rift", "grok_omega"]);
    // The second encounter is the same coward in the same jacket…
    expect(enemyDef("elon_mosque_rift").sprite).toBe("elon_mosque");
    // …and he escapes again, out the far side of the rift.
    expect(enemyDef("elon_mosque_rift").flees).toEqual({ landmark: "rift" });
    // GROK OMEGA dies for real — no flight for a terminated instance.
    expect(enemyDef("grok_omega").flees).toBeUndefined();
  });

  it("makes the reveal GROK OMEGA's scene: found in secret, told no one", () => {
    const pages = enemyDef("grok_omega").dialogue!;
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
    const hpBefore = state.player.hp;
    state.asteroids.push({
      id: state.nextId++,
      pos: { x: state.player.pos.x - 2, y: state.player.pos.y },
      dir: { x: 1, y: 0 },
      speed: 0,
      radius: 10,
      spin: 0,
      struck: false,
    });
    step(state, idle, DT);
    // It hurt (a fraction of max hp) and stopped the run for the monologue.
    expect(state.player.hp).toBeLessThan(hpBefore);
    expect(state.phase).toBe("dialogue");
    expect(state.dialogue?.source).toEqual({
      kind: "playerThought",
      defId: "rift_asteroid",
    });
    expect(state.thoughtsSeen).toContain("rift_asteroid");
  });

  it("parks the ZAI probe — the reveal's paper trail — inside a well's pull", () => {
    const probe = RIFT.placedItems!.find(
      (p) => p.kind === "story" && p.defId === "zai_probe",
    );
    expect(probe).toBeDefined();
    const nearWell = RIFT.wells!.some(
      (w) => Math.hypot(w.pos.x - probe!.pos.x, w.pos.y - probe!.pos.y) < 130,
    );
    expect(nearWell).toBe(true);
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
    expect(loadout!.level).toBeGreaterThan(4);
    // Carrying Mars's signature kit.
    expect(loadout!.equipment.weapon.defId).toBe("cyber_katana");
    // Mars's best wardrobe rides along.
    expect(loadout!.equipment.chest?.defId).toBe("aegis_exoplate");
    expect(loadout!.equipment.charm?.defId).toBe("red_dust_charm");
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

describe("ELON MOSQUE flees again", () => {
  /** Step until the rift MOSQUE is off the board, collecting every event. */
  function beatMosque(state: GameState): GameEvent[] {
    const seen: GameEvent[] = [];
    for (
      let i = 0;
      i < 300 && state.enemies.some((e) => e.defId === "elon_mosque_rift");
      i++
    ) {
      step(state, idle, DT);
      seen.push(...state.events);
    }
    return seen;
  }

  it("escapes out the far side, dropping the GOLDEN PARACHUTE", () => {
    const state = startGame(SEED, "the_rift");
    clearStage(state);
    state.enemies = state.enemies.filter((e) => e.defId === "grok_omega");
    state.enemies.push(
      makeEnemy(
        {
          pos: { x: state.player.pos.x + 30, y: state.player.pos.y },
          hp: 1,
          maxHp: 750,
          powerScaled: true,
          spoke: true, // arrival scene already played; the exit is under test
        },
        "elon_mosque_rift",
      ),
    );

    const events = beatMosque(state);
    expect(events.some((e) => e.type === "bossFled")).toBe(true);
    expect(events.some((e) => e.type === "bossDefeated")).toBe(false);

    // The second rift — the far door he bolted through — stays on the board.
    expect(state.landmarks.filter((l) => l.kind === "rift")).toHaveLength(2);

    // The coward's second exit plays through the death-scene box.
    expect(state.dialogue?.source).toEqual({
      kind: "enemyDeath",
      defId: "elon_mosque_rift",
    });
    expect(dialogueContent(state.dialogue!).pages).toEqual([
      enemyDef("elon_mosque_rift").lastWords,
    ]);

    // The exit package deploys on the way out.
    expect(
      state.items.some(
        (i) =>
          i.kind === "equipment" && i.equipment.defId === "golden_parachute",
      ),
    ).toBe(true);

    // GROK OMEGA still stands, so the objective hasn't cleared yet — the
    // rift needs BOTH bosses gone.
    expect(state.victoryCountdownMs).toBeNull();
  });
});
