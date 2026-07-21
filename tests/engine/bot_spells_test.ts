// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The autopilot's SPELL play (bot.ts pickSpellToCast + bot-economy.ts
// botAssignSpellBar): mana is spent, never wasted — a damage cast must convert
// to enough EFFECTIVE damage per point of mana (overkill-capped; relaxed only
// while the pool brims), the heal fires as the medkit backup without overheal,
// the martial buff opens real fights only, and the harness-side bar step keeps
// the four slots carrying the strongest unlocked powers instead of the first
// four ever unlocked. Spell ids come from the shipped cast catalog (like
// spells_test.ts) — the ladder is engine data the class helpers own.

import { describe, expect, it } from "vitest";

import {
  abilityPowerScale,
  botAct,
  botAssignSpellBar,
  createBot,
  recomputeMaxMana,
  spellDef,
} from "@game/core";
import type { GameInput, GameState } from "@game/core";
import { clearStage, makeEnemy, startGame } from "./helpers.ts";

/** Pin a class build (raw stats), resize + fill the mana pool, empty the
 * medkit pockets (so heal reads aren't shadowed by kits), and slot `spellIds`
 * onto the bar in order. */
function caster(
  state: GameState,
  spellIds: string[],
  opts: { str?: number; dex?: number; int?: number } = {},
): GameState {
  const { str = 0, dex = 0, int = 250 } = opts;
  state.player.level = 99; // linear effective stats (no diminishing curve)
  state.player.stats.strength = str;
  state.player.stats.dexterity = dex;
  state.player.stats.intelligence = int;
  recomputeMaxMana(state);
  state.player.mana = state.player.maxMana;
  state.player.medkits = state.player.medkits.map(() => 0);
  spellIds.forEach((id, i) => {
    state.player.spellSlots[i] = id;
  });
  return state;
}

/** A mob too tall to overkill — the full catalog damage lands as credit. */
function tallMob(state: GameState, dx: number, id = 8000) {
  state.enemies.push(
    makeEnemy(
      {
        id,
        pos: { x: state.player.pos.x + dx, y: state.player.pos.y },
        hp: 1_000_000,
        maxHp: 1_000_000,
      },
      "test_minion",
    ),
  );
}

/** One bot decision on the current state. */
function decide(state: GameState): GameInput {
  return botAct(createBot("balanced"), state);
}

describe("the bot's damage casts (mana thrift)", () => {
  it("casts a bolt at a lone foe in range — the efficient single-target spend", () => {
    const state = caster(clearAndStart(), ["arc_bolt"]);
    state.player.mana = state.player.maxMana * 0.5; // not brimming
    tallMob(state, 100); // inside arc_bolt's 200 range
    const input = decide(state);
    expect(input.castSpell).toBe(true);
    expect(input.castSpellIndex).toBe(0);
  });

  it("holds an AoE that would only clip one body (under the efficiency floor)", () => {
    const state = caster(clearAndStart(), ["ember_burst"]);
    state.player.mana = state.player.maxMana * 0.5; // not brimming
    tallMob(state, 30); // inside the 66 ring — but 18 dmg / 11 mana ≈ 1.6
    const input = decide(state);
    expect(input.castSpell).not.toBe(true);
  });

  it("spends the AoE once a crowd stands in the ring", () => {
    const state = caster(clearAndStart(), ["ember_burst"]);
    state.player.mana = state.player.maxMana * 0.5;
    tallMob(state, 30, 8000);
    tallMob(state, -30, 8001);
    tallMob(state, 50, 8002); // 3 × 18 / 11 ≈ 4.9 per mana
    const input = decide(state);
    expect(input.castSpell).toBe(true);
    expect(input.castSpellIndex).toBe(0);
  });

  it("a brimming pool relaxes the floor — idle mana converts to damage", () => {
    const state = caster(clearAndStart(), ["ember_burst"]);
    state.player.mana = state.player.maxMana; // brimming: floor drops to 1
    tallMob(state, 30); // ~1.6 per mana clears the relaxed floor
    const input = decide(state);
    expect(input.castSpell).toBe(true);
  });

  it("never spends scarce mana finishing a dying straggler (overkill-capped)", () => {
    const state = caster(clearAndStart(), ["ember_burst"]);
    state.player.mana = state.player.maxMana * 0.5; // not brimming
    const power = abilityPowerScale(state);
    // A body worth ~2 level-1 damage units: even with the kill credit the
    // cast converts ~1.1 per mana — under the floor, so the weapon (or a
    // brimming pool) finishes stragglers, never the scarce pool.
    state.enemies.push(
      makeEnemy(
        {
          id: 8000,
          pos: { x: state.player.pos.x + 30, y: state.player.pos.y },
          hp: Math.max(1, Math.round(2 * power)),
          maxHp: 1000,
        },
        "test_minion",
      ),
    );
    const input = decide(state);
    expect(input.castSpell).not.toBe(true);
  });

  it("still clears a TRASH pack it outlevels — kills carry credit past the overkill cap", () => {
    const state = caster(clearAndStart(), ["ember_burst"]);
    state.player.mana = state.player.maxMana * 0.5; // not brimming
    const power = abilityPowerScale(state);
    // Three bodies worth ~2 L1 damage units each: raw overkill capping would
    // score the nova at 6/11 ≈ 0.5 and hold it forever, but erasing three
    // attackers with one cast is the play — the kill credit clears the floor.
    for (const [i, dx] of [30, -30, 50].entries()) {
      state.enemies.push(
        makeEnemy(
          {
            id: 8000 + i,
            pos: { x: state.player.pos.x + dx, y: state.player.pos.y },
            hp: Math.max(1, Math.round(2 * power)),
            maxHp: 1000,
          },
          "test_minion",
        ),
      );
    }
    const input = decide(state);
    expect(input.castSpell).toBe(true);
    expect(input.castSpellIndex).toBe(0);
  });

  it("prefers the cast that converts the most damage per mana", () => {
    // One lone tall foe: arc_bolt lands 26/8 ≈ 3.3 per mana, inferno's ring
    // only clips the one body — 37/22 ≈ 1.7. The bolt is the pick.
    const state = caster(clearAndStart(), ["inferno", "arc_bolt"]);
    state.player.mana = state.player.maxMana;
    tallMob(state, 40);
    const input = decide(state);
    expect(input.castSpell).toBe(true);
    expect(input.castSpellIndex).toBe(1);
  });
});

describe("the bot's heal (the medkit backup, no overheal)", () => {
  it("casts the heal when bleeding with no medkit banked", () => {
    const state = caster(clearAndStart(), ["mending_light", "arc_bolt"]);
    state.player.hp = state.player.maxHp * 0.4;
    const input = decide(state);
    expect(input.castSpell).toBe(true);
    expect(input.castSpellIndex).toBe(0);
  });

  it("holds a big heal whose restored bar would mostly overheal", () => {
    // divine_mending restores 60% — at hp 53% the dent (47%) soaks less than
    // the required share, so the cast waits (not an emergency at 53%).
    const state = caster(clearAndStart(), ["divine_mending"]);
    state.player.hp = state.player.maxHp * 0.53;
    const input = decide(state);
    expect(input.castSpell).not.toBe(true);
  });

  it("fires the heal regardless of overheal when nearly dead", () => {
    const state = caster(clearAndStart(), ["divine_mending"]);
    state.player.hp = state.player.maxHp * 0.25;
    const input = decide(state);
    expect(input.castSpell).toBe(true);
    expect(input.castSpellIndex).toBe(0);
  });

  it("reserves the heal's mana — a damage cast never spends the emergency exit", () => {
    const state = caster(clearAndStart(), ["mending_light", "arc_bolt"]);
    // Dented (below the reserve line) but not yet hurt enough to heal.
    state.player.hp = state.player.maxHp * 0.7;
    tallMob(state, 100);
    // Pool covers the bolt (8) but casting it would break the heal's 18.
    state.player.mana = 20;
    expect(decide(state).castSpell).not.toBe(true);
    // With room for both, the bolt flies.
    state.player.mana = 40;
    const input = decide(state);
    expect(input.castSpell).toBe(true);
    expect(input.castSpellIndex).toBe(1);
  });
});

describe("the bot's martial buff (a fight-opener, never an empty-field cast)", () => {
  it("pops the war cry facing a pack at the engagement ring", () => {
    const state = caster(clearAndStart(), ["war_cry"], { str: 250, int: 0 });
    tallMob(state, 120, 8000);
    tallMob(state, 150, 8001);
    const input = decide(state);
    expect(input.castSpell).toBe(true);
    expect(input.castSpellIndex).toBe(0);
  });

  it("holds the war cry on an empty field and over a running buff", () => {
    const state = caster(clearAndStart(), ["war_cry"], { str: 250, int: 0 });
    expect(decide(state).castSpell).not.toBe(true); // nothing to fight
    tallMob(state, 120, 8000);
    tallMob(state, 150, 8001);
    state.player.buffMs = 3000; // amp already running
    expect(decide(state).castSpell).not.toBe(true);
  });
});

describe("botAssignSpellBar (the strongest unlocked powers, always)", () => {
  it("fills an empty bar with the top attack, AoE, heal, and next damage spell", () => {
    const state = caster(clearAndStart(), []);
    expect(botAssignSpellBar(state)).toBe(true);
    const ids = state.player.spellSlots.filter((s): s is string => s !== null);
    expect(ids).toHaveLength(4);
    expect(ids).toContain("chain_lightning"); // strongest INT attack (220)
    expect(ids).toContain("armageddon"); // strongest INT AoE (250)
    expect(ids).toContain("divine_mending"); // strongest INT heal (240)
    expect(ids).toContain("annulment"); // next-strongest damage (230)
  });

  it("re-slots a stale bar as the class stat grows past its old picks", () => {
    const state = caster(clearAndStart(), [], { int: 40 });
    botAssignSpellBar(state);
    expect(state.player.spellSlots).toContain("arc_bolt");
    // The mage matures: the bar must follow the ladder up, not stay on the
    // four rungs it filled with at INT 40.
    state.player.stats.intelligence = 250;
    expect(botAssignSpellBar(state)).toBe(true);
    expect(state.player.spellSlots).not.toContain("arc_bolt");
    expect(state.player.spellSlots).toContain("chain_lightning");
  });

  it("keeps the martial buff on a warrior's bar", () => {
    const state = caster(clearAndStart(), [], { str: 250, int: 0 });
    botAssignSpellBar(state);
    const ids = state.player.spellSlots.filter((s): s is string => s !== null);
    const kinds = ids.map((id) => spellDef(id).effect.kind);
    expect(kinds).toContain("buff");
    expect(kinds).toContain("heal");
    expect(kinds).toContain("bolt");
    expect(kinds).toContain("nova");
  });

  it("is a no-op on a settled bar (no churn tick to tick)", () => {
    const state = caster(clearAndStart(), []);
    expect(botAssignSpellBar(state)).toBe(true);
    expect(botAssignSpellBar(state)).toBe(false);
  });
});

/** A run on the fixture level with the field swept clean (boss kept, parked
 * far away) so each test stages its own surgical arrangement. */
function clearAndStart(): GameState {
  const state = startGame();
  clearStage(state);
  return state;
}
