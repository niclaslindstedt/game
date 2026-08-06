// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Reveal-lockout hook for modals that pop open under live input. Generic
// React code (usable by any game) — lives in pwa/src/lib/, the pool a later
// game keeps as-is.

import { useEffect, useState } from "react";

/**
 * False for the first `ms` after mount, then true — the standard "arm" window
 * that keeps a freshly revealed modal inert so a stray tap or held key from
 * the gameplay underneath can't act on it the instant it appears. Arms once
 * per mount; key the component to re-arm for a fresh reveal.
 *
 * `ms <= 0` is ARMED FROM THE FIRST RENDER, not armed a frame later: the
 * lockout exists for a modal that appears UNDER live input, so a modal the
 * player opened themselves passes 0 and must be live the moment they see it. A
 * zero-delay timeout would still hand the first paint an inert box (and, on the
 * pointerdown that opened it, swallow the pointerup as a dead tap).
 */
export function useArmDelay(ms: number): boolean {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (ms <= 0) return undefined;
    const timer = window.setTimeout(() => setArmed(true), ms);
    return () => window.clearTimeout(timer);
  }, [ms]);
  // The `ms <= 0` half is read straight rather than latched through state: a
  // no-wait modal is armed in the SAME render that mounts it, and a state flip
  // (even one an effect makes immediately) would always be one render late.
  return armed || ms <= 0;
}
