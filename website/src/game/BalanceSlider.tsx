// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The drag track for one DEVELOPER → BALANCE knob: a filled bar with a knob
// the developer drags (or taps) to set the multiplier. The 0..1 position it
// reports is mapped to a multiplier by balanceKnobs.ts; this component owns
// only the pointer geometry. Lives beside the menu button in TitleScreen so
// the row's label/readout stays in the shared menu idiom.

import {
  useCallback,
  useRef,
  type PointerEvent as ReactPointerEvent,
} from "react";

type Props = {
  /** Current slider position, 0 (fully left) … 1 (fully right). */
  pos: number;
  /** New position from a drag or tap, already clamped to [0, 1]. */
  onChange: (pos: number) => void;
};

export function BalanceSlider({ pos, onChange }: Props) {
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
      className="balance-slider"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      // Clicks on the track must not bubble to the menu button's confirm.
      onClick={(event) => event.stopPropagation()}
    >
      <div className="balance-slider-fill" style={{ width: fill }} />
      <div className="balance-slider-knob" style={{ left: fill }} />
    </div>
  );
}
