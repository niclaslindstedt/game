// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The fleeing unique (`EnemyDef.flees`): a boss beaten to 0 hp ESCAPES
// instead of dying — off the board with a `bossFled` event (never a kill),
// XP and guaranteed drops still paid, its `lastWords` played through the
// death-scene box, and the named landmark (the rift it tore open) left where
// it vanished. A `killBoss` objective still clears: fled is gone.

import { describe, expect, it } from "vitest";

import {
  advanceDialogue,
  allocateStat,
  dialogueContent,
  step,
} from "@game/core";
import type { GameEvent, GameState } from "@game/core";
import {
  clearStage,
  DT,
  equipBlaster,
  idle,
  makeEnemy,
  run,
  startGame,
} from "./helpers.ts";

/** A run holding only the coward, parked in blaster reach of the player. */
function stageCoward(state: GameState): void {
  clearStage(state);
  state.enemies = []; // drop the parked objective boss too — the coward IS it
  state.enemies.push(
    makeEnemy(
      {
        pos: { x: state.player.pos.x + 80, y: state.player.pos.y },
        hp: 10,
        maxHp: 100,
        // Latch the power-match so the staged hp stays exactly as written.
        powerScaled: true,
        // Keep the scene quiet: the flee rules, not the arrival dialogue,
        // are under test (the fixture coward has no dialogue anyway).
        spoke: true,
      },
      "test_coward",
    ),
  );
  equipBlaster(state);
}

/** Step until the coward is off the board, collecting every event seen. */
function runUntilFled(state: GameState): GameEvent[] {
  const seen: GameEvent[] = [];
  for (let i = 0; i < 500 && state.enemies.length > 0; i++) {
    step(state, idle, DT);
    seen.push(...state.events);
  }
  return seen;
}

describe("fleeing uniques", () => {
  it("escapes at 0 hp: bossFled, no kill, no bossDefeated", () => {
    const state = startGame();
    stageCoward(state);
    const events = runUntilFled(state);

    expect(state.enemies).toHaveLength(0);
    const fled = events.find((e) => e.type === "bossFled");
    expect(fled).toBeDefined();
    expect(fled && fled.type === "bossFled" && fled.defId).toBe("test_coward");
    // An escape is not a kill: no corpse events, no kill booked.
    expect(events.some((e) => e.type === "enemyKilled")).toBe(false);
    expect(events.some((e) => e.type === "bossDefeated")).toBe(false);
    expect(state.stats.kills).toBe(0);
  });

  it("leaves its escape landmark where it vanished", () => {
    const state = startGame();
    stageCoward(state);
    runUntilFled(state);

    const rift = state.landmarks.find((l) => l.kind === "test_rift");
    expect(rift).toBeDefined();
    expect(rift!.sprite).toBe("test_rift");
    // Torn open at the spot it fled from — inside the little arena staged
    // around the player, not at some default corner.
    expect(Math.abs(rift!.pos.x - state.player.pos.x)).toBeLessThan(120);
    expect(Math.abs(rift!.pos.y - state.player.pos.y)).toBeLessThan(120);
  });

  it("still pays XP and its guaranteed drops on the way out", () => {
    const state = startGame();
    stageCoward(state);
    runUntilFled(state);

    expect(state.stats.xpGained).toBeGreaterThan(0);
    expect(
      state.items.some(
        (i) => i.kind === "equipment" && i.equipment.defId === "test_hammer",
      ),
    ).toBe(true);
  });

  it("gasps its parting words through the death-scene box", () => {
    const state = startGame();
    stageCoward(state);
    runUntilFled(state);

    expect(state.phase).toBe("dialogue");
    expect(state.dialogue?.source.kind).toBe("enemyDeath");
    expect(dialogueContent(state.dialogue!).pages).toEqual([
      ["NOT THE FACE...", "GOODBYE..."],
    ]);
  });

  it("with belowHpFrac, bolts at the threshold instead of grinding to 0", () => {
    const state = startGame();
    clearStage(state);
    state.enemies = [];
    state.enemies.push(
      makeEnemy(
        {
          pos: { x: state.player.pos.x + 80, y: state.player.pos.y },
          hp: 100,
          maxHp: 100,
          powerScaled: true,
          spoke: true,
        },
        "test_coward_early",
      ),
    );
    equipBlaster(state);
    const events = runUntilFled(state);

    // It fled (off the board, bossFled booked, no kill) — same escape path.
    expect(state.enemies).toHaveLength(0);
    expect(events.some((e) => e.type === "bossFled")).toBe(true);
    expect(state.stats.kills).toBe(0);
    // The proof it triggered EARLY: it escaped having taken only the top slice
    // of its bar (threshold 0.75), not the full ~100 a flee-at-0 would need.
    expect(state.stats.damageDealt).toBeGreaterThan(0);
    expect(state.stats.damageDealt).toBeLessThan(60);
  });

  it("clears a killBoss objective — fled is gone", () => {
    const state = startGame();
    stageCoward(state);
    runUntilFled(state);
    advanceDialogue(state); // tap through the parting words
    // Spend any level-up the escape's XP just banked, so play resumes.
    while (state.player.pendingStatPoints > 0) allocateStat(state, "strength");

    // The victory countdown runs out with no boss left on the board.
    run(state, idle, 1000, (s) => s.phase === "victory");
    expect(state.phase).toBe("victory");
  });
});
