// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Level 1 — SPACEZ HQ: the roster, the walls, and the loot table. Plus the
// catalog integrity rules every level must hold (pools resolve, sprites are
// named, wall chains leave no slip-through gaps).

import { describe, expect, it } from "vitest";

import {
  abilityDef,
  allocateStat,
  CHESTS,
  createGame,
  enemyDef,
  gearDef,
  isWeaponDef,
  LEVEL_ORDER,
  LEVELS,
  SECRET_LEVEL_ORDER,
  markThoughtsSeen,
  OBSTACLES,
  PLAYER,
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
  equipBlaster,
} from "../helpers.ts";

const HQ = LEVELS.spacez_hq!;
const dist = (a: { x: number; y: number }, b: { x: number; y: number }) =>
  Math.hypot(a.x - b.x, a.y - b.y);

describe("SPACEZ HQ level def", () => {
  it("is story level 1 and the default run", () => {
    expect(HQ.index).toBe(1);
    expect(LEVEL_ORDER[0]).toBe("spacez_hq");
    const state = createGame(SEED);
    expect(state.level.id).toBe("spacez_hq");
    expect(state.level.biome).toBe("spacez");
  });

  it("fields the night shift: five staff types plus the OPTIMUSK units and MUSKRAT at the rocket", () => {
    // The ambient horde is authored as SPAWN POINTS now, not a banded scatter —
    // so the roster is the union of every spawn point's mob types.
    const minionIds = [
      ...new Set(
        (HQ.spawners ?? []).flatMap((s) => s.members.map((m) => m.enemy)),
      ),
    ].sort();
    expect(minionIds).toEqual([
      "engineer",
      "guard",
      "hazmat",
      "intern",
      "optimusk",
      "scientist",
    ]);

    const state = startGame(SEED, "spacez_hq");
    const boss = state.enemies.find((e) => enemyDef(e.defId).role === "boss")!;
    expect(boss.defId).toBe("muskrat");
    const rocket = state.landmarks.find((l) => l.kind === "rocket")!;
    expect(dist(boss.pos, rocket.pos)).toBeLessThan(
      enemyDef("muskrat").ai.leashRadius!,
    );
  });

  it("keeps every hop viable: jumpable obstacles clear under HQ gravity", () => {
    // Peak jump height v²/2g must beat the clear height with margin, or
    // "jumpable" desks and crates are a lie on this level.
    const peak = 240 ** 2 / (2 * HQ.gravity);
    expect(peak).toBeGreaterThan(OBSTACLES.clearHeight + 10);
  });

  it("builds walls as contiguous chains nothing can slip through", () => {
    const state = startGame(SEED, "spacez_hq");
    const wallCircles = state.obstacles.filter((o) => o.kind === "wall");
    expect(wallCircles.length).toBeGreaterThan(50);

    for (const wall of HQ.walls!) {
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
    const state = startGame(SEED, "spacez_hq");
    const architecture = ["wall", "door_locked"];
    const walls = state.obstacles.filter((o) => o.kind === "wall");
    const scattered = state.obstacles.filter(
      (o) => !architecture.includes(o.kind),
    );
    expect(scattered.length).toBeGreaterThan(0);
    for (const piece of scattered) {
      for (const wall of walls) {
        expect(dist(piece.pos, wall.pos)).toBeGreaterThan(
          piece.radius + wall.radius + OBSTACLES.spacing,
        );
      }
    }
  });

  it("fields OPTIMUSK as a hard-hitting regular monster, not an elite", () => {
    const optimusk = enemyDef("optimusk");
    expect(optimusk.role).toBe("minion");
    // Not a story unique: no guaranteed elite/boss loot block, no dialogue.
    expect(optimusk.loot).toBeUndefined();
    expect(optimusk.dialogue).toBeUndefined();
    // Tougher and harder-hitting than every human on the floor.
    for (const id of ["intern", "scientist", "engineer", "guard", "hazmat"]) {
      const staff = enemyDef(id);
      expect(optimusk.hp).toBeGreaterThan(staff.hp);
      expect(optimusk.contactDamage).toBeGreaterThan(staff.contactDamage);
    }
    // …but its payoff is a sweetened drop roll, not a pinned drop.
    expect(optimusk.dropProfile?.dropBonus).toBeGreaterThan(0);
  });

  it("drops far more often than a plain staffer (its dropProfile)", () => {
    // Kill a stack of 1-hp mobs parked in blaster reach but out of pickup
    // range, and count what falls; OPTIMUSK's dropProfile should rain gear
    // where an intern trickles it. Averaged over seeds so one unlucky run
    // can't flip the comparison.
    const dropsFrom = (defId: string, seed: number): number => {
      const state = equipBlaster(startGame(seed, "spacez_hq")); // pick off at range
      clearStage(state); // just the parked boss remains, waves silenced
      state.spawners = []; // silence the spawn points so only the parked stack drops
      state.items = [];
      state.player.stats.luck = 0; // isolate the base rate + the profile bonus
      // The parked stack sits inside the sight radius — mute the level's
      // sight-pinned story beats so the run measures drops, not dialogue.
      state.thoughtsSeen.push("spacez_staff", "spacez_optimusk");
      const N = 40;
      for (let i = 0; i < N; i++) {
        state.enemies.push(
          makeEnemy(
            {
              id: 9000 + i,
              pos: {
                x: state.player.pos.x + 80,
                y: state.player.pos.y + (i - N / 2) * 2,
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
      for (let i = 0; i < 40_000 && state.enemies.length > 1; i++) {
        step(state, idle, DT);
        while (state.player.pendingStatPoints > 0) {
          allocateStat(state, "stamina");
        }
      }
      return state.items.length;
    };

    let optimuskTotal = 0;
    let internTotal = 0;
    for (const seed of [1, 2, 3]) {
      optimuskTotal += dropsFrom("optimusk", seed);
      internTotal += dropsFrom("intern", seed);
    }
    expect(optimuskTotal).toBeGreaterThan(internTotal + 20);
    // Six full sim runs of statistics: give the sampling headroom over the
    // 5 s default — CI runners cross it while the assertion itself is sound.
  }, 20_000);

  it("replays drop straight into an armed fight (skipStoryOpening)", () => {
    // A die-and-retry loop shouldn't sit through the prelude, the briefing, or
    // the scripted opening strike every time — one call bails the lot and arms
    // the holstered hero (who would otherwise wait on the strike that never
    // comes, since its thought is marked seen).
    const state = createGame(SEED, "spacez_hq");
    expect(state.phase).toBe("cutscene");
    expect(state.player.disarmed).toBe(true);
    skipStoryOpening(state);
    expect(state.phase).toBe("playing");
    expect(state.cutscene).toBeNull();
    expect(state.player.disarmed).toBe(false);
  });

  it("silences an already-read inner monologue on replay (markThoughtsSeen)", () => {
    // The packed opening ring would fire the SCIENTIST/staff sighting beat the
    // instant an intern is on screen; pre-marking it seen keeps a replay quiet.
    const seen = createGame(SEED, "spacez_hq");
    skipStoryOpening(seen);
    markThoughtsSeen(seen, ["spacez_staff", "spacez_armed", "spacez_optimusk"]);
    let opened = false;
    for (let i = 0; i < 400 && !opened; i++) {
      step(seen, idle, DT);
      if (seen.dialogue?.source.kind === "playerThought") opened = true;
    }
    expect(opened).toBe(false);
  });

  it("spawns the player clear of every wall", () => {
    const state = startGame(SEED, "spacez_hq");
    for (const wall of state.obstacles.filter((o) => o.kind === "wall")) {
      expect(dist(state.player.pos, wall.pos)).toBeGreaterThan(
        wall.radius + PLAYER.radius,
      );
    }
  });

  it("lays the floor out as grocery-store aisles: five shelf walls with gaps", () => {
    // Each aisle is authored as two vertical segments (a gap in the middle),
    // so the serpentine reads as five shelf runs at the aisle x-positions.
    const aisleX = [470, 770, 1070, 1370, 1610];
    for (const x of aisleX) {
      const segs = (HQ.walls ?? []).filter(
        (w) => w.from.x === x && w.to.x === x && w.from.y !== w.to.y,
      );
      // Two segments (top + bottom of the aisle) leaving a single pass-gap.
      expect(segs.length).toBe(2);
    }
  });
});

describe("the two off-path detour lockers", () => {
  it("places exactly two SpaceZ lockers, both breakable reward containers", () => {
    const state = startGame(SEED, "spacez_hq");
    const lockers = state.obstacles.filter((o) => o.chest);
    expect(lockers).toHaveLength(2);
    for (const locker of lockers) {
      expect(locker.sprite).toBe("locker");
      expect(locker.breakable).toBe(true);
      expect(locker.hp ?? 0).toBeGreaterThan(0);
    }
    // The default chest sprite is the locker (a SpaceZ staff locker), not a
    // fallback rock.
    expect(CHESTS.sprite).toBe("locker");
  });

  it("guards the BREAK ROOM locker with the level's pinned UNIQUE", () => {
    // The EMPLOYEE OF THE MONTH is pinned (not just a random rare) and stands
    // between the detour entrance and its locker.
    const guard = HQ.spawns.find(
      (s) => "at" in s && s.enemy === "employee_of_the_month",
    ) as { enemy: string; at: { x: number; y: number } } | undefined;
    expect(guard).toBeDefined();
    expect(enemyDef("employee_of_the_month").rarity).toBe("unique");
    const breakRoomLocker = (HQ.chests ?? []).find((c) => c.at.y < 600)!;
    expect(breakRoomLocker).toBeDefined();
    // The guardian sits within the same shallow pocket as the locker it holds.
    expect(dist(guard!.at, breakRoomLocker.at)).toBeLessThan(120);
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
    const architect = HQ.spawns.find(
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
      enemyDef("muskrat").dialogue!.length,
    );
  });

  it("hits the meeting's beats: the plea, the obsolescence, the threat", () => {
    const script = enemyDef("architect")
      .dialogue!.flatMap((p) => (Array.isArray(p) ? p : p.hero))
      .join(" ");
    expect(script).toContain("QUIT");
    expect(script).toContain("SUPERINTELLIGENCE");
    expect(script).toContain("OBSOLETE");
    expect(script).toContain("NOW YOU WILL DIE");
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
    expect((HQ.doors ?? []).some((d) => d.id === "core")).toBe(true);
  });

  it("makes the PASSAGE CHIP a passive +1 INT trinket", () => {
    const chip = gearDef("passage_chip");
    expect(chip.slot).toBe("charm");
    expect(chip.passive?.intelligence).toBe(1);
    // Purely passive: no worn bonuses, no plating.
    expect(chip.bonuses).toEqual({});
    expect(chip.armor).toBeUndefined();
  });
});

describe("level catalog integrity", () => {
  const levels = Object.values(LEVELS) as LevelDef[];

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
