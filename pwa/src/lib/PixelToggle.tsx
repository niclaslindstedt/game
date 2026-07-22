// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// A pixel ON/OFF switch that reads as the PixelSlider frozen at its two ends:
// the same sharp track, amber fill, and blocky knob — off is the slider at 0
// (empty, knob left), on is the slider at 100% (filled, knob right). Purely
// presentational; the enclosing menu row owns the click that flips it. Generic
// React/UI game code, so it lives in pwa/src/lib/ (imported as
// @ui/lib/PixelToggle.tsx) for eventual extraction into oss-framework.

type Props = {
  /** Whether the switch reads on (filled, knob right) or off (empty, left). */
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
      <span className="pixel-toggle-fill" />
      <span className="pixel-toggle-knob" />
    </span>
  );
}
