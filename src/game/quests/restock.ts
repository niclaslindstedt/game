// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// RESTOCKING THE HORDE FOR AN ERRAND (config `QUESTS.restock*`).
//
// A carved map's horde is FINITE: `waves` are dropped on a carve, so every
// monster the hero will ever meet is queued in a spawn point that drains
// exactly once (see mapgen/generate.ts and spawners.ts). That is what lets a
// level be cleared — and it is also what makes "kill forty of those" an errand
// the map can run out of. A player who sweeps a wing before walking up to the
// person standing in it can accept a job whose targets he has already killed,
// and the failure is silent: the tracker sits at 0/40 with nothing left alive
// to count.
//
// So an errand TOPS THE FIELD UP as it is taken. Four rules shape it:
//
// - **IT TOPS UP A SHORTFALL, IT DOES NOT STOCK THE MAP.** The field's own
//   supply is counted first — what is alive, and what the spawn points still
//   owe — and only the difference is added. On a map the hero has barely
//   walked into, that difference is zero and nothing happens at all. A mob mix
//   is a difficulty knob (the same reason a scatter of crates is one), so an
//   errand that quietly doubled a wing's population would be re-tuning the
//   venue rather than asking for a job on it.
// - **IT TOPS UP THE HORDE, NEVER A ONE-OFF.** Only a breed the level's own
//   spawn points were BUILT from may be added to. An errand names its carriers
//   without caring where they stand, and half of them stand alone on purpose —
//   a named elite, a cache guardian, a bystander, a rampage-only hellborn.
//   Meeting one of those IS the errand, so minting a second is not a top-up but
//   a rewrite of what the venue is.
// - **IT GOES THROUGH THE SPAWN POINTS, NEVER STRAIGHT ONTO THE FIELD.**
//   Appending to a point's queue buys the whole machine for free: the mobs
//   arrive off-screen and run in, they obey the point's alive cap and its
//   post-kill refill cadence, they are scaled like the rest of that room's
//   horde, and they are counted in the HUD's remaining-foe readout. Spawning
//   forty bodies at the giver's feet buys none of it.
// - **IT IS A SESSION-SAFE MUTATION OF THE RUN, MADE AT ACCEPT.** `acceptQuest`
//   is already a run command every peer replays, so the top-up lands
//   identically on the host and on a joining client — and it draws no
//   `state.rng()`, so it cannot shift the loot stream a seeded run is measured
//   on.

import { distance } from "@game/lib/vec.ts";

import { QUESTS } from "../config/index.ts";
import { runLevelDef } from "../defs/levels/index.ts";
import type { QuestDef } from "../defs/quests.ts";
import { nearestHero } from "../party.ts";
import type { GameState, SpawnerRuntime } from "../types/index.ts";

/**
 * Top this errand's target breeds up to something the field can still supply.
 * Called from `acceptQuest`, once, for the errand just taken.
 *
 * A no-op on a level with no ordinary spawn points (the hub, a hand-authored
 * venue running on `waves`), and a no-op for any breed the field is already
 * good for.
 */
export function restockQuestBreeds(state: GameState, def: QuestDef): void {
  const points = restockablePoints(state);
  if (points.length === 0) return;
  const horde = hordeBreeds(state);
  for (const [breed, need] of neededBreeds(def)) {
    // ONLY WHAT THE KNOTS WERE ALREADY POURING. An errand names its carriers
    // without caring where they stand, and a piece off a named elite, a cache
    // guardian, a bystander or a rampage-only hellborn would otherwise be
    // "restocked" by queueing that mob into the ordinary horde — which is not
    // a top-up but a rewrite of what the venue IS. Those carriers are one-offs
    // on purpose; meeting one is the errand, and an errand that could mint a
    // second is not the errand that was written. The same split the build
    // enforces on `dropChance` (asset-tools/quest-schema.mjs), read here off
    // the level's own spawn-point specs rather than off a blueprint the engine
    // has no business importing.
    if (!horde.has(breed)) continue;
    const short = Math.min(
      QUESTS.restockMax,
      Math.ceil(need * QUESTS.restockHeadroom) - supplyOf(state, breed),
    );
    if (short > 0) topUp(state, points, breed, short);
  }
}

/**
 * The breeds this run's ordinary spawn points were BUILT from — read off the
 * level's own specs rather than off the live queues, which a drained map has
 * already emptied and which are exactly the case this pass exists for.
 *
 * HELLGATE specs are excluded: their roster is the rampage's, map-unique and
 * deliberately not part of the horde a level hands out.
 */
function hordeBreeds(state: GameState): Set<string> {
  const breeds = new Set<string>();
  for (const spec of runLevelDef(state).spawners ?? []) {
    if (spec.hellgate) continue;
    for (const member of spec.members) breeds.add(member.enemy);
  }
  return breeds;
}

/**
 * How many of each breed this errand is going to cost the field, keyed by
 * enemy id and summed across objectives (two objectives after the same breed
 * both have to be payable).
 *
 * A `kill` costs its count outright. A `collect` costs what the drop ladder
 * charges for a piece — `(1 − (1 − p)^pity) / p` kills on average, the pity
 * floor included, because a rate without its floor overstates a long tail the
 * floor cuts off. The cost is charged to EVERY carrier breed rather than split
 * between them: which one the hero actually meets is the map's business, and
 * an errand that is only finishable by finding all three of them is the exact
 * silent failure this exists to prevent.
 *
 * `killNamed` is deliberately absent — there is one of that mob, it is placed
 * rather than queued, and summoning a second is not a top-up but a second
 * boss.
 */
function neededBreeds(def: QuestDef): Map<string, number> {
  const need = new Map<string, number>();
  const add = (breed: string, n: number): void =>
    void need.set(breed, (need.get(breed) ?? 0) + n);
  for (const objective of def.objectives) {
    if (objective.kind === "kill") {
      add(objective.enemy, objective.count);
      continue;
    }
    if (objective.kind !== "collect") continue;
    const item = def.items?.find((i) => i.id === objective.item);
    if (!item?.dropFrom?.length) continue;
    // Pieces laid out on the floor at accept are already found — the horde is
    // only asked for the rest.
    const placed = Math.min(objective.count, item.at?.length ?? 0);
    const wanted = objective.count - placed;
    if (wanted <= 0) continue;
    const kills = Math.ceil(wanted * killsPerPiece(item.dropChance));
    for (const breed of item.dropFrom) add(breed, kills);
  }
  return need;
}

/** Mean kills a single fetch piece costs at `chance`, with the pity floor. */
function killsPerPiece(chance: number | undefined): number {
  const p = chance ?? QUESTS.dropChance;
  if (p >= 1) return 1;
  return (1 - Math.pow(1 - p, QUESTS.dropPity)) / p;
}

/**
 * How many of `breed` the field can still deliver: what is standing on it now,
 * plus everything the ordinary spawn points still owe.
 *
 * HELLGATES are excluded for the reason the foe readout excludes them — their
 * queue re-fills forever while the rampage holds, so counting it would let a
 * single open gate persuade every errand that the map is well stocked.
 */
function supplyOf(state: GameState, breed: string): number {
  let n = 0;
  for (const enemy of state.enemies) if (enemy.defId === breed) n++;
  for (const point of state.spawners) {
    if ((point.openStage ?? 0) > 0) continue;
    for (const queued of point.queue) if (queued === breed) n++;
  }
  return n;
}

/**
 * The ordinary spawn points a top-up may be poured into, best first.
 *
 * Points that have NOT drained come first: appending to one costs nothing but
 * a longer queue, while re-arming a drained point briefly un-drains it — and a
 * point that CHAINS off it (`after`) reads exactly that flag to know it may
 * light, so the successor would stall until the predecessor emptied a second
 * time. Among the drained ones the chained-off are therefore pushed to the
 * back, and the rest sorted by how far they sit from the hero, so a top-up
 * lands on the ground he is about to walk over rather than in the wing behind
 * him.
 */
function restockablePoints(state: GameState): SpawnerRuntime[] {
  const chainedOff = new Set<string>();
  for (const point of state.spawners) {
    if (point.after !== null) chainedOff.add(point.after);
  }
  const hero = nearestHero(state, state.players[0]?.pos ?? { x: 0, y: 0 });
  const rank = (point: SpawnerRuntime): number => {
    if (point.status !== "drained") return 0;
    return point.id !== null && chainedOff.has(point.id) ? 2 : 1;
  };
  return state.spawners
    .filter((point) => (point.openStage ?? 0) === 0)
    .map((point) => ({
      point,
      rank: rank(point),
      dist: hero ? distance(hero.pos, point.at) : 0,
    }))
    .sort((a, b) => a.rank - b.rank || a.dist - b.dist)
    .map((entry) => entry.point);
}

/**
 * Deal `count` of `breed` out across `points`, round-robin from the best one.
 *
 * ROUND-ROBIN RATHER THAN ONE FAT QUEUE, because a point pours only while the
 * hero is inside its trigger radius: piling a whole top-up into the nearest
 * knot makes one room answer for the entire errand, and the player who walks
 * out of it has run out of quest again. Spread thin, the extra bodies are met
 * wherever the hunt actually goes.
 */
function topUp(
  state: GameState,
  points: SpawnerRuntime[],
  breed: string,
  count: number,
): void {
  for (let i = 0; i < count; i++) {
    const point = points[i % points.length] as SpawnerRuntime;
    point.queue.push(breed);
    // The queue's original length is what the HUD's remaining-foe readout
    // spends down; a top-up that skipped it would show the mission getting
    // longer as the hero killed things.
    point.total++;
    if (point.status === "drained") {
      // Back to DORMANT rather than straight to active: a re-armed point still
      // has to be walked into (and seen — `armEligibleSpawners` wants line of
      // sight), so nothing pops behind the hero the instant he says yes.
      point.status = "dormant";
      point.drainedAtMs = null;
      point.lastLive = 0;
    }
  }
  state.events.push({ type: "questRestocked", enemy: breed, count });
}
