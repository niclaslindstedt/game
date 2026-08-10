// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import { describe, expect, it } from "vitest";

import {
  formatCoins,
  formatCompact,
  lapClock,
  rallyClock,
} from "@ui/lib/format-number";

describe("formatCompact", () => {
  it("prints small tallies exactly with thousands separators", () => {
    expect(formatCompact(0)).toBe("0");
    expect(formatCompact(7)).toBe("7");
    expect(formatCompact(999)).toBe("999");
    expect(formatCompact(12_450)).toBe("12,450");
    expect(formatCompact(99_999)).toBe("99,999");
  });

  it("rounds fractional small values to a whole number", () => {
    expect(formatCompact(1.4)).toBe("1");
    expect(formatCompact(1.6)).toBe("2");
  });

  it("abbreviates with a suffix at 100k and above", () => {
    expect(formatCompact(100_000)).toBe("100K");
    expect(formatCompact(145_320)).toBe("145K");
    expect(formatCompact(1_500_000)).toBe("1.5M");
    expect(formatCompact(3_401_880)).toBe("3.4M");
    expect(formatCompact(2_934_000)).toBe("2.93M");
    expect(formatCompact(1_000_000_000)).toBe("1B");
    expect(formatCompact(9_990_000_000_000)).toBe("9.99T");
  });

  it("trims trailing zeros from the mantissa", () => {
    expect(formatCompact(1_200_000)).toBe("1.2M");
    expect(formatCompact(1_000_000)).toBe("1M");
    expect(formatCompact(10_000_000)).toBe("10M");
    expect(formatCompact(100_000_000)).toBe("100M");
  });

  it("promotes a mantissa that rounds up to 1000 into the next tier", () => {
    expect(formatCompact(999_999)).toBe("1M");
    expect(formatCompact(999_999_999)).toBe("1B");
  });

  it("climbs the two-letter ladder for the big decades", () => {
    expect(formatCompact(1e15)).toBe("1Qa");
    expect(formatCompact(1e18)).toBe("1Qi");
    expect(formatCompact(1e21)).toBe("1Sx");
    expect(formatCompact(1e24)).toBe("1Sp");
    expect(formatCompact(1e27)).toBe("1Oc");
    expect(formatCompact(1e30)).toBe("1No");
    expect(formatCompact(1e33)).toBe("1Dc");
  });

  it("falls back to scientific notation past the ladder", () => {
    expect(formatCompact(1e36)).toBe("1e36");
    expect(formatCompact(2.925093758188708e48)).toBe("2.93e48");
  });

  it("keeps the sign on negatives", () => {
    expect(formatCompact(-2_500_000)).toBe("-2.5M");
    expect(formatCompact(-42)).toBe("-42");
  });

  it("passes non-finite values through", () => {
    expect(formatCompact(Number.NaN)).toBe("NaN");
    expect(formatCompact(Number.POSITIVE_INFINITY)).toBe("Infinity");
  });
});

describe("formatCoins", () => {
  it("spells a purse out in full below 10,000 — four digits at most", () => {
    expect(formatCoins(0)).toBe("0");
    expect(formatCoins(650)).toBe("650");
    expect(formatCoins(8_650)).toBe("8,650");
    expect(formatCoins(9_999)).toBe("9,999");
  });

  it("abbreviates from 10,000 up to three significant figures", () => {
    expect(formatCoins(10_000)).toBe("10K");
    expect(formatCoins(10_500)).toBe("10.5K");
    expect(formatCoins(105_000)).toBe("105K");
    expect(formatCoins(10_500_000)).toBe("10.5M");
    expect(formatCoins(1_050_000)).toBe("1.05M");
    expect(formatCoins(2_500_000_000)).toBe("2.5B");
  });

  it("never renders wider than four glyphs plus a suffix", () => {
    // The whole point of the earlier threshold: a HUD coin readout has to fit
    // the 8rem minimap column however rich the hero gets.
    for (const value of [
      9_999, 10_000, 99_999, 100_000, 999_999, 1_000_000, 12_345_678, 9.99e11,
      1e15, 1e33,
    ]) {
      expect(formatCoins(value).replace(/,/g, "").length).toBeLessThanOrEqual(
        6,
      );
    }
  });

  it("shares the compact ladder's edge cases", () => {
    expect(formatCoins(9_999_999)).toBe("10M");
    expect(formatCoins(-10_500)).toBe("-10.5K");
    expect(formatCoins(Number.NaN)).toBe("NaN");
  });
});

describe("rallyClock", () => {
  it("prints a trip the way a ranking board does", () => {
    expect(rallyClock(0)).toBe(`0'00"00`);
    expect(rallyClock(1_234)).toBe(`0'01"23`);
    expect(rallyClock(65_430)).toBe(`1'05"43`);
    expect(rallyClock(205_250)).toBe(`3'25"25`);
    expect(rallyClock(600_000)).toBe(`10'00"00`);
  });

  it("treats a negative clock as a standing start", () => {
    expect(rallyClock(-1)).toBe(`0'00"00`);
  });

  // THE BOARD MAY NOT DISAGREE WITH THE CLOCK THE PLAYER WAS WATCHING. Both
  // truncate off the same millisecond, so the board's figure is always the
  // stopwatch's figure with one more digit on the end — never a hundredth that
  // rounds the seconds the other way.
  it("agrees with the stopwatch it is the finished form of", () => {
    for (let ms = 0; ms < 200_000; ms += 137) {
      const lap = lapClock(ms); // m:ss.t
      const rally = rallyClock(ms); // m'ss"hh
      const [lapMin, lapRest] = lap.split(":");
      const lapSec = lapRest?.slice(0, 2) ?? "";
      const lapTenth = lapRest?.slice(3) ?? "";
      expect(rally.startsWith(`${lapMin}'${lapSec}"${lapTenth}`)).toBe(true);
    }
  });
});
