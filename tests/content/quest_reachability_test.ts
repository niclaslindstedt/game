// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// CAN THE SHIPPED ERRANDS ACTUALLY BE FINISHED — ON EVERY RUNG THEY ARE
// OFFERED ON?
//
// `quests_test.ts` already checks that every breed an errand names is one its
// map spawns AT ALL. What it cannot see is the DIFFICULTY GATE, because it
// reads the blueprint with a key-walk that has no rung in its hand: a
// `minDifficulty` line is just another field on the way past. So an errand
// could name a carrier that exists only on JESUS, pass every check in the
// build and in that suite, and be flatly impossible on the four rungs below —
// with nothing on screen to say why. That is not hypothetical: THE SCALE
// (`ruth_scale`) asked for a piece off THE SCALED ANCESTOR, who is a
// rampage-only hellborn behind gates the carve tags `minDifficulty: nightmare`
// and whose own member line adds `minDifficulty: jesus`. RUTH offers the
// errand on every rung — five per-rung caches hang off it, and it pays the
// only chest in the game — so EASY, MEDIUM, HARD and NIGHTMARE heroes were
// each handed a job with no carrier alive anywhere in the campaign, and with
// it the hero's only place to KEEP anything.
//
// The check asks the REAL CARVE rather than restating the gating rules: it
// resolves each mission the way a run does (`resolveLevelDef`) and walks what
// the carve actually put on the field, dropping any subtree whose
// `minDifficulty` the rung fails (`meetsMinDifficulty`) — so a new gate, or a
// gate moved from the point onto a member line, is followed for free.
//
// AN ESCORT ERRAND HAS A SECOND WAY TO BE IMPOSSIBLE, and it is the same shape:
// its destination is an authored coordinate, and every mission is CARVED FRESH
// per run, so the spot can land inside a wall, in a pocket nothing joins up, in
// the sealed annex the lift rides to, or out on the dead rock past the carve.
// Nothing throws. The marker draws, the person follows, and the errand can
// simply never be handed in. `escortSpots` re-homes both ends onto ground the
// party can walk to; the walk below is what proves it on the shipped errands,
// on real carves, rather than on the rule.
//
// A sequel deletes this file with the campaign it guards; the engine's own
// rules are pinned on synthetic content in tests/engine/.

import { describe, expect, it } from "vitest";

import {
  CONVERSATION_DEFS,
  DIFFICULTY_ORDER,
  LEVELS,
  QUEST_DEFS,
  QUESTS as QUEST_TUNING,
  buildNavGrid,
  createGame,
  findPath,
  meetsMinDifficulty,
  resolveLevelDef,
  type Difficulty,
  type QuestDef,
} from "@game/core";
// Engine-internal: the one call `acceptQuest` makes to put a walker on the
// field, asked here without walking a hero to a giver first.
import { spawnEscort } from "../../engine/game/quests/escort.ts";

const QUESTS = Object.values(QUEST_DEFS);

/** Seeds to carve each mission on. A carve is difficulty-blind — the rung is
 * applied when the field is populated, not when it is cut — so a handful of
 * seeds is only here to cover the set pieces a small carve can drop. */
const SEEDS = [1, 2, 3, 5, 8];

describe("every errand is finishable on every rung it is offered on", () => {
  it("names a carrier the difficulty can actually put on the field", () => {
    const broken: string[] = [];
    for (const quest of QUESTS) {
      for (const difficulty of offeredOn(quest)) {
        const breeds = reachableBreeds(quest, difficulty);
        for (const [index, objective] of quest.objectives.entries()) {
          const where = `${quest.id} [${difficulty}] objective ${index}`;
          if (objective.kind === "kill" || objective.kind === "killNamed") {
            if (!breeds.has(objective.enemy)) {
              broken.push(`${where}: nothing spawns "${objective.enemy}"`);
            }
            continue;
          }
          if (objective.kind !== "collect") continue;
          const item = quest.items?.find((i) => i.id === objective.item);
          // A piece with no `items:` entry at all is the build's error, not
          // this one's — and the schema already refuses it.
          if (!item) continue;
          // A CORPSE IS ONLY ONE OF THE FOUR WAYS A PIECE ARRIVES. It can also
          // be lying on the floor from the moment the errand is accepted, be
          // bought over the merchant's counter, or be handed over by somebody
          // in a conversation — and none of those three needs a breed at all.
          if ((item.at?.length ?? 0) >= objective.count) continue;
          if (soldByMerchant(quest, item.id)) continue;
          if (handedOver(quest.id, item.id)) continue;
          const carriers = (item.dropFrom ?? []).filter((b) => breeds.has(b));
          if (carriers.length === 0) {
            broken.push(
              `${where}: "${objective.item}" has no carrier — ` +
                `${(item.dropFrom ?? []).join(", ") || "nothing"} ` +
                `${difficulty === "jesus" ? "spawns" : "spawns on this rung"}`,
            );
          }
        }
      }
    }
    expect(broken.join("\n")).toBe("");
  });

  it("offers THE SCALE's chest on all five rungs, and can pay for it", () => {
    // The regression this file was written for, stated as the thing a player
    // would notice: RUTH's cache is the only storage in the game and it is
    // paid by ONE errand, so an errand nobody below JESUS can finish is four
    // rungs of hero with nowhere to put anything.
    const scale = QUEST_DEFS["ruth_scale"];
    expect(
      scale,
      "ruth_scale is gone — move this guard to its successor",
    ).toBeDefined();
    expect(scale!.reward?.cache, "ruth_scale stopped paying the cache").toBe(
      true,
    );
    expect(offeredOn(scale!)).toEqual(DIFFICULTY_ORDER);
    for (const difficulty of DIFFICULTY_ORDER) {
      const breeds = reachableBreeds(scale!, difficulty);
      const carriers = (scale!.items ?? []).flatMap((item) =>
        (item.dropFrom ?? []).filter((b) => breeds.has(b)),
      );
      expect(carriers, `no scale carrier on ${difficulty}`).not.toEqual([]);
    }
  });

  it("walks every escort to a destination the hero can actually reach", () => {
    // Asked at the START of a run — the fewest doors open, the smallest
    // reachable region — because an errand that survives that survives being
    // taken anywhere later. The check is the engine's OWN router, so a pass
    // here is a pass in play.
    const broken: string[] = [];
    for (const quest of QUESTS) {
      for (const objective of quest.objectives) {
        if (objective.kind !== "escort") continue;
        for (const seed of SEEDS) {
          const state = createGame(seed, quest.level);
          const hero = state.players[0]!;
          const escort = spawnEscort(
            state,
            quest.id,
            objective.escort,
            objective.to,
            hero.pos,
          );
          const where = `${quest.id}/${objective.escort} seed ${seed}`;
          if (!escort) {
            broken.push(`${where}: no body went on the field`);
            continue;
          }
          const grid = buildNavGrid(state);
          if (!findPath(grid, hero.pos, escort.to)) {
            broken.push(`${where}: nothing can walk to the destination`);
          }
          if (!findPath(grid, hero.pos, escort.pos)) {
            broken.push(`${where}: the walker is sealed off from the hero`);
          }
          // …AND IT IS STILL A WALK. Both ends re-home independently, so an
          // errand that pays out on the tick it is taken is the other way this
          // can go wrong — the payout with none of the job.
          const walk = Math.hypot(
            escort.to.x - escort.pos.x,
            escort.to.y - escort.pos.y,
          );
          if (walk <= QUEST_TUNING.escortArriveRadius) {
            broken.push(
              `${where}: delivered on arrival — ${walk.toFixed(0)}px`,
            );
          }
        }
      }
    }
    expect(broken.join("\n")).toBe("");
  }, 120_000);
});

/** Does this errand's own stall put the piece on the counter? The `requires:`
 * flags are not read: whether the hero can SATISFY them is the chain's
 * business, and every flag in the shipped chains is set by a branch or a sale
 * that has no rung of its own. */
function soldByMerchant(quest: QuestDef, itemId: string): boolean {
  return (quest.merchant?.sells ?? []).some((row) => row.item === itemId);
}

/** Does anybody hand it over in a conversation (`ConversationChoice.gives`)? */
function handedOver(questId: string, itemId: string): boolean {
  for (const conversation of Object.values(CONVERSATION_DEFS)) {
    for (const node of conversation.nodes) {
      for (const choice of node.choices ?? []) {
        if (choice.gives?.quest === questId && choice.gives.item === itemId) {
          return true;
        }
      }
    }
  }
  return false;
}

/** The rungs this errand can be handed out on (`QuestDef.minDifficulty`). */
function offeredOn(quest: QuestDef): Difficulty[] {
  return DIFFICULTY_ORDER.filter((d) =>
    meetsMinDifficulty(d, quest.minDifficulty as Difficulty | undefined),
  );
}

/**
 * Every breed this errand's objectives could be paid by at `difficulty`.
 *
 * A RUN errand is answered by its own venue and nothing else: the log dies
 * with the level, so a carrier two maps away is a carrier the hero is never
 * standing next to while the job is live. A CAMPAIGN errand is carried
 * wherever the trail goes, so the whole campaign answers it — which is exactly
 * the latitude that let THE SCALE point at a mob no rung but the last had.
 */
function reachableBreeds(quest: QuestDef, difficulty: Difficulty): Set<string> {
  const hub = LEVELS[quest.level]?.objective.type === "hub";
  const levels = quest.campaign || hub ? Object.keys(LEVELS) : [quest.level];
  const all = new Set<string>();
  for (const levelId of levels) {
    for (const breed of breedsOn(levelId, difficulty)) all.add(breed);
  }
  return all;
}

/** Carves, memoized by level — one per seed, reused across the rungs. */
const carves = new Map<string, ReturnType<typeof resolveLevelDef>[]>();
function carvesOf(levelId: string): ReturnType<typeof resolveLevelDef>[] {
  let cut = carves.get(levelId);
  if (!cut) {
    cut = SEEDS.map((seed) => resolveLevelDef(levelId, seed));
    carves.set(levelId, cut);
  }
  return cut;
}

/**
 * THE FIELDS OF A `LevelDef` THAT PUT A BODY ON THE FIELD — an ALLOW-list, and
 * that direction is the point. A `LevelDef` mentions an enemy id in plenty of
 * places that spawn nothing: `firstSightThoughts` and `firstKillThoughts` name
 * the breed whose first sighting or first kill plays a thought, and THE RIFT
 * has a thought keyed on `scaled_ancestor` — so a walk over the whole def
 * happily "finds" the very mob the rung cannot spawn, and this guard reports
 * everything green over exactly the bug it exists to catch. (It did, first
 * try.) A source left off this list fails a working errand, which is loud and
 * gets fixed; a reaction field creeping onto it would be silent forever.
 */
const SPAWN_SOURCES = [
  "spawns",
  "spawners",
  // The parts maps' one-mob POSTS — each names the `enemy` standing it, and
  // its respawns are always the same breed, so a post IS a spawner here.
  "mobSpawns",
  "waves",
  "packs",
  "lairs",
  "arrivals",
  "openingStrike",
] as const;

/**
 * Every enemy id a run of `levelId` on `difficulty` can put on the field.
 *
 * Read off the CARVE rather than off the blueprint, so the gates are the ones
 * the run really applies — the hellgates' own `minDifficulty` is stamped by
 * the generator (mapgen/generate.ts) and never appears in the authored YAML at
 * all, which is half of why the gap this guards was invisible.
 *
 * DELIBERATELY GENEROUS inside those sources: the rare/unique encounters are
 * rolled rather than guaranteed and are counted anyway, because the question
 * here is "can this appear at all on this rung", and a false NEGATIVE would
 * fail an errand that works.
 */
function breedsOn(levelId: string, difficulty: Difficulty): Set<string> {
  const ids = new Set<string>();
  const walk = (node: unknown): void => {
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node)) {
      node.forEach(walk);
      return;
    }
    const record = node as Record<string, unknown>;
    // A GATE FAILED HERE TAKES THE WHOLE SUBTREE WITH IT — a hellgate's
    // members hang off the point that is shut, and a member line carries a
    // floor of its own on top of it.
    const min = record["minDifficulty"];
    if (
      typeof min === "string" &&
      !meetsMinDifficulty(difficulty, min as Difficulty)
    ) {
      return;
    }
    for (const [key, value] of Object.entries(record)) {
      if (key === "enemy" && typeof value === "string") ids.add(value);
      else walk(value);
    }
  };
  for (const carve of carvesOf(levelId)) {
    const def = carve as unknown as Record<string, unknown>;
    for (const source of SPAWN_SOURCES) walk(def[source]);
    // The rolled encounters are plain id lists with no `enemy` key on them.
    for (const kind of ["rare", "unique"] as const) {
      for (const id of carve.rareSpawns?.[kind] ?? []) ids.add(id);
    }
  }
  return ids;
}
