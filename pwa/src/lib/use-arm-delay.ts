// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Reveal-lockout hook for modals that pop open under live input. Generic
// React code (usable by any game) — lives in pwa/src/lib/ so it can be
// extracted into oss-framework once mature.

import { useEffect, useState } from "react";

/**
 * False for the first `ms` after mount, then true — the standard "arm" window
 * that keeps a freshly revealed modal inert so a stray tap or held key from
 * the gameplay underneath can't act on it the instant it appears. Arms once
 * per mount; key the component to re-arm for a fresh reveal.
 */
export function useArmDelay(ms: number): boolean {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    const timer = window.setTimeout(() => setArmed(true), ms);
    return () => window.clearTimeout(timer);
  }, [ms]);
  return armed;
}
