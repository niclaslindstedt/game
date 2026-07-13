// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// A pixel CHECKBOX for multi-select rows: an empty grey square that fills with
// a smaller yellow square when checked. Same sharp pixel skin as PixelToggle
// and PixelSlider, but it reads as a tick-box (pick one of many) rather than an
// on/off switch (flip a single setting) — see the note on PixelToggle for why
// the two-mode picker rows stay switches. Purely presentational; the enclosing
// menu row owns the click that toggles it. Generic React/UI game code, so it
// lives in website/src/lib/ (imported as @ui/lib/PixelCheckbox.tsx) for
// eventual extraction into oss-framework.

type Props = {
  /** Whether the box reads checked (yellow square shown) or empty. */
  checked: boolean;
};

export function PixelCheckbox({ checked }: Props) {
  return (
    <span
      className="pixel-checkbox"
      data-checked={checked}
      // The menu button owns the gesture and its label; the box is a purely
      // visual readout, so it stays out of the accessibility tree.
      aria-hidden="true"
    >
      <span className="pixel-checkbox-mark" />
    </span>
  );
}
