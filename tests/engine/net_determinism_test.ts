// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE CLAIM THE STATIC TIER RESTS ON: the same arguments build the same world
// in two processes.
//
// The client never receives the level. It calls `createGame` with the
// `SessionParams` the welcome carried and builds the obstacles, the decor, the
// canopy, the spawner layout and the carved geometry itself — ~100 KB the wire
// does not carry, per level, per client. That is a BIT-FOR-BIT determinism
// claim across the same build, and the plan is explicit that it must be tested
// rather than believed (§1.4): if it is false, the failure does not present as
// a wrong number, it presents as a desync three rooms into a level that nobody
// can reproduce.
//
// It is checked at two depths, because they catch different things:
//
//   in-process   two `createGame` calls in one process. Catches ambient
//                nondeterminism — a `Date.now`, a `Math.random`, an iteration
//                over a `Set` seeded by allocation order.
//   cross-process a real second `node` builds the same level and hashes it.
//                Catches everything the first does PLUS anything that depends
//                on module-load order, on a warmed cache, or on state left
//                behind by a previous test in this file.
//
// The comparison is canonical JSON, exactly as the plan names: `JSON.stringify`
// preserves INSERTION order, so two structurally equal worlds assembled by two
// code paths can stringify differently and the difference would read as a
// change.

import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { canonicalJson } from "@ui/lib/canonical-json.ts";
import { describe, expect, it } from "vitest";

import { createGame, type GameState } from "@game/core";
import { STATIC_FIELDS } from "@game/wire/split.ts";

const repoRoot = fileURLToPath(new URL("../..", import.meta.url));

/** The world a client would rebuild: everything the wire deliberately does not
 * carry, hashed as one string. */
function staticWorld(state: GameState): string {
  const record = state as unknown as Record<string, unknown>;
  const world: Record<string, unknown> = {};
  for (const field of STATIC_FIELDS) world[field] = record[field];
  // The geometry the level lays down beyond the static list: these DO travel
  // (a boss's lockdown drops obstacles, a wave spawner arms), but they are
  // built at creation and a client whose creation disagreed would be wrong
  // from its very first frame, before any delta could correct it.
  world.obstacles = record.obstacles;
  world.spawners = record.spawners;
  world.packs = record.packs;
  world.playerSpawn = record.playerSpawn;
  return canonicalJson(world);
}

describe("same-seed determinism", () => {
  it("builds an identical world twice in one process", () => {
    const a = createGame(1234, "moon", "medium");
    const b = createGame(1234, "moon", "medium");
    expect(staticWorld(b)).toBe(staticWorld(a));
  });

  it("builds a DIFFERENT world from a different seed", () => {
    // The guard on the guard: a comparison that passes because the level is
    // hand-authored and ignores its seed entirely would prove nothing.
    const a = createGame(1, "moon", "medium");
    const b = createGame(2, "moon", "medium");
    expect(staticWorld(b)).not.toBe(staticWorld(a));
  });

  it("builds an identical world in a SECOND PROCESS", () => {
    const mine = staticWorld(createGame(4321, "moon", "nightmare"));
    expect(buildInChildProcess(4321, "moon", "nightmare")).toBe(mine);
  });

  it("agrees across processes on every shipped level", () => {
    // One seed per level rather than a sweep: the point is that no level's own
    // creation path is nondeterministic, and a carve is exercised by
    // `tests/content/generated_maps_test.ts` on its own terms.
    for (const levelId of ["moon", "mars"]) {
      const mine = staticWorld(createGame(7, levelId, "medium"));
      expect(buildInChildProcess(7, levelId, "medium"), levelId).toBe(mine);
    }
  });
});

/**
 * Build the same level in a fresh `node` and hash it the same way.
 *
 * The child registers `scripts/game-alias-loader.mjs` and imports the engine's
 * real entry point — the same arrangement every headless tool in `scripts/`
 * uses — so this is genuinely a second process with its own module graph and
 * its own catalogs, not a second call in this one.
 */
function buildInChildProcess(
  seed: number,
  levelId: string,
  difficulty: string,
): string {
  const source = `
    import { register } from "node:module";
    register("./scripts/game-alias-loader.mjs", "file://${repoRoot}");
    const { createGame } = await import("./src/index.ts");
    const { STATIC_FIELDS } = await import("./server/wire/split.ts");
    const { canonicalJson } = await import("./pwa/src/lib/canonical-json.ts");
    const state = createGame(${seed}, ${JSON.stringify(levelId)}, ${JSON.stringify(difficulty)});
    const world = {};
    for (const field of STATIC_FIELDS) world[field] = state[field];
    world.obstacles = state.obstacles;
    world.spawners = state.spawners;
    world.packs = state.packs;
    world.playerSpawn = state.playerSpawn;
    process.stdout.write(canonicalJson(world));
  `;
  return execFileSync(process.execPath, ["--input-type=module", "-e", source], {
    cwd: repoRoot,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
}
