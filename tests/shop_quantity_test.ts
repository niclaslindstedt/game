// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE COUNTER'S QUANTITY FIELD CANNOT HOLD A NUMBER THE COUNTER WOULD REFUSE.
//
// That is the whole reason the stall's stacked rows lost their second button:
// BUY and BUY ALL offered exactly two of the numbers a player might want, and a
// field offers all of them — but only if a typed value is pulled back into range
// as it is typed, rather than accepted and then met by a dimmed button. These
// pin the clamp itself, which is the only part of the field that is arithmetic
// rather than markup.

import { describe, expect, it } from "vitest";

import { clampQtyText, qtyOfText } from "../pwa/src/game/shop-quantity.ts";

describe("clampQtyText", () => {
  it("keeps a number the counter can honour", () => {
    expect(clampQtyText("3", 5)).toBe("3");
    expect(clampQtyText("5", 5)).toBe("5");
  });

  it("pulls a too-high number down to what is actually available", () => {
    expect(clampQtyText("9", 3)).toBe("3");
    expect(clampQtyText("100", 7)).toBe("7");
  });

  it("reads an emptied field as 1 — the button beside it always has a price", () => {
    expect(clampQtyText("", 5)).toBe("1");
    expect(clampQtyText("0", 5)).toBe("1");
  });

  it("ignores anything that is not a digit", () => {
    expect(clampQtyText("2x", 5)).toBe("2");
    expect(clampQtyText("-4", 5)).toBe("4");
    expect(clampQtyText("abc", 5)).toBe("1");
  });

  it("floors the ceiling at 1, so a field on screen always offers a purchase", () => {
    expect(clampQtyText("4", 0)).toBe("1");
    expect(clampQtyText("4", -2)).toBe("1");
  });

  it("survives a pile that shrinks under a field already showing the old number", () => {
    // The card stays up after a purchase, so the same text is re-clamped
    // against the smaller pile on the very next render.
    expect(clampQtyText(clampQtyText("5", 5), 2)).toBe("2");
  });
});

describe("qtyOfText", () => {
  it("reads the clamped text back as the number the button charges for", () => {
    expect(qtyOfText("4")).toBe(4);
    expect(qtyOfText("1")).toBe(1);
  });

  it("never returns something that would price a purchase at nothing", () => {
    expect(qtyOfText("")).toBe(1);
    expect(qtyOfText("0")).toBe(1);
    expect(qtyOfText("nope")).toBe(1);
  });
});
