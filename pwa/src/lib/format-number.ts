// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Compact number formatting — shrinks a run's unbounded tallies (XP, damage)
// into short, readable badges so a huge total reads as "2.93Dc", not the raw
// "2.925093758188708e+48" that JS `String()` spits out past ~1e21. Generic
// React/UI game code: lives in pwa/src/lib/ (imported as @ui/lib/*), the
// pool a later game keeps as-is. No DOM, no game types — a
// pure number → string function. Two entry points share one ladder:
// `formatCompact` for open-ended tallies (XP, damage) and `formatCoins` for
// currency, which abbreviates a decade earlier to stay four glyphs wide.

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

/** Below this, `formatCompact` prints the integer as-is (with thousands
 * separators) — a tally under six figures reads fine spelled out. */
const COMPACT_THRESHOLD = 100_000;

/** Below this, `formatCoins` prints the integer as-is: four digits is the
 * widest a coin readout gets before the suffix ladder is tidier (`9,999`, then
 * `10.5K`) — see `formatCoins`. */
const COINS_THRESHOLD = 10_000;

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
  return compact(value, COMPACT_THRESHOLD);
}

/**
 * Format a COIN amount — the same ladder as `formatCompact`, but it starts
 * abbreviating a decade earlier so every purse, price, and coin tally in the
 * game stays at most four glyphs wide:
 *
 * - `< 10,000` → grouped integer, four digits at most (`8,650`, `9,999`).
 * - above that → 3 significant figures on the suffix ladder (`10.5K`, `105K`,
 *   `10.5M`) — never wider, however rich the hero gets.
 *
 * Coins get their own threshold because they read in tight spots a kill count
 * never does (the HUD's 8rem minimap column, a shop button's face), and because
 * a purse is the one tally that grows without bound. The exact figure still
 * shows below 10,000 — which is exactly when a draining purse is worth watching
 * digit by digit.
 */
export function formatCoins(value: number): string {
  return compact(value, COINS_THRESHOLD);
}

/** The shared ladder: spell the integer out below `threshold`, else 3
 * significant figures with a short-scale suffix. */
function compact(value: number, threshold: number): string {
  if (!Number.isFinite(value)) return String(value);
  if (value < 0) return `-${compact(-value, threshold)}`;
  if (value < threshold) {
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

/**
 * A LAP TIME — `m:ss.t`, the way a stopwatch reads.
 *
 * Here rather than beside either of its callers because it now has two and they
 * are on opposite sides of the app: the drive's stopwatch publishes it sixty
 * times a second as a HUD binding, and the high-score board prints the finished
 * figure. A second copy of "how many tenths" is exactly how a results card ends
 * up disagreeing with the clock the player was watching.
 *
 * TENTHS AND NOT HUNDREDTHS, and minutes that are not padded. This is a road
 * trip rather than a qualifying lap: the leg runs to something over a minute,
 * the last digit is there so the number is visibly MOVING while the car is, and
 * a leading zero on the minutes would make a 62-second drive look like a lap
 * record.
 */
export function lapClock(ms: number): string {
  const total = Math.max(0, ms) / 1000;
  const minutes = Math.floor(total / 60);
  const seconds = Math.floor(total % 60);
  const tenths = Math.floor((total * 10) % 10);
  return `${minutes}:${String(seconds).padStart(2, "0")}.${tenths}`;
}

/**
 * THE SAME TIME, THE WAY A RANKING BOARD PRINTS IT — `m'ss"hh`.
 *
 * It is `lapClock`'s figure in the arcade's own punctuation: an apostrophe for
 * the minutes, a double quote for the seconds, and the fraction carried to
 * hundredths because a finished time is READ rather than watched — two digits
 * separate two legs a tenth could not, which is the whole job of the column a
 * board ranks on.
 *
 * IT DOES NOT DISAGREE WITH THE CLOCK, which is the rule this pair exists
 * under: both TRUNCATE toward zero off the same millisecond, so the board's
 * figure is the stopwatch's figure with one more digit on the end and never a
 * hundredth that rounds the other way.
 */
export function rallyClock(ms: number): string {
  const total = Math.max(0, ms);
  const minutes = Math.floor(total / 60_000);
  const seconds = Math.floor((total % 60_000) / 1000);
  const hundredths = Math.floor((total % 1000) / 10);
  const pad = (n: number): string => String(n).padStart(2, "0");
  return `${minutes}'${pad(seconds)}"${pad(hundredths)}`;
}
