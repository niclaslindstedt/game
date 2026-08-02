// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// WHO A KILL'S XP BELONGS TO — the one rule that decides whether a level 12
// friend can meaningfully play with a level 60 character, and therefore most of
// whether co-op is worth playing at all (docs/multiplayer.md).
//
// It is Diablo 2's shape, and both halves of that shape are load-bearing:
//
//   PROXIMITY-GATED. Only heroes who were near enough to the kill to have been
//   in the fight get a share. Without the gate a party's optimal play is to
//   scatter to the four corners of the map and farm four fights at once for
//   four times the XP each — which is not a party, it is four solo runs sharing
//   a lobby, and it is what "everyone gets everything" always degenerates into.
//
//   LEVEL-WEIGHTED. The pot is split in proportion to level, not evenly. The
//   even split is the one that LOOKS generous to the newcomer and is in fact
//   the thing that breaks the mode: at an even split a level-90 running a
//   level-12 through a map hands over half of every kill, so grouping with
//   somebody below you is a straight tax and nobody does it. Weighted by level
//   the veteran keeps most of the pot — and the newcomer still gains far more
//   than they could alone, because the horde is priced against the PARTY's
//   level (`partyLevel`), so a level-12 taking a sixth of a level-90 kill is
//   taking a sixth of something enormous. That asymmetry IS the power-levelling
//   D2 is famous for, and it is the reason the mode is fun to bring a friend to.
//
// This module is a LEAF — the party reads and vector maths only — because
// `grantXp` sits at the bottom of the kill path and may not grow imports.

import { distanceSq } from "@game/lib/vec.ts";

import { XP_SHARE } from "./config/index.ts";
import { heroInPlay } from "./party.ts";
import type { GameState, Player } from "./types/index.ts";

/** One hero's cut of a payout, already rounded to whole XP. */
export type XpCut = { hero: Player; amount: number };

/**
 * Split `amount` among the heroes near `pos`.
 *
 * The result is a list rather than a mutation so the caller stays the one place
 * that knows what banking XP means (the per-map cap, the difficulty bonus, the
 * ding) — this module only answers "whose, and how much".
 *
 * TWO CASES ARE THE SAME CASE, deliberately. With one hero in range the list is
 * one full-value cut, which is exactly what a single-player run has always got:
 * the party bonus is 1 at one hero and the weight is 1 of 1, so nothing about
 * the solo number moves. With NOBODY in range — a shot fired from across the
 * map, a hazard's kill, a turret finishing something the party has walked away
 * from — the nearest hero in play takes it whole, rather than the XP evaporating
 * into a rounding error nobody could explain.
 */
export function splitXp(
  state: GameState,
  amount: number,
  pos: { x: number; y: number },
): XpCut[] {
  if (amount <= 0) return [];
  const r2 = XP_SHARE.radius * XP_SHARE.radius;
  const near: Player[] = [];
  let levelSum = 0;
  for (const hero of state.players) {
    // A BOT TAKES NO XP. A bot seat is an autopilot hero nobody is levelling
    // (`Player.bot`): paying it a cut would burn a share of every kill on a
    // character that banks nothing, and counting it toward the party bonus or
    // the level weighting would let a host inflate the pot by seating machines.
    // Skipped up front, so a botless party walks exactly the branches it always
    // did — the solo number cannot move.
    if (hero.bot) continue;
    if (!heroInPlay(hero)) continue;
    if (distanceSq(hero.pos, pos) > r2) continue;
    near.push(hero);
    levelSum += Math.max(1, hero.level);
  }
  if (near.length === 0) {
    // The nearest NON-BOT hero in play, for the same reason the loop above
    // skips them: the fallback exists so a far kill's XP reaches a person, and
    // a bot standing closer must not intercept it. Only when every hero in
    // play is a bot does the amount evaporate — there is nobody to pay.
    const fallback = nearestPayableHero(state, pos);
    return fallback ? [{ hero: fallback, amount }] : [];
  }
  // One hero in range is the solo path, and it must not go through the
  // arithmetic below: `round(amount × 1/1 × 1)` happens to agree today, but a
  // future weighting that did not would silently re-tune every single-player
  // run in the game.
  const only = near[0];
  if (near.length === 1 && only) return [{ hero: only, amount }];

  const pot = amount * partyXpBonus(near.length);
  const cuts: XpCut[] = [];
  for (const hero of near) {
    const cut = Math.round(
      (pot * Math.max(1, hero.level)) / Math.max(1, levelSum),
    );
    // Never nothing: a level-2 beside a level-99 is taking a rounding error's
    // worth of a small kill, and a payout that reads as zero is indistinguishable
    // from a bug in the sharing.
    if (cut > 0) cuts.push({ hero, amount: cut });
    else cuts.push({ hero, amount: 1 });
  }
  return cuts;
}

/**
 * The living NON-BOT hero nearest `pos`, or null when every hero in play is a
 * bot (or the party is wiped).
 *
 * Deliberately not `nearestHero` (`party.ts`): that is the GEOMETRY answer —
 * what a mob chases, what a hazard hits — and a bot is exactly as chaseable as
 * anybody. This is a PAYOUT answer, and a payout needs a person.
 */
function nearestPayableHero(
  state: GameState,
  pos: { x: number; y: number },
): Player | null {
  let best: Player | null = null;
  let bestD = Infinity;
  for (const hero of state.players) {
    if (hero.bot || !heroInPlay(hero)) continue;
    const d = distanceSq(hero.pos, pos);
    if (d < bestD) {
      bestD = d;
      best = hero;
    }
  }
  return best;
}

/**
 * The multiplier on the POT for a group of `n` sharing one kill.
 *
 * Grouping has to pay for itself. Split n ways with no bonus, a party of four
 * standing in one fight each earn a quarter of what they would alone — and
 * although they also clear roughly four times as fast, so the RATE is about
 * even, "about even" is not a reason to play together. This tips it: the pot a
 * group divides is larger than the one a soloist keeps, so the answer to "is it
 * better to split up" is no.
 *
 * It is deliberately NOT the `/players N` multiplier (`server/wire/players.ts`),
 * even though both grow with a number of players. That one is a bargain the HOST
 * strikes — tougher monsters for more XP, whether or not anybody has arrived —
 * and this one is a fact about a fight several people are actually standing in.
 * Folding them together would make the host's difficulty setting silently change
 * what being in the same room is worth.
 */
export function partyXpBonus(n: number): number {
  return 1 + XP_SHARE.partyBonusPerHero * Math.max(0, n - 1);
}
