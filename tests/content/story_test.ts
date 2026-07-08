// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The story systems: unique (elite) mobs that rush into view and talk, boss
// confrontation scenes, story-item lore, and the locked doors their keys
// open. Dialogue freezes the run in the `dialogue` phase; `advanceDialogue`
// is the player's tap.

import { describe, expect, it } from "vitest";

import {
  advanceDialogue,
  DIALOGUE,
  dialogueContent,
  ENEMY_DEFS,
  enemyDef,
  gearDef,
  isWeaponDef,
  LEVELS,
  step,
  STORY_ITEM_DEFS,
  storyItemDef,
  WEAPON_DEFS,
  weaponDef,
  type Enemy,
  type GameState,
} from "@game/core";

import {
  clearStage,
  DT,
  equipBlaster,
  idle,
  makeEnemy,
  run,
  SEED,
  startGame,
  steerTo,
  stopWaves,
} from "../helpers.ts";

const dist = (a: { x: number; y: number }, b: { x: number; y: number }) =>
  Math.hypot(a.x - b.x, a.y - b.y);

/** A hand-placed NIGHT MANAGER, parked `away` px right of the player. */
function placeElite(state: GameState, away: number): Enemy {
  const elite = makeEnemy(
    {
      pos: { x: state.player.pos.x + away, y: state.player.pos.y },
      hp: 150,
      maxHp: 150,
      speed: 22,
    },
    "night_manager",
  );
  state.enemies.push(elite);
  return elite;
}

/** Tap through the whole running scene so play resumes. */
function finishDialogue(state: GameState): void {
  for (let taps = 0; taps < 20 && state.phase === "dialogue"; taps++) {
    advanceDialogue(state);
  }
  expect(state.phase).not.toBe("dialogue");
}

describe("elite ambushes", () => {
  it("sleeps at its post until the player comes close", () => {
    const state = startGame();
    clearStage(state);
    const elite = placeElite(state, 400); // outside the 240 aggro
    const post = { ...elite.pos };

    run(state, idle, 20);
    expect(elite.pos).toEqual(post);
    expect(elite.awake).toBeFalsy();
  });

  it("wakes when wounded, even from a sniper's distance", () => {
    const state = startGame();
    clearStage(state);
    const elite = placeElite(state, 400);
    elite.hp -= 1;

    const post = { ...elite.pos };
    step(state, idle, DT);
    expect(elite.awake).toBe(true);
    expect(dist(elite.pos, post)).toBeGreaterThan(0);
  });

  it("rushes into view faster than it fights, then opens its scene", () => {
    const state = startGame();
    clearStage(state);
    const elite = placeElite(state, 230); // inside aggro, off-screen-ish
    const rushSpeed = enemyDef("night_manager").ai.rushSpeed!;

    const before = { ...elite.pos };
    step(state, idle, DT);
    // The rush covers rushSpeed px/s, far above the def's fighting speed.
    expect(dist(elite.pos, before)).toBeCloseTo((rushSpeed * DT) / 1000, 1);

    run(state, idle, 200, (s) => s.phase === "dialogue");
    expect(state.phase).toBe("dialogue");
    expect(dist(elite.pos, state.player.pos)).toBeLessThanOrEqual(
      DIALOGUE.speakRadius,
    );
    expect(elite.spoke).toBe(true);
    expect(state.dialogue).toEqual({
      source: {
        kind: "enemy",
        enemyId: elite.id,
        defId: "night_manager",
      },
      page: 0,
    });
  });

  it("freezes the world while the scene holds", () => {
    const state = startGame();
    clearStage(state);
    placeElite(state, 120);
    run(state, idle, 200, (s) => s.phase === "dialogue");
    expect(state.phase).toBe("dialogue");
    expect(state.events).toContainEqual({
      type: "dialogueStarted",
      speaker: "THE NIGHT MANAGER",
    });

    const playerAt = { ...state.player.pos };
    const timeAt = state.stats.timeMs;
    run(state, steerTo(2000, 800), 30);
    expect(state.player.pos).toEqual(playerAt);
    expect(state.stats.timeMs).toBe(timeAt);
  });

  it("tapping through the pages resumes play, once per speaker", () => {
    const state = startGame();
    clearStage(state);
    const elite = placeElite(state, 120);
    run(state, idle, 200, (s) => s.phase === "dialogue");

    const pages = dialogueContent(state.dialogue!).pages;
    expect(pages.length).toBeGreaterThanOrEqual(2);
    for (let i = 0; i < pages.length; i++) advanceDialogue(state);
    expect(state.phase).toBe("playing");
    expect(state.dialogue).toBeNull();

    // The speaker stays point-blank, but the scene never reopens…
    run(state, idle, 20);
    expect(state.phase).toBe("playing");
    // …and it now moves at its fighting speed, not the rush.
    const before = { ...elite.pos };
    state.player.pos.x = elite.pos.x + 200;
    step(state, idle, DT);
    expect(dist(elite.pos, before)).toBeCloseTo((elite.speed * DT) / 1000, 1);
  });

  it("hands a pending level-up the stage as the scene ends", () => {
    const state = startGame();
    clearStage(state);
    placeElite(state, 120);
    run(state, idle, 200, (s) => s.phase === "dialogue");

    state.player.pendingStatPoints = 1;
    finishDialogue(state);
    expect(state.phase).toBe("levelup");
  });

  it("forfeits the arrival scene — never the drops or last words — mid-rush", () => {
    const state = equipBlaster(startGame()); // ranged: kill the rush at reach
    clearStage(state);
    state.rng = () => 0.99; // every bolt lands: no miss, dodge, or crit
    // Inside blaster range but outside the speak radius: the bolt reaches
    // the rushing speaker well before the speaker reaches its mark.
    const elite = placeElite(state, 150);
    elite.hp = 1;
    elite.maxHp = 10; // keep the kill XP under a level-up

    run(state, idle, 60, (s) => !s.enemies.includes(elite));
    expect(state.enemies).not.toContain(elite);
    // The arrival ambush never opened (the speaker died mid-rush), but the
    // death still takes the stage: its last words, not the arrival scene.
    expect(elite.spoke).toBeFalsy();
    expect(state.phase).toBe("dialogue");
    expect(state.dialogue?.source).toEqual({
      kind: "enemyDeath",
      defId: "night_manager",
    });
    expect(dialogueContent(state.dialogue!).pages).toEqual([
      enemyDef("night_manager").lastWords,
    ]);

    const drops = state.items;
    expect(
      drops.some(
        (i) =>
          i.kind === "equipment" && i.equipment.defId === "executive_putter",
      ),
    ).toBe(true);
    expect(
      drops.some((i) => i.kind === "story" && i.defId === "keycard_storage"),
    ).toBe(true);
  });
});

describe("boss confrontations", () => {
  it("opens the boss's scene at the stare-down", () => {
    const state = startGame();
    stopWaves(state);
    const boss = state.enemies.find((e) => enemyDef(e.defId).role === "boss")!;
    state.enemies = [boss];
    state.player.pos = { x: boss.pos.x - 80, y: boss.pos.y };

    run(state, idle, 10, (s) => s.phase === "dialogue");
    expect(state.phase).toBe("dialogue");
    const content = dialogueContent(state.dialogue!);
    expect(content.speaker).toBe("ARMSTRONG");

    finishDialogue(state);
    expect(boss.spoke).toBe(true);
  });

  it("gives bosses longer scenes than any elite", () => {
    const longest = (role: string) =>
      Math.max(
        ...Object.values(ENEMY_DEFS)
          .filter((d) => d.role === role)
          .map((d) => d.dialogue?.length ?? 0),
      );
    const shortestBoss = Math.min(
      ...Object.values(ENEMY_DEFS)
        .filter((d) => d.role === "boss")
        .map((d) => d.dialogue?.length ?? 0),
    );
    expect(shortestBoss).toBeGreaterThan(longest("elite"));
  });
});

describe("story items", () => {
  it("banks a pickup and plays its lore as a scene", () => {
    const state = startGame();
    clearStage(state);
    state.items.push({
      id: state.nextId++,
      kind: "story",
      pos: { ...state.player.pos },
      defId: "cargo_manifest",
    });

    step(state, idle, DT);
    expect(state.storyItems).toContain("cargo_manifest");
    expect(state.events).toContainEqual({
      type: "storyItemCollected",
      defId: "cargo_manifest",
    });
    expect(state.phase).toBe("dialogue");
    const content = dialogueContent(state.dialogue!);
    expect(content.speaker).toBe("CARGO MANIFEST");
    expect(content.pages).toEqual(storyItemDef("cargo_manifest").lore);

    finishDialogue(state);
    expect(state.phase).toBe("playing");
    // Plot lives outside the bag: nothing occupies an inventory cell.
    expect(state.player.inventory.every((cell) => cell === null)).toBe(true);
  });

  it("places the anti-grav unit inside the level-1 vault", () => {
    const state = startGame(SEED, "spacez_hq");
    const unit = state.items.find(
      (i) => i.kind === "story" && i.defId === "antigrav_unit",
    );
    expect(unit).toBeDefined();
  });

  it("locks the AI CORE's log behind THE ARCHITECT's keycard", () => {
    const state = startGame(SEED, "spacez_hq");
    // The payoff sits inside the CORE room…
    const log = state.items.find(
      (i) => i.kind === "story" && i.defId === "core_log",
    );
    expect(log).toBeDefined();
    // …and the only key to it is the keycard THE ARCHITECT drops.
    const key = storyItemDef("keycard_core");
    expect(key.unlocks).toBe("core");
    expect(state.doors.some((d) => d.id === "core")).toBe(true);
    const architectKeys = enemyDef("architect").loot?.storyItems ?? [];
    expect(architectKeys).toContain("keycard_core");
  });
});

describe("locked doors", () => {
  it("stays shut without the key, opens for its key, and only its own", () => {
    const state = startGame(SEED, "spacez_hq");
    stopWaves(state);
    state.enemies = state.enemies.filter(
      (e) => enemyDef(e.defId).role === "boss",
    );
    const storage = state.doors.find((d) => d.id === "storage")!;
    const vault = state.doors.find((d) => d.id === "vault")!;

    // Stand at the door empty-handed: nothing moves.
    state.player.pos = { x: storage.center.x, y: storage.center.y + 34 };
    step(state, idle, DT);
    expect(storage.open).toBe(false);

    // Bring the key: the chain vanishes and the event fires.
    state.storyItems.push("keycard_storage");
    step(state, idle, DT);
    expect(storage.open).toBe(true);
    expect(
      state.obstacles.some((o) => storage.obstacleIds.includes(o.id)),
    ).toBe(false);
    expect(state.events).toContainEqual({
      type: "doorOpened",
      pos: { ...storage.center },
    });

    // The other door doesn't care about this key.
    state.player.pos = { x: vault.center.x, y: vault.center.y - 34 };
    step(state, idle, DT);
    expect(vault.open).toBe(false);
    expect(
      state.obstacles.filter((o) => o.kind === "door_locked").length,
    ).toBeGreaterThan(0);
  });

  it("builds every level-1 door as a solid, unjumpable chain", () => {
    const state = startGame(SEED, "spacez_hq");
    expect(state.doors).toHaveLength(3);
    for (const door of state.doors) {
      const chain = state.obstacles.filter((o) =>
        door.obstacleIds.includes(o.id),
      );
      expect(chain.length).toBeGreaterThan(0);
      for (const link of chain) {
        expect(link.kind).toBe("door_locked");
        expect(link.jumpable).toBe(false);
      }
    }
  });
});

describe("catalog integrity", () => {
  const elites = Object.values(ENEMY_DEFS).filter((d) => d.role === "elite");

  it("fields 3-5 speaking, loot-bearing elites per level", () => {
    for (const level of Object.values(LEVELS)) {
      const placed = level.spawns
        .filter((s) => "at" in s)
        .map((s) => enemyDef(s.enemy))
        .filter((d) => d.role === "elite");
      expect(placed.length).toBeGreaterThanOrEqual(3);
      expect(placed.length).toBeLessThanOrEqual(5);
      for (const def of placed) {
        expect(def.dialogue?.length ?? 0).toBeGreaterThan(0);
        expect(def.loot?.items?.length ?? 0).toBeGreaterThan(0);
        expect(def.ai.rushSpeed ?? 0).toBeGreaterThan(def.speed);
      }
    }
  });

  it("keeps elite signature gear out of the random pools", () => {
    for (const def of elites) {
      for (const entry of def.loot?.items ?? []) {
        const id = typeof entry === "string" ? entry : entry.defId;
        if (isWeaponDef(id)) {
          expect(WEAPON_DEFS[id], id).toBeDefined();
          for (const level of Object.values(LEVELS)) {
            expect(level.loot.weaponPool).not.toContain(id);
          }
        } else {
          expect(gearDef(id), id).toBeDefined();
          for (const level of Object.values(LEVELS)) {
            expect(level.loot.gearPool).not.toContain(id);
          }
        }
      }
    }
  });

  it("resolves every dropped story item and every key's door", () => {
    const doorIds = Object.values(LEVELS).flatMap((level) =>
      (level.doors ?? []).map((d) => d.id),
    );
    for (const def of Object.values(ENEMY_DEFS)) {
      for (const id of def.loot?.storyItems ?? []) {
        expect(STORY_ITEM_DEFS[id], id).toBeDefined();
      }
    }
    for (const def of Object.values(STORY_ITEM_DEFS)) {
      if (def.unlocks) expect(doorIds).toContain(def.unlocks);
    }
    // Every locked door has exactly one key somewhere in the catalogs.
    for (const doorId of doorIds) {
      const keys = Object.values(STORY_ITEM_DEFS).filter(
        (d) => d.unlocks === doorId,
      );
      expect(keys, doorId).toHaveLength(1);
    }
  });

  it("prices elite signatures under the boss trophies, class for class", () => {
    // The promise: elite weapons are good, boss drops stay better. Compare
    // per level and weapon class via damage-per-second.
    const dps = (id: string) =>
      (weaponDef(id).damage * 1000) / weaponDef(id).cooldownMs;
    const bossTrophies: Record<string, string[]> = {
      spacez_hq: ["plasma_cutter"],
      moon: ["machete"],
    };
    const eliteDrops: Record<string, string[]> = {
      spacez_hq: ["executive_putter", "wet_floor_sign"],
      moon: ["core_drill", "surveyors_pick"],
    };
    for (const level of Object.keys(bossTrophies)) {
      const bossBest = Math.max(...bossTrophies[level]!.map(dps));
      for (const id of eliteDrops[level]!) {
        expect(dps(id), id).toBeLessThan(bossBest);
      }
    }
  });
});
