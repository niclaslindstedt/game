// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  GITHUB_BODY_LIMIT,
  capBody,
  extractSection,
} from "../scripts/release/extract-section.mjs";

const REPO = "https://github.com/niclaslindstedt/game";

const CHANGELOG = [
  "# Changelog",
  "",
  "## [Unreleased]",
  "",
  "## [1.1.0] - 2026-08-01",
  "",
  "### Added",
  "",
  "- **A thing** — it does something.",
  "",
  "## [1.0.0] - 2026-07-29",
  "",
  "### Fixed",
  "",
  "- **Another thing** — it stopped doing something.",
  "",
].join("\n");

describe("extractSection", () => {
  it("slices one version's section without its heading", () => {
    expect(extractSection(CHANGELOG, "1.1.0")).toBe(
      "### Added\n\n- **A thing** — it does something.",
    );
  });

  it("stops at the next version heading", () => {
    expect(extractSection(CHANGELOG, "1.1.0")).not.toContain("Another thing");
  });

  it("reads the last section to the end of the file", () => {
    expect(extractSection(CHANGELOG, "1.0.0")).toContain("Another thing");
  });

  it("returns null for a version that has no section", () => {
    expect(extractSection(CHANGELOG, "9.9.9")).toBeNull();
  });
});

describe("capBody", () => {
  const long = Array.from(
    { length: 400 },
    (_, i) => `- **Entry ${i}** — ${"x".repeat(400)}`,
  ).join("\n");

  it("leaves a body that already fits untouched", () => {
    const body = "### Added\n\n- **A thing** — it does something.";
    expect(capBody(body, { version: "1.1.0", repoUrl: REPO })).toBe(body);
  });

  // The 422 that left v1.0.0 tagged with no release and no deploy.
  it("holds an over-long body under the limit", () => {
    expect(long.length).toBeGreaterThan(GITHUB_BODY_LIMIT);
    const out = capBody(long, { version: "1.0.0", repoUrl: REPO });
    expect(out.length).toBeLessThanOrEqual(GITHUB_BODY_LIMIT);
  });

  it("points at the full changelog on the release's own tag", () => {
    const out = capBody(long, { version: "1.0.0", repoUrl: REPO });
    expect(out).toContain(`${REPO}/blob/v1.0.0/CHANGELOG.md`);
  });

  it("cuts at a line boundary rather than mid-entry", () => {
    const out = capBody(long, { version: "1.0.0", repoUrl: REPO });
    const kept = out.slice(0, out.indexOf("\n\n---\n"));
    for (const line of kept.split("\n")) {
      expect(line === "" || /^- \*\*Entry \d+\*\* — x+$/.test(line)).toBe(true);
    }
  });

  it("never ends the kept notes on a dangling heading", () => {
    const sectioned = Array.from({ length: 300 }, (_, i) =>
      i % 5 === 0 ? `### Section ${i}` : `- **Entry ${i}** — ${"x".repeat(40)}`,
    ).join("\n");
    for (const limit of [400, 900, 1500, 3000, 7000]) {
      const out = capBody(sectioned, {
        version: "1.0.0",
        repoUrl: REPO,
        limit,
      });
      expect(out.length).toBeLessThanOrEqual(limit);
      const kept = out.slice(0, out.indexOf("\n\n---\n")).trimEnd();
      expect(kept).not.toMatch(/(^|\n)#{1,6} [^\n]*$/);
    }
  });
});

// The guard that matters in practice: the section the NEXT release would
// publish has to fit, whatever the fragments have piled up.
describe("the repo's own changelog", () => {
  // What `versions.length > 0` used to stand in for: proof the file still
  // has the shape the tooling reads, so a regex that quietly matches
  // nothing can't pass this suite. Released sections are the wrong thing
  // to hang that on — withdrawing v1.0.0 left the file with none — but the
  // anchor is load-bearing in a way no release is: collate-changelog.mjs
  // splices each new section in under it and exits 1 when it is missing,
  // so losing it means no release can be cut at all.
  it("keeps the anchor collate-changelog.mjs writes under", () => {
    const md = readFileSync(
      new URL("../CHANGELOG.md", import.meta.url),
      "utf8",
    );
    expect(md).toMatch(/^## \[Unreleased\]$/m);
  });

  it("caps every released section to a publishable body", () => {
    const md = readFileSync(
      new URL("../CHANGELOG.md", import.meta.url),
      "utf8",
    );
    const versions = [...md.matchAll(/^## \[(\d+\.\d+\.\d+)\]/gm)]
      .map((m) => m[1])
      .filter((v): v is string => v !== undefined);
    for (const version of versions) {
      const section = extractSection(md, version);
      expect(section).not.toBeNull();
      const body = capBody(section ?? "", { version, repoUrl: REPO });
      expect(body.length).toBeLessThanOrEqual(GITHUB_BODY_LIMIT);
    }
  });
});
