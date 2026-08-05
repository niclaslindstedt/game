// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The new pickups: XP SCROLLS that light a double-XP window on contact (and
// the full heal a level-up brings), the rare screen nuke, and the item
// magnet whose reach grows with INTELLIGENCE.

import { describe, expect, it } from "vitest";

import {
  abilityDef,
  allocateStat,
  canDropNuke,
  createGame,
  crowdBombChance,
  difficultyDef,
  dismissIntro,
  enemyDef,
  grantAbility,
  grantXp,
  killEnemy,
  levelDef,
  magnetRadius,
  MENACE,
  menaceStage,
  NUKE,
  setXpScrollEnabled,
  step,
  XP_TUNING,
} from "@game/core";
import type { GameInput, GameState, Item } from "@game/core";
import { clearStage, DT, idle, makeEnemy, SEED, startGame } from "./helpers.ts";

const useItem: GameInput = {
  steering: false,
  target: { x: 0, y: 0 },
  jump: false,
  useItem: true,
};

function dropScroll(state: GameState, id: number): Item {
  return { id, kind: "xp", pos: { ...state.players[0].pos } };
}

/** The XP one kill of `enemy` banks for the hero under identical conditions —
 * the measurement the doubling tests compare with and without a lit window. */
function xpForOneKill(lit: boolean): number {
  const state = startGame();
  clearStage(state);
  state.players[0].xpToNext = 1_000_000; // never ding mid-measurement
  state.players[0].xp = 0;
  if (lit) state.players[0].xpBoostMs = XP_TUNING.scrollDurationMs;
  const victim = makeEnemy({ id: 9500, pos: { ...state.players[0].pos } });
  state.enemies = [victim];
  killEnemy(state, victim, 1, false);
  return state.players[0].xp;
}

describe("the xp scroll", () => {
  it("is read on contact — it lights a window and pays no XP of its own", () => {
    const state = startGame();
    clearStage(state);
    state.items = [dropScroll(state, 1)];
    step(state, idle, DT);
    // The scroll is gone off the floor and its window is lit at full duration
    // (one tick of the step has already burned off, hence the tolerance).
    expect(state.items).toHaveLength(0);
    expect(state.players[0].xpBoostMs).toBeGreaterThan(
      XP_TUNING.scrollDurationMs - 2 * DT,
    );
    // …and it banked nothing on its own: a scroll multiplies, it never pays.
    expect(state.players[0].xp).toBe(0);
    expect(state.events).toContainEqual(
      expect.objectContaining({
        type: "itemCollected",
        kind: "xp",
        name: "XP SCROLL",
      }),
    );
  });

  it("doubles every XP the hero earns while its window burns", () => {
    const plain = xpForOneKill(false);
    const doubled = xpForOneKill(true);
    expect(plain).toBeGreaterThan(0);
    expect(doubled).toBe(plain * XP_TUNING.scrollXpMult);
  });

  it("burns down in real time and stops doubling when it lapses", () => {
    const state = startGame();
    clearStage(state);
    state.items = [dropScroll(state, 1)];
    step(state, idle, DT);
    const lit = state.players[0].xpBoostMs ?? 0;
    expect(lit).toBeGreaterThan(0);
    // A second of play takes a second off it — no more, no less.
    for (let ms = 0; ms < 1000; ms += DT) step(state, idle, DT);
    const left = state.players[0].xpBoostMs ?? 0;
    expect(left).toBeLessThan(lit);
    expect(lit - left).toBeGreaterThanOrEqual(1000);
    expect(lit - left).toBeLessThan(1000 + 2 * DT);
    // Run it all the way out: the window closes and stays closed at zero.
    for (let ms = 0; ms < XP_TUNING.scrollDurationMs; ms += DT)
      step(state, idle, DT);
    expect(state.players[0].xpBoostMs).toBe(0);
  });

  it("REFRESHES rather than stacks — a second scroll buys one window, not two", () => {
    const state = startGame();
    clearStage(state);
    state.items = [dropScroll(state, 1)];
    step(state, idle, DT);
    // Spend half the window, then read another one off the floor.
    for (let ms = 0; ms < XP_TUNING.scrollDurationMs / 2; ms += DT)
      step(state, idle, DT);
    expect(state.players[0].xpBoostMs).toBeLessThan(
      XP_TUNING.scrollDurationMs * 0.6,
    );
    state.items = [dropScroll(state, 2)];
    step(state, idle, DT);
    // Back to a full window — never to one and a half.
    expect(state.players[0].xpBoostMs).toBeGreaterThan(
      XP_TUNING.scrollDurationMs - 2 * DT,
    );
    expect(state.players[0].xpBoostMs).toBeLessThanOrEqual(
      XP_TUNING.scrollDurationMs,
    );
  });

  it("two scrolls at once are still one window", () => {
    const state = startGame();
    clearStage(state);
    state.items = [dropScroll(state, 1), dropScroll(state, 2)];
    step(state, idle, DT);
    expect(state.items).toHaveLength(0); // both read…
    expect(state.players[0].xpBoostMs).toBeLessThanOrEqual(
      XP_TUNING.scrollDurationMs,
    ); // …one window
  });

  it("lights nothing while the faucet is switched off (calibration runs)", () => {
    // `setXpScrollEnabled(false)` is the simulator's `--no-xp-scroll` isolation
    // switch: the scroll still collects (vanishes), but lights no window and
    // floats no "2x XP" text — a pacing read of the pure kill grind.
    setXpScrollEnabled(false);
    try {
      const state = startGame();
      clearStage(state);
      state.items = [dropScroll(state, 1)];
      step(state, idle, DT);
      expect(state.items).toHaveLength(0);
      expect(state.players[0].xpBoostMs ?? 0).toBe(0);
      expect(state.events).not.toContainEqual(
        expect.objectContaining({ type: "itemCollected", kind: "xp" }),
      );
    } finally {
      setXpScrollEnabled(true);
    }
  });
});

describe("level-up heal", () => {
  it("a level-up restores full health", () => {
    const state = startGame();
    clearStage(state);
    state.players[0].hp = 5;
    state.players[0].xp = state.players[0].xpToNext - 1;
    grantXp(state, state.players[0], 1);
    expect(state.players[0].level).toBe(2);
    expect(state.players[0].hp).toBe(state.players[0].maxHp);
  });
});

describe("the screen nuke", () => {
  it("is banked on pickup, then wipes minions and chunks elites and bosses", () => {
    const state = startGame();
    clearStage(state);
    const boss = state.enemies[0]!;
    state.items = [
      {
        id: 1,
        kind: "ability",
        pos: { ...state.players[0].pos },
        defId: "test_nuke",
      },
    ];
    step(state, idle, DT);
    expect(state.players[0].heldAbilities).toContain("test_nuke");

    const radius = abilityDef("test_nuke").nuke!.radius;
    const px = state.players[0].pos.x;
    const py = state.players[0].pos.y;
    // A crowd of rank-and-file minions inside the blast keeps the mean health
    // low, so the fixed 200%-of-mean hit lands as many times its own size on a
    // minion but only a chunk of a heavyweight.
    const minions = Array.from({ length: 10 }, (_, i) =>
      makeEnemy({ id: 9100 + i, pos: { x: px + 100, y: py + (i - 5) * 6 } }),
    );
    const far = makeEnemy({
      id: 9002,
      pos: { x: px + radius + 60, y: py },
    });
    // A boss and an elite parked inside the blast — no monster is exempt from
    // the nuke now, so both take real damage. Give them tall, already-power-
    // scaled bars so the diluted mean (and even a lucky crit) only chunks them
    // instead of clearing the set-piece fight outright.
    boss.pos = { x: px + 80, y: py };
    boss.home = { ...boss.pos };
    boss.powerScaled = true;
    boss.hp = 2000;
    boss.maxHp = 2000;
    const elite = makeEnemy(
      { id: 9003, pos: { x: px + 90, y: py }, powerScaled: true },
      "test_elite",
    );
    elite.hp = 2000;
    elite.maxHp = 2000;
    state.enemies.push(...minions, far, elite);

    const xpBefore = state.stats.xpGained;
    step(state, useItem, DT);
    expect(state.players[0].heldAbilities).toHaveLength(0);
    // The rank and file are gone; the heavyweights are hurt but still standing.
    for (const minion of minions) expect(state.enemies).not.toContain(minion);
    expect(state.enemies).toContain(boss); // hit, not exempt…
    expect(boss.hp).toBeLessThan(2000); // …and its bar took a real chunk
    expect(state.enemies).toContain(elite);
    expect(elite.hp).toBeLessThan(2000);
    expect(state.enemies).toContain(far); // out of the blast
    expect(state.events).toContainEqual(
      expect.objectContaining({ type: "nuke" }),
    );
    // The kills pay out like any other: XP flowed.
    expect(state.stats.xpGained).toBeGreaterThan(xpBefore);
  });

  it("a rock shields the monster behind it from the blast", () => {
    const state = startGame();
    clearStage(state);
    state.players[0].heldAbilities = ["test_nuke"];

    // Tall stone right beside the player; a mob hides just behind it, well
    // inside the blast, and a second mob stands in the open the same distance
    // out. Same radius, opposite fates — only the sheltered one rides it out.
    //
    // Two boulders rather than one, because the blast is stopped by SIGHT and
    // a lone narrow obstacle no longer stops that (src/game/obstacles.ts,
    // "What blocks SIGHT"): cover you can hide behind is cover with some
    // width to it.
    const px = state.players[0].pos.x;
    const py = state.players[0].pos.y;
    const boulder = {
      id: 8100,
      kind: "boulder",
      sprite: "boulder",
      pos: { x: px + 30, y: py },
      radius: 14,
      jumpable: false,
    };
    state.obstacles = [
      boulder,
      { ...boulder, id: 8101, pos: { x: px + 30, y: py + 20 } },
    ];
    const sheltered = makeEnemy({ id: 9101, pos: { x: px + 60, y: py } });
    const exposed = makeEnemy({ id: 9102, pos: { x: px, y: py + 60 } });
    state.enemies.push(sheltered, exposed);

    step(state, useItem, DT);
    expect(state.enemies).toContain(sheltered); // the rock ate the blast
    expect(state.enemies).not.toContain(exposed); // no cover, no mercy
  });

  it("cools the transient menace heat to the earned floor and dumps the lure", () => {
    // A swarm heats the meter; the bomb is the answer to it, so its blast must
    // leave the horde no STRONGER than the run's baseline — the transient heat
    // above the ratchet floor bleeds off, and the banked walk-credit that would
    // dinner-bell a fresh crowd in is dumped. The earned floor itself stands.
    const state = startGame();
    clearStage(state);
    state.players[0].heldAbilities = ["test_nuke"];
    state.menaceFloor = MENACE.perStage * 2; // a floor the ratchet earned
    state.menace = MENACE.perStage * 5; // three stages of transient heat on top
    state.moveSpawnCredit = 999; // a fat lure bank primed to refill the screen
    expect(menaceStage(state)).toBe(5);

    step(state, useItem, DT);

    // Heat cooled to the floor — no hotter than baseline — but the earned
    // permanent floor (the "no breaks" ratchet) is untouched.
    expect(state.menace).toBe(state.menaceFloor);
    expect(menaceStage(state)).toBe(2);
    // The banked lure is gone, so nothing bursts back the instant the calm ends.
    expect(state.moveSpawnCredit).toBe(0);
  });

  it("holds the spawner's refill through the calm, then lets it resume", () => {
    // The core of the fix: without the calm the live floor repopulates the ring
    // the instant the pack dies — the cleared mobs "reset to the outer skirts."
    // The bomb opens a breather so the screen it cleared stays clear long enough
    // to break away; once it burns down the held horde flows again.
    const state = startGame(); // test_level waves live (its floor pulls minions in)
    state.players[0].heldAbilities = ["test_nuke"];
    // Clear the field of minions (keep the far boss so the objective stays open).
    state.enemies = state.enemies.filter(
      (e) => enemyDef(e.defId).role !== "minion",
    );
    const minions = (s: GameState) =>
      s.enemies.filter((e) => enemyDef(e.defId).role === "minion").length;
    expect(minions(state)).toBe(0);

    // Fire the bomb, then idle well INSIDE the calm window: the floor is held,
    // so no fresh pack lands at the screen edge.
    step(state, useItem, DT);
    expect(state.nukeCalmMs).toBeGreaterThan(0);
    const calmSteps = Math.floor(NUKE.calmMs / DT) - 4;
    for (let i = 0; i < calmSteps; i++) step(state, idle, DT);
    expect(minions(state)).toBe(0); // still clear — the breather held

    // Idle on past the window: the deferred floor resumes and the horde returns.
    for (let i = 0; i < 30; i++) step(state, idle, DT);
    expect(state.nukeCalmMs).toBe(0);
    expect(minions(state)).toBeGreaterThan(0);
  });

  it("eases the near-floor back after the calm instead of snapping it in one frame", () => {
    // The regression: once the calm burned off, the live near-floor refilled to
    // minAlive in a SINGLE frame — the whole cleared swarm teleporting back
    // around the player at once ("they respawn more than I killed / too fast").
    // The recovery ramp must feed them back gradually, at the normal rate.
    const state = startGame(); // test_level waves live (its floor pulls minions in)
    const waves = levelDef("test_level").waves!;
    const aliveMult = difficultyDef(state.difficulty).aliveMult;
    const minAlive = Math.round(waves.minAlive * aliveMult);
    expect(minAlive).toBeGreaterThan(4); // enough headroom for a real ramp
    state.players[0].heldAbilities = ["test_nuke"];
    const minions = (s: GameState) =>
      s.enemies.filter((e) => enemyDef(e.defId).role === "minion").length;

    // Let the floor build a full near-count around a stationary hero (reset the
    // camp clock each step so starvation never fades it), then bomb it away.
    // He is topped up every tick because this test is about the RECOVERY RAMP,
    // not about survival: standing still in a swarm thick enough to be worth
    // nuking is fatal at the shipped mob speed, and a hero who dies here takes
    // the run to `dying`, where nothing steps and the nuke never fires.
    for (let i = 0; i < 900; i++) {
      state.campMs = 0;
      state.players[0].hp = state.players[0].maxHp;
      step(state, idle, DT);
      while (state.players[0].pendingStatPoints > 0)
        allocateStat(state, state.players[0], "stamina");
    }
    step(state, useItem, DT);
    expect(state.nukeCalmMs).toBeGreaterThan(0);
    expect(state.nukeRecoverMs).toBe(NUKE.recoverMs); // armed, not yet counting

    // Idle out the calm. The recovery timer stays parked at full until the calm
    // burns off — the field must be genuinely clear before the taper begins.
    const calmSteps = Math.floor(NUKE.calmMs / DT) - 4;
    for (let i = 0; i < calmSteps; i++) {
      state.campMs = 0;
      step(state, idle, DT);
    }
    expect(state.nukeRecoverMs).toBe(NUKE.recoverMs);

    // Cross out of the calm and watch the very first refill frames: the floor
    // must NOT snap back to minAlive at once — only a trickle lands per frame.
    let before = minions(state);
    let biggestJump = 0;
    for (let i = 0; i < 20; i++) {
      state.campMs = 0;
      step(state, idle, DT);
      const now = minions(state);
      biggestJump = Math.max(biggestJump, now - before);
      before = now;
    }
    expect(state.nukeCalmMs).toBe(0);
    expect(state.nukeRecoverMs).toBeGreaterThan(0); // the ramp is running
    // A pre-fix run slammed ~minAlive mobs in on the frame the calm ended; the
    // ramp keeps any single frame to a small fraction of that.
    expect(biggestJump).toBeLessThan(minAlive / 2);

    // Ride the recovery to its end: the floor is whole again, proving the ramp
    // restores the horde, just gradually.
    for (let i = 0; i < Math.ceil(NUKE.recoverMs / DT) + 30; i++) {
      state.campMs = 0;
      step(state, idle, DT);
    }
    expect(state.nukeRecoverMs).toBe(0);
    expect(minions(state)).toBeGreaterThanOrEqual(minAlive);
  });
});

describe("a bomb's kills never drop another bomb", () => {
  // EASY is the rung with the highest crowd-bomb mercy cap, so it is where a
  // nuke blast would most readily chain into another bomb without the rule.
  const startOnEasy = (): GameState => {
    const state = createGame(SEED, "test_level", "easy");
    dismissIntro(state);
    return state;
  };

  // A scripted rng: the listed values are consumed in order, then the
  // fallback keeps every later roll (crits, scatter, tier) out of the way.
  const scriptRng = (state: GameState, values: number[], fallback = 0.99) => {
    let i = 0;
    state.rng = () => (i < values.length ? (values[i++] as number) : fallback);
  };

  // Bank a nuke and park one victim just off the player, with a clear floor
  // so the blast's line of sight can't be blocked by seeded level obstacles.
  const armNuke = (state: GameState): void => {
    clearStage(state);
    state.obstacles = [];
    state.players[0].heldAbilities = ["test_nuke"];
    state.enemies.push(
      makeEnemy({
        id: 9000,
        pos: { x: state.players[0].pos.x + 50, y: state.players[0].pos.y },
      }),
    );
  };

  const droppedBomb = (state: GameState): boolean =>
    state.items.some(
      (i) =>
        i.kind === "ability" &&
        (i.defId === "screen_nuke" || i.defId === "test_nuke"),
    );

  it("skips the crowd-bomb mercy roll on a nuke kill", () => {
    const state = startOnEasy();
    armNuke(state);
    // A packed field just OUTSIDE the blast radius but inside the on-screen
    // one (ENEMY_AI.nearRadius): the crowd survives the nuke, so the victim's
    // drop roll happens with the crowd-bomb chance fully ramped — exactly
    // where a bomb would pay out another bomb without the rule.
    const p = state.players[0].pos;
    for (let i = 0; i < 40; i++) {
      state.enemies.push(
        makeEnemy({
          id: 10_000 + i,
          pos: { x: p.x + 300, y: p.y - 120 + i * 6 },
        }),
      );
    }
    // rolls: [crit no, 0.0] — without the rule the 0.0 would be the crowd-bomb
    // roll (well under easy's ramped 4% chance) and a bomb would fall; with it
    // the mercy slice never draws and the 0.0 lands on the ordinary drop gate.
    scriptRng(state, [0.9, 0.0]);
    step(state, useItem, DT);
    expect(state.enemies.find((e) => e.id === 9000)).toBeUndefined();
    expect(droppedBomb(state)).toBe(false);
  });

  it("skips the rare nuke slice on a nuke kill (the rain still pays out)", () => {
    const state = startOnEasy();
    armNuke(state);
    // Four far minions keep the equipment pity rule quiet (owed <= remaining).
    const p = state.players[0].pos;
    for (let i = 0; i < 4; i++) {
      state.enemies.push(
        makeEnemy({ id: 9100 + i, pos: { x: p.x + 5000, y: p.y + i * 30 } }),
      );
    }
    // rolls: [crit no, drop gate 0.0, 0.0] — without the rule the trailing 0.0
    // would be the LOOT.nukeShare draw (a bomb); with it the slice never draws
    // and the 0.0 lands on the ladder as a plain equipment drop instead.
    scriptRng(state, [0.9, 0.0, 0.0]);
    step(state, useItem, DT);
    expect(state.enemies.find((e) => e.id === 9000)).toBeUndefined();
    expect(droppedBomb(state)).toBe(false);
    expect(state.items.some((i) => i.kind === "equipment")).toBe(true);
  });
});

describe("the ONE NUKE rule — only one bomb in play at a time", () => {
  const startOnEasy = (): GameState => {
    const state = createGame(SEED, "test_level", "easy");
    dismissIntro(state);
    clearStage(state);
    state.obstacles = [];
    return state;
  };

  const groundNuke = (state: GameState, offset: number): Item => ({
    id: 1,
    kind: "ability",
    pos: { x: state.players[0].pos.x + offset, y: state.players[0].pos.y },
    defId: "screen_nuke",
  });

  // A packed field, all within the "on screen" radius, so the crowd-bomb ramp
  // is fully lit — exactly where a second bomb would fall without the rule.
  const packField = (state: GameState, n: number): void => {
    const p = state.players[0].pos;
    for (let i = 0; i < n; i++) {
      state.enemies.push(
        makeEnemy({
          id: 10_000 + i,
          pos: { x: p.x + 20, y: p.y - 60 + i * 3 },
        }),
      );
    }
  };

  it("bars a drop while a NUKE sits in the powerup dock", () => {
    const state = startOnEasy();
    state.players[0].heldAbilities = ["test_nuke"];
    packField(state, 45); // would be the full 5% crowd-bomb cap…
    expect(canDropNuke(state)).toBe(false);
    // …but the packed field holds its fire while a bomb is already docked.
    expect(crowdBombChance(state)).toBe(0);
  });

  it("bars a drop while an un-collected bomb waits ON screen", () => {
    const state = startOnEasy();
    state.items = [groundNuke(state, 50)]; // within the rescueRadius proxy
    packField(state, 45);
    expect(canDropNuke(state)).toBe(false);
    expect(crowdBombChance(state)).toBe(0);
  });

  it("allows a drop when the only bomb has drifted OFF screen", () => {
    const state = startOnEasy();
    state.items = [groundNuke(state, 5000)]; // well past the rescueRadius
    packField(state, 45);
    expect(canDropNuke(state)).toBe(true);
    expect(crowdBombChance(state)).toBeCloseTo(0.05, 5);
  });

  it("sweeps the stale off-screen bomb when a fresh one drops", () => {
    const state = startOnEasy();
    // One bomb already parked far off screen (the hero walked away from it).
    state.items = [groundNuke(state, 5000)];
    packField(state, 45);
    // The victim stands right on the hero, so the fresh bomb lands ON screen.
    const victim = makeEnemy({ id: 9000, pos: { ...state.players[0].pos } });
    state.enemies.push(victim);
    // The very first roll is the crowd-bomb draw (0.0 < easy's ramped cap).
    let i = 0;
    state.rng = () => (i++ === 0 ? 0.0 : 0.99);
    killEnemy(state, victim, 10, false);
    const bombs = state.items.filter(
      (it) => it.kind === "ability" && it.defId === "screen_nuke",
    );
    // The stale off-screen bomb is gone; only the fresh on-screen one remains.
    expect(bombs).toHaveLength(1);
    expect(bombs[0]!.pos.x).toBeCloseTo(state.players[0].pos.x, 5);
    // With a bomb now waiting on screen, no further bomb may drop.
    expect(canDropNuke(state)).toBe(false);
  });
});

describe("the item magnet", () => {
  it("pulls only items inside its radius", () => {
    const state = startGame();
    clearStage(state); // the parked boss keeps the objective open
    grantAbility(state, state.players[0], "test_magnet");
    const def = abilityDef("test_magnet");
    const caught: Item = {
      id: 1,
      kind: "medkit",
      pos: {
        x: state.players[0].pos.x + def.magnet!.radius - 10,
        y: state.players[0].pos.y,
      },
    };
    const free: Item = {
      id: 2,
      kind: "medkit",
      pos: {
        x: state.players[0].pos.x + def.magnet!.radius + 40,
        y: state.players[0].pos.y,
      },
    };
    state.items = [caught, free];
    const caughtStart = caught.pos.x;
    const freeStart = free.pos.x;
    step(state, idle, DT);
    expect(caught.pos.x).toBeLessThan(caughtStart);
    expect(free.pos.x).toBe(freeStart);
  });

  it("INTELLIGENCE widens the pull radius", () => {
    const state = startGame();
    const def = abilityDef("test_magnet");
    const base = magnetRadius(state, state.players[0], def);
    state.players[0].stats.intelligence = 5;
    expect(magnetRadius(state, state.players[0], def)).toBe(
      base + 5 * def.magnet!.radiusPerInt,
    );
  });
});
