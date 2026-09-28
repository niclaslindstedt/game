// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// ONE IDENTITY, AND EVERY COPY OF IT HELD TO IT.
//
// `game.config.json` is where the game's name, its storage prefix and its
// public pages are decided; everything that can import it does (the build, the
// manifest, native/app.config.js, the listing generator, the icons). A few
// surfaces cannot — a Tauri config file, a Rust constant, a fastlane Appfile,
// the development bundle id every shell falls back to — so they RESTATE it,
// and a restatement is a copy that drifts the day somebody renames the game in
// one place. This suite compares each of them with the source.

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const ROOT = join(import.meta.dirname, "..");
const read = (path: string) => readFileSync(join(ROOT, path), "utf8");

const identity = JSON.parse(read("game.config.json")) as {
  title: string;
  storagePrefix: string;
};
const tauriConf = JSON.parse(read("tauri/src-tauri/tauri.conf.json")) as {
  productName: string;
  identifier: string;
};
const appConfig = read("native/app.config.js");
const devBundleId = appConfig.match(/const DEV_BUNDLE_ID = "([^"]+)";/)?.[1];

describe("the game's name", () => {
  it("is the desktop window's title", () => {
    expect(read("tauri/shell/src/config.rs")).toContain(
      `pub const WINDOW_TITLE: &str = "${identity.title}";`,
    );
  });

  it("is the desktop package's product name, less what a file name cannot carry", () => {
    expect(tauriConf.productName).toBe(identity.title.replace(/'/g, ""));
  });
});

describe("the development bundle id", () => {
  it("is one id across the phone app, its fastlane lane and the desktop package", () => {
    expect(devBundleId).toMatch(/^dev\.local\.[a-z]+$/);
    expect(read("native/fastlane/Appfile")).toContain(
      `app_identifier(ENV["APP_BUNDLE_ID"] || "${devBundleId}")`,
    );
    expect(tauriConf.identifier).toBe(devBundleId);
  });

  it("is only ever a fallback: the store id arrives as APP_BUNDLE_ID", () => {
    expect(appConfig).toMatch(
      /const BUNDLE_ID = process\.env\.APP_BUNDLE_ID\?\.trim\(\) \|\| DEV_BUNDLE_ID;/,
    );
  });

  it("never ships: a production build refuses to start without its identity", () => {
    const guard = appConfig.match(
      /if \(process\.env\.EAS_BUILD_PROFILE === "production"\) \{\s*for \(const key of \[([^\]]*)\]\)/,
    );
    expect(guard?.[1]).toContain('"APP_BUNDLE_ID"');
    expect(guard?.[1]).toContain('"EAS_PROJECT_ID"');
  });
});

describe("the game's slug", () => {
  it("is the Expo slug and the storage prefix", () => {
    expect(appConfig).toMatch(
      new RegExp(`^\\s*slug: "${identity.storagePrefix}",$`, "m"),
    );
  });

  it("names the game's pages on the apps site, wherever they are restated", () => {
    const pages = `https://apps.agilator.se/${identity.storagePrefix}`;
    expect(read("scripts/generate-store-metadata.mjs")).toContain(
      `const APPS_PAGE = "${pages}";`,
    );
    expect(read("pwa/src/PrivacyPage.tsx")).toContain(`"${pages}/privacy/"`);
    expect(read("native/store/listing.mts")).toContain(`"${pages}/support/"`);
  });
});
