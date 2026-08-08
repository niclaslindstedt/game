// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE EXECUTIONER (engine/game/items/execute.ts) — a melee weapon that does not
// deal damage to a body it can take, it takes the body: the blow is priced in
// the VICTIM's own health, so the horde's numbers are not an answer to it.
//
// Four rules are load-bearing and each is easy to undo by accident:
//
//   1. It kills whatever it reaches, however much health that thing has — and
//      the blow lands hard enough for the app to burst the body rather than
//      merely topple it (the whole point of holding one).
//   2. A BOSS is IMMUNE and eats the weapon's ordinary rolled damage instead,
//      which is what keeps a gimmick out of the campaign's set pieces.
//   3. Armor does not shave it. Mob armor takes up to half a physical blow at
//      depth, which would quietly drop an execution under the app's burst
//      threshold on exactly the rungs the weapon exists for.
//   4. Its durability is a BODY COUNT, not a swing count: a swing that took
//      three bodies costs three teeth, so "N and then it is scrap" stays true
//      however many the cone caught at once.
//
// Run on the synthetic `test_executioner` fixture rather than on the shipped
// chainsaw, so the RULE survives that weapon being retired or retuned.

import { describe, expect, it } from "vitest";

import {
  canExecute,
  contactRange,
  enemyDef,
  hitEnemy,
  step,
  weaponAssumedTargets,
  weaponDef,
  weaponExecuteBars,
  weaponRangeFor,
  weaponSweepHalfAngle,
  type Equipment,
  type GameState,
} from "@game/core";

import { clearStage, DT, idle, makeEnemy, startGame } from "./helpers.ts";

/** The fixture executioner, in hand at full teeth. */
function executioner(state: GameState, durability = 5): Equipment {
  const weapon: Equipment = {
    id: state.nextId++,
    defId: "test_executioner",
    slot: "weapon",
    tier: "regular",
    ilvl: 1,
    affixes: [],
    durability,
  };
  state.players[0].equipment.weapon = weapon;
  state.players[0].weaponCooldownMs = 0;
  return weapon;
}

/** One engine tick, hands off — enough for the auto-attack to take a swing. */
function stepOnce(state: GameState): void {
  step(state, idle, DT);
}

/** A stationary body of `hp` health parked on the hero's doorstep. */
function bodyAt(state: GameState, hp: number, defId = "test_minion") {
  const enemy = makeEnemy(
    {
      pos: { x: state.players[0].pos.x + 12, y: state.players[0].pos.y },
      hp,
      maxHp: hp,
    },
    defId,
  );
  state.enemies.push(enemy);
  return enemy;
}

describe("the executioner reads off the catalog", () => {
  it("answers its bars for a melee executioner and nothing for a plain blade", () => {
    expect(weaponExecuteBars("test_executioner")).toBe(6);
    expect(weaponExecuteBars("crude_sword")).toBeUndefined();
    // A ranged weapon could never carry it — a thing that travels is caught by
    // armor, which is exactly what the rule refuses to be.
    expect(weaponExecuteBars("blaster")).toBeUndefined();
    // An id that no longer exists (a fixture, a retired base in an old save).
    expect(weaponExecuteBars("nothing_at_all")).toBeUndefined();
  });

  it("refuses a boss and allows every other kind of body", () => {
    expect(canExecute(enemyDef("test_minion"))).toBe(true);
    expect(canExecute(enemyDef("test_elite"))).toBe(true);
    expect(canExecute(enemyDef("test_boss"))).toBe(false);
  });

  it("reaches only as far as the two bodies touching", () => {
    const radius = enemyDef("test_minion").radius;
    const touch = contactRange(radius);
    // The hero's own radius plus the mob's, and a hair — not the weapon's
    // `range`, which is a longer thing and says who is HIT rather than taken.
    expect(touch).toBeGreaterThan(radius);
    expect(touch).toBeLessThan(weaponDef("test_executioner").range);
  });
});

describe("an execution is priced in the victim's own health", () => {
  it("kills a body whatever it was holding, at bars × its full bar", () => {
    const state = startGame();
    clearStage(state);
    executioner(state);

    // Far more health than the weapon's authored damage (20) could ever chew
    // through: an ordinary blow would need a dozen swings.
    const enemy = bodyAt(state, 4000);
    hitEnemy(state, enemy, 20, "melee", { executeBars: 6 });

    expect(enemy.hp).toBeLessThanOrEqual(0);
    const kill = state.events.find((e) => e.type === "enemyKilled");
    expect(kill).toBeDefined();
    // The blow the app is told about is the execution's, not the weapon's —
    // it is what decides whether the body comes APART rather than toppling.
    if (kill?.type === "enemyKilled") {
      expect(kill.damage).toBe(4000 * 6);
      expect(kill.maxHp).toBe(4000);
      // A certainty is never also a critical hit.
      expect(kill.crit).toBe(false);
    }
  });

  it("lands past the app's burst threshold on a fresh body", () => {
    const state = startGame();
    clearStage(state);
    executioner(state);

    const enemy = bodyAt(state, 250);
    hitEnemy(state, enemy, 20, "melee", { executeBars: 6 });

    const kill = state.events.find((e) => e.type === "enemyKilled");
    expect(kill?.type === "enemyKilled" && kill.damage / kill.maxHp).toBe(6);
  });

  it("is not shaved by mob armor, however deep the mob's level", () => {
    const state = startGame();
    clearStage(state);
    executioner(state);

    // A level-99 body carries the deepest armor the curve reaches; a physical
    // blow of the same size would come out a fraction of this.
    const enemy = bodyAt(state, 300);
    enemy.mlvl = 99;
    hitEnemy(state, enemy, 20, "melee", { executeBars: 6 });

    const kill = state.events.find((e) => e.type === "enemyKilled");
    expect(kill?.type === "enemyKilled" && kill.damage).toBe(300 * 6);
  });
});

describe("a plain blow through the same funnel is untouched", () => {
  it("still shaves and still leaves a big body standing", () => {
    const state = startGame();
    clearStage(state);
    executioner(state);

    const enemy = bodyAt(state, 4000);
    hitEnemy(state, enemy, 20, "melee", {});

    // No execution: the body took the ordinary blow and is very much alive.
    expect(enemy.hp).toBeGreaterThan(3900);
    expect(state.events.some((e) => e.type === "enemyKilled")).toBe(false);
  });
});

describe("the reach says who is struck, the touch says who is taken", () => {
  it("takes the body against him and only hits the one a stride out", () => {
    const state = startGame();
    clearStage(state);
    executioner(state);

    const near = makeEnemy(
      {
        id: 9300,
        pos: { x: state.players[0].pos.x + 12, y: state.players[0].pos.y },
        hp: 900,
        maxHp: 900,
      },
      "test_minion",
    );
    // Still well inside the weapon's 30px reach and its half-circle arc — so
    // the swing DOES catch it — but not touching him.
    const far = makeEnemy(
      {
        id: 9301,
        pos: { x: state.players[0].pos.x + 28, y: state.players[0].pos.y },
        hp: 900,
        maxHp: 900,
      },
      "test_minion",
    );
    state.enemies.push(near, far);
    expect(contactRange(enemyDef("test_minion").radius)).toBeLessThan(28);

    // Enough swings that neither can plausibly still be up to the accuracy roll.
    for (let i = 0; i < 6; i++) stepOnce(state);

    // The one he was leaning on is gone; the one a stride out is merely wounded
    // — it took the weapon's ordinary blow, which is nowhere near 900.
    expect(near.hp).toBeLessThanOrEqual(0);
    expect(far.hp).toBeGreaterThan(0);
    expect(far.hp).toBeLessThan(900);
  });
});

describe("a rigid weapon's shape is the tool's, not the wielder's", () => {
  it("never lengthens its reach or widens its arc, however deep the build", () => {
    const state = startGame();
    clearStage(state);
    const saw = executioner(state);
    const blade: Equipment = {
      id: state.nextId++,
      defId: "crude_sword",
      slot: "weapon",
      tier: "regular",
      ilvl: 1,
      affixes: [],
      durability: 120,
    };

    const bareSawReach = weaponRangeFor(state, state.players[0], saw);
    const bareSawArc = weaponSweepHalfAngle(state, state.players[0], saw);
    const bareBladeReach = weaponRangeFor(state, state.players[0], blade);
    const bareBladeArc = weaponSweepHalfAngle(state, state.players[0], blade);

    // A deep melee build: STRENGTH drives a swing further, INTELLIGENCE reads
    // a wider arc. Both should move the blade and neither should move the bar.
    state.players[0].stats.strength = 80;
    state.players[0].stats.intelligence = 80;

    expect(weaponRangeFor(state, state.players[0], blade)).toBeGreaterThan(
      bareBladeReach,
    );
    expect(
      weaponSweepHalfAngle(state, state.players[0], blade),
    ).toBeGreaterThan(bareBladeArc);

    expect(weaponRangeFor(state, state.players[0], saw)).toBe(bareSawReach);
    expect(weaponSweepHalfAngle(state, state.players[0], saw)).toBe(bareSawArc);
    // And it is exactly the catalog's own shape: 30px, a half circle.
    expect(weaponRangeFor(state, state.players[0], saw)).toBe(30);
    expect(weaponSweepHalfAngle(state, state.players[0], saw)).toBeCloseTo(
      Math.PI / 2,
      6,
    );
  });

  it("is priced at the geometry it actually has", () => {
    // The budget prices a plain melee weapon at the crowd a hero of the right
    // level will eventually reach with it; a rigid one can never reach more
    // than its own bubble, so it must be priced at that instead — otherwise it
    // is charged for a cleave it does not have and handed a smaller blow.
    // The same shape twice at a level deep enough for a build to have points
    // to spend — the ONLY difference is who owns the reach and the arc.
    const shape = { ...weaponDef("test_executioner"), levelReq: 40 };
    const rigidTargets = weaponAssumedTargets({ ...shape, rigid: true });
    const swungTargets = weaponAssumedTargets({ ...shape, rigid: false });
    expect(rigidTargets).toBeLessThan(swungTargets);
    expect(rigidTargets).toBeGreaterThanOrEqual(1);
    // A rigid weapon is priced identically at every level, because it IS
    // identical at every level.
    expect(
      weaponAssumedTargets({ ...shape, levelReq: 1, rigid: true }),
    ).toBeCloseTo(rigidTargets, 10);
  });
});

describe("the teeth are a body count", () => {
  it("takes exactly as many bodies as it had teeth, then breaks", () => {
    const state = startGame();
    clearStage(state);
    const teeth = 5;
    const weapon = executioner(state, teeth);

    // A crowd kept topped up against the hero, well inside the bar's 30px reach
    // and its half-circle arc, so most swings reach more than one body — which
    // is the whole point: a swing-counted weapon would outlive its own promise
    // exactly as fast as the hero found company.
    let killed = 0;
    let broke = false;
    let nextId = 9100;
    for (let tick = 0; tick < 400 && !broke; tick++) {
      while (state.enemies.length < 3) {
        const i = state.enemies.length;
        state.enemies.push(
          makeEnemy(
            {
              id: nextId++,
              pos: {
                x: state.players[0].pos.x + 10 + i,
                y: state.players[0].pos.y + i,
              },
              hp: 300,
              maxHp: 300,
            },
            "test_minion",
          ),
        );
      }
      // The hero's own auto-attack does the swinging — the wear rule lives on
      // that path, so driving it any other way would prove nothing.
      stepOnce(state);
      for (const event of state.events) {
        if (event.type === "enemyKilled") killed++;
        if (event.type === "weaponBroke") broke = true;
      }
    }

    // Five teeth, five bodies — not five swings, and not one swing that ate a
    // whole cone for a single point.
    expect(broke).toBe(true);
    expect(killed).toBe(teeth);
    expect(weapon.durability).toBe(0);
    // It never spends past the bottom, however deep the last cleave went.
    expect(state.players[0].equipment.weapon.defId).not.toBe(
      "test_executioner",
    );
  });

  it("takes a whole cone's worth of bodies in one swing", () => {
    const state = startGame();
    clearStage(state);
    const weapon = executioner(state, 5);

    for (let i = 0; i < 3; i++) {
      state.enemies.push(
        makeEnemy(
          {
            id: 9200 + i,
            pos: {
              x: state.players[0].pos.x + 10 + i,
              y: state.players[0].pos.y + i,
            },
            hp: 300,
            maxHp: 300,
          },
          "test_minion",
        ),
      );
    }
    stepOnce(state);

    // Whatever the swing reached (the hero can still miss, and INT caps the
    // cleave), every body it took cost its own tooth.
    const killed = state.events.filter((e) => e.type === "enemyKilled").length;
    expect(killed).toBeGreaterThanOrEqual(1);
    expect(weapon.durability).toBe(5 - killed);
  });

  it("spends exactly one on a swing that took no body at all", () => {
    const state = startGame();
    clearStage(state);
    const weapon = executioner(state, 5);

    // A CRATE-less, mob-less swing never fires; park a boss in reach instead —
    // it is the one body an execution is refused, so the swing lands as an
    // ordinary blow and costs the ordinary single point.
    bodyAt(state, 100_000, "test_boss");
    state.players[0].weaponCooldownMs = 0;
    stepOnce(state);

    expect(state.events.some((e) => e.type === "swing")).toBe(true);
    expect(state.events.some((e) => e.type === "enemyKilled")).toBe(false);
    expect(weapon.durability).toBe(4);
  });
});
