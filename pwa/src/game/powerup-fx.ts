// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The POWERUP LOOK accessor. A powerup's BLOCKS decide what is drawn (a well
// draws a core, a trail draws burning patches); its `look:` kit decides how it
// READS, so two powers that share an effect can be completely different things:
// the DUST DEVIL is a red grit column that hunts, the EVENT HORIZON is a black
// throat that swallows, and both are nothing but a `well` with a different kit.
//
// The kits themselves are CONTENT — authored in `content/powerups.yaml`
// alongside the numbers they colour, compiled into the def like every other
// field. They used to be a catalog in this file keyed by shipped id, which
// meant a mod's power could only ever wear the default: the one thing that
// makes a power look like itself was the one thing a mod couldn't reach.

import { abilityDef, type AbilityLook } from "@game/core";

export type PowerupStyle = AbilityLook;

/** The kit an un-styled powerup wears — a neutral arcane blue-violet. A power
 * that authors no `look:` still draws; it just doesn't yet look like itself. */
export const DEFAULT_POWERUP_STYLE: PowerupStyle = {
  core: "150, 170, 255",
  hot: "232, 238, 255",
  deep: "18, 20, 40",
  spark: "196, 210, 255",
};

/** The look for `defId` (never null — an un-styled or unknown power gets the
 * default, so a draw pass can never be handed nothing). */
export function powerupStyle(defId: string): PowerupStyle {
  try {
    return abilityDef(defId).look ?? DEFAULT_POWERUP_STYLE;
  } catch {
    // `abilityDef` throws on a broken id so bugs surface loudly — but a DRAW
    // pass is the wrong place to surface one: it would take the frame down
    // rather than draw one power in the wrong colour.
    return DEFAULT_POWERUP_STYLE;
  }
}
