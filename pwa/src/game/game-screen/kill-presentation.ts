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
//   CLEAVE      an EDGED blow that drove the body far past dead goes THROUGH:
//               it falls apart in two halves along the blade's line.
//   GIB         a BLUNT blow that drove it far further past dead BURSTS it:
//               there is no corpse, only what is left of one, thrown across the
//               floor.
//   LAUNCH      everything else — the body is punted away from the hero and
//               topples, which is the death this game has always had.
//
// WHAT DECIDES WHETHER IS THE OVERKILL — `damage - hpBefore`, how far past zero
// the blow drove the body, never the raw size of the blow. That is QuakeWorld's
// rule, and it is the only measure that tells a clean one-shot apart from the
// same blow finishing a mob already down to a sliver. The ladder itself lives
// one leaf further down in `./overkill.ts`, which imports nothing — so
// `scripts/gore-rate.mjs` can replay a whole campaign through the very numbers
// that ship and report what share of deaths come apart.
//
// WHAT DECIDES BETWEEN THE MIDDLE TWO IS THE WEAPON, and that is the whole
// design: an edge OPENS a body and a mass BURSTS it. The engine carries the
// answer out on the kill event (`edged`, from `items/edge.ts`), because
// sharpness is a property of a WEAPON — which is content — and the alternative,
// an app-side list of which weapon names sound like hammers, could never
// include a mod's.
//
// THE GATE IS `gore-gate.ts`, THE SAME ONE THE BLOOD ASKS, and it is checked
// HERE rather than in the renderer. Coming apart is the most graphic thing in
// the game, so it hangs off the device's MATURE CONTENT switch like everything
// else that is not for children (see app/device-policy.ts) — and off the
// player's own switches under it, of which TWO have to agree: the victim's
// FAMILY must be bleeding at all (a player who turned ROBOTIC GORE off is not
// watching a rover burst either) and the KIND must be permitted (CLEAVES and
// GIBS are separate rows, because a blade opening a body and a mass bursting it
// are different sights and a player may well want one and not the other).
// What a refused cleave or gib falls back to is the ORDINARY death, launch
// included; that shape is the point, and it is the same one the incinerate gate
// takes. Suppress the EFFECT alone and a censored blow kills things whose bodies
// simply cease to exist, which reads as a bug rather than as a gentler game —
// which is what `tests/nuke_incineration_test.ts` and
// `tests/gore_dismemberment_test.ts` pin. A refusal never falls back to the
// OTHER kind either: turning cleaves off must not start bursting the bodies a
// blade would have opened.
//
// EVERY KIND OF BODY COMES APART, AND EACH COMES APART AS ITSELF. A wisp has no
// intestines, but it does have goo and a cold light at the middle of it; a rover
// has no ribcage, but it has plate, a loom of wire and a cell. What each one is
// made of is `./gore.ts` (`EnemyDef.gore` names the family) — so this module
// decides only WHETHER and HOW HARD, and never what falls out.
//
// A BOSS is the one body that never does, and that is a rule about the FICTION
// rather than about gore: a boss has last words to say over its own corpse, and
// that corpse stays on the field for the rest of the level as the landmark of
// the fight.

import { nsfwAllowed } from "../../app/device-policy.ts";

import { dismemberAllowed, goreAmount } from "./gore-gate.ts";
import { corpseLaunch, type CorpseLaunch } from "./corpse-launch.ts";
import type { GoreFamilyId } from "./gore.ts";
import { goreBurst, type Anatomy, type GoreBurst } from "./gore-burst.ts";
import { goreKind, overkillBars } from "./overkill.ts";

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
  /** The health the victim still had when the blow landed (`enemyKilled`'s own
   * `hpBefore`). `damage - hpBefore` is the OVERKILL, and the overkill alone
   * decides whether the body comes apart — see `CLEAVE_BARS`. */
  hpBefore: number;
  /** Where the blow came FROM — the hero. The body is thrown away from it and
   * the cut runs along it. */
  heroPos: { x: number; y: number };
  /** Where the victim stood. */
  pos: { x: number; y: number };
  role: string;
  /** WHAT KIND OF BODY it is (`EnemyDef.gore`) — which pools it comes apart
   * into. Absent reads as blood, exactly as it does in the def. */
  family?: GoreFamilyId;
  /** What SHAPE it is, for the pieces only a person has (`EnemyDef.anatomy`). */
  anatomy: Anatomy;
  /** How hard the blow was, in the victim's own healthbars, scaled by the blood
   * knobs — `BloodBlow.force`. Absent when the gore knobs said no. */
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
  // CONTENT switch, this family's own GORE row, and the developer BLOOD amount.
  // Refused, the kill falls all the way back to the ordinary death.
  const family = blow.family ?? "blood";
  if (goreAmount(family) == null) return null;
  // THE OVERKILL, not the blow: how far past zero the body was driven, in its
  // own healthbars. A chip finish has none of it however big the number on it
  // was, because the health it went through is subtracted first. The ladder it
  // is held against — and the boss's exemption from it — is `./overkill.ts`, so
  // the campaign-wide rate probe reads the numbers that ship.
  const overkill = overkillBars(blow.damage, blow.hpBefore, blow.maxHp);
  const kind = goreKind(overkill, blow.role, blow.edged === true);
  // …and the kind's own row. Checked AFTER the ladder rather than instead of it,
  // so a body a blade would have opened topples whole instead of bursting: the
  // fallback for a switched-off kind is the ordinary death, never the other kind.
  if (kind == null || !dismemberAllowed(kind)) return null;
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
    // How HARD the pieces are thrown is still the blood's own force — the same
    // number the spray and the pool ride, so a burst can never disagree with the
    // blood beside it about how bad the hit was. Only WHETHER the body comes
    // apart is the overkill's call.
    blow.force ?? overkill,
    blow.body ?? 1,
    blow.anatomy,
    blow.seed,
    family,
  );
}
