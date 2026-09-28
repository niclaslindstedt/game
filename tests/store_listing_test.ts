// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE STORE LISTING TELLS THE TRUTH ABOUT THE BUILD.
//
// App Review reads the listing's notes and then opens the app, so every claim
// the notes make about the BUILD has to stay true of the tree it is cut from:
// the whole game ships inside the binary and never loads a remote copy, what
// is sold is the coin packs the game really sells (and they are consumables,
// which is why there is no Restore button), nothing is sent to a server we run,
// and the privacy page the listing names is the one the game links. The words
// themselves are not in this repository (native/store/listing.mts explains the
// split), so what is asserted here is the half that is: the rules, the
// committed skeleton, the generator's cross-checks, and the tree the claims
// are about.

import { spawnSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { LISTING } from "../native/store/listing.mts";

const ROOT = join(import.meta.dirname, "..");
const read = (path: string) => readFileSync(join(ROOT, path), "utf8");
const git = (...args: string[]) =>
  spawnSync("git", args, { cwd: ROOT, encoding: "utf8" });

describe("the listing's rules", () => {
  const text = read("native/store/listing.mts");

  it("holds a release for a person to press", () => {
    expect(LISTING.apple.release.automaticRelease).toBe(false);
  });

  it("justifies every age-rating answer that is not NONE, in a comment above it", () => {
    const lines = text.split("\n");
    const unexplained = Object.entries(LISTING.apple.advisory)
      .filter(([, value]) => typeof value === "string" && value !== "NONE")
      .map(([key]) => key)
      .filter((key) => {
        const at = lines.findIndex((line) => line.trim().startsWith(`${key}:`));
        return !lines[at - 1]?.trim().startsWith("//");
      });
    expect(unexplained).toEqual([]);
  });

  it("declares only the storefront this generator writes", () => {
    expect(LISTING.storefronts).toEqual({
      appStore: true,
      macAppStore: false,
      steam: false,
    });
    // Steam is declared once it has a record; until then its ids are empty.
    const steam = JSON.parse(read("tauri/store/steam.json")) as {
      appId: unknown;
    };
    expect(steam.appId).toBeNull();
  });

  it("sends support to the game's page on the apps site, over https", () => {
    expect(LISTING.apple.supportUrl).toBe(
      "https://apps.agilator.se/adas-trail/support/",
    );
  });

  it("commits a placeholder review phone, never a number that rings", () => {
    expect(LISTING.apple.review.phone).toMatch(/0{6,}/);
  });
});

describe("the listing's words are not committed", () => {
  it("keeps copy.mts out of git", () => {
    expect(git("check-ignore", "-q", "native/store/copy.mts").status).toBe(0);
  });

  it("carries no description, subtitle, promo text or keywords in a committed store file", () => {
    const tracked = git("ls-files", "native/store", "tauri/store")
      .stdout.split("\n")
      .filter((f) => /\.(mts|ts|mjs|js|ya?ml)$/.test(f))
      .filter((f) => !f.endsWith("copy.example.mts"));
    const offenders = tracked.filter((f) =>
      /^\s*(description|subtitle|keywords|promoText|promotionalText)\s*:\s*["'`|>[]/im.test(
        read(f),
      ),
    );
    expect(offenders).toEqual([]);
  });
});

describe("the claims the review notes make about the build", () => {
  it("compiles, and passes every limit and cross-check, from whichever copy is present", () => {
    const run = spawnSync(
      process.execPath,
      ["scripts/generate-store-metadata.mjs", "--check"],
      {
        cwd: ROOT,
        encoding: "utf8",
        env: { ...process.env, APP_BUNDLE_ID: "" },
      },
    );
    expect(run.stderr + run.stdout).toMatch(/listing is valid/);
    expect(run.status).toBe(0);
  });

  it("ships the whole game inside the binary and loads no remote copy", () => {
    expect(read("native/scripts/bundle-web.mjs")).toMatch(
      /join\(APP_DIR, "assets", "webroot\.zip"\)/,
    );
    expect(read("native/src/local-server.ts")).toMatch(
      /require\("\.\.\/assets\/webroot\.zip"\)/,
    );
    // The override that points the WebView at a deployed slot is a debug
    // switch: no profile sets it, and the config hands the shell no URL.
    expect(read("native/eas.json")).not.toMatch(/EXPO_PUBLIC_GAME_URL/);
    expect(read("native/app.config.js")).not.toMatch(/^\s*gameUrl\s*:/m);
  });

  it("sells coin packs, and only as consumables — so there is nothing to restore", () => {
    const skus = [
      ...read("pwa/src/game/store.ts").matchAll(/sku:\s*"([^"]+)"/g),
    ].map((m) => m[1]);
    expect(skus.length).toBeGreaterThan(0);
    expect(skus.every((sku) => sku?.startsWith("coins_"))).toBe(true);
    expect(read("native/src/store-purchases.ts")).toMatch(/isConsumable: true/);
    // The committed skeleton names the same range the generator demands of
    // the real notes, so a fresh clone's listing compiles.
    const skeleton = read("native/store/copy.example.mts");
    expect(skeleton).toContain(skus[0]);
    expect(skeleton).toContain(skus.at(-1));
  });

  it("sends nothing to a server we run: no analytics or crash reporting in the phone app", () => {
    const pkg = JSON.parse(read("native/package.json")) as {
      dependencies?: Record<string, string>;
    };
    const tracking = Object.keys(pkg.dependencies ?? {}).filter((name) =>
      /sentry|analytics|firebase|bugsnag|amplitude|mixpanel|posthog|segment|datadog|crash/i.test(
        name,
      ),
    );
    expect(tracking).toEqual([]);
  });

  it("names the privacy page the game itself links", () => {
    const policy = "https://apps.agilator.se/adas-trail/privacy/";
    expect(read("pwa/src/PrivacyPage.tsx")).toContain(`"${policy}"`);
    expect(read("scripts/generate-store-metadata.mjs")).toContain(
      'const APPS_PAGE = "https://apps.agilator.se/adas-trail";',
    );
    expect(read("native/store/copy.example.mts")).toContain(policy);
  });
});

describe("the store directory", () => {
  it("holds no copy module but the skeleton in git", () => {
    const tracked = readdirSync(join(ROOT, "native/store")).filter(
      (f) =>
        f.startsWith("copy") &&
        git("ls-files", "--error-unmatch", `native/store/${f}`).status === 0,
    );
    expect(tracked).toEqual(["copy.example.mts"]);
  });
});
