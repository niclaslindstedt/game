// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0

import { describe, expect, it } from "vitest";

import { dedicatedArgs } from "../src/dedicated-mode";

describe("the Electron dedicated-server mode", () => {
  it("leaves an ordinary game launch alone", () => {
    expect(dedicatedArgs(["electron", "."])).toBeNull();
  });

  it("passes only server arguments after the mode switch", () => {
    expect(
      dedicatedArgs(["Ada's Trail", "--dedicated", "--bots", "7"]),
    ).toEqual(["--bots", "7"]);
  });
});
