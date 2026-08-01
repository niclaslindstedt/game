// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// What each trainable stat IS, as data — the label, the short button blurb, the
// full effect breakdown, and the pixel glyph, one entry per stat.
//
// It sits in its own DATA module (rather than beside the overlays' components
// in stat-choices.tsx) because three surfaces read it now and only two of them
// draw buttons: the level-up chooser, the LEVEL TOKEN respec, and the character
// sheet's per-attribute explainer (char-stats.ts, a pure model with no JSX in
// it). Keep the blurbs/info honest against the engine's STATS rules
// (src/game/config.ts) + src/game/items/; every stat now touches more than
// damage. (Move speed is no longer a stat — DEXTERITY is the mobility
// attribute, so there's no SPEED row here.)

import type { StatName } from "@game/core";

export type StatChoice = {
  stat: StatName;
  label: string;
  blurb: string;
  /** The (i)-panel breakdown, pre-wrapped into short lines so it fits a
   * vertical phone (PixelText draws one canvas per line, no auto-wrap). */
  info: string[];
  icon: string;
};

export const STAT_CHOICES: StatChoice[] = [
  {
    stat: "stamina",
    label: "STAMINA",
    blurb: "SPRINT + HP",
    info: [
      "DEEPER SPRINT POOL, SLOWER",
      "DRAIN & FASTER RECOVERY.",
      "ALSO RAISES MAX HP.",
    ],
    icon: "icon_stat_stamina",
  },
  {
    stat: "strength",
    label: "STRENGTH",
    blurb: "DAMAGE + BAG",
    info: [
      "MELEE & RANGED WEAPON DAMAGE,",
      "+1 BAG SLOT EACH. EARNS A",
      "MELEE TALENT EVERY 10 POINTS.",
    ],
    icon: "icon_stat_strength",
  },
  {
    stat: "dexterity",
    label: "DEXTERITY",
    blurb: "SPEED + HIT",
    info: [
      "FASTER MELEE & RANGED ATTACK",
      "SPEED, HIGHER HIT RATE (FEWER",
      "MISSES & ENEMY DODGES), MORE",
      "MELEE & RANGED CRITS, AND MORE",
      "DODGE. EARNS A RANGED TALENT",
      "EVERY 10 POINTS.",
    ],
    icon: "icon_stat_dexterity",
  },
  {
    stat: "intelligence",
    label: "INTELLECT",
    blurb: "MAGIC + AOE",
    info: [
      "MAGIC WEAPON POWER & CRITS,",
      "LONGER RANGE, WIDER MELEE AOE.",
      "EARNS A MAGIC TALENT EVERY",
      "10 POINTS.",
    ],
    icon: "icon_stat_intelligence",
  },
  {
    stat: "luck",
    label: "LUCK",
    blurb: "CRIT + LOOT",
    info: [
      "A LITTLE MORE CRIT & DODGE,",
      "DODGE ENEMY CRITS, MORE &",
      "BETTER LOOT.",
    ],
    icon: "icon_stat_luck",
  },
];

/** The catalog entry for one stat — the sheet reads it by name. */
export function statChoice(stat: StatName): StatChoice | undefined {
  return STAT_CHOICES.find((choice) => choice.stat === stat);
}
