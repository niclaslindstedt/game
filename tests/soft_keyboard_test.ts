// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE KEYBOARD BELONGS TO THE PRESS, NOT TO THE FIELD (pwa/src/lib/auto-focus.ts).
//
// A phone raises its software keyboard only for a `focus()` made while a user
// gesture is being handled. A form reached by pressing a menu row cannot meet
// that: the press mounts the screen, the screen mounts the field, and the field
// asks for focus from an effect a turn of the event loop later. So NEW GAME came
// up with the name field genuinely focused, a caret blinking in it, and no
// keyboard under it — and tapping the field did nothing, because it already held
// focus.
//
// `armSoftKeyboard` is called from inside the press and focuses a throwaway
// input that exists RIGHT THEN; `useAutoFocus` moves focus onto the real field
// the moment it mounts and throws the decoy away. What is pinned here is the
// handful of facts that make that work and every one of which is invisible on a
// desktop, where the whole thing is a no-op:
//
//   THE DECOY IS A REAL, FOCUSABLE BOX (`display:none` cannot take focus at all)
//   IT IS FOCUSED SYNCHRONOUSLY, or the gesture is already spent
//   THERE IS NEVER MORE THAN ONE, and none is left behind
//   AND THE FIELD'S OWN AUTOFOCUS RELEASES IT
//
// It runs against a hand-rolled `document` rather than a DOM, because the suite
// has none (vitest.config.ts) and these are claims about four calls.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  armSoftKeyboard,
  releaseSoftKeyboard,
} from "../pwa/src/lib/auto-focus.ts";

type FakeInput = {
  type: string;
  tabIndex: number;
  style: { cssText: string };
  attrs: Record<string, string>;
  setAttribute: (name: string, value: string) => void;
  focus: (opts?: { preventScroll?: boolean }) => void;
  remove: () => void;
  focused: number;
  focusOpts: { preventScroll?: boolean } | undefined;
  attached: boolean;
};

let made: FakeInput[] = [];
/** Callbacks `window.setTimeout` was handed, so the bail-out can be fired by
 * hand instead of waited for. */
let timers: (() => void)[] = [];

function fakeDom(): void {
  made = [];
  timers = [];
  const body = {
    appendChild(node: FakeInput) {
      node.attached = true;
    },
  };
  vi.stubGlobal("document", {
    body,
    createElement(tag: string) {
      expect(tag).toBe("input");
      const node: FakeInput = {
        type: "",
        tabIndex: 0,
        style: { cssText: "" },
        attrs: {},
        setAttribute(name: string, value: string) {
          node.attrs[name] = value;
        },
        focus(opts?: { preventScroll?: boolean }) {
          // A box that is not in the document cannot take focus, and neither
          // can one that has been thrown away — which is the whole reason the
          // decoy is a rendered one-pixel input rather than a hidden one.
          expect(node.attached).toBe(true);
          node.focused += 1;
          node.focusOpts = opts;
        },
        remove() {
          node.attached = false;
        },
        focused: 0,
        focusOpts: undefined,
        attached: false,
      };
      made.push(node);
      return node;
    },
  });
  vi.stubGlobal("window", {
    setTimeout: (fn: () => void) => {
      timers.push(fn);
      return timers.length;
    },
  });
}

afterEach(() => {
  releaseSoftKeyboard();
  vi.unstubAllGlobals();
});

describe("arming the software keyboard", () => {
  it("focuses a real, attached input then and there", () => {
    fakeDom();
    armSoftKeyboard();
    expect(made).toHaveLength(1);
    const decoy = made[0]!;
    // Focused synchronously — a deferred call has already spent the gesture.
    expect(decoy.focused).toBe(1);
    expect(decoy.attached).toBe(true);
    expect(decoy.type).toBe("text");
  });

  it("keeps the decoy out of the page's own furniture", () => {
    fakeDom();
    armSoftKeyboard();
    const decoy = made[0]!;
    // Out of the tab order and out of the accessibility tree: it is a lever for
    // the keyboard, not a field anybody is meant to reach.
    expect(decoy.tabIndex).toBe(-1);
    expect(decoy.attrs["aria-hidden"]).toBe("true");
    // Invisible but LAID OUT — neither of the two properties that would make it
    // unfocusable may appear.
    expect(decoy.style.cssText).not.toMatch(/display\s*:\s*none/);
    expect(decoy.style.cssText).not.toMatch(/visibility\s*:\s*hidden/);
    expect(decoy.style.cssText).toMatch(/opacity\s*:\s*0/);
    // 16px, or iOS zooms the page in on the field it is focusing.
    expect(decoy.style.cssText).toMatch(/font-size\s*:\s*16px/);
    // …and the page does not jump to the corner it is pinned in.
    expect(decoy.focusOpts).toEqual({ preventScroll: true });
  });

  it("never leaves two armed", () => {
    fakeDom();
    armSoftKeyboard();
    armSoftKeyboard();
    expect(made).toHaveLength(2);
    // The first is gone the instant the second is armed.
    expect(made[0]!.attached).toBe(false);
    expect(made[1]!.attached).toBe(true);
  });

  it("is thrown away on release", () => {
    fakeDom();
    armSoftKeyboard();
    releaseSoftKeyboard();
    expect(made[0]!.attached).toBe(false);
    // …and releasing again is a no-op rather than a throw: `useAutoFocus` calls
    // it on every field that mounts, armed or not.
    expect(() => releaseSoftKeyboard()).not.toThrow();
  });

  it("throws itself away if the field never arrives", () => {
    fakeDom();
    armSoftKeyboard();
    expect(timers).toHaveLength(1);
    timers[0]!();
    expect(made[0]!.attached).toBe(false);
  });

  it("does not throw away a LATER arming when an old timer fires", () => {
    fakeDom();
    armSoftKeyboard();
    const first = timers[0]!;
    armSoftKeyboard();
    first();
    // The second press is still holding the keyboard: a stale timer that closed
    // it would be a keyboard that shuts a few seconds after the form opens.
    expect(made[1]!.attached).toBe(true);
  });
});

/** A source file with its comments stripped, so prose can never satisfy a
 * match — only code can. */
const code = (file: string): string =>
  readFileSync(fileURLToPath(new URL(`../${file}`, import.meta.url)), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/[^\n]*$/gm, "");

describe("the hand-over", () => {
  it("happens where the press is, not where the field is", () => {
    // Inside the NEW GAME handler itself: moved into an effect, a callback or a
    // `setTimeout` it is spent and does nothing at all, silently.
    const app = code("pwa/src/App.tsx");
    expect(app).toMatch(/onNewGame=\{\(\) => \{\s*armSoftKeyboard\(\);/);
  });

  it("is completed by the field's own autofocus", () => {
    const lib = code("pwa/src/lib/auto-focus.ts");
    expect(lib).toMatch(
      /ref\.current\?\.focus\(\);\s*releaseSoftKeyboard\(\);/,
    );
  });
});
