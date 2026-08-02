// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// HOW A BOT PLAYS AS A MEMBER OF A PARTY: the leash (don't leave the party),
// the convoy (travel far as a group), personal spacing (don't stand in a
// teammate), the split-the-packs target preference (don't queue on a foe a
// nearer teammate is already fighting), and covering a teammate who is down or
// bleeding out. Every rule here is a STRICT NO-OP in single player — one hero
// has no party to space off, defer to, or cover — which is what keeps every
// solo measurement byte-identical. Like every bot module, this is a PURE
// consumer of the GameState: it never mutates it and never draws from
// `state.rng`; the only mutations are the bot's own latches.
//
// **AND THE LEASH'S ORIGIN WAS MEASURED, NOT ASSUMED.** Flying a party of two on the moon,
// seat 0 spent 43% of the run in the anti-wedge UNSTICK sweep and finished with
// 2 kills where the same seed solo finished with 128. The mechanism is a
// spiral, and every step of it is a rule working exactly as designed: the horde
// chases the NEAREST VISIBLE hero (`aggro.ts`), so once the two drift apart the
// pack commits to one of them; the other is left standing on cleared ground with
// nothing in reach; `hasReachableFoe` goes false, which is precisely the
// condition the stall detector reads as WEDGED; the escape sweep sprints, the
// sprint empties the pool, the dig-in stands him still — and standing still with
// nothing to fight is the stall condition again. Nothing there is broken. The
// bot simply has no notion that the fight went somewhere with somebody else.
//
// **THE LEASH HAS A NUMBER AND IT IS NOT INVENTED — `XP_SHARE.radius`.** That
// is the distance past which a hero stops sharing in a kill, so a bot beyond it
// is not merely out of position, it is COSTING the player XP. Deriving the
// leash from the payout rule rather than typing a distance is what keeps the two
// in step: move the share radius and the leash follows, because they are the
// same fact about how far apart a party may be and still be one.
//
// It is a strict NO-OP in single player — one hero has no party to be away
// from, so `partyLeash` answers null before it looks at anything — which is what
// keeps every existing measurement byte-identical.

import { clamp, distance } from "@game/lib/vec.ts";
import type { Vec2 } from "@game/lib/vec.ts";

import { PLAYER, XP_SHARE } from "../config/index.ts";
import { heroInPlay } from "../party.ts";
import { THREAT_RADIUS } from "./perception.ts";
import type { Bot } from "./state.ts";
import type { BotTuning } from "./tuning.ts";
import type { Enemy, GameInput, GameState, Player } from "../types/index.ts";

/**
 * How far out of the share ring the hero may drift before the leash pulls.
 *
 * Under 1 on purpose: a bot that only turns back once it has ALREADY stopped
 * sharing has already missed the kills it walked away from, and the walk home
 * costs it the next few as well. Pulling at nine tenths keeps him inside the
 * ring while he is still travelling toward it.
 */
const LEASH_OUT = 0.9;
/**
 * How far in he has to get before the leash lets go.
 *
 * The hysteresis is the whole design. Released AT the pull distance, a hero
 * would re-take his own errand the instant he crossed back, walk out again, and
 * spend the run oscillating on the boundary — the same flap the turn-rate limit
 * and the recovery-walk latch exist to stop. Half the ring is comfortably inside
 * the fight rather than merely inside the rule.
 */
const LEASH_IN = 0.5;

/**
 * A macro goal further than this many share-radii away is a LONG MARCH — the
 * boss door, a far landmark, a cache across the map — and nobody walks through
 * the boss door alone: while one is on, the leash TIGHTENS (see
 * {@link CONVOY_TIGHTEN}) so the party arrives together instead of strung out
 * along the route. Two radii, because inside that the goal is basically the
 * fight the party is already converging on and the ordinary ring suffices.
 */
const CONVOY_FAR = 2;
/**
 * The long march ends (the convoy latch releases) once the goal is inside this
 * many share-radii. Below {@link CONVOY_FAR} on purpose — the same hysteresis
 * the leash itself uses: released AT the trigger distance, a goal hovering on
 * the two-radius line would flip the ring size every re-pick.
 */
const CONVOY_NEAR = 1.5;
/**
 * How much the share ring shrinks to while travelling far: the leash pulls at
 * HALF the share radius, so a group on a long march stays one screen rather
 * than one share-ring apart. Still derived from `XP_SHARE.radius` — the ring
 * is the party's own unit of "together", travel just demands more of it.
 */
const CONVOY_TIGHTEN = 0.5;

/**
 * Is this bot on a LONG MARCH — its own macro goal beyond {@link CONVOY_FAR}
 * share-radii — latched with hysteresis on `bot.convoying` so a goal hovering
 * on the line doesn't flap the leash ring? Fed by {@link partyLeash}; `goal`
 * is the bot's OWN travel plan (what it would do without the leash), null when
 * the caller has none to offer (then the held latch answers).
 */
function convoyTravel(bot: Bot, hero: Player, goal: Vec2 | null): boolean {
  if (goal) {
    const d = distance(hero.pos, goal);
    if (bot.convoying) {
      if (d <= XP_SHARE.radius * CONVOY_NEAR) bot.convoying = false;
    } else if (d >= XP_SHARE.radius * CONVOY_FAR) {
      bot.convoying = true;
    }
  }
  return bot.convoying === true;
}

/**
 * WHERE THIS HERO SHOULD BE STANDING INSTEAD, or null when he is with his party.
 *
 * Measured to the NEAREST hero in play rather than to the party centroid, and
 * that is the one judgement call in the file: the centroid of a party spread
 * across a hall is a spot on the floor where nobody is standing and nothing is
 * happening, so a bot sent there arrives alone. The nearest teammate is somebody
 * to actually stand beside — and, transitively, it is what pulls a strung-out
 * party back into one group rather than into one point.
 *
 * A DEPARTED or downed hero is not a destination (`heroInPlay`): walking to a
 * body nobody is behind is exactly the ghost-following the predicate exists to
 * stop — a DOWNED teammate is {@link allyCoverTarget}'s business, a body to
 * stand OVER rather than somebody to stand BESIDE.
 *
 * `ownGoal` is the bot's OWN travel plan (the goal it would march on without
 * the leash): a goal beyond {@link CONVOY_FAR} share-radii is a LONG MARCH,
 * and while one is on the ring tightens ({@link CONVOY_TIGHTEN}) so the group
 * travels — and arrives — together.
 */
export function partyLeash(
  bot: Bot,
  state: GameState,
  hero: Player,
  ownGoal: Vec2 | null = null,
): Vec2 | null {
  if (state.players.length < 2) return null;
  let nearest: Player | null = null;
  let nearestD = Infinity;
  for (const other of state.players) {
    if (other === hero || !heroInPlay(other)) continue;
    const d = distance(hero.pos, other.pos);
    if (d < nearestD) {
      nearestD = d;
      nearest = other;
    }
  }
  // Alone on the map — every other seat is empty, dead or departed. There is no
  // party to rejoin, so the soloist's own reads own the run again.
  if (!nearest) {
    bot.regrouping = false;
    bot.convoying = false;
    return null;
  }
  const ring =
    XP_SHARE.radius * (convoyTravel(bot, hero, ownGoal) ? CONVOY_TIGHTEN : 1);
  const out = ring * LEASH_OUT;
  const back = ring * LEASH_IN;
  if (bot.regrouping) {
    if (nearestD <= back) {
      bot.regrouping = false;
      return null;
    }
  } else if (nearestD < out) {
    return null;
  } else {
    bot.regrouping = true;
  }
  return { x: nearest.pos.x, y: nearest.pos.y };
}

/**
 * The PERSONAL ENVELOPE (world px): teammates nearer than this are standing in
 * each other, and in a game about being surrounded a party stacked on one
 * point dies as one body. Derived from the hero's own collision radius
 * (`PLAYER.radius` — the engine's one fact about how much floor a hero is):
 * two bodies (2·radius each) plus a body-width of air between them.
 */
const SPACING_RADIUS = PLAYER.radius * 4;

/**
 * PERSONAL SPACING — keep two heroes from converging onto the same pixel. A
 * STEERING ADJUSTMENT, not a branch: whatever the strategy decided, the
 * decided target is nudged away from the nearest teammate while the hero
 * stands inside the personal envelope, growing from nothing at the rim to a
 * full envelope's push at contact — so melee still closes on its own target
 * and ranged still holds its lane, each just a half-step to the side of the
 * teammate already there. Composes with the existing ladder (the caller skips
 * it when a reflex preempted — a dodge lands exactly where it aimed) instead
 * of fighting the nav, and it never fires on a deliberate stand
 * (`input.steering === false`): a breather is a decision the pacing owns.
 *
 * Two heroes on EXACTLY one point split by seat order — a deterministic
 * tie-break off the state, never a coin toss. Strict no-op solo. Mutates only
 * the input being decided, never the state.
 */
export function applyPartySpacing(
  state: GameState,
  hero: Player,
  input: GameInput,
): void {
  if (state.players.length < 2 || !input.steering) return;
  let mate: Player | null = null;
  let mateSeat = -1;
  let mateD = Infinity;
  for (let seat = 0; seat < state.players.length; seat++) {
    const other = state.players[seat]!;
    if (other === hero || !heroInPlay(other)) continue;
    const d = distance(hero.pos, other.pos);
    if (d < mateD) {
      mateD = d;
      mate = other;
      mateSeat = seat;
    }
  }
  if (!mate || mateD >= SPACING_RADIUS) return;
  let ax: number;
  let ay: number;
  if (mateD < 1e-6) {
    // Standing on the same point: split east/west by seat order, so the pair
    // peels apart the same way every run.
    ax = state.players.indexOf(hero) < mateSeat ? -1 : 1;
    ay = 0;
  } else {
    ax = (hero.pos.x - mate.pos.x) / mateD;
    ay = (hero.pos.y - mate.pos.y) / mateD;
  }
  const push = (1 - mateD / SPACING_RADIUS) * SPACING_RADIUS;
  input.target.x = clamp(
    input.target.x + ax * push,
    20,
    state.level.width - 20,
  );
  input.target.y = clamp(
    input.target.y + ay * push,
    20,
    state.level.height - 20,
  );
}

/**
 * SPLIT THE PACKS — is this foe already being HANDLED by a teammate who is
 * nearer to it than this hero? True when a living teammate closer to the foe
 * either IS its quarry (`Enemy.quarry` — the mob is already fighting them) or
 * is engaged on it (standing within the local threat ring of it, the same
 * ring every other "in this fight" read uses). The target picks read this to
 * prefer the NEXT foe — the whole party queueing on one minion while six
 * others chew on somebody is the most visible tell these are not players —
 * and every caller keeps the only-target case: a lone foe is never refused.
 * Strict no-op solo. Pure.
 */
export function handledByTeammate(
  state: GameState,
  hero: Player,
  enemy: Enemy,
): boolean {
  if (state.players.length < 2) return false;
  const mine = distance(hero.pos, enemy.pos);
  for (let seat = 0; seat < state.players.length; seat++) {
    const mate = state.players[seat]!;
    if (mate === hero || !heroInPlay(mate)) continue;
    const d = distance(mate.pos, enemy.pos);
    // Only a teammate NEARER to the foe defers this hero — the farther one
    // takes the next target, never both of them.
    if (d >= mine) continue;
    if (enemy.quarry === seat) return true;
    if (d <= THREAT_RADIUS) return true;
  }
  return false;
}

/**
 * THE TEAMMATE TO COVER, or null with nobody to cover — the macro goal that
 * outranks every errand below the reflexes ({@link macroTarget}'s ladder):
 *
 *   • A DOWNED teammate (`Player.downed`, seat not departed) is a BODY TO
 *     STAND OVER: their gear lies on a corpse, their walk back crosses the
 *     map, and a bot standing on the spot pulls the horde's aggro onto
 *     somebody who can still fight. Excluded from the leash on purpose
 *     (`heroInPlay` is false for them) — this rule is the one that walks
 *     there. The NEAREST body when several are down.
 *   • Failing that, a teammate at CRITICALLY low hp NEARBY — inside the local
 *     threat ring, below the bot's own "bleeding badly" line
 *     (`BotTuning.hopHpFrac`, the same fraction at which a bitten hero spends
 *     a hop on escaping) — is held NEAR and fought beside rather than kited
 *     away from: making the goal their position drifts every retreat and
 *     kite-forward toward them (the fight reads blend `travelHeading` into
 *     the away vector), which is the useful pre-corpse version of covering.
 *
 * Strict no-op solo. Pure — a read of the party, no bot memory.
 */
export function allyCoverTarget(
  state: GameState,
  hero: Player,
  tune: BotTuning,
): Vec2 | null {
  if (state.players.length < 2) return null;
  let body: Player | null = null;
  let bodyD = Infinity;
  for (const other of state.players) {
    if (other === hero || other.downed !== true || other.departed) continue;
    const d = distance(hero.pos, other.pos);
    if (d < bodyD) {
      bodyD = d;
      body = other;
    }
  }
  if (body) return { x: body.pos.x, y: body.pos.y };
  for (const other of state.players) {
    if (other === hero || !heroInPlay(other)) continue;
    if (other.hp > other.maxHp * tune.hopHpFrac) continue;
    if (distance(hero.pos, other.pos) > THREAT_RADIUS) continue;
    return { x: other.pos.x, y: other.pos.y };
  }
  return null;
}
