// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE BOSS DEATH RITE (engine/game/boss-death.ts): felling a boss no longer
// resolves on the tick of the blow. The run drops into the `bossDeath` phase
// and a scripted send-off plays — the boss on its knees, the horde held off,
// the hero closing and finishing it — and only at the END of that beat do
// `bossDefeated`, the landmark corpse and the last words arrive.
//
// Runs on the synthetic fixtures like every engine-rule suite: what is under
// test is the SCENE, not any shipped boss's staging.

import { describe, expect, it } from "vitest";

import {
  areDeathScenesEnabled,
  BOSS_DEATH,
  bossRiteDurationMs,
  createGame,
  deathRites,
  enemyDef,
  killEnemy,
  riteFor,
  setDeathScenesEnabled,
  skipBossDeath,
  step,
} from "@game/core";
import type { GameEvent, GameState } from "@game/core";

import {
  clearStage,
  DT,
  idle,
  makeEnemy,
  SEED,
  settleBossRite,
  startGame,
} from "./helpers.ts";

const isBoss = (defId: string) => enemyDef(defId).role === "boss";

/** Fell the level's boss, leaving the rite running on its opening tick. */
function fellBoss(state: GameState): { x: number; y: number } {
  clearStage(state);
  const boss = state.enemies.find((e) => isBoss(e.defId))!;
  boss.spoke = true;
  const pos = { ...boss.pos };
  killEnemy(state, boss, 9999, false);
  return pos;
}

describe("the death rite opens", () => {
  it("takes the stage instead of resolving the kill on the spot", () => {
    const state = startGame();
    fellBoss(state);

    expect(state.phase).toBe("bossDeath");
    expect(state.bossDeath).not.toBeNull();
    expect(state.bossDeath!.beat).toBe("stagger");
    // The three things that used to fire on the tick of the blow are all still
    // owed — that deferral IS the feature.
    expect(state.bossCorpse).toBeNull();
    expect(state.events.some((e) => e.type === "bossDefeated")).toBe(false);
    expect(state.dialogue).toBeNull();
  });

  it("pays the kill's XP and drops out immediately anyway", () => {
    // The loot is the player's the instant the blow lands: a cinematic standing
    // between them and what they earned would be the feature taxing the win.
    const state = startGame();
    const before = state.players[0].xp;
    fellBoss(state);
    expect(state.players[0].xp).toBeGreaterThan(before);
    expect(state.stats.kills).toBe(1);
  });

  it("announces itself with the rite it is actually going to perform", () => {
    const state = startGame();
    fellBoss(state);
    const began = state.events.find((e) => e.type === "bossRiteBegan");
    expect(began).toBeDefined();
    expect(began && began.type === "bossRiteBegan" && began.rite).toBe(
      state.bossDeath!.rite,
    );
  });
});

describe("the death rite runs its beats", () => {
  it("walks stagger → act → aftermath, then hands over", () => {
    const state = startGame();
    fellBoss(state);
    const seen = new Set<string>();
    for (let i = 0; i < 600 && state.phase === "bossDeath"; i++) {
      seen.add(state.bossDeath!.beat);
      step(state, idle, DT);
    }
    expect([...seen]).toEqual(["stagger", "act", "aftermath"]);
    expect(state.phase).not.toBe("bossDeath");
    expect(state.bossDeath).toBeNull();
  });

  it("strikes once, and only once", () => {
    const state = startGame();
    fellBoss(state);
    const events = settleBossRite(state);
    const struck = events.filter((e) => e.type === "bossRiteStruck");
    expect(struck).toHaveLength(1);
  });

  it("moves the hero onto the boss and leaves him there", () => {
    const state = startGame();
    const pos = fellBoss(state);
    const startedAt = { ...state.players[0].pos };
    settleBossRite(state);
    // He closed: he is nearer the body at the end than he was at the blow.
    const before = Math.hypot(startedAt.x - pos.x, startedAt.y - pos.y);
    const after = Math.hypot(
      state.players[0].pos.x - pos.x,
      state.players[0].pos.y - pos.y,
    );
    expect(after).toBeLessThan(before);
    // …and he is back on the ground, not stuck mid-leap.
    expect(state.players[0].z).toBeCloseTo(0, 1);
  });

  it("holds the horde off the ring while it plays", () => {
    const state = startGame();
    clearStage(state);
    const boss = state.enemies.find((e) => isBoss(e.defId))!;
    boss.spoke = true;
    const at = { ...boss.pos };
    // A minion standing right on top of the boss: it has to give ground, or the
    // finisher plays behind somebody's head.
    const crowd = state.enemies.find((e) => !isBoss(e.defId));
    if (crowd) crowd.pos = { ...at };
    killEnemy(state, boss, 9999, false);
    settleBossRite(state);
    if (crowd) {
      expect(
        Math.hypot(crowd.pos.x - at.x, crowd.pos.y - at.y),
      ).toBeGreaterThan(BOSS_DEATH.ringRadius - 1);
    }
  });
});

describe("the death rite closes", () => {
  it("leaves the landmark and announces the win over the wreck", () => {
    const state = startGame();
    const pos = fellBoss(state);
    const events = settleBossRite(state);

    expect(events.some((e) => e.type === "bossRiteEnded")).toBe(true);
    expect(events.some((e) => e.type === "bossDefeated")).toBe(true);
    expect(state.bossCorpse).not.toBeNull();
    expect(state.bossCorpse!.pos).toEqual(pos);
  });

  it("opens the boss's last words only once it is over", () => {
    const state = startGame();
    clearStage(state);
    const boss = state.enemies.find((e) => isBoss(e.defId))!;
    // NOT `spoke = true` this time — the death words are the point here.
    killEnemy(state, boss, 9999, false);
    expect(state.dialogue).toBeNull(); // still owed
    settleBossRite(state);
    if (enemyDef(boss.defId).lastWords?.length) {
      expect(state.dialogue?.source).toEqual({
        kind: "enemyDeath",
        defId: boss.defId,
      });
    }
  });

  it("does not arm the victory countdown underneath itself", () => {
    // The loot-grab window running out while the finisher is still on screen
    // would hand the player a cleared field they never saw.
    const state = startGame();
    fellBoss(state);
    for (let i = 0; i < 600 && state.phase === "bossDeath"; i++) {
      expect(state.victoryCountdownMs).toBeNull();
      step(state, idle, DT);
    }
  });
});

describe("skipping", () => {
  it("refuses inside the grace window — the press that was steering", () => {
    const state = startGame();
    fellBoss(state);
    skipBossDeath(state);
    expect(state.bossDeath!.skip).toBe(false);
    expect(state.phase).toBe("bossDeath");
  });

  it("takes past it, and still pays out the blow", () => {
    const state = startGame();
    fellBoss(state);
    // Past the grace window, but well short of the strike.
    const steps = Math.ceil((BOSS_DEATH.skipGraceMs + DT) / DT);
    for (let i = 0; i < steps; i++) step(state, idle, DT);
    expect(state.bossDeath!.beat).toBe("stagger");
    skipBossDeath(state);
    expect(state.bossDeath!.skip).toBe(true);

    const seen: GameEvent[] = [];
    for (let i = 0; i < 10 && state.phase === "bossDeath"; i++) {
      step(state, idle, DT);
      seen.push(...state.events);
    }
    expect(state.phase).not.toBe("bossDeath");
    // Skipping gets on with it; it does not leave a boss that was never
    // finished and no landmark of the fight.
    expect(seen.some((e) => e.type === "bossRiteStruck")).toBe(true);
    expect(seen.some((e) => e.type === "bossDefeated")).toBe(true);
    expect(state.bossCorpse).not.toBeNull();
  });
});

describe("the setting, and the muted run", () => {
  it("DEATH SCENES off sends the boss straight to its last words", () => {
    const was = areDeathScenesEnabled();
    setDeathScenesEnabled(false);
    try {
      const state = startGame();
      const pos = fellBoss(state);
      expect(state.phase).not.toBe("bossDeath");
      expect(state.bossDeath).toBeNull();
      // …and every consequence still lands, on the spot.
      expect(state.bossCorpse).not.toBeNull();
      expect(state.bossCorpse!.pos).toEqual(pos);
      expect(state.events.some((e) => e.type === "bossDefeated")).toBe(true);
    } finally {
      setDeathScenesEnabled(was);
    }
  });

  it("a DIALOGUE-MUTED run skips it too — a headless campaign must not stop", () => {
    const state = startGame();
    state.dialogueMuted = true;
    fellBoss(state);
    expect(state.phase).not.toBe("bossDeath");
    expect(state.events.some((e) => e.type === "bossDefeated")).toBe(true);
  });
});

describe("the FLIGHT rite — the coward's exit", () => {
  /** Stage the fixture coward in reach and beat him to his flight threshold. */
  function routCoward(state: GameState): { x: number; y: number } {
    clearStage(state);
    state.enemies = [];
    const at = { x: state.players[0].pos.x + 60, y: state.players[0].pos.y };
    state.enemies.push(
      makeEnemy(
        { pos: { ...at }, hp: 1, maxHp: 100, powerScaled: true, spoke: true },
        "test_coward",
      ),
    );
    killEnemy(state, state.enemies[0]!, 9999, false);
    return at;
  }

  it("stages a FLIGHT, not a finisher", () => {
    // The bug this pins: a fleeing boss with no `death:` used to resolve to the
    // DEATH default and have a finisher played over a mob that was supposed to
    // run away.
    const state = startGame();
    routCoward(state);
    expect(state.phase).toBe("bossDeath");
    expect(state.bossDeath!.kind).toBe("flight");
    expect(state.bossDeath!.exit).not.toBeNull();
  });

  it("tears the exit open AHEAD of him — away from the hero", () => {
    const state = startGame();
    const at = routCoward(state);
    settleBossRite(state);
    const rift = state.landmarks.find((l) => l.kind === "test_rift");
    expect(rift).toBeDefined();
    // Past where he was beaten, on the far side of him from the hero: the
    // bearing is the whole read of the beat.
    expect(rift!.pos.x).toBeGreaterThan(at.x);
  });

  it("opens the exit as the RUN starts, not during the stagger", () => {
    // A landmark that appeared while he was still reeling would tell the player
    // where he is going before he has decided to run.
    const state = startGame();
    routCoward(state);
    expect(state.landmarks.some((l) => l.kind === "test_rift")).toBe(false);
    const events = settleBossRite(state);
    const opened = events.findIndex((e) => e.type === "bossRiteExitOpened");
    const vanished = events.findIndex((e) => e.type === "bossRiteVanished");
    expect(opened).toBeGreaterThanOrEqual(0);
    expect(vanished).toBeGreaterThan(opened);
  });

  it("actually RUNS: he is at the exit by the time he is taken", () => {
    const state = startGame();
    routCoward(state);
    const from = { ...state.bossDeath!.bossPos };
    const exit = { ...state.bossDeath!.exit! };
    // Step to the end of the act beat, where the bolt lands.
    for (let i = 0; i < 600 && state.bossDeath?.beat !== "aftermath"; i++) {
      step(state, idle, DT);
    }
    expect(state.bossDeath).not.toBeNull();
    const moved = Math.hypot(
      state.bossDeath!.bossPos.x - from.x,
      state.bossDeath!.bossPos.y - from.y,
    );
    expect(moved).toBeGreaterThan(1);
    expect(
      Math.hypot(
        state.bossDeath!.bossPos.x - exit.x,
        state.bossDeath!.bossPos.y - exit.y,
      ),
    ).toBeLessThan(4);
  });

  it("books an ESCAPE, never a win — and leaves no corpse to tap", () => {
    const state = startGame();
    routCoward(state);
    const events = settleBossRite(state);
    expect(events.some((e) => e.type === "bossFled")).toBe(true);
    expect(events.some((e) => e.type === "bossDefeated")).toBe(false);
    expect(events.some((e) => e.type === "bossRiteStruck")).toBe(false);
    expect(state.bossCorpse).toBeNull();
  });
});

describe("the catalog", () => {
  it("gives every rite a blurb the library can print", () => {
    for (const rite of deathRites()) {
      expect(rite.blurb.trim().length, rite.id).toBeGreaterThan(20);
    }
  });

  it("resolves the default off the ENDING, not off the id alone", () => {
    // The bug this pins: a fleeing boss with no `death:` used to fall back to a
    // DEATH rite, so the scene staged a finisher for a mob that was meant to
    // run — tearing no exit open and booking `bossDefeated` for an escape.
    expect(riteFor(undefined, true).flight).toBe(true);
    expect(riteFor(undefined, false).flight ?? false).toBe(false);
    // A rite whose kind disagrees with the ending is refused the same way,
    // rather than staging a scene that cannot resolve.
    expect(riteFor("execution", true).flight).toBe(true);
    expect(riteFor("bolt", false).flight ?? false).toBe(false);
  });

  it("never lets a rite shorten the beats below their floors", () => {
    // A tell shorter than a reaction is not a tell — the same rule a boss
    // ability's `windupFloorMs` follows.
    const floor =
      BOSS_DEATH.staggerMs + BOSS_DEATH.actMs + BOSS_DEATH.aftermathMs;
    for (const rite of deathRites()) {
      expect(bossRiteDurationMs(rite.id), rite.id).toBeGreaterThanOrEqual(
        floor,
      );
    }
  });

  it("a fresh run has no rite running", () => {
    const state = createGame(SEED, "test_level");
    expect(state.bossDeath).toBeNull();
  });
});
