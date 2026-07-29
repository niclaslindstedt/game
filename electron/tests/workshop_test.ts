// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The Workshop seam — specifically, that it degrades rather than throws.
//
// Every machine this runs on in development and CI has no Steam client, and so
// does every copy of the game a player launches outside Steam. That is the
// ORDINARY case for this module, not an error case: `steamClient()` answers
// null and the shell must go on to show a game with no mods in it. A throw here
// takes the whole main process down before a window exists.

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";

import { publishMod, subscribedItems } from "../src/workshop";

const temps: string[] = [];
const scratch = () => {
  const dir = mkdtempSync(join(tmpdir(), "gis-workshop-"));
  temps.push(dir);
  return dir;
};

afterAll(() => {
  for (const dir of temps) rmSync(dir, { recursive: true, force: true });
});

describe("without a Steam client", () => {
  it("lists no subscriptions instead of throwing", () => {
    expect(subscribedItems()).toEqual([]);
  });

  it("refuses to publish, with a reason the UI can render", async () => {
    // A folder with no mod.yaml is not a mod; without Steam the no-client
    // answer comes first, because there is nothing to publish TO.
    const result = await publishMod(scratch(), {
      itemId: null,
      title: "X",
      description: "",
      changeNote: "",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("no-steam");
  });
});
