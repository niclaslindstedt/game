// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The Steam upload's pure half: VDF escaping, id validation, and the
// developer-build detector.
//
// Each of these guards something that fails SILENTLY or expensively. An
// unescaped Windows path uploads the wrong content; a placeholder app id
// uploads to Valve's shared test app; a missed developer chunk ships the hidden
// developer menu to every buyer. None of them need steamcmd to check.

import { describe, expect, it } from "vitest";

import {
  buildAppVdf,
  escapeVdf,
  looksLikeDeveloperBuild,
  PLATFORM_DIRS,
  SPACEWAR_APP_ID,
  validateIds,
} from "../scripts/steam-vdf.mjs";

describe("escapeVdf", () => {
  it("escapes backslashes so a Windows path survives", () => {
    // The real hazard: VDF treats `\` as an escape, so an unescaped
    // `C:\release\win-unpacked` becomes `C:releasewin-unpacked` and steamcmd
    // uploads nothing — or something else entirely.
    expect(escapeVdf("C:\\release\\win-unpacked")).toBe(
      "C:\\\\release\\\\win-unpacked",
    );
  });

  it("escapes quotes so a value cannot break out of its own string", () => {
    expect(escapeVdf('a "quoted" thing')).toBe('a \\"quoted\\" thing');
  });

  it("leaves an ordinary POSIX path alone", () => {
    expect(escapeVdf("/home/me/release/linux-unpacked")).toBe(
      "/home/me/release/linux-unpacked",
    );
  });
});

describe("validateIds", () => {
  const good = { appId: 1234560, depots: { windows: 1234561 } };

  it("accepts a filled-in configuration", () => {
    expect(validateIds(good, "windows")).toEqual([]);
  });

  it("refuses the shipped placeholder", () => {
    const problems = validateIds(
      { appId: null, depots: { windows: null } },
      "windows",
    );
    expect(problems).toHaveLength(2);
    expect(problems.join(" ")).toMatch(/appId is not set/);
    expect(problems.join(" ")).toMatch(/depots\.windows is not set/);
  });

  it("refuses Valve's shared test app", () => {
    // Uploading to 480 is uploading to a sandbox every developer shares.
    const problems = validateIds(
      { appId: SPACEWAR_APP_ID, depots: { windows: 1 } },
      "windows",
    );
    expect(problems.join(" ")).toMatch(/Spacewar/);
  });

  it("refuses a non-integer id", () => {
    expect(
      validateIds({ appId: 1.5, depots: { windows: 2 } }, "windows"),
    ).toHaveLength(1);
    expect(
      validateIds({ appId: 10, depots: { windows: -3 } }, "windows"),
    ).toHaveLength(1);
  });

  it("reports EVERY problem at once", () => {
    // One missing id per multi-minute upload is how this becomes an afternoon.
    expect(validateIds({}, "macos").length).toBeGreaterThan(1);
  });

  it("checks the depot for the platform being uploaded", () => {
    // A windows depot says nothing about whether macos has one.
    expect(validateIds(good, "macos").join(" ")).toMatch(/depots\.macos/);
  });
});

describe("looksLikeDeveloperBuild", () => {
  it("spots the developer-only chunks", () => {
    // These exist only when `__DEV_TOOLS__` compiled in — verified against a
    // real build: with it off, Rollup drops them entirely.
    expect(looksLikeDeveloperBuild(["ArsenalScreen-xWUDn03y.js"])).toBe(true);
    expect(looksLikeDeveloperBuild(["EffectsGallery-mxG6AL2j.js"])).toBe(true);
  });

  it("passes a store build", () => {
    expect(
      looksLikeDeveloperBuild([
        "index-CZ2AnXbR.js",
        "GameScreen-Sdvcp-Yc.js",
        "sfx-daGREoUZ.js",
      ]),
    ).toBe(false);
  });

  it("does not match a name that merely contains the word", () => {
    // Matched on the chunk PREFIX, so an unrelated asset can't trip it.
    expect(looksLikeDeveloperBuild(["icons/NotAnArsenalScreen.png"])).toBe(
      false,
    );
  });
});

describe("buildAppVdf", () => {
  const vdf = buildAppVdf({
    appId: 1234560,
    depotId: 1234561,
    contentRoot: "C:\\build\\win-unpacked",
    outputDir: "C:\\build\\out",
    description: "Ada's Trail 1.0.0 (windows)",
  });

  it("names the app and the depot", () => {
    expect(vdf).toContain('"appid"\t"1234560"');
    expect(vdf).toContain('"1234561"');
  });

  it("escapes the paths it was given", () => {
    expect(vdf).toContain("C:\\\\build\\\\win-unpacked");
  });

  it("does NOT set a build live by default", () => {
    // Uploading and going live are different decisions. A script that did both
    // means one mistyped command ships to every player.
    expect(vdf).toContain('"setlive"\t""');
  });

  it("sets a branch live only when explicitly asked", () => {
    const branched = buildAppVdf({
      appId: 1,
      depotId: 2,
      contentRoot: "/a",
      outputDir: "/b",
      description: "d",
      branch: "beta",
    });
    expect(branched).toContain('"setlive"\t"beta"');
  });

  it("excludes debug artifacts from the depot", () => {
    expect(vdf).toContain('"FileExclusion"\t"*.pdb"');
    expect(vdf).toContain('"FileExclusion"\t"*.map"');
  });

  it("is balanced VDF", () => {
    const opens = (vdf.match(/\{/g) ?? []).length;
    const closes = (vdf.match(/\}/g) ?? []).length;
    expect(opens).toBe(closes);
    expect(opens).toBeGreaterThan(0);
  });
});

describe("PLATFORM_DIRS", () => {
  it("covers the three platforms electron-builder produces", () => {
    expect(Object.keys(PLATFORM_DIRS).sort()).toEqual([
      "linux",
      "macos",
      "windows",
    ]);
  });
});
