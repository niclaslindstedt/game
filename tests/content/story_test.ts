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
  ENEMY_AI,
  ENEMY_DEFS,
  enemyDef,
  mobRushSpeed,
  gearDef,
  promptPendingPoints,
  isWeaponDef,
  LEVELS,
  MAP_BLUEPRINTS,
  LEVEL_ORDER,
  step,
  STORY_ITEM_DEFS,
  storyItemDef,
  WEAPON_DEFS,
  weaponAssumedTargets,
  baseCritMult,
  weaponDef,
  type Enemy,
  type GameState,
} from "@game/core";

import {
  clearStage,
  DT,
  equipRangedSidearm,
  idle,
  makeEnemy,
  mobSpeedMult,
  run,
  SEED,
  startGame,
  steerTo,
  stopWaves,
} from "../helpers.ts";

import { distance as dist } from "@game/lib/vec.ts";

/** A hand-placed NIGHT MANAGER, parked `away` px right of the player. */
function placeElite(state: GameState, away: number): Enemy {
  const elite = makeEnemy(
    {
      pos: { x: state.players[0].pos.x + away, y: state.players[0].pos.y },
      hp: 150,
      maxHp: 150,
      mlvl: 99,
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
    // Dormant means no hunt — the night manager may potter around his post
    // (the "at work" stroll, `ai.idle: "work"`), but never leaves its patch.
    expect(dist(elite.pos, post)).toBeLessThanOrEqual(ENEMY_AI.work.range[1]);
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
    // In WORLD PX/S: the authored rush after the horde's tempo scale AND the
    // world's shipped pace, which together are what the mob is actually moved
    // at (see mobRushSpeed / mobSpeedMult).
    const rushSpeed = mobRushSpeed(enemyDef("night_manager")) * mobSpeedMult();

    const before = { ...elite.pos };
    step(state, idle, DT);
    // The rush covers rushSpeed px/s, far above the def's fighting speed.
    expect(dist(elite.pos, before)).toBeCloseTo((rushSpeed * DT) / 1000, 1);

    run(state, idle, 200, (s) => s.phase === "dialogue");
    expect(state.phase).toBe("dialogue");
    expect(dist(elite.pos, state.players[0].pos)).toBeLessThanOrEqual(
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

    const playerAt = { ...state.players[0].pos };
    const timeAt = state.stats.timeMs;
    run(state, steerTo(2000, 800), 30);
    expect(state.players[0].pos).toEqual(playerAt);
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
    state.players[0].pos.x = elite.pos.x + 200;
    // This assertion is about THE RUSH BEING OVER, not about the speaker's own
    // kit. Every elite carries set-piece abilities now (see the elite tier in
    // defs/enemies/abilities.ts), and a speaker standing point-blank as its
    // scene closes will quite reasonably open with one — which roots it for the
    // windup and would read here as "it did not resume". So the scratch is
    // cleared for the one step being measured; what is under test is the speed
    // it walks at once it does walk.
    elite.mech = {};
    step(state, idle, DT);
    expect(dist(elite.pos, before)).toBeCloseTo(
      (elite.speed * mobSpeedMult() * DT) / 1000,
      1,
    );
  });

  it("keeps a pending level-up banked as the scene ends", () => {
    const state = startGame();
    clearStage(state);
    placeElite(state, 120);
    run(state, idle, 200, (s) => s.phase === "dialogue");

    state.players[0].pendingStatPoints = 1;
    finishDialogue(state);
    // The scene closes back to play; the point stays banked for the
    // on-demand chooser (a ding never forces the screen).
    expect(state.phase).toBe("playing");
    expect(state.players[0].pendingStatPoints).toBe(1);
    expect(promptPendingPoints(state, state.players[0])).toBe(true);
    expect(state.players[0].screen).toBe("levelup");
  });

  it("forfeits the arrival scene — never the drops or last words — mid-rush", () => {
    const state = equipRangedSidearm(startGame()); // ranged: kill the rush at reach
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
    state.players[0].pos = { x: boss.pos.x - 80, y: boss.pos.y };

    run(state, idle, 10, (s) => s.phase === "dialogue");
    expect(state.phase).toBe("dialogue");
    const content = dialogueContent(state.dialogue!);
    expect(content.speaker).toBe("THE FLAGBEARER");

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
      pos: { ...state.players[0].pos },
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
    expect(state.players[0].inventory.every((cell) => cell === null)).toBe(
      true,
    );
  });

  it("places the anti-grav unit inside the level-1 vault", () => {
    const state = startGame(SEED, "goodco_hq");
    const unit = state.items.find(
      (i) => i.kind === "story" && i.defId === "antigrav_unit",
    );
    expect(unit).toBeDefined();
  });

  it("puts the AI CORE's log on the floor, and its keycard on THE ARCHITECT", () => {
    const state = startGame(SEED, "goodco_hq");
    // The payoff is somewhere on the floor — the carve strings the story
    // pieces along its own depth axis, so which room is the run's answer.
    const log = state.items.find(
      (i) => i.kind === "story" && i.defId === "core_log",
    );
    expect(log).toBeDefined();
    // …and the card that names the CORE is the one THE ARCHITECT drops.
    const key = storyItemDef("keycard_core");
    expect(key.unlocks).toBe("core");
    const architectKeys = enemyDef("architect").loot?.storyItems ?? [];
    expect(architectKeys).toContain("keycard_core");
  });
});

describe("catalog integrity", () => {
  const elites = Object.values(ENEMY_DEFS).filter((d) => d.role === "elite");

  it("fields 3-5 speaking, loot-bearing elites per campaign level", () => {
    // THE CAMPAIGN's levels, by name. Secret venues (the bunker) field their
    // own roster shape and get their own rule below; a DISPLAY CASE (the
    // effects gallery's stage) casts nobody at all. Apparitions are
    // dialogue-only figures, not the loot-bearing story fights this rule
    // counts — same.
    for (const id of LEVEL_ORDER) {
      const level = LEVELS[id]!;
      const placed = MAP_BLUEPRINTS[level.id]!.elites.map((e) =>
        enemyDef(e.enemy),
      ).filter((d) => d.role === "elite" && !d.apparition);
      expect(placed.length).toBeGreaterThanOrEqual(3);
      expect(placed.length).toBeLessThanOrEqual(5);
      for (const def of placed) {
        expect(def.dialogue?.length ?? 0).toBeGreaterThan(0);
        expect(def.loot?.items?.length ?? 0).toBeGreaterThan(0);
        expect(def.ai.rushSpeed ?? 0).toBeGreaterThan(def.speed);
      }
    }
  });

  it("fields six far-tougher speaking residents in the bunker", () => {
    const bunker = MAP_BLUEPRINTS.the_bunker!;
    const placed = [...bunker.elites, ...bunker.guardians]
      .map((e) => enemyDef(e.enemy))
      .filter((d) => d.role === "elite" && !d.apparition);
    expect(placed.length).toBe(6);
    // The toughest campaign elite tops out around 950 hp — every resident
    // is a class above it (the farm level's fights ARE the price), speaks,
    // pays generous tier drops, and rushes into view like any story elite.
    for (const def of placed) {
      expect(def.hp, def.id).toBeGreaterThanOrEqual(1600);
      expect(def.levelBonus ?? 0, def.id).toBeGreaterThanOrEqual(6);
      expect(def.dialogue?.length ?? 0, def.id).toBeGreaterThan(0);
      expect(def.lastWords?.length ?? 0, def.id).toBeGreaterThan(0);
      expect(
        Object.keys(def.loot?.tierDrops ?? {}).length,
        def.id,
      ).toBeGreaterThan(0);
      expect(def.ai.rushSpeed ?? 0, def.id).toBeGreaterThan(def.speed);
    }
    // Every resident is ringed by his personal detail: an ESCORT that comes
    // out of the carve with him, wherever the search finds his suite.
    for (const piece of bunker.elites) {
      const detail = (piece.escort ?? []).reduce((n, g) => n + g.count, 0);
      expect(detail, piece.enemy).toBeGreaterThanOrEqual(3);
    }
  });

  it("keeps every apparition a pure dialogue figure", () => {
    for (const def of Object.values(ENEMY_DEFS)) {
      if (!def.apparition) continue;
      // It exists to speak — and to do nothing else.
      expect(def.dialogue?.length ?? 0, def.id).toBeGreaterThan(0);
      expect(def.loot, def.id).toBeUndefined();
      expect(def.lastWords, def.id).toBeUndefined();
      expect(def.contactDamage, def.id).toBe(0);
      expect(def.role, def.id).toBe("elite");
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

  it("resolves every dropped story item, and keeps each door to one key", () => {
    for (const def of Object.values(ENEMY_DEFS)) {
      for (const id of def.loot?.storyItems ?? []) {
        expect(STORY_ITEM_DEFS[id], id).toBeDefined();
      }
    }
    // A door has exactly ONE key. Which doors a carve actually hangs is the
    // blueprint's business (`locks:` / `annex.lock`, checked in
    // generated_maps_test.ts); what binds here is the catalog half — two
    // keycards claiming the same door would make one of them meaningless.
    const doorIds = new Set(
      Object.values(STORY_ITEM_DEFS)
        .map((d) => d.unlocks)
        .filter((id): id is string => Boolean(id)),
    );
    for (const doorId of doorIds) {
      const keys = Object.values(STORY_ITEM_DEFS).filter(
        (d) => d.unlocks === doorId,
      );
      expect(keys, doorId).toHaveLength(1);
    }
  });

  it("prices elite signatures at or under the boss trophies", () => {
    // The promise: elite weapons are good, boss drops stay at least as good.
    // Raw dps can't compare a cone cleaver to a single-target thrust, so the
    // comparison runs in the damage-budget model's EFFECTIVE dps (per-target
    // dps × assumed targets × class-based crit lift at a reference 15%
    // crit) — the same math the arsenal is priced in, where a special's
    // worth is its levelReq. Ties are fine (same-req specials share a
    // budget); a boss trophy must never be strictly weaker.
    const eff = (id: string) => {
      const def = weaponDef(id);
      return (
        ((def.damage * 1000) / def.cooldownMs) *
        weaponAssumedTargets(def) *
        (1 + 0.15 * (baseCritMult(def) - 1))
      );
    };
    const bossTrophies: Record<string, string[]> = {
      goodco_hq: ["plasma_cutter"],
      moon: ["machete"],
    };
    const eliteDrops: Record<string, string[]> = {
      goodco_hq: ["executive_putter", "wet_floor_sign"],
      moon: ["core_drill", "surveyors_pick"],
    };
    for (const level of Object.keys(bossTrophies)) {
      const bossBest = Math.max(...bossTrophies[level]!.map(eff));
      for (const id of eliteDrops[level]!) {
        expect(eff(id), id).toBeLessThanOrEqual(bossBest);
      }
    }
  });
});
