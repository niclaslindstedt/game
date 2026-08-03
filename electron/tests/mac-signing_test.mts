// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE macOS BUILD IS NEVER UNSIGNED.
//
// Apple Silicon refuses to EXECUTE unsigned arm64 code — not "warns about it",
// refuses — and reports the refusal to the player as "the app is damaged and
// can't be opened". That is indistinguishable from a corrupt download, which is
// how a shipped arm64 release once read as a broken zip for a week while the
// x86_64 slice ran fine under Rosetta and hid the fault.
//
// Nothing here can run `codesign` (no macOS on CI's Linux runners, and no
// packaged app in a unit test), so what is pinned is the DECISION the packaging
// config makes: which identity the mac build is handed, and that the ad-hoc
// path carries the two settings `codesign` refuses to work without. The
// config's own env reads happen at require time, so each case re-requires it
// with a fresh environment.

import { createRequire } from "node:module";
import { afterEach, describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const CONFIG = require.resolve("../electron-builder.config.cjs");

/** Every variable the mac signing decision reads, so one case cannot leak into
 * the next through the ambient environment of whoever runs the suite. */
const SIGNING_VARS = [
  "GIS_MAC_IDENTITY",
  "CSC_LINK",
  "CSC_NAME",
  "GIS_PACKAGE_PROFILE",
] as const;

const saved = new Map<string, string | undefined>(
  SIGNING_VARS.map((name) => [name, process.env[name]]),
);

/** Load the packaging config under an exact environment. */
function packagingConfig(env: Record<string, string | undefined>) {
  for (const name of SIGNING_VARS) {
    const value = env[name];
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
  delete require.cache[CONFIG];
  return require(CONFIG);
}

afterEach(() => {
  for (const [name, value] of saved) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
  delete require.cache[CONFIG];
});

describe("the macOS signing identity", () => {
  it("signs ad hoc when no certificate is provided", () => {
    const { mac } = packagingConfig({});
    expect(mac.identity).toBe("-");
  });

  it("never leaves the identity unset, which is what ships a dead arm64 app", () => {
    for (const profile of [undefined, "standalone"]) {
      const { mac } = packagingConfig({ GIS_PACKAGE_PROFILE: profile });
      expect(mac.identity).toBeTruthy();
    }
  });

  it("asks for no timestamp on the ad-hoc path — codesign refuses one", () => {
    const { mac } = packagingConfig({});
    expect(mac.timestamp).toBe("none");
    // An ad-hoc signature can never satisfy the notary, so the attempt is
    // switched off rather than left to fail at the end of a long build.
    expect(mac.notarize).toBe(false);
  });

  it("uses the Developer ID name when one is named", () => {
    const { mac } = packagingConfig({ GIS_MAC_IDENTITY: "Some Developer" });
    expect(mac.identity).toBe("Some Developer");
    // A real certificate CAN be timestamped, and notarization requires it.
    expect(mac.timestamp).toBeUndefined();
    expect(mac.notarize).toBeUndefined();
  });

  it("lets a certificate file discover its own identity", () => {
    // With CSC_LINK set, electron-builder imports the .p12 and finds the
    // identity in it. Pinning `identity: "-"` there would sign the release
    // ad hoc while a perfectly good certificate sat in the keychain.
    const { mac } = packagingConfig({ CSC_LINK: "/tmp/developer-id.p12" });
    expect(mac.identity).toBeUndefined();
    expect(mac.notarize).toBeUndefined();
  });

  it("keeps the hardened runtime and its entitlements on every path", () => {
    // Ad-hoc signing WITH the hardened runtime and WITHOUT
    // `disable-library-validation` launches to a dyld failure the moment
    // steamworks.js' addon is loaded — the entitlements file carries it.
    for (const env of [{}, { GIS_MAC_IDENTITY: "Some Developer" }]) {
      const { mac } = packagingConfig(env);
      expect(mac.hardenedRuntime).toBe(true);
      expect(mac.entitlements).toBe("build/entitlements.mac.plist");
      expect(mac.entitlementsInherit).toBe("build/entitlements.mac.plist");
    }
  });
});

describe("what a standalone macOS download contains", () => {
  it("ships a native Apple Silicon slice beside the Intel one", () => {
    const { mac } = packagingConfig({ GIS_PACKAGE_PROFILE: "standalone" });
    expect(mac.target.map((t: { arch: string }) => t.arch)).toEqual([
      "x64",
      "arm64",
    ]);
  });

  it("keeps the arm64 Steam binding in the build that needs it", () => {
    const { mac } = packagingConfig({ GIS_PACKAGE_PROFILE: "standalone" });
    expect(mac.files).not.toContain(
      "!node_modules/steamworks.js/dist/osx/steamworksjs.darwin-arm64.node",
    );
  });
});
