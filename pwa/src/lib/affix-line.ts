// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// HOW AN AFFIX READS. One engine `Affix` in, one line of display text out —
// "+12% DAMAGE", "GRANTS STORMCALL II", "NEVER MISSES".
//
// It sits in `lib/` (generic UI text for an engine value, the pool a later
// game keeps as-is) and apart from ItemCard.tsx for the same reason
// pixel-panel.css and item-card.css sit apart from styles.css: the LIBRARY —
// the generated companion site at /library/ — prints these very lines on every
// arsenal page, and it cannot import a React component to get them. It imports
// THIS module instead, so the wording has one definition and a reworded affix
// moves the game and its reference material together.
//
// The only import is a TYPE, so the compiled module has no runtime dependency
// at all and a plain `node` build script can load it.

import type { Affix, StatName } from "@game/core";

/** What each stat is called on a card. */
export const STAT_LABELS: Record<StatName, string> = {
  stamina: "STAMINA",
  strength: "STRENGTH",
  dexterity: "DEXTERITY",
  intelligence: "INTELLECT",
  luck: "LUCK",
};

/** How a granted forever spell reads on the card (see the `spell` affix). */
const SPELL_LABELS: Record<string, string> = {
  orbit: "CIRCLING FLAME",
  storm: "STORMCALL",
  stasis: "STASIS FIELD",
};

/** How a proc's effect reads on the card (see the `proc` affix). */
const PROC_LABELS: Record<string, string> = {
  bolt: "LIGHTNING",
  nova: "NOVA",
};

/**
 * A signed amount, written the way a card should write it: `+3`, and `-2`
 * rather than `+-2`. A few authored uniques carry a deliberate DOWNSIDE — a
 * small negative that buys the piece extra upside elsewhere — so the negative
 * case is a real one, not a theoretical one.
 */
const signed = (value: number): string =>
  value < 0 ? `${value}` : `+${value}`;

/** A signed percentage, same rule. */
const signedPct = (value: number): string =>
  signed(Math.round(value * 100)) + "%";

/** Roman numeral for a spell/proc RANK — ranks are small by design. */
function rankNumeral(rank: number): string {
  const numerals = ["I", "II", "III", "IV", "V"];
  return numerals[Math.min(rank, numerals.length) - 1] ?? `${rank}`;
}

/** The one line an affix contributes to an item card. */
export function affixLine(affix: Affix): string {
  switch (affix.kind) {
    case "damagePct":
      return `${signedPct(affix.value)} DAMAGE`;
    case "maxHp":
      return `${signed(affix.value)} MAX HP`;
    case "crit":
      return `${signedPct(affix.value)} CRIT`;
    case "armor":
      return `${signed(affix.value)} ARMOR`;
    case "armorPen":
      return `${signedPct(affix.value)} ARMOR PIERCE`;
    case "stat":
      return `${signed(affix.value)} ${STAT_LABELS[affix.stat]}`;
    case "statPct":
      return `${signedPct(affix.value)} ${STAT_LABELS[affix.stat]}`;
    case "maxHpPct":
      return `${signedPct(affix.value)} MAX HP`;
    case "spell":
      return `GRANTS ${SPELL_LABELS[affix.spell] ?? affix.spell.toUpperCase()} ${rankNumeral(affix.rank)}`;
    case "proc": {
      const trigger =
        affix.trigger === "hit"
          ? "ON HIT"
          : affix.trigger === "kill"
            ? "ON KILL"
            : "WHEN STRUCK";
      return `${Math.round(affix.chance * 100)}% ${PROC_LABELS[affix.spell] ?? affix.spell.toUpperCase()} ${rankNumeral(affix.rank)} ${trigger}`;
    }
    case "sureStrike":
      return "NEVER MISSES";
    case "knockback":
      return "KNOCKS BACK";
  }
}
