// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE SERVICE WORKER'S NAVIGATION DENYLIST.
//
// The release slot's worker is scoped to `/`, which covers the sibling deploy
// slots nested under it AND this slot's library — hundreds of static reference
// documents that carry none of the game's JavaScript. The worker answers every
// in-scope navigation with the cached app shell, so anything it fails to deny
// gets the GAME instead of the page that was asked for.
//
// This shipped once, and the shape of the miss is why the rule is tested rather
// than eyeballed: the deny entries all end in "/", the check was a bare
// `startsWith`, and so `/library` — the URL a person actually types — did not
// match. It could not be caught by fetching the URL either, because a fetch has
// no service worker and quietly follows the server's 301 to `/library/`. It
// only reproduced on a device that had already installed the worker.

import { describe, expect, it } from "vitest";

import { deniesNavigation, DEPLOY_SLOTS } from "../pwa/pwa-plugin.ts";

// What the release slot's worker is built with: the sibling slots plus its own
// library (see `denylist` in pwa-plugin.ts).
const RELEASE_DENY = [
  ...DEPLOY_SLOTS.filter((slot) => slot !== "/" && slot.startsWith("/")),
  "/library/",
];

describe("service worker navigation denylist", () => {
  it("denies a bare path, not just the trailing-slash form", () => {
    // The regression. Both spellings reach the same page, and a reader is far
    // more likely to type or link the first.
    expect(deniesNavigation("/library", RELEASE_DENY)).toBe(true);
    expect(deniesNavigation("/library/", RELEASE_DENY)).toBe(true);
  });

  it("denies everything nested under a denied path", () => {
    for (const path of [
      "/library/bestiary",
      "/library/bestiary/",
      "/library/bestiary/the-flagbearer/",
      "/library/arsenal/excalibur/",
    ]) {
      expect(deniesNavigation(path, RELEASE_DENY), path).toBe(true);
    }
  });

  it("denies the sibling deploy slots, bare or not", () => {
    // A slot's shell shadowing another slot's is the original reason this list
    // exists; the bare form was equally unguarded.
    for (const path of ["/preview", "/preview/", "/branch", "/branch/"]) {
      expect(deniesNavigation(path, RELEASE_DENY), path).toBe(true);
    }
  });

  it("still answers the game's own routes", () => {
    // The worker must keep serving the app shell for everything that IS the
    // game, or the PWA stops opening offline — which is the whole point of it.
    for (const path of ["/", "/index.html", "/privacy/", "/contact/"]) {
      expect(deniesNavigation(path, RELEASE_DENY), path).toBe(false);
    }
  });

  it("does not deny a path that merely starts with the same letters", () => {
    // `/librarian` is not inside `/library/`, and normalising to a trailing
    // slash must not accidentally make it so.
    for (const path of ["/librarian", "/librarian/", "/previewer/"]) {
      expect(deniesNavigation(path, RELEASE_DENY), path).toBe(false);
    }
  });

  it("denies nothing when the list is empty", () => {
    // The `/preview/` and `/branch/` workers are built with an empty denylist
    // (no slot nests under them) plus their own library.
    expect(deniesNavigation("/library", [])).toBe(false);
  });
});
