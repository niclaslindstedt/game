// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// GENERATED MAPS (see src/game/mapgen/): the guard on the map generator.
//
// A carved map is only ever seen once, by one player, on one seed — nobody
// reviews it before it ships and no screenshot proves the next one is fine. So
// the properties that MUST hold have to hold for every seed, and the only way to
// know that is to carve a spread of them and check.
//
// Two checks carry the weight:
//
//   REACHABILITY, using the engine's OWN pathfinder rather than a re-derivation
//   of it. A generated map whose boss sits behind a sealed partition is not a
//   hard map, it is a broken one — and the same goes for a cache walled off or a
//   story item dropped in a pocket. Asking `buildNavGrid`/`findPath` is asking
//   the thing the autopilot asks, so a pass here is a pass in play.
//
//   SCHEMA, using the same `validateLevel` the build runs over every
//   hand-authored level. The generator emits a `LevelDef` and the rest of the
//   engine cannot tell where one came from, so it has no business emitting one a
//   human would not be allowed to commit.

import { readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { afterAll, describe, expect, it } from "vitest";

import {
  advanceDialogue,
  buildNavGrid,
  createGame,
  DIFFICULTY_ORDER,
  ENEMY_DEFS,
  findPath,
  hasMapBlueprint,
  LEVEL_ORDER,
  MAP_BLUEPRINTS,
  dismissIntro,
  levelDef,
  nextPathWaypoint,
  parseRegion,
  regionRect,
  resolveLevelDef,
  resolveMapSize,
  runLevelDef,
  SECRET_LEVEL_ORDER,
  setGeneratedMapSize,
  setGeneratedMapsEnabled,
  skipCutscene,
  step,
  zoneContains,
  type Difficulty,
  type LevelDef,
  type MapSizeName,
} from "@game/core";

// @ts-expect-error — the level checker is plain JS tooling, deliberately shared
// with the build rather than reimplemented here.
import { validateLevel } from "../../scripts/asset-tools/level-schema.mjs";

import { GEAR_DEFS, WEAPON_DEFS } from "../../src/game/defs/equipment.ts";
import { ABILITY_DEFS } from "../../src/game/defs/abilities.ts";
import { STORY_ITEM_DEFS } from "../../src/game/defs/story.ts";
import { THOUGHT_DEFS } from "../../src/game/defs/thoughts.ts";
import { UNIQUE_DEFS, WORLD_UNIQUES } from "../../src/game/defs/uniques.ts";

const SIZES: MapSizeName[] = ["small", "medium", "large"];
// Enough seeds that a one-in-twenty layout quirk shows up, few enough that the
// suite stays under a few seconds.
const SEEDS = [1, 2, 3, 5, 8, 13, 21, 34];
// Reachability builds a WHOLE RUN per case to get an honest nav grid, so it walks
// a smaller spread than the pure-def checks — every mission at every size, on
// four seeds, rather than eight.
const WALK_SEEDS = [1, 3, 8, 21];
const MISSIONS = [...LEVEL_ORDER, ...SECRET_LEVEL_ORDER];

// The flag gates the simulation, so any test that turns it on must put it back —
// vitest shares a module graph across the files in a worker.
afterAll(() => {
  setGeneratedMapsEnabled(false);
  setGeneratedMapSize("medium");
});

const refs = {
  enemies: new Set(Object.keys(ENEMY_DEFS)),
  enemyRoles: new Map(
    Object.entries(ENEMY_DEFS).map(([id, d]) => [id, d.role]),
  ),
  weapons: new Set(Object.keys(WEAPON_DEFS)),
  gear: new Set(Object.keys(GEAR_DEFS)),
  abilities: new Set(Object.keys(ABILITY_DEFS)),
  thoughts: new Set(Object.keys(THOUGHT_DEFS)),
  storyItems: new Set(Object.keys(STORY_ITEM_DEFS)),
  uniques: new Set(Object.keys(UNIQUE_DEFS)),
  worldUniques: new Set(WORLD_UNIQUES.map((u) => u.id)),
  doorKeys: new Set(
    Object.values(STORY_ITEM_DEFS)
      .map((s) => s.unlocks)
      .filter(Boolean),
  ),
};

/** Where the run ENDS: the exit of a `reachExit` mission, or the boss's post. */
function goalOf(def: LevelDef): { x: number; y: number } | null {
  if (def.objective.type === "reachExit") return def.objective.at;
  const boss = def.spawns
    .filter((s) => "at" in s && ENEMY_DEFS[s.enemy]?.role === "boss")
    .at(-1);
  return boss && "at" in boss ? boss.at : null;
}

describe("map blueprints", () => {
  it("ships one for every mission, named after it", () => {
    for (const id of MISSIONS) {
      expect(hasMapBlueprint(id), `no blueprint for "${id}"`).toBe(true);
      // The registry is keyed by level id so `resolveLevelDef` can look a
      // blueprint up by the id a run was started with, with nothing mapping
      // between two namespaces.
      expect(MAP_BLUEPRINTS[id]?.level).toBe(id);
    }
  });

  it("has a file on disk for every compiled blueprint", () => {
    // The compiled catalog is gitignored and regenerated, so a blueprint that
    // exists only in the generated output would survive right up until somebody
    // cleaned their tree.
    const dir = fileURLToPath(new URL("../../content/maps", import.meta.url));
    const stems = new Set(
      readdirSync(dir)
        .filter((f) => f.endsWith(".yaml"))
        .map((f) => f.slice(0, -".yaml".length)),
    );
    for (const id of Object.keys(MAP_BLUEPRINTS)) expect(stems).toContain(id);
  });
});

describe("generated levels", () => {
  it("pass the same schema a hand-authored level does", () => {
    const errors: string[] = [];
    for (const id of MISSIONS)
      for (const size of SIZES)
        for (const seed of SEEDS) {
          const def = resolveLevelDef(id, seed, size);
          const res = validateLevel(def, refs, "generated") as {
            errors: string[];
          };
          for (const e of res.errors)
            errors.push(`${id}/${size}/${seed}: ${e}`);
        }
    expect(errors.slice(0, 8)).toEqual([]);
  });

  it("leave the objective, every cache and every placed item reachable", () => {
    const unreachable: string[] = [];
    for (const id of MISSIONS)
      for (const size of SIZES) {
        // The grid has to come from a run of THE SAME map. `createGame` resolves
        // its own level through the flag, so the flag has to be told which size
        // to carve — building the grid from a default run and pathing a
        // different def's coordinates through it silently checks nothing.
        setGeneratedMapsEnabled(true);
        setGeneratedMapSize(size);
        for (const seed of WALK_SEEDS) {
          const def = resolveLevelDef(id, seed, size);
          // Built from a real run, so it sees the walls, the scattered rock and
          // the crates exactly as the autopilot does.
          const grid = buildNavGrid(createGame(seed, id, "medium"));
          const targets: [string, { x: number; y: number }][] = [];
          const goal = goalOf(def);
          if (goal) targets.push(["objective", goal]);
          def.chests?.forEach((c, i) => targets.push([`chest ${i}`, c.at]));
          def.placedItems?.forEach((p, i) =>
            targets.push([`item ${i} (${p.kind})`, p.pos]),
          );
          // A LIFT is a walkable edge the nav grid knows nothing about: the
          // annex it rides to has no corridor at all, which is the whole point
          // of it (see `MapAnnex`). So reachability is asked in two legs — walk
          // to the pad, ride, walk on from where the car put you down — and a
          // target is reachable if EITHER leg reaches it. Without this the test
          // would demand the boss be walkable to, which is exactly the property
          // the feature exists to remove.
          // The origin set is GROWN through the lifts rather than fixed: a pad
          // reachable on foot from anywhere already reachable adds wherever its
          // car sets you down. The return pad inside the annex is the case that
          // matters — it is not walkable to from the landing, and must not be,
          // so demanding that it were would assert the opposite of the feature.
          const origins = [def.playerSpawn];
          const lifts = [...(def.elevators ?? [])];
          for (let grew = true; grew;) {
            grew = false;
            for (let i = lifts.length - 1; i >= 0; i--) {
              const lift = lifts[i] as NonNullable<
                LevelDef["elevators"]
              >[number];
              if (!origins.some((from) => findPath(grid, from, lift.pos)))
                continue;
              origins.push(lift.to);
              lifts.splice(i, 1);
              grew = true;
            }
          }
          // Every lift has to be reachable in the end, or the map ships a car
          // nobody can call.
          for (const lift of lifts)
            unreachable.push(`${id}/${size}/${seed}: lift ${lift.id}`);
          for (const [what, at] of targets)
            if (!origins.some((from) => findPath(grid, from, at)))
              unreachable.push(`${id}/${size}/${seed}: ${what}`);
        }
      }
    setGeneratedMapsEnabled(false);
    expect(unreachable.slice(0, 8)).toEqual([]);
  }, 120_000);

  it("emit no intended path, so nothing points at the boss", () => {
    // The app's guidance arrow follows `path`; a generated map that shipped one
    // would walk the player straight to the thing they are meant to search for.
    for (const id of MISSIONS)
      for (const seed of SEEDS)
        expect(resolveLevelDef(id, seed, "medium").path).toBeUndefined();
  });

  it("put the boss somewhere new from run to run", () => {
    for (const id of MISSIONS) {
      const spots = new Set(
        SEEDS.map((seed) => {
          const goal = goalOf(resolveLevelDef(id, seed, "large"));
          return goal ? `${goal.x},${goal.y}` : "none";
        }),
      );
      // Not merely "more than one": a generator that alternated between two
      // corners would pass that and still be a commute by the third run.
      expect(spots.size, `"${id}" reuses boss spots`).toBeGreaterThanOrEqual(
        SEEDS.length - 1,
      );
    }
  });

  it("start the hero a long walk from what he has to find", () => {
    for (const id of MISSIONS)
      for (const seed of SEEDS) {
        const def = resolveLevelDef(id, seed, "large");
        // What the SEARCH is for. On a mission with a lift that is the pad, not
        // the boss: the boss is in a sealed annex whose straight-line distance
        // from the landing means nothing (it is below the map, so a hero landing
        // in the south is "near" a room he cannot reach at all). The pad is the
        // thing that actually has to be walked to.
        const target = def.elevators?.[0]?.pos ?? goalOf(def);
        if (!target) continue;
        const gap = Math.hypot(
          target.x - def.playerSpawn.x,
          target.y - def.playerSpawn.y,
        );
        // Well over a screen (the reference viewport is ~422 world units wide),
        // so the objective is never visible from the landing spot.
        expect(
          gap,
          `${id}/${seed} opens too close to what it is hiding`,
        ).toBeGreaterThan(1200);
      }
  });

  it("carve the same map from the same seed", () => {
    for (const id of MISSIONS) {
      const a = resolveLevelDef(id, 7, "medium");
      const b = resolveLevelDef(id, 7, "medium");
      expect(JSON.stringify(b)).toEqual(JSON.stringify(a));
      // …and a different one from a different seed, or the seed means nothing.
      const c = resolveLevelDef(id, 8, "medium");
      expect(JSON.stringify(c)).not.toEqual(JSON.stringify(a));
    }
  });

  it("grow with the size, in floor and in rooms", () => {
    for (const id of MISSIONS) {
      const [small, medium, large] = SIZES.map((size) =>
        resolveLevelDef(id, 4, size),
      ) as [LevelDef, LevelDef, LevelDef];
      expect(small.width * small.height).toBeLessThan(
        medium.width * medium.height,
      );
      expect(medium.width * medium.height).toBeLessThan(
        large.width * large.height,
      );
      // A bigger rectangle with the same handful of rooms would be a stretched
      // map, not a longer search — the knots are one per carved cell.
      const knots = (def: LevelDef) =>
        (def.spawners ?? []).filter((s) => !s.hellgate).length;
      expect(knots(small)).toBeLessThan(knots(large));
    }
  });

  it("keep every spawner, set piece and chest inside the map", () => {
    for (const id of MISSIONS)
      for (const size of SIZES) {
        const def = resolveLevelDef(id, 11, size);
        const inside = (p: { x: number; y: number }) =>
          p.x >= 0 && p.x <= def.width && p.y >= 0 && p.y <= def.height;
        for (const s of def.spawners ?? []) expect(inside(s.at)).toBe(true);
        for (const s of def.spawns)
          if ("at" in s) expect(inside(s.at)).toBe(true);
        for (const c of def.chests ?? []) expect(inside(c.at)).toBe(true);
        expect(inside(def.playerSpawn)).toBe(true);
      }
  });
});

describe("the generated-maps flag", () => {
  it("is off by default, so a run plays the hand-authored map", () => {
    // `resolveLevelDef` with no size override reads the flag; the engine default
    // must be the shipped campaign, or turning the developer menu on becomes a
    // prerequisite for playing the game as designed.
    const id = LEVEL_ORDER[0] as string;
    expect(resolveLevelDef(id, 3)).toBe(levelDef(id));
  });

  it("swaps in a carved map while it is on, and back off again", () => {
    const id = LEVEL_ORDER[0] as string;
    try {
      setGeneratedMapsEnabled(true);
      expect(resolveLevelDef(id, 3)).not.toBe(levelDef(id));
    } finally {
      setGeneratedMapsEnabled(false);
    }
    expect(resolveLevelDef(id, 3)).toBe(levelDef(id));
  });

  it("rolls a size per seed when asked to, and honours a named one", () => {
    const bp = MAP_BLUEPRINTS[LEVEL_ORDER[0] as string];
    if (!bp) throw new Error("no blueprint to size");
    for (const size of SIZES) expect(resolveMapSize(bp, size, 99)).toBe(size);
    const rolled = new Set(
      SEEDS.map((seed) => resolveMapSize(bp, "random", seed)),
    );
    expect(rolled.size).toBeGreaterThan(1);
  });
});

describe("a run on a generated map", () => {
  // THE SEAM. `createGame` carves the map, but a run keeps asking the level
  // questions for as long as it lasts — and every one of those reads used to go
  // back to the catalog, i.e. to the HAND-AUTHORED map. That is not a cosmetic
  // slip: it is another map's geometry answering, so the horde was suppressed by
  // no-spawn zones drawn around rooms that were never carved, the guidance arrow
  // pointed at a landmark on a map nobody was standing on, the lair doors never
  // opened, and the bunker streamed the authored wave budget the carve had
  // deliberately dropped. `runLevelDef` is the one answer; these hold it to it.
  const carved = (levelId: string, difficulty: Difficulty = "medium") => {
    setGeneratedMapsEnabled(true);
    setGeneratedMapSize("medium");
    try {
      return createGame(7, levelId, difficulty);
    } finally {
      setGeneratedMapsEnabled(false);
    }
  };

  /** Tap past whatever is holding the run — the prelude, or the arrival speech
   * an elite gives when it walks out — so it is actually PLAYING again: the
   * proximity passes (lairs, packs, spawn points) all sit out a paused phase,
   * as they should. */
  const settle = (state: ReturnType<typeof createGame>) => {
    for (let i = 0; i < 60 && state.phase !== "playing"; i++) {
      if (state.phase === "cutscene") skipCutscene(state);
      else if (state.phase === "dialogue") advanceDialogue(state);
      else dismissIntro(state);
    }
  };

  /** A carved run, tapped past its prelude. */
  const played = (levelId: string, difficulty: Difficulty = "medium") => {
    const state = carved(levelId, difficulty);
    settle(state);
    return state;
  };

  it("answers level questions with its own map, not the catalog's", () => {
    for (const id of MISSIONS) {
      const state = carved(id);
      const def = runLevelDef(state);
      expect(def).not.toBe(levelDef(id));
      // The def the world was actually built from, not merely "a" carve.
      expect(def.playerSpawn).toEqual(state.playerSpawn);
      expect(def.width).toBe(state.level.width);
    }
    // An ordinary run is untouched — the catalog def IS its def.
    const plain = createGame(7, LEVEL_ORDER[0] as string, "medium");
    expect(runLevelDef(plain)).toBe(levelDef(LEVEL_ORDER[0] as string));
  });

  it("shows no guidance arrow, because there is nothing to point at", () => {
    // The def carries no `path` (asserted above) — but the arrow reads it
    // through the RUN, so this is the check that the player sees no arrow.
    for (const id of MISSIONS) expect(nextPathWaypoint(carved(id))).toBeNull();
  });

  it("uses its own knots instead of the authored wave stream", () => {
    // The bunker is the one mission authored around an endless `waves` budget.
    // The carve drops it — its cell knots ARE its horde — and a run that read
    // the catalog got both: a finite map with a bottomless bog on top.
    const state = carved("the_bunker");
    expect(levelDef("the_bunker").waves).toBeDefined();
    expect(runLevelDef(state).waves).toBeUndefined();
    expect(state.spawners.length).toBeGreaterThan(0);
  });

  it("opens every lair onto its own occupant", () => {
    // A lair's runtime state is index-matched to the def's `lairs`. Read the
    // catalog and the two lists are different lengths, so the door simply never
    // opens and the elite inside — with its dialogue and its drops — is never
    // in the run at all.
    for (const id of MISSIONS) {
      const state = played(id);
      const specs = runLevelDef(state).lairs ?? [];
      expect(specs.length).toBe(state.lairs.length);
      for (let i = 0; i < specs.length; i++) {
        const lair = state.lairs[i]!;
        const occupant = specs[i]!.enemy;
        expect(state.enemies.some((e) => e.defId === occupant)).toBe(false);
        // Walk the hero up to the door and let the run tick, exactly as play
        // does — the door bangs open and the occupant comes out to greet him.
        state.player.pos = { ...lair.pos };
        settle(state);
        step(state, { steering: false, target: lair.pos, jump: false }, 16);
        expect(lair.open, `${id} lair ${i} stayed shut`).toBe(true);
        expect(
          state.enemies.some((e) => e.defId === occupant),
          `${id} lair ${i} let nobody out`,
        ).toBe(true);
      }
    }
  });
});

describe("the story on a generated map", () => {
  // A generated mission INHERITS its story from the level it names — the intro,
  // the cutscenes, the elites and their speeches, the pinned inner monologues,
  // the lore on the story items. The carve can still silence a beat without
  // touching a line of it, by not putting the mob that triggers it on the map.
  const castOf = (def: LevelDef) =>
    new Set([
      ...def.spawns.map((s) => s.enemy),
      ...(def.packs ?? []).flatMap((p) => p.members.map((m) => m.enemy)),
      ...(def.lairs ?? []).map((l) => l.enemy),
      ...(def.spawners ?? []).flatMap((s) => s.members.map((m) => m.enemy)),
    ]);

  it("keeps every speaking elite and boss the authored map casts", () => {
    const speaks = (id: string) => {
      const def = ENEMY_DEFS[id];
      return (
        (def?.dialogue?.length ?? 0) > 0 || (def?.lastWords?.length ?? 0) > 0
      );
    };
    for (const id of MISSIONS) {
      const authored = [...castOf(levelDef(id))].filter(speaks);
      for (const size of SIZES)
        for (const seed of WALK_SEEDS) {
          const cast = castOf(resolveLevelDef(id, seed, size));
          const missing = authored.filter((who) => !cast.has(who));
          expect(missing, `${id}/${size}/${seed} lost a speaking part`).toEqual(
            [],
          );
        }
    }
  });

  it("leaves the landing QUIET rather than SAFE, so the horde can reach him", () => {
    // A safe zone does not merely keep the horde from spawning in it — it REPELS
    // every minion out and holds them at its edge (stepEnemies). One centred on
    // the hero is therefore a bubble he can stand in untouched all run, and it
    // froze goodco_hq's opening beat solid: the scripted rusher was shoved back
    // out of the pad it was placed in and could never land the touch that draws
    // his blade. No hand-authored map spends a safe zone on the landing.
    for (const id of MISSIONS)
      for (const seed of WALK_SEEDS) {
        const def = resolveLevelDef(id, seed, "medium");
        const safe = (def.safeZones ?? []).filter((z) =>
          zoneContains(z, def.playerSpawn),
        );
        expect(
          safe.map((z) => z.label ?? "?"),
          `${id}/${seed} walls the horde off the landing`,
        ).toEqual([]);
        // …but it is still a breather: no ambient horde is placed in it.
        expect(
          (def.quietZones ?? []).some((z) => zoneContains(z, def.playerSpawn)),
          `${id}/${seed} lands the hero in the middle of a knot`,
        ).toBe(true);
      }
  });

  it("stands the opening beat's crowd where the hero lands", () => {
    // `openingStrike` is a two-parter held in order by `after`: the hero reads
    // the crowd, and only then does the rusher draw his blade. Carve the crowd a
    // district away and the gate never opens — the rusher strikes a hero the beat
    // will not arm, and he walks the map holstered.
    for (const id of MISSIONS) {
      const base = levelDef(id);
      const gate = base.openingStrike?.after;
      const pin = gate
        ? base.firstSightThoughts?.find((t) => t.thought === gate)
        : undefined;
      if (!pin) continue;
      for (const size of SIZES)
        for (const seed of WALK_SEEDS) {
          const def = resolveLevelDef(id, seed, size);
          const reach = pin.radius ?? 96;
          const near = def.spawns.filter(
            (s) =>
              s.enemy === pin.enemy &&
              "at" in s &&
              Math.hypot(
                s.at.x - def.playerSpawn.x,
                s.at.y - def.playerSpawn.y,
              ) <= reach,
          );
          expect(
            near.length,
            `${id}/${size}/${seed} lands the hero away from the beat's crowd`,
          ).toBeGreaterThan(0);
          // And the rusher itself is within the touch it has to land.
          expect(def.openingStrike).toBeDefined();
        }
    }
  });

  it("puts every pinned thought's mob somewhere it can be met", () => {
    // A `firstKillThoughts` / `firstSightThoughts` entry is a beat waiting on one
    // breed. Carve a map without that breed and the monologue simply never plays
    // — silently, on that seed only.
    for (const id of MISSIONS)
      for (const size of SIZES)
        for (const seed of WALK_SEEDS) {
          const def = resolveLevelDef(id, seed, size);
          const cast = castOf(def);
          const pinned = [
            ...(def.firstKillThoughts ?? []),
            ...(def.firstSightThoughts ?? []),
          ];
          const unfireable = pinned
            .filter((t) => !cast.has(t.enemy))
            .map((t) => `${t.enemy}→${t.thought}`);
          expect(unfireable, `${id}/${size}/${seed}`).toEqual([]);
        }
  });
});

describe("the generated horde", () => {
  it("stands a spawn point in the map on every rung", () => {
    for (const id of MISSIONS)
      for (const difficulty of DIFFICULTY_ORDER) {
        setGeneratedMapsEnabled(true);
        setGeneratedMapSize("medium");
        let state;
        try {
          state = createGame(7, id, difficulty);
        } finally {
          setGeneratedMapsEnabled(false);
        }
        const knots = state.spawners.filter((s) => !(s.openStage ?? 0));
        const gates = state.spawners.filter((s) => (s.openStage ?? 0) > 0);
        expect(
          knots.length,
          `${id}/${difficulty} has no horde`,
        ).toBeGreaterThan(0);
        const queued = knots.reduce((n, s) => n + s.queue.length, 0);
        expect(queued, `${id}/${difficulty} queues nothing`).toBeGreaterThan(
          50,
        );
        // HELLGATES are the rampage's answer on the top rungs, exactly as on the
        // hand-authored maps — nightmare and JESUS get them, nobody else does.
        const rampageRung =
          difficulty === "nightmare" || difficulty === "jesus";
        expect(gates.length > 0, `${id}/${difficulty} hellgates`).toBe(
          rampageRung,
        );
      }
  });

  it("stands its spawn points as thick as the authored campaign does", () => {
    // "No mobs on the map, just the elites and the boss" — the bug this pins.
    // A knot per CELL is a COUNT, and the carve grows its cells with the map, so
    // the horde thinned out exactly as the search got longer: 0.8-1.2 spawn
    // points per million px² against the hand-authored campaign's 1.6-3.8. The
    // floor here is a fight roughly every screen and a half of walking, at EVERY
    // size — a large carve going empty is the same bug wearing a bigger map.
    const MILLION = 1_000_000;
    for (const id of MISSIONS)
      for (const size of SIZES)
        for (const seed of WALK_SEEDS) {
          const def = resolveLevelDef(id, seed, size);
          const knots = (def.spawners ?? []).filter((s) => !s.hellgate);
          const perMillion =
            knots.length / ((def.width * def.height) / MILLION);
          expect(
            perMillion,
            `${id}/${size}/${seed} carves an empty map (${perMillion.toFixed(2)} knots/Mpx²)`,
          ).toBeGreaterThan(1);
          // …and the horde in them, so density is not met with a scatter of
          // three-mob knots.
          const mobs = knots.reduce(
            (n, k) => n + k.members.reduce((a, m) => a + m.count, 0),
            0,
          );
          expect(
            mobs / ((def.width * def.height) / MILLION),
            `${id}/${size}/${seed} queues too little horde`,
          ).toBeGreaterThan(25);
        }
  });

  it("walks the blueprint's whole level ladder, top rung included", () => {
    // The ramps are the horde's per-difficulty LEVELS, authored against
    // `content/ladder.yaml` exactly like a hand-authored map's. Depth is measured
    // to the deepest cell on the map — and the deepest cells are precisely the
    // ones that hold no knot (the boss's, the caches, the trader's), so reading
    // the ramps off raw depth left the last rung or two unreachable and the
    // generated horde a couple of levels softer than the authored one.
    for (const id of MISSIONS) {
      const ramps = MAP_BLUEPRINTS[id]?.horde.ramps;
      if (!ramps) throw new Error(`no blueprint for "${id}"`);
      const used = new Set<string>();
      for (const seed of SEEDS)
        for (const knot of resolveLevelDef(id, seed, "medium").spawners ?? []) {
          if (knot.hellgate) continue;
          const band = JSON.stringify(knot.mobLevels);
          // Every knot stands on a rung of the authored ladder — never a number
          // the generator made up.
          expect(
            ramps.some((r) => JSON.stringify(r) === band),
            `${id} knot off the ladder: ${band}`,
          ).toBe(true);
          used.add(band);
        }
      expect(
        used.has(JSON.stringify(ramps[0])),
        `${id} never uses its first ramp`,
      ).toBe(true);
      expect(
        used.has(JSON.stringify(ramps[ramps.length - 1])),
        `${id} never uses its deepest ramp`,
      ).toBe(true);
    }
  });
});

describe("compass regions", () => {
  it("read a bare direction as a whole band and a pair as one ninth", () => {
    const band = regionRect("north", 900, 900);
    expect(band).toEqual({ x: 0, y: 0, width: 900, height: 300 });
    const ninth = regionRect("center-east", 900, 900);
    expect(ninth).toEqual({ x: 600, y: 300, width: 300, height: 300 });
    expect(regionRect("northeast", 900, 900)).toEqual({
      x: 600,
      y: 0,
      width: 300,
      height: 300,
    });
    // A lone `center` centres both axes; beside a direction it centres only the
    // axis that direction left free.
    expect(regionRect("center", 900, 900)).toEqual({
      x: 300,
      y: 300,
      width: 300,
      height: 300,
    });
  });

  it("spell the diagonals either way round", () => {
    expect(parseRegion("northeast")).toEqual(parseRegion("north-east"));
    expect(parseRegion("south-west")).toEqual(parseRegion("southwest"));
  });

  it("throw on a name nobody can resolve", () => {
    // Silently relocating a boss because its region was misspelled is exactly the
    // kind of bug a generated map hides, so this is a build break by design.
    expect(() => parseRegion("nortlh")).toThrow();
    expect(() => parseRegion("")).toThrow();
    expect(() => parseRegion("north-south")).toThrow();
  });
});
