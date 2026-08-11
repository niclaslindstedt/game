// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// HOW A BOSS'S DEATH RITE PRESENTS — what the finisher leaves on the floor, and
// the MATURE CONTENT gate on it.
//
// Its own leaf beside `kill-presentation.ts`, and shaped exactly like it, for
// the same two reasons: the rule is a decision over an event, so it stays
// testable without dragging the game screen's render and asset graph along; and
// there is then ONE place per feature where the gore gate is asked, rather than
// a check scattered over the passes that happen to draw something red.
//
// THE ENGINE STATES AN INTENT; THIS DECIDES WHAT ACTUALLY HAPPENS. The rite
// itself (`engine/game/boss-death.ts`) is not mature content and is never gated —
// the hero still leaps, the boss still dies, the beats run the same length —
// and it says on `bossRiteStruck` what it MEANS to leave behind. Only the
// wreckage is graphic, so only the wreckage is gated, and a refusal comes back
// here as an ordinary punt-and-topple corpse.
//
// WHY A REFUSAL IS A CORPSE AND NOT NOTHING. This is the same fallback the
// incinerate gate and the gore ladder both take, and the reason is worth
// keeping: a censored blow whose victim simply ceases to exist reads as a BUG,
// not as a gentler game. The player who turned blood off still has to see the
// boss die.
//
// AND THE GATE IS ASKED WHERE THE THING IS DECIDED, NOT WHERE IT IS DRAWN. The
// caller uses the answer to choose which effect to push AND whether to wet the
// floor at all — so a gated rite records nothing in the blood grid, exactly as
// `bloodBlow` returns null rather than being skipped at the blit. A gate at the
// draw call leaves the saturation grid filling up invisibly and hands the
// player everything it was hiding the moment they switch it back on.

import { dismemberAllowed, goreAmount, sfwModeEnabled } from "./gore-gate.ts";
import { goreBurst, type Anatomy, type GoreBurst } from "./gore-burst.ts";
import type { GoreFamilyId } from "./gore.ts";

/** The rite's own account of the blow — `bossRiteStruck`, as the fx pass reads
 * it. */
export type BossRiteBlow = {
  /** What the rite MEANS to leave. Downgraded to `corpse` when the gore gate
   * refuses; never upgraded. */
  remains: "cleave" | "gib" | "corpse";
  /** Hero → boss: the cut opens along it and the wreckage is thrown down it. */
  heading: number;
  /** In the boss's own healthbars (`DeathRiteDef.force`). */
  force: number;
  /** WHAT KIND OF BODY it is (`EnemyDef.gore`), so a machine comes apart as a
   * machine. Absent reads as blood, exactly as it does in the def. */
  family?: GoreFamilyId;
  /** What SHAPE it is (`EnemyDef.anatomy`), for the pieces only a person has. */
  anatomy: Anatomy;
  /** Per-rite seed, so the wreckage is the same on every redraw of the frame. */
  seed: number;
};

/** What a finished rite leaves on the field. Exactly one of the two is set. */
export type BossRitePresentation = {
  /** The boss came APART — cut in two, or burst. Null when the gate refused, or
   * when the rite never meant to take it apart in the first place. */
  gore: GoreBurst | null;
  /** The graphic finisher is replaced by a transient glitter burst. */
  stardust: boolean;
  /** True when what is left is a whole body: the ordinary corpse, toppled where
   * the rite ended it. The landmark of the fight either way. */
  corpse: boolean;
};

/**
 * Decide what a boss's finisher leaves behind.
 *
 * `force` is scripted rather than measured — this is the one blow in the fight
 * that was never in doubt — but it is still spent through the SAME `goreBurst`
 * every other body in the game comes apart through. A boss does not get a
 * second gore system; it gets the one that exists, called with numbers a hand
 * cannot reach.
 */
export function bossRitePresentation(blow: BossRiteBlow): BossRitePresentation {
  // A rite that never meant to take the body apart needs no permission to
  // leave it whole — THE UNMAKING wants the empty suit to fall.
  if (blow.remains === "corpse")
    return { gore: null, stardust: false, corpse: true };
  // SFW keeps the boss's whole body as the fight's landmark and replaces the
  // scripted dismemberment with light. Unlike an ordinary refusal, the burst
  // is still acknowledged — just in a non-graphic vocabulary.
  if (sfwModeEnabled()) return { gore: null, stardust: true, corpse: true };
  // THE GATE, asked exactly where the kill path asks it (`kill-presentation.ts`)
  // and on BOTH its axes, because they answer different questions:
  //
  //   `goreAmount(family)` — may a body of THIS KIND make a mess at all (the
  //     device's MATURE CONTENT switch, the family's own GORE row, and the
  //     developer BLOOD amount);
  //   `dismemberAllowed(kind)` — may a body come apart THIS WAY at all, across
  //     every family, because a machine cut in two is still a body cut in two.
  //
  // Both have to say yes. Turning ROBOTIC GORE off has to stop PAYLOAD-1 bursting
  // even with GIBS on, and turning GIBS off has to stop it bursting whatever it
  // is made of — a finisher is exactly where a player would notice the switch
  // they set being ignored.
  const family = blow.family ?? "blood";
  if (goreAmount(family) == null || !dismemberAllowed(blow.remains)) {
    return { gore: null, stardust: false, corpse: true };
  }
  return {
    gore: goreBurst(
      blow.remains,
      blow.heading,
      blow.force,
      1,
      blow.anatomy,
      blow.seed,
      family,
    ),
    stardust: false,
    corpse: false,
  };
}
