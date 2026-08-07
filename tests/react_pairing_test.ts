// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// REACT AND REACT-DOM ARE ONE DEPENDENCY WEARING TWO NAMES.
//
// React 19 checks the two packages' versions against each other when the DOM
// renderer is evaluated and THROWS if they disagree (`Minified React error
// #527`). That throw happens while `main.tsx` is still being evaluated — before
// `createRoot`, before the first render — so the app does not mount at all. The
// page keeps the prerendered boot shell (`.prelaunch` in index.html) on screen,
// which reads as a game frozen at "BOOTING…" rather than as an error, forever.
//
// This shipped: a dependency bump moved `react` to ^19.2.8 and left `react-dom`
// at ^19.0.0, which resolved to 19.2.7. Nothing caught it. npm does not, because
// react-dom 19.2.7's peer range (`react: ^19.2.7`) is SATISFIED by react 19.2.8
// — the constraint runs one way and the runtime check runs both. TypeScript does
// not, because the versions are identical to the type system. And the test
// suite did not, because nothing in it evaluates react-dom against react.
//
// So the pairing is asserted here, on the resolved lockfile versions rather than
// the declared ranges: two compatible-looking ranges are exactly what produced
// the outage, and what the browser loads is what npm resolved.

import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

type Lock = { packages?: Record<string, { version?: string }> };

const lock = JSON.parse(
  readFileSync(new URL("../package-lock.json", import.meta.url), "utf8"),
) as Lock;

function resolvedVersion(name: string): string {
  const version = lock.packages?.[`node_modules/${name}`]?.version;
  expect(version, `${name} missing from package-lock.json`).toBeTypeOf("string");
  return version as string;
}

describe("react / react-dom pairing", () => {
  it("resolves both to the exact same version", () => {
    // Exact, not semver-compatible: React's own check is an equality check.
    expect(resolvedVersion("react-dom")).toBe(resolvedVersion("react"));
  });

  it("declares ranges that can only ever resolve together", () => {
    // The lockfile is agreement about TODAY. The ranges are what the next
    // `npm update` — or a fresh install against a newer registry — is free to
    // move, and they drifted apart silently once already.
    const pkg = JSON.parse(
      readFileSync(new URL("../pwa/package.json", import.meta.url), "utf8"),
    ) as { dependencies: Record<string, string> };
    expect(pkg.dependencies["react-dom"]).toBe(pkg.dependencies.react);
  });
});
