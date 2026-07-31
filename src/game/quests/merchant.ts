// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// AN ERRAND THAT RUNS THROUGH THE TRADER — the quest side of the stall
// (`QuestDef.merchant`).
//
// WHY THIS EXISTS AT ALL. A fetch quest that says "buy this from the merchant"
// is a fetch quest with a coin cost: the row is on the counter from the first
// second, the player pays, the errand ticks. What makes a trade interesting is
// that the stock CHANGES — you hand over a thing you took off a body, and what
// he puts out afterwards is the thing you actually came for, because he now
// knows you have seen one. That is three steps in an order that cannot be
// short-circuited, and it turns the stall from a vending machine into somebody
// with an opinion about what the hero is carrying.
//
// TWO DESIGN RULES HOLD IT UP.
//
// 1. **THE DEAL IS ON THE QUEST, NEVER ON THE MERCHANT.** His stall is rolled
//    fresh per run against the hero it meets; a permanent row for an errand
//    nobody has taken would be an unexplained item in every shop in the game,
//    forever, on every map. The rows below are derived from the RUNNING
//    errands each time the counter is opened, so they exist exactly while
//    somebody is doing the errand that put them there.
// 2. **A QUEST PIECE BOUGHT IS A QUEST PIECE FOUND.** Buying credits the same
//    `collect` tally a piece prised off a corpse credits, through the same
//    `creditQuestPickup`. Nothing downstream — the tracker, the turn-in, the
//    log — can tell the two apart, which is what keeps the beat from needing a
//    parallel bookkeeping path nobody would remember to update.

import { QUESTS } from "../config/index.ts";
import { questDef } from "../defs/quests.ts";
import { setQuestFlag } from "../conversation.ts";
import type { GameState, QuestStallRow } from "../types/index.ts";
import {
  activeQuests,
  creditQuestPickup,
  creditQuestSale,
  objectiveNeed,
} from "./index.ts";

/**
 * THE ERRAND ROWS ON THE COUNTER RIGHT NOW — derived, never stored, for the
 * same reason a giver's head mark is (see quests/index.ts rule 1): a stored
 * row goes stale the instant a flag three rooms away unlocks or spends it.
 *
 * A SELL row appears while the hero holds a piece the trader buys. A BUY row
 * appears once its flags are set and while the `collect` objective it feeds is
 * still short — so a piece already in hand is not offered a second time, which
 * would let a player spend a fortune on duplicates of a thing they have.
 */
export function questStallRows(state: GameState): QuestStallRow[] {
  const rows: QuestStallRow[] = [];
  for (const progress of activeQuests(state)) {
    const def = questDef(progress.id);
    const deal = def.merchant;
    if (!deal) continue;

    const buys = deal.buys;
    if (buys && heldPieces(state, progress.id, buys.item) > 0) {
      rows.push({
        kind: "sell",
        questId: def.id,
        item: buys.item,
        name: pieceName(def.id, buys.item),
        coins: buys.coins,
      });
    }

    for (const sale of deal.sells ?? []) {
      if (!(sale.requires ?? []).every((f) => state.questFlags[f] === true)) {
        continue;
      }
      if (!wantsMore(state, progress.id, sale.item)) continue;
      rows.push({
        kind: "buy",
        questId: def.id,
        item: sale.item,
        name: pieceName(def.id, sale.item),
        coins: sale.price,
        pitch: sale.pitch,
      });
    }
  }
  return rows;
}

/**
 * SELL A PIECE ACROSS THE COUNTER. The tally goes down by one, the purse goes
 * up, and whatever flags the sale carries are set — which is the whole reason
 * the beat exists, since the row he puts out next is gated on one of them.
 *
 * The piece genuinely LEAVES. A sale that quietly kept the tally would make
 * the hero's choice free, and the errand is meant to cost him the thing.
 * Returns false when the piece is not in hand or no such deal is running, so a
 * stale tap on a row that just vanished is ignored.
 */
export function sellQuestPiece(
  state: GameState,
  questId: string,
  item: string,
): boolean {
  const progress = state.quests[questId];
  if (!progress || progress.status !== "active") return false;
  const def = questDef(questId);
  const buys = def.merchant?.buys;
  if (!buys || buys.item !== item) return false;

  const index = collectIndex(state, questId, item);
  if (index < 0 || (progress.counts[index] ?? 0) <= 0) return false;
  progress.counts[index] = (progress.counts[index] ?? 0) - 1;

  state.players[0].coins += buys.coins;
  for (const flag of buys.sets ?? []) setQuestFlag(state, flag);
  state.events.push({
    type: "questPieceSold",
    questId,
    item,
    coins: buys.coins,
  });
  // The SALE is the objective on an errand that asked for one — booked here,
  // where it happens, exactly as a kill is booked in `killEnemy`.
  creditQuestSale(state, questId, item);
  return true;
}

/**
 * BUY A PIECE OFF THE COUNTER. Credited through `creditQuestPickup`, so the
 * bought piece is indistinguishable from a found one everywhere downstream.
 * Returns false when the row is not live or the purse is short — the caller
 * draws CAN'T AFFORD rather than this throwing.
 */
export function buyQuestPiece(
  state: GameState,
  questId: string,
  item: string,
): boolean {
  const row = questStallRows(state).find(
    (r) => r.kind === "buy" && r.questId === questId && r.item === item,
  );
  if (!row || state.players[0].coins < row.coins) return false;
  state.players[0].coins -= row.coins;
  creditQuestPickup(state, questId, item);
  state.events.push({
    type: "questPieceBought",
    questId,
    item,
    coins: row.coins,
  });
  return true;
}

/** Can the hero afford this row? (The stall greys what he cannot.) */
export function canAffordStallRow(
  state: GameState,
  row: QuestStallRow,
): boolean {
  return row.kind === "sell" || state.players[0].coins >= row.coins;
}

// ------------------------------------------------------------------ the reads

/** Which objective index collects `item` on this quest, or -1. */
function collectIndex(state: GameState, questId: string, item: string): number {
  const objectives = questDef(questId).objectives;
  return objectives.findIndex((o) => o.kind === "collect" && o.item === item);
}

/** How many of `item` the hero is holding for this errand. */
function heldPieces(state: GameState, questId: string, item: string): number {
  const index = collectIndex(state, questId, item);
  if (index < 0) return 0;
  return state.quests[questId]?.counts[index] ?? 0;
}

/** Is this errand's `collect` for `item` still short? */
function wantsMore(state: GameState, questId: string, item: string): boolean {
  const objectives = questDef(questId).objectives;
  const index = collectIndex(state, questId, item);
  if (index < 0) return false;
  const objective = objectives[index];
  if (!objective) return false;
  const held = state.quests[questId]?.counts[index] ?? 0;
  return held < objectiveNeed(objective);
}

/** What the counter calls a piece — the quest's own name for it. */
function pieceName(questId: string, item: string): string {
  return (
    questDef(questId).items?.find((i) => i.id === item)?.name ??
    item.toUpperCase()
  );
}

/** The stall's own ward radius, re-exported so the app's tap test and the
 * engine's row derivation cannot drift about how near "at the counter" is. */
export const STALL_TALK_RADIUS = QUESTS.tapRadius;
