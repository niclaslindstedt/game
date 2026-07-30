// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// SETTINGS → DATA holds the two ways a hero leaves this device, and each build
// gets exactly ONE of them (pwa/src/game/title-screen/menus-data.ts):
//
//   web (site or installed PWA)  EXPORT / IMPORT CHARACTER — signed files
//   native (App Store / Play)    CLOUD SAVE — the player's own platform cloud
//
// The native half of that split is what these tests pin. The store app mints
// platform achievements off a hero's progress, so a roster that can be handed
// around as files — or levelled on a desktop and dropped in — would make a
// Game Center board a claim about nobody. Losing the gate is silent: the rows
// still work, they just hand the achievements away.

import { describe, expect, it } from "vitest";

import type { CloudState } from "../pwa/src/game/cloud-save.ts";
import type {
  MenuContext,
  MenuEntry,
} from "../pwa/src/game/title-screen/menu-model.ts";
import { buildDataMenu } from "../pwa/src/game/title-screen/menus-data.ts";

const CLOUD_IDLE: CloudState = {
  phase: "idle",
  available: true,
  lastSyncAt: null,
};

/** A MenuContext with just the fields the DATA screen reads. The rest of the
 * context belongs to other screens, so it is cast away rather than faked. */
function ctxFor(opts: { transferOpen: boolean; cloudOpen: boolean }) {
  return {
    transferOpen: opts.transferOpen,
    cloudOpen: opts.cloudOpen,
    cloudState: CLOUD_IDLE,
    runCloudSync: async () => {},
    beginExportPicker: () => {},
    pickImport: () => {},
    setScreen: () => {},
    setCursor: () => {},
  } as unknown as MenuContext;
}

const arias = (rows: MenuEntry[]) => rows.map((row) => row.aria);
const rowIndexIn = (rows: MenuEntry[], aria: string) =>
  rows.findIndex((row) => row.aria === aria);

describe("SETTINGS → DATA", () => {
  it("offers file transfer on the web, where there is no platform cloud", () => {
    const rows = buildDataMenu(
      ctxFor({ transferOpen: true, cloudOpen: false }),
    );
    expect(arias(rows)).toEqual(["data-export", "data-import", "data-back"]);
  });

  it("offers CLOUD SAVE alone in the store app — no export, no import", () => {
    const rows = buildDataMenu(
      ctxFor({ transferOpen: false, cloudOpen: true }),
    );
    expect(arias(rows)).toEqual(["data-cloud-save", "data-back"]);
  });

  it("never puts a hero on disk in the store app, cloud reachable or not", () => {
    // A native build with the cloud bridge down still gets no file rows: the
    // gate is the BUILD, not whether the cloud happens to answer right now.
    const rows = buildDataMenu(
      ctxFor({ transferOpen: false, cloudOpen: false }),
    );
    expect(arias(rows)).toEqual(["data-back"]);
  });

  it("homes the picker's BACK on the EXPORT row it was opened from", () => {
    // The EXPORT screen's BACK is resolved by ROW ID against the DATA screen as
    // it is built right now (see `backRow`), so it lands on EXPORT whether or
    // not this build also carries the CLOUD SAVE row above it.
    const web = buildDataMenu(ctxFor({ transferOpen: true, cloudOpen: false }));
    expect(rowIndexIn(web, "data-export")).toBe(0);
    const both = buildDataMenu(ctxFor({ transferOpen: true, cloudOpen: true }));
    expect(rowIndexIn(both, "data-export")).toBe(1);
  });
});
