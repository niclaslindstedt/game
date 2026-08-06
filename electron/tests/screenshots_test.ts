// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The desktop SCREENSHOTS bridge — chiefly the two values that cross from the
// page INWARD and become a file on somebody's disk: the NAME and the BYTES.
//
// Everything else in this bridge travels outward. Those two do not, so they get
// a real test rather than a careful comment — the same reasoning `mods_test.ts`
// applies to the one folder a PUBLISH names.
//
// `electron` is stubbed: this tree runs under plain vitest with no Electron
// runtime (see vitest.config.mts), which is also what keeps the desktop check
// job cheap.

import {
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const revealed: string[] = [];
const copied: string[] = [];

vi.mock("electron", () => ({
  clipboard: {
    writeImage: () => copied.push("image"),
  },
  nativeImage: {
    createFromPath: (path: string) => ({ isEmpty: () => !existsSync(path) }),
    createFromBuffer: () => ({ getSize: () => ({ width: 4, height: 2 }) }),
  },
  shell: {
    showItemInFolder: (path: string) => revealed.push(path),
  },
}));

import { createShotsBridge, type ShotsEvent } from "../src/screenshots";

const temps: string[] = [];
let folder = "";

/** A one-pixel PNG, base64 — the smallest thing that survives the magic check. */
const PNG_B64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

function bridge() {
  const events: ShotsEvent[] = [];
  const built = createShotsBridge((event) => events.push(event), {
    folder,
    steamOverlay: true,
  });
  return { events, handle: built.handle };
}

/** Let the bridge's own promise chain settle. */
const settle = () => new Promise((done) => setTimeout(done, 20));

beforeEach(() => {
  folder = join(mkdtempSync(join(tmpdir(), "gis-shots-")), "pictures");
  temps.push(folder);
  revealed.length = 0;
  copied.length = 0;
});

afterAll(() => {
  for (const dir of temps) rmSync(dir, { recursive: true, force: true });
});

describe("what the shell says it can do", () => {
  it("names the folder and reports Steam's own copy", () => {
    const { events, handle } = bridge();
    handle({ action: "status", requestId: 7 });
    expect(events).toEqual([
      {
        event: "status",
        requestId: 7,
        ok: true,
        available: true,
        provider: "steam",
        folder,
        canShare: true,
        steamOverlay: true,
      },
    ]);
  });
});

describe("filing a picture", () => {
  it("writes the PNG under the name the game chose", async () => {
    const { events, handle } = bridge();
    handle({ action: "file", requestId: 1, name: "shot-1.png", png: PNG_B64 });
    await settle();
    expect(events).toEqual([
      {
        event: "file",
        requestId: 1,
        ok: true,
        path: join(folder, "shot-1.png"),
      },
    ]);
    expect(
      readFileSync(join(folder, "shot-1.png")).subarray(1, 4).toString(),
    ).toBe("PNG");
  });

  it("refuses bytes that are not a PNG", async () => {
    // The page is our own code — but this is the one place it hands the shell
    // bytes that become a FILE, so the magic number is checked, not assumed.
    const { events, handle } = bridge();
    handle({
      action: "file",
      requestId: 2,
      name: "nope.png",
      png: Buffer.from("<script>not a png at all</script>").toString("base64"),
    });
    await settle();
    expect(events).toEqual([{ event: "file", requestId: 2, ok: false }]);
    expect(existsSync(folder)).toBe(false);
  });

  it("cannot be walked out of the screenshots folder", async () => {
    const { events, handle } = bridge();
    handle({
      action: "file",
      requestId: 3,
      name: "../../../../etc/owned.png",
      png: PNG_B64,
    });
    await settle();
    const event = events[0] as { ok: boolean; path?: string };
    expect(event.ok).toBe(true);
    // Whatever it was called, it landed INSIDE the folder.
    expect(event.path?.startsWith(folder)).toBe(true);
    expect(readdirSync(folder)).toHaveLength(1);
  });

  it("still writes something for a name with nothing usable in it", async () => {
    const { events, handle } = bridge();
    handle({ action: "file", requestId: 4, name: "///", png: PNG_B64 });
    await settle();
    expect((events[0] as { ok: boolean }).ok).toBe(true);
    expect(readdirSync(folder)).toHaveLength(1);
  });
});

describe("sharing a picture", () => {
  it("copies it and opens the file manager on it", async () => {
    const { events, handle } = bridge();
    handle({ action: "share", requestId: 5, name: "shot-5.png", png: PNG_B64 });
    await settle();
    expect(events).toEqual([{ event: "share", requestId: 5, ok: true }]);
    expect(copied).toEqual(["image"]);
    expect(revealed).toEqual([join(folder, "shot-5.png")]);
  });

  it("reports a failure rather than revealing a file it never wrote", async () => {
    const { events, handle } = bridge();
    handle({ action: "share", requestId: 6, name: "shot-6.png", png: "" });
    await settle();
    expect(events).toEqual([{ event: "share", requestId: 6, ok: false }]);
    expect(revealed).toEqual([]);
  });
});
