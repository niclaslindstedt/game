// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The autopilot's QUEST PLAY: taking errands, doing them, and handing them in.
//
// **THE BOT USED TO ONLY HELP, AND THAT WAS THE WRONG HALF.** The rule was that
// taking an errand is the player's decision, so a GIVER was never a goal and
// the bot never accepted anything — it merely finished whatever a human had
// already signed up for. On a hub that reads as caution; everywhere else it
// reads as a bot that walks past the one part of a level with a name on it.
// Errands are a vital part of this game: they are the xp, the coins and the
// chase-tier loot a level pays over its drops, and half of them (`kill`,
// `collect`) are credited by the clearing the bot was going to do anyway — so
// an errand TAKEN on arrival costs nothing and an errand untaken throws the
// whole payout away. The bot now takes them, works them, and walks back.
//
// What it reads, in the order the macro ladder asks:
//
//   • THE PERSON  — {@link errandGiver}: the nearest reachable giver with a `!`
//     (work to take) or a `?` (work to hand in). Committed until their slate
//     clears, ABANDONED if the march makes no headway (a giver a carve walled
//     off must never pin a run), and tapped by {@link giverTapCommand}.
//   • THE WORK    — {@link questObjectiveTarget}: an active errand's outstanding
//     objective — a token to fetch, a breed to hunt, a spot to stand on, and
//     now somebody to WALK SOMEWHERE (see the escort rules below).
//   • THE TOKENS  — {@link questTokenWanted}, which `supplies.ts` reads to put
//     quest loot ahead of the ordinary scatter on the floor.
//
// **AN ESCORT IS A WALK, NOT A HANDS-OFF.** The old header said an escort was
// none of the bot's business because a bot that marches ahead outruns the ward.
// That is true and it is also the whole mechanic: the escort walks at the
// NEAREST HERO (`quests/escort.ts`), a touch slower than he does, and stops
// dead past `escortLeashDistance`. So doing one is exactly two rules — head for
// the destination, and turn back when they fall behind — and with the bot now
// ACCEPTING offers, not having them would mean accepting six escort quests a
// campaign and failing every one of them.
//
// Pure reads of the GameState (the quest log, the field, the items) plus the
// bot's own commitment memory — nothing here mutates state or draws from
// `state.rng`, so botted runs stay deterministic. The quest system's own
// accessors (`activeQuests`, `objectiveNeed`, `questSpot`, `giverMark`) are the
// source of every number, so the bot's idea of "outstanding" can never drift
// from the tracker's.

import { distance } from "@game/lib/vec.ts";
import type { Vec2 } from "@game/lib/vec.ts";

import { roughPos } from "./content.ts";
import { reachableThroughDoors, remainingRoute } from "./nav.ts";
import { THREAT_RADIUS, threatCountWithin } from "./perception.ts";
import type { Bot } from "./state.ts";
import { QUESTS } from "../config/index.ts";
import { questDef } from "../defs/quests.ts";
import { inertEnemy } from "../disposition.ts";
import {
  activeQuests,
  giverMark,
  objectiveNeed,
  questSpot,
} from "../quests/index.ts";
import type { GameState, Item, Player } from "../types/index.ts";

/** A quest-driven macro goal: where to go, and the BOT VIEW label that names
 * why (macro.ts `macroThought` shows it, so the readout stays honest). */
export type QuestGoal = {
  pos: Vec2;
  thought: "FETCH TOKEN" | "ON ERRAND" | "WALK THEM";
};

/** How close the bot walks before it TAPS a giver — comfortably inside
 * {@link QUESTS.tapRadius}, so the press lands on the first tick it arrives
 * rather than on the exact pixel the reach test happens to allow. */
export const GIVER_REACH = QUESTS.tapRadius * 0.6;

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

// ---- THE PERSON ----------------------------------------------------------------

/** How long (sim ms) a march on a giver may go WITHOUT CLOSING before that
 * giver is written off for the level. A giver stands still and never fights
 * back, so no headway means the geometry is refusing — a carve dropped them
 * behind a wall, or a lift nobody has found is the only way in. */
const GIVER_ABANDON_MS = 30_000;
/** The remaining route must shrink by this many px to count as headway, so
 * jitter around a corner doesn't reset the abandon clock. */
const GIVER_PROGRESS_EPS = 40;

/**
 * Once per tick, gauge headway toward the committed giver and WRITE THEM OFF
 * once none is made inside {@link GIVER_ABANDON_MS} — the same shape
 * `trackContentAbandon` uses on a chest, and for the same reason: the errand
 * rung sits high in the ladder, so a destination the hero cannot actually get
 * to would pin the whole run rather than cost a detour.
 *
 * The commitment is also dropped the moment the giver's slate clears (the
 * errand was taken, the finished one handed in), so the next read picks the
 * next person rather than standing there. Called from `decideAct`; mutates only
 * bot memory, so determinism holds.
 */
export function trackErrandAbandon(
  bot: Bot,
  state: GameState,
  hero: Player,
): void {
  const errand = ensureErrand(bot, state);
  if (errand.giverId === null) return;
  // Their slate cleared while he walked — nothing left to commit to.
  if (giverMark(state, errand.giverId) === "none") {
    errand.giverId = null;
    return;
  }
  const giver = state.questGivers.find((g) => g.id === errand.giverId);
  const rc = bot.route;
  if (!giver || !rc) return;
  // Only gauge while the cached route actually leads to this person.
  if (distance(rc.goal, giver.pos) > GIVER_REACH) return;
  // A FIGHT IS NOT A STALL. The march to a person crosses whatever the map has
  // on it, and standing your ground through a pack — which is most of a level
  // — closes no distance at all: gauged flat, the clock ran out on GOODCO's
  // own interns three rooms short of them, every run. The same reason the
  // anti-loiter clock treats a live threat ring as "engaged" (macro.ts): while
  // something is on him the walk is not the thing being measured.
  if (threatCountWithin(state, hero, THREAT_RADIUS) > 0) {
    errand.bestMs = state.stats.timeMs;
    return;
  }
  const rem = remainingRoute(rc, hero.pos);
  if (rem < errand.bestRoute - GIVER_PROGRESS_EPS) {
    errand.bestRoute = rem;
    errand.bestMs = state.stats.timeMs;
    return;
  }
  if (state.stats.timeMs - errand.bestMs > GIVER_ABANDON_MS) {
    errand.skip.push(errand.giverId);
    errand.giverId = null;
  }
}

/**
 * THE PERSON WORTH WALKING TO on this level: the nearest A*-reachable giver
 * with work to hand out (`!`) or work to hand in (`?`), or null when everybody
 * is done with the hero for now.
 *
 * A `progress` mark — an errand of theirs already running — is deliberately NOT
 * a reason to walk over: the "not yet" nag is a conversation with nothing in
 * it, and a bot that kept opening it would stand there reading the same line
 * until the level ran out.
 *
 * COMMITTED once picked, exactly like a content target: a giver is a fixed
 * point and re-picking the nearest every tick would thrash the march between
 * two of them on a map that carries several. Unreachable people are skipped at
 * the pick and stalled ones are written off by {@link trackErrandAbandon}, so
 * neither can pin the ladder.
 */
export function errandGiver(
  bot: Bot,
  state: GameState,
  hero: Player,
): { giverId: string; pos: Vec2 } | null {
  if (state.questGivers.length === 0) return null;
  const errand = ensureErrand(bot, state);
  const skip = errand.skip;
  // The standing commitment, while their slate still has something on it.
  if (errand.giverId !== null) {
    const held = state.questGivers.find((g) => g.id === errand.giverId);
    if (held && giverMark(state, held.id) !== "none") {
      return { giverId: held.id, pos: { x: held.pos.x, y: held.pos.y } };
    }
    errand.giverId = null;
  }
  let best: { giverId: string; pos: Vec2 } | null = null;
  let bestD = Infinity;
  for (const giver of state.questGivers) {
    if (skip.includes(giver.id)) continue;
    const mark = giverMark(state, giver.id);
    if (mark !== "offer" && mark !== "turnIn") continue;
    const d = distance(hero.pos, giver.pos);
    if (d >= bestD) continue;
    if (!reachableThroughDoors(bot, state, hero, giver.pos)) continue;
    bestD = d;
    best = { giverId: giver.id, pos: { x: giver.pos.x, y: giver.pos.y } };
  }
  if (best) {
    errand.giverId = best.giverId;
    errand.bestRoute = Infinity;
    errand.bestMs = state.stats.timeMs;
  }
  return best;
}

/**
 * The bot's errand memory for THIS level, created (or re-armed on a level
 * change) on first touch.
 *
 * Every reader goes through here rather than only the once-a-tick tracker,
 * because the latches on it are load-bearing for the READS: the escort's
 * walk/wait hysteresis lives on this record, and a read that found no record
 * simply had no memory — the walk then re-decided from scratch every call and
 * stuttered on the boundary, which is the exact failure the hysteresis exists
 * to prevent. Mutates only bot memory, so determinism holds.
 */
function ensureErrand(bot: Bot, state: GameState): NonNullable<Bot["errand"]> {
  if (!bot.errand || bot.errand.levelId !== state.level.id) {
    bot.errand = {
      levelId: state.level.id,
      giverId: null,
      bestRoute: Infinity,
      bestMs: state.stats.timeMs,
      skip: [],
      escortHeld: false,
    };
  }
  return bot.errand;
}

/**
 * TAP THE PERSON HE WALKED TO — `talkToQuestGiver`, the ONLY door into a
 * conversation (nothing opens itself: see `quests/index.ts` rule 2), or null
 * when nobody is in reach.
 *
 * `goal` is the macro plan's current destination, and the press is checked
 * against it rather than against whatever is nearest: the tap must be the
 * errand the WALK is on, or a hero who happens to pass a giver on his way to
 * the boss stops to chat in the middle of a flood.
 */
export function giverTapCommand(
  bot: Bot,
  state: GameState,
  hero: Player,
  goal: Vec2,
): { name: "talkToQuestGiver"; args: string[] } | null {
  if (state.phase !== "playing" || hero.screen !== undefined) return null;
  const target = errandGiver(bot, state, hero);
  if (!target) return null;
  if (target.pos.x !== goal.x || target.pos.y !== goal.y) return null;
  return distance(hero.pos, target.pos) <= GIVER_REACH
    ? { name: "talkToQuestGiver", args: [target.giverId] }
    : null;
}

// ---- THE WORK ------------------------------------------------------------------

/** How far the hero may pull ahead of an escort before he turns back for them
 * (a fraction of `QUESTS.escortLeashDistance`, past which the escort stops
 * dead and the errand stops progressing at all). */
const ESCORT_HOLD_FAR = 0.55;
/** …and how close they must be before he sets off again — the hysteresis that
 * keeps a walk from stuttering step-by-step on the boundary. */
const ESCORT_HOLD_NEAR = 0.25;
/** A live body this close to the ward means the fight is ON her (a few times
 * `QUESTS.escortContactRadius`, which is where the blows actually land). */
const ESCORT_DANGER = QUESTS.escortContactRadius * 4;

/**
 * The nearest OUTSTANDING objective destination of the running errands on THIS
 * level, or null with nothing to work on — the quest rung of the macro ladder
 * (above the content sweep, see {@link macroTarget}):
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
 *   • An `escort` wants their DESTINATION — or, once they have fallen behind,
 *     the escort themselves ("WALK THEM"). See the module header: the errand is
 *     "bring them along", and the two rules are head for the door and do not
 *     leave them.
 *
 * Flags, sales and level gates have no destination to walk to — they are
 * settled by playing the run. Met objectives (`objectiveNeed` vs the tally)
 * drop out, so the goal always names work still owed, and every candidate must
 * be A*-REACHABLE: this rung outranks the content sweep now, so a token
 * scattered behind a wall or a spot a carve sealed off would pin the run rather
 * than cost a detour. Nearest-first with a strict less-than, so ties break on
 * the quest log's own iteration order — a pure function of the state, no rng.
 */
export function questObjectiveTarget(
  bot: Bot,
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
    if (d >= bestD) return;
    if (!reachableThroughDoors(bot, state, hero, pos)) return;
    bestD = d;
    best = { pos: { x: pos.x, y: pos.y }, thought };
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
      } else if (objective.kind === "escort") {
        const walk = escortGoal(
          bot,
          state,
          hero,
          progress.id,
          objective.escort,
        );
        // The distance that RANKS an escort is the hero's own to its
        // destination, never to the ward beside him: judged on the turn-back
        // step, an escort a metre away would outrank every other errand on the
        // map every time he waited for them.
        if (walk) consider(walk.pos, "WALK THEM", walk.rank);
      }
      // flag / sell / reachLevel: nothing to walk to — see above.
    });
  }
  return best;
}

/**
 * WHERE A HERO WALKING SOMEBODY GOES THIS TICK: their destination while they
 * are keeping up, or the escort themselves once he has pulled too far ahead.
 *
 * LATCHED with hysteresis (`Bot.errand.escortHeld`) for the reason the party
 * leash is: on a bare distance test the hero crosses the line, turns, closes a
 * step, crosses back and turns again — a walk that advances at a shuffle. He
 * commits to waiting at {@link ESCORT_HOLD_FAR} of the leash and to walking at
 * {@link ESCORT_HOLD_NEAR}, so each leg is a real leg.
 *
 * `rank` is always the distance to the DESTINATION, so which errand is nearest
 * doesn't change under the hero's own feet as he turns back.
 */
function escortGoal(
  bot: Bot,
  state: GameState,
  hero: Player,
  questId: string,
  escortId: string,
): { pos: Vec2; rank: number } | null {
  const escort = state.escorts.find(
    (e) => e.questId === questId && e.defId === escortId,
  );
  if (!escort || escort.arrived) return null;
  const rank = distance(hero.pos, escort.to);
  const gap = distance(hero.pos, escort.pos);
  const leash = QUESTS.escortLeashDistance;
  const errand = ensureErrand(bot, state);
  // THE HORDE IS CHASING HIM, NOT HER (`quests/escort.ts`: nothing retargets —
  // mobs converge on the hero and she walks into that convergence). So with
  // bodies already on her, turning BACK is the one move that certainly kills
  // her: it brings the pack he is dragging straight onto the person he is
  // supposed to be delivering. Measured exactly that way — the ward died at
  // 149 s of a GOODCO walk, every attempt, while the hero stood beside her
  // trading blows. Lead away instead; she follows once the floor beside her is
  // clear, and the leash is generous enough to allow it.
  if (threatsNear(state, escort.pos, ESCORT_DANGER)) {
    errand.escortHeld = false;
    return { pos: { x: escort.to.x, y: escort.to.y }, rank };
  }
  const wait = errand.escortHeld
    ? gap > leash * ESCORT_HOLD_NEAR
    : gap > leash * ESCORT_HOLD_FAR;
  errand.escortHeld = wait;
  return wait
    ? { pos: { x: escort.pos.x, y: escort.pos.y }, rank }
    : { pos: { x: escort.to.x, y: escort.to.y }, rank };
}

/** Is anything alive and hostile standing within `radius` of `at`? The
 * ward's own danger read — point-centred, where `perception.ts`'s rings are
 * all hero-centred. */
function threatsNear(state: GameState, at: Vec2, radius: number): boolean {
  for (const enemy of state.enemies) {
    if (enemy.hp <= 0 || inertEnemy(enemy)) continue;
    if (distance(enemy.pos, at) <= radius) return true;
  }
  return false;
}
