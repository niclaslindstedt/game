// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// A unique mob's send-off: elites and bosses gasp their `lastWords` as they
// die, reusing the arrival dialogue box (an `enemyDeath` scene, one page
// tapped through to close). Minions die silently — the parting line is what
// marks a story death as special.

import { describe, expect, it } from "vitest";

import {
  advanceDialogue,
  dialogueContent,
  ENEMY_DEFS,
  enemyDef,
  step,
  xpToLevelUp,
  type GameEvent,
  type GameState,
} from "@game/core";

import { clearStage, DT, idle, makeEnemy, startGame } from "../helpers.ts";

/** Drive the run until `enemyId` is dead, gathering every event emitted. */
function killAndCollect(state: GameState, enemyId: number): GameEvent[] {
  const collected: GameEvent[] = [];
  for (let i = 0; i < 120; i++) {
    step(state, idle, DT);
    collected.push(...state.events);
    if (!state.enemies.some((e) => e.id === enemyId)) break;
  }
  return collected;
}

/** A point-blank, one-hit-from-death mob of the given def, on the player. */
function placeDying(state: GameState, defId: string) {
  // Pin the combat rolls off so the very next swing lands the kill: never a
  // miss, a dodge, or a crit. Without this the hero could whiff the killing
  // blow and the elite would reach its arrival scene before dying.
  state.rng = () => 0.99;
  const mob = makeEnemy(
    { pos: { ...state.player.pos }, hp: 1, maxHp: 10, speed: 0 },
    defId,
  );
  state.enemies.push(mob);
  return mob;
}

describe("last words on death", () => {
  it("opens the elite's death scene in the dialogue box", () => {
    const state = startGame();
    clearStage(state);
    const elite = placeDying(state, "apollo_ghost");

    const events = killAndCollect(state, elite.id);
    expect(events.some((e) => e.type === "enemyLastWords")).toBe(true);
    expect(state.phase).toBe("dialogue");
    expect(state.dialogue?.source).toEqual({
      kind: "enemyDeath",
      defId: "apollo_ghost",
    });
    // The scene plays the def's last words as a single page, spoken by name.
    const content = dialogueContent(state.dialogue!);
    expect(content.speaker).toBe(enemyDef("apollo_ghost").name);
    expect(content.pages).toEqual([enemyDef("apollo_ghost").lastWords]);
  });

  it("emits enemyLastWords, not the arrival knock", () => {
    const state = startGame();
    clearStage(state);
    const elite = placeDying(state, "prospector");

    const events = killAndCollect(state, elite.id);
    const last = events.find((e) => e.type === "enemyLastWords");
    expect(last).toEqual({ type: "enemyLastWords", defId: "prospector" });
    // The death scene gets its own cue — never mistaken for an arrival.
    expect(events.some((e) => e.type === "dialogueStarted")).toBe(false);
  });

  it("resumes play once the single page is tapped through", () => {
    const state = startGame();
    clearStage(state);
    const elite = placeDying(state, "quarantine_medic");

    killAndCollect(state, elite.id);
    expect(state.phase).toBe("dialogue");
    // One short page: a single tap closes it and hands the world back.
    expect(dialogueContent(state.dialogue!).pages).toHaveLength(1);
    advanceDialogue(state);
    expect(state.dialogue).toBeNull();
    // Nothing was owed a stat point here, so play resumes outright.
    expect(state.phase).toBe("playing");
  });

  it("banks a pending level-up behind the death scene", () => {
    const state = startGame();
    clearStage(state);
    state.rng = () => 0.99; // land the killing blow deterministically
    // A fat XP payout — over a full level's worth — so the killing blow both
    // banks a level-up AND opens the death scene: the scene wins the phase, the
    // level-up waits its turn. Sized off the live curve so it stays a ding
    // through any pacing retune.
    const elite = makeEnemy(
      {
        pos: { ...state.player.pos },
        hp: 1,
        maxHp: xpToLevelUp(1) + 500,
        speed: 0,
      },
      "cartographer",
    );
    state.enemies.push(elite);

    killAndCollect(state, elite.id);
    expect(state.phase).toBe("dialogue");
    expect(state.player.pendingStatPoints).toBeGreaterThan(0);
    advanceDialogue(state);
    // The scene closed straight into the level-up chooser it was holding back.
    expect(state.phase).toBe("levelup");
  });

  it("stays silent for nameless minions", () => {
    const state = startGame();
    clearStage(state);
    // A ghost, not a wisp — the moon pins a first-kill thought to the wisp,
    // and this test is about last-words silence, not player thoughts.
    const minion = placeDying(state, "ghost");

    const events = killAndCollect(state, minion.id);
    expect(events.some((e) => e.type === "enemyKilled")).toBe(true);
    expect(events.some((e) => e.type === "enemyLastWords")).toBe(false);
    expect(state.phase).toBe("playing");
    expect(state.dialogue).toBeNull();
  });
});

describe("last-words catalog", () => {
  it("gives every speaking unique (elite/boss) a parting line", () => {
    for (const def of Object.values(ENEMY_DEFS)) {
      if (def.role === "minion") {
        expect(def.lastWords, def.id).toBeUndefined();
        continue;
      }
      // Apparitions never die, so a parting line would be dead data.
      if (def.apparition) {
        expect(def.lastWords, def.id).toBeUndefined();
        continue;
      }
      expect(def.lastWords?.length ?? 0, def.id).toBeGreaterThan(0);
      // A gasp, not a paragraph: at most two short lines.
      expect((def.lastWords ?? []).length, def.id).toBeLessThanOrEqual(2);
      for (const line of def.lastWords ?? []) {
        expect(line.length, `${def.id}: "${line}"`).toBeLessThanOrEqual(30);
      }
    }
  });
});
