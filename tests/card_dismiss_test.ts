// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// A FLOATING CARD IS PUT AWAY BY A PRESS THAT MISSES IT — and "misses it" has
// to be answered from the DOM, not from the React tree. Every item card in the
// game is PORTALED to <body>, but React still routes a portal's events through
// the component that rendered it, so a panel-level "did this press miss my
// cells?" handler sees the presses the player aims at the CARD and reads them
// as a miss: pressing a card to read it was what dismissed it. The quest box
// had the opposite half of the same bug — it dismissed on hover-leave only, so
// on a touch screen (which has no hover, and which synthesises an enter/leave
// pair around its own press) the card could be raised and never lowered.
//
// The third failure is the mirror image: exempting too MUCH. The exemption was
// the cell CLASS, which every cell in a bag wears — the empty ones, the locked
// ones, the doll's bare frames — so most of the panel's own surface silently
// swallowed the dismiss and the only place a press put the card away was the
// strip above the grid. Only a cell HOLDING a piece owns a card, and it says so
// with `data-card`.
//
// These tests pin all three: the rule itself, and the fact that every screen
// raising a card goes through the one shared hook with the card and exactly the
// card-owning cells exempt.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { pressIsInside } from "@ui/lib/use-outside-press.ts";

/** A stand-in for the pressed element, answering `closest` for exactly the
 * selectors it sits inside — the same yes/no a real element gives. */
function pressed(...owns: string[]): EventTarget {
  return {
    closest: (selectors: string) =>
      selectors
        .split(",")
        .map((s) => s.trim())
        .some((s) => owns.includes(s))
        ? {}
        : null,
  } as unknown as EventTarget;
}

const SELECTOR = ".item-tooltip, [data-card]";

describe("pressIsInside", () => {
  it("a press on the card itself is INSIDE — reading a card never puts it away", () => {
    expect(pressIsInside(pressed(".item-tooltip"), SELECTOR)).toBe(true);
  });

  it("a press on the cell that raised it is INSIDE — the cell owns its own card", () => {
    expect(pressIsInside(pressed("[data-card]"), SELECTOR)).toBe(true);
  });

  it("a press on anything else is OUTSIDE", () => {
    expect(pressIsInside(pressed(".inv-footer"), SELECTOR)).toBe(false);
    expect(pressIsInside(pressed(), SELECTOR)).toBe(false);
  });

  // THE HALF THAT SHIPPED BROKEN. The exemption used to be the CELL CLASS
  // (`.inv-cell`, `.shop-bag-cell`), which every cell wears — including the
  // empty ones, the locked ones past what the hero has unlocked, and the doll's
  // empty frames. Those raise no card and do nothing on a press, so most of the
  // bag's own surface silently ate the dismiss: the card could only be put away
  // by pressing the header strip ABOVE the grid. Only a cell that OWNS a card
  // is exempt, and it says so with `data-card`.
  it("an EMPTY cell is OUTSIDE — a press on one puts the card away", () => {
    expect(pressIsInside(pressed(".inv-cell"), SELECTOR)).toBe(false);
    expect(pressIsInside(pressed(".inv-cell", ".locked"), SELECTOR)).toBe(
      false,
    );
    expect(pressIsInside(pressed(".inv-cell", ".doll-slot"), SELECTOR)).toBe(
      false,
    );
    expect(pressIsInside(pressed(".shop-bag-cell"), SELECTOR)).toBe(false);
  });

  it("a FILLED cell is INSIDE — it raises the card, so it may not dismiss it", () => {
    expect(pressIsInside(pressed(".inv-cell", "[data-card]"), SELECTOR)).toBe(
      true,
    );
  });

  it("a target that cannot answer (the document, a synthetic) is OUTSIDE", () => {
    expect(pressIsInside(null, SELECTOR)).toBe(false);
    expect(pressIsInside({} as EventTarget, SELECTOR)).toBe(false);
  });
});

describe("the card takes its own presses", () => {
  // THE HALF THAT MADE IT UNREPRODUCIBLE. The card used to be
  // `pointer-events: none` — "purely informational, taps fall through to
  // dismiss it" — so a press aimed at the card landed on whatever it happened
  // to be covering, and the card is placed wherever it fits. Over a bag cell
  // the press raised THAT item's card (the card appeared to change items);
  // over panel filler it dismissed; over the quest box it did nothing. One
  // gesture, three outcomes decided by layout. Nothing in the TSX can pin
  // this: the rule that broke it is a stylesheet declaration.
  const CSS = readFileSync(
    fileURLToPath(new URL("../pwa/src/styles.css", import.meta.url)),
    "utf8",
  ).replace(/\/\*[\s\S]*?\*\//g, "");

  /** The declarations of the top-level rule whose selector list is exactly
   * `selector` (so `.item-tooltip` never picks up `.item-tooltip .tooltip-use`). */
  const declarationsOf = (selector: string): string => {
    const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const rule = new RegExp(`(^|\\n)${escaped}\\s*\\{([^}]*)\\}`).exec(CSS);
    expect(rule, `no rule for ${selector}`).not.toBeNull();
    return rule?.[2] ?? "";
  };

  it("the floating item card is not pointer-transparent", () => {
    expect(declarationsOf(".item-tooltip")).not.toMatch(
      /pointer-events\s*:\s*none/,
    );
  });

  it("no card variant has to opt back in", () => {
    // With the base rule taking its presses, an opt-in somewhere else is a
    // sign the base flipped back.
    expect(CSS).not.toMatch(/\.shop-deal-card\s*\{[^}]*pointer-events/);
  });
});

/** Every screen that raises an item card. All four dismiss by the SAME two
 * selectors — the card itself, and `data-card`, the marker a cell stamps on
 * itself when it holds a piece — so the list carries no per-screen cell class
 * any more: a class is worn by empty cells too, and exempting those is what
 * made the bag impossible to dismiss inside its own grid. */
const SCREENS: string[] = [
  "pwa/src/game/InventoryPanel.tsx",
  "pwa/src/game/PaperDoll.tsx",
  "pwa/src/game/ShopPanel.tsx",
  "pwa/src/game/overlays/TradeOverlay.tsx",
  "pwa/src/game/overlays/QuestOverlay.tsx",
];

const source = (file: string) =>
  readFileSync(fileURLToPath(new URL(`../${file}`, import.meta.url)), "utf8");

describe("every screen that raises an item card dismisses it the same way", () => {
  for (const file of SCREENS) {
    it(`${file} marks the cells that OWN a card, and only those`, () => {
      const code = source(file);
      // A cell earns its exemption by holding a piece, so the marker is
      // conditional on the item everywhere but the quest slots (which never
      // draw an empty one).
      expect(code).toMatch(/data-card=/);
      if (!file.endsWith("QuestOverlay.tsx")) {
        expect(code).toMatch(/data-card=\{[^}]*\?[^}]*\}/);
      }
    });

    // PaperDoll draws cells for the panel that owns the hook; it raises no card
    // of its own, so it is exempt from the two rules below.
    if (file.endsWith("PaperDoll.tsx")) continue;

    it(`${file} uses the shared hook, with the card and its cells exempt`, () => {
      const code = source(file);
      expect(code).toContain("useDismissOnOutsidePress(");
      // The card's own class first: without it the hook dismisses the card on
      // the press meant to read it — the bug the shared rule exists to end.
      expect(code).toContain(".item-tooltip");
      expect(code).toContain("[data-card]");
    });

    it(`${file} exempts no CELL CLASS — an empty cell must dismiss`, () => {
      // The regression this file exists to catch twice over: a class in the
      // selector is worn by the empty cells too, and a bag is mostly empty.
      expect(source(file)).not.toMatch(
        /useDismissOnOutsidePress\([\s\S]{0,200}?\.(inv-cell|shop-bag-cell|shop-stall-item|quest-reward-slot)/,
      );
    });

    it(`${file} keeps no panel-level dismiss of its own`, () => {
      // A handler on the panel cannot see a press on the backdrop and MISJUDGES
      // a press on the portaled card. One rule, bound above the window, or the
      // two disagree again.
      expect(source(file).replace(/\/\/[^\n]*/g, "")).not.toMatch(
        /closest\(["'][^"']*(inv-cell|shop-stall-item|quest-reward-slot|data-card)/,
      );
    });
  }
});
