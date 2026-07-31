// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The character sheet's numbers, as data — the ONE reader of the engine's
// derived stats behind the CHARACTER modal (CharacterSheet.tsx). It is a model
// rather than markup so the sheet stays a layout: adding a figure to the hero's
// page is a row in a group here, and nothing about how it is drawn.
//
// Comparing two pieces of gear is deliberately NOT this module's job. The item
// tooltip already prices a piece against the one it would replace, line by line
// and in green or red, with the worn piece's card beside it (ItemTooltip) —
// which is a better answer than restating four totals somewhere else on the
// screen.

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
  totalArmor,
  weaponDamageRange,
  weaponRangeFor,
  type GameState,
  type StatName,
} from "@game/core";

import { STAT_LABELS } from "@ui/lib/affix-line.ts";
import { formatCompact } from "@ui/lib/format-number.ts";

import { hitRate } from "./ItemCard.tsx";

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
};

export type StatGroup = { title: string; rows: StatReadout[] };

const NEUTRAL = "#e6e8eb";
const OFFENSE = "#7ef0c8";
const DEFENSE = "#7ecbff";
const BODY = "#ffd75e";

/** A row read straight off the state — the shape every row below shares. */
function row(
  key: string,
  label: string,
  state: GameState,
  read: (s: GameState) => number,
  format: (n: number) => string,
  color?: string,
  icon?: string,
): StatReadout {
  return { key, label, value: format(read(state)), color, icon };
}

const whole = (n: number) => String(Math.round(n));
const percent = (n: number) => `${Math.round(n * 100)}%`;

/**
 * The whole sheet, grouped.
 *
 * ARMOR is quoted the way the damage math reads it — the points AND what they
 * turn of the CURRENT horde's blows — so the row decays as the mobs outlevel
 * the wardrobe instead of reading as a number that only ever grows.
 */
export function characterStatGroups(state: GameState): StatGroup[] {
  const attributes: StatReadout[] = (
    Object.keys(STAT_LABELS) as StatName[]
  ).map((stat) =>
    row(
      stat,
      STAT_LABELS[stat],
      state,
      (s) => effectiveStat(s, stat),
      whole,
      NEUTRAL,
      `icon_stat_${stat}`,
    ),
  );

  // The damage RANGE, not the average: the average is what the engine rolls
  // around, and a player sizing up a weapon wants the spread.
  const damage = weaponDamageRange(state, state.players[0].equipment.weapon);
  const offense: StatReadout[] = [
    {
      key: "damage",
      label: "DAMAGE",
      value: `${formatCompact(damage.min)}-${formatCompact(damage.max)}`,
      color: OFFENSE,
    },
    row("crit", "CRIT", state, playerCritChance, percent, OFFENSE),
    row("hit", "HIT", state, hitRate, percent, OFFENSE),
    row("pen", "ARMOR PEN", state, heroArmorPen, percent, OFFENSE),
    // How far the held weapon actually reaches for THIS hero — the stat that
    // decides whether a fight is fought at arm's length or across the room,
    // and the one number a weapon swap changes most visibly.
    row(
      "reach",
      "REACH",
      state,
      (s) => weaponRangeFor(s, s.players[0].equipment.weapon),
      whole,
      OFFENSE,
    ),
  ];

  const mobLevel = currentMobLevel(state);
  const worn = totalArmor(state);
  const defense: StatReadout[] = [
    row("hp", "MAX HP", state, computeMaxHp, formatCompact, DEFENSE),
    {
      key: "armor",
      label: "ARMOR",
      value: `${worn} (-${Math.round(armorReduction(state, mobLevel) * 100)}%)`,
      color: DEFENSE,
    },
    row("dodge", "DODGE", state, playerDodgeChance, percent, DEFENSE),
  ];

  const body: StatReadout[] = [
    row("sprint", "SPRINT", state, computeMaxStamina, formatCompact, BODY),
    row(
      "regen",
      "REGEN",
      state,
      staminaRegenPerSec,
      (n) => `${n.toFixed(1)}/S`,
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
          playerSpeed(s) / (PLAYER.speed * balance.tempo * balance.playerSpeed)
        );
      },
      percent,
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
