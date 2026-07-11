// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The DEVELOPER → BALANCE menu's knob catalog: the ~10 runtime multipliers a
// developer can turn to probe the game's balance (leveling pace, mob
// strength, loot percentages, …). Each row cycles through BALANCE_STEPS —
// the menu idiom the volume rows established — and the engine applies the
// value via `setBalanceTuning` (see settings.ts). Kept out of TitleScreen.tsx
// so the menu code only maps over data.

import type { BalanceTuning } from "@game/core";

export type BalanceKnob = {
  key: keyof BalanceTuning;
  /** Row label — the current multiplier is appended (e.g. "XP GAIN 200%"). */
  label: string;
  /** Selected-row blurb: what the knob scales, in one line. */
  blurb: string;
};

/** The menu's knobs, in display order. Deliberately around ten — the single
 * most useful lever of each system, not a config editor. */
export const BALANCE_KNOBS: BalanceKnob[] = [
  {
    key: "xpGain",
    label: "XP GAIN",
    blurb: "ALL XP FROM KILLS AND ARROWS - LEVELING PACE",
  },
  {
    key: "playerDamage",
    label: "HERO DAMAGE",
    blurb: "EVERY WEAPON'S DAMAGE (READOUTS FOLLOW)",
  },
  {
    key: "mobHp",
    label: "MOB HP",
    blurb: "MONSTER HEALTH AT SPAWN - XP PAYS OUT MORE TOO",
  },
  {
    key: "mobDamage",
    label: "MOB DAMAGE",
    blurb: "MONSTER BLOWS AND SHOTS AGAINST THE HERO",
  },
  {
    key: "hordeSize",
    label: "HORDE SIZE",
    blurb: "THE WAVE SPAWNER'S LIVE FLOOR AND CAP",
  },
  {
    key: "dropRate",
    label: "DROP RATE",
    blurb: "PER-KILL CHANCE A MONSTER DROPS ANYTHING",
  },
  {
    key: "equipmentShare",
    label: "GEAR SHARE",
    blurb: "SHARE OF DROPS THAT IS EQUIPMENT",
  },
  {
    key: "gearQuality",
    label: "GEAR QUALITY",
    blurb: "MAGIC & RARE TIER ODDS ON EQUIPMENT DROPS",
  },
  {
    key: "uniqueDrops",
    label: "UNIQUE DROPS",
    blurb: "BOSS AND WORLD UNIQUE DROP CHANCES",
  },
  {
    key: "menaceGain",
    label: "MENACE GAIN",
    blurb: "HOW FAST THE RAMPAGE METER HEATS",
  },
];

/** The values a row cycles through — quarter strength up to 4×, with 100%
 * (the shipped tuning) in the middle of the walk. */
export const BALANCE_STEPS = [0.25, 0.5, 0.75, 1, 1.5, 2, 3, 4] as const;

/** The next step in the cycle after `value` (nearest step, then one up,
 * wrapping) — so a hand-edited or legacy value still lands on the ladder. */
export function nextBalanceStep(value: number): number {
  let nearest = 0;
  for (let i = 1; i < BALANCE_STEPS.length; i++) {
    const step = BALANCE_STEPS[i] as number;
    if (
      Math.abs(step - value) <
      Math.abs((BALANCE_STEPS[nearest] as number) - value)
    ) {
      nearest = i;
    }
  }
  return BALANCE_STEPS[(nearest + 1) % BALANCE_STEPS.length] as number;
}

/** "75%" / "100%" / "400%" — the row's value readout. */
export const formatBalanceMult = (value: number): string =>
  `${Math.round(value * 100)}%`;
