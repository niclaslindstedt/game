// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Level 4 — THE RIFT: the hallucinatory space between universes. No ground,
// soft gravity, black holes and asteroid rain (the hazards engine), aliens
// for a horde, history's missing for elites — plus the game's first
// dialogue-only APPARITIONS — and a double finale: GROK OMEGA (ZAI's secret
// superintelligence, the level's reveal) and ELON MOSQUE fleeing a second
// time through the far door.

import { describe, expect, it } from "vitest";

import {
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

  it("pins history's missing along the road: three fights, two apparitions", () => {
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
    const text = pages.flat().join(" ");
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
    // Three cleared levels behind him.
    expect(loadout!.level).toBeGreaterThan(7);
    // Carrying Mars's signature kit.
    expect(loadout!.equipment.weapon.defId).toBe("cyber_katana");
    expect(loadout!.equipment.suit?.defId).toBe("suit_plating");
    expect(loadout!.equipment.charm?.defId).toBe("red_dust_charm");
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
