// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Shared stat metadata for the stat-allocation overlays (the level-up chooser
// and the LEVEL TOKEN respec). One entry per trainable stat: its label, the
// short button blurb, the full (i)-panel breakdown, and the pixel glyph. Both
// overlays render the same six stats, so this is the single source they draw
// from — keep the blurbs/info honest against the engine's STATS rules
// (src/game/config.ts) + src/game/items.ts; every stat now touches more than
// damage.

import type { StatName } from "@game/core";

import { spriteDataUrl, type Sprites } from "./assets.ts";

export const STAT_CHOICES: {
  stat: StatName;
  label: string;
  blurb: string;
  /** The (i)-panel breakdown, pre-wrapped into short lines so it fits a
   * vertical phone (PixelText draws one canvas per line, no auto-wrap). */
  info: string[];
  icon: string;
}[] = [
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
    info: ["MELEE & RANGED WEAPON DAMAGE.", "+1 BAG SLOT EACH."],
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
      "MELEE & RANGED CRITS, AND",
      "MORE DODGE.",
    ],
    icon: "icon_stat_dexterity",
  },
  {
    stat: "intelligence",
    label: "INTELLECT",
    blurb: "MAGIC + AOE",
    info: [
      "MAGIC POWER & CRITS. LONGER",
      "RANGE & A BIGGER MELEE AOE",
      "CONE (HITS MORE).",
    ],
    icon: "icon_stat_intelligence",
  },
  {
    stat: "speed",
    label: "SPEED",
    blurb: "MOVE SPEED",
    info: ["+8% MOVE SPEED EACH."],
    icon: "icon_stat_speed",
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

/** The stat's pixel glyph, or nothing if the sprite is missing. */
export function StatGlyph({
  sprites,
  icon,
}: {
  sprites: Sprites;
  icon: string;
}) {
  const src = spriteDataUrl(sprites, icon);
  if (!src) return null;
  return (
    <img src={src} alt="" className="pixel-img stat-icon" draggable={false} />
  );
}
