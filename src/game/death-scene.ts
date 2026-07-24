// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The DEATH SCENE — the dramatic tableau that plays the moment the hero falls,
// before the YOU DIED modal. The run drops out of `playing` into the `dying`
// phase, whose reduced pass (`stepDeathScene`, run from step/ ahead of the
// `playing` gate) choreographs the horde: the mobs stop attacking, back off,
// and ring the fallen hero, more of them wander in from the screen edges to
// swell the crowd, and — once `DEATH_SCENE.durationMs` has run (or a tap sets
// `skip`) — the run drops to `defeat` and the splash rises. The clouds rolling
// across the field and the bleeding corpse are pure presentation (the app
// draws them off `deathScene.ms`); the engine owns only the mob choreography
// and the timer, so the whole beat stays deterministic and headless-testable.

import { clamp, distance, moveToward, type Vec2 } from "@game/lib/vec.ts";
import { DEATH_SCENE } from "./config/index.ts";
import { spawnEnemy } from "./create.ts";
import { difficultyDef, meetsMinDifficulty } from "./defs/difficulties.ts";
import { enemyDef } from "./defs/enemies/index.ts";
import { levelDef } from "./defs/levels/index.ts";
import { applyDeathXpPenalty } from "./loot.ts";
import { revealRect } from "./map.ts";
import {
  currentMobLevel,
  menaceStage,
  mobLevelScale,
  resolveMobScaling,
} from "./menace.ts";
import { insideObstacle } from "./obstacles.ts";
import { separateEnemies } from "./step/enemies.ts";
import type { GameState } from "./types/index.ts";

/**
 * The hero fell: drop the run into the DEATH SCENE. Books the death toll now
 * (so the splash reads `stats.xpLost` when the scene ends), pins the tableau's
 * centre at the corpse, and emits `playerDeath` so the app can land the death
 * sting/haptic/camera-kick at the exact moment of the collapse (the `defeat`
 * event — the modal — comes seconds later, when `stepDeathScene` times out).
 * Called from the step pipeline's `hp <= 0` chokepoint, so EVERY fatal path
 * (contact, hazard, a black-hole swallow) routes through the same scene.
 */
export function enterDeathScene(state: GameState): void {
  const player = state.player;
  player.hp = 0;
  // No lingering post-hit blink over the corpse — the death pose owns the
  // sprite from here (the flash timer would otherwise sit frozen at `dying`).
  player.hurtFlashMs = 0;
  player.moving = false;
  const xpLost = applyDeathXpPenalty(state);
  state.phase = "dying";
  state.deathScene = {
    ms: 0,
    center: { ...player.pos },
    xpLost,
    spawnCooldownMs: 0,
    skip: false,
  };
  state.events.push({ type: "playerDeath", pos: { ...player.pos } });
}

/**
 * One tick of the DEATH SCENE (run while `phase === "dying"`). Advances the
 * scene clock, gathers the horde into a standing ring around the fallen hero,
 * wanders fresh mobs in from the screen edges to fill the field, and — at the
 * end of the beat (or on a tapped `skip`) — drops the run to `defeat` and
 * raises the modal.
 */
export function stepDeathScene(state: GameState, dtMs: number): void {
  const scene = state.deathScene;
  if (!scene) {
    // Defensive: a `dying` phase with no scene (a thawed/legacy state) just
    // falls through to the modal rather than hanging.
    enterDefeat(state, 0);
    return;
  }
  scene.ms += dtMs;

  if (scene.skip || scene.ms >= DEATH_SCENE.durationMs) {
    enterDefeat(state, scene.xpLost);
    return;
  }

  // Lift the fog off the whole visible field around the corpse each tick, so
  // the gathering crowd is actually SEEN filling the screen instead of being
  // culled on ground the hero never explored. The run is ending, so scarring
  // the explored map here costs nothing.
  revealDeathField(state, scene.center);

  const dt = dtMs / 1000;
  gatherHorde(state, scene.center, dt);
  scene.spawnCooldownMs -= dtMs;
  if (scene.spawnCooldownMs <= 0) {
    for (let i = 0; i < DEATH_SCENE.spawnPerPulse; i++) {
      if (state.enemies.length >= DEATH_SCENE.maxCrowd) break;
      spawnCrowdMob(state, scene.center);
    }
    scene.spawnCooldownMs = DEATH_SCENE.spawnEveryMs;
  }
}

/** A tap during the scene: skip the tableau and raise the modal on the next
 * `dying` tick (so the `defeat` event still fires from inside `step`, where the
 * app's sound/banking consumers see it). */
export function skipDeathScene(state: GameState): void {
  if (state.phase === "dying" && state.deathScene) state.deathScene.skip = true;
}

/** Close the scene: emit the modal's `defeat` event and drop the run to the
 * defeat splash. */
function enterDefeat(state: GameState, xpLost: number): void {
  state.phase = "defeat";
  state.deathScene = null;
  state.events.push({ type: "defeat", xpLost });
}

/** Uncover the fog across the on-screen field around the corpse (plus a margin
 * so mobs are already visible as they wander in over the edge). Falls back to a
 * generous square when there is no live camera (headless). */
function revealDeathField(state: GameState, center: Vec2): void {
  const halfW = (state.view ? state.view.width : 440) / 2 + 60;
  const halfH = (state.view ? state.view.height : 260) / 2 + 60;
  revealRect(state, {
    x: center.x - halfW,
    y: center.y - halfH,
    width: halfW * 2,
    height: halfH * 2,
  });
}

/**
 * Draw the horde into a standing ring around the corpse: each mob shuffles
 * slowly toward the fall point but never crosses `DEATH_SCENE.ringRadius`, so
 * the crowd packs in from the ring outward and leaves the hero lying alone in
 * the middle. The shared separation pass then spreads the stack into a thick
 * living crowd (concentric rings) instead of a collapsed blob.
 */
function gatherHorde(state: GameState, center: Vec2, dt: number): void {
  const inner = DEATH_SCENE.ringRadius;
  // The edge of what the player can see (world px from the corpse): a mob still
  // outside it hurries in from the dark; once on screen it slows to the
  // menacing shuffle so the ring reads ominous, not a stampede.
  const onScreen = state.view
    ? Math.min(state.view.width, state.view.height) / 2
    : 200;
  for (const enemy of state.enemies) {
    const def = enemyDef(enemy.defId);
    // Apparitions are ghosts, not mourners — leave them out of the ring.
    if (def.apparition) continue;
    const d = distance(enemy.pos, center);
    // An ABSOLUTE pace (px/s) so slow and fast mobs alike close the ring at a
    // consistent, readable speed — a rush in from the dark, a shuffle once near.
    const speed =
      d > onScreen ? DEATH_SCENE.approachSpeed : DEATH_SCENE.gatherSpeed;
    const target = inner + def.radius;
    if (d > target + 1) {
      // Walk in toward the corpse, stopping at the ring so it can't trample
      // over where the hero lies.
      enemy.pos = moveToward(
        enemy.pos,
        center,
        Math.min(speed * dt, d - target),
      );
    } else if (d < inner - 1) {
      // Too close (it was mid-lunge when he fell): back off out of the deathbed.
      const away = d > 0.001 ? (enemy.pos.x - center.x) / d : 1;
      const awayY = d > 0.001 ? (enemy.pos.y - center.y) / d : 0;
      enemy.pos.x += away * speed * dt;
      enemy.pos.y += awayY * speed * dt;
    }
    // Otherwise it stands in the ring, watching.
    enemy.pos.x = clamp(
      enemy.pos.x,
      def.radius,
      state.level.width - def.radius,
    );
    enemy.pos.y = clamp(
      enemy.pos.y,
      def.radius,
      state.level.height - def.radius,
    );
  }
  separateEnemies(state);
}

/**
 * Wander one fresh mob in from a screen edge to swell the crowd. It appears
 * just off-camera on a random bearing around the corpse and is left to
 * `gatherHorde` to walk it in toward the ring. Draws its kind from the level's
 * own difficulty-eligible wave pool (falling back to a minion already on the
 * field) so the mourners look like the level's horde, and scales it like a
 * wave spawn — the numbers barely matter (it never attacks), but keeping the
 * one spawn path means no special-cased mob shape.
 */
function spawnCrowdMob(state: GameState, center: Vec2): void {
  const defId = pickCrowdDef(state);
  if (!defId) return;
  const def = enemyDef(defId);
  const view = state.view;
  // Just past the screen corner, so the mob visibly wanders IN from the edge.
  const spawnDist = view ? Math.hypot(view.width, view.height) / 2 + 24 : 260;
  const { width, height } = state.level;
  let pos: Vec2 | null = null;
  for (let attempt = 0; attempt < 8; attempt++) {
    const angle = state.rng() * Math.PI * 2;
    const candidate = {
      x: clamp(
        center.x + Math.cos(angle) * spawnDist,
        def.radius,
        width - def.radius,
      ),
      y: clamp(
        center.y + Math.sin(angle) * spawnDist,
        def.radius,
        height - def.radius,
      ),
    };
    if (!insideObstacle(state, candidate, def.radius)) {
      pos = candidate;
      break;
    }
  }
  if (!pos) return;
  const sc = resolveMobScaling(
    levelDef(state.level.id).mobLevels,
    state.difficulty,
    state.player.level,
    state.rng,
    mobLevelScale(state),
    currentMobLevel(state),
  );
  const enemy = spawnEnemy(
    defId,
    pos,
    state.rng,
    state.nextId++,
    sc.hpMult,
    menaceStage(state),
    difficultyDef(state.difficulty).menaceEffectMult,
    sc.mlvl,
    sc.banded,
  );
  // Awake so it reads as drawn to the corpse, not dozing at a post it never had.
  enemy.awake = true;
  state.enemies.push(enemy);
}

/** The kind of mob to wander in: a random difficulty-eligible entry from the
 * level's wave budget, or — on a level with no waves — the kind of a minion
 * already standing on the field. Null when the level has neither (nothing to
 * swell the crowd with). */
function pickCrowdDef(state: GameState): string | null {
  const waves = levelDef(state.level.id).waves;
  if (waves) {
    const pool = waves.budget.filter((entry) =>
      meetsMinDifficulty(state.difficulty, entry.minDifficulty),
    );
    if (pool.length > 0) {
      return pool[Math.floor(state.rng() * pool.length)]!.enemy;
    }
  }
  const minion = state.enemies.find(
    (e) => enemyDef(e.defId).role === "minion" && !enemyDef(e.defId).apparition,
  );
  return minion?.defId ?? null;
}
