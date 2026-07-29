// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE DEVICE CONTENT POLICY — the WEB half of the seam behind the two switches
// that live OUTSIDE the game, on the app's own page in iOS Settings.
//
// A parent turns MATURE CONTENT off and the game stops bleeding; they turn COIN
// STORE off and the store stops existing. Both belong outside the game by
// construction: a control the player can reach from inside the thing it restricts
// is not a restriction. So the native shell owns them (native/src/device-settings.ts)
// and this module is the game's only reader.
//
// The protocol (mirrored by native/src/device-settings.ts — keep the two in step):
//   ← window.__GIS_POLICY__ = { nsfw, store }   injected BEFORE the page loads
//   ← window.__gisPolicyEvent({ event: "policy", policy })   a later change
//
// It is PUSH-ONLY, and the first delivery is not a message. Every other bridge
// answers a question the game asks once it is running; this one is read while the
// game is deciding what to paint, so waiting on a round trip would flash a STORE
// row at an install that has none and would bleed on the first blow of a run whose
// blood a parent switched off. The shell therefore stamps the flags onto `window`
// before the first module of the game evaluates, and this reads them synchronously.
//
// TWO RULES GOVERN EVERY CHANGE HERE:
//
//   1. IT FAILS OPEN. A browser, an installed PWA, an Android build, a native
//      shell whose module didn't load, a malformed payload — every one of those
//      plays the full game. A parent's switch is a deliberate act to be honoured
//      exactly; the ABSENCE of an answer is not, and must never be read as one.
//      `isPolicyManaged` exists to tell the two apart for the UI's sake.
//   2. IT IS READ IN HOT PATHS, so it is a plain cached object, not a promise.
//      `nsfwAllowed()` is called on every landed blow.

/** The two switches. True = the game plays as it ships. */
export type DevicePolicy = {
  /** MATURE CONTENT: gore, and the nuke's burning dead. */
  nsfw: boolean;
  /** COIN STORE: whether the store exists in this install at all. */
  store: boolean;
};

/** What an unmanaged install plays, and what every failure path answers. */
const ALLOW_ALL: DevicePolicy = { nsfw: true, store: true };

declare global {
  interface Window {
    /** Stamped by the native shell before the page loads (see the header). */
    __GIS_POLICY__?: Partial<DevicePolicy>;
    /** The shell's push channel for a later change. */
    __gisPolicyEvent?: (event: unknown) => void;
  }
}

/** Coerce anything into a policy, defaulting each switch ON (rule 1). */
function toPolicy(raw: unknown): DevicePolicy {
  if (!raw || typeof raw !== "object") return { ...ALLOW_ALL };
  const value = raw as Partial<DevicePolicy>;
  return {
    nsfw: value.nsfw !== false,
    store: value.store !== false,
  };
}

/** True when a shell actually handed us a policy — i.e. these switches exist
 * somewhere the player can reach. Distinguishes "managed, everything allowed"
 * from "nobody is managing this", which the UI needs and the gates do not. */
function readManaged(): boolean {
  return (
    typeof window !== "undefined" &&
    !!window.__GIS_POLICY__ &&
    typeof window.__GIS_POLICY__ === "object"
  );
}

let managed = readManaged();
let policy: DevicePolicy =
  typeof window === "undefined"
    ? { ...ALLOW_ALL }
    : toPolicy(window.__GIS_POLICY__);

type PolicyListener = (policy: DevicePolicy) => void;
const listeners = new Set<PolicyListener>();

/**
 * Install the shell's push channel. Call once at boot (App.tsx); harmless
 * everywhere else — a browser simply never calls back.
 *
 * The BOOT policy needs no init: it is already on `window` by the time this
 * module is evaluated. This only wires up LATER changes (the player left for iOS
 * Settings, flipped a switch, and came back).
 */
export function initDevicePolicy(): void {
  if (typeof window === "undefined") return;
  // Re-read: a module evaluated before the shell's script would otherwise hold
  // the unmanaged default forever. Cheap, and makes the boot order a non-issue.
  managed = readManaged();
  if (managed) policy = toPolicy(window.__GIS_POLICY__);
  window.__gisPolicyEvent = (event: unknown) => {
    if (!event || typeof event !== "object") return;
    const message = event as Record<string, unknown>;
    if (message.event !== "policy") return;
    apply(toPolicy(message.policy));
  };
}

/** Adopt a new policy and tell the listeners — but only when something actually
 * changed. The shell re-pushes on every foreground, and a re-render storm on
 * every app switch is not what that is for. */
function apply(next: DevicePolicy): void {
  managed = true;
  if (next.nsfw === policy.nsfw && next.store === policy.store) return;
  policy = next;
  for (const listener of listeners) listener(policy);
}

/** The whole policy, for a UI that wants to describe it. */
export function devicePolicy(): DevicePolicy {
  return policy;
}

/** Is anything managing these switches? False in a browser/PWA, where the
 * player owns their own settings and no page exists to lock them from. */
export function isPolicyManaged(): boolean {
  return managed;
}

/**
 * May the game show MATURE CONTENT — blood, gore, and the nuke burning bodies
 * down to skeletons?
 *
 * The umbrella gate: every "not safe for kids" feature the game grows must be
 * checked against THIS, so a parent's one switch keeps covering all of them
 * instead of covering the two that existed when they flipped it.
 */
export function nsfwAllowed(): boolean {
  return policy.nsfw;
}

/** May this install offer the COIN STORE at all? */
export function storeAllowed(): boolean {
  return policy.store;
}

/** Watch for a change (the player flipped a switch and came back); returns an
 * unsubscribe. Used by the surfaces that are already on screen when it happens —
 * the title menu's STORE row above all. */
export function subscribeDevicePolicy(listener: PolicyListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Force a policy in a test (and reset the managed flag with it). Never called
 * by the app — the shell is the only writer. */
export function setDevicePolicyForTest(
  next: Partial<DevicePolicy> | null,
): void {
  managed = next !== null;
  policy = next === null ? { ...ALLOW_ALL } : toPolicy(next);
  for (const listener of listeners) listener(policy);
}
