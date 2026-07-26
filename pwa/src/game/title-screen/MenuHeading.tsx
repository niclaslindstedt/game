// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The sub-screen HEADER: the breadcrumb trail, the page title, and the rule
// that closes the block off from the rows below it.
//
// A sub-screen used to name itself in a single scale-2 line — SMALLER than the
// scale-3 rows it introduced, in a purple that appeared nowhere else in the
// skin, tucked so close under the logo that it read as a second tagline. Here
// the title is the loudest thing on the screen (the brand mark above it dims
// and shrinks to make room), the path to it rides beside it small and dim, and
// a fading rule underneath separates header from list.
//
// The title's SCALE is measured, not guessed: `fitScale` steps it down until
// the drawn line fits the viewport's width budget, so a long title ("CHOOSE
// YOUR NIGHTMARE") shrinks on a narrow phone instead of running off both edges
// while a short one ("SOUND") stays big everywhere.

import type { CSSProperties } from "react";

import { PixelText } from "@ui/lib/PixelText.tsx";
import type { PixelFont } from "@ui/lib/pixel-font.ts";

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

/** The trail's own pixel scale — half the title's biggest step, so the path
 * stays a caption beside the leaf however large the leaf ends up. */
const TRAIL_SCALE = 2;

/** The share of the viewport width the whole header line may span before the
 * title steps down a scale. Leaves a margin either side so the block never
 * touches the screen edges. */
const WIDTH_SHARE = 0.84;

/** The largest scale a title is ever drawn at (and the floor it may fall to).
 * The floor is still one step above the rows' scale-3 labels' companion text,
 * so even the longest title on the narrowest phone reads as a heading. */
const TITLE_MAX = 5;
const TITLE_MIN = 3;

/**
 * The biggest scale in `[TITLE_MIN, TITLE_MAX]` at which `title` (plus the
 * trail already drawn beside it) fits the width budget.
 *
 * A PixelText canvas is displayed at `measure(text) × scale` font pixels, sized
 * in rem — so on screens past UI_SCALE_BREAKPOINT_PX, where the root font-size
 * doubles, it lands at twice that many CSS px. Multiplying by `uiScale` is what
 * makes one budget hold on a phone, a tablet and a desktop alike.
 */
export function fitScale(
  font: PixelFont,
  title: string,
  trailWidth: number,
  viewportWidth: number,
  uiScale: number,
  max = TITLE_MAX,
): number {
  const budget = viewportWidth * WIDTH_SHARE - trailWidth;
  const unit = font.measure(title) * uiScale;
  for (let scale = max; scale > TITLE_MIN; scale -= 1) {
    if (unit * scale <= budget) return scale;
  }
  return TITLE_MIN;
}

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
  // The trail is drawn inline, on the title's line, rather than stacked above
  // it: a second line would cost a landscape phone ~13 CSS px of the height
  // its rows are already fighting for.
  const trail = heading.trail ? `${heading.trail} » ` : "";
  const trailWidth = trail ? font.measure(trail) * TRAIL_SCALE * uiScale : 0;
  const scale = fitScale(
    font,
    heading.title,
    trailWidth,
    viewportWidth,
    uiScale,
    compact ? TITLE_MAX - 1 : TITLE_MAX,
  );
  return (
    <div className={`menu-heading tone-${heading.tone}`}>
      <div className="menu-heading-line">
        {trail && (
          <PixelText
            font={font}
            text={trail}
            scale={TRAIL_SCALE}
            color={tone.trail}
            className="menu-trail"
          />
        )}
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
