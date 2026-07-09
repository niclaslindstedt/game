// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import { describe, expect, it } from "vitest";

import { formatCompact } from "@ui/lib/format-number";

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
