// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Windowing for the dialogue box's tap-to-scroll: long, wrapped speeches are
// cut into fixed-size screens the player pages through. These lock the paging
// arithmetic (screen count, order, the always-one-screen guarantee) that the
// overlay's advance/scroll logic depends on.

import { describe, expect, it } from "vitest";

import { paginateLines } from "@ui/lib/text-pager.ts";

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
