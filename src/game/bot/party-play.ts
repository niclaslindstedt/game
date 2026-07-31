// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE AUTOPILOT'S ONE PARTY RULE: don't leave the party (multiplayer plan
// §7.4's second bullet).
//
// **THIS IS NOT THE REST OF §7.4, AND THE SPLIT IS DELIBERATE.** Spacing,
// splitting the packs, respecting `Item.owner`, covering a hero who is down and
// travelling to the boss as a group are all phase 7's — they are about how a bot
// party PLAYS, and they can be judged only once somebody watches one play. The
// leash is here, one phase early, because §7.2's simulator is the instrument phase
// 4's §4.3 tuning is read off, and an instrument that measures N SOLOISTS SHARING
// SEED cannot be used to tune co-op at all.
//
// **AND THAT WAS MEASURED, NOT ASSUMED.** Flying a party of two on the moon,
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

import { distance } from "@game/lib/vec.ts";
import type { Vec2 } from "@game/lib/vec.ts";

import { XP_SHARE } from "../config/index.ts";
import { heroInPlay } from "../party.ts";
import type { Bot } from "./state.ts";
import type { GameState, Player } from "../types/index.ts";

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
 * stop, and §4.2's corpse — a body there IS a reason to walk to — is a different
 * rule that has not landed.
 */
export function partyLeash(
  bot: Bot,
  state: GameState,
  hero: Player,
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
    return null;
  }
  const out = XP_SHARE.radius * LEASH_OUT;
  const back = XP_SHARE.radius * LEASH_IN;
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
