// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE STATIC TAURI CONFIG MAY NOT NAME A BUILD OUTPUT.
//
// `tauri.conf.json` is the half of the bundle's shape that is the SAME for
// every build; `tauri/scripts/package.mjs` computes the rest and hands it over
// as a `--config` patch. A path under `target/` belongs to the second half
// without exception, because it depends on two things the file cannot know:
// the PROFILE (`debug` for a dev run, `release` for a package) and the TARGET
// (`--target aarch64-apple-darwin` moves the whole directory).
//
// It fails LOUDLY and in the wrong place. `tauri_build::build()` resolves
// `bundle.macOS.frameworks` at COMPILE time on macOS and returns
// `Library not found: <path>` for an entry that is not there — so a release
// path in the static config took down every debug build on a fresh macOS
// checkout (`npm run tauri`, `npm run tauri:lint`), with an error naming a
// library nobody had asked for. Neither `make tauri-test` nor `make tauri-lint`
// catches it from Linux: the frameworks branch is darwin-only.
//
// So the rule is checked here, from the root suite, on every platform: nothing
// static points into `target/`.

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const CONFIG = path.join(ROOT, "tauri", "src-tauri", "tauri.conf.json");

/** Every string in the config, each with the dotted path it was read from. */
function strings(value: unknown, at = ""): { at: string; value: string }[] {
  if (typeof value === "string") return [{ at, value }];
  if (Array.isArray(value))
    return value.flatMap((entry, index) => strings(entry, `${at}[${index}]`));
  if (value && typeof value === "object")
    return Object.entries(value).flatMap(([key, entry]) =>
      strings(entry, at ? `${at}.${key}` : key),
    );
  return [];
}

describe("the static Tauri config", () => {
  const config: unknown = JSON.parse(readFileSync(CONFIG, "utf8"));

  it("names no path inside the Cargo target directory", () => {
    const offenders = strings(config)
      .filter(({ value }) => /(^|\/)target\//.test(value))
      .map(({ at, value }) => `${at}: ${value}`);
    expect(
      offenders,
      "a path under target/ depends on the build profile and the target " +
        "triple, so it belongs in scripts/package.mjs' --config patch — see " +
        "src-tauri/build.rs for the failure a static one causes",
    ).toEqual([]);
  });

  it("leaves macOS frameworks to the packaging script", () => {
    const macOS = (config as { bundle?: { macOS?: Record<string, unknown> } })
      .bundle?.macOS;
    expect(macOS, "bundle.macOS should still be configured").toBeTruthy();
    expect(macOS).not.toHaveProperty("frameworks");
  });
});
