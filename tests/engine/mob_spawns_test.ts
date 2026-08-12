// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// MOB POSTS (mob-spawns.ts): the one-mob-per-spawn model the STATIC PARTS maps
// field — a mob stands its authored post dormant, and the post refills on the
// difficulty's respawn clock once its occupant dies or is dragged off the
// leash. Exercised on the synthetic `test_mob_spawn_level` fixture.

import { describe, expect, it } from "vitest";

import { createGame, MOB_SPAWNS } from "@game/core";
import type { GameState } from "@game/core";
import { idle, makeEnemy, run, startGame } from "./helpers.ts";

/** The live occupant of a post, or undefined while it is vacant. */
function occupant(state: GameState, id: string) {
  const post = state.mobSpawns.find((m) => m.id === id)!;
  return state.enemies.find((e) => e.id === post.mobId);
}

describe("mob posts stand their first watch", () => {
  it("spawns one dormant mob per post, standing exactly where it was authored", () => {
    const state = startGame(1, "test_mob_spawn_level");
    expect(state.mobSpawns).toHaveLength(3);
    for (const post of state.mobSpawns) {
      const mob = state.enemies.find((e) => e.id === post.mobId);
      expect(mob, `post ${post.id} stands nobody`).toBeDefined();
      expect(mob!.post).toBe(post.id);
      // On the authored spot (the open fixture floor has nothing to shove it
      // off), asleep at its post rather than summoned-in awake.
      expect(mob!.pos).toEqual(post.at);
      expect(mob!.awake ?? false).toBe(false);
      expect(post.respawnAtMs).toBeNull();
    }
    // The patrol post's occupant walks the authored beat while dormant.
    const walker = occupant(state, "post_b")!;
    expect(walker.patrol).toBeDefined();
    expect(walker.patrol![1]).toEqual({ x: 900, y: 1100 });
  });

  it("scales the respawn clock by the rung, shorter on harder", () => {
    const medium = createGame(1, "test_mob_spawn_level", "medium");
    const jesus = createGame(1, "test_mob_spawn_level", "jesus");
    const base = medium.mobSpawns[0]!.respawnMs;
    expect(base).toBeGreaterThanOrEqual(MOB_SPAWNS.respawnMinMs);
    expect(jesus.mobSpawns[0]!.respawnMs).toBeLessThan(base);
  });
});

describe("a vacated post refills on the clock", () => {
  it("starts the clock when the occupant dies, and stands a replacement", () => {
    const state = startGame(1, "test_mob_spawn_level");
    const post = state.mobSpawns.find((m) => m.id === "post_far")!;
    post.respawnMs = 500; // a test-sized clock
    // Kill the occupant (as loot.ts's killEnemy does: a splice).
    const idx = state.enemies.findIndex((e) => e.id === post.mobId);
    state.enemies.splice(idx, 1);
    run(state, idle, 3);
    expect(post.mobId).toBeNull();
    expect(post.respawnAtMs).not.toBeNull();
    // Inside the clock: still vacant.
    run(state, idle, 10);
    expect(post.mobId).toBeNull();
    // Past it (the hero is far away): a fresh occupant stands the post.
    run(state, idle, 40);
    expect(post.mobId).not.toBeNull();
    const mob = occupant(state, "post_far")!;
    expect(mob.defId).toBe("test_fodder");
    expect(mob.awake ?? false).toBe(false);
    expect(post.respawnAtMs).toBeNull();
  });

  it("vacates a post whose occupant is dragged off the leash", () => {
    const state = startGame(1, "test_mob_spawn_level");
    const post = state.mobSpawns.find((m) => m.id === "post_far")!;
    const mob = occupant(state, "post_far")!;
    // Drag: awake and hauled a screen off its ground, as a kiting hero does —
    // with the hero standing beside it, so the aggro HOLDS (a mob that loses
    // its target walks home instead, and a post whose occupant is coming back
    // is not vacated).
    mob.awake = true;
    mob.pos = {
      x: post.at.x - (MOB_SPAWNS.leashRadius + 60),
      y: post.at.y,
    };
    state.players[0].pos = { x: mob.pos.x - 60, y: mob.pos.y };
    run(state, idle, 3);
    expect(post.mobId).toBeNull();
    expect(post.respawnAtMs).not.toBeNull();
    // The dragged mob keeps living — only its link home is cut.
    expect(state.enemies.includes(mob)).toBe(true);
    expect(mob.post).toBeUndefined();
  });

  it("holds a due respawn while a hero stands over the grave", () => {
    const state = startGame(1, "test_mob_spawn_level");
    const post = state.mobSpawns.find((m) => m.id === "post_a")!;
    post.respawnMs = 200;
    // Stand the hero ON the post and kill its occupant.
    state.players[0].pos = { ...post.at };
    const idx = state.enemies.findIndex((e) => e.id === post.mobId);
    state.enemies.splice(idx, 1);
    run(state, idle, 30); // well past the clock
    expect(post.mobId).toBeNull(); // held — no pop-in under his feet
    // Step away and the replacement stands up at once.
    state.players[0].pos = {
      x: post.at.x + MOB_SPAWNS.clearRadius + 80,
      y: post.at.y,
    };
    run(state, idle, 3);
    expect(post.mobId).not.toBeNull();
  });

  it("social aggro: a woken elite pulls its camp of posts", () => {
    // The parts maps' answer to the knot maps' alarm link: the sentry pulls
    // the room. An elite waking wakes every dormant post occupant within
    // MOB_SPAWNS.alarmRadius — and nothing beyond it.
    const state = startGame(1, "test_mob_spawn_level");
    const near = occupant(state, "post_a")!; // 700,1320
    const far = occupant(state, "post_far")!; // 2000,1320 — out of reach
    const elite = makeEnemy(
      { pos: { x: near.pos.x + 120, y: near.pos.y }, hp: 200, maxHp: 200 },
      "test_elite",
    );
    state.enemies.push(elite);
    expect(near.awake ?? false).toBe(false);
    // Wound the elite — the wake that raises the alarm on any map model. The
    // hero stands INSIDE the camp's aggro range (the minion AI re-sleeps a
    // mob whose hero has left its radius — walls-break-aggro by design) but
    // OUTSIDE the fog's reveal disc, or his auto-attack kills the very post
    // mob the assertion is about before the pull lands.
    elite.hp -= 1;
    state.players[0].pos = { x: 700, y: 900 };
    run(state, idle, 2);
    expect(elite.awake).toBe(true);
    expect(near.awake).toBe(true);
    expect(far.awake ?? false).toBe(false);
  });

  it("never respawns on a clearAll objective", () => {
    const state = startGame(1, "test_mob_spawn_clearall_level");
    const post = state.mobSpawns.find((m) => m.id === "post_far")!;
    post.respawnMs = 100;
    const idx = state.enemies.findIndex((e) => e.id === post.mobId);
    state.enemies.splice(idx, 1);
    run(state, idle, 40);
    expect(post.mobId).toBeNull();
    expect(post.respawnAtMs).toBeNull();
  });
});
