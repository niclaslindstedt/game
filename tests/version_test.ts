// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { engineVersion } from "../src/version.ts";

describe("engine version", () => {
  it("matches package.json (kept in sync by scripts/update-versions.sh)", () => {
    const pkg = JSON.parse(
      readFileSync(new URL("../package.json", import.meta.url), "utf8"),
    ) as { version: string };
    expect(engineVersion).toBe(pkg.version);
  });
});
