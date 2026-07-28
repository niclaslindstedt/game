// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// LAIRS — the houses somebody lives in (see `LevelDef.lairs`).
//
// Every other set piece on a generated map stands in the open, because that is
// what a generator can do without being told anything: pick a room, drop a named
// elite in the middle of it. It works, and it is why they all feel the same — the
// hero sees the duel coming from two rooms away and walks into it.
//
// A lair inverts that. The house is a house: the hero walks past a row of them,
// and one of them OPENS. What comes out has the manners to say something first
// (an elite's own `dialogue` takes the stage when it closes, exactly as it does
// anywhere else) and then tries to kill him. That is a scene, and the map only
// has to be able to place a door for it to happen.
//
// Modelled on placed packs (`step/packs.ts`) — dormant until the hero closes,
// then woken once and for good — with two differences. The occupant is a SET
// PIECE at an authored level and hp rather than a count of relative-levelled
// minions, and the DOOR is real: a prop with a shut frame and an open one, which
// stays open afterwards because the point of the beat is that the hero can see
// where the thing came from.

import { distance, vec, type Vec2 } from "@game/lib/vec.ts";
import { applyAuthoredScaling, spawnEnemy } from "./create.ts";
import { difficultyDef } from "./defs/difficulties.ts";
import { enemyDef } from "./defs/enemies/index.ts";
import { runLevelDef } from "./defs/levels/index.ts";
import type { LevelDef } from "./defs/levels/types.ts";
import { menaceStage } from "./menace.ts";
import type { GameState, LairState } from "./types/index.ts";

/** One authored lair, as the level def carries it. */
type LairSpec = NonNullable<LevelDef["lairs"]>[number];

/** How far out of the doorway the occupant steps as it comes through. */
const STEP_OUT = 26;

/** The default trigger radius when a lair authors none (world px). */
export const LAIR_TRIGGER = 250;

/**
 * Open any lair the hero has walked up to.
 *
 * Runs with the other proximity passes, after the hero has moved. A frozen pose
 * (the scenario stage) and the post-objective victory lap never open one — the
 * same gate placed packs use, for the same reason: neither is a moment to start
 * a fresh fight in.
 */
export function stepLairs(state: GameState): void {
  const lairs = state.lairs;
  if (!lairs || lairs.length === 0) return;
  if (state.freeze || state.victoryCountdownMs !== null) return;
  const specs = runLevelDef(state).lairs ?? [];
  for (let i = 0; i < lairs.length; i++) {
    const lair = lairs[i] as LairState;
    if (lair.open) continue;
    if (distance(state.player.pos, lair.pos) > lair.triggerRadius) continue;
    const spec = specs[i];
    if (!spec) continue;
    lair.open = true;
    lair.sprite = lair.openSprite;
    // The occupant steps out TOWARD the hero, so it clears the doorway it came
    // through instead of standing in it.
    const out = stepOut(lair.pos, state.player.pos);
    mint(state, spec.enemy, out, spec.level, spec.hp);
    for (const guard of spec.escort ?? []) {
      for (let n = 0; n < guard.count; n++) {
        // Fanned out behind the leader — a detail coming through one door arrives
        // in a queue, not in a ring.
        const back = vec(
          out.x + (n - (guard.count - 1) / 2) * 22,
          out.y + (n + 1) * 18,
        );
        mint(state, guard.enemy, back, guard.level, guard.hp);
      }
    }
    state.events.push({
      type: "lairOpened",
      pos: { ...lair.pos },
      id: lair.id,
    });
  }
}

/** A point `STEP_OUT` px from the doorway toward the hero (the doorway itself
 * when he is standing exactly on it). */
function stepOut(door: Vec2, toward: Vec2): Vec2 {
  const dx = toward.x - door.x;
  const dy = toward.y - door.y;
  const len = Math.hypot(dx, dy);
  if (len < 1) return vec(door.x, door.y + STEP_OUT);
  return vec(
    Math.round(door.x + (dx / len) * STEP_OUT),
    Math.round(door.y + (dy / len) * STEP_OUT),
  );
}

/** Mint one set piece onto the field, awake and coming. */
function mint(
  state: GameState,
  defId: string,
  at: Vec2,
  level: LairSpec["level"],
  hp: LairSpec["hp"],
): void {
  const enemy = applyAuthoredScaling(
    spawnEnemy(
      defId,
      at,
      state.rng,
      state.nextId++,
      1,
      menaceStage(state),
      difficultyDef(state.difficulty).menaceEffectMult,
      state.player.level,
    ),
    level,
    hp,
    state.difficulty,
    state.rng,
  );
  // It came out to meet him: already awake, so it engages instead of dozing on
  // the porch waiting to be noticed.
  enemy.awake = true;
  state.enemies.push(enemy);
  if (enemyDef(defId).role === "minion") state.pendingMinionSpawns++;
}
