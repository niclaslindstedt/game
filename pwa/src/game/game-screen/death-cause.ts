// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// WHO KILLED HIM — the one fact the softcore YOU DIED modal leads with, because
// it is the only thing on that screen that changes what the player does next.
//
// The attribution is TICK-SCOPED, and that is the whole trick: `playerDeath` is
// pushed by `enterDeathScene` from the step pipeline's `hp <= 0` chokepoint, so
// it rides the SAME event list as the blow that landed it. Reading the fatal
// cause out of that one list needs no clock, no recency window and no state
// carried between ticks — the simulator's death ledger keeps a timestamped
// `lastHurtCause` only because it books deaths across a whole restarting
// campaign, which the app never does.
//
// A cause the engine can't attribute (a hay bale, a legacy state) reports null
// and the modal simply drops the line: a wrong killer is worse than no killer.

import { ENEMY_DEFS, type GameEvent } from "@game/core";

/** The gravity well's own cause key — a `wellDeath` is an instant devour that
 * bills no `playerHurt`, so it is named here rather than by the engine. */
const WELL_CAUSE = "well";

/**
 * The environment's killers, keyed by the `playerHurt.cause` the hazard bills
 * (`hazards.ts`). Written as the object of "SLAIN BY …", so each reads as a
 * thing that happened rather than as a config key.
 */
const HAZARD_KILLERS: Record<string, string> = {
  "hazard:asteroid": "AN ASTEROID STRIKE",
  "hazard:sandstorm": "THE SANDSTORM",
  "hazard:stampede": "THE STAMPEDE",
  [WELL_CAUSE]: "A GRAVITY WELL",
};

/** The scorched-floor cause prefix — `hazard:scorch:<boss defId>`, so the fire
 * is credited to whoever laid it down (THE FLAGBEARER's laser sweep). */
const SCORCH_PREFIX = "hazard:scorch:";

/** A MARTYR's blast — `hazard:martyr:<defId>` (engine/game/martyrs.ts), so the
 * line names the man who was wearing it rather than "an explosion". */
const MARTYR_PREFIX = "hazard:martyr:";

/** A boss's ORBITAL DELIVERY — `hazard:pod:<boss defId>` (hazards.ts): a rock
 * with an author, so it is credited to the author rather than to the sky. */
const POD_PREFIX = "hazard:pod:";

/**
 * The cause of the fatal blow in ONE tick's events, or null when this tick
 * holds no death. The inner `cause` is null when the death can't be attributed.
 *
 * Scanned in engine order and stopped at `playerDeath`: everything after it
 * belongs to the death scene, not to the blow that opened it. A `wellDeath`
 * outranks a preceding bite because the devour is what actually ended the run.
 */
export function fatalBlow(
  events: readonly GameEvent[],
): { cause: string | null } | null {
  let cause: string | null = null;
  for (const event of events) {
    if (event.type === "playerDeath") return { cause };
    if (event.type === "wellDeath") cause = WELL_CAUSE;
    else if (event.type === "playerHurt" && event.cause) cause = event.cause;
  }
  return null;
}

/**
 * The killer's display name for the modal's "SLAIN BY …" line, or null when
 * there is nothing honest to print (an unattributed death, or a cause naming a
 * mob this build no longer ships).
 */
export function killerLabel(cause: string | null): string | null {
  if (!cause) return null;
  const hazard = HAZARD_KILLERS[cause];
  if (hazard) return hazard;
  if (cause.startsWith(SCORCH_PREFIX)) {
    const name = ENEMY_DEFS[cause.slice(SCORCH_PREFIX.length)]?.name;
    return name ? `${name}'S FIRE` : "BURNING GROUND";
  }
  if (cause.startsWith(MARTYR_PREFIX)) {
    const name = ENEMY_DEFS[cause.slice(MARTYR_PREFIX.length)]?.name;
    return name ? `${name}'S VEST` : "A SUICIDE BLAST";
  }
  if (cause.startsWith(POD_PREFIX)) {
    const name = ENEMY_DEFS[cause.slice(POD_PREFIX.length)]?.name;
    return name ? `${name}'S ORBITAL STRIKE` : "AN ORBITAL STRIKE";
  }
  return ENEMY_DEFS[cause]?.name ?? null;
}
