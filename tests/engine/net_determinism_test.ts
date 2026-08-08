// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE CLAIM THE STATIC TIER RESTS ON: the same arguments build the same world
// in two processes.
//
// The client never receives the level. It calls `createGame` with the
// `SessionParams` the welcome carried and builds the obstacles, the decor, the
// canopy, the spawner layout and the carved geometry itself — ~100 KB the wire
// does not carry, per level, per client. That is a BIT-FOR-BIT determinism
// claim across the same build, and it must be tested
// rather than believed: if it is false, the failure does not present as
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
// The comparison is canonical JSON, deliberately: `JSON.stringify`
// preserves INSERTION order, so two structurally equal worlds assembled by two
// code paths can stringify differently and the difference would read as a
// change.
//
// **AND IT IS CHECKED ON A RUN, NOT ONLY ON A LEVEL — which is the check that
// was missing.** `createGame` was always deterministic; a RUN was not the same
// thing as a `createGame`, because the app performed several more mutations
// before the first tick (the campaign chain, the purse, the thoughts already
// read, an opening already watched, a bot run's dialogue mute). A suite that
// only ever compared bare levels would have gone on passing while a session and
// its client disagreed about every one of them. So the parameters below are a
// REAL run's, and the assertion is that the run — not the terrain — is the same
// on both sides. See `engine/game/session-setup.ts`.

import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { canonicalJson } from "@ui/lib/canonical-json.ts";
import { describe, expect, it } from "vitest";

import { createGame, createRunFromParams, type GameState } from "@game/core";
import { STATIC_FIELDS } from "@game/wire/split.ts";
import type { SessionParams } from "@game/wire/protocol.ts";

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

/**
 * A run with every parameter set to something OTHER than its default.
 *
 * That is the whole point: a parameter left at its default cannot fail this
 * test, so a field that one side applies and the other does not would sail
 * through a fixture built from the plain arguments. Written as a
 * `SessionParams` and passed straight to `createRunFromParams` — the two shapes
 * are meant to be the same shape, and this is where that stops being a claim.
 */
const RUN: SessionParams = {
  seed: 20260801,
  levelId: "moon",
  difficulty: "hard",
  loadout: null,
  respec: false,
  clearedLevels: ["goodco_hq"],
  merchantDiscovered: true,
  campaignQuests: null,
  coins: 4242,
  seenThoughts: ["moon_arrival"],
  openingSkip: "story",
  muteDialogue: true,
};

/** Everything a run holds that both sides must agree on, hashed as one string.
 * Wider than `staticWorld` on purpose: this is the check that a PARAMETER
 * landed, and the parameters mostly land on the hero and the run's flags. */
function runWorld(state: GameState): string {
  const record = state as unknown as Record<string, unknown>;
  return canonicalJson({
    world: staticWorld(state),
    phase: record.phase,
    dialogueMuted: record.dialogueMuted,
    thoughtsSeen: record.thoughtsSeen,
    quests: record.quests,
    player: (record.players as unknown[])[0],
  });
}

describe("a run built from its parameters", () => {
  it("is the same run twice", () => {
    expect(runWorld(createRunFromParams(RUN))).toBe(
      runWorld(createRunFromParams(RUN)),
    );
  });

  it("applies every parameter it was given", () => {
    // The guard on the guard, and the one that would have caught the original
    // bug: a builder that quietly ignored a field would still be deterministic.
    const state = createRunFromParams(RUN);
    expect(state.players[0].coins).toBe(4242);
    expect(state.thoughtsSeen).toContain("moon_arrival");
    expect(state.dialogueMuted).toBe(true);
    // `story` skips the prelude, the monologue and the opening strike, and
    // leaves the hero armed rather than disarmed for a beat he has read before
    // — landing on the level-name card, which shows even on a replay.
    expect(state.phase).toBe("title");
    expect(state.players[0].disarmed).toBe(false);
  });

  it("skips exactly as much of the opening as it was told to", () => {
    // The three states are three different landings, and conflating them is
    // how a developer warp-in ends up sitting on a title card nobody asked
    // for. `none` leaves the run on its prelude; `story` lands on the
    // level-name card; `all` drops straight into play.
    const none = createRunFromParams({ ...RUN, openingSkip: "none" });
    expect(none.phase).toBe("cutscene");
    const all = createRunFromParams({ ...RUN, openingSkip: "all" });
    expect(all.phase).toBe("playing");
    // An unknown name is read as `none` rather than trusted: this parameter
    // arrives from a wire, where it is a claim rather than a fact.
    const junk = createRunFromParams({ ...RUN, openingSkip: "everything" });
    expect(junk.phase).toBe("cutscene");
  });

  it("is NOT the same run as one built from the bare arguments", () => {
    // The assertion that gives this file its point. `createGame` with the same
    // seed, level and difficulty is what the client used to build, and it is a
    // DIFFERENT run — an unmuted hero with an empty purse sitting on his
    // prelude. Every one of those differences used to be a "correction" on the
    // first delta.
    const bare = createGame(RUN.seed, RUN.levelId, "hard");
    expect(runWorld(createRunFromParams(RUN))).not.toBe(runWorld(bare));
  });

  it("builds the same run in a SECOND PROCESS", () => {
    expect(buildRunInChildProcess(RUN)).toBe(
      runWorld(createRunFromParams(RUN)),
    );
  });
});

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
/**
 * Build the same RUN in a fresh `node` and hash it the same way.
 *
 * The parameters are serialized rather than re-typed, so the child cannot
 * silently disagree about them — which is the failure this whole file exists
 * to catch, one level up.
 */
function buildRunInChildProcess(params: SessionParams): string {
  const source = `
    import { register } from "node:module";
    register("./scripts/game-alias-loader.mjs", "file://${repoRoot}");
    const { createRunFromParams } = await import("./engine/index.ts");
    const { STATIC_FIELDS } = await import("./server/wire/split.ts");
    const { canonicalJson } = await import("./pwa/src/lib/canonical-json.ts");
    const state = createRunFromParams(${JSON.stringify(params)});
    const world = {};
    for (const field of STATIC_FIELDS) world[field] = state[field];
    world.obstacles = state.obstacles;
    world.spawners = state.spawners;
    world.packs = state.packs;
    world.playerSpawn = state.playerSpawn;
    process.stdout.write(canonicalJson({
      world: canonicalJson(world),
      phase: state.phase,
      dialogueMuted: state.dialogueMuted,
      thoughtsSeen: state.thoughtsSeen,
      quests: state.quests,
      player: state.players[0],
    }));
  `;
  return execFileSync(process.execPath, ["--input-type=module", "-e", source], {
    cwd: repoRoot,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
}

function buildInChildProcess(
  seed: number,
  levelId: string,
  difficulty: string,
): string {
  const source = `
    import { register } from "node:module";
    register("./scripts/game-alias-loader.mjs", "file://${repoRoot}");
    const { createGame } = await import("./engine/index.ts");
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
