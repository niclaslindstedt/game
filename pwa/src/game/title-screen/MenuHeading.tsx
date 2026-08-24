// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The sub-screen HEADER: the breadcrumb trail, the page title, and the rule
// that closes the block off from the rows below it.
//
// The title is the loudest thing on the screen (the brand mark above it dims
// and shrinks to make room), the path to it rides beside it small and dim, and
// a fading rule underneath separates header from list.
//
// The title's SCALE is measured, not guessed: `fitScale` steps it down until
// the drawn line fits the viewport's width budget, so a long title ("CHOOSE
// YOUR NIGHTMARE") shrinks on a narrow phone instead of running off both edges
// while a short one ("SOUND") stays big everywhere.
//
// AND THE TRAIL WRAPS, because shrinking the title cannot save a header the
// TRAIL alone overruns: a screen four deep (SETTINGS » DEVELOPER » CHEATS »
// SEED CHARACTERS) is wider than a portrait phone before the title is drawn at
// all, and the whole line ran off both edges with the leaf's own name clipped.
// So the path is drawn as ONE CANVAS PER CRUMB in a wrapping flex line rather
// than as a single unbreakable string, and the header breaks between crumbs.
//
// The fit is measured against the layout the browser is ABOUT to perform:
// `crumbTail` walks the crumbs the way `flex-wrap` will and reports what is
// left of the last line, and the title is fitted against THAT. A header that
// already fits on one line is fitted exactly as it always was — the wrap is a
// fallback for the ones that do not, never a new shape for the ones that do.
// All of that math is `heading-fit.ts`, a font-free leaf, so the layout can be
// tested without a browser.

import type { CSSProperties } from "react";

import { PixelText } from "@ui/lib/PixelText.tsx";
import type { PixelFont } from "@ui/lib/pixel-font.ts";

import {
  crumbTail,
  drawnWidth,
  fitScale,
  headerBudget,
  trailCrumbs,
  LINE_GAP_REM,
  REM_BASE_PX,
  TITLE_MAX,
  TITLE_MIN,
  TRAIL_SCALE,
} from "./heading-fit.ts";
import type { HeadingTone, ScreenHeading } from "./menus.ts";

/** The colours each tone paints the header in. The TITLE is bone-white on the
 * player and developer screens — bright enough to lead the page without
 * borrowing the amber that marks the selected row — and the tone shows in the
 * dim trail and the rule. The coin vault is the exception: its title is the
 * gold of the treasure it sells. */
const TONES: Record<
  HeadingTone,
  { title: string; trail: string; rule: string }
> = {
  player: { title: "#f2ede3", trail: "#b08b3f", rule: "#ffd75e" },
  dev: { title: "#f2ede3", trail: "#4f9b85", rule: "#7ef0c8" },
  store: { title: "#ffd75e", trail: "#b08b3f", rule: "#ffd75e" },
};

export function MenuHeading({
  font,
  heading,
  compact,
  viewportWidth,
  uiScale,
}: {
  font: PixelFont;
  heading: ScreenHeading;
  /** A short viewport (a landscape phone) has no vertical room to spend on a
   * jumbo title — it caps one step lower so the rows keep their space. */
  compact: boolean;
  viewportWidth: number;
  uiScale: number;
}) {
  const tone = TONES[heading.tone];
  // The trail rides on the title's line wherever it fits: stacking it above
  // unconditionally would cost a landscape phone ~13 CSS px of the height its
  // rows are already fighting for. It breaks only when the line cannot hold it.
  const crumbs = trailCrumbs(heading.trail);
  const gap = LINE_GAP_REM * REM_BASE_PX * uiScale;
  const widths = crumbs.map((crumb) =>
    drawnWidth(font.measure(crumb), TRAIL_SCALE, uiScale),
  );
  // Each crumb owes the gap that follows it, the last one included: that gap
  // sits between the path and the title.
  const trailWidth = widths.reduce((sum, width) => sum + width + gap, 0);
  const budget = headerBudget(viewportWidth);
  const measured = font.measure(heading.title);
  const max = compact ? TITLE_MAX - 1 : TITLE_MAX;
  const inline = fitScale(measured, trailWidth, viewportWidth, uiScale, max);
  // One line still holds it → the fit is the one it has always been. Otherwise
  // the crumbs are about to wrap, and the title is re-fitted against the room
  // that leaves it — which is how a leaf pushed onto its own line gets to be
  // drawn LARGE instead of stranded at the floor scale.
  const scale =
    trailWidth + drawnWidth(measured, inline, uiScale) <= budget
      ? inline
      : fitScale(
          measured,
          crumbTail(
            widths,
            gap,
            budget,
            drawnWidth(measured, TITLE_MIN, uiScale),
          ),
          viewportWidth,
          uiScale,
          max,
        );
  return (
    <div className={`menu-heading tone-${heading.tone}`}>
      <div className="menu-heading-line">
        {crumbs.map((crumb, at) => (
          <PixelText
            // Positional: two ancestors may legitimately share a name.
            key={at}
            font={font}
            text={crumb}
            scale={TRAIL_SCALE}
            color={tone.trail}
            className="menu-trail"
          />
        ))}
        {/* `menu-title` is the glow's hook — the drop-shadow that lifts the
            title off the sun and the planets drifting behind it. */}
        <PixelText
          font={font}
          text={heading.title}
          scale={scale}
          color={tone.title}
          className="menu-title"
        />
      </div>
      {/* Brightest under the title and gone by the ends: a section divider,
          not a box. Purely decorative. */}
      <span
        className="menu-heading-rule"
        aria-hidden="true"
        style={{ "--rule": tone.rule } as CSSProperties}
      />
    </div>
  );
}
