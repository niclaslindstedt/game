// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE TITLE FOOTER'S COMMIT LINK — which builds get one, and which must not.
//
// The rule is a build-time decision folded into a single string constant
// (`__BUILD_COMMIT_URL__`), so by the time the app is running there is nothing
// left to test: the footer is a link because the string was non-empty, or it
// is plain text because it was empty (TitleFooter.tsx). This suite tests the
// only place the decision is actually made.
//
// The three empty cases matter more than the two that link. A commit URL on
// the RELEASED site is developer furniture on a stranger's screen; a URL built
// from a sha nobody could resolve, or from a fork's cleared `repoUrl`, is a
// dead link on the front door of the game. Absent beats wrong, every time.

import { describe, expect, it } from "vitest";

import { commitUrlForBase, isSecondarySlot } from "../pwa/pwa-plugin.ts";
import { IDENTITY } from "../pwa/src/identity.ts";

const SHA = "0123456789abcdef0123456789abcdef01234567";

describe("deploy slots", () => {
  it("counts /preview/ and /branch/ as the development slots", () => {
    expect(isSecondarySlot("/preview/")).toBe(true);
    expect(isSecondarySlot("/branch/")).toBe(true);
    expect(isSecondarySlot("/")).toBe(false);
  });

  it("recognises a slot served from a sub-path", () => {
    // A fork on a project page (`<owner>.github.io/<repo>/`) is the same three
    // slots one directory down.
    expect(isSecondarySlot("/game/preview/")).toBe(true);
    expect(isSecondarySlot("/game/")).toBe(false);
  });
});

describe("the title footer's commit link", () => {
  it("points a preview build at the exact commit it was built from", () => {
    expect(commitUrlForBase("/preview/", SHA)).toBe(
      `${IDENTITY.repoUrl}/commit/${SHA}`,
    );
    expect(commitUrlForBase("/branch/", SHA)).toBe(
      `${IDENTITY.repoUrl}/commit/${SHA}`,
    );
  });

  it("carries the FULL sha, not the seven characters the footer prints", () => {
    // Both resolve on the forge today; only one of them still resolves to one
    // commit after the repo has grown.
    expect(commitUrlForBase("/preview/", SHA)).toContain(SHA);
  });

  it("gives the released slot no link at all", () => {
    expect(commitUrlForBase("/", SHA)).toBe("");
  });

  it("gives a build with no resolvable commit no link", () => {
    // A source tarball with no git dir, or a store build that embeds no hash.
    expect(commitUrlForBase("/preview/", "")).toBe("");
  });

  it("gives a fork with no repository URL no link", () => {
    expect(commitUrlForBase("/preview/", SHA, "")).toBe("");
  });

  it("does not double the slash on a repository URL that ends in one", () => {
    expect(
      commitUrlForBase("/preview/", SHA, "https://example.invalid/x/"),
    ).toBe(`https://example.invalid/x/commit/${SHA}`);
  });
});
