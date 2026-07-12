// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE MAGIC CRIT BLOB (config `MAGIC_CRIT`): the hero's own single-target MAGIC
// crit bursts a small arcane splash around the struck foe, billing the nearest
// few OTHERS for a fraction of the blow. INTELLIGENCE grows the reach and the
// target count, both firmly capped so it never clears a horde. Only his own
// direct weapon crit blobs — a chain leap, a proc, a companion's shot, a
// physical crit, and a non-crit never do — and the blob's own splash can't blob
// again (the queue gate rides `rollAccuracy`).

import { describe, expect, it } from "vitest";

import { MAGIC_CRIT, effectiveStat, step } from "@game/core";
// Engine-internal kill funnel — where the blob is queued.
import { hitEnemy } from "../../src/game/loot.ts";

import { idle, makeEnemy, startGame, stopWaves } from "./helpers.ts";

/** An rng that returns each queued value once, then 0.99 (no crit) forever. */
const seqRng = (vals: number[]): (() => number) => {
  let i = 0;
  return () => (i < vals.length ? (vals[i++] as number) : 0.99);
};

// hitEnemy with rollAccuracy draws rng three times — miss, dodge, crit. High
// values pass the first two (no miss, no dodge); the last forces/denies crit.
const CRIT = [0.99, 0.99, 0.0];
const NO_CRIT = [0.99, 0.99, 0.99];

describe("magic crit blob — the queue gate", () => {
  it("queues a blob on the hero's own MAGIC crit", () => {
    const state = startGame();
    const enemy = makeEnemy({ pos: { x: 500, y: 500 }, hp: 999, maxHp: 999 });
    state.enemies = [enemy];
    state.rng = seqRng(CRIT);
    hitEnemy(state, enemy, 20, "magic", { rollAccuracy: true });
    expect(state.pendingCritBlobs).toHaveLength(1);
    expect(state.pendingCritBlobs[0]?.victimId).toBe(enemy.id);
    expect(state.pendingCritBlobs[0]?.blowDamage).toBe(20);
  });

  it("does NOT blob a magic hit that didn't crit", () => {
    const state = startGame();
    const enemy = makeEnemy({ pos: { x: 500, y: 500 }, hp: 999, maxHp: 999 });
    state.enemies = [enemy];
    state.rng = seqRng(NO_CRIT);
    hitEnemy(state, enemy, 20, "magic", { rollAccuracy: true });
    expect(state.pendingCritBlobs).toHaveLength(0);
  });

  it("does NOT blob a PHYSICAL crit", () => {
    const state = startGame();
    const enemy = makeEnemy({ pos: { x: 500, y: 500 }, hp: 999, maxHp: 999 });
    state.enemies = [enemy];
    state.rng = seqRng(CRIT);
    hitEnemy(state, enemy, 20, "melee", { rollAccuracy: true });
    expect(state.pendingCritBlobs).toHaveLength(0);
  });

  it("does NOT blob a magic crit that isn't the hero's own blow (no rollAccuracy)", () => {
    const state = startGame();
    const enemy = makeEnemy({ pos: { x: 500, y: 500 }, hp: 999, maxHp: 999 });
    state.enemies = [enemy];
    // Without rollAccuracy the crit is the FIRST (only) rng draw.
    state.rng = seqRng([0.0]);
    hitEnemy(state, enemy, 20, "magic");
    expect(state.pendingCritBlobs).toHaveLength(0);
  });
});

/** The blob's reach and target count for the current INT, mirroring
 * `stepMagicCritBlobs`. */
const blobShape = (state: ReturnType<typeof startGame>) => {
  const int = effectiveStat(state, "intelligence");
  return {
    radius: Math.min(
      MAGIC_CRIT.blobRadiusMax,
      MAGIC_CRIT.blobRadius + int * MAGIC_CRIT.blobRadiusPerInt,
    ),
    maxTargets: Math.min(
      MAGIC_CRIT.blobTargetsMax,
      Math.floor(MAGIC_CRIT.blobTargets + int * MAGIC_CRIT.blobTargetsPerInt),
    ),
  };
};

describe("magic crit blob — the burst", () => {
  // Stage a blob far from the hero (out of weapon range, so nothing else hits
  // this tick), a cluster of tough OTHER foes inside its reach, and drain it
  // with one step. The victim sits at the centre and is billed nothing extra.
  const stageBurst = (intel: number, innerCount: number) => {
    const state = startGame();
    stopWaves(state);
    state.player.stats.intelligence = intel;
    // Keep the hero's own weapon holstered this tick so nothing but the blob
    // touches the cluster.
    state.player.weaponCooldownMs = 1e9;
    const shape = blobShape(state);
    // Just off the hero (in-level, out of contact range) — the blob is placed
    // here, not fired, so it needn't be in weapon range.
    const cx = state.player.pos.x;
    const cy = state.player.pos.y - 120;
    const victim = makeEnemy({
      id: 1,
      pos: { x: cx, y: cy },
      hp: 9999,
      maxHp: 9999,
    });
    const inner = Array.from({ length: innerCount }, (_, i) =>
      makeEnemy({
        id: 100 + i,
        // Fanned out along a line, all comfortably inside the reach.
        pos: { x: cx + 4 + i * 3, y: cy },
        hp: 9999,
        maxHp: 9999,
      }),
    );
    const outer = makeEnemy({
      id: 500,
      pos: { x: cx + shape.radius + 40, y: cy },
      hp: 9999,
      maxHp: 9999,
    });
    state.enemies = [victim, ...inner, outer];
    state.pendingCritBlobs.push({
      pos: { x: cx, y: cy },
      blowDamage: 200,
      victimId: victim.id,
    });
    step(state, idle, 16);
    return { state, shape, victim, inner, outer };
  };

  it("splashes the nearest others, excludes the victim, and emits a nova", () => {
    const intel = 40;
    const { state, shape, outer } = stageBurst(intel, shape2Count(40) + 1);
    // The victim already took the crit — it is not billed by the splash.
    const victim = state.enemies.find((e) => e.id === 1);
    expect(victim?.hp).toBe(9999);
    // Exactly `maxTargets` of the inner cluster were splashed (the cap holds).
    const splashed = state.enemies.filter(
      (e) => e.id >= 100 && e.id < 500 && e.hp < 9999,
    );
    expect(splashed).toHaveLength(shape.maxTargets);
    // The foe beyond the reach is untouched.
    expect(state.enemies.find((e) => e.id === outer.id)?.hp).toBe(9999);
    // The burst rendered as a violet nova at the blob's radius.
    const nova = state.events.find((e) => e.type === "nova");
    expect(nova).toBeTruthy();
    expect(nova && "radius" in nova && nova.radius).toBeCloseTo(
      shape.radius,
      6,
    );
  });

  it("grows the reach and the target count with INTELLIGENCE, both capped", () => {
    const low = startGame();
    low.player.stats.intelligence = 0;
    const lowShape = blobShape(low);
    // At zero INT the blob is its small base — one splash target, tight ring.
    expect(lowShape.maxTargets).toBe(MAGIC_CRIT.blobTargets);
    expect(lowShape.radius).toBe(MAGIC_CRIT.blobRadius);

    const high = startGame();
    high.player.stats.intelligence = 5000; // far past the caps
    const highShape = blobShape(high);
    expect(highShape.maxTargets).toBeGreaterThan(lowShape.maxTargets);
    expect(highShape.radius).toBeGreaterThan(lowShape.radius);
    // …but never past the ceilings — big AoE is uniques' job, not the baseline.
    expect(highShape.maxTargets).toBe(MAGIC_CRIT.blobTargetsMax);
    expect(highShape.radius).toBe(MAGIC_CRIT.blobRadiusMax);
  });

  it("caps the splash at blobTargetsMax even in a dense pack", () => {
    const { state } = stageBurst(5000, MAGIC_CRIT.blobTargetsMax + 3);
    const splashed = state.enemies.filter(
      (e) => e.id >= 100 && e.id < 500 && e.hp < 9999,
    );
    expect(splashed).toHaveLength(MAGIC_CRIT.blobTargetsMax);
  });
});

/** `maxTargets` at a given raw INT stat, for sizing the cluster in the test. */
function shape2Count(intel: number): number {
  const state = startGame();
  state.player.stats.intelligence = intel;
  return blobShape(state).maxTargets;
}
