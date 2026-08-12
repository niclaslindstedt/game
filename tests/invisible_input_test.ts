// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE FIELDS NOBODY SEES — and the one state in which they were seen anyway.
//
// Two of this app's text boxes are INVISIBLE BY DESIGN: a real `<input>` is
// stretched over pixel glyphs that draw its value, because a keyboard —
// hardware or software — only ever types into a real form control, and a canvas
// of pixel type is not one. `color: transparent` is what makes the control's own
// text stand out of the way of the picture beneath it.
//
// EXCEPT WHILE IT IS SELECTED. A selection is painted with the user agent's own
// selection colours, FOREGROUND INCLUDED, which overrides the element's `color`
// — so a field arriving focused-and-selected showed its value a second time, in
// the browser's default 16px, on top of the pixel glyphs it is the invisible
// half of. That is exactly what the drive's high-score entry did on desktop
// (`DriveScores` selects the three letters so the first keystroke replaces the
// previous player's name; a coarse pointer is left unfocused, so a phone never
// showed it).
//
// The fix is a `::selection` rule per field, and this pins the pair: a rule that
// hides a field's text must be joined by one that keeps it hidden when the text
// is selected. Written against the STYLESHEET rather than a rendering because
// the two engines that ship this game disagree about which property decides a
// selection's ink, and no single headless browser can prove both.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

/** The stylesheet with its block comments removed, so prose can't match. */
const CODE = readFileSync(
  fileURLToPath(new URL("../pwa/src/styles.css", import.meta.url)),
  "utf8",
).replace(/\/\*[\s\S]*?\*\//g, "");

interface Rule {
  /** The selector list (or at-rule prelude) this block hangs off. */
  selector: string;
  /** Only this block's OWN declarations — nested blocks are excluded. */
  declarations: string;
}

/**
 * Every declaration block in the stylesheet, paired with the prelude it hangs
 * off. Walks braces rather than regex-matching `{…}` so an at-rule wrapping
 * other rules (`@media`, `@supports`) yields its children too, each with its own
 * declarations, and a nested block never leaks into its parent's.
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

/** Does this block declare `prop` as `transparent`? */
function hides(decls: string, prop: string): boolean {
  return new RegExp(`(^|[;{\\s])${prop}:\\s*transparent`).test(decls);
}

/**
 * THE SIGNATURE OF AN OVERLAID FIELD: its own text AND its own caret are
 * transparent, because something else is drawing both. A rule that hides only
 * one of them is something else entirely (a fade, a placeholder trick) and is
 * none of this test's business.
 */
const INVISIBLE = RULES.filter(
  (r) => hides(r.declarations, "color") && hides(r.declarations, "caret-color"),
);

describe("a field whose text is drawn for it", () => {
  it("is a pattern this app actually uses", () => {
    // The guard on the sweep below: a renamed class would otherwise leave it
    // asserting nothing at all, quietly and green.
    expect(INVISIBLE.map((r) => r.selector)).toEqual(
      expect.arrayContaining([".pixel-input-field", ".drive-name-input"]),
    );
  });

  for (const rule of INVISIBLE) {
    describe(rule.selector, () => {
      const selection = RULES.filter(
        (r) => r.selector === `${rule.selector}::selection`,
      );

      it("stays unseen while it is selected", () => {
        expect(
          selection.length,
          `no \`${rule.selector}::selection\` rule — a selection is painted in ` +
            `the UA's own ink, so this field shows its value over the glyphs ` +
            `drawing it the moment anything selects the text`,
        ).toBe(1);
        const decls = (selection[0] as Rule).declarations;
        // The highlight itself, which is a lit box over the picture even with
        // nothing legible in it.
        expect(decls).toMatch(/background:\s*transparent/);
        // Blink keeps the element's own `color` as soon as any `::selection`
        // rule matches; it is spelled out anyway so the rule does not depend on
        // that.
        expect(decls).toMatch(/(^|[;{\s])color:\s*transparent/);
        // …and WebKit — which is what the Tauri desktop shell renders in on
        // macOS and Linux — paints a selection's text through this one.
        expect(decls).toMatch(/-webkit-text-fill-color:\s*transparent/);
      });
    });
  }
});
