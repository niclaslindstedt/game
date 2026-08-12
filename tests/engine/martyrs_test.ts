// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE MARTYRS (engine/game/martyrs.ts, `EnemyDef.martyr`, `LevelDef.martyrs`):
// a body that is its own weapon. It is walked onto the floor on the level's
// own cadence, closes on a hero, SHOUTS and lights a fuse it cannot put out,
// and then goes off — burning the minions in its core off the board with no
// kill, no XP and no loot, flinging what it does not burn, and biting every
// GROUNDED hero it catches by how near the centre they stood.
//
// The whole design is a WINDOW: the fuse is the only chance the player gets,
// and taking it pays — a martyr put down inside the fuse always sheds the
// charge it was carrying. These are the rules that make that trade real, so
// each one is asserted rather than assumed.

import { describe, expect, it } from "vitest";

import {
  createGame,
  dismissIntro,
  enemyDef,
  JUMP,
  killEnemy,
  MARTYRS,
  martyrLit,
  skipCutscene,
  step,
} from "@game/core";
import type { GameState } from "@game/core";

import { clearStage, DT, idle, makeEnemy, run } from "./helpers.ts";

/** The fixture bomb's own numbers, so an assertion can say what it means. */
const SPEC = () => {
  const spec = enemyDef("test_martyr").martyr;
  if (!spec) throw new Error("test_martyr lost its martyr block");
  return spec;
};

/**
 * A martyr run staged clean, with the cadence parked far out so nothing walks
 * in under a test that placed its own.
 */
function startMartyrs(levelId = "test_martyr_level"): GameState {
  const state = createGame(42, levelId);
  skipCutscene(state);
  dismissIntro(state);
  clearStage(state);
  state.martyrTimerMs = 999_999;
  return state;
}

/**
 * Park one martyr `dist` px to the hero's right, awake and hunting.
 *
 * His contact clock is parked out of reach on purpose: several tests below
 * measure what the BLAST took out of the hero, and a bomber standing close
 * enough to light his fuse is also standing close enough to hit him, which
 * would fold a contact bite into every reading.
 */
function placeMartyr(state: GameState, dist: number) {
  const hero = state.players[0];
  const enemy = makeEnemy(
    { pos: { x: hero.pos.x + dist, y: hero.pos.y }, awake: true, hp: 100 },
    "test_martyr",
  );
  enemy.maxHp = 100;
  enemy.contactCooldownMs = 999_999;
  state.enemies.push(enemy);
  return enemy;
}

describe("the martyr's fuse", () => {
  it("stays unlit while he is outside his trigger radius", () => {
    const state = startMartyrs();
    const bomber = placeMartyr(state, SPEC().triggerRadius + 200);
    // Frozen in place, so the only thing that could close the switch is range.
    bomber.speed = 0;
    run(state, idle, 20);
    // His clock IS running — it starts the moment he is on the floor — but it
    // is the long WALK, not the fuse.
    expect(bomber.fuseMs).toBeGreaterThan(SPEC().fuseMs);
    expect(martyrLit(bomber)).toBe(false);
    expect(state.events.some((e) => e.type === "martyrArmed")).toBe(false);
  });

  it("closes the switch on its own once the walk runs out", () => {
    const state = startMartyrs();
    const bomber = placeMartyr(state, SPEC().triggerRadius + 400);
    // He can never reach anybody. Without this rule he would stand there for
    // the rest of the run holding a slot in the level's cap, and after two of
    // those the whole beat quietly stops happening.
    bomber.speed = 0;
    const walk = bomber.fuseMs ?? MARTYRS.walkMs;
    run(state, idle, Math.ceil(walk / DT) + 8, (s) =>
      s.events.some((e) => e.type === "martyrBlast"),
    );
    expect(state.events.some((e) => e.type === "martyrBlast")).toBe(true);
    expect(state.enemies).not.toContain(bomber);
  });

  it("lights, shouts and sprints the moment he is inside it", () => {
    const state = startMartyrs();
    const bomber = placeMartyr(state, SPEC().triggerRadius - 10);
    const walk = bomber.speed;
    step(state, idle, DT);
    expect(bomber.fuseMs).toBe(SPEC().fuseMs);
    // The shout rides the ordinary bark event, so the run never stops for it.
    const bark = state.events.find((e) => e.type === "bossBark");
    expect(bark).toBeDefined();
    if (bark?.type === "bossBark") expect(bark.lines).toEqual(SPEC().bark);
    expect(state.phase).toBe("playing");
    // …and the last run is faster than the walk that got him here.
    expect(bomber.speed).toBeCloseTo(walk * (SPEC().fuseSpeedMult ?? 1.6));
  });

  it("only counts down — walking back out does not put it out", () => {
    const state = startMartyrs();
    const bomber = placeMartyr(state, SPEC().triggerRadius - 10);
    step(state, idle, DT);
    const lit = bomber.fuseMs;
    // Teleport him to the far side of the map: the fuse is a commitment.
    bomber.pos = { x: bomber.pos.x + 2000, y: bomber.pos.y };
    bomber.speed = 0;
    step(state, idle, DT);
    expect(bomber.fuseMs).toBeLessThan(lit ?? 0);
    expect(bomber.fuseMs).toBeDefined();
  });
});

describe("the blast", () => {
  /**
   * Light a bomber's fuse and burn it down to its LAST tick without taking it
   * — so the caller can arrange the field (move the body, put the hero in the
   * air) for the one step the blast actually lands on.
   */
  function armMartyr(state: GameState, dist: number) {
    const bomber = placeMartyr(state, dist);
    bomber.speed = 0;
    step(state, idle, DT);
    expect(bomber.fuseMs).toBeDefined();
    run(state, idle, Math.ceil(SPEC().fuseMs / DT) + 4, (s) =>
      s.enemies.every((e) => e !== bomber || (e.fuseMs ?? 0) <= DT),
    );
    return bomber;
  }

  /** Light a bomber's fuse and run it all the way out. */
  function detonate(state: GameState, dist: number) {
    const bomber = armMartyr(state, dist);
    step(state, idle, DT);
    expect(state.events.some((e) => e.type === "martyrBlast")).toBe(true);
    return bomber;
  }

  it("takes the martyr off the board with the bodies it burned", () => {
    const state = startMartyrs();
    const bomber = detonate(state, 20);
    expect(state.events.some((e) => e.type === "martyrBlast")).toBe(true);
    expect(state.enemies).not.toContain(bomber);
  });

  it("burns minions in its core off the board — no kill, no XP, no loot", () => {
    const state = startMartyrs();
    const hero = state.players[0];
    const xpBefore = hero.xp;
    const kills = state.stats.kills;
    const items = state.items.length;
    // A minion parked well inside the core, and the bomber a step from it.
    state.enemies.push(
      makeEnemy({ pos: { x: hero.pos.x + 30, y: hero.pos.y + 20 } }),
    );
    detonate(state, 20);
    expect(state.enemies.some((e) => e.defId === "test_minion")).toBe(false);
    expect(state.events.some((e) => e.type === "martyrKill")).toBe(true);
    expect(state.events.some((e) => e.type === "enemyKilled")).toBe(false);
    expect(hero.xp).toBe(xpBefore);
    expect(state.stats.kills).toBe(kills);
    expect(state.items.length).toBe(items);
  });

  it("flings a minion standing outside the core instead of burning it", () => {
    const state = startMartyrs();
    const hero = state.players[0];
    const { blastRadius, killFraction } = SPEC();
    const outside = blastRadius * (killFraction ?? 0.75) + 20;
    const survivor = makeEnemy({
      pos: { x: hero.pos.x + outside, y: hero.pos.y },
    });
    state.enemies.push(survivor);
    detonate(state, 0);
    expect(state.enemies).toContain(survivor);
    expect(survivor.knockMs ?? 0).toBeGreaterThan(0);
  });

  it("bites the grounded hero by how near the centre he stood", () => {
    const near = startMartyrs();
    const nearHero = near.players[0];
    detonate(near, 20);
    const nearLost = nearHero.maxHp - nearHero.hp;

    const far = startMartyrs();
    const farHero = far.players[0];
    // Still inside the trigger radius — a fuse only lights in there — but as
    // near the rim of the blast as that allows.
    detonate(far, SPEC().triggerRadius - 5);
    const farLost = farHero.maxHp - farHero.hp;

    expect(nearLost).toBeGreaterThan(0);
    expect(farLost).toBeGreaterThan(0);
    expect(nearLost).toBeGreaterThan(farLost);
  });

  it("does not reach a hero standing beyond the rim", () => {
    const state = startMartyrs();
    const hero = state.players[0];
    // Lit at arm's length (a fuse only lights inside `triggerRadius`), then
    // walked out past the blast before it lands — which is exactly the escape
    // the fuse exists to give the player.
    const bomber = armMartyr(state, 40);
    bomber.pos = { x: hero.pos.x + SPEC().blastRadius + 200, y: hero.pos.y };
    const hpBefore = hero.hp;
    step(state, idle, DT);
    expect(state.events.some((e) => e.type === "martyrBlast")).toBe(true);
    expect(hero.hp).toBe(hpBefore);
  });

  it("a hero in the air clears it, exactly as he clears a meteor", () => {
    const state = startMartyrs();
    const hero = state.players[0];
    // Well inside the blast but out of arm's reach, so a contact hit can never
    // be mistaken for the blast landing.
    armMartyr(state, 60);
    hero.z = JUMP.dodgeHeight + 30;
    hero.vz = 100;
    const hpBefore = hero.hp;
    step(state, idle, DT);
    expect(state.events.some((e) => e.type === "martyrBlast")).toBe(true);
    expect(hero.hp).toBe(hpBefore);
  });
});

describe("the charge he was carrying", () => {
  it("always drops when he is put down inside the fuse", () => {
    const state = startMartyrs();
    const bomber = placeMartyr(state, SPEC().triggerRadius - 10);
    step(state, idle, DT);
    expect(bomber.fuseMs).toBeDefined();
    // Through the engine's own kill path, which is where the guaranteed charge
    // is shed (`loot.ts`) — the reward is what is under test, so it has to go
    // through the door the reward hangs on rather than be simulated.
    killEnemy(state, bomber, 999, false);
    expect(
      state.items.some(
        (i) => i.kind === "ability" && i.defId === SPEC().dropsAbility,
      ),
    ).toBe(true);
  });

  it("does NOT drop when the fuse runs out instead", () => {
    const state = startMartyrs();
    const bomber = placeMartyr(state, 20);
    bomber.speed = 0;
    step(state, idle, DT);
    run(state, idle, Math.ceil(SPEC().fuseMs / DT) + 4, (s) =>
      s.events.some((e) => e.type === "martyrBlast"),
    );
    expect(
      state.items.some(
        (i) => i.kind === "ability" && i.defId === SPEC().dropsAbility,
      ),
    ).toBe(false);
  });
});

describe("the level's cadence", () => {
  it("walks one in when the interval comes round, out past the edge", () => {
    const state = startMartyrs();
    const hero = state.players[0];
    state.martyrTimerMs = 0;
    step(state, idle, DT);
    const arrival = state.enemies.find((e) => e.defId === "test_martyr");
    expect(arrival).toBeDefined();
    expect(arrival?.awake).toBe(true);
    // Far enough out that he is seen arriving rather than appearing in the room.
    const d = Math.hypot(
      (arrival?.pos.x ?? 0) - hero.pos.x,
      (arrival?.pos.y ?? 0) - hero.pos.y,
    );
    expect(d).toBeGreaterThanOrEqual(MARTYRS.minDistance);
  });

  it("never holds more than the cap on the board at once", () => {
    const state = startMartyrs();
    state.martyrTimerMs = 0;
    // Long enough for many intervals to come and go.
    run(state, idle, 600);
    const live = state.enemies.filter((e) => e.defId === "test_martyr").length;
    expect(live).toBeLessThanOrEqual(MARTYRS.maxAlive);
  });

  it("FREEZES the countdown below the level's afterProgress gate", () => {
    const state = startMartyrs("test_martyr_gated_level");
    const owed = state.martyrTimerMs;
    state.martyrTimerMs = owed;
    // The hero has not moved off the spawn, so the gate is shut.
    run(state, idle, 60);
    expect(state.martyrTimerMs).toBe(owed);
    expect(state.enemies.some((e) => e.defId === "test_martyr")).toBe(false);
  });
});
