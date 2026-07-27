// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE DOCUMENT NEVER SCROLLS. The game is an app: every surface is a
// `position: fixed` shell with its own scroll boxes inside it, so the document
// has nothing to scroll — but "nothing to scroll" is not "cannot be scrolled".
// In a phone BROWSER a drag that reaches the document still moves the page, and
// at the top of the page it becomes PULL-TO-REFRESH: the whole game slides down
// out of frame with a loading spinner in the gap, which from the player's side
// reads as the level-up modal drifting off the screen under their thumb. An
// installed PWA and the native WebView have no pull-to-refresh, which is why
// this only ever showed up in the browser.
//
// Two halves keep it shut, and both are pinned here: the document itself is
// locked (`html.app-locked`, applied by main.tsx), and every scroll box inside
// the game CONTAINS its overscroll so a drag that runs out of list can't chain
// back out to the document.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const CSS = readFileSync(
  fileURLToPath(new URL("../pwa/src/styles.css", import.meta.url)),
  "utf8",
);

const MAIN = readFileSync(
  fileURLToPath(new URL("../pwa/src/main.tsx", import.meta.url)),
  "utf8",
);

/** The stylesheet with its block comments removed, so prose can't match. */
const CODE = CSS.replace(/\/\*[\s\S]*?\*\//g, "");

interface Rule {
  /** The selector list (or at-rule prelude) this block hangs off. */
  selector: string;
  /** Only this block's OWN declarations — nested blocks are excluded. */
  declarations: string;
}

/**
 * Every declaration block in the stylesheet, paired with the prelude it hangs
 * off. Walks braces rather than regex-matching `{…}` so an at-rule wrapping
 * other rules (`@media`, `@supports`) yields its children too, each with its
 * own declarations, and a nested block never leaks into its parent's.
 */
function rules(css: string): Rule[] {
  const found: Rule[] = [];
  const open: { selector: string; declarations: string }[] = [];
  let prelude = "";
  for (const ch of css) {
    if (ch === "{") {
      open.push({
        selector: prelude.trim().replace(/\s+/g, " "),
        declarations: "",
      });
      prelude = "";
    } else if (ch === "}") {
      const done = open.pop();
      if (done) found.push(done);
      prelude = "";
    } else {
      prelude += ch;
      const top = open.at(-1);
      if (top) top.declarations += ch;
    }
  }
  return found;
}

const RULES = rules(CODE);

/** The rules whose own declarations turn the element into a scroll container. */
const SCROLLERS = RULES.filter((r) =>
  /(^|[;{\s])overflow(-x|-y)?:\s*(auto|scroll)/.test(r.declarations),
);

describe("the document scroll lock", () => {
  const lock = RULES.filter((r) => /^html\.app-locked\b/.test(r.selector));

  /** The one `html.app-locked` rule — the assertion doubles as the guard. */
  function lockRule(): Rule {
    expect(lock.length, "no `html.app-locked` rule in styles.css").toBe(1);
    return lock[0] as Rule;
  }

  it("locks html and body once a game surface mounts", () => {
    const decls = lockRule().declarations;
    // `overflow: hidden` removes the scrollport, so a stray tall child cannot
    // reopen one...
    expect(decls).toMatch(/overflow:\s*hidden/);
    // ...and `overscroll-behavior: none` refuses the rubber band and the
    // pull-to-refresh, which need no scrollable content to fire.
    expect(decls).toMatch(/overscroll-behavior:\s*none/);
    // Both elements, not just <html>: overscroll propagates off whichever the
    // engine treats as the viewport's scroller.
    expect(lockRule().selector).toMatch(/html\.app-locked\s+body/);
  });

  it("declares no height, so the iOS shell-height override still wins", () => {
    // `--ios-shell-height` is applied through a bare `html, body` selector
    // (specificity 0,0,1). A `height` here (0,1,1) would out-specify it and
    // hand a browser tab the over-tall large viewport back.
    expect(lockRule().declarations).not.toMatch(/(^|[;\s])height:/);
  });

  it("is applied by main.tsx before the first render", () => {
    expect(MAIN).toMatch(/classList\.add\(\s*"app-locked"\s*\)/);
    // Only for the game — /privacy and /contact really are documents and have
    // to keep scrolling.
    expect(MAIN).toMatch(/if\s*\(!page\)\s*document\.documentElement/);
    expect(MAIN.indexOf("app-locked")).toBeLessThan(
      MAIN.indexOf("createRoot(root)"),
    );
  });
});

describe("in-game scroll boxes", () => {
  it("has scroll boxes to check", () => {
    // Guards the guard: a broken parser would pass every assertion below by
    // finding nothing at all.
    expect(SCROLLERS.length).toBeGreaterThan(15);
  });

  it("contain their overscroll so a drag can't chain to the document", () => {
    const leaking = SCROLLERS.filter(
      (r) => !/overscroll-behavior(-y)?:\s*(contain|none)/.test(r.declarations),
    ).map((r) => r.selector);
    expect(leaking, "scroll boxes missing `overscroll-behavior`").toEqual([]);
  });
});
