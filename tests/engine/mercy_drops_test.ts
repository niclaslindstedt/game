// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// MERCY DROPS: the gentle rungs (easy/medium) throw a struggling player a rope
// so the fight eases without becoming un-losable — a bomb starts raining when
// the screen fills with mobs, medkits and plated armor rain harder as health
// drains, and repair kits drop as the weapon nears breaking. Hard and up leave
// every knob at zero, so none of this softens them. These suites lock the ramps
// (config `MERCY.*`) and their per-rung strengths (`DifficultyDef.mercy`) here.

import { describe, expect, it } from "vitest";

import {
  createGame,
  crowdBombChance,
  desperationRamp,
  dismissIntro,
  lowDurabilityDesperation,
  lowHealthDesperation,
  MERCY,
  rollEquipment,
  staminaDrinkChance,
  step,
} from "@game/core";
import type { Difficulty, GameState, Item } from "@game/core";
import { clearStage, DT, idle, makeEnemy, SEED, steerTo } from "./helpers.ts";

// A run past the intro on the synthetic level, at the given rung.
const startOn = (difficulty: Difficulty): GameState => {
  const state = createGame(SEED, "test_level", difficulty);
  dismissIntro(state);
  return state;
};

// A scripted rng: the listed values are consumed in order, then the fallback
// keeps every later roll (crits, scatter, tier) out of the way.
const scriptRng = (state: GameState, values: number[], fallback = 0.99) => {
  let i = 0;
  state.rng = () => (i < values.length ? (values[i++] as number) : fallback);
};

// Drop `n` stationary minions in a shell around the player: close enough to
// count as "on screen" (inside ENEMY_AI.nearRadius = 340) but well outside any
// melee reach, so a swing only ever fells the adjacent victim.
const packField = (state: GameState, n: number, offset = 120): void => {
  const p = state.player.pos;
  for (let i = 0; i < n; i++) {
    state.enemies.push(
      makeEnemy({
        id: 10_000 + i,
        pos: {
          x: p.x + offset + (i % 6) * 16,
          y: p.y - 60 + Math.floor(i / 6) * 16,
        },
      }),
    );
  }
};

describe("the desperation ramp (shared mercy-drop shape)", () => {
  it("is zero at or above the start and one at or below the full mark", () => {
    expect(desperationRamp(0.9, 0.6, 0.15)).toBe(0);
    expect(desperationRamp(0.6, 0.6, 0.15)).toBe(0);
    expect(desperationRamp(0.15, 0.6, 0.15)).toBe(1);
    expect(desperationRamp(0.05, 0.6, 0.15)).toBe(1);
  });

  it("climbs linearly between the two marks", () => {
    // Midpoint of [0.15, 0.6] is 0.375 → half desperation.
    expect(desperationRamp(0.375, 0.6, 0.15)).toBeCloseTo(0.5, 5);
  });
});

describe("low-health desperation (medkits & armor)", () => {
  it("is zero at full health and one near death", () => {
    const state = startOn("medium");
    state.player.maxHp = 100;
    state.player.hp = 100;
    expect(lowHealthDesperation(state)).toBe(0);
    state.player.hp = 10; // under MERCY.lowHealthFull (15%)
    expect(lowHealthDesperation(state)).toBe(1);
  });

  it("guards a zero max-hp state instead of dividing by it", () => {
    const state = startOn("medium");
    state.player.maxHp = 0;
    state.player.hp = 0;
    expect(lowHealthDesperation(state)).toBe(0);
  });
});

describe("low-durability desperation (repairs)", () => {
  it("climbs as the equipped weapon nears breaking", () => {
    const state = startOn("medium"); // crude_sword, durability 120
    const weapon = state.player.equipment.weapon;
    weapon.durability = 120;
    expect(lowDurabilityDesperation(state)).toBe(0);
    weapon.durability = 6; // under MERCY.lowDurabilityFull (10% of 120 = 12)
    expect(lowDurabilityDesperation(state)).toBe(1);
  });

  it("never triggers on the unbreakable sidearm", () => {
    const state = startOn("medium");
    state.player.equipment.weapon.durability = undefined; // sidearm-like
    expect(lowDurabilityDesperation(state)).toBe(0);
  });
});

describe("the crowd bomb chance (bomb-in-a-swarm)", () => {
  it("stays at zero until the on-screen crowd passes the threshold", () => {
    const state = startOn("easy");
    clearStage(state);
    packField(state, 20); // exactly at MERCY.crowdBombThreshold
    expect(crowdBombChance(state)).toBe(0);
  });

  it("ramps up with the crowd and tops out at the rung's cap", () => {
    const easy = startOn("easy");
    clearStage(easy);
    packField(easy, 30); // (30-20)/(45-20) = 0.4 of easy's 0.05 cap
    expect(crowdBombChance(easy)).toBeCloseTo(0.02, 5);

    const packed = startOn("easy");
    clearStage(packed);
    packField(packed, 45); // at MERCY.crowdBombFull → the full 5% cap
    expect(crowdBombChance(packed)).toBeCloseTo(0.05, 5);
  });

  it("is 3% at most on medium and stays a lighter touch than easy", () => {
    const medium = startOn("medium");
    clearStage(medium);
    packField(medium, 45);
    expect(crowdBombChance(medium)).toBeCloseTo(0.03, 5);
  });

  it("counts only minions on screen, not parked spawns across the map", () => {
    const state = startOn("easy");
    clearStage(state);
    packField(state, 25); // on screen: (25-20)/25 = 0.2 of 0.05 → 0.01
    packField(state, 25, 5000); // far off screen — must not count
    expect(crowdBombChance(state)).toBeCloseTo(0.01, 5);
  });

  it("gives no crowd bomb from hard up, however packed the field", () => {
    for (const rung of ["hard", "nightmare", "jesus"] as Difficulty[]) {
      const state = startOn(rung);
      clearStage(state);
      packField(state, 45);
      expect(crowdBombChance(state)).toBe(0);
    }
  });
});

describe("the stamina-drink chance (empty-sprint bailout)", () => {
  it("stays at zero while any stamina is left, however low", () => {
    const state = startOn("easy");
    state.staminaEmptyMs = 1e9; // even long-stranded time can't fire it…
    state.player.stamina = 1; // …because the pool is not bone-dry
    expect(staminaDrinkChance(state)).toBe(0);
  });

  it("is still zero the instant the pool empties, then ramps over time", () => {
    const state = startOn("easy");
    state.player.stamina = 0;
    state.staminaEmptyMs = 0; // just hit empty this frame
    expect(staminaDrinkChance(state)).toBe(0);
    // Halfway through the ramp window → half the rung's cap.
    state.staminaEmptyMs = MERCY.staminaEmptyDrinkRampMs / 2;
    expect(staminaDrinkChance(state)).toBeCloseTo(0.075, 5);
  });

  it("tops out at 15% on easy and 10% on medium once fully stranded", () => {
    const easy = startOn("easy");
    easy.player.stamina = 0;
    easy.staminaEmptyMs = MERCY.staminaEmptyDrinkRampMs;
    expect(staminaDrinkChance(easy)).toBeCloseTo(0.15, 5);
    // Past the window it holds the cap, never climbing beyond it.
    easy.staminaEmptyMs = MERCY.staminaEmptyDrinkRampMs * 10;
    expect(staminaDrinkChance(easy)).toBeCloseTo(0.15, 5);

    const medium = startOn("medium");
    medium.player.stamina = 0;
    medium.staminaEmptyMs = MERCY.staminaEmptyDrinkRampMs;
    expect(staminaDrinkChance(medium)).toBeCloseTo(0.1, 5);
  });

  it("gives no stamina drink from hard up, however long stranded", () => {
    for (const rung of ["hard", "nightmare", "jesus"] as Difficulty[]) {
      const state = startOn(rung);
      state.player.stamina = 0;
      state.staminaEmptyMs = MERCY.staminaEmptyDrinkRampMs * 5;
      expect(staminaDrinkChance(state)).toBe(0);
    }
  });

  it("accrues empty time while winded and resets the moment stamina returns", () => {
    const state = startOn("easy");
    clearStage(state);
    state.player.stamina = 0;
    // A running step (throttle 1, decisively steering) keeps the pool empty and
    // banks empty time.
    step(
      state,
      { ...steerTo(state.player.pos.x + 400, state.player.pos.y) },
      DT,
    );
    expect(state.staminaEmptyMs).toBe(DT);
    // Standing still recovers stamina, which zeroes the accumulator again.
    step(state, idle, DT);
    expect(state.player.stamina).toBeGreaterThan(0);
    expect(state.staminaEmptyMs).toBe(0);
  });
});

// Kill one adjacent minion via a real step so the drop rolls run through the
// actual loot path, then return what fell. Drives MEDIUM, whose starter is the
// melee crude_sword (a magic starter would not connect in a single step).
const killForItems = (
  rolls: number[],
  opts: {
    hp?: number;
    durability?: number;
    crowd?: number;
    /** Last-minute surgery (e.g. pre-placing ground items) before the kill. */
    arrange?: (state: GameState) => void;
  } = {},
): Item[] => {
  const state = startOn("medium");
  clearStage(state);
  state.waveSpawned = state.waveSpawned.map(() => 1e9);
  // A packed field (out of reach) for the crowd-bomb path…
  if (opts.crowd) packField(state, opts.crowd);
  // …plus four far minions so the equipment pity rule stays out of the way
  // (owed <= remaining) when there is no crowd.
  const p = state.player.pos;
  for (let i = 0; i < 4; i++) {
    state.enemies.push(
      makeEnemy({ id: 9100 + i, pos: { x: p.x + 5000, y: p.y + i * 30 } }),
    );
  }
  const victim = makeEnemy({
    id: 9000,
    pos: { x: p.x + 20, y: p.y },
    hp: 1,
    maxHp: 45,
  });
  state.enemies.push(victim);
  if (opts.hp !== undefined) state.player.hp = opts.hp;
  if (opts.durability !== undefined) {
    state.player.equipment.weapon.durability = opts.durability;
  }
  opts.arrange?.(state);
  state.player.weaponCooldownMs = 0;
  scriptRng(state, rolls);
  step(state, idle, DT);
  expect(state.enemies.find((e) => e.id === 9000)).toBeUndefined();
  return state.items;
};

describe("mercy drops through a real kill (medium)", () => {
  it("coughs up a screen-nuke when a packed field forces the bomb roll", () => {
    // rolls: [miss no, dodge no, crit no, bomb YES] — the crowd bomb is rolled
    // before the normal drop gate and stands in for the kill's drop.
    const items = killForItems([0.9, 0.9, 0.9, 0.0], { crowd: 30 });
    expect(
      items.some((i) => i.kind === "ability" && i.defId === "screen_nuke"),
    ).toBe(true);
  });

  it("rains medkits harder as the hero nears death", () => {
    // roll 0.45 sits past the base medkit window but inside the low-health one
    // (medium's 1.3× bonus at full desperation widens it). rolls: [miss, dodge,
    // crit, drop-gate pass, nuke no, ladder].
    const ladder = [0.9, 0.9, 0.9, 0.0, 0.9, 0.45];
    const hurt = killForItems(ladder, { hp: 1 });
    expect(hurt.some((i) => i.kind === "medkit")).toBe(true);
    // At full health the same roll falls through to a repair, not a medkit.
    const healthy = killForItems(ladder);
    expect(healthy.some((i) => i.kind === "medkit")).toBe(false);
  });

  it("drops repair kits harder as the weapon nears breaking", () => {
    // roll 0.55 sits past the base repair window but inside the low-durability
    // one (1.3× at full desperation). Health is full, so only the repair slice
    // is widened here.
    const ladder = [0.9, 0.9, 0.9, 0.0, 0.9, 0.55];
    const worn = killForItems(ladder, { durability: 1 });
    expect(worn.some((i) => i.kind === "repair")).toBe(true);
    const fresh = killForItems(ladder, { durability: 120 });
    expect(fresh.some((i) => i.kind === "repair")).toBe(false);
  });
});

describe("armor pull toward armor pieces when hurt (easy)", () => {
  // rollEquipment on a gear drop: family gear (rng >= 0.6), then the pool pick
  // lands on the armorless test_charm (index 1 of [test_vest, test_charm]).
  // A hurting hero re-rolls it toward the armored test_vest; a healthy one
  // keeps the charm. Later rolls (tier/ilvl/affixes) fall through to 0.99.
  const rollGear = (hp: number, extra: number[] = []): string => {
    const state = startOn("easy");
    state.player.maxHp = 100;
    state.player.hp = hp;
    // gear (0.7 >= 0.6), pool pick charm (floor(0.7 * 2) = 1), then `extra`.
    scriptRng(state, [0.7, 0.7, ...extra]);
    return rollEquipment(state).defId;
  };

  it("swaps an armorless gear pick for an armor piece at low health", () => {
    // extra: [pull success 0.1 < 0.5, armored pick 0.0]. desperation 1 × 0.5.
    expect(rollGear(1, [0.1, 0.0])).toBe("test_vest");
  });

  it("keeps the armorless pick at full health (no pull, no wasted roll)", () => {
    // At full health desperation is zero: the pull branch never fires, so no
    // extra roll is drawn and the charm stands.
    expect(rollGear(100)).toBe("test_charm");
  });
});

describe("the energy drink drop and pickup", () => {
  it("throws a stranded, winded hero a drink through a real kill", () => {
    const state = startOn("medium"); // 10% stamina-drink cap
    clearStage(state);
    state.waveSpawned = state.waveSpawned.map(() => 1e9);
    state.items = [];
    const p = state.player.pos;
    // Four far minions so the equipment pity rule stays out of the way.
    for (let i = 0; i < 4; i++) {
      state.enemies.push(
        makeEnemy({ id: 9100 + i, pos: { x: p.x + 5000, y: p.y + i * 30 } }),
      );
    }
    state.enemies.push(
      makeEnemy({ id: 9000, pos: { x: p.x + 20, y: p.y }, hp: 1, maxHp: 45 }),
    );
    // Bone-dry and long stranded → the full 10% cap; running through the kill
    // keeps stepPlayer from refilling the pool before the drop rolls.
    state.player.stamina = 0;
    state.staminaEmptyMs = MERCY.staminaEmptyDrinkRampMs;
    state.player.weaponCooldownMs = 0;
    // rolls: miss no, dodge no, crit no, drink YES (the pre-gate mercy roll).
    scriptRng(state, [0.9, 0.9, 0.9, 0.0]);
    step(state, steerTo(p.x + 20, p.y), DT);
    expect(state.enemies.find((e) => e.id === 9000)).toBeUndefined();
    expect(state.player.stamina).toBe(0); // still winded after the kill
    expect(state.items.some((i) => i.kind === "drink")).toBe(true);
  });

  it("resets the sprint pool to full on touch and is consumed", () => {
    const state = startOn("easy");
    clearStage(state);
    state.waveSpawned = state.waveSpawned.map(() => 1e9);
    state.items = [
      { id: state.nextId++, kind: "drink", pos: { ...state.player.pos } },
    ];
    state.player.stamina = 0;
    step(state, idle, DT);
    expect(state.player.stamina).toBe(state.player.maxStamina);
    expect(state.items.some((i) => i.kind === "drink")).toBe(false);
    expect(
      state.events.some(
        (e) => e.type === "itemCollected" && e.kind === "drink",
      ),
    ).toBe(true);
  });

  it("stays on the ground for a rested hero (nothing to top up)", () => {
    const state = startOn("easy");
    clearStage(state);
    state.waveSpawned = state.waveSpawned.map(() => 1e9);
    state.player.stamina = state.player.maxStamina;
    state.items = [
      { id: state.nextId++, kind: "drink", pos: { ...state.player.pos } },
    ];
    step(state, idle, DT);
    expect(state.items.some((i) => i.kind === "drink")).toBe(true);
  });
});

describe("one rope at a time (a waiting rescue holds its signal's fire)", () => {
  // A ground item `dx` to the player's right — inside MERCY.rescueRadius when
  // dx says so, but always outside the pickup overlap so it stays grounded.
  const groundItem = (
    state: GameState,
    item: Partial<Item>,
    dx = 100,
  ): void => {
    state.items.push({
      id: state.nextId++,
      pos: { x: state.player.pos.x + dx, y: state.player.pos.y },
      ...item,
    } as Item);
  };

  it("holds the crowd bomb while an un-collected nuke waits in view", () => {
    const state = startOn("easy");
    clearStage(state);
    packField(state, 45); // would be the full 5% cap…
    groundItem(state, { kind: "ability", defId: "screen_nuke" });
    expect(crowdBombChance(state)).toBe(0);
  });

  it("throws the bomb again once the waiting nuke is out of view", () => {
    const state = startOn("easy");
    clearStage(state);
    packField(state, 45);
    groundItem(
      state,
      { kind: "ability", defId: "screen_nuke" },
      MERCY.rescueRadius + 1,
    );
    expect(crowdBombChance(state)).toBeCloseTo(0.05, 5);
  });

  it("holds the stamina drink while one waits — but not for other kinds", () => {
    const state = startOn("easy");
    state.player.stamina = 0;
    state.staminaEmptyMs = MERCY.staminaEmptyDrinkRampMs;
    groundItem(state, { kind: "drink" });
    expect(staminaDrinkChance(state)).toBe(0);
    // A medkit answers a different signal: it never suppresses the drink.
    state.items = [];
    groundItem(state, { kind: "medkit" });
    expect(staminaDrinkChance(state)).toBeCloseTo(0.15, 5);
  });

  it("stops widening the medkit slice while a medkit waits in view", () => {
    // The same ladder that rains a medkit at hp 1 (roll 0.45 inside the
    // widened slice) — with one already on the ground, the boost holds fire
    // and the roll falls through, so the waiting medkit stays the only one.
    const ladder = [0.9, 0.9, 0.9, 0.0, 0.9, 0.45];
    const items = killForItems(ladder, {
      hp: 1,
      arrange: (state) => groundItem(state, { kind: "medkit" }, -100),
    });
    expect(items.filter((i) => i.kind === "medkit")).toHaveLength(1);
  });

  it("stops widening the repair slice while a repair kit waits in view", () => {
    const ladder = [0.9, 0.9, 0.9, 0.0, 0.9, 0.55];
    const items = killForItems(ladder, {
      durability: 1,
      arrange: (state) => groundItem(state, { kind: "repair" }, -100),
    });
    expect(items.filter((i) => i.kind === "repair")).toHaveLength(1);
  });

  it("holds the armor pull while an armor piece waits in view", () => {
    const state = startOn("easy");
    state.player.maxHp = 100;
    state.player.hp = 1; // full desperation — the pull would fire…
    groundItem(state, {
      kind: "equipment",
      equipment: {
        id: state.nextId++,
        defId: "test_vest", // an armor piece
        slot: "chest",
        tier: "regular",
        ilvl: 1,
        affixes: [],
      },
    });
    // gear (0.7 >= 0.6), pool pick charm; with the pull held no extra roll is
    // drawn (the 0.99 fallback would defeat it anyway) and the charm stands.
    scriptRng(state, [0.7, 0.7]);
    expect(rollEquipment(state).defId).toBe("test_charm");
  });
});
