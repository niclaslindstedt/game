// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Level 1 — GOODCO HQ: the roster, the walls, and the loot table. Plus the
// catalog integrity rules every level must hold (pools resolve, sprites are
// named, wall chains leave no slip-through gaps).

import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  abilityDef,
  allocateStat,
  applyRunCommand,
  CAR,
  carIsWayOut,
  CHESTS,
  createGame,
  enemyDef,
  gearDef,
  isWeaponDef,
  LEVEL_ORDER,
  LEVELS,
  MAP_BLUEPRINTS,
  resolveLevelDef,
  runLevelDef,
  SECRET_LEVEL_ORDER,
  markThoughtsSeen,
  muteDialogue,
  OBSTACLES,
  PLAYER,
  dismissIntro,
  skipStoryOpening,
  step,
  STORY_ITEM_DEFS,
  weaponDef,
  type LevelDef,
} from "@game/core";
import {
  clearStage,
  DT,
  idle,
  makeEnemy,
  SEED,
  startGame,
  equipRangedSidearm,
} from "../helpers.ts";

const HQ = LEVELS.goodco_hq!;
const BLUEPRINT = MAP_BLUEPRINTS.goodco_hq!;
/** One representative floor — the map a run of GOODCO HQ actually builds. */
const carved = resolveLevelDef("goodco_hq", SEED);
import { distance as dist } from "@game/lib/vec.ts";

describe("GOODCO HQ level def", () => {
  it("is story level 1 and the default run", () => {
    expect(HQ.index).toBe(1);
    expect(LEVEL_ORDER[0]).toBe("goodco_hq");
    const state = createGame(SEED);
    expect(state.level.id).toBe("goodco_hq");
    expect(state.level.biome).toBe("goodco");
  });

  it("fields the night shift: staff, SUCCESSOR and ASSEMBLER robots, and PAYLOAD-1 at the rocket", () => {
    // The ambient horde is a DENSITY carved into knots, so the roster is the
    // blueprint's own breed mix — handed over along the search's depth axis.
    // HELLGATES are excluded: they are rampage-only bonus content on the top two
    // rungs (config HELLGATES), not part of the night shift this test describes.
    const minionIds = [
      ...new Set(BLUEPRINT.horde.members.map((m) => m.enemy)),
    ].sort();
    expect(minionIds).toEqual([
      "assembler",
      "engineer",
      "guard",
      "hazmat",
      "intern",
      "scientist",
      "successor",
    ]);

    const state = startGame(SEED, "goodco_hq");
    const boss = state.enemies.find((e) => enemyDef(e.defId).role === "boss")!;
    expect(boss.defId).toBe("payload_1");
    const rocket = state.landmarks.find((l) => l.kind === "rocket")!;
    expect(dist(boss.pos, rocket.pos)).toBeLessThan(
      enemyDef("payload_1").ai.leashRadius!,
    );
  });

  it("keeps every hop viable: jumpable obstacles clear under HQ gravity", () => {
    // Peak jump height v²/2g must beat the clear height with margin, or
    // "jumpable" desks and crates are a lie on this level.
    const peak = 240 ** 2 / (2 * HQ.gravity);
    expect(peak).toBeGreaterThan(OBSTACLES.clearHeight + 10);
  });

  it("builds walls as contiguous chains nothing can slip through", () => {
    const state = startGame(SEED, "goodco_hq");
    const wallCircles = state.obstacles.filter((o) => o.kind === "wall");
    expect(wallCircles.length).toBeGreaterThan(50);

    for (const wall of runLevelDef(state).walls!) {
      const online = wallCircles.filter(
        (o) =>
          // On the segment: collinear within a pixel and inside its bounds.
          Math.abs(
            (wall.to.x - wall.from.x) * (o.pos.y - wall.from.y) -
              (wall.to.y - wall.from.y) * (o.pos.x - wall.from.x),
          ) /
            dist(wall.from, wall.to) <
            1 &&
          o.pos.x >= Math.min(wall.from.x, wall.to.x) - 1 &&
          o.pos.x <= Math.max(wall.from.x, wall.to.x) + 1 &&
          o.pos.y >= Math.min(wall.from.y, wall.to.y) - 1 &&
          o.pos.y <= Math.max(wall.from.y, wall.to.y) + 1,
      );
      expect(online.length).toBeGreaterThan(1);
      // Endpoints are covered…
      expect(online.some((o) => dist(o.pos, wall.from) < 1)).toBe(true);
      expect(online.some((o) => dist(o.pos, wall.to) < 1)).toBe(true);
      // …and neighbouring circles overlap enough that no player-sized body
      // fits between them (gap between edges stays negative).
      const sorted = online
        .slice()
        .sort((a, b) => dist(a.pos, wall.from) - dist(b.pos, wall.from));
      for (let i = 1; i < sorted.length; i++) {
        const gap = dist(sorted[i]!.pos, sorted[i - 1]!.pos) - 2 * wall.radius;
        expect(gap).toBeLessThan(0);
      }
    }
  });

  it("keeps scattered furniture clear of the architecture", () => {
    const state = startGame(SEED, "goodco_hq");
    const walls = state.obstacles.filter((o) => o.kind === "wall");
    // ARCHITECTURE is not furniture, and a door is architecture however it is
    // drawn: an interior door wears its own sprite as its kind (`door_office`),
    // so the set is taken from `state.doors` rather than from a list of names —
    // a door stands IN the wall by definition, and holding one to the scatter's
    // clearance would be asking it not to touch the doorway it fills.
    const doorParts = new Set(state.doors.flatMap((d) => d.obstacleIds));
    // …AND SO IS THE GATEHOUSE, for exactly the same reason. The kiosk is stood
    // up against the entrance on purpose (`ArrivalsSpec.gatehouse`) — it is the
    // box somebody sits in to decide who comes through that gate — so holding it
    // to the SCATTER's clearance would be asking a guard box not to be beside
    // the thing it guards.
    const kiosk = runLevelDef(state).arrivals?.gatehouse?.sprite;
    const scattered = state.obstacles.filter(
      (o) => o.kind !== "wall" && o.kind !== kiosk && !doorParts.has(o.id),
    );
    expect(scattered.length).toBeGreaterThan(0);
    // BUCKETED, not every-against-every: a carved floor carries a couple of
    // thousand props and a wall of a similar order, and the honest pairwise
    // sweep is millions of comparisons (it timed the suite out). A uniform grid
    // over the wall circles answers the same question by looking only at the
    // cells a piece could possibly touch.
    const CELL = 64;
    const key = (cx: number, cy: number) => `${cx},${cy}`;
    const grid = new Map<string, typeof walls>();
    for (const wall of walls) {
      const cx = Math.floor(wall.pos.x / CELL);
      const cy = Math.floor(wall.pos.y / CELL);
      const bucket = grid.get(key(cx, cy));
      if (bucket) bucket.push(wall);
      else grid.set(key(cx, cy), [wall]);
    }
    const crowded: string[] = [];
    for (const piece of scattered) {
      const reach = piece.radius + OBSTACLES.spacing + 32;
      const x0 = Math.floor((piece.pos.x - reach) / CELL);
      const x1 = Math.floor((piece.pos.x + reach) / CELL);
      const y0 = Math.floor((piece.pos.y - reach) / CELL);
      const y1 = Math.floor((piece.pos.y + reach) / CELL);
      for (let cx = x0; cx <= x1; cx++) {
        for (let cy = y0; cy <= y1; cy++) {
          for (const wall of grid.get(key(cx, cy)) ?? []) {
            if (
              dist(piece.pos, wall.pos) <=
              piece.radius + wall.radius + OBSTACLES.spacing
            )
              crowded.push(`${piece.kind} at ${piece.pos.x},${piece.pos.y}`);
          }
        }
      }
    }
    expect(crowded).toEqual([]);
  });

  it("fields SUCCESSOR as a hard-hitting regular monster, not an elite", () => {
    const successor = enemyDef("successor");
    expect(successor.role).toBe("minion");
    // Not a story unique: no guaranteed elite/boss loot block, no dialogue.
    expect(successor.loot).toBeUndefined();
    expect(successor.dialogue).toBeUndefined();
    // Tougher and harder-hitting than every human on the floor.
    for (const id of ["intern", "scientist", "engineer", "guard", "hazmat"]) {
      const staff = enemyDef(id);
      expect(successor.hp).toBeGreaterThan(staff.hp);
      expect(successor.contactDamage).toBeGreaterThan(staff.contactDamage);
    }
    // …but its payoff is a sweetened drop roll, not a pinned drop.
    expect(successor.dropProfile?.dropBonus).toBeGreaterThan(0);
  });

  it("drops far more often than a plain staffer (its dropProfile)", () => {
    // Kill a stack of 1-hp mobs parked in blaster reach but out of pickup
    // range, and count what falls; SUCCESSOR's dropProfile should rain gear
    // where an intern trickles it. Averaged over seeds so one unlucky run
    // can't flip the comparison.
    const dropsFrom = (defId: string, seed: number): number => {
      const state = equipRangedSidearm(startGame(seed, "goodco_hq")); // pick off at range
      clearStage(state); // just the parked boss remains, waves silenced
      state.spawners = []; // silence the spawn points so only the parked stack drops
      // Silence the employee stampede too, or a charging herd would trample the
      // parked stack dead (an environmental kill drops nothing) and skew the
      // drop-rate comparison this test isolates.
      state.stampedes = [];
      state.stampedeTimerMs = Number.POSITIVE_INFINITY;
      state.items = [];
      state.players[0].stats.luck = 0; // isolate the base rate + the profile bonus
      // …AND SILENCE THE ARRIVAL SCENES. A stack of forty staffers parked in
      // plain sight raises one, the scene FREEZES the run, and `idle` never
      // taps it away — so the loop below spent its whole budget on a held
      // dialogue box, one round fired, forty mobs alive, and the test timed out
      // rather than failing on anything it was measuring. Muting is the honest
      // fix: this measures the drop ladder, not who says what on the way to it.
      muteDialogue(state);
      // The parked stack sits inside the sight radius — mute the level's
      // sight-pinned story beats so the run measures drops, not dialogue.
      state.thoughtsSeen.push("goodco_staff", "goodco_successor");
      const N = 40;
      for (let i = 0; i < N; i++) {
        state.enemies.push(
          makeEnemy(
            {
              id: 9000 + i,
              pos: {
                x: state.players[0].pos.x + 80,
                y: state.players[0].pos.y + (i - N / 2) * 2,
              },
              // Wounded down to 1 hp under a tall max bar: the bolt finishes
              // each in one hit (fast) without ever exceeding its FULL health,
              // so the OVERKILL TOLL never discounts the drop rate the
              // profiles are being compared on.
              hp: 1,
              maxHp: 100,
            },
            defId,
          ),
        );
      }
      // The tall bars pay real xp now — auto-spend each ding's point so the
      // stat chooser never freezes the massacre being measured.
      //
      // STOP WHEN THE KILLING STOPS, not when the field is empty. A staged
      // stack does not reliably clear to the last body — a straggler drifts
      // out of the sidearm's reach, or behind something — and waiting for one
      // spent the whole 40,000-tick budget six times over and timed the test
      // out at twenty seconds without failing on anything it measures. A stall
      // is the honest end of the massacre, and it costs the comparison nothing:
      // both sides are staged identically, so a straggler is a straggler on
      // each.
      const STALL = 900; // ~15 s of sim with nobody dying
      let alive = state.enemies.length;
      let lastKill = 0;
      for (let i = 0; i < 40_000 && state.enemies.length > 1; i++) {
        step(state, idle, DT);
        while (state.players[0].pendingStatPoints > 0) {
          allocateStat(state, state.players[0], "stamina");
        }
        if (state.enemies.length < alive) {
          alive = state.enemies.length;
          lastKill = i;
        } else if (i - lastKill > STALL) {
          break;
        }
      }
      // GOLD is excluded, and has to be: this measures the `dropProfile`
      // bonus on the LOOT LADDER, and gold is a second faucet paid at a flat
      // one-in-five to both bodies alike (config GOLD). Counting it would add
      // the same constant to each side and shrink the very difference the
      // comparison exists to see.
      return state.items.filter((i) => i.kind !== "gold").length;
    };

    let successorTotal = 0;
    let internTotal = 0;
    for (const seed of [1, 2, 3]) {
      successorTotal += dropsFrom("successor", seed);
      internTotal += dropsFrom("intern", seed);
    }
    expect(successorTotal).toBeGreaterThan(internTotal + 20);
    // Six full sim runs of statistics: give the sampling headroom over the
    // 5 s default — CI runners cross it while the assertion itself is sound.
  }, 20_000);

  it("replays drop to an armed title card (skipStoryOpening)", () => {
    // A die-and-retry loop shouldn't sit through the briefing or the scripted
    // opening strike every time — one call bails the story and arms the
    // holstered hero (who would otherwise wait on the strike that never
    // comes, since its thought is marked seen). The level-name card is KEPT:
    // it is orientation, not story, so even an arrival through the garage's
    // car door announces where the run starts.
    const state = createGame(SEED, "goodco_hq");
    // The living-room prelude moved HOME (the campaign opens in the garage
    // now), so GOODCO itself opens on the intro monologue.
    expect(state.phase).toBe("intro");
    expect(state.players[0].disarmed).toBe(true);
    skipStoryOpening(state);
    expect(state.phase).toBe("title");
    expect(state.cutscene).toBeNull();
    expect(state.players[0].disarmed).toBe(false);
    dismissIntro(state);
    expect(state.phase).toBe("playing");
  });

  it("silences an already-read inner monologue on replay (markThoughtsSeen)", () => {
    // The packed opening ring would fire the SCIENTIST/staff sighting beat the
    // instant an intern is on screen; pre-marking it seen keeps a replay quiet.
    const seen = createGame(SEED, "goodco_hq");
    skipStoryOpening(seen);
    dismissIntro(seen);
    markThoughtsSeen(seen, [
      "goodco_staff",
      "goodco_armed",
      "goodco_successor",
    ]);
    let opened = false;
    for (let i = 0; i < 400 && !opened; i++) {
      step(seen, idle, DT);
      if (seen.dialogue?.source.kind === "playerThought") opened = true;
    }
    expect(opened).toBe(false);
  });

  it("spawns the player clear of every wall", () => {
    const state = startGame(SEED, "goodco_hq");
    for (const wall of state.obstacles.filter((o) => o.kind === "wall")) {
      expect(dist(state.players[0].pos, wall.pos)).toBeGreaterThan(
        wall.radius + PLAYER.radius,
      );
    }
  });

  it("staffs a WORKING night shift: every staffer potters when dormant", () => {
    // The whole GOODCO roster (minions, the rare/unique finds, and the five
    // speaking elites) carries the dormant "at work" stroll, so the plant
    // reads as people working the floor instead of statues. Only the boss
    // (PAYLOAD-1 booting under the rocket) and the scripted opening rusher
    // stand their posts frozen.
    const working = [
      "intern",
      "scientist",
      "engineer",
      "guard",
      "hazmat",
      "successor",
      "assembler",
      "wandering_tourist",
      "night_shift_temp",
      "employee_of_the_month",
      "night_manager",
      "security_chief",
      "janitor",
      "head_scientist",
      "architect",
    ];
    for (const id of working) expect(enemyDef(id).ai.idle).toBe("work");
    expect(enemyDef("payload_1").ai.idle).toBeUndefined();
    // The working staff aggro about a screen out — near enough that the
    // player SEES the shift at work before it turns on him, far enough that
    // a freshly-spawned wave (ENEMY_AI.minSpawnDistance + ring) still
    // converges at once.
    for (const id of working.slice(0, 9)) {
      const r = enemyDef(id).ai.aggroRadius;
      expect(r).toBeGreaterThan(300);
      expect(r).toBeLessThan(500);
    }
  });

  it("lays the assembly line out in RANKS rather than scatter", () => {
    // A rocket does not get built by parts lying about at random: the fuselage
    // sections queue down the bay in a line, the gantries flank them, and the
    // aisle between is where the fight happens. The blueprint says so with
    // `row` objects, and the carve walks each one down its cell's long axis.
    const ranks = BLUEPRINT.objects.filter((o) => o.type === "row");
    expect(ranks.map((o) => o.id).sort()).toEqual([
      "conveyor",
      "fuselage_section",
      "gantry",
      "lane_line",
      "server_rack",
    ]);
    // Every rank is broken in the middle (a bank of one, then an aisle), so a
    // bay keeps a cross-corridor rather than becoming a wall of hardware.
    for (const rank of ranks) expect(rank.aisle ?? 0).toBeGreaterThan(0);

    // `propLines` carries two different things now, and only one of them is a
    // rank: a RANK is a run the carve walked down a cell, and a PREFAB's fixed
    // prop is a single point (`from === to`) standing exactly where the static
    // room authored it. Split them by that, and hold each to its own claim.
    const lines = carved.propLines ?? [];
    const runs = lines.filter((l) => dist(l.from, l.to) > 0);
    const pinned = lines.filter((l) => dist(l.from, l.to) === 0);
    expect(runs.length).toBeGreaterThan(0);
    // A rank is a real run rather than one lonely prop.
    for (const line of runs)
      expect(dist(line.from, line.to)).toBeGreaterThan(line.spacing);
    // …and the janitor's cupboard is standing somewhere on this floor, with the
    // mop bucket it is recognisable by.
    expect(pinned.some((l) => l.sprite === "mop_bucket")).toBe(true);
  });

  it("wires every knotted elite to the knot it stands in", () => {
    // An elite that wakes RAISES its cell's knot — the sentry who pulls the
    // whole room, and the reason a careless search costs more than a careful
    // one. The carve names a knot after the cell it holds, so the link needs no
    // lookup table and cannot be authored wrong.
    const knotIds = new Set((carved.spawners ?? []).map((s) => s.id));
    const alarmed = carved.spawns.filter(
      (s): s is Extract<(typeof carved.spawns)[number], { at: unknown }> =>
        "at" in s && s.alarms !== undefined,
    );
    expect(alarmed.length).toBeGreaterThan(0);
    for (const s of alarmed) expect(knotIds.has(s.alarms!)).toBe(true);
  });

  it("rolls the conveyor: five belt-scroll frames ship beside the base sprite", () => {
    // The renderer cycles `<sprite>_0..n` frames for animated decor; the
    // belt's five frames (pattern period 5 px, one px per frame) must exist
    // as sprite sources or the belts fall back to a frozen line.
    for (let i = 0; i < 5; i++) {
      const frame = readFileSync(
        new URL(
          `../../content/sprites/goodco/conveyor_${i}.yaml`,
          import.meta.url,
        ),
        "utf8",
      );
      expect(frame).toContain(`name: conveyor_${i}`);
    }
  });

  it("partitions the floor into rooms with a way through each wall", () => {
    // The floor is cut into districts and the barrier between two of them falls
    // out of the PAIR (see mapgen/areas.ts): nothing between two open bays, a
    // partition with a doorway into a lab. What this pins is the shape that
    // makes it walkable — every wall is a chain of `wall` circles, and no wall
    // spans a whole cell edge without a gap somewhere along it.
    const walls = carved.walls ?? [];
    expect(walls.length).toBeGreaterThan(3);
    for (const wall of walls) {
      expect(wall.kind).toBe("wall");
      expect(wall.jumpable).toBe(false);
    }
    // The rooms it cuts are the blueprint's own, and at least one of them is
    // SEALED (one doorway in) — a floor of nothing but open bays is a field.
    expect(BLUEPRINT.areas.some((a) => a.enclosure === "hard")).toBe(true);
  });
});

describe("he parks, and he leaves in the car he parked", () => {
  // THE LOT IS THE LAST FRAME OF THE DRIVE. He arrives at GOODCO by road
  // (`driveParamsFor`), so the level opens on a man who has just got out of a
  // car — which only reads if the car is at arm's length rather than a car park
  // away, and if the machine standing there is the wagon rather than a prop.
  it("lands the hero at his own wing, clear of the body", () => {
    const state = startGame(SEED, "goodco_hq");
    const car = state.vehicles.find((v) => v.kind === "car");
    expect(car).toBeDefined();
    const gap = dist(state.players[0].pos, car!.pos);
    // Close enough to read as "he just shut that door"…
    expect(gap).toBeLessThan(CAR.boardRadius);
    // …and far enough that the landing is never inside the car's own blockers,
    // which would have to shove him out of his own wagon on frame one.
    expect(gap).toBeGreaterThan(CAR.footprint.radius + PLAYER.radius);
  });

  it("keeps the gold BOARD arrow down until PAYLOAD-1 is down", () => {
    // The mark is the one thing that says a car can be got into, and on this
    // venue the answer is no for the whole mission: the opening beat is walking
    // AWAY from it into the building.
    const state = startGame(SEED, "goodco_hq");
    expect(carIsWayOut(state)).toBe(false);
    expect(applyRunCommand(state, "enterCar", [], state.players[0])).toBe(
      false,
    );
  });

  it("has no LEVEL CLEAR at all — the way out is the wagon", () => {
    // Both halves are authored, and each is useless without the other: the
    // field names the beat, the door names where the trip goes.
    expect(HQ.exitByCar?.thought).toBe("goodco_back_to_car");
    const door = (HQ.travelDoors ?? []).find((d) => d.id === "car");
    expect(door?.to).toEqual(["garage"]);
    // …and the carve has to actually stand a car for him to walk back to.
    expect(carved.landmarks.some((l) => l.kind === "car")).toBe(true);
  });
});

describe("THE ATTRITION FLAMETHROWER never leaves the building", () => {
  // A gimmick with nine seconds of fuel is a thing you meet on ONE map. Every
  // other base in GOODCO's pool is repeated by the later venues' pools — that
  // is how the campaign's arsenal accumulates — and this one deliberately is
  // not, which is a promise no schema enforces. The `weaponPool` is the only
  // door a random drop comes through (`eligibleBases`), so naming it nowhere
  // else is what makes the weapon a GOODCO find.
  const FLAMETHROWER = "attrition_flamethrower";

  it("is in GOODCO's weapon pool and in no other level's", () => {
    expect(LEVELS.goodco_hq!.loot.weaponPool).toContain(FLAMETHROWER);
    for (const id of [...LEVEL_ORDER, ...SECRET_LEVEL_ORDER]) {
      if (id === "goodco_hq") continue;
      expect(LEVELS[id]!.loot.weaponPool).not.toContain(FLAMETHROWER);
    }
  });

  it("is a rigid two-handed burner whose tank is its whole gimmick", () => {
    const def = weaponDef(FLAMETHROWER);
    expect(def.burn).toBe(true);
    expect(def.class).toBe("melee");
    // The reach and arc are the TANK's, so a late build never turns nine
    // seconds of fuel into a room-clearing sweep.
    expect(def.rigid).toBe(true);
    expect(def.twoHanded).toBe(true);
    // It empties fast, and "fast" has to mean something against the catalog:
    // well under the leanest ordinary plain drop rather than merely low. Only
    // the weapons that HAVE a wear budget are a comparison — the pool's ranged
    // bases carry ammunition instead of durability and never wear at all.
    const ordinary = LEVELS.goodco_hq!.loot.weaponPool.filter(
      (id) => id !== FLAMETHROWER,
    )
      .map((id) => weaponDef(id).durability)
      .filter((wear): wear is number => wear !== undefined);
    const mean = ordinary.reduce((a, b) => a + b, 0) / ordinary.length;
    expect(def.durability).toBeLessThan(mean / 2);
  });
});

describe("the vending banks pay the sprint pool", () => {
  // The machines have always been breakable — a `loot` block makes a prop
  // breakable on its own (mapgen/place.ts) — but restricted to the `floor`
  // district they were priced over a carved area that swings run to run, and a
  // fair share of carves stood a whole shift with no vending machine anywhere.
  // A prop that is absent on some runs is a prop the player never learns the
  // rules of, so the floor of that spread is what this pins, on every SIZE
  // rather than on one: the zero came from a district being small, and only the
  // small maps can get that small.
  it("stands smashable, stamina-paying machines on every carve", () => {
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      const carved = resolveLevelDef("goodco_hq", seed);
      const line = carved.obstacles.find((o) => o.kind === "vending");
      expect(line, `seed ${seed} carved no vending line`).toBeDefined();
      expect(line!.count).toBeGreaterThan(0);
      expect(line!.breakable).toBe(true);
      // A coin flip, and what it pays is a stamina drink — the one resource
      // this map's own merchant sells and its sprint economy runs on.
      expect(line!.loot?.chance).toBe(0.5);
      expect(Object.keys(line!.loot?.drop ?? {})).toEqual(["stamina"]);
    }
  });

  it("mints them with live break hp and their spill odds", () => {
    const state = startGame(SEED, "goodco_hq");
    const machines = state.obstacles.filter((o) => o.kind === "vending");
    expect(machines.length).toBeGreaterThan(0);
    for (const machine of machines) {
      expect(machine.breakable).toBe(true);
      expect(machine.hp).toBeGreaterThan(0);
      expect(machine.lootChance).toBe(0.5);
      expect(machine.lootDrop).toEqual({ stamina: 1 });
    }
  });
});

describe("the off-path detour lockers", () => {
  it("places a GOODCO locker at each dead end, all breakable containers", () => {
    const state = startGame(SEED, "goodco_hq");
    const lockers = state.obstacles.filter((o) => o.chest);
    expect(lockers.length).toBe((runLevelDef(state).chests ?? []).length);
    expect(lockers.length).toBeGreaterThan(1);
    for (const locker of lockers) {
      expect(locker.sprite).toBe("locker");
      expect(locker.breakable).toBe(true);
      expect(locker.hp ?? 0).toBeGreaterThan(0);
    }
    // The default chest sprite is the locker (a GOODCO staff locker), not a
    // fallback rock.
    expect(CHESTS.sprite).toBe("locker");
  });

  it("guards each locker with one of the floor's pinned keepers", () => {
    // The EMPLOYEE OF THE MONTH is a KEEPER (not just a random rare): the
    // blueprint cycles its guardians across whichever cul-de-sacs the carve
    // grew, so a locker is never free.
    const keepers = BLUEPRINT.guardians.map((g) => g.enemy);
    expect(keepers).toContain("employee_of_the_month");
    expect(enemyDef("employee_of_the_month").rarity).toBe("unique");
    const guard = carved.spawns.find(
      (s) => "at" in s && s.enemy === "employee_of_the_month",
    ) as { enemy: string; at: { x: number; y: number } } | undefined;
    expect(guard).toBeDefined();
    // …and he stands in the pocket he is holding, beside its locker.
    const nearest = (carved.chests ?? [])
      .slice()
      .sort((a, b) => dist(a.at, guard!.at) - dist(b.at, guard!.at))[0]!;
    expect(dist(guard!.at, nearest.at)).toBeLessThan(600);
  });

  it("spills a Diablo-2 haul: an 80% marquee item plus guaranteed supplies", () => {
    // The locker's whole draw over a scattered crate — see crates_test for the
    // spill sim; here we pin the tuning the level relies on.
    expect(CHESTS.itemChance).toBeCloseTo(0.8);
    expect(CHESTS.consumables).toBeGreaterThan(0);
    expect(CHESTS.bonusItemChance).toBeGreaterThan(0);
  });
});

describe("THE ARCHITECT and the PASSAGE CHIP", () => {
  it("pins the old bench partner as a fifth speaking elite on the level", () => {
    expect(BLUEPRINT.elites.map((e) => e.enemy)).toContain("architect");
    const architect = carved.spawns.find(
      (s) => "at" in s && s.enemy === "architect",
    );
    expect(architect).toBeDefined();
    const def = enemyDef("architect");
    expect(def.role).toBe("elite");
    expect(def.dialogue?.length ?? 0).toBeGreaterThan(0);
    expect(def.lastWords?.length ?? 0).toBeGreaterThan(0);
    // Rushes into view like the other uniques before it talks.
    expect(def.ai.rushSpeed ?? 0).toBeGreaterThan(def.speed);
  });

  it("stays a shorter scene than the boss's confrontation", () => {
    expect(enemyDef("architect").dialogue!.length).toBeLessThan(
      enemyDef("payload_1").dialogue!.length,
    );
  });

  it("hits the meeting's beats: the plea, the obsolescence, the threat", () => {
    const script = enemyDef("architect")
      .dialogue!.flatMap((p) => (Array.isArray(p) ? p : p.hero))
      .join(" ");
    expect(script).toContain("QUIT");
    expect(script).toContain("SUPERINTELLIGENCE");
    expect(script).toContain("OBSOLETE");
    expect(script).toContain("GOODBYE, OLD FRIEND");
    // The plea is now the HERO's own page — a two-way scene, not a lecture.
    const heroSide = enemyDef("architect")
      .dialogue!.flatMap((p) => (Array.isArray(p) ? [] : p.hero))
      .join(" ");
    expect(heroSide).toContain("QUIT");
  });

  it("drops the chip he operated into himself", () => {
    const items = enemyDef("architect").loot?.items ?? [];
    const chip = items.find(
      (e) => (typeof e === "string" ? e : e.defId) === "passage_chip",
    );
    expect(chip).toBeDefined();
    // Forced regular so it lands as the plain, affix-free "+1 INT".
    expect(typeof chip === "string" ? undefined : chip?.tier).toBe("regular");
  });

  it("also drops the CORE KEYCARD that opens the AI CORE room", () => {
    const storyItems = enemyDef("architect").loot?.storyItems ?? [];
    expect(storyItems).toContain("keycard_core");
    // The card is a real key: it names the CORE door, and the level fields it.
    const key = STORY_ITEM_DEFS.keycard_core!;
    expect(key.unlocks).toBe("core");
  });

  it("makes the PASSAGE CHIP a passive +1 INT trinket", () => {
    const chip = gearDef("passage_chip");
    expect(chip.slot).toBe("trinket");
    expect(chip.passive?.intelligence).toBe(1);
    // Purely passive: no worn bonuses, no plating.
    expect(chip.bonuses).toEqual({});
    expect(chip.armor).toBeUndefined();
  });
});

describe("level catalog integrity", () => {
  // CARVED, because that is the level a run is played on: the mission carries
  // the loot pools and the story, the map carried the cast.
  const levels: LevelDef[] = Object.keys(LEVELS).map((id) =>
    resolveLevelDef(id, SEED),
  );

  it("gives every level a unique story index and an intro", () => {
    // Campaign indices are unique; a SECRET venue (the bunker) SHARES a
    // campaign index on purpose so the per-map XP-cap axis never shifts.
    const secret = new Set(SECRET_LEVEL_ORDER);
    const campaign = levels.filter((l) => !secret.has(l.id));
    expect(new Set(campaign.map((l) => l.index)).size).toBe(campaign.length);
    for (const l of levels.filter((l) => secret.has(l.id))) {
      expect(campaign.map((c) => c.index)).toContain(l.index);
    }
    for (const level of levels) expect(level.intro.length).toBeGreaterThan(0);
  });

  it("resolves every id referenced by spawns, waves, and loot", () => {
    for (const level of levels) {
      for (const spawn of level.spawns)
        expect(enemyDef(spawn.enemy)).toBeDefined();
      for (const line of level.waves?.budget ?? []) {
        expect(enemyDef(line.enemy)).toBeDefined();
      }
      for (const s of level.spawners ?? []) {
        for (const m of s.members) expect(enemyDef(m.enemy)).toBeDefined();
      }
      for (const id of level.loot.weaponPool)
        expect(weaponDef(id)).toBeDefined();
      for (const id of level.loot.gearPool) expect(gearDef(id)).toBeDefined();
      for (const id of level.loot.abilityPool) {
        expect(abilityDef(id)).toBeDefined();
      }
      if (level.loot.allClearWeapon) {
        expect(weaponDef(level.loot.allClearWeapon)).toBeDefined();
      }
      for (const entry of level.loot.earlyDrops ?? []) {
        if ("weapon" in entry) expect(weaponDef(entry.weapon)).toBeDefined();
        else if ("ability" in entry) {
          expect(abilityDef(entry.ability)).toBeDefined();
        }
      }
    }
  });

  it("resolves every boss guaranteed drop", () => {
    for (const level of levels) {
      for (const spawn of level.spawns) {
        const def = enemyDef(spawn.enemy);
        for (const entry of def.loot?.items ?? []) {
          const id = typeof entry === "string" ? entry : entry.defId;
          const resolved = isWeaponDef(id) ? weaponDef(id) : gearDef(id);
          expect(resolved).toBeDefined();
        }
      }
    }
  });
});
