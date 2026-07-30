// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Fitting authored speech to the box it lands in: an authored line is flowed
// into the box's measured column (`wrapPage`), and the folded result is cut
// into the screens the player taps through (`paginateLines`). These lock the
// two rules the overlays' advance/scroll logic depends on — that an authored
// break survives the flow, and the paging arithmetic around it.

import { describe, expect, it } from "vitest";

import { paginateLines, wrapPage } from "@ui/lib/text-pager.ts";

describe("paginateLines", () => {
  it("keeps a short page on a single screen", () => {
    expect(paginateLines(["A", "B", "C"], 3)).toEqual([["A", "B", "C"]]);
  });

  it("windows a folded speech into ordered screens", () => {
    expect(paginateLines(["A", "B", "C", "D", "E"], 3)).toEqual([
      ["A", "B", "C"],
      ["D", "E"],
    ]);
  });

  it("splits exactly on the boundary without a trailing empty screen", () => {
    expect(paginateLines(["A", "B", "C", "D"], 2)).toEqual([
      ["A", "B"],
      ["C", "D"],
    ]);
  });

  it("always returns at least one (empty) screen so [0] is safe", () => {
    expect(paginateLines([], 3)).toEqual([[]]);
  });

  it("clamps a non-positive screen size to one row so it cannot stall", () => {
    expect(paginateLines(["A", "B"], 0)).toEqual([["A"], ["B"]]);
  });
});

describe("wrapPage", () => {
  // Stand-in for `PixelFont.wrap` at a four-word column, so the tests read as
  // "what the box did with the author's line" rather than as font arithmetic.
  const wrapEveryFourWords = (text: string): string[] => {
    const words = text.split(" ");
    const rows: string[] = [];
    for (let i = 0; i < words.length; i += 4) {
      rows.push(words.slice(i, i + 4).join(" "));
    }
    return rows.length > 0 ? rows : [text];
  };

  it("flows one authored line into as many rows as the column takes", () => {
    expect(
      wrapPage(["ONE TWO THREE FOUR FIVE SIX"], wrapEveryFourWords),
    ).toEqual(["ONE TWO THREE FOUR", "FIVE SIX"]);
  });

  it("keeps an authored break — it is the one thing the flow must not undo", () => {
    // A second entry is a deliberate held beat (a punchline, a second hand on
    // the same note). Welding the page into one paragraph would silently spend
    // the beat the author bought.
    expect(
      wrapPage(["HANG ON, ADA.", "YEE-HAW, I GUESS."], wrapEveryFourWords),
    ).toEqual(["HANG ON, ADA.", "YEE-HAW, I GUESS."]);
  });

  it("flows each side of a break independently, in order", () => {
    expect(wrapPage(["A B C D E", "F G"], wrapEveryFourWords)).toEqual([
      "A B C D",
      "E",
      "F G",
    ]);
  });

  it("hands back the authored lines untouched before the column is measured", () => {
    // The first layout pass has no width yet; printing the author's own lines
    // reads correctly, where one un-flowed paragraph would run off the box.
    const page = ["ONE TWO THREE FOUR FIVE SIX"];
    expect(wrapPage(page, null)).toEqual(page);
  });

  it("copies rather than aliasing the caller's page", () => {
    // The pages come off the engine's own defs; a returned alias would let a
    // caller's later edit reach back into the catalog.
    const page = ["A"];
    expect(wrapPage(page, null)).not.toBe(page);
  });
});
