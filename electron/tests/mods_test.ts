// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The mods bridge — chiefly its CONTAINMENT check.
//
// One value crosses from the page INWARD in this whole feature: the `folder` a
// PUBLISH names. Everything else travels outward. So that is the one string
// that turns page-supplied text into a filesystem operation — an upload to a
// public Workshop, no less — and it gets a real test rather than a careful
// comment, exactly like `webroot.ts`'s path check.
//
// `electron`'s `app` is stubbed: these tests run under plain vitest with no
// Electron runtime, which is also the arrangement that keeps the desktop
// check job cheap (no 100 MB binary download in CI).

import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { createModsBridge, localModsDir, type ModsEvent } from "../src/mods";

/** The worked mod in the repo, copied in as the player's own local mod.
 * `__dirname`-relative because this suite compiles to CommonJS. */
const EXAMPLE = join(__dirname, "..", "..", "mod", "examples", "greenhouse");

type InstalledModShape = {
  key: string;
  source: string;
  bundle: unknown;
  errors: string[];
};

let userData: string;

vi.mock("electron", () => ({
  app: {
    getPath: () => userData,
    isPackaged: false,
  },
}));

const temps: string[] = [];

beforeAll(() => {
  userData = mkdtempSync(join(tmpdir(), "gis-userdata-"));
  temps.push(userData);
});

afterAll(() => {
  for (const dir of temps) rmSync(dir, { recursive: true, force: true });
});

describe("the local mods folder", () => {
  it("is created on first look, so the path in the docs exists to be opened", async () => {
    const dir = localModsDir();
    expect(dir).toBe(join(userData, "mods"));
    // Calling it again must not throw on the now-existing directory.
    expect(localModsDir()).toBe(dir);
  });
});

describe("listing", () => {
  const list = (requestId: number) =>
    new Promise<{ mods: InstalledModShape[] }>((resolve) => {
      const bridge = createModsBridge((event: ModsEvent) =>
        resolve(event as unknown as { mods: InstalledModShape[] }),
      );
      bridge.handle({ action: "list", requestId });
    });

  it("compiles a real mod through the real compiler", async () => {
    // The end-to-end shape of the thing: the shell dynamically imports the ESM
    // compiler from outside its own tree, reads the reference catalog, and
    // hands the page compiled JSON. If the paths in resources.ts are wrong, or
    // the .mjs cannot be imported from this CommonJS main process, this is
    // where it shows — not on a player's machine.
    cpSync(EXAMPLE, join(localModsDir(), "greenhouse"), { recursive: true });

    const mod = (await list(1)).mods.find((m) => m.key === "local:greenhouse");
    expect(mod).toBeDefined();
    expect(mod!.errors).toEqual([]);
    expect(mod!.source).toBe("local");
    expect((mod!.bundle as { id: string }).id).toBe("greenhouse");
  });

  it("keeps a mod that did not compile, with its errors", async () => {
    // A subscription that fails to build must still reach the MODS screen —
    // an empty list leaves the player with no way to learn why.
    const broken = join(localModsDir(), "broken");
    mkdirSync(broken, { recursive: true });
    writeFileSync(join(broken, "mod.yaml"), "id: broken\nname: BROKEN\n");

    const mod = (await list(2)).mods.find((m) => m.key === "local:broken");
    expect(mod).toBeDefined();
    expect(mod!.bundle).toBeNull();
    expect(mod!.errors.length).toBeGreaterThan(0);
  });

  it("ignores a directory that is not a mod at all", async () => {
    mkdirSync(join(localModsDir(), "just-some-notes"), { recursive: true });
    const mods = (await list(3)).mods;
    expect(mods.some((m) => m.key === "local:just-some-notes")).toBe(false);
  });
});

describe("publish refuses a folder outside the player's mods directory", () => {
  /** Drive one publish request through the bridge and read the reply. */
  const publish = (folder: string) =>
    new Promise<Record<string, unknown>>((resolve) => {
      const bridge = createModsBridge((event: ModsEvent) =>
        resolve(event as unknown as Record<string, unknown>),
      );
      bridge.handle({ action: "publish", requestId: 1, folder });
    });

  it("a sibling directory whose name merely STARTS with the mods path", async () => {
    // `…/mods-elsewhere` shares a string prefix with `…/mods` and would pass a
    // naive `startsWith`. It must not.
    const sneaky = join(userData, "mods-elsewhere");
    mkdirSync(sneaky, { recursive: true });
    writeFileSync(join(sneaky, "mod.yaml"), "id: sneaky\n");
    const reply = await publish(sneaky);
    expect(reply.ok).toBe(false);
    expect(reply.reason).toBe("not-a-mod");
  });

  it("a traversal back out of the mods directory", async () => {
    const escape = join(userData, "mods", "..", "..");
    const reply = await publish(escape);
    expect(reply.ok).toBe(false);
    expect(reply.reason).toBe("not-a-mod");
  });

  it("an empty folder", async () => {
    const reply = await publish("");
    expect(reply.ok).toBe(false);
    expect(reply.reason).toBe("not-a-mod");
  });

  it("a path inside the mods directory that does not exist", async () => {
    const reply = await publish(join(userData, "mods", "no-such-mod"));
    expect(reply.ok).toBe(false);
    expect(reply.reason).toBe("not-a-mod");
  });
});
