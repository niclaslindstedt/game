// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// HOW A DEATH PRESENTS — burned up, cut in two, burst into pieces, or thrown and
// toppled. Its own leaf module for the same reason `corpse-launch.ts`,
// `blood-hit.ts` and `gore-burst.ts` are ones: the rule is a decision over the
// kill event, so it stays testable without dragging the game screen's
// render/asset graph along. `event-fx.ts` reads it for every `enemyKilled` and
// spawns whichever the answer names.
//
// FOUR WAYS TO DIE, and they are mutually exclusive:
//
//   INCINERATE  a screen-NUKE burns the body up — fire, then a charred skeleton.
//   CLEAVE      an EDGED blow that took the whole bar in one goes THROUGH: the
//               body falls apart in two halves along the blade's line.
//   GIB         a BLUNT blow that overwhelmed the body BURSTS it: there is no
//               corpse, only what is left of one, thrown across the floor.
//   LAUNCH      everything else — the body is punted away from the hero and
//               topples, which is the death this game has always had.
//
// WHAT DECIDES BETWEEN THE MIDDLE TWO IS THE WEAPON, and that is the whole
// design: an edge OPENS a body and a mass BURSTS it. The engine carries the
// answer out on the kill event (`edged`, from `items/edge.ts`), because
// sharpness is a property of a WEAPON — which is content — and the alternative,
// an app-side list of which weapon names sound like hammers, could never
// include a mod's.
//
// THE GATE IS `bloodAmount()`, THE SAME ONE THE BLOOD ASKS, and it is checked
// HERE rather than in the renderer. Coming apart is the most graphic thing in
// the game, so it hangs off the device's MATURE CONTENT switch like everything
// else that is not for children (see app/device-policy.ts) — and off the
// player's own EXTRA GORE row under it, because a player who turned the blood
// off has already said what they want. What a refused cleave or gib falls back
// to is the ORDINARY death, launch included; that shape is the point, and it is
// the same one the incinerate gate takes. Suppress the EFFECT alone and a
// censored blow kills things whose bodies simply cease to exist, which reads as
// a bug rather than as a gentler game — which is what
// `tests/nuke_incineration_test.ts` and `tests/gore_dismemberment_test.ts` pin.
//
// AND ONLY A BODY THAT BLEEDS COMES APART. A wisp has no halves and a rover has
// no intestines: `gore: ecto` and `gore: sparks` keep the plain two-frame
// splash and the plain corpse, whatever they were killed with.

import { nsfwAllowed } from "../../app/device-policy.ts";

import { bloodAmount } from "./blood-hit.ts";
import { corpseLaunch, type CorpseLaunch } from "./corpse-launch.ts";
import { goreBurst, type Anatomy, type GoreBurst } from "./gore-burst.ts";

/**
 * How far past the victim's WHOLE health a blow has to go before the body stops
 * merely dying and starts coming apart, measured in the victim's own healthbars
 * (`damage / maxHp`) — the same currency the launch, the spray and the pool are
 * all priced in.
 *
 * A CUT is the cheaper of the two: a blade that takes a full bar and a third in
 * one stroke has plainly gone through. BURSTING costs more, because it has to
 * read as overpressure rather than as a hard hit — a body does not come apart
 * because something heavy touched it, it comes apart because far more force
 * arrived than it could hold.
 *
 * Below both, the ordinary death: a chip finish topples, a clean one-shot punts.
 * That ladder is deliberate — if every kill came apart, none of them would mean
 * anything, and the game would have replaced its death animation rather than
 * added to it.
 */
const CLEAVE_BARS = 1.35;
const GIB_BARS = 2.2;

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

/** What a killing blow leaves behind. At most one of the three happens. */
export type KillPresentation = {
  /** Burn the body up into a smoking charred skeleton (a permitted nuke kill). */
  incinerate: boolean;
  /** The body came APART — cut in two, or burst. Null for an ordinary death. */
  gore: GoreBurst | null;
  /** The throw the body takes, or null when it just topples where it stood.
   * Always null when `incinerate` or a `gib` burst is set — there is no body
   * left to throw. A CLEAVE keeps it: the two halves ride the same punt, which
   * is what stops a cleaved body from coming apart on the spot like a
   * disassembled prop. */
  launch: CorpseLaunch | null;
};

/** One killing blow, as the fx pass knows it. */
export type KillBlow = {
  /** The engine's own flag: a screen-nuke blast (`enemyKilled.incinerated`). */
  incinerated?: boolean;
  /** The engine's own flag: the blow came off an EDGE (`enemyKilled.edged`). */
  edged?: boolean;
  damage: number;
  maxHp: number;
  /** Where the blow came FROM — the hero. The body is thrown away from it and
   * the cut runs along it. */
  heroPos: { x: number; y: number };
  /** Where the victim stood. */
  pos: { x: number; y: number };
  role: string;
  /** Whether this body has blood in it at all (`EnemyDef.gore === "blood"`). */
  bleeds: boolean;
  /** What it is built of, for the pieces (`EnemyDef.anatomy`). */
  anatomy: Anatomy;
  /** How hard the blow was, in the victim's own healthbars, scaled by the blood
   * knobs — `BloodBlow.force`. Absent when nothing bled (no blood, no gore). */
  force?: number;
  /** The victim's build multiplier — `BloodBlow.body`. */
  body?: number;
  /** A per-kill seed, so the pieces are the same on every redraw of the frame. */
  seed: number;
};

/**
 * Decide how one killing blow presents.
 *
 * The order is the priority: a nuke burns whatever it killed, then an
 * overwhelming blow takes the body apart the way its weapon would, and anything
 * that reaches the end is the ordinary punt-and-topple.
 */
export function killPresentation(blow: KillBlow): KillPresentation {
  if (blow.incinerated && nsfwAllowed()) {
    return { incinerate: true, gore: null, launch: null };
  }
  const launch = corpseLaunch(
    blow.damage,
    blow.maxHp,
    blow.heroPos,
    blow.pos,
    blow.role,
  );
  const gore = goreFor(blow);
  return {
    incinerate: false,
    gore,
    // A burst body has nothing left to punt; a cleaved one rides the punt in
    // two pieces.
    launch: gore?.kind === "gib" ? null : launch,
  };
}

/** Whether this blow takes the body apart, and into what. */
function goreFor(blow: KillBlow): GoreBurst | null {
  // The one gate, asked exactly where the blood asks it: the device's MATURE
  // CONTENT switch, the player's EXTRA GORE row, and the developer BLOOD
  // amount. Refused, the kill falls all the way back to the ordinary death.
  if (bloodAmount() == null) return null;
  // Nothing that doesn't bleed can come apart, and a boss never does.
  if (!blow.bleeds || blow.role === "boss") return null;
  const bars = Math.max(0, blow.damage) / Math.max(1, blow.maxHp);
  const cost = ROLE_COST[blow.role] ?? 1;
  const kind: "cleave" | "gib" | null = blow.edged
    ? bars >= CLEAVE_BARS * cost
      ? "cleave"
      : null
    : bars >= GIB_BARS * cost
      ? "gib"
      : null;
  if (kind == null) return null;
  // The blow's bearing: away from whoever landed it. The cut runs along it (the
  // blade went in that way and out the other side) and the burst throws its
  // longest pieces down it.
  const heading = Math.atan2(
    blow.pos.y - blow.heroPos.y,
    blow.pos.x - blow.heroPos.x,
  );
  return goreBurst(
    kind,
    heading,
    blow.force ?? bars,
    blow.body ?? 1,
    blow.anatomy,
    blow.seed,
  );
}
