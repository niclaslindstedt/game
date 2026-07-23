// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The DEVELOPER → BALANCE menu's knob catalog: the ~10 runtime multipliers a
// developer can turn to probe the game's balance (leveling pace, mob
// strength, loot percentages, …). Each row is a SLIDER whose 0..1 position
// maps — piecewise-exponentially — to a multiplier in [0, 100] where 1 is the
// engine's baseline; the engine applies the value via `setBalanceTuning` (see
// settings.ts). Kept out of TitleScreen.tsx so the menu code only maps over
// data.

import type { BalanceTuning } from "@game/core";
import { clamp, clamp01 } from "@game/lib/vec.ts";

export type BalanceKnob = {
  key: keyof BalanceTuning;
  /** Row label — the current multiplier is appended (e.g. "XP GAIN 2.0×"). */
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
    key: "levelingSlowdown",
    label: "LEVEL SLOWDOWN",
    blurb: "HOW MUCH LONGER A LEVEL TAKES PER DIFFICULTY TIER (25%/TIER)",
  },
  {
    key: "endgameSteepen",
    label: "ENDGAME WALL",
    blurb: "HOW HARD THE CURVE WALLS UP PAST LEVEL 70 (5%/LEVEL)",
  },
  {
    key: "restXp",
    label: "REST XP",
    blurb: "XP SWING FROM A MOB'S LEVEL VS YOURS - BONUS ABOVE, GREY BELOW",
  },
  {
    key: "mobArmor",
    label: "MOB ARMOR",
    blurb:
      "PHYSICAL DAMAGE MOBS SHRUG OFF (MAGIC IGNORES IT) - RISES BY LEVEL & RUNG",
  },
  {
    key: "playerDamage",
    label: "HERO DAMAGE",
    blurb: "EVERY WEAPON'S DAMAGE (READOUTS FOLLOW)",
  },
  {
    key: "knockback",
    label: "KNOCKBACK",
    blurb: "HOW FAR KNOCKBACK WEAPONS SHOVE MOBS BACK",
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
    key: "repairDrops",
    label: "REPAIR DROPS",
    blurb: "SHARE OF DROPS THAT IS A WEAPON REPAIR KIT",
  },
  {
    key: "menaceGain",
    label: "MENACE GAIN",
    blurb: "HOW FAST THE RAMPAGE METER HEATS",
  },
  {
    key: "menaceClearance",
    label: "CLEAR GATE",
    blurb: "HOW FAR YOU MUST OUT-CLEAR SPAWNS TO HEAT MENACE",
  },
];

/** A knob spans 0× (system off) to 100× the shipped tuning; 1× is baseline. */
export const BALANCE_MIN = 0;
export const BALANCE_MAX = 100;

// The slider is exponential so the useful low end gets most of the travel: the
// four quarters of the track cover 0→1, 1→2, 2→10, then 10→100. Each quarter is
// linear within itself; stitched together they bow the curve up toward the top.
const SEGMENTS: readonly (readonly [number, number])[] = [
  [0, 1],
  [1, 2],
  [2, 10],
  [10, 100],
];
const QUARTER = 1 / SEGMENTS.length;

/** Slider position [0,1] → multiplier [0,100] along the four-quarter curve. */
export function sliderToBalance(pos: number): number {
  const p = clamp01(pos);
  const i = Math.min(SEGMENTS.length - 1, Math.floor(p / QUARTER));
  const [lo, hi] = SEGMENTS[i]!;
  const t = (p - i * QUARTER) / QUARTER; // 0..1 within the quarter
  return lo + (hi - lo) * t;
}

/** Multiplier [0,100] → slider position [0,1] — the inverse of the curve. */
export function balanceToSlider(value: number): number {
  const v = clamp(value, BALANCE_MIN, BALANCE_MAX);
  for (let i = 0; i < SEGMENTS.length; i++) {
    const [lo, hi] = SEGMENTS[i]!;
    if (v <= hi) return (i + (v - lo) / (hi - lo)) * QUARTER;
  }
  return 1;
}

/** Snap a raw multiplier to a clean grid — fine at the low end, coarse at the
 * top — so a drag never stores 0.6399999 and readouts stay tidy. */
export function snapBalance(value: number): number {
  const v = clamp(value, BALANCE_MIN, BALANCE_MAX);
  if (v < 1) return Math.round(v * 100) / 100; // 0.01 steps
  if (v < 2) return Math.round(v * 20) / 20; // 0.05 steps
  if (v < 10) return Math.round(v * 10) / 10; // 0.1 steps
  return Math.round(v); // whole ×
}

/** Slider position [0,1] → snapped multiplier — the value a drag/tap commits. */
export function balanceFromSlider(pos: number): number {
  return snapBalance(sliderToBalance(pos));
}

/** One keyboard nudge (±) along the slider — a hundredth of the track, then
 * snapped, so a single arrow always changes the value. */
export function nudgeBalance(value: number, dir: number): number {
  const pos = balanceToSlider(value) + dir / 100;
  const next = balanceFromSlider(pos);
  // Guarantee forward motion past a snap boundary the small nudge didn't clear.
  if (next === snapBalance(value) && dir !== 0) {
    return balanceFromSlider(pos + dir / 100);
  }
  return next;
}

/** "0.50×" / "1.0×" / "100×" — the multiplier readout (never a percentage;
 * 1× is the shipped baseline). The "×" glyph lives in the pixel font
 * (asset-tools/font.mjs). */
export function formatBalanceMult(value: number): string {
  if (value >= 10) return `${Math.round(value)}×`;
  if (value >= 1) return `${value.toFixed(1)}×`;
  return `${value.toFixed(2)}×`;
}
