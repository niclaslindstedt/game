// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// A pixel-styled ON/OFF switch — an iOS-flavoured toggle rendered in the
// game's blocky palette: a pill track (dark when off, green when on) with a
// chunky knob that snaps left/right in stepped jumps. Purely presentational —
// it reflects `on`; the enclosing menu row owns the click that flips it.
// Generic React/UI game code, so it lives in website/src/lib/ (imported as
// @ui/lib/PixelToggle.tsx) for eventual extraction into oss-framework.

type Props = {
  /** Whether the switch reads on (knob right, green) or off (knob left). */
  on: boolean;
};

export function PixelToggle({ on }: Props) {
  return (
    <span
      className="pixel-toggle"
      data-on={on}
      // The menu button owns the gesture and its label; the switch is a purely
      // visual readout, so it stays out of the accessibility tree.
      aria-hidden="true"
    >
      <span className="pixel-toggle-knob" />
    </span>
  );
}
