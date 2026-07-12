// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// A pixel-styled drag track: a filled bar with a knob the player drags or taps
// to set a 0..1 position. Purely geometry — the caller maps the position to
// whatever it means (a balance multiplier, a volume level, …) and renders the
// value readout itself. Generic React/UI game code, so it lives in
// website/src/lib/ (imported as @ui/lib/PixelSlider.tsx) for eventual
// extraction into oss-framework.

import {
  useCallback,
  useRef,
  type PointerEvent as ReactPointerEvent,
} from "react";

type Props = {
  /** Current position, 0 (fully left) … 1 (fully right). */
  pos: number;
  /** New position from a drag or tap, already clamped to [0, 1]. */
  onChange: (pos: number) => void;
};

export function PixelSlider({ pos, onChange }: Props) {
  const trackRef = useRef<HTMLDivElement>(null);

  const posFromEvent = useCallback((clientX: number): number => {
    const track = trackRef.current;
    if (!track) return 0;
    const rect = track.getBoundingClientRect();
    if (rect.width <= 0) return 0;
    return Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
  }, []);

  // Drag: capture the pointer so the knob keeps following even when the finger
  // slides off the (thin) track. Stop propagation so the enclosing menu button
  // treats the gesture as a slide, not a navigate/confirm click.
  const onPointerDown = useCallback(
    (event: ReactPointerEvent) => {
      if (event.pointerType === "mouse" && event.button !== 0) return;
      event.stopPropagation();
      event.preventDefault();
      event.currentTarget.setPointerCapture(event.pointerId);
      onChange(posFromEvent(event.clientX));
    },
    [onChange, posFromEvent],
  );

  const onPointerMove = useCallback(
    (event: ReactPointerEvent) => {
      if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
      event.stopPropagation();
      onChange(posFromEvent(event.clientX));
    },
    [onChange, posFromEvent],
  );

  const fill = `${Math.round(Math.min(1, Math.max(0, pos)) * 100)}%`;
  return (
    <div
      ref={trackRef}
      className="pixel-slider"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      // Clicks on the track must not bubble to the menu button's confirm.
      onClick={(event) => event.stopPropagation()}
    >
      <div className="pixel-slider-fill" style={{ width: fill }} />
      <div className="pixel-slider-knob" style={{ left: fill }} />
    </div>
  );
}
