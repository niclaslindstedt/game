// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Haptic feedback for touch games. Generic React/UI game code — lives in
// pwa/src/lib/ so it can be extracted into oss-framework once mature.
//
// The design is a thin surface (`Haptics`) over a swappable backend
// (`HapticsDriver`). Today the only backend is the browser Vibration API;
// tomorrow a native shell (React Native, Capacitor, an Electron bridge) can
// register its own driver via `setDriver` without any caller changing. When
// no backend can vibrate — iOS Safari and iOS home-screen PWAs never expose
// `navigator.vibrate` — the driver auto-selects the no-op and every call is
// a silent, cheap noop. That is the whole iOS story: feature detection, not
// a platform check.

/** A vibration pattern: a single duration in ms, or an on/off/on… sequence
 * of ms values (the shape `navigator.vibrate` accepts). */
export type HapticPattern = number | readonly number[];

/** The swappable backend. A native wrapper implements this and registers it
 * with `setDriver` — the app-facing `Haptics` surface never changes. */
export type HapticsDriver = {
  /** Whether this backend can actually produce feedback. A false value lets
   * the surface skip work (and lets callers reason about support). */
  readonly supported: boolean;
  /** Fire the pattern. Implementations must tolerate being called with a
   * bare number or an array, and must never throw. */
  vibrate: (pattern: HapticPattern) => void;
};

/** A driver that does nothing — the fallback on platforms without vibration
 * (iOS), and a useful stub for tests and native shells still being wired. */
export function noopHapticsDriver(): HapticsDriver {
  return { supported: false, vibrate: () => {} };
}

/** The browser backend, over the Web Vibration API. Returns the no-op driver
 * when the API is absent (iOS, desktop Safari) so callers get a working
 * driver everywhere without branching. */
export function webVibrationDriver(): HapticsDriver {
  const nav =
    typeof navigator !== "undefined"
      ? (navigator as Navigator & {
          vibrate?: (pattern: number | number[]) => boolean;
        })
      : undefined;
  if (!nav || typeof nav.vibrate !== "function") return noopHapticsDriver();
  return {
    supported: true,
    vibrate: (pattern) => {
      try {
        // The API wants a mutable array; copy the readonly one we take.
        nav.vibrate(typeof pattern === "number" ? pattern : [...pattern]);
      } catch {
        // A hardened browser can reject the call (feature policy, user
        // gesture rules). Feedback is non-essential — swallow and move on.
      }
    },
  };
}

/** The app-facing surface. Instantiate one (see game/haptics.ts) and route
 * every buzz through it; toggle it with `setEnabled`, swap the backend with
 * `setDriver` when a native shell comes online. */
export type Haptics = {
  /** Whether feedback can currently be produced (enabled AND driver capable). */
  readonly active: boolean;
  /** Fire a pattern; a silent noop when disabled or unsupported. */
  vibrate: (pattern: HapticPattern) => void;
  /** Player toggle (a settings switch). Off makes every call a noop. */
  setEnabled: (enabled: boolean) => void;
  /** Swap the backend — the seam a native wrapper plugs into at boot. */
  setDriver: (driver: HapticsDriver) => void;
};

/** Build a haptics surface. Defaults to the web driver, which itself falls
 * back to no-op on iOS and anywhere the Vibration API is missing. */
export function createHaptics(driver?: HapticsDriver): Haptics {
  let backend = driver ?? webVibrationDriver();
  let enabled = true;
  return {
    get active() {
      return enabled && backend.supported;
    },
    vibrate(pattern) {
      if (enabled && backend.supported) backend.vibrate(pattern);
    },
    setEnabled(next) {
      enabled = next;
    },
    setDriver(next) {
      backend = next;
    },
  };
}
