// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE SUB-SCREEN HEADER'S WIDTH MATH — where the breadcrumb breaks, and how big
// the page title may be drawn beside what is left. A pure leaf over numbers, so
// the layout it predicts can be tested without a browser (`MenuHeading.tsx`
// draws what these decide; `SplashScreen.tsx` borrows the fit alone).
//
// A PixelText line is drawn at `measure(text) × scale` font pixels but SIZED in
// rem, so it occupies `measure × scale × uiScale` CSS px — every width below is
// in CSS px, which is what makes one budget hold on a phone, a tablet and a
// desktop alike.

/** The trail's own pixel scale — half the title's biggest step, so the path
 * stays a caption beside the leaf however large the leaf ends up. */
export const TRAIL_SCALE = 2;

/** What the compiled breadcrumb joins its ancestors with (`trailFor`,
 * scripts/generate-menu.mjs) — and so what the header may break between. */
const TRAIL_SEP = " » ";

/** The gap `.menu-heading-line` sets between the pieces on a line, in rem.
 * Mirrored here because the fit is measured in CSS px and the browser's own
 * wrap point has to be the one the fit predicts — keep the two in step. */
export const LINE_GAP_REM = 0.3;

/** CSS px per rem at the default root font-size — PixelText's own rem base. */
export const REM_BASE_PX = 16;

/** The share of the viewport width the header line may span. Leaves a margin
 * either side so the block never touches the screen edges. Mirrored by
 * `.menu-heading-line`'s `max-width`, which is what the browser wraps against. */
const WIDTH_SHARE = 0.84;

/** The largest scale a title is ever drawn at (and the floor it may fall to).
 * The floor is still one step above the rows' scale-3 labels' companion text,
 * so even the longest title on the narrowest phone reads as a heading. */
export const TITLE_MAX = 5;
export const TITLE_MIN = 3;

/** How wide `text` is drawn — the one conversion every width here goes
 * through. `measure` speaks unscaled font pixels. */
export function drawnWidth(
  measured: number,
  scale: number,
  uiScale: number,
): number {
  return measured * scale * uiScale;
}

/** The header line's own width budget, in CSS px. */
export function headerBudget(viewportWidth: number): number {
  return viewportWidth * WIDTH_SHARE;
}

/**
 * The breadcrumb, split into the pieces the header may break between.
 *
 * Each crumb keeps its OWN separator, so a line that wraps ends on the `»`
 * rather than opening with one — the path still reads as "and then" across the
 * break. The flex gap does the spacing between them, which is why the crumb
 * itself carries no trailing space.
 */
export function trailCrumbs(trail: string | undefined): string[] {
  if (!trail) return [];
  return trail.split(TRAIL_SEP).map((name) => `${name} »`);
}

/**
 * The biggest scale in `[min, max]` at which `title` fits the width budget
 * `trailWidth` has already been taken out of.
 *
 * The bounds default to a page header's; the opening studio card (see
 * `game/SplashScreen.tsx`) borrows the same fit with a bigger ceiling.
 */
export function fitScale(
  measured: number,
  trailWidth: number,
  viewportWidth: number,
  uiScale: number,
  max = TITLE_MAX,
  min = TITLE_MIN,
): number {
  const budget = headerBudget(viewportWidth) - trailWidth;
  for (let scale = max; scale > min; scale -= 1) {
    if (drawnWidth(measured, scale, uiScale) <= budget) return scale;
  }
  return min;
}

/**
 * How much of the LAST line the crumbs occupy once they have wrapped — the
 * greedy line-fill `flex-wrap` performs, measured so the title can be fitted
 * against what is actually left beside them.
 *
 * `0` when the title is going to start a line of its own: either there are no
 * crumbs, or what they left could not hold the title even at its smallest.
 * Either way the title's budget is the whole line.
 */
export function crumbTail(
  widths: readonly number[],
  gap: number,
  budget: number,
  titleMin: number,
): number {
  let line = 0;
  for (const width of widths) {
    const extended = line === 0 ? width : line + gap + width;
    // Past the budget the crumb starts a fresh line, carrying its own width
    // onto it — exactly what the browser does with it.
    line = extended <= budget ? extended : width;
  }
  const used = line === 0 ? 0 : line + gap;
  return used + titleMin <= budget ? used : 0;
}
