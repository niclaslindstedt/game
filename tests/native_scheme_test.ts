// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE PHONE APP'S URL SCHEME is its bundle id.
//
// A private-use scheme is a name any installed app can claim, so a plain word
// is a name two apps can share; the reverse-DNS bundle id is the one string
// the store already guarantees is ours alone (RFC 8252 §7.1). It arrives with
// APP_BUNDLE_ID like the bundle id itself, so what is asserted is the wiring
// in native/app.config.js rather than a value: evaluating the config needs
// `expo/config-plugins` from native/node_modules, which the root suite does not
// install.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const config = readFileSync(
  join(import.meta.dirname, "..", "native", "app.config.js"),
  "utf8",
)
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/^\s*\/\/.*$/gm, "");

describe("the native URL scheme", () => {
  it("is the bundle id, read from the same constant as bundleIdentifier and package", () => {
    expect(config).toMatch(/^\s*scheme: BUNDLE_ID,$/m);
    expect(config).toMatch(/^\s*bundleIdentifier: BUNDLE_ID,$/m);
    expect(config).toMatch(/^\s*package: BUNDLE_ID,$/m);
  });

  it("is never a committed word", () => {
    expect(config).not.toMatch(/scheme:\s*["'`]/);
  });
});
