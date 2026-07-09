// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Compact number formatting — shrinks a run's unbounded tallies (XP, damage)
// into short, readable badges so a huge total reads as "2.93Dc", not the raw
// "2.925093758188708e+48" that JS `String()` spits out past ~1e21. Generic
// React/UI game code: lives in website/src/lib/ (imported as @ui/lib/*) so it
// can be extracted into oss-framework once mature. No DOM, no game types — a
// pure number → string function.

/**
 * Short-scale suffix ladder. Index i covers 10^(3·(i+1)): K = 10^3, M = 10^6,
 * B = 10^9, T = 10^12, then two-letter names for the higher decades so the
 * pixel font still renders them tightly. The ladder tops out at 10^36; beyond
 * that `formatCompact` falls back to scientific notation, which stays exact
 * where names would just be noise.
 */
const SUFFIXES = [
  "K", // thousand      10^3
  "M", // million       10^6
  "B", // billion       10^9
  "T", // trillion      10^12
  "Qa", // quadrillion  10^15
  "Qi", // quintillion  10^18
  "Sx", // sextillion   10^21
  "Sp", // septillion   10^24
  "Oc", // octillion    10^27
  "No", // nonillion    10^30
  "Dc", // decillion    10^33
] as const;

/** Below this, print the integer as-is (with thousands separators). */
const COMPACT_THRESHOLD = 100_000;

/**
 * Format a number for a HUD/scoreboard badge.
 *
 * - `< 100,000` → grouped integer (`12,450`) — small tallies stay exact and
 *   legible, the way players expect to read a kill or item count.
 * - up to `10^36` → `<mantissa><suffix>` with 3 significant figures
 *   (`145K`, `2.9M`, `2.93Dc`) — the mantissa carries at most two decimals and
 *   trailing zeros are trimmed (`1.20M` → `1.2M`, `1.00M` → `1M`).
 * - beyond the ladder → scientific notation (`2.93e48`), because no suffix is
 *   more informative than the exponent at that scale.
 *
 * Negatives keep their sign; `NaN`/`Infinity` pass through as `String()` would.
 */
export function formatCompact(value: number): string {
  if (!Number.isFinite(value)) return String(value);
  if (value < 0) return `-${formatCompact(-value)}`;
  if (value < COMPACT_THRESHOLD) {
    return Math.round(value).toLocaleString("en-US");
  }

  // Which decade-triple are we in? tier 1 → K, tier 2 → M, …
  let tier = Math.floor(Math.log10(value) / 3);
  let mantissa = trimMantissa(value / 10 ** (tier * 3));
  // Rounding the mantissa can push it to 1000 at a decade boundary
  // (999,999 → "1000K"); promote to the next tier so it reads "1M".
  if (mantissa === "1000") {
    tier += 1;
    mantissa = "1";
  }
  if (tier > SUFFIXES.length) {
    // Past the ladder: 2.93e48. toExponential(2) gives "2.93e+48"; trim the
    // mantissa's trailing zeros and drop the "+" for a tighter badge.
    const [m = "", exp = ""] = value.toExponential(2).split("e");
    return `${stripZeros(m)}e${exp.replace("+", "")}`;
  }
  return `${mantissa}${SUFFIXES[tier - 1]}`;
}

/**
 * Round a 1–999 mantissa to 3 significant figures and strip trailing zeros:
 * 145.0 → "145", 2.925 → "2.93", 1.200 → "1.2", 1.000 → "1".
 */
function trimMantissa(n: number): string {
  const decimals = n >= 100 ? 0 : n >= 10 ? 1 : 2;
  return stripZeros(n.toFixed(decimals));
}

/**
 * Drop trailing zeros in the fractional part of a fixed-point string, then a
 * bare trailing dot: "1.20" → "1.2", "1.00" → "1", "100" → "100" (untouched —
 * only zeros AFTER a decimal point are noise).
 */
function stripZeros(s: string): string {
  return s.replace(/(\.\d*?)0+$/, "$1").replace(/\.$/, "");
}
