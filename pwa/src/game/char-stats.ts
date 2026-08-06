// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The character sheet's numbers, as data — the ONE reader of the engine's
// derived stats behind the CHARACTER modal (CharacterSheet.tsx). It is a model
// rather than markup so the sheet stays a layout: adding a figure to the hero's
// page is a row in a group here, and nothing about how it is drawn.
//
// EVERY ROW CARRIES ITS OWN EXPLANATION (`help`), because a screen that is
// nothing but sixteen labelled numbers is only legible to somebody who already
// knows what they mean. The sheet hangs it off a hover on a desktop and a tap
// on a phone (InfoTip), and the ATTRIBUTES rows go further and itemise WHERE
// the number came from: chosen points, the difficulty's head start, automatic
// per-level growth, and gear — including a charm paying its bonus from the bag,
// which is a real +1 with nothing on screen to account for it.
//
// Comparing two pieces of gear is deliberately NOT this module's job. The item
// tooltip already prices a piece against the one it would replace, line by line
// and in green or red, with the worn piece's card beside it (ItemTooltip) —
// which is a better answer than restating four totals somewhere else on the
// screen.

import { localHero } from "./local-seat.ts";
import {
  armorReduction,
  computeMaxHp,
  computeMaxStamina,
  currentMobLevel,
  effectiveStat,
  getBalanceTuning,
  heroArmorPen,
  PLAYER,
  playerCritChance,
  playerDodgeChance,
  playerSpeed,
  staminaRegenPerSec,
  statBreakdown,
  totalArmor,
  weaponDamageRange,
  weaponFiringRange,
  type GameState,
  type Player,
  type StatName,
} from "@game/core";

import { STAT_LABELS } from "@ui/lib/affix-line.ts";
import { formatCompact } from "@ui/lib/format-number.ts";

import { hitRate } from "./ItemCard.tsx";
import { statChoice } from "./stat-info.ts";

/** One line of the sheet: `LABEL VALUE`, plus the pixel glyph the ATTRIBUTES
 * rows wear. */
export type StatReadout = {
  key: string;
  label: string;
  value: string;
  /** Value color — the sheet's quiet grouping cue (offense mint, defense
   * blue), not a per-row decision made at the call site. */
  color?: string;
  /** A `content/sprites/icons/` sprite drawn before the label (attributes). */
  icon?: string;
  /** What this row MEANS, pre-wrapped into short lines — PixelText draws one
   * canvas per line and never wraps, and the reference device is a 390px-wide
   * phone, so the wrapping is authored rather than computed. Raised by hover
   * (mouse) or tap (touch); see CharacterSheet's InfoTip. */
  help: string[];
};

export type StatGroup = { title: string; rows: StatReadout[] };

const NEUTRAL = "#e6e8eb";
const OFFENSE = "#7ef0c8";
const DEFENSE = "#7ecbff";
const BODY = "#ffd75e";

/**
 * One row, read off the LOCAL hero.
 *
 * The reader takes the run AND the hero it is about — the engine's whole
 * derived-stat family does, since a party has a stat sheet per player — and
 * every row on this screen is about the hero whose sheet is open, which is
 * this client's own.
 */
function row(
  key: string,
  label: string,
  state: GameState,
  read: (s: GameState, hero: Player) => number,
  format: (n: number) => string,
  help: string[],
  color?: string,
  icon?: string,
): StatReadout {
  return {
    key,
    label,
    value: format(read(state, localHero(state))),
    color,
    icon,
    help,
  };
}

const whole = (n: number) => String(Math.round(n));
const percent = (n: number) => `${Math.round(n * 100)}%`;

/**
 * WHERE ONE ATTRIBUTE CAME FROM, in the player's words — what the stat does,
 * then a line per source that actually contributed.
 *
 * The zero sources are LEFT OUT rather than printed as `+0`: the question this
 * answers is "why is this number not what I picked", and five zeroes around the
 * one line that matters is a worse answer than the one line. `CHOSEN` is the
 * exception and always shows, because it is the number the level-up chooser
 * prints and the one the player is comparing against.
 */
function attributeHelp(state: GameState, stat: StatName): string[] {
  const hero = localHero(state);
  const parts = statBreakdown(state, hero, stat);
  const lines = [...(statChoice(stat)?.info ?? []), ""];
  lines.push(`${parts.chosen} CHOSEN BY YOU`);
  if (parts.headStart > 0) lines.push(`+${parts.headStart} HEAD START`);
  if (parts.auto > 0) lines.push(`+${parts.auto} LEVEL GROWTH`);
  // Worn gear, carried charms and set bonuses arrive as one flat sum — the
  // engine adds them the same way (`computeStatParts`), and an item's own card
  // is where the per-piece answer lives.
  if (parts.gear !== 0) {
    const sign = parts.gear > 0 ? "+" : "-";
    lines.push(`${sign}${Math.abs(parts.gear)} GEAR & CHARMS`);
  }
  if (parts.pct !== 0) {
    lines.push(
      `${parts.pct > 0 ? "+" : ""}${Math.round(parts.pct * 100)}% SCALING`,
    );
  }
  // The soft cap only ever bites a deeply-invested stat, so the line appears
  // exactly when it has something to explain.
  const undiminished = Math.round(parts.raw * (1 + parts.pct));
  if (undiminished !== parts.effective)
    lines.push(`SOFT CAP TRIMS ${undiminished} TO ${parts.effective}`);
  return lines;
}

/**
 * The whole sheet, grouped.
 *
 * ARMOR IS TWO ROWS, not one number with a parenthetical. The points and the
 * share of a blow they turn are different quantities in different units, and
 * `6 (-6%)` read as a penalty to something — six percent less damage dealt was
 * the guess it invited. So the points stand alone and DMG REDUCE states, on its
 * own line, what they buy against the CURRENT horde: the row decays as the mobs
 * outlevel the wardrobe instead of reading as a number that only ever grows.
 */
export function characterStatGroups(state: GameState): StatGroup[] {
  const attributes: StatReadout[] = (
    Object.keys(STAT_LABELS) as StatName[]
  ).map((stat) =>
    row(
      stat,
      STAT_LABELS[stat],
      state,
      (s) => effectiveStat(s, localHero(s), stat),
      whole,
      attributeHelp(state, stat),
      NEUTRAL,
      `icon_stat_${stat}`,
    ),
  );

  // The damage RANGE, not the average: the average is what the engine rolls
  // around, and a player sizing up a weapon wants the spread.
  const damage = weaponDamageRange(
    state,
    localHero(state),
    localHero(state).equipment.weapon,
  );
  const offense: StatReadout[] = [
    {
      key: "damage",
      label: "DAMAGE",
      value: `${formatCompact(damage.min)}-${formatCompact(damage.max)}`,
      color: OFFENSE,
      help: [
        "THE SPREAD THE HELD WEAPON",
        "ROLLS PER HIT, WITH YOUR",
        "STATS, AFFIXES AND TALENTS",
        "ALREADY FOLDED IN.",
      ],
    },
    row(
      "crit",
      "CRIT",
      state,
      playerCritChance,
      percent,
      ["CHANCE A HIT LANDS AS A", "CRITICAL AND STRIKES FOR", "EXTRA DAMAGE."],
      OFFENSE,
    ),
    row(
      "hit",
      "HIT",
      state,
      hitRate,
      percent,
      [
        "CHANCE A SWING CONNECTS.",
        "THE REST MISS OUTRIGHT OR",
        "ARE DODGED BY THE TARGET.",
      ],
      OFFENSE,
    ),
    row(
      "pen",
      "ARMOR PEN",
      state,
      heroArmorPen,
      percent,
      ["THE SHARE OF AN ENEMY'S", "ARMOR YOUR BLOWS IGNORE."],
      OFFENSE,
    ),
    // How far the held weapon actually reaches for THIS hero — the stat that
    // decides whether a fight is fought at arm's length or across the room,
    // and the one number a weapon swap changes most visibly. The FIRING reach,
    // not the paper one: a round that expires in mid-air is not reach, and this
    // is the figure the auto-attack itself measures a target against.
    row(
      "reach",
      "REACH",
      state,
      (s) => weaponFiringRange(s, localHero(s), localHero(s).equipment.weapon),
      whole,
      [
        "HOW FAR THE HELD WEAPON",
        "STRIKES, IN WORLD UNITS —",
        "THE WHOLE SCREEN IS ABOUT",
        "420 ACROSS.",
      ],
      OFFENSE,
    ),
  ];

  const mobLevel = currentMobLevel(state);
  const worn = totalArmor(state, localHero(state));
  const reduction = armorReduction(state, localHero(state), mobLevel);
  const defense: StatReadout[] = [
    row(
      "hp",
      "MAX HP",
      state,
      computeMaxHp,
      formatCompact,
      [
        "THE DAMAGE YOU CAN TAKE",
        "BEFORE YOU GO DOWN. GROWS",
        "WITH STAMINA AND GEAR.",
      ],
      DEFENSE,
    ),
    {
      key: "armor",
      label: "ARMOR",
      value: String(worn),
      color: DEFENSE,
      help: [
        "ARMOR POINTS FROM EVERY",
        "PIECE YOU WEAR. A BROKEN",
        "PIECE CONTRIBUTES NOTHING",
        "UNTIL IT IS REPAIRED.",
      ],
    },
    {
      key: "reduction",
      label: "DMG REDUCE",
      value: percent(reduction),
      color: DEFENSE,
      help: [
        "THE SHARE OF EACH PHYSICAL",
        "HIT YOUR ARMOR TURNS AWAY,",
        `AGAINST THE HORDE HERE (LEVEL ${Math.round(mobLevel)}).`,
        "IT FALLS AS THEY OUTLEVEL",
        "YOUR WARDROBE.",
      ],
    },
    row(
      "dodge",
      "DODGE",
      state,
      playerDodgeChance,
      percent,
      [
        "CHANCE TO SLIP AN INCOMING",
        "BLOW ENTIRELY AND TAKE",
        "NOTHING FROM IT.",
      ],
      DEFENSE,
    ),
  ];

  const body: StatReadout[] = [
    row(
      "sprint",
      "SPRINT",
      state,
      computeMaxStamina,
      formatCompact,
      [
        "THE SIZE OF THE SPRINT POOL.",
        "HOLDING SPRINT DRAINS IT;",
        "EMPTY, YOU ARE LOCKED OUT",
        "UNTIL IT RECOVERS.",
      ],
      BODY,
    ),
    row(
      "regen",
      "REGEN",
      state,
      staminaRegenPerSec,
      (n) => `${n.toFixed(1)}/S`,
      ["HOW MUCH SPRINT COMES BACK", "EACH SECOND YOU ARE NOT", "SPENDING IT."],
      BODY,
    ),
    // PACE is quoted against the hero's OWN unburdened walk, not against raw
    // `PLAYER.speed`: the developer BALANCE levers (`tempo`, `playerSpeed`)
    // multiply into `playerSpeed` too, so dividing by the bare config figure
    // reports the tuning knob's setting as if the hero were slow. Dividing them
    // back out leaves exactly what the BUILD did — the strength burden, the
    // mobility talents, a running power — which is the thing worth printing.
    row(
      "pace",
      "PACE",
      state,
      (s) => {
        const balance = getBalanceTuning();
        return (
          playerSpeed(s, localHero(s)) /
          (PLAYER.speed * balance.tempo * balance.playerSpeed)
        );
      },
      percent,
      [
        "YOUR WALKING SPEED AGAINST",
        "AN UNBURDENED HERO'S. HEAVY",
        "ARMOR SLOWS YOU; TALENTS AND",
        "POWERS SPEED YOU UP.",
      ],
      BODY,
    ),
  ];

  return [
    { title: "ATTRIBUTES", rows: attributes },
    { title: "OFFENSE", rows: offense },
    { title: "DEFENSE", rows: defense },
    { title: "BODY", rows: body },
  ];
}
