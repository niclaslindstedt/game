// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE DEVICE CONTENT SWITCHES' native half — the bridge between the player's iOS
// Settings page (device-settings-provider.ts) and the game's own gate
// (pwa/src/app/device-policy.ts). The protocol is documented on the web side;
// keep the two in step.
//
// It is the SIMPLEST of the shell's bridges, and deliberately so: the page never
// asks anything. Two switches travel one way, native → web, and there is no
// request/response protocol at all, because of WHEN they have to arrive.
//
// THE POLICY MUST BE IN THE PAGE BEFORE THE GAME'S FIRST FRAME. Every other
// bridge answers a question the game asks once it is running, so a round trip is
// fine. This one gates what the game may DRAW and which rows the title menu may
// OFFER — so a policy that arrived a few frames late would show a censored install
// its STORE row and then snatch it away, and would let the first blow of a run
// throw blood a parent switched off. So the flags are read synchronously and baked
// into the script the shell injects BEFORE the WebView loads a byte
// (`policyBootScript`), and only LATER changes travel as events.
//
// IT FAILS OPEN, ALWAYS. No native module, an unreadable defaults suite, an
// Android build: every one of those answers "everything on". A parent's switch is
// a deliberate act that we honour exactly; an absent answer is not a reason to
// ship someone a censored game.

import {
  deviceSettingsProvider,
  POLICY_ALLOW_ALL,
  type DevicePolicy,
  type DeviceSettingsProvider,
} from "./device-settings-provider";

/** An event injected into the page (see the web bridge's protocol). */
export type DevicePolicyEvent = { event: "policy"; policy: DevicePolicy };

export type DeviceSettingsBridge = {
  /** The switches right now — synchronous, for the boot script. */
  read: () => DevicePolicy;
  /** Push the current switches into the running page (a change, or a
   * foreground re-read). */
  push: () => void;
  /** Drop the provider's change subscription (App unmount). */
  stop: () => void;
};

/**
 * The switches right now, with NO subscription taken out — what the boot script
 * is built from (App.tsx), before the WebView exists to be pushed to. Separate
 * from the bridge so reading the policy never has the side effect of watching it.
 */
export function readDevicePolicy(): DevicePolicy {
  return deviceSettingsProvider()?.read() ?? POLICY_ALLOW_ALL;
}

/**
 * Build the device-settings bridge. `emit` injects one event into the WebView
 * (App.tsx wraps `injectJavaScript`).
 *
 * Starts watching immediately rather than on a first message from the page,
 * because — unlike the other bridges — the page never sends one.
 */
export function createDeviceSettingsBridge(
  emit: (event: DevicePolicyEvent) => void,
): DeviceSettingsBridge {
  const provider: DeviceSettingsProvider | null = deviceSettingsProvider();
  const read = (): DevicePolicy => provider?.read() ?? POLICY_ALLOW_ALL;
  const push = (): void => emit({ event: "policy", policy: read() });
  const unsubscribe =
    provider?.subscribe((policy) => emit({ event: "policy", policy })) ?? null;
  return { read, push, stop: () => unsubscribe?.() };
}
