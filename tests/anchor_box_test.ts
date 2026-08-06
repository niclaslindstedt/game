// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The floating-card placement rules (@ui/lib/anchor-box.ts).
//
// `placePair` is the one that earns a test: it is the reason an item card and
// the EQUIPPED card it is compared against both survive a small screen. The
// old behaviour placed them one at a time and simply DROPPED the second when
// nothing was free — which is how the quest box's CHOOSE ONE came to show three
// weapons and not the one in the hero's hands on an SE-class phone.

import { describe, expect, it } from "vitest";

import { boxesOverlap, placePair } from "@ui/lib/anchor-box.ts";

/** A DOMRect stand-in — the placement only ever reads these six fields. */
function rect(left: number, top: number, width: number, height: number) {
  return {
    left,
    top,
    width,
    height,
    right: left + width,
    bottom: top + height,
    x: left,
    y: top,
    toJSON: () => ({}),
  } as DOMRect;
}

/** The reference device, the SE floor, and the two 2×-scaled tablets whose
 * EFFECTIVE room is smaller than either phone (see the ui-review skill). */
const VIEWPORTS = [
  { name: "land", width: 844, height: 390 },
  { name: "port", width: 390, height: 844 },
  { name: "sel", width: 667, height: 375 },
  { name: "sep", width: 375, height: 667 },
  { name: "minil", width: 1133, height: 744 },
  { name: "minip", width: 744, height: 1133 },
];

/** A weapon card and the EQUIPPED card beside it, measured off the running
 * game — the tall shape that used to leave the equipped card homeless. The
 * game doubles its whole UI past `UI_SCALE_BREAKPOINT_PX` on the SHORTER axis
 * (render/view.ts), so a viewport gets the tier it would actually draw: pairing
 * a phone with tablet-sized cards would be testing a screen the game never
 * makes. */
const UI_SCALE_BREAKPOINT_PX = 700;
function cardsFor(viewport: { width: number; height: number }) {
  const scale =
    Math.min(viewport.width, viewport.height) >= UI_SCALE_BREAKPOINT_PX ? 2 : 1;
  return scale === 2
    ? {
        primary: { width: 452, height: 447 },
        secondary: { width: 334, height: 337 },
      }
    : {
        primary: { width: 228, height: 225 },
        secondary: { width: 169, height: 171 },
      };
}

const MARGIN = 6;

describe("placePair", () => {
  it("keeps both cards on screen and apart, wherever the anchor sits", () => {
    for (const viewport of VIEWPORTS) {
      const cards = cardsFor(viewport);
      // Anchors swept across the whole viewport — a reward slot can be
      // anywhere in the quest box, and the bag's cells anywhere in the panel.
      for (let x = 0; x < viewport.width - 40; x += 37) {
        for (let y = 0; y < viewport.height - 40; y += 37) {
          const anchor = rect(x, y, 40, 40);
          const at = placePair(anchor, cards.primary, cards.secondary, {
            viewport,
          });
          const primary = { ...at.primary, ...cards.primary };
          const secondary = { ...at.secondary, ...cards.secondary };
          const where = `${viewport.name} @${x},${y}`;
          for (const [label, box] of [
            ["primary", primary],
            ["secondary", secondary],
          ] as const) {
            expect(box.left, `${label} left ${where}`).toBeGreaterThanOrEqual(
              MARGIN,
            );
            expect(box.top, `${label} top ${where}`).toBeGreaterThanOrEqual(
              MARGIN,
            );
            expect(
              box.left + box.width,
              `${label} right ${where}`,
            ).toBeLessThanOrEqual(viewport.width - MARGIN);
            expect(
              box.top + box.height,
              `${label} bottom ${where}`,
            ).toBeLessThanOrEqual(viewport.height - MARGIN);
          }
          // Two cards that overlap are one unreadable card.
          expect(boxesOverlap(primary, secondary), `overlap ${where}`).toBe(
            false,
          );
        }
      }
    }
  });

  it("puts the inspected card on the anchor's side of the pair", () => {
    const viewport = { width: 667, height: 375 };
    const primary = { width: 228, height: 225 };
    const secondary = { width: 169, height: 171 };
    // An anchor hard against the right edge: the block has to go left, so the
    // inspected card takes the RIGHT end of it, nearest the cell it describes.
    const right = placePair(rect(600, 160, 40, 40), primary, secondary, {
      viewport,
    });
    expect(right.primary.left).toBeGreaterThan(right.secondary.left);
    // And the mirror case.
    const left = placePair(rect(20, 160, 40, 40), primary, secondary, {
      viewport,
    });
    expect(left.primary.left).toBeLessThan(left.secondary.left);
  });

  it("stacks the pair when the screen has no width for a row", () => {
    // A portrait phone: 228 + 10 + 169 does not fit across 375px, so the two
    // cards go one above the other rather than one of them going missing.
    const at = placePair(
      rect(160, 500, 40, 40),
      { width: 228, height: 225 },
      { width: 169, height: 171 },
      { viewport: { width: 375, height: 667 } },
    );
    expect(at.primary.top).not.toBe(at.secondary.top);
    // The anchor is low, so the inspected card takes the BOTTOM end.
    expect(at.primary.top).toBeGreaterThan(at.secondary.top);
  });
});
