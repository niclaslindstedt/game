// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The autopilot's QUEST AWARENESS: reading the run's ACTIVE errands as travel
// goals and wanting their tokens as pickups. The bot only ever HELPS with an
// errand somebody already took — taking one is the player's decision, so a
// quest GIVER is never a goal and the bot never accepts, declines or turns in
// anything. ESCORTS are deliberately left alone too: the escort walks at its
// own pace toward its own destination, and a bot that "helps" by marching
// ahead is a bot outrunning the ward — an escort outrun is an escort failed.
//
// Pure reads of the GameState (the quest log, the field, the items) — nothing
// here mutates state or draws from `state.rng`, so botted runs stay
// deterministic. The quest system's own accessors (`activeQuests`,
// `objectiveNeed`, `questSpot`) are the source of every number, so the bot's
// idea of "outstanding" can never drift from the tracker's.

import { distance } from "@game/lib/vec.ts";
import type { Vec2 } from "@game/lib/vec.ts";

import { roughPos } from "./content.ts";
import { questDef } from "../defs/quests.ts";
import { inertEnemy } from "../disposition.ts";
import { activeQuests, objectiveNeed, questSpot } from "../quests/index.ts";
import type { GameState, Item, Player } from "../types/index.ts";

/** A quest-driven macro goal: where to go, and the BOT VIEW label that names
 * why (macro.ts `macroThought` shows it, so the readout stays honest). */
export type QuestGoal = {
  pos: Vec2;
  thought: "FETCH TOKEN" | "ON ERRAND";
};

/**
 * Is this ground item a quest TOKEN the hero can actually BANK — a piece of an
 * ACTIVE errand whose collect tally still has room? Mirrors exactly what the
 * pickup pass credits (`creditQuestPickup`): a token left over from a failed
 * or handed-in quest, or one past its objective's need, is refused by the
 * pickup and stays on the ground — so steering at it would park the hero on
 * an item he can never collect (the full-pockets stall the supply reads
 * guard against everywhere else). Pure.
 */
export function questTokenWanted(state: GameState, item: Item): boolean {
  if (item.kind !== "quest") return false;
  const progress = state.quests[item.questId];
  if (!progress || progress.status !== "active") return false;
  return questDef(progress.id).objectives.some(
    (objective, index) =>
      objective.kind === "collect" &&
      objective.item === item.defId &&
      (progress.counts[index] ?? 0) < objective.count,
  );
}

/**
 * The nearest OUTSTANDING objective destination of the running errands on THIS
 * level, or null with nothing to help with — the quest rung of the macro
 * ladder (between the content sweep and the guidance arrow, see
 * {@link macroTarget}):
 *
 *   • A `collect` wants its TOKENS: every bankable piece of the errand lying
 *     on the field is a destination ("FETCH TOKEN").
 *   • A `kill` (or `killNamed`) wants its BREED: the nearest live matching
 *     enemy, tracked at its rough cell like every other live-foe objective
 *     ("ON ERRAND") — so the leveling window is spent hunting what the errand
 *     pays for rather than whatever wanders closest.
 *   • A `visit` on THIS level wants its spot — through `questSpot`, the same
 *     re-homing the credit poll applies, so the bot walks to the exact ground
 *     that completes it ("ON ERRAND").
 *
 * Escorts, flags, sales and level gates are none of the bot's business (see
 * the module header). Met objectives (`objectiveNeed` vs the tally) drop out,
 * so the goal always names work still owed. Nearest-first with a strict
 * less-than, so ties break on the quest log's own iteration order — a pure
 * function of the state, no rng. Pure.
 */
export function questObjectiveTarget(
  state: GameState,
  hero: Player,
): QuestGoal | null {
  const active = activeQuests(state);
  if (active.length === 0) return null;
  let best: QuestGoal | null = null;
  let bestD = Infinity;
  const consider = (
    pos: Vec2,
    thought: QuestGoal["thought"],
    d: number,
  ): void => {
    if (d < bestD) {
      bestD = d;
      best = { pos: { x: pos.x, y: pos.y }, thought };
    }
  };
  for (const progress of active) {
    const def = questDef(progress.id);
    def.objectives.forEach((objective, index) => {
      if ((progress.counts[index] ?? 0) >= objectiveNeed(objective)) return;
      if (objective.kind === "collect") {
        for (const item of state.items) {
          if (
            item.kind !== "quest" ||
            item.questId !== progress.id ||
            item.defId !== objective.item
          )
            continue;
          consider(item.pos, "FETCH TOKEN", distance(hero.pos, item.pos));
        }
      } else if (objective.kind === "kill" || objective.kind === "killNamed") {
        for (const enemy of state.enemies) {
          if (enemy.defId !== objective.enemy || inertEnemy(enemy)) continue;
          consider(
            roughPos(enemy.pos),
            "ON ERRAND",
            distance(hero.pos, enemy.pos),
          );
        }
      } else if (objective.kind === "visit") {
        if (objective.level !== state.level.id) return;
        const spot = questSpot(state, objective.at);
        consider(spot, "ON ERRAND", distance(hero.pos, spot));
      }
      // escort / flag / sell / reachLevel: deliberately not goals — see header.
    });
  }
  return best;
}
