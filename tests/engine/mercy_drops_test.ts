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
  rollEquipment,
  step,
} from "@game/core";
import type { Difficulty, GameState, Item } from "@game/core";
import { clearStage, DT, idle, makeEnemy, SEED } from "./helpers.ts";

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

// Kill one adjacent minion via a real step so the drop rolls run through the
// actual loot path, then return what fell. Drives MEDIUM, whose starter is the
// melee crude_sword (a magic starter would not connect in a single step).
const killForItems = (
  rolls: number[],
  opts: { hp?: number; durability?: number; crowd?: number } = {},
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

describe("armor pull toward plated suits when hurt (easy)", () => {
  // rollEquipment on a gear drop: family gear (rng >= 0.6), then the pool pick
  // lands on the UNPLATED test_charm (index 1 of [test_suit, test_charm]).
  // A hurting hero re-rolls it toward the plated test_suit; a healthy one keeps
  // the charm. Later rolls (tier/ilvl/affixes) fall through to the 0.99 default.
  const rollGear = (hp: number, extra: number[] = []): string => {
    const state = startOn("easy");
    state.player.maxHp = 100;
    state.player.hp = hp;
    // gear (0.7 >= 0.6), pool pick charm (floor(0.7 * 2) = 1), then `extra`.
    scriptRng(state, [0.7, 0.7, ...extra]);
    return rollEquipment(state).defId;
  };

  it("swaps an unplated gear pick for a plated suit at low health", () => {
    // extra: [pull success 0.1 < 0.5, plated pick 0.0]. desperation 1 × 0.5.
    expect(rollGear(1, [0.1, 0.0])).toBe("test_suit");
  });

  it("keeps the unplated pick at full health (no pull, no wasted roll)", () => {
    // At full health desperation is zero: the pull branch never fires, so no
    // extra roll is drawn and the charm stands.
    expect(rollGear(100)).toBe("test_charm");
  });
});
