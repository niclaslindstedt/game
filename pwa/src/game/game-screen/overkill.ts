// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// HOW FAR PAST DEAD A BLOW DROVE A BODY, and what that earns it — the rule
// alone, importing nothing at all.
//
// Its own leaf for two reasons. `kill-presentation.ts` reaches the device policy
// and the settings to ask its gore gate, so a tool that only wants the LADDER
// cannot import it from node; and the ladder is the one part of the gore feature
// whose calibration has to be measurable over a whole campaign rather than
// judged in a diorama. `scripts/gore-rate.mjs` replays every kill of a simulated
// easy→JESUS run through these very functions, so the share of deaths that come
// apart is measured against the numbers that ship rather than against a second
// copy of them.
//
// THE MEASURE IS THE OVERKILL — `damage - hpBefore`, the health the blow spent
// past zero — never `damage` on its own. That is QuakeWorld's rule (`health <
// -40` bursts a body: a fixed depth past dead, not a big number), carried over
// in the victim's own HEALTHBARS so one ladder holds from a moon rat to a rift
// horror instead of needing a figure per mob.
//
// WHY IT IS NOT THE BLOW. `damage / maxHp` cannot tell a clean one-shot on a
// full-health mob from the same blow finishing one already down to a sliver, and
// those are opposite events: the first is a body absorbing everything it had,
// the second is a body driven most of a bar past dead. Judging on the blow got
// both backwards — the honest one-shot came apart and the mob hit by five times
// what was left of it toppled politely — so what the player saw bore no relation
// to what they had just done, which is what "it looks random" means from the
// outside even though nothing here has ever rolled a die.
//
// WHY IT IS NOT THE RATIO `damage / hpBefore` EITHER, which is the other obvious
// reading of "how much overkill compared to the health left". It gets the
// interesting cases right and one degenerate case very wrong: a body down to its
// LAST POINT of health is burst by a blow of two damage, because two is twice
// one. The ratio has no idea how big the body it is talking about was. Spending
// the excess against `maxHp` keeps the same behaviour everywhere it was wanted —
// a mob on a fifth of its bar bursts to a blow it would have merely died to at
// full health — and costs a feeble tap nothing at all.

/** The role a victim plays, as the enemy catalog names it. */
export type GoreRole = string;

/**
 * How far past dead a blow drove the body, in the victim's own healthbars.
 *
 * `hpBefore` is the health it still had when the blow landed, so the health the
 * blow had to spend GETTING to zero is subtracted before anything is counted —
 * which is the whole difference between this and the raw size of the hit. Never
 * negative: a blow that merely killed has no overkill in it.
 */
export function overkillBars(
  damage: number,
  hpBefore: number,
  maxHp: number,
): number {
  return Math.max(0, damage - Math.max(0, hpBefore)) / Math.max(1, maxHp);
}

/**
 * Bars of OVERKILL a body has to take before it stops merely dying and starts
 * coming apart.
 *
 * `GIB_BARS` IS QUAKEWORLD'S OWN NUMBER. Quake bursts a body at `health < -40`
 * against a 100-health bar — four tenths of a bar spent past zero — and that
 * figure is not arbitrary: it is what makes a rocket burst the man who was
 * already hurt and merely kill the one who was not. Same blow, opposite picture,
 * decided by what the body had left. A CUT is cheaper, because a blade that came
 * out the far side and kept going has plainly gone through, while bursting has
 * to read as overpressure rather than as a hard hit.
 *
 * WHAT THIS MAKES THE RATE, and it is deliberately NOT a constant: the share of
 * deaths that come apart is a readout of how far the hero's damage has outgrown
 * the horde's health, and that is the whole point of pricing it this way.
 *
 *   - A mob that trades evenly — three or four hits to drop, each blow about the
 *     health it is chewing through — dies whole. Its last hit has no overkill in
 *     it to spend, however big the number floating off it was.
 *   - A mob that dies in TWO hits and is left on a fifth of its bar by the first
 *     takes six tenths of a bar past zero from the second, and bursts. That is
 *     the same body being hit by a blow far bigger than what was left of it.
 *   - A build that one-shots the fodder several times over bursts nearly all of
 *     it, and should: at that point the hero is not fighting the horde, he is
 *     deleting it, and the screen ought to say so.
 *
 * So a rising gib rate is the game reporting a rising power curve, not a knob
 * that drifted. `scripts/gore-rate.mjs` measures it over a simulated campaign
 * and breaks it out by how overkilling the build was at the time — run it after
 * any change here, and read the SPREAD across the rungs rather than the single
 * campaign-wide average.
 */
export const CLEAVE_BARS = 0.25;
export const GIB_BARS = 0.4;

/**
 * What a SET PIECE costs on top. An elite has to be hit two and a half times as
 * hard for the same treatment — it is bigger, and a lieutenant that comes apart
 * to the same blow as the fodder around it was never a lieutenant.
 *
 * A BOSS is absent from this table on purpose and can never appear in it: a boss
 * has last words to say over its own body, and its corpse stays on the field for
 * the rest of the level as a landmark of the fight (see the `persist` corpse in
 * event-fx.ts). Bursting one deletes both.
 */
const ROLE_COST: Record<string, number> = { elite: 2.5 };

/**
 * Whether this blow takes the body apart, and into what — the whole ladder, with
 * no gore gate and no geometry in it.
 *
 * `edged` is the WEAPON's answer (`items/edge.ts`, ridden out on the kill
 * event): an edge OPENS a body and a mass BURSTS it, so the two never compete
 * for the same kill. A boss never comes apart at all.
 */
export function goreKind(
  overkill: number,
  role: GoreRole,
  edged: boolean,
): "cleave" | "gib" | null {
  if (role === "boss") return null;
  const cost = ROLE_COST[role] ?? 1;
  if (edged) return overkill >= CLEAVE_BARS * cost ? "cleave" : null;
  return overkill >= GIB_BARS * cost ? "gib" : null;
}
